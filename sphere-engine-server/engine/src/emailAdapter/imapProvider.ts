import type { EmailAdapterFetchInput, EmailAdapterFetchOutput, EmailAdapterProvider } from './service.js';

type ImapCredential = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  rejectUnauthorized: boolean;
};

type ImapProviderOptions = {
  credentialParser?: (credential: string) => ImapCredential;
  maxScanMultiplier?: number;
};

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function parseBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no') {
    return false;
  }
  return fallback;
}

function parseJsonCredential(raw: string): ImapCredential | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    return null;
  }

  const value = parsed as Record<string, unknown>;
  const authRaw = (value.auth ?? {}) as Record<string, unknown>;
  const host = typeof value.host === 'string' ? value.host.trim() : '';
  const user =
    typeof value.user === 'string'
      ? value.user.trim()
      : typeof authRaw.user === 'string'
        ? authRaw.user.trim()
        : '';
  const pass =
    typeof value.pass === 'string'
      ? value.pass
      : typeof authRaw.pass === 'string'
        ? authRaw.pass
        : '';

  if (!host || !user || !pass) {
    return null;
  }

  const portRaw = typeof value.port === 'number' ? value.port : Number.parseInt(String(value.port ?? ''), 10);
  const secureRaw = typeof value.secure === 'boolean' ? value.secure : undefined;
  const secure = secureRaw ?? portRaw === 993;
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : secure ? 993 : 143;
  const mailbox =
    typeof value.mailbox === 'string' && value.mailbox.trim().length > 0
      ? value.mailbox.trim()
      : 'INBOX';
  const rejectUnauthorized = parseBoolean(String(value.rejectUnauthorized ?? ''), true);

  return {
    host,
    port,
    secure,
    user,
    pass,
    mailbox,
    rejectUnauthorized
  };
}

export function parseImapCredential(credential: string): ImapCredential {
  const trimmed = credential.trim();
  if (!trimmed) {
    throw new Error('Empty IMAP credential.');
  }

  const fromJson = parseJsonCredential(trimmed);
  if (fromJson) {
    return fromJson;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      'IMAP credential must be URL-like (imap://user:pass@host:993/INBOX) or JSON object.'
    );
  }

  const protocol = url.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'imap' && protocol !== 'imaps') {
    throw new Error('IMAP credential URL protocol must be imap:// or imaps://');
  }

  const user = decodeURIComponent(url.username ?? '').trim();
  const pass = decodeURIComponent(url.password ?? '');
  const host = url.hostname.trim();
  if (!host || !user || !pass) {
    throw new Error('IMAP credential must include host, username, and password.');
  }

  const defaultSecure = protocol === 'imaps';
  const secure = parseBoolean(url.searchParams.get('secure'), defaultSecure);
  const portRaw = Number.parseInt(url.port || '', 10);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : secure ? 993 : 143;
  const mailbox = decodeURIComponent(url.pathname.replace(/^\/+/, '') || 'INBOX');
  const rejectUnauthorized = parseBoolean(url.searchParams.get('rejectUnauthorized'), true);

  return {
    host,
    port,
    secure,
    user,
    pass,
    mailbox,
    rejectUnauthorized
  };
}

function formatEnvelopeFrom(rawEnvelope: unknown): string {
  if (typeof rawEnvelope !== 'object' || rawEnvelope == null) {
    return 'unknown@unknown';
  }
  const envelope = rawEnvelope as {
    from?: Array<{ address?: string; name?: string }>;
  };
  const from = Array.isArray(envelope.from) ? envelope.from : [];
  const first = from[0];
  if (!first) {
    return 'unknown@unknown';
  }
  if (first.address && first.name) {
    return `${first.name} <${first.address}>`;
  }
  if (first.address) {
    return first.address;
  }
  if (first.name) {
    return first.name;
  }
  return 'unknown@unknown';
}

function formatEnvelopeSubject(rawEnvelope: unknown): string | undefined {
  if (typeof rawEnvelope !== 'object' || rawEnvelope == null) {
    return undefined;
  }
  const envelope = rawEnvelope as { subject?: string };
  return typeof envelope.subject === 'string' ? envelope.subject : undefined;
}

function formatEnvelopeDate(rawMessage: unknown): string {
  if (typeof rawMessage !== 'object' || rawMessage == null) {
    return new Date().toISOString();
  }

  const message = rawMessage as { internalDate?: Date | string };
  const internalDate = message.internalDate;
  if (internalDate instanceof Date) {
    return internalDate.toISOString();
  }
  if (typeof internalDate === 'string' && internalDate.trim()) {
    const maybeDate = new Date(internalDate);
    if (!Number.isNaN(maybeDate.getTime())) {
      return maybeDate.toISOString();
    }
  }
  return new Date().toISOString();
}

