import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_INTENT = 'skill.email_checking.run';
const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const MIN_CONNECTION_TIMEOUT_MS = 1_000;
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 50;
const DEFAULT_MAX_MESSAGES = 200;
const MAX_MESSAGES = 1_000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_RETRIES = 6;
const DEFAULT_BACKOFF_BASE_MS = 250;

export type EmailMessage = {
  messageId: string;
  from: string;
  subject?: string;
  preview?: string;
  receivedAt: string;
  threadId?: string;
};

export type EmailFetchRequest = {
  accountId: string;
  credentialRef: string;
  query?: string;
  cursor?: string;
  limit: number;
};

export type EmailFetchPage = {
  messages: EmailMessage[];
  nextCursor?: string;
};

export type EmailBatchSummary = {
  batchIndex: number;
  messageCount: number;
  summary: string;
  urgentMessageIds: string[];
};

export type EmailCheckingInput = {
  accountId: string;
  credentialRef: string;
  query?: string;
  maxMessages?: number;
  batchSize?: number;
  connectionTimeoutMs?: number;
  maxRetries?: number;
};

export type EmailCheckingOutput = {
  accountId: string;
  query?: string;
  batchSize: number;
  maxMessages: number;
  totalFetched: number;
  totalBatches: number;
  fetchAttempts: number;
  fetchRetriesUsed: number;
  summaries: EmailBatchSummary[];
  messageIds: string[];
};

export type EmailFetcher = (request: EmailFetchRequest) => Promise<EmailFetchPage>;
export type EmailBatchSummarizer = (params: {
  accountId: string;
  query?: string;
  batchIndex: number;
  messages: EmailMessage[];
}) => Promise<EmailBatchSummary>;

export class EmailCheckingSkillError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type SleepFn = (ms: number) => Promise<void>;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function normalizeCredentialRef(credentialRef: string): string {
  const trimmed = credentialRef.trim();
  if (!trimmed || !trimmed.startsWith('secret://')) {
    throw new EmailCheckingSkillError(
      'INVALID_CREDENTIAL_REF',
      'credentialRef must use secret:// reference format.'
    );
  }
  return trimmed;
}

