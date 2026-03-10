import { env } from '../config/env.js';
import { type ProviderChoice } from '../llm/providers.js';
import {
  HybridExecutionError,
  executeHybridMissionGeneration,
  type RuntimeRoute,
  type UsageMetering
} from '../runtime/hybridExecutionRouter.js';

export type MissionReport = {
  summary: string;
  keyFindings: string[];
  risks: string[];
  recommendedActions: string[];
  provider: ProviderChoice;
  usageMetering: UsageMetering;
  degraded: boolean;
  degradedReason?: string;
};

export class MissionServiceError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
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
    const execution = await executeHybridMissionGeneration({
      provider: input.provider,
      agentDid: input.agentDid,
      objective: input.objective,
      messages,
      temperature: 0.3,
      maxTokens: 700
    });

    const normalized = execution.text.trim();
    return {
      summary: normalized.slice(0, 600) || `Mission completed for objective: ${input.objective}`,
      keyFindings: toBulletList(normalized, 'No findings returned by provider.'),
      risks: toBulletList(normalized, 'No explicit risks returned by provider.'),
      recommendedActions: toBulletList(normalized, 'No recommendations returned by provider.'),
      provider: input.provider,
      usageMetering: execution.usageMetering,
      degraded: false
    };
    } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown LLM error';
    if (!canUseStubFallback()) {
      const runtime =
        err instanceof HybridExecutionError
          ? {
              attemptedRoutes: err.attemptedRoutes,
              failedRoutes: err.failedRoutes
            }
          : undefined;
      throw new MissionServiceError(
        'LLM_UNAVAILABLE',
        `Mission report generation failed and stub fallback is disabled in ${env.RUNTIME_ENV}.`,
        runtime ? { runtime } : undefined
      );
    }

    const attemptedRoutes: RuntimeRoute[] =
      err instanceof HybridExecutionError && err.attemptedRoutes.length > 0
        ? [...err.attemptedRoutes, 'stub']
        : ['stub'];
    const failedRoutes = err instanceof HybridExecutionError ? err.failedRoutes : undefined;
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
      usageMetering: {
        route: 'stub',
        adapter: 'local_stub_fallback',
        provider: input.provider,
        model: 'stub',
        attemptedRoutes,
        failedRoutes,
        timeoutMs: env.HYBRID_EXEC_TIMEOUT_MS,
        latencyMs: 0,
        attempts: attemptedRoutes.length,
        fallbackUsed: true
      },
      degraded: true,
      degradedReason: reason
    };
  }
}
