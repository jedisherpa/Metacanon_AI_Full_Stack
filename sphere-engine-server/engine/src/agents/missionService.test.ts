import { describe, expect, it, vi, type Mock } from 'vitest';

function applyBaseEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://council:council@localhost:5432/council',
    CORS_ORIGINS: 'http://localhost:5173',
    LENS_PACK: 'hands-of-the-void',
    ADMIN_PANEL_PASSWORD: 'test-password',
    KIMI_API_KEY: 'test-kimi-key',
    TELEGRAM_BOT_TOKEN: 'test-telegram-token',
    WS_TOKEN_SECRET: '12345678901234567890123456789012',
    RUNTIME_ENV: 'local',
    MISSION_STUB_FALLBACK_ENABLED: 'true',
    HYBRID_EXEC_TIMEOUT_MS: '12000',
    ...overrides
  });
}

async function loadMissionModule(options: {
  runtimeEnv: 'local' | 'staging' | 'production';
  stubFallbackEnabled: boolean;
}): Promise<{
  generateMissionReport: (typeof import('./missionService.js'))['generateMissionReport'];
  executeHybridMissionGeneration: Mock;
  HybridExecutionError: new (params: {
    message: string;
    attemptedRoutes: Array<'internal' | 'external' | 'stub'>;
    failedRoutes: Array<{ route: 'internal' | 'external' | 'stub'; message: string }>;
  }) => Error;
}> {
  vi.resetModules();
  applyBaseEnv({
    RUNTIME_ENV: options.runtimeEnv,
    MISSION_STUB_FALLBACK_ENABLED: options.stubFallbackEnabled ? 'true' : 'false'
  });

  vi.doMock('../runtime/hybridExecutionRouter.js', () => ({
    executeHybridMissionGeneration: vi.fn(),
    HybridExecutionError: class HybridExecutionError extends Error {
      attemptedRoutes: Array<'internal' | 'external' | 'stub'>;
      failedRoutes: Array<{ route: 'internal' | 'external' | 'stub'; message: string }>;

      constructor(params: {
        message: string;
        attemptedRoutes: Array<'internal' | 'external' | 'stub'>;
        failedRoutes: Array<{ route: 'internal' | 'external' | 'stub'; message: string }>;
      }) {
        super(params.message);
        this.name = 'HybridExecutionError';
        this.attemptedRoutes = [...params.attemptedRoutes];
        this.failedRoutes = params.failedRoutes.map((entry) => ({ ...entry }));
      }
    }
  }));

  const missionMod = await import('./missionService.js');
  const runtimeMod = await import('../runtime/hybridExecutionRouter.js');

  return {
    generateMissionReport: missionMod.generateMissionReport,
    executeHybridMissionGeneration: runtimeMod.executeHybridMissionGeneration as Mock,
    HybridExecutionError: runtimeMod.HybridExecutionError as new (params: {
      message: string;
      attemptedRoutes: Array<'internal' | 'external' | 'stub'>;
      failedRoutes: Array<{ route: 'internal' | 'external' | 'stub'; message: string }>;
    }) => Error
  };
}

