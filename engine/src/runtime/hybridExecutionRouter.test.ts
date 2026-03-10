import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function setEnv(): void {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
  process.env.WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012';
}

describe('executeHybridMissionGeneration', () => {
  let executeHybridMissionGeneration: (typeof import('./hybridExecutionRouter.js'))['executeHybridMissionGeneration'];
  let HybridExecutionError: (typeof import('./hybridExecutionRouter.js'))['HybridExecutionError'];

  beforeAll(async () => {
    setEnv();
    const mod = await import('./hybridExecutionRouter.js');
    executeHybridMissionGeneration = mod.executeHybridMissionGeneration;
    HybridExecutionError = mod.HybridExecutionError;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses external adapter first for preferred provider', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'external synthesis output',
        model: 'external-model',
        provider: 'external-provider',
        usage: {
          promptTokens: 20,
          completionTokens: 10,
          totalTokens: 30,
          estimatedCostUsd: 0.0021
        }
      }),
      text: async () => ''
    }));
    const retryMock = vi.fn();

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user prompt' }
        ],
        temperature: 0.3,
        maxTokens: 500
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus,groq',
        timeoutMs: 5000,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).not.toHaveBeenCalled();
    expect(result.text).toBe('external synthesis output');
    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.fallbackUsed).toBe(false);
    expect(result.usageMetering.attempts).toBe(1);
    expect(result.usageMetering.attemptedRoutes).toEqual(['external']);
    expect(result.usageMetering.totalTokens).toBe(30);
  });

  it('uses external adapter first for auto provider when resolved provider is preferred', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'external auto-provider output',
        model: 'external-auto-model',
        provider: 'external-provider',
        usage: {
          promptTokens: 9,
          completionTokens: 4,
          totalTokens: 13
        }
      }),
      text: async () => ''
    }));
    const retryMock = vi.fn();

    const result = await executeHybridMissionGeneration(
      {
        provider: 'auto',
        agentDid: 'did:key:zAgent',
        objective: 'Route auto provider through preferred external adapter',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'kimi',
        timeoutMs: 5000,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).not.toHaveBeenCalled();
    expect(result.text).toBe('external auto-provider output');
    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.fallbackUsed).toBe(false);
    expect(result.usageMetering.attempts).toBe(1);
    expect(result.usageMetering.attemptedRoutes).toEqual(['external']);
    expect(result.usageMetering.totalTokens).toBe(13);
  });

  it('reports deterministic timeout and latency metering when now() is injected', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'external synthesis output',
        model: 'external-model',
        provider: 'external-provider',
        usage: {
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10
        }
      }),
      text: async () => ''
    }));
    const nowValues = [10_000, 10_145];
    const now = vi.fn(() => nowValues.shift() ?? 10_145);

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus',
        timeoutMs: 1234,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: vi.fn(),
        now
      }
    );

    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.timeoutMs).toBe(1234);
    expect(result.usageMetering.latencyMs).toBe(145);
    expect(result.usageMetering.attempts).toBe(1);
    expect(result.usageMetering.fallbackUsed).toBe(false);
    expect(result.usageMetering.totalTokens).toBe(10);
  });

  it('clamps latency metering to zero when injected clock moves backwards', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'external synthesis output',
        model: 'external-model',
        provider: 'external-provider'
      }),
      text: async () => ''
    }));
    const nowValues = [20_000, 19_900];
    const now = vi.fn(() => nowValues.shift() ?? 19_900);

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus',
        timeoutMs: 500,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: vi.fn(),
        now
      }
    );

    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.latencyMs).toBe(0);
    expect(result.usageMetering.timeoutMs).toBe(500);
  });

  it('falls back to internal execution when external adapter fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('adapter unavailable');
    });
    const retryMock = vi.fn(async () => ({
      choices: [{ message: { content: 'internal fallback output' } }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7
      }
    }));

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus',
        timeoutMs: 5000,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('internal fallback output');
    expect(result.usageMetering.route).toBe('internal');
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
    expect(result.usageMetering.attemptedRoutes).toEqual(['external', 'internal']);
    expect(result.usageMetering.failedRoutes).toEqual([
      {
        route: 'external',
        message: 'adapter unavailable'
      }
    ]);
    expect(result.usageMetering.totalTokens).toBe(18);
  });

  it('reports deterministic metering on fallback success when now() is injected', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('adapter unavailable');
    });
    const retryMock = vi.fn(async () => ({
      choices: [{ message: { content: 'internal deterministic fallback output' } }],
      usage: {
        prompt_tokens: 7,
        completion_tokens: 5
      }
    }));
    const nowValues = [11_000, 12_000, 12_085];
    const now = vi.fn(() => nowValues.shift() ?? 12_085);

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus',
        timeoutMs: 2222,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock,
        now
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(result.usageMetering.route).toBe('internal');
    expect(result.usageMetering.timeoutMs).toBe(2222);
    expect(result.usageMetering.latencyMs).toBe(85);
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
  });

  it('reports deterministic metering on fallback route when first route fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('adapter unavailable');
    });
    const retryMock = vi.fn(async () => ({
      choices: [{ message: { content: 'internal fallback output' } }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7
      }
    }));
    const nowValues = [5_000, 7_000, 7_133];
    const now = vi.fn(() => nowValues.shift() ?? 7_133);

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus',
        timeoutMs: 4321,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock,
        now
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(3);
    expect(result.usageMetering.route).toBe('internal');
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
    expect(result.usageMetering.timeoutMs).toBe(4321);
    expect(result.usageMetering.latencyMs).toBe(133);
  });

  it('falls back to internal execution when external adapter times out', async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise(() => {
          // Intentionally never resolves to trigger runtime timeout fallback.
        })
    );
    const retryMock = vi.fn(async () => ({
      choices: [{ message: { content: 'internal timeout fallback output' } }],
      usage: {
        prompt_tokens: 9,
        completion_tokens: 6
      }
    }));

    const result = await executeHybridMissionGeneration(
      {
        provider: 'morpheus',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus',
        timeoutMs: 10,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('internal timeout fallback output');
    expect(result.usageMetering.route).toBe('internal');
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
    expect(result.usageMetering.totalTokens).toBe(15);
  });

  it('falls back to external adapter when internal execution fails first', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        summary: 'external fallback summary',
        model: 'external-fallback-model'
      }),
      text: async () => ''
    }));
    const retryMock = vi.fn(async () => {
      throw new Error('internal provider error');
    });

    const result = await executeHybridMissionGeneration(
      {
        provider: 'auto',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus,groq',
        timeoutMs: 5000,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock
      }
    );

    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('external fallback summary');
    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
    expect(result.usageMetering.attemptedRoutes).toEqual(['internal', 'external']);
    expect(result.usageMetering.failedRoutes).toEqual([
      {
        route: 'internal',
        message: 'internal provider error'
      }
    ]);
  });

  it('falls back to external adapter when internal execution times out first', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'external timeout fallback output',
        model: 'external-fallback-model',
        provider: 'external-provider'
      }),
      text: async () => ''
    }));
    const retryMock = vi.fn(
      () =>
        new Promise<never>(() => {
          // Intentionally never resolves to trigger runtime timeout fallback.
        })
    );

    const result = await executeHybridMissionGeneration(
      {
        provider: 'auto',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus,groq',
        timeoutMs: 10,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock
      }
    );

    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('external timeout fallback output');
    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
  });

  it('reports deterministic metering for internal-timeout to external-fallback path', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'external timeout fallback output',
        model: 'external-fallback-model',
        provider: 'external-provider',
        usage: {
          promptTokens: 5,
          completionTokens: 4,
          totalTokens: 9
        }
      }),
      text: async () => ''
    }));
    const retryMock = vi.fn(
      () =>
        new Promise<never>(() => {
          // Intentionally never resolves to trigger runtime timeout fallback.
        })
    );
    const nowValues = [1_000, 3_000, 3_188];
    const now = vi.fn(() => nowValues.shift() ?? 3_188);

    const result = await executeHybridMissionGeneration(
      {
        provider: 'auto',
        agentDid: 'did:key:zAgent',
        objective: 'Assess mission options',
        messages: [{ role: 'user', content: 'hello' }]
      },
      {
        externalAdapterUrl: 'https://adapter.example.com/v1/run',
        externalPreferredProviders: 'morpheus,groq',
        timeoutMs: 77,
        fetchImpl: fetchMock as unknown as typeof fetch,
        callWithRetryImpl: retryMock,
        now
      }
    );

    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(3);
    expect(result.usageMetering.route).toBe('external');
    expect(result.usageMetering.fallbackUsed).toBe(true);
    expect(result.usageMetering.attempts).toBe(2);
    expect(result.usageMetering.timeoutMs).toBe(77);
    expect(result.usageMetering.latencyMs).toBe(188);
    expect(result.usageMetering.totalTokens).toBe(9);
  });

  it('surfaces first route failure and per-route context when all runtime routes fail', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('external adapter down');
    });
    const retryMock = vi.fn(async () => {
      throw new Error('internal provider down');
    });

    let thrown: unknown = null;
    try {
      await executeHybridMissionGeneration(
        {
          provider: 'morpheus',
          agentDid: 'did:key:zAgent',
          objective: 'Assess mission options',
          messages: [{ role: 'user', content: 'hello' }]
        },
        {
          externalAdapterUrl: 'https://adapter.example.com/v1/run',
          externalPreferredProviders: 'morpheus',
          timeoutMs: 5000,
          fetchImpl: fetchMock as unknown as typeof fetch,
          callWithRetryImpl: retryMock
        }
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HybridExecutionError);
    const message = (thrown as Error).message;
    expect(message).toContain('Hybrid mission execution failed. external adapter down');
    expect(message).toContain(
      'route_failures: external=external adapter down; internal=internal provider down'
    );
    expect((thrown as InstanceType<typeof HybridExecutionError>).attemptedRoutes).toEqual([
      'external',
      'internal'
    ]);
    expect((thrown as InstanceType<typeof HybridExecutionError>).failedRoutes).toEqual([
      { route: 'external', message: 'external adapter down' },
      { route: 'internal', message: 'internal provider down' }
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(retryMock).toHaveBeenCalledTimes(1);
  });
});
