import express, { type Express, type RequestHandler } from 'express';
import { z } from 'zod';
import { createImapEmailProvider } from './imapProvider.js';

export type EmailAdapterMessage = {
  messageId: string;
  from: string;
  subject?: string;
  preview?: string;
  receivedAt: string;
  threadId?: string;
};

export type EmailAdapterFetchInput = {
  accountId: string;
  credential: string;
  query?: string;
  cursor?: string;
  limit: number;
};

export type EmailAdapterFetchOutput = {
  messages: EmailAdapterMessage[];
  nextCursor?: string;
};

export interface EmailAdapterProvider {
  fetchInbox(input: EmailAdapterFetchInput): Promise<EmailAdapterFetchOutput>;
}

export class EmailAdapterServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.retryable = options.retryable ?? this.statusCode >= 500;
    this.details = options.details;
  }
}

const fetchRequestSchema = z.object({
  accountId: z.string().min(1),
  credential: z.string().min(1),
  query: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50)
});

const rawMessageSchema = z.object({
  messageId: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  from: z.string().min(1),
  subject: z.string().optional(),
  preview: z.string().optional(),
  snippet: z.string().optional(),
  receivedAt: z.string().optional(),
  received_at: z.string().optional(),
  threadId: z.string().optional(),
  thread_id: z.string().optional()
});

function normalizeMessage(raw: unknown): EmailAdapterMessage | null {
  const parsed = rawMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const value = parsed.data;
  const messageId = value.messageId ?? value.id;
  const receivedAt = value.receivedAt ?? value.received_at;
  if (!messageId || !receivedAt) {
    return null;
  }
  return {
    messageId,
    from: value.from,
    subject: value.subject,
    preview: value.preview ?? value.snippet,
    receivedAt,
    threadId: value.threadId ?? value.thread_id
  };
}

function normalizeProviderOutput(raw: unknown): EmailAdapterFetchOutput {
  const payload =
    typeof raw === 'object' && raw != null
      ? (raw as {
          messages?: unknown;
          nextCursor?: unknown;
        })
      : {};

  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .map((item) => normalizeMessage(item))
        .filter((item): item is EmailAdapterMessage => item != null)
    : [];
  const nextCursor =
    typeof payload.nextCursor === 'string' && payload.nextCursor.trim().length > 0
      ? payload.nextCursor
      : undefined;
  return {
    messages,
    nextCursor
  };
}

function createAuthMiddleware(adapterToken?: string): RequestHandler {
  if (!adapterToken || adapterToken.trim().length === 0) {
    return (_req, _res, next) => next();
  }

  const token = adapterToken.trim();
  return (req, res, next) => {
    const authHeader = req.header('authorization')?.trim();
    if (!authHeader) {
      res.status(401).json({
        code: 'EMAIL_ADAPTER_AUTH_REQUIRED',
        message: 'Missing adapter bearer token.',
        retryable: false
      });
      return;
    }
    const expectedValue = `Bearer ${token}`;
    if (authHeader !== expectedValue) {
      res.status(401).json({
        code: 'EMAIL_ADAPTER_AUTH_INVALID',
        message: 'Invalid adapter bearer token.',
        retryable: false
      });
      return;
    }
    next();
  };
}

export function createStubEmailProvider(seed: {
  inboxByAccount?: Record<string, unknown[]>;
} = {}): EmailAdapterProvider {
  const inboxByAccount = seed.inboxByAccount ?? {};
  return {
    async fetchInbox(input: EmailAdapterFetchInput): Promise<EmailAdapterFetchOutput> {
      const source = Array.isArray(inboxByAccount[input.accountId]) ? inboxByAccount[input.accountId] : [];
      const normalized = source
        .map((item) => normalizeMessage(item))
        .filter((item): item is EmailAdapterMessage => item != null);
      const offset = Number.parseInt(input.cursor ?? '0', 10);
      const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
      const page = normalized.slice(safeOffset, safeOffset + input.limit);
      const nextOffset = safeOffset + page.length;
      return {
        messages: page,
        nextCursor: nextOffset < normalized.length ? String(nextOffset) : undefined
      };
    }
  };
}

