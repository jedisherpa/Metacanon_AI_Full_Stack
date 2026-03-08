import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_INTENT = 'skill.api_integration.run';
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES = 5;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiIntegrationInput = {
  integrationId: string;
  endpoint: string;
  method?: HttpMethod;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: unknown;
  authRef?: string;
  timeoutMs?: number;
  maxRetries?: number;
  expectedStatuses?: number[];
  dryRun?: boolean;
};

export type ApiIntegrationOutput = {
  integrationId: string;
  request: {
    method: HttpMethod;
    url: string;
    dryRun: boolean;
    headers: Record<string, string>;
    hasBody: boolean;
  };
  attempts: number;
  response?: {
    status: number;
    ok: boolean;
    body: unknown;
    headers: Record<string, string>;
  };
  rateLimit?: {
    remaining?: number;
    retryAfterSeconds?: number;
    resetEpochSeconds?: number;
  };
};

export type ApiActionValidationRequest = {
  action: 'api_call';
  payload: {
    integrationId: string;
    method: HttpMethod;
    url: string;
    hasBody: boolean;
  };
};

export type ApiActionValidationResult = {
  allowed: boolean;
  code?: string;
  message?: string;
};

export type ApiActionValidator = (
  request: ApiActionValidationRequest
) => Promise<ApiActionValidationResult> | ApiActionValidationResult;

export type ApiSecretResolver = (authRef: string) => Promise<string>;

export type ApiHttpRequest = {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

export type ApiHttpResponse = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

export type ApiHttpExecutor = (request: ApiHttpRequest) => Promise<ApiHttpResponse>;

export type ApiRateLimitDecision = {
  allowed: boolean;
  retryAfterMs?: number;
};

export type ApiRateLimiter = {
  acquire: (integrationId: string) => Promise<ApiRateLimitDecision> | ApiRateLimitDecision;
};

type SleepFn = (ms: number) => Promise<void>;

export class InMemoryApiRateLimiter implements ApiRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, number[]>();

  constructor(options: {
    maxRequests: number;
    windowMs: number;
    now?: () => number;
  }) {
    this.maxRequests = Math.max(1, Math.floor(options.maxRequests));
    this.windowMs = Math.max(1, Math.floor(options.windowMs));
    this.now = options.now ?? Date.now;
  }

  acquire(integrationId: string): ApiRateLimitDecision {
    const key = integrationId.trim().toLowerCase();
    const now = this.now();
    const cutoff = now - this.windowMs;
    const bucket = (this.buckets.get(key) ?? []).filter((timestamp) => timestamp >= cutoff);

    if (bucket.length >= this.maxRequests) {
      const oldest = bucket[0] ?? now;
      const retryAfterMs = Math.max(1, oldest + this.windowMs - now);
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        retryAfterMs
      };
    }

    bucket.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true
    };
  }
}

export class ApiIntegrationSkillError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function normalizeMethod(rawMethod: string | undefined): HttpMethod {
  const method = (rawMethod ?? 'GET').trim().toUpperCase();
  if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    return method;
  }
  throw new ApiIntegrationSkillError('API_METHOD_INVALID', `Unsupported HTTP method "${rawMethod ?? ''}".`);
}

function parseAndNormalizeUrl(rawEndpoint: string, query: Record<string, string | number | boolean>): URL {
  let url: URL;
  try {
    url = new URL(rawEndpoint.trim());
  } catch {
    throw new ApiIntegrationSkillError(
      'API_ENDPOINT_INVALID',
      `endpoint "${rawEndpoint}" must be a valid absolute URL.`
    );
  }

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const headerKey = key.trim().toLowerCase();
    if (!headerKey || typeof value !== 'string') {
      continue;
    }
    normalized[headerKey] = value;
  }
  return normalized;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function parseResponseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseRateLimit(headers: Record<string, string>): ApiIntegrationOutput['rateLimit'] {
  const remainingRaw = headers['x-ratelimit-remaining'];
  const retryAfterRaw = headers['retry-after'];
  const resetRaw = headers['x-ratelimit-reset'];

  const remaining = remainingRaw != null ? Number.parseInt(remainingRaw, 10) : undefined;
  const retryAfterSeconds = retryAfterRaw != null ? Number.parseInt(retryAfterRaw, 10) : undefined;
  const resetEpochSeconds = resetRaw != null ? Number.parseInt(resetRaw, 10) : undefined;

  if (
    remaining == null &&
    retryAfterSeconds == null &&
    resetEpochSeconds == null
  ) {
    return undefined;
  }
  return {
    remaining: Number.isFinite(remaining) ? remaining : undefined,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
    resetEpochSeconds: Number.isFinite(resetEpochSeconds) ? resetEpochSeconds : undefined
  };
}

