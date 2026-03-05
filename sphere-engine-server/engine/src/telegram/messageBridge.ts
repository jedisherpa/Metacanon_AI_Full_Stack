import { createHash } from 'node:crypto';
import type pino from 'pino';
import { pool } from '../db/client.js';
import { ConductorError, type LogEntry, type SphereConductor } from '../sphere/conductor.js';

type TelegramBridgeOptions = {
  botToken: string;
  conductor: SphereConductor;
  logger: pino.Logger;
  pollTimeoutSeconds: number;
  errorBackoffMs: number;
};

type TelegramChat = {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  message_thread_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type LogEntryEvent = {
  threadId: string;
  entry: LogEntry;
};

type TelegramThreadLink = {
  linkKey: string;
  chatId: string;
  messageThreadId: number | null;
};

const BRIDGE_ORIGIN_INBOUND = 'telegram_inbound';
const BRIDGE_ATTESTATION = 'telegram_bridge';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function deriveUuid(seed: string): string {
  const digest = createHash('sha256').update(seed).digest('hex');
  const versioned =
    `${digest.slice(0, 8)}${digest.slice(8, 12)}5${digest.slice(13, 16)}a${digest.slice(17, 20)}${digest.slice(20, 32)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20, 32)}`;
}

function normalizeMessageThreadId(value: number | undefined): number | null {
  if (!Number.isFinite(value) || !value) {
    return null;
  }
  return Math.trunc(value);
}

function buildLinkKey(chatId: string, messageThreadId: number | null): string {
  return `${chatId}:${messageThreadId ?? 0}`;
}

function deriveDefaultThreadId(chatId: string, messageThreadId: number | null): string {
  return deriveUuid(`telegram-thread:${chatId}:${messageThreadId ?? 0}`);
}

function deriveMessageId(chatId: string, messageId: number): string {
  return deriveUuid(`telegram-message:${chatId}:${messageId}`);
}

function deriveTraceId(updateId: number): string {
  return deriveUuid(`telegram-update:${updateId}`);
}

function resolveAuthorAgentId(
  message: TelegramMessage,
  chatId: string,
  messageThreadId: number | null
): string {
  const userId = message.from?.id;
  if (userId !== undefined && userId !== null && String(userId).trim().length > 0) {
    return `telegram:user:${String(userId)}`;
  }

  const senderChatId = message.sender_chat?.id;
  if (
    senderChatId !== undefined &&
    senderChatId !== null &&
    String(senderChatId).trim().length > 0
  ) {
    return `telegram:sender_chat:${String(senderChatId)}`;
  }

  return `telegram:chat:${chatId}:${messageThreadId ?? 0}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function buildTelegramApiUrl(botToken: string, method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

async function ensureBridgeSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_chats (
      chat_id TEXT PRIMARY KEY,
      chat_type TEXT,
      title TEXT,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      last_message_at TIMESTAMPTZ,
      last_message_id BIGINT,
      last_message_thread_id BIGINT,
      linked_thread_id UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS telegram_thread_links (
      thread_id UUID PRIMARY KEY,
      chat_id TEXT NOT NULL,
      message_thread_id BIGINT,
      link_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE telegram_thread_links
      ADD COLUMN IF NOT EXISTS message_thread_id BIGINT;

    ALTER TABLE telegram_thread_links
      ADD COLUMN IF NOT EXISTS link_key TEXT;

    UPDATE telegram_thread_links
    SET link_key = chat_id || ':0'
    WHERE link_key IS NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'telegram_thread_links'
          AND constraint_name = 'telegram_thread_links_chat_id_key'
      ) THEN
        ALTER TABLE telegram_thread_links
          DROP CONSTRAINT telegram_thread_links_chat_id_key;
      END IF;
    END
    $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_thread_links_link_key
      ON telegram_thread_links(link_key);

    CREATE INDEX IF NOT EXISTS idx_telegram_thread_links_chat
      ON telegram_thread_links(chat_id, message_thread_id);

    CREATE TABLE IF NOT EXISTS telegram_thread_bindings (
      link_key TEXT PRIMARY KEY,
      thread_id UUID NOT NULL,
      chat_id TEXT NOT NULL,
      message_thread_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_thread_bindings_thread
      ON telegram_thread_bindings(thread_id);

    CREATE INDEX IF NOT EXISTS idx_telegram_thread_bindings_chat
      ON telegram_thread_bindings(chat_id, message_thread_id);

    INSERT INTO telegram_thread_bindings (
      link_key,
      thread_id,
      chat_id,
      message_thread_id,
      created_at,
      updated_at
    )
    SELECT
      COALESCE(link_key, chat_id || ':' || COALESCE(message_thread_id::text, '0')),
      thread_id,
      chat_id,
      message_thread_id,
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM telegram_thread_links
    ON CONFLICT (link_key) DO NOTHING;

    CREATE TABLE IF NOT EXISTS telegram_bridge_state (
      singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
      last_update_id BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO telegram_bridge_state (singleton_id, last_update_id)
    VALUES (1, 0)
    ON CONFLICT (singleton_id) DO NOTHING;
  `);
}

