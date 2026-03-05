import { env } from '../config/env.js';
import { createOpenAIClient } from './openaiClient.js';
import type { LLMProvider } from './types.js';

export type ProviderChoice = 'morpheus' | 'groq' | 'kimi' | 'auto';

export type ProviderSpec = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbackModel?: string;
  fallbackApiKey?: string;
};

export type ProviderSet = {
  generation: ProviderSpec;
  orchestrator: ProviderSpec;
};

export function getProviderSet(choice: ProviderChoice): ProviderSet {
  const morpheus: ProviderSpec = {
    name: 'morpheus',
    baseUrl: env.MORPHEUS_BASE_URL,
    apiKey: env.MORPHEUS_API_KEY,
    model: env.MORPHEUS_MODEL,
    fallbackModel: env.MORPHEUS_FALLBACK_MODEL,
    fallbackApiKey: env.MORPHEUS_API_KEY
  };

  const morpheusOrchestrator: ProviderSpec = {
    name: 'morpheus',
    baseUrl: env.MORPHEUS_BASE_URL,
    apiKey: env.MORPHEUS_API_KEY,
    model: env.MORPHEUS_ORCHESTRATOR_MODEL,
    fallbackModel: env.MORPHEUS_FALLBACK_MODEL,
    fallbackApiKey: env.MORPHEUS_API_KEY
  };

  const groq: ProviderSpec = {
    name: 'groq',
    baseUrl: env.GROQ_BASE_URL,
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL,
    fallbackModel: env.GROQ_MODEL,
    fallbackApiKey: env.GROQ_FALLBACK_API_KEY
  };

  const groqOrchestrator: ProviderSpec = {
    name: 'groq',
    baseUrl: env.GROQ_BASE_URL,
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_ORCHESTRATOR_MODEL,
    fallbackModel: env.GROQ_ORCHESTRATOR_MODEL,
    fallbackApiKey: env.GROQ_FALLBACK_API_KEY
  };

  const kimi: ProviderSpec = {
    name: 'kimi',
    baseUrl: env.KIMI_BASE_URL,
    apiKey: env.KIMI_API_KEY,
    model: env.KIMI_MODEL,
    fallbackModel: env.KIMI_FALLBACK_MODEL,
    fallbackApiKey: env.KIMI_API_KEY
  };

  const kimiOrchestrator: ProviderSpec = {
    name: 'kimi',
    baseUrl: env.KIMI_BASE_URL,
    apiKey: env.KIMI_API_KEY,
    model: env.KIMI_ORCHESTRATOR_MODEL,
    fallbackModel: env.KIMI_FALLBACK_MODEL,
    fallbackApiKey: env.KIMI_API_KEY
  };

  if (choice === 'kimi') {
    return { generation: kimi, orchestrator: kimiOrchestrator };
  }

  if (choice === 'auto') {
    return { generation: kimi, orchestrator: kimiOrchestrator };
  }

  if (choice === 'groq') {
    return { generation: groq, orchestrator: groqOrchestrator };
  }

  return { generation: morpheus, orchestrator: morpheusOrchestrator };
}

export function createProviderClient(spec: ProviderSpec): LLMProvider {
  return createOpenAIClient({
    name: spec.name,
    baseUrl: spec.baseUrl,
    apiKey: spec.apiKey,
    timeoutMs: env.LLM_HEALTH_CHECK_DELAY_MS
  });
}
