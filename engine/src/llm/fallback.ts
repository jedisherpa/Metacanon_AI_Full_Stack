import { env } from '../config/env.js';
import { createOpenAIClient } from './openaiClient.js';
import type { ChatParams, ChatResponse, ChatChunk } from './types.js';
import type { ProviderSpec } from './providers.js';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryChat(
  spec: ProviderSpec,
  params: ChatParams
): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
  const client = createOpenAIClient({
    name: spec.name,
    baseUrl: spec.baseUrl,
    apiKey: spec.apiKey,
    timeoutMs: env.LLM_HEALTH_CHECK_DELAY_MS
  });
  return client.chat(params);
}

function pickError(err: unknown): unknown {
  if (err && typeof err === 'object' && 'errors' in err && Array.isArray((err as any).errors)) {
    return (err as any).errors[0] ?? err;
  }
  return err;
}

export async function callWithRetry(
  spec: ProviderSpec,
  params: ChatParams
): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
  const primaryPromise = tryChat(spec, params);

  if (!spec.fallbackApiKey) {
    return primaryPromise;
  }

  const fallbackKeySpec: ProviderSpec = {
    ...spec,
    apiKey: spec.fallbackApiKey
  };

  const fallbackKeyPromise = delay(env.LLM_RETRY_DELAY_MS).then(() =>
    tryChat(fallbackKeySpec, params)
  );

  try {
    return await Promise.any([primaryPromise, fallbackKeyPromise]);
  } catch (err) {
    if (!spec.fallbackModel) {
      throw pickError(err);
    }
  }

  const fallbackModelSpec: ProviderSpec = {
    ...fallbackKeySpec,
    model: spec.fallbackModel
  };

  try {
    return await tryChat(fallbackModelSpec, { ...params, model: spec.fallbackModel });
  } catch (err) {
    throw pickError(err);
  }
}