export function createProxyEmailProvider(options: {
  upstreamUrl: string;
  upstreamToken?: string;
  fetchImpl?: typeof fetch;
}): EmailAdapterProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.upstreamUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new EmailAdapterServiceError(
      'EMAIL_ADAPTER_UPSTREAM_URL_INVALID',
      'Proxy provider requires EMAIL_ADAPTER_PROXY_URL.',
      { statusCode: 500 }
    );
  }
  return {
    async fetchInbox(input: EmailAdapterFetchInput): Promise<EmailAdapterFetchOutput> {
      const response = await fetchImpl(`${baseUrl}/fetch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.upstreamToken ? { authorization: `Bearer ${options.upstreamToken}` } : {})
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new EmailAdapterServiceError(
          'EMAIL_ADAPTER_UPSTREAM_HTTP_ERROR',
          `Upstream email provider failed with ${response.status}.`,
          {
            statusCode: 503,
            retryable: true,
            details: {
              status: response.status,
              body: body.slice(0, 512)
            }
          }
        );
      }

      const payload = await response.json().catch(() => ({}));
      return normalizeProviderOutput(payload);
    }
  };
}

function parseStubInboxJson(raw: string | undefined): Record<string, unknown[]> {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new EmailAdapterServiceError(
      'EMAIL_ADAPTER_STUB_JSON_INVALID',
      'EMAIL_ADAPTER_STUB_INBOX_JSON is not valid JSON.',
      {
        statusCode: 500,
        details: {
          reason: error instanceof Error ? error.message : String(error)
        }
      }
    );
  }

  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    throw new EmailAdapterServiceError(
      'EMAIL_ADAPTER_STUB_JSON_INVALID',
      'EMAIL_ADAPTER_STUB_INBOX_JSON must be an object: {"accountId":[...messages]}',
      { statusCode: 500 }
    );
  }
  const output: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    output[key] = Array.isArray(value) ? value : [];
  }
  return output;
}

export function createProviderFromEnv(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): EmailAdapterProvider {
  const env = options.env ?? process.env;
  const mode =
    (
      env.EMAIL_ADAPTER_PROVIDER ??
      (env.EMAIL_ADAPTER_PROXY_URL ? 'proxy' : env.EMAIL_ADAPTER_IMAP_ENABLED === 'true' ? 'imap' : 'stub')
    )
      .trim()
      .toLowerCase();

  if (mode === 'proxy') {
    if (!env.EMAIL_ADAPTER_PROXY_URL?.trim()) {
      throw new EmailAdapterServiceError(
        'EMAIL_ADAPTER_UPSTREAM_URL_INVALID',
        'EMAIL_ADAPTER_PROXY_URL is required for proxy mode.',
        { statusCode: 500 }
      );
    }
    return createProxyEmailProvider({
      upstreamUrl: env.EMAIL_ADAPTER_PROXY_URL,
      upstreamToken: env.EMAIL_ADAPTER_PROXY_TOKEN,
      fetchImpl: options.fetchImpl
    });
  }

  if (mode === 'imap') {
    return createImapEmailProvider();
  }

  if (mode !== 'stub') {
    throw new EmailAdapterServiceError(
      'EMAIL_ADAPTER_PROVIDER_INVALID',
      `Unsupported EMAIL_ADAPTER_PROVIDER "${mode}".`,
      { statusCode: 500 }
    );
  }

  return createStubEmailProvider({
    inboxByAccount: parseStubInboxJson(env.EMAIL_ADAPTER_STUB_INBOX_JSON)
  });
}

export function createEmailAdapterApp(options: {
  provider: EmailAdapterProvider;
  adapterToken?: string;
}): Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'metacanon-email-adapter'
    });
  });

  app.post('/fetch', createAuthMiddleware(options.adapterToken), async (req, res) => {
    const parsed = fetchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: 'EMAIL_ADAPTER_INPUT_INVALID',
        message: 'Invalid /fetch payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
      return;
    }

    try {
      const output = await options.provider.fetchInbox(parsed.data);
      res.json(normalizeProviderOutput(output));
    } catch (error) {
      if (error instanceof EmailAdapterServiceError) {
        res.status(error.statusCode).json({
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: error.details
        });
        return;
      }

      res.status(503).json({
        code: 'EMAIL_ADAPTER_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Email fetch failed.',
        retryable: true
      });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({
      code: 'EMAIL_ADAPTER_NOT_FOUND',
      message: 'Route not found.',
      retryable: false
    });
  });

  return app;
}

function resolvePort(rawPort: string | undefined): number {
  const parsed = Number.parseInt(rawPort ?? '3310', 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new EmailAdapterServiceError(
      'EMAIL_ADAPTER_PORT_INVALID',
      'EMAIL_ADAPTER_PORT must be an integer between 1 and 65535.',
      { statusCode: 500 }
    );
  }
  return parsed;
}

function resolveHost(rawHost: string | undefined): string {
  const host = rawHost?.trim();
  if (!host) {
    return '127.0.0.1';
  }
  return host;
}

export function startEmailAdapterServer(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'error' | 'warn'>;
} = {}) {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const provider = createProviderFromEnv({
    env,
    fetchImpl: options.fetchImpl
  });
  const app = createEmailAdapterApp({
    provider,
    adapterToken: env.EMAIL_ADAPTER_TOKEN
  });
  const port = resolvePort(env.EMAIL_ADAPTER_PORT);
  const host = resolveHost(env.EMAIL_ADAPTER_HOST);

  const server = app.listen(port, host, () => {
    logger.info(`[email-adapter] listening on ${host}:${port}`);
  });
  return server;
}
