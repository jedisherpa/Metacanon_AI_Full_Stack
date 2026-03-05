import { env } from '../config/env.js';
import { callWithRetry } from '../llm/fallback.js';
import { getProviderSet, type ProviderChoice, type ProviderSpec } from '../llm/providers.js';
import type { ChatChunk, ChatMessage, ChatParams, ChatResponse } from '../llm/types.js';

export type RuntimeRoute = 'internal' | 'external' | 'stub';

export type HybridRouteFailure = {
  route: RuntimeRoute;
  message: string;
};

export class HybridExecutionError extends Error {
  readonly attemptedRoutes: RuntimeRoute[];
  readonly failedRoutes: HybridRouteFailure[];

  constructor(params: {
    message: string;
    attemptedRoutes: RuntimeRoute[];
    failedRoutes: HybridRouteFailure[];
  }) {
    super(params.message);
    this.name = 'HybridExecutionError';
    this.attemptedRoutes = [...params.attemptedRoutes];
    this.failedRoutes = params.failedRoutes.map((entry) => ({ ...entry }));
  }
}

export type UsageMetering = {
  route: RuntimeRoute;
  adapter: string;
  provider: string;
  model: string;
  attemptedRoutes: RuntimeRoute[];
  failedRoutes?: HybridRouteFailure[];
  timeoutMs: number;
  latencyMs: number;
  attempts: number;
  fallbackUsed: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type HybridExecutionResult = {
  text: string;
  usageMetering: UsageMetering;
};

export type HybridExecutionInput = {
  provider: ProviderChoice;
  agentDid: string;
  objective: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

type AdapterResult = {
  text: string;
  model: string;
  provider: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

type HybridExecutionOptions = {
  timeoutMs?: number;
  externalAdapterUrl?: string;
  externalAdapterToken?: string;
  externalPreferredProviders?: string;
  fetchImpl?: typeof fetch;
  callWithRetryImpl?: typeof callWithRetry;
  now?: () => number;
};

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return value != null && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}

function normalizeProviderSet(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function runWithTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function readInternalResult(
  spec: ProviderSpec,
  params: ChatParams,
  callWithRetryImpl: typeof callWithRetry
): Promise<AdapterResult> {
  const response = await callWithRetryImpl(spec, params);

  if (isAsyncIterable<ChatChunk>(response)) {
    let text = '';
    for await (const chunk of response) {
      text += chunk.choices?.[0]?.delta?.content ?? '';
    }
    return {
      text: text.trim(),
      model: spec.model,
      provider: spec.name
    };
  }

  const usage = response.usage;
  const promptTokens = usage?.prompt_tokens;
  const completionTokens = usage?.completion_tokens;
  const totalTokens =
    typeof promptTokens === 'number' || typeof completionTokens === 'number'
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined;

  return {
    text: (response as ChatResponse).choices?.[0]?.message?.content?.trim() ?? '',
    model: spec.model,
    provider: spec.name,
    promptTokens,
    completionTokens,
    totalTokens
  };
}

type ExternalAdapterPayload = {
  text?: string;
  summary?: string;
  model?: string;
  provider?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
};

async function readExternalResult(params: {
  fetchImpl: typeof fetch;
  url: string;
  token?: string;
  timeoutMs: number;
  input: HybridExecutionInput;
  model: string;
}): Promise<AdapterResult> {
  const controller = new AbortController();
  const abortHandle = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await params.fetchImpl(params.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(params.token ? { authorization: `Bearer ${params.token}` } : {})
      },
      body: JSON.stringify({
        objective: params.input.objective,
        agentDid: params.input.agentDid,
        provider: params.input.provider,
        model: params.model,
        temperature: params.input.temperature,
        maxTokens: params.input.maxTokens,
        messages: params.input.messages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `External adapter request failed with ${response.status}${errorText ? `: ${errorText}` : ''}`
      );
    }

    const payload = (await response.json()) as ExternalAdapterPayload;
    const text = (payload.text ?? payload.summary ?? '').trim();
    if (!text) {
      throw new Error('External adapter returned an empty text payload.');
    }

    const promptTokens = payload.usage?.promptTokens;
    const completionTokens = payload.usage?.completionTokens;
    const totalTokens =
      payload.usage?.totalTokens ??
      (typeof promptTokens === 'number' || typeof completionTokens === 'number'
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined);

    return {
      text,
      model: payload.model?.trim() || params.model,
      provider: payload.provider?.trim() || 'external',
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: payload.usage?.estimatedCostUsd
    };
  } finally {
    clearTimeout(abortHandle);
  }
}

export async function executeHybridMissionGeneration(
  input: HybridExecutionInput,
  options: HybridExecutionOptions = {}
): Promise<HybridExecutionResult> {
  const generation = getProviderSet(input.provider).generation;
  const timeoutMs = options.timeoutMs ?? env.HYBRID_EXEC_TIMEOUT_MS;
  const externalAdapterUrl = options.externalAdapterUrl ?? env.EXTERNAL_AGENT_ADAPTER_URL ?? '';
  const externalAdapterToken =
    options.externalAdapterToken ?? env.EXTERNAL_AGENT_ADAPTER_TOKEN ?? undefined;
  const externalPreferredProviders = normalizeProviderSet(
    options.externalPreferredProviders ?? env.HYBRID_EXTERNAL_PROVIDERS
  );
  const requestedProvider = input.provider.toLowerCase();
  const resolvedProvider = generation.name.toLowerCase();
  const preferExternal =
    externalPreferredProviders.has(requestedProvider) ||
    externalPreferredProviders.has(resolvedProvider);
  const fetchImpl = options.fetchImpl ?? fetch;
  const callWithRetryImpl = options.callWithRetryImpl ?? callWithRetry;
  const now = options.now ?? Date.now;

  const hasExternalAdapter = externalAdapterUrl.trim().length > 0;
  const orderedRoutes: RuntimeRoute[] = hasExternalAdapter
    ? preferExternal
      ? ['external', 'internal']
      : ['internal', 'external']
    : ['internal'];

  const errors: unknown[] = [];
  const failedRoutes: HybridRouteFailure[] = [];

  for (const [index, route] of orderedRoutes.entries()) {
    const startedAt = now();
    try {
      const result =
        route === 'internal'
          ? await runWithTimeout(
              readInternalResult(
                generation,
                {
                  model: generation.model,
                  messages: input.messages,
                  temperature: input.temperature,
                  max_tokens: input.maxTokens
                },
                callWithRetryImpl
              ),
              timeoutMs,
              'Internal execution'
            )
          : await runWithTimeout(
              readExternalResult({
                fetchImpl,
                url: externalAdapterUrl,
                token: externalAdapterToken,
                timeoutMs,
                input,
                model: generation.model
              }),
              timeoutMs,
              'External execution'
            );

      const latencyMs = Math.max(0, now() - startedAt);
      return {
        text: result.text,
        usageMetering: {
          route,
          adapter: route === 'internal' ? 'internal_llm_router' : 'external_agent_adapter',
          provider: result.provider,
          model: result.model,
          attemptedRoutes: orderedRoutes.slice(0, index + 1),
          failedRoutes: failedRoutes.length > 0 ? failedRoutes.map((entry) => ({ ...entry })) : undefined,
          timeoutMs,
          latencyMs,
          attempts: index + 1,
          fallbackUsed: index > 0,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          estimatedCostUsd: result.estimatedCostUsd
        }
      };
    } catch (error) {
      errors.push(error);
      failedRoutes.push({
        route,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const firstError = errors[0];
  const message = firstError instanceof Error ? firstError.message : 'Unknown runtime execution error.';
  const routeContext = failedRoutes
    .map((entry) => `${entry.route}=${entry.message}`)
    .join('; ');
  throw new HybridExecutionError({
    message:
      routeContext.length > 0
        ? `Hybrid mission execution failed. ${message} (route_failures: ${routeContext})`
        : `Hybrid mission execution failed. ${message}`,
    attemptedRoutes: failedRoutes.map((entry) => entry.route),
    failedRoutes
  });
}