async function readLastUpdateId(): Promise<number> {
  const result = await pool.query<{ last_update_id: string | number }>(
    `
      SELECT last_update_id
      FROM telegram_bridge_state
      WHERE singleton_id = 1
      LIMIT 1
    `
  );

  if (result.rowCount === 0) {
    return 0;
  }

  const value = result.rows[0].last_update_id;
  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function writeLastUpdateId(lastUpdateId: number): Promise<void> {
  await pool.query(
    `
      UPDATE telegram_bridge_state
      SET
        last_update_id = $1,
        updated_at = NOW()
      WHERE singleton_id = 1
    `,
    [lastUpdateId]
  );
}

async function upsertChatRecord(params: {
  message: TelegramMessage;
  linkedThreadId: string | null;
}): Promise<void> {
  const chatId = String(params.message.chat.id);
  const messageThreadId = normalizeMessageThreadId(params.message.message_thread_id);
  const dateSeconds = Number.isFinite(params.message.date) ? params.message.date : null;

  await pool.query(
    `
      INSERT INTO telegram_chats (
        chat_id,
        chat_type,
        title,
        username,
        first_name,
        last_name,
        last_message_at,
        last_message_id,
        last_message_thread_id,
        linked_thread_id,
        updated_at
      )
      VALUES (
        $1,
        $2,
        NULLIF($3, ''),
        NULLIF($4, ''),
        NULLIF($5, ''),
        NULLIF($6, ''),
        CASE WHEN $7::bigint IS NULL THEN NOW() ELSE to_timestamp($7) END,
        $8,
        $9,
        $10,
        NOW()
      )
      ON CONFLICT (chat_id) DO UPDATE SET
        chat_type = EXCLUDED.chat_type,
        title = EXCLUDED.title,
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        last_message_at = EXCLUDED.last_message_at,
        last_message_id = EXCLUDED.last_message_id,
        last_message_thread_id = EXCLUDED.last_message_thread_id,
        linked_thread_id = EXCLUDED.linked_thread_id,
        updated_at = NOW()
    `,
    [
      chatId,
      params.message.chat.type ?? null,
      params.message.chat.title ?? null,
      params.message.chat.username ?? null,
      params.message.chat.first_name ?? null,
      params.message.chat.last_name ?? null,
      dateSeconds,
      params.message.message_id,
      messageThreadId,
      params.linkedThreadId
    ]
  );
}

async function getThreadIdByChatLink(
  chatId: string,
  messageThreadId: number | null
): Promise<string | null> {
  const linkKey = buildLinkKey(chatId, messageThreadId);
  const result = await pool.query<{ thread_id: string }>(
    `
      SELECT thread_id
      FROM telegram_thread_bindings
      WHERE link_key = $1
      LIMIT 1
    `,
    [linkKey]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].thread_id;
}

async function getThreadLinksByThreadId(threadId: string): Promise<TelegramThreadLink[]> {
  const result = await pool.query<{
    link_key: string;
    chat_id: string;
    message_thread_id: string | number | null;
  }>(
    `
      SELECT link_key, chat_id, message_thread_id
      FROM telegram_thread_bindings
      WHERE thread_id = $1
      ORDER BY created_at ASC
    `,
    [threadId]
  );

  return result.rows.map((row) => {
    const parsedMessageThreadId =
      row.message_thread_id === null
        ? null
        : Number.parseInt(String(row.message_thread_id), 10);
    return {
      linkKey: row.link_key,
      chatId: row.chat_id,
      messageThreadId: Number.isFinite(parsedMessageThreadId) ? parsedMessageThreadId : null
    };
  });
}

async function upsertThreadLink(
  chatId: string,
  messageThreadId: number | null,
  threadId: string
): Promise<void> {
  const linkKey = buildLinkKey(chatId, messageThreadId);
  await pool.query(
    `
      INSERT INTO telegram_thread_bindings (
        link_key,
        thread_id,
        chat_id,
        message_thread_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (link_key) DO UPDATE
      SET
        thread_id = EXCLUDED.thread_id,
        chat_id = EXCLUDED.chat_id,
        message_thread_id = EXCLUDED.message_thread_id,
        updated_at = NOW()
    `,
    [linkKey, threadId, chatId, messageThreadId]
  );
}

async function clearThreadLinkForChat(
  chatId: string,
  messageThreadId: number | null
): Promise<void> {
  const linkKey = buildLinkKey(chatId, messageThreadId);
  await pool.query(
    `
      DELETE FROM telegram_thread_bindings
      WHERE link_key = $1
    `,
    [linkKey]
  );
}

function toMessageText(payload: Record<string, unknown>): string {
  const keys = ['text', 'message', 'content', 'summary'];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const serialized = JSON.stringify(payload);
  if (!serialized || serialized === '{}') {
    return '(empty payload)';
  }

  return serialized;
}

function truncateForTelegram(value: string): string {
  if (value.length <= 3500) {
    return value;
  }

  return `${value.slice(0, 3497)}...`;
}

async function telegramApi<T>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const response = await fetch(buildTelegramApiUrl(botToken, method), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const raw = (await response.json().catch(() => ({}))) as TelegramApiResponse<T>;
  if (!response.ok || !raw.ok || raw.result === undefined) {
    const description = raw.description ?? `Telegram API ${method} failed with HTTP ${response.status}`;
    throw new Error(description);
  }

  return raw.result;
}

async function getUpdates(
  botToken: string,
  offset: number,
  timeoutSeconds: number
): Promise<TelegramUpdate[]> {
  return telegramApi<TelegramUpdate[]>(botToken, 'getUpdates', {
    offset,
    timeout: timeoutSeconds,
    allowed_updates: ['message', 'channel_post']
  });
}

async function sendTextMessage(
  botToken: string,
  chatId: string,
  text: string,
  messageThreadId: number | null
): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: truncateForTelegram(text)
  };
  if (messageThreadId !== null) {
    payload.message_thread_id = messageThreadId;
  }
  await telegramApi<Record<string, unknown>>(botToken, 'sendMessage', payload);
}

