import {
  type EmailFetchPage,
  type EmailFetchRequest,
  type EmailFetcher,
  type EmailMessage
} from './emailCheckingSkill.js';

const DEFAULT_SECRET_ENV_PREFIX = 'METACANON_SECRET_';

export class EmailSkillProviderError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export type SecretResolver = (credentialRef: string) => Promise<string>;

function normalizeCredentialRef(credentialRef: string): string {
  const normalized = credentialRef.trim();
  if (!normalized.startsWith('secret://') || normalized.length <= 'secret://'.length) {
    throw new EmailSkillProviderError(
      'INVALID_CREDENTIAL_REF',
      `credentialRef "${credentialRef}" must use secret:// format.`
    );
  }
  return normalized;
}

function mapCredentialRefToEnvKey(credentialRef: string, prefix: string): string {
  const pathPortion = credentialRef.replace(/^secret:\/\//, '');
  const normalized = pathPortion.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
  return `${prefix}${normalized}`;
}

function parseSecretMapJson(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new EmailSkillProviderError('SECRET_MAP_JSON_INVALID', 'EMAIL_SKILL_SECRET_MAP_JSON is not valid JSON.', {
      rawLength: raw.length,
      reason: error instanceof Error ? error.message : String(error)
    });
  }

  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    throw new EmailSkillProviderError(
      'SECRET_MAP_JSON_INVALID',
      'EMAIL_SKILL_SECRET_MAP_JSON must be a JSON object of {"secret://...":"value"}.'
    );
  }

  const secretMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      continue;
    }
    secretMap[key.trim()] = value;
  }
  return secretMap;
}

export function createEnvSecretResolver(options: {
  secretMapJson?: string;
  envVars?: NodeJS.ProcessEnv;
  envPrefix?: string;
  staticMap?: Record<string, string>;
} = {}): SecretResolver {
  const envVars = options.envVars ?? process.env;
  const envPrefix = options.envPrefix ?? DEFAULT_SECRET_ENV_PREFIX;
  const secretMap = parseSecretMapJson(options.secretMapJson);
  const staticMap = options.staticMap ?? {};

  return async (credentialRef: string): Promise<string> => {
    const normalizedRef = normalizeCredentialRef(credentialRef);

    const staticValue = staticMap[normalizedRef];
    if (typeof staticValue === 'string' && staticValue.length > 0) {
      return staticValue;
    }

    const mappedValue = secretMap[normalizedRef];
    if (typeof mappedValue === 'string' && mappedValue.length > 0) {
      return mappedValue;
    }

    const envKey = mapCredentialRefToEnvKey(normalizedRef, envPrefix);
    const envValue = envVars[envKey];
    if (typeof envValue === 'string' && envValue.trim().length > 0) {
      return envValue;
    }

    throw new EmailSkillProviderError(
      'SECRET_NOT_FOUND',
      `No secret value found for credentialRef "${normalizedRef}".`,
      { credentialRef: normalizedRef, envKey }
    );
  };
}

type AdapterPayload = {
  messages?: unknown;
  nextCursor?: unknown;
};

function toEmailMessage(raw: unknown): EmailMessage | null {
  if (typeof raw !== 'object' || raw == null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const messageIdRaw = record.messageId ?? record.id;
  const fromRaw = record.from;
  const receivedAtRaw = record.receivedAt ?? record.received_at;

  const messageId =
    typeof messageIdRaw === 'string' && messageIdRaw.trim().length > 0
      ? messageIdRaw.trim()
      : null;
  const from = typeof fromRaw === 'string' && fromRaw.trim().length > 0 ? fromRaw.trim() : null;
  const receivedAt =
    typeof receivedAtRaw === 'string' && receivedAtRaw.trim().length > 0
      ? receivedAtRaw.trim()
      : null;
  if (!messageId || !from || !receivedAt) {
    return null;
  }

  return {
    messageId,
    from,
    receivedAt,
    subject: typeof record.subject === 'string' ? record.subject : undefined,
    preview:
      typeof record.preview === 'string'
        ? record.preview
        : typeof record.snippet === 'string'
          ? record.snippet
          : undefined,
    threadId:
      typeof record.threadId === 'string'
        ? record.threadId
        : typeof record.thread_id === 'string'
          ? record.thread_id
          : undefined
  };
}

function normalizeAdapterPayload(payload: unknown): EmailFetchPage {
  if (typeof payload !== 'object' || payload == null) {
    throw new EmailSkillProviderError(
      'EMAIL_ADAPTER_INVALID_PAYLOAD',
      'Email adapter returned an invalid payload.'
    );
  }

  const body = payload as AdapterPayload;
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: EmailMessage[] = rawMessages.map(toEmailMessage).filter((msg): msg is EmailMessage => !!msg);
  const nextCursor = typeof body.nextCursor === 'string' ? body.nextCursor.trim() || undefined : undefined;

  return { messages, nextCursor };
}

export function createHttpEmailFetcher(options: {
  adapterUrl: string;
  adapterToken?: string;
  secretResolver: SecretResolver;
  fetchImpl?: typeof fetch;
}): EmailFetcher {
  const baseUrl = options.adapterUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new EmailSkillProviderError('EMAIL_ADAPTER_URL_INVALID', 'adapterUrl is required.');
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request: EmailFetchRequest): Promise<EmailFetchPage> => {
    const credential = await options.secretResolver(request.credentialRef);
    const response = await fetchImpl(`${baseUrl}/fetch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.adapterToken ? { authorization: `Bearer ${options.adapterToken}` } : {})
      },
      body: JSON.stringify({
        accountId: request.accountId,
        query: request.query,
        cursor: request.cursor,
        limit: request.limit,
        credential
      })
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new EmailSkillProviderError(
        'EMAIL_ADAPTER_HTTP_ERROR',
        `Email adapter request failed with ${response.status}.`,
        {
          status: response.status,
          body: responseText.slice(0, 512)
        }
      );
    }

    const payload = await response.json();
    return normalizeAdapterPayload(payload);
  };
}
