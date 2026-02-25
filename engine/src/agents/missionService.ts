import { env } from '../config/env.js';
import { callWithRetry } from '../llm/fallback.js';
import { getProviderSet, type ProviderChoice } from '../llm/providers.js';
import type { ChatChunk } from '../llm/types.js';

export type MissionReport = {
  summary: string;
  keyFindings: string[];
  risks: string[];
  recommendedActions: string[];
  provider: ProviderChoice;
  degraded: boolean;
  degradedReason?: string;
};

export class MissionServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return value != null && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}

function toBulletList(text: string, fallbackLabel: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length > 0) {
    return lines.slice(0, 4);
  }

  return [fallbackLabel];
}

function canUseStubFallback(): boolean {
  return env.RUNTIME_ENV !== 'production' && env.MISSION_STUB_FALLBACK_ENABLED;
}

export async function generateMissionReport(input: {
  agentDid: string;
  objective: string;
  provider: ProviderChoice;
}): Promise<MissionReport> {
  const { generation } = getProviderSet(input.provider);

  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a mission intelligence assistant. Return concise, factual, and operationally useful output.'
    },
    {
      role: 'user' as const,
      content: [
        `Agent DID: ${input.agentDid}`,
        `Objective: ${input.objective}`,
        '',
        'Return a response with sections:',
        '1) Summary',
        '2) Key Findings',
        '3) Risks',
        '4) Recommended Actions'
      ].join('\n')
    }
  ];

  try {
    const response = await callWithRetry(generation, {
      model: generation.model,
      messages,
      temperature: 0.3,
      max_tokens: 700
    });

    let text = '';
    if (isAsyncIterable<ChatChunk>(response)) {
      for await (const chunk of response) {
        text += chunk.choices?.[0]?.delta?.content ?? '';
      }
    } else {
      text = response.choices?.[0]?.message?.content ?? '';
    }

    const normalized = text.trim();
    return {
      summary: normalized.slice(0, 600) || `Mission completed for objective: ${input.objective}`,
      keyFindings: toBulletList(normalized, 'No findings returned by provider.'),
      risks: toBulletList(normalized, 'No explicit risks returned by provider.'),
      recommendedActions: toBulletList(normalized, 'No recommendations returned by provider.'),
      provider: input.provider,
      degraded: false
    };
  } catch (err) {
    if (!canUseStubFallback()) {
      throw new MissionServiceError(
        'LLM_UNAVAILABLE',
        `Mission report generation failed and stub fallback is disabled in ${env.RUNTIME_ENV}.`
      );
    }

    const reason = err instanceof Error ? err.message : 'Unknown LLM error';
    return {
      summary: `Stub mission output generated because upstream LLM was unavailable: ${reason}`,
      keyFindings: [
        'LLM provider unavailable during mission execution.',
        'Mission loop remained operational in degraded mode.'
      ],
      risks: [
        'Output quality is reduced because this response is synthetic.',
        'Human validation required before any material action.'
      ],
      recommendedActions: [
        'Retry mission after provider health recovers.',
        'Escalate to observer if mission is material impact.'
      ],
      provider: input.provider,
      degraded: true,
      degradedReason: reason
    };
  }
}