async function resolveThreadForChatLink(
  chatId: string,
  messageThreadId: number | null
): Promise<string> {
  const existing = await getThreadIdByChatLink(chatId, messageThreadId);
  if (existing) {
    return existing;
  }

  const defaultThreadId = deriveDefaultThreadId(chatId, messageThreadId);
  await upsertThreadLink(chatId, messageThreadId, defaultThreadId);
  return defaultThreadId;
}

function parseLinkCommand(value: string): string | null {
  const trimmed = value.trim();
  const pieces = trimmed.split(/\s+/);
  const command = normalizeCommandToken(pieces[0] ?? '');
  if (command !== '/link') {
    return null;
  }

  if (pieces.length < 2) {
    return '';
  }

  return pieces[1]?.trim() ?? '';
}

function isUnlinkCommand(value: string): boolean {
  const command = normalizeCommandToken(value.trim().split(/\s+/)[0] ?? '');
  return command === '/unlink';
}

function isThreadCommand(value: string): boolean {
  const command = normalizeCommandToken(value.trim().split(/\s+/)[0] ?? '');
  return command === '/thread';
}

function normalizeCommandToken(value: string): string {
  const lower = value.trim().toLowerCase();
  const atIndex = lower.indexOf('@');
  if (atIndex === -1) {
    return lower;
  }
  return lower.slice(0, atIndex);
}