function envelopeMatchesQuery(rawEnvelope: unknown, query: string | undefined): boolean {
  if (!query || !query.trim()) {
    return true;
  }
  const haystack = `${formatEnvelopeFrom(rawEnvelope)} ${formatEnvelopeSubject(rawEnvelope) ?? ''}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

async function collectAllUids(client: any): Promise<number[]> {
  try {
    const uids = await client.search({ all: true }, { uid: true });
    return Array.isArray(uids) ? uids.filter((uid: unknown) => Number.isFinite(Number(uid))).map((uid: unknown) => Number(uid)) : [];
  } catch {
    const fallbackUids = await client.search(['ALL'], { uid: true });
    return Array.isArray(fallbackUids)
      ? fallbackUids.filter((uid: unknown) => Number.isFinite(Number(uid))).map((uid: unknown) => Number(uid))
      : [];
  }
}

export function createImapEmailProvider(options: ImapProviderOptions = {}): EmailAdapterProvider {
  const credentialParser = options.credentialParser ?? parseImapCredential;
  const maxScanMultiplier = clampInt(options.maxScanMultiplier ?? 5, 1, 20);

  return {
    async fetchInbox(input: EmailAdapterFetchInput): Promise<EmailAdapterFetchOutput> {
      const credential = credentialParser(input.credential);
      const { ImapFlow } = (await import('imapflow')) as unknown as {
        ImapFlow: new (options: Record<string, unknown>) => any;
      };

      const client = new ImapFlow({
        host: credential.host,
        port: credential.port,
        secure: credential.secure,
        auth: {
          user: credential.user,
          pass: credential.pass
        },
        tls: {
          rejectUnauthorized: credential.rejectUnauthorized
        },
        // Connection-level safety defaults.
        socketTimeout: 25_000,
        greetingTimeout: 10_000,
        disableAutoIdle: true,
        logger: false
      });

      let lock: { release: () => void } | null = null;
      try {
        await client.connect();
        lock = await client.getMailboxLock(credential.mailbox);

        const allUids = await collectAllUids(client);
        const sortedUids = [...allUids].sort((a, b) => b - a);
        const limit = clampInt(input.limit, 1, 50);
        const startOffsetRaw = Number.parseInt(input.cursor ?? '0', 10);
        let offset = Number.isFinite(startOffsetRaw) && startOffsetRaw > 0 ? startOffsetRaw : 0;

        const messages: EmailAdapterFetchOutput['messages'] = [];
        while (offset < sortedUids.length && messages.length < limit) {
          const remaining = sortedUids.length - offset;
          const scanSize = clampInt(limit * maxScanMultiplier, 1, remaining);
          const chunk = sortedUids.slice(offset, offset + scanSize);
          offset += chunk.length;

          const fetched = client.fetch(chunk, {
            uid: true,
            envelope: true,
            internalDate: true
          }, {
            uid: true
          }) as AsyncIterable<{
            uid?: number;
            envelope?: unknown;
            internalDate?: Date | string;
          }>;

          for await (const rawMessage of fetched) {
            if (!envelopeMatchesQuery(rawMessage.envelope, input.query)) {
              continue;
            }

            const messageId = Number.isFinite(rawMessage.uid) ? `uid-${rawMessage.uid}` : `offset-${messages.length + 1}`;
            const subject = formatEnvelopeSubject(rawMessage.envelope);
            const from = formatEnvelopeFrom(rawMessage.envelope);
            const preview = subject ? subject.slice(0, 160) : undefined;
            messages.push({
              messageId,
              from,
              subject,
              preview,
              receivedAt: formatEnvelopeDate(rawMessage),
              threadId: subject ? `thread:${subject.toLowerCase().replace(/\s+/g, '_').slice(0, 80)}` : undefined
            });
            if (messages.length >= limit) {
              break;
            }
          }
        }

        const nextCursor = offset < sortedUids.length ? String(offset) : undefined;
        return {
          messages,
          nextCursor
        };
      } finally {
        try {
          lock?.release();
        } catch {
          // no-op
        }
        try {
          await client.logout();
        } catch {
          try {
            client.close();
          } catch {
            // no-op
          }
        }
      }
    }
  };
}