function shouldValidateAction(config: AgentConfig): boolean {
  return config.security?.requireActionValidation ?? true;
}

function isExpectedStatus(status: number, expectedStatuses: number[] | undefined): boolean {
  if (!expectedStatuses || expectedStatuses.length === 0) {
    return status >= 200 && status < 300;
  }
  return expectedStatuses.includes(status);
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function executeHttpWithFetch(request: ApiHttpRequest): Promise<ApiHttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal
    });
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });
    const bodyText = await response.text();
    return {
      status: response.status,
      headers: responseHeaders,
      bodyText
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeInput(input: ApiIntegrationInput, allowedHosts: Set<string>): {
  integrationId: string;
  method: HttpMethod;
  url: URL;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxRetries: number;
  expectedStatuses?: number[];
  dryRun: boolean;
  authRef?: string;
} {
  const integrationId = input.integrationId?.trim().toLowerCase();
  if (!integrationId) {
    throw new ApiIntegrationSkillError('API_INTEGRATION_ID_REQUIRED', 'integrationId is required.');
  }

  const method = normalizeMethod(input.method);
  const url = parseAndNormalizeUrl(input.endpoint, input.query ?? {});
  if (allowedHosts.size > 0 && !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new ApiIntegrationSkillError(
      'API_HOST_NOT_ALLOWED',
      `Host "${url.hostname}" is not allowed for API integration.`
    );
  }

  const headers = normalizeHeaders(input.headers);
  if (!headers['content-type'] && input.body != null && method !== 'GET') {
    headers['content-type'] = 'application/json';
  }
  const body =
    input.body != null && method !== 'GET'
      ? typeof input.body === 'string'
        ? input.body
        : JSON.stringify(input.body)
      : undefined;

  const timeoutMs = clampInt(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS);
  const maxRetries = clampInt(input.maxRetries ?? DEFAULT_MAX_RETRIES, 0, MAX_RETRIES);
  const expectedStatuses =
    Array.isArray(input.expectedStatuses) && input.expectedStatuses.length > 0
      ? input.expectedStatuses
          .map((status) => Number.parseInt(String(status), 10))
          .filter((status) => Number.isFinite(status) && status >= 100 && status <= 599)
      : undefined;
  const dryRun = input.dryRun ?? false;
  const authRef = input.authRef?.trim() || undefined;

  return {
    integrationId,
    method,
    url,
    headers,
    body,
    timeoutMs,
    maxRetries,
    expectedStatuses,
    dryRun,
    authRef
  };
}

export function createApiIntegrationSkill(params: {
  config: AgentConfig;
  allowedHosts?: string[];
  executeHttp?: ApiHttpExecutor;
  resolveSecret?: ApiSecretResolver;
  validateAction?: ApiActionValidator;
  rateLimiter?: ApiRateLimiter;
  sleep?: SleepFn;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: ApiIntegrationInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<ApiIntegrationOutput>>;
} {
  const allowedHosts = new Set((params.allowedHosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean));
  const executeHttp = params.executeHttp ?? executeHttpWithFetch;
  const sleep = params.sleep ?? sleepMs;

  const executor = createBaseExecutor<ApiIntegrationInput, ApiIntegrationOutput>({
    validate: async ({ input, config }) => {
      let normalized: ReturnType<typeof normalizeInput>;
      try {
        normalized = normalizeInput(input, allowedHosts);
      } catch (error) {
        if (error instanceof ApiIntegrationSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'API_INPUT_INVALID',
          message: 'Invalid API integration input.'
        };
      }

      if (!normalized.dryRun && shouldValidateAction(config) && !params.validateAction) {
        return {
          allowed: false,
          code: 'ACTION_VALIDATOR_NOT_CONFIGURED',
          message: 'validate_action callback is required for outbound API calls.'
        };
      }

      if (!normalized.dryRun && normalized.authRef && !params.resolveSecret) {
        return {
          allowed: false,
          code: 'API_SECRET_RESOLVER_NOT_CONFIGURED',
          message: 'resolveSecret callback is required when authRef is provided.'
        };
      }

      if (!normalized.dryRun && params.rateLimiter) {
        const decision = await params.rateLimiter.acquire(normalized.integrationId);
        if (!decision.allowed) {
          return {
            allowed: false,
            code: 'API_RATE_LIMITED',
            message:
              decision.retryAfterMs != null
                ? `Rate limited. Retry after ${Math.ceil(decision.retryAfterMs / 1000)}s.`
                : 'Rate limited.'
          };
        }
      }

      return { allowed: true };
    },
    execute: async ({ input, config }) => {
      const normalized = normalizeInput(input, allowedHosts);

      if (normalized.authRef && params.resolveSecret) {
        const secret = await params.resolveSecret(normalized.authRef);
        if (!normalized.headers.authorization) {
          normalized.headers.authorization = `Bearer ${secret}`;
        }
      }

      if (normalized.dryRun) {
        return {
          integrationId: normalized.integrationId,
          request: {
            method: normalized.method,
            url: normalized.url.toString(),
            dryRun: true,
            headers: redactHeaders(normalized.headers),
            hasBody: Boolean(normalized.body)
          },
          attempts: 0
        };
      }

      if (shouldValidateAction(config) && params.validateAction) {
        const decision = await params.validateAction({
          action: 'api_call',
          payload: {
            integrationId: normalized.integrationId,
            method: normalized.method,
            url: normalized.url.toString(),
            hasBody: Boolean(normalized.body)
          }
        });
        if (!decision.allowed) {
          throw new ApiIntegrationSkillError(
            decision.code ?? 'ACTION_VALIDATION_REJECTED',
            decision.message ?? 'API call rejected by validator.'
          );
        }
      }

      let lastResponse: ApiHttpResponse | null = null;
      let attempts = 0;
      for (let attempt = 0; attempt <= normalized.maxRetries; attempt += 1) {
        attempts += 1;
        try {
          const response = await executeHttp({
            url: normalized.url.toString(),
            method: normalized.method,
            headers: normalized.headers,
            body: normalized.body,
            timeoutMs: normalized.timeoutMs
          });
          lastResponse = response;

          const rateLimit = parseRateLimit(response.headers);
          const expected = isExpectedStatus(response.status, normalized.expectedStatuses);
          if (expected) {
            return {
              integrationId: normalized.integrationId,
              request: {
                method: normalized.method,
                url: normalized.url.toString(),
                dryRun: false,
                headers: redactHeaders(normalized.headers),
                hasBody: Boolean(normalized.body)
              },
              attempts,
              response: {
                status: response.status,
                ok: true,
                body: parseResponseBody(response.bodyText),
                headers: response.headers
              },
              rateLimit
            };
          }

          const shouldRetry =
            response.status === 429 || (response.status >= 500 && response.status <= 599);
          if (!shouldRetry || attempt >= normalized.maxRetries) {
            throw new ApiIntegrationSkillError(
              'API_STATUS_UNEXPECTED',
              `Unexpected API status ${response.status}.`,
              {
                status: response.status,
                body: response.bodyText.slice(0, 512)
              }
            );
          }

          const retryAfterSecondsRaw = response.headers['retry-after'];
          const retryAfterSeconds = retryAfterSecondsRaw ? Number.parseInt(retryAfterSecondsRaw, 10) : NaN;
          const backoffMs = Number.isFinite(retryAfterSeconds)
            ? Math.max(250, retryAfterSeconds * 1000)
            : Math.min(5_000, 300 * 2 ** attempt);
          await sleep(backoffMs);
        } catch (error) {
          if (attempt >= normalized.maxRetries) {
            throw error;
          }
          await sleep(Math.min(5_000, 300 * 2 ** attempt));
        }
      }

      if (!lastResponse) {
        throw new ApiIntegrationSkillError('API_CALL_FAILED', 'API call failed without a response.');
      }

      throw new ApiIntegrationSkillError('API_CALL_FAILED', `API call failed after ${attempts} attempts.`);
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