function readSourceLinkKey(payload: Record<string, unknown>): string | null {
  const telegram = payload.telegram;
  if (!telegram || typeof telegram !== 'object') {
    return null;
  }

  const linkKey = (telegram as Record<string, unknown>).linkKey;
  if (typeof linkKey !== 'string' || linkKey.trim().length === 0) {
    return null;
  }

  return linkKey;
}

async function processTelegramMessage(params: {
  updateId: number;
  message: TelegramMessage;
  conductor: SphereConductor;
  botToken: string;
  logger: pino.Logger;
}): Promise<void> {
  const textValue = params.message.text ?? params.message.caption ?? '';
  const text = textValue.trim();
  if (!text) {
    return;
  }

  const chatId = String(params.message.chat.id);
  const messageThreadId = normalizeMessageThreadId(params.message.message_thread_id);

  await upsertChatRecord({
    message: params.message,
    linkedThreadId: await getThreadIdByChatLink(chatId, messageThreadId)
  });

  const linkValue = parseLinkCommand(text);
  if (linkValue !== null) {
    if (!isUuid(linkValue)) {
      await sendTextMessage(
        params.botToken,
        chatId,
        'Link failed. Usage: /link <thread-uuid>',
        messageThreadId
      );
      return;
    }

    await upsertThreadLink(chatId, messageThreadId, linkValue);
    await upsertChatRecord({ message: params.message, linkedThreadId: linkValue });
    await sendTextMessage(
      params.botToken,
      chatId,
      `Linked this chat context to thread ${linkValue}.`,
      messageThreadId
    );
    return;
  }

  if (isUnlinkCommand(text)) {
    await clearThreadLinkForChat(chatId, messageThreadId);
    await upsertChatRecord({ message: params.message, linkedThreadId: null });
    await sendTextMessage(
      params.botToken,
      chatId,
      'Thread link removed for this chat context.',
      messageThreadId
    );
    return;
  }

  if (isThreadCommand(text)) {
    const currentThreadId = await resolveThreadForChatLink(chatId, messageThreadId);
    await upsertChatRecord({ message: params.message, linkedThreadId: currentThreadId });
    await sendTextMessage(
      params.botToken,
      chatId,
      `Current thread: ${currentThreadId}`,
      messageThreadId
    );
    return;
  }

  const threadId = await resolveThreadForChatLink(chatId, messageThreadId);
  await upsertChatRecord({ message: params.message, linkedThreadId: threadId });

  try {
    await params.conductor.dispatchIntent({
      threadId,
      authorAgentId: resolveAuthorAgentId(params.message, chatId, messageThreadId),
      messageId: deriveMessageId(chatId, params.message.message_id),
      traceId: deriveTraceId(params.updateId),
      intent: 'AGENT_MESSAGE',
      payload: {
        text,
        bridgeOrigin: BRIDGE_ORIGIN_INBOUND,
        telegram: {
          chatId,
          messageThreadId,
          linkKey: buildLinkKey(chatId, messageThreadId),
          chatType: params.message.chat.type ?? null,
          messageId: params.message.message_id,
          date: params.message.date ?? null,
          from: {
            id: params.message.from?.id ?? null,
            username: params.message.from?.username ?? null,
            firstName: params.message.from?.first_name ?? null,
            lastName: params.message.from?.last_name ?? null
          },
          senderChat: params.message.sender_chat
            ? {
                id: params.message.sender_chat.id,
                type: params.message.sender_chat.type ?? null,
                title: params.message.sender_chat.title ?? null,
                username: params.message.sender_chat.username ?? null
              }
            : null
          ,
          authorAgentId: resolveAuthorAgentId(params.message, chatId, messageThreadId)
        }
      },
      schemaVersion: '3.0',
      protocolVersion: '3.0',
      causationId: [],
      attestation: [BRIDGE_ATTESTATION],
      agentSignature: 'telegram-bridge'
    });
  } catch (error) {
    if (
      error instanceof ConductorError &&
      error.code === 'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY'
    ) {
      return;
    }

    params.logger.error(
      {
        error,
        updateId: params.updateId,
        chatId,
        messageId: params.message.message_id
      },
      'Telegram inbound bridge dispatch failed.'
    );
  }
}