describe('generateMissionReport', () => {
  it('returns normalized report and usage metering when hybrid execution succeeds', async () => {
    const { generateMissionReport, executeHybridMissionGeneration } = await loadMissionModule({
      runtimeEnv: 'local',
      stubFallbackEnabled: true
    });

    executeHybridMissionGeneration.mockResolvedValueOnce({
      text: 'Summary line\n- Finding one\n- Risk one\n- Action one',
      usageMetering: {
        route: 'internal',
        adapter: 'internal_llm_router',
        provider: 'morpheus',
        model: 'test-model',
        attemptedRoutes: ['internal'],
        timeoutMs: 12000,
        latencyMs: 112,
        attempts: 1,
        fallbackUsed: false,
        promptTokens: 21,
        completionTokens: 13,
        totalTokens: 34
      }
    });

    const report = await generateMissionReport({
      agentDid: 'did:key:zAgent',
      objective: 'Assess mission objective',
      provider: 'morpheus'
    });

    expect(report.degraded).toBe(false);
    expect(report.provider).toBe('morpheus');
    expect(report.summary).toContain('Summary line');
    expect(report.keyFindings).toEqual(['Summary line', 'Finding one', 'Risk one', 'Action one']);
    expect(report.usageMetering.attemptedRoutes).toEqual(['internal']);
    expect(report.usageMetering.totalTokens).toBe(34);
    expect(executeHybridMissionGeneration).toHaveBeenCalledTimes(1);
  });

  it('returns degraded stub output in non-production when runtime execution fails', async () => {
    const { generateMissionReport, executeHybridMissionGeneration } = await loadMissionModule({
      runtimeEnv: 'staging',
      stubFallbackEnabled: true
    });

    executeHybridMissionGeneration.mockRejectedValueOnce(new Error('adapter unavailable'));

    const report = await generateMissionReport({
      agentDid: 'did:key:zAgent',
      objective: 'Assess mission objective',
      provider: 'morpheus'
    });

    expect(report.degraded).toBe(true);
    expect(report.degradedReason).toContain('adapter unavailable');
    expect(report.summary).toContain('Stub mission output generated');
    expect(report.usageMetering.route).toBe('stub');
    expect(report.usageMetering.adapter).toBe('local_stub_fallback');
    expect(report.usageMetering.attemptedRoutes).toEqual(['stub']);
    expect(report.usageMetering.failedRoutes).toBeUndefined();
    expect(executeHybridMissionGeneration).toHaveBeenCalledTimes(1);
  });

  it('preserves upstream attempted routes when degraded stub fallback is used', async () => {
    const { generateMissionReport, executeHybridMissionGeneration, HybridExecutionError } =
      await loadMissionModule({
        runtimeEnv: 'staging',
        stubFallbackEnabled: true
      });

    executeHybridMissionGeneration.mockRejectedValueOnce(
      new HybridExecutionError({
        message:
          'Hybrid mission execution failed. external adapter down (route_failures: external=external adapter down; internal=internal provider down)',
        attemptedRoutes: ['external', 'internal'],
        failedRoutes: [
          { route: 'external', message: 'external adapter down' },
          { route: 'internal', message: 'internal provider down' }
        ]
      })
    );

    const report = await generateMissionReport({
      agentDid: 'did:key:zAgent',
      objective: 'Assess mission objective',
      provider: 'morpheus'
    });

    expect(report.degraded).toBe(true);
    expect(report.usageMetering.route).toBe('stub');
    expect(report.usageMetering.attemptedRoutes).toEqual(['external', 'internal', 'stub']);
    expect(report.usageMetering.failedRoutes).toEqual([
      { route: 'external', message: 'external adapter down' },
      { route: 'internal', message: 'internal provider down' }
    ]);
    expect(report.usageMetering.attempts).toBe(3);
    expect(report.usageMetering.fallbackUsed).toBe(true);
    expect(executeHybridMissionGeneration).toHaveBeenCalledTimes(1);
  });

  it('throws LLM_UNAVAILABLE in production when runtime execution fails', async () => {
    const { generateMissionReport, executeHybridMissionGeneration } = await loadMissionModule({
      runtimeEnv: 'production',
      stubFallbackEnabled: false
    });

    executeHybridMissionGeneration.mockRejectedValueOnce(new Error('provider timeout'));

    await expect(
      generateMissionReport({
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission objective',
        provider: 'morpheus'
      })
    ).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE'
    });
  });

  it('attaches runtime route telemetry to production LLM_UNAVAILABLE errors', async () => {
    const { generateMissionReport, executeHybridMissionGeneration, HybridExecutionError } =
      await loadMissionModule({
        runtimeEnv: 'production',
        stubFallbackEnabled: false
      });

    executeHybridMissionGeneration.mockRejectedValueOnce(
      new HybridExecutionError({
        message:
          'Hybrid mission execution failed. external adapter down (route_failures: external=external adapter down; internal=internal provider down)',
        attemptedRoutes: ['external', 'internal'],
        failedRoutes: [
          { route: 'external', message: 'external adapter down' },
          { route: 'internal', message: 'internal provider down' }
        ]
      })
    );

    await expect(
      generateMissionReport({
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission objective',
        provider: 'morpheus'
      })
    ).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      details: {
        runtime: {
          attemptedRoutes: ['external', 'internal'],
          failedRoutes: [
            { route: 'external', message: 'external adapter down' },
            { route: 'internal', message: 'internal provider down' }
          ]
        }
      }
    });
  });
});