function normalizeInput(input: EmailCheckingInput): {
  accountId: string;
  credentialRef: string;
  query?: string;
  batchSize: number;
  maxMessages: number;
  connectionTimeoutMs: number;
  maxRetries: number;
} {
  const accountId = input.accountId?.trim();
  if (!accountId) {
    throw new EmailCheckingSkillError('INVALID_ACCOUNT_ID', 'accountId is required.');
  }

  return {
    accountId,
    credentialRef: normalizeCredentialRef(input.credentialRef),
    query: input.query?.trim() || undefined,
    batchSize: clampInt(input.batchSize ?? DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
    maxMessages: clampInt(input.maxMessages ?? DEFAULT_MAX_MESSAGES, 1, MAX_MESSAGES),
    connectionTimeoutMs: clampInt(
      input.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
      MIN_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECTION_TIMEOUT_MS
    ),
    maxRetries: clampInt(input.maxRetries ?? DEFAULT_MAX_RETRIES, 0, MAX_RETRIES)
  };
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Email fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function defaultSummarizer(params: {
  accountId: string;
  query?: string;
  batchIndex: number;
  messages: EmailMessage[];
}): EmailBatchSummary {
  const uniqueSenders = new Set(
    params.messages
      .map((message) => message.from.trim().toLowerCase())
      .filter((sender) => sender.length > 0)
  );
  const urgentMessageIds = params.messages
    .filter((message) =>
      /urgent|asap|action required|important|immediately/i.test(`${message.subject ?? ''} ${message.preview ?? ''}`)
    )
    .map((message) => message.messageId)
    .slice(0, 25);

  return {
    batchIndex: params.batchIndex,
    messageCount: params.messages.length,
    summary: [
      `Processed ${params.messages.length} messages for account ${params.accountId}.`,
      params.query ? `Query: ${params.query}.` : 'Query: inbox.',
      `Unique senders: ${uniqueSenders.size}.`,
      urgentMessageIds.length > 0
        ? `Urgent markers detected in ${urgentMessageIds.length} messages.`
        : 'No urgent markers detected.'
    ].join(' '),
    urgentMessageIds
  };
}

async function fetchWithRetry(params: {
  fetchEmails: EmailFetcher;
  sleep: SleepFn;
  request: EmailFetchRequest;
  connectionTimeoutMs: number;
  maxRetries: number;
}): Promise<{
  page: EmailFetchPage;
  attempts: number;
}> {
  let attempts = 0;
  let backoffMs = DEFAULT_BACKOFF_BASE_MS;
  let lastError: unknown;

  while (attempts <= params.maxRetries) {
    attempts += 1;
    try {
      const page = await runWithTimeout(params.fetchEmails(params.request), params.connectionTimeoutMs);
      return {
        page: {
          messages: Array.isArray(page.messages) ? page.messages : [],
          nextCursor: page.nextCursor?.trim() || undefined
        },
        attempts
      };
    } catch (error) {
      lastError = error;
      if (attempts > params.maxRetries) {
        break;
      }
      await params.sleep(backoffMs);
      backoffMs *= 2;
    }
  }

  const message =
    lastError instanceof Error && lastError.message.trim().length > 0
      ? lastError.message
      : 'Email fetch failed after retries.';
  throw new EmailCheckingSkillError('EMAIL_FETCH_FAILED', message, {
    attempts,
    maxRetries: params.maxRetries
  });
}

export function getDefaultEmailCheckingSchedule(): {
  intervalMinutes: 30;
  skipIfRunning: true;
} {
  return {
    intervalMinutes: 30,
    skipIfRunning: true
  };
}

export function createEmailCheckingSkill(params: {
  config: AgentConfig;
  fetchEmails?: EmailFetcher;
  summarizeBatch?: EmailBatchSummarizer;
  sleep?: SleepFn;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: EmailCheckingInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<EmailCheckingOutput>>;
} {
  const sleep: SleepFn =
    params.sleep ??
    (async (ms: number) => {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), ms);
      });
    });

  const summarizeBatch =
    params.summarizeBatch ??
    (async (summaryInput) => {
      return defaultSummarizer(summaryInput);
    });

  const executor = createBaseExecutor<EmailCheckingInput, EmailCheckingOutput>({
    validate: async ({ input }) => {
      if (!params.fetchEmails) {
        return {
          allowed: false,
          code: 'EMAIL_FETCHER_NOT_CONFIGURED',
          message: 'Email fetcher is not configured for this skill.'
        };
      }

      try {
        normalizeInput(input);
      } catch (error) {
        if (error instanceof EmailCheckingSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'EMAIL_INPUT_INVALID',
          message: 'Invalid email checking input.'
        };
      }

      return { allowed: true };
    },
    execute: async ({ input }) => {
      if (!params.fetchEmails) {
        throw new EmailCheckingSkillError(
          'EMAIL_FETCHER_NOT_CONFIGURED',
          'Email fetcher is not configured for this skill.'
        );
      }

      const normalized = normalizeInput(input);
      const messages: EmailMessage[] = [];
      let fetchAttempts = 0;
      let cursor: string | undefined;

      while (messages.length < normalized.maxMessages) {
        const requestLimit = Math.min(normalized.batchSize, normalized.maxMessages - messages.length);
        const fetchResult = await fetchWithRetry({
          fetchEmails: params.fetchEmails,
          sleep,
          request: {
            accountId: normalized.accountId,
            credentialRef: normalized.credentialRef,
            query: normalized.query,
            cursor,
            limit: requestLimit
          },
          connectionTimeoutMs: normalized.connectionTimeoutMs,
          maxRetries: normalized.maxRetries
        });

        fetchAttempts += fetchResult.attempts;
        if (fetchResult.page.messages.length === 0) {
          break;
        }

        messages.push(...fetchResult.page.messages.slice(0, requestLimit));
        cursor = fetchResult.page.nextCursor;
        if (!cursor) {
          break;
        }
      }

      const summaries: EmailBatchSummary[] = [];
      for (let start = 0; start < messages.length; start += normalized.batchSize) {
        const batch = messages.slice(start, start + normalized.batchSize);
        if (batch.length === 0) {
          continue;
        }
        const batchIndex = Math.floor(start / normalized.batchSize);
        const summary = await summarizeBatch({
          accountId: normalized.accountId,
          query: normalized.query,
          batchIndex,
          messages: batch
        });
        summaries.push({
          ...summary,
          batchIndex,
          messageCount: batch.length
        });
      }

      return {
        accountId: normalized.accountId,
        query: normalized.query,
        batchSize: normalized.batchSize,
        maxMessages: normalized.maxMessages,
        totalFetched: messages.length,
        totalBatches: summaries.length,
        fetchAttempts,
        fetchRetriesUsed: Math.max(fetchAttempts - summaries.length, 0),
        summaries,
        messageIds: messages.map((message) => message.messageId)
      };
    },
    auditLog: params.auditLog,
    onBoundaryError: params.onBoundaryError
  });

  return {
    execute: async (input, context) =>
      executor.execute({
        config: params.config,
        intent: DEFAULT_INTENT,
        input,
        traceId: context?.traceId,
        metadata: context?.metadata
      })
  };
}