async function forwardLogEntryToTelegram(params: {
  event: LogEntryEvent;
  botToken: string;
  logger: pino.Logger;
}): Promise<void> {
  const intent = params.event.entry.clientEnvelope.intent.trim().toUpperCase();
  if (!intent.includes('MESSAGE')) {
    return;
  }

  const threadLinks = await getThreadLinksByThreadId(params.event.threadId);
  if (threadLinks.length === 0) {
    return;
  }

  const sourceLinkKey =
    params.event.entry.payload.bridgeOrigin === BRIDGE_ORIGIN_INBOUND
      ? readSourceLinkKey(params.event.entry.payload)
      : null;

  const author = params.event.entry.clientEnvelope.authorAgentId;
  const sequence = params.event.entry.ledgerEnvelope.sequence;
  const messageBody = toMessageText(params.event.entry.payload);
  const text = `thread ${params.event.threadId}\n#${sequence} ${author}\n${messageBody}`;

  for (const threadLink of threadLinks) {
    if (sourceLinkKey && threadLink.linkKey === sourceLinkKey) {
      continue;
    }

    try {
      await sendTextMessage(
        params.botToken,
        threadLink.chatId,
        text,
        threadLink.messageThreadId
      );
    } catch (error) {
      params.logger.error(
        {
          error,
          chatId: threadLink.chatId,
          messageThreadId: threadLink.messageThreadId,
          threadId: params.event.threadId,
          sequence
        },
        'Telegram outbound bridge send failed.'
      );
    }
  }
}

export async function startTelegramMessageBridge(
  options: TelegramBridgeOptions
): Promise<() => void> {
  await ensureBridgeSchema();

  let running = true;
  let offset = await readLastUpdateId();
  const onLogEntry = (event: LogEntryEvent): void => {
    void forwardLogEntryToTelegram({
      event,
      botToken: options.botToken,
      logger: options.logger
    });
  };

  options.conductor.on('log_entry', onLogEntry);

  void (async () => {
    options.logger.info(
      {
        offset,
        pollTimeoutSeconds: options.pollTimeoutSeconds
      },
      'Telegram message bridge started.'
    );

    while (running) {
      try {
        const updates = await getUpdates(
          options.botToken,
          offset,
          options.pollTimeoutSeconds
        );

        if (!running) {
          break;
        }

        for (const update of updates) {
          const message = update.message ?? update.channel_post;
          if (message) {
            await processTelegramMessage({
              updateId: update.update_id,
              message,
              conductor: options.conductor,
              botToken: options.botToken,
              logger: options.logger
            });
          }

          offset = Math.max(offset, update.update_id + 1);
        }

        if (updates.length > 0) {
          await writeLastUpdateId(offset);
        }
      } catch (error) {
        options.logger.error({ error }, 'Telegram bridge polling failed.');
        await sleep(options.errorBackoffMs);
      }
    }

    options.logger.info('Telegram message bridge stopped.');
  })();

  return () => {
    if (!running) {
      return;
    }

    running = false;
    options.conductor.off('log_entry', onLogEntry);
  };
}
