import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../agents/missionService.js', () => ({
  MissionServiceError: class MissionServiceError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
  generateMissionReport: vi.fn()
}));

function setEnv(): void {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
  process.env.WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012';
  process.env.SPHERE_BFF_SERVICE_TOKEN =
    process.env.SPHERE_BFF_SERVICE_TOKEN || 'test-sphere-service-token-123456';
  process.env.SPHERE_SIGNATURE_VERIFICATION = process.env.SPHERE_SIGNATURE_VERIFICATION || 'did_key';
}

describe('createSphereRoutes boundary hardening', () => {
  let app: any;
  let request: any;
  let token: string;
  let generateMissionReport: Mock;
  let MissionServiceError: new (
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) => Error;
  let conductor: {
    listThreads: ReturnType<typeof vi.fn>;
    getSystemState: ReturnType<typeof vi.fn>;
    getDegradedNoLlmReason: ReturnType<typeof vi.fn>;
    getGovernanceMetricsSnapshot: ReturnType<typeof vi.fn>;
    dispatchIntent: ReturnType<typeof vi.fn>;
    createThread: ReturnType<typeof vi.fn>;
    getThread: ReturnType<typeof vi.fn>;
    getThreadReplay: ReturnType<typeof vi.fn>;
    getThreadAcks: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    acknowledgeEntry: ReturnType<typeof vi.fn>;
    haltAllThreads: ReturnType<typeof vi.fn>;
    markThreadDegradedNoLlm: ReturnType<typeof vi.fn>;
    enterGlobalDegradedNoLlm: ReturnType<typeof vi.fn>;
  };
  let didRegistry: {
    register: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  const governancePolicies = {
    lensUpgradeRegistry: {
      version: '1.0',
      description: 'test lens upgrade rules',
      rules: [
        {
          ruleId: 'rule-lens-upgrade-v1',
          fromVersion: '1.0.0',
          toVersion: '1.1.0',
          permittedLensIds: ['1', '2', '3']
        }
      ]
    },
    lensUpgradeRuleById: new Map([
      [
        'rule-lens-upgrade-v1',
        {
          ruleId: 'rule-lens-upgrade-v1',
          fromVersion: '1.0.0',
          toVersion: '1.1.0',
          permittedLensIds: ['1', '2', '3']
        }
      ]
    ])
  };

  beforeAll(async () => {
    setEnv();
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const routesMod = await import('./c2Routes.js');
    const missionServiceMod = await import('../../agents/missionService.js');

    token = process.env.SPHERE_BFF_SERVICE_TOKEN as string;
    generateMissionReport = missionServiceMod.generateMissionReport as Mock;
    MissionServiceError = missionServiceMod.MissionServiceError as new (
      code: string,
      message: string
    ) => Error;
    didRegistry = {
      register: vi.fn(async (input: { did: string; label?: string; publicKey?: string }) => ({
        did: input.did,
        label: input.label,
        publicKey: input.publicKey,
        registeredAt: '2026-01-01T00:00:00.000Z'
      })),
      list: vi.fn(async () => [
        {
          did: 'did:key:zTestDid',
          label: 'Test DID',
          publicKey: 'test-public-key',
          registeredAt: '2026-01-01T00:00:00.000Z'
        }
      ]),
      get: vi.fn(async (did: string) => ({
        did,
        label: 'Known DID',
        publicKey: 'test-public-key',
        registeredAt: '2026-01-01T00:00:00.000Z'
      }))
    };

    conductor = {
      listThreads: vi.fn(async () => []),
      getSystemState: vi.fn(() => 'ACTIVE'),
      getDegradedNoLlmReason: vi.fn(() => null),
      getGovernanceMetricsSnapshot: vi.fn(() => ({
        generatedAt: '2026-03-07T00:00:00.000Z',
        counters: {
          intentAttemptTotal: 0,
          intentCommittedTotal: 0,
          intentRejectedTotal: 0,
          intentRejectedByCode: {},
          lensMissingTotal: 0,
          breakGlassFailedTotal: 0,
          signatureVerificationFailureTotal: 0,
          materialImpactQuorumFailureTotal: 0,
          auditFailureTotal: 0,
          breakGlassAttemptTotal: 0,
          breakGlassAttemptAllowedTotal: 0,
          breakGlassAttemptDeniedTotal: 0
        },
        latencyMs: {
          sampleCount: 0,
          min: null,
          max: null,
          avg: null,
          p95: null
        },
        alerts: []
      })),
      dispatchIntent: vi.fn(),
      createThread: vi.fn(),
      getThread: vi.fn(),
      getThreadReplay: vi.fn(),
      getThreadAcks: vi.fn(async () => ({ acks: [], nextCursor: 0 })),
      on: vi.fn(),
      off: vi.fn(),
      acknowledgeEntry: vi.fn(),
      haltAllThreads: vi.fn(),
      markThreadDegradedNoLlm: vi.fn(),
      enterGlobalDegradedNoLlm: vi.fn()
    };

    app = expressMod.default();
    app.use(expressMod.default.json());
    app.use(
      routesMod.createSphereRoutes({
        conductor: conductor as any,
        didRegistry: didRegistry as any,
        governancePolicies: governancePolicies as any,
        includeLegacyAlias: true
      })
    );
    app.get('/api/health', (_req: any, res: any) => {
      res.json({ ok: true });
    });
    request = supertestMod.default(app);
  });

  beforeEach(() => {
    generateMissionReport.mockReset();
    generateMissionReport.mockResolvedValue({
      summary: 'ok',
      keyFindings: ['finding'],
      risks: ['risk'],
      recommendedActions: ['action'],
      provider: 'auto',
      degraded: false
    });

    conductor.listThreads.mockReset();
    conductor.getSystemState.mockReset();
    conductor.getDegradedNoLlmReason.mockReset();
    conductor.getGovernanceMetricsSnapshot.mockReset();
    conductor.dispatchIntent.mockReset();
    conductor.createThread.mockReset();
    conductor.getThread.mockReset();
    conductor.getThreadReplay.mockReset();
    conductor.getThreadAcks.mockReset();
    conductor.on.mockReset();
    conductor.off.mockReset();
    conductor.acknowledgeEntry.mockReset();
    conductor.haltAllThreads.mockReset();
    conductor.markThreadDegradedNoLlm.mockReset();
    conductor.enterGlobalDegradedNoLlm.mockReset();
    conductor.listThreads.mockResolvedValue([]);
    conductor.getSystemState.mockReturnValue('ACTIVE');
    conductor.getDegradedNoLlmReason.mockReturnValue(null);
    conductor.getGovernanceMetricsSnapshot.mockReturnValue({
      generatedAt: '2026-03-07T00:00:00.000Z',
      counters: {
        intentAttemptTotal: 1,
        intentCommittedTotal: 1,
        intentRejectedTotal: 0,
        intentRejectedByCode: {},
        lensMissingTotal: 0,
        breakGlassFailedTotal: 0,
        signatureVerificationFailureTotal: 0,
        materialImpactQuorumFailureTotal: 0,
        auditFailureTotal: 0,
        breakGlassAttemptTotal: 0,
        breakGlassAttemptAllowedTotal: 0,
        breakGlassAttemptDeniedTotal: 0
      },
      latencyMs: { sampleCount: 1, min: 4, max: 4, avg: 4, p95: 4 },
      alerts: []
    });
    conductor.getThreadAcks.mockResolvedValue({ acks: [], nextCursor: 0 });
    conductor.markThreadDegradedNoLlm.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });

    didRegistry.register.mockReset();
    didRegistry.list.mockReset();
    didRegistry.get.mockReset();
    didRegistry.register.mockImplementation(
      async (input: { did: string; label?: string; publicKey?: string }) => ({
        did: input.did,
        label: input.label,
        publicKey: input.publicKey,
        registeredAt: '2026-01-01T00:00:00.000Z'
      })
    );
    didRegistry.list.mockResolvedValue([
      {
        did: 'did:key:zTestDid',
        label: 'Test DID',
        publicKey: 'test-public-key',
        registeredAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    didRegistry.get.mockImplementation(async (did: string) => ({
      did,
      label: 'Known DID',
      publicKey: 'test-public-key',
      registeredAt: '2026-01-01T00:00:00.000Z'
    }));
  });

  it('rejects missing service token', async () => {
    const response = await request.get('/api/v1/sphere/status');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SPHERE_ERR_AUTH_REQUIRED');
    expect(response.body.retryable).toBe(false);
  });

  it('does not enforce sphere auth on non-sphere routes', async () => {
    const response = await request.get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('rejects direct TMA authorization header', async () => {
    const response = await request
      .get('/api/v1/sphere/status')
      .set('authorization', 'tma telegram-init-data')
      .set('x-trace-id', '33333333-3333-4333-8333-333333333333');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SPHERE_ERR_TMA_DIRECT_FORBIDDEN');
    expect(response.body.traceId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('enforces strict mission envelope fields', async () => {
    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        agentDid: 'did:example:agent',
        objective: 'analyze'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.retryable).toBe(false);
    expect(response.body.details).toBeDefined();
  });

  it('supports c2 alias path when alias is enabled', async () => {
    const response = await request
      .get('/api/v1/c2/status')
      .set('x-sphere-service-token', token);

    expect(response.status).toBe(200);
    expect(response.body.systemState).toBe('ACTIVE');
    expect(response.body.threadCount).toBe(0);
    expect(response.body.governanceMetrics?.counters?.intentAttemptTotal).toBe(1);
    expect(response.headers['deprecation']).toBe('true');
    expect(response.headers['x-sphere-canonical-base']).toBe('/api/v1/sphere');
    expect(String(response.headers['link'] ?? '')).toContain('/api/v1/sphere');
  });

  it('writes mission report as derived conductor event', async () => {
    conductor.createThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.dispatchIntent
      .mockResolvedValueOnce({
        clientEnvelope: {
          messageId: '22222222-2222-4222-8222-222222222222'
        }
      })
      .mockResolvedValueOnce({
        clientEnvelope: {
          messageId: '33333333-3333-4333-8333-333333333333'
        }
      });
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'ACTIVE',
      entries: []
    });

    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '44444444-4444-4444-8444-444444444444',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAgent',
        objective: 'Analyze options',
        provider: 'auto'
      });

    expect(response.status).toBe(201);
    expect(conductor.dispatchIntent).toHaveBeenCalledTimes(2);
    expect(conductor.dispatchIntent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        authorAgentId: 'did:system:conductor',
        intent: 'MISSION_REPORT',
        causationId: ['22222222-2222-4222-8222-222222222222'],
        derivedFromVerifiedCommand: true
      })
    );
  });

  it('preserves mission usage metering in API response and derived report payload', async () => {
    const usageMetering = {
      route: 'external',
      adapter: 'external_agent_adapter',
      provider: 'morpheus',
      model: 'external-model',
      attemptedRoutes: ['internal', 'external'],
      failedRoutes: [
        {
          route: 'internal',
          message: 'internal provider timeout'
        }
      ],
      timeoutMs: 4321,
      latencyMs: 212,
      attempts: 2,
      fallbackUsed: true,
      promptTokens: 30,
      completionTokens: 16,
      totalTokens: 46,
      estimatedCostUsd: 0.0034
    };

    generateMissionReport.mockResolvedValueOnce({
      summary: 'metered summary',
      keyFindings: ['finding'],
      risks: ['risk'],
      recommendedActions: ['action'],
      provider: 'morpheus',
      usageMetering,
      degraded: false
    });

    conductor.createThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.dispatchIntent
      .mockResolvedValueOnce({
        clientEnvelope: {
          messageId: '22222222-2222-4222-8222-222222222222'
        }
      })
      .mockResolvedValueOnce({
        clientEnvelope: {
          messageId: '33333333-3333-4333-8333-333333333333'
        }
      });
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'ACTIVE',
      entries: []
    });

    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '44444444-4444-4444-8444-444444444444',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAgent',
        objective: 'Analyze options',
        provider: 'morpheus'
      });

    expect(response.status).toBe(201);
    expect(response.body.report?.usageMetering).toEqual(usageMetering);
    expect(conductor.dispatchIntent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        payload: expect.objectContaining({
          report: expect.objectContaining({
            usageMetering
          })
        })
      })
    );
  });

  it('returns degraded mission error contract when mission service fails', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError(
        'LLM_UNAVAILABLE',
        'Mission report generation failed and stub fallback is disabled in production.'
      )
    );

    conductor.createThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.dispatchIntent.mockResolvedValueOnce({
      clientEnvelope: {
        messageId: '22222222-2222-4222-8222-222222222222'
      }
    });
    conductor.markThreadDegradedNoLlm.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });

    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '44444444-4444-4444-8444-444444444444',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAgent',
        objective: 'Analyze options',
        provider: 'morpheus'
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('LLM_UNAVAILABLE');
    expect(response.body.retryable).toBe(true);
    expect(response.body.details).toEqual(
      expect.objectContaining({
        degraded: true,
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        state: 'DEGRADED_NO_LLM'
      })
    );
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Mission report generation failed and stub fallback is disabled in production.'
    );
  });

  it('propagates mission runtime telemetry in degraded mission error details', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Mission runtime outage', {
        runtime: {
          attemptedRoutes: ['external', 'internal'],
          failedRoutes: [
            { route: 'external', message: 'external adapter down' },
            { route: 'internal', message: 'internal provider down' }
          ]
        }
      })
    );

    conductor.createThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.dispatchIntent.mockResolvedValueOnce({
      clientEnvelope: {
        messageId: '22222222-2222-4222-8222-222222222222'
      }
    });
    conductor.markThreadDegradedNoLlm.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });

    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '44444444-4444-4444-8444-444444444444',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAgent',
        objective: 'Analyze options',
        provider: 'morpheus'
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('LLM_UNAVAILABLE');
    expect(response.body.details).toEqual(
      expect.objectContaining({
        degraded: true,
        degradedReason: 'Mission runtime outage',
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        runtime: {
          attemptedRoutes: ['external', 'internal'],
          failedRoutes: [
            { route: 'external', message: 'external adapter down' },
            { route: 'internal', message: 'internal provider down' }
          ]
        }
      })
    );
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Mission runtime outage'
    );
  });

  it('publishes hardened capabilities contract', async () => {
    const response = await request
      .get('/api/v1/sphere/capabilities')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.sphereThreadEnabled).toBe(true);
    expect(response.body.auth?.serviceTokenRequired).toBe(true);
    expect(response.body.features?.dids).toBe(true);
    expect(response.body.features?.threadAcks).toBe(true);
    expect(response.body.features?.lensUpgradeRules).toBe(true);
    expect(response.body.features?.lensProgression).toBe(true);
    expect(response.body.surface?.legacyAliasDeprecated).toBe(true);
    expect(response.body.surface?.legacyAliasSuccessorBase).toBe('/api/v1/sphere');
    expect(response.body.protocol?.stream?.ackCursorQuery).toBe('ack_cursor');
    expect(response.body.protocol?.stream?.ackReplayCursorHeader).toBe('x-ack-replay-cursor');
    expect(response.body.protocol?.writeEnvelope?.cycleEventsRequiredFields).toEqual([
      'threadId',
      'messageId',
      'traceId',
      'eventType',
      'attestation[]',
      'schemaVersion',
      'agentSignature'
    ]);
    expect(response.body.protocol?.cycleEventTaxonomy?.eventTypes).toEqual([
      'seat_taken',
      'perspective_submitted',
      'synthesis_returned',
      'lens_upgraded'
    ]);
    expect(response.body.protocol?.cycleEventTaxonomy?.phaseTransitions).toEqual({
      start: ['seat_taken'],
      seat_taken: ['perspective_submitted'],
      perspective_submitted: ['synthesis_returned'],
      synthesis_returned: ['lens_upgraded'],
      lens_upgraded: ['seat_taken', 'perspective_submitted']
    });
    expect(response.body.protocol?.cycleEventPayloadContracts?.schemaVersion).toBe('3.0');
    expect(response.body.protocol?.cycleEventPayloadContracts?.cycleEventTypeField).toBe('eventType');
    expect(response.body.protocol?.cycleEventPayloadContracts?.payloadCycleEventTypeField).toBe(
      'cycleEventType'
    );
    expect(response.body.protocol?.cycleEventPayloadContracts?.lensUpgradeRuleBinding).toEqual({
      tupleFields: ['ruleId', 'previousLensVersion', 'nextLensVersion'],
      governanceRegistryVersion: '1.0',
      enforcementMode: 'governed'
    });
    expect(response.body.protocol?.cycleEventPayloadContracts?.contracts?.seat_taken).toEqual({
      requiredAnyOf: ['objective', 'seatId', 'cycleId'],
      optional: ['actor', 'at'],
      notes: 'At least one seat anchor is required to start a cycle thread.'
    });
    expect(
      response.body.protocol?.cycleEventPayloadContracts?.contracts?.perspective_submitted
        ?.requiredAnyOf
    ).toEqual(['content', 'perspective']);
    expect(
      response.body.protocol?.cycleEventPayloadContracts?.contracts?.synthesis_returned?.requiredAnyOf
    ).toEqual(['synthesis', 'summary']);
    expect(response.body.protocol?.cycleEventPayloadContracts?.contracts?.lens_upgraded?.requiredAnyOf).toEqual(
      ['note', 'selectedLensId', 'nextLensVersion', 'ruleId']
    );
    expect(response.body.signatures?.runtimeVerificationMode).toBeDefined();
    expect(response.body.signatures?.targetPublicVerificationMode).toBe(
      'ed25519_did_key_or_registered_key'
    );
  });

  it('publishes lens-upgrade rules registry endpoint', async () => {
    const response = await request
      .get('/api/v1/sphere/lens-upgrade-rules')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.registryVersion).toBe('1.0');
    expect(response.body.tupleFields).toEqual(['ruleId', 'previousLensVersion', 'nextLensVersion']);
    expect(Array.isArray(response.body.rules)).toBe(true);
    expect(response.body.rules.length).toBeGreaterThan(0);
    expect(response.body.rules[0]).toMatchObject({
      ruleId: 'rule-lens-upgrade-v1',
      fromVersion: '1.0.0',
      toVersion: '1.1.0'
    });
  });

  it('computes deterministic lens progression from thread ledger', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:example:agent',
      state: 'ACTIVE',
      entries: [
        {
          clientEnvelope: {
            messageId: '22222222-2222-4222-8222-222222222222',
            traceId: '33333333-3333-4333-8333-333333333333',
            intent: 'SEAT_TAKEN'
          },
          ledgerEnvelope: {
            sequence: 1,
            timestamp: '2026-01-01T00:00:01.000Z'
          },
          payload: {
            objective: 'test'
          }
        },
        {
          clientEnvelope: {
            messageId: '44444444-4444-4444-8444-444444444444',
            traceId: '55555555-5555-4555-8555-555555555555',
            intent: 'LENS_UPGRADED'
          },
          ledgerEnvelope: {
            sequence: 2,
            timestamp: '2026-01-01T00:00:02.000Z'
          },
          payload: {
            ruleId: 'rule-lens-upgrade-v1',
            previousLensVersion: '1.0.0',
            nextLensVersion: '1.1.0',
            selectedLensId: '1'
          }
        }
      ]
    });

    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/lens-progression')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.initialVersion).toBe('1.0.0');
    expect(response.body.currentVersion).toBe('1.1.0');
    expect(response.body.upgradeCount).toBe(1);
    expect(response.body.latestUpgrade).toMatchObject({
      sequence: 2,
      ruleId: 'rule-lens-upgrade-v1',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      selectedLensId: '1'
    });
    expect(response.body.upgrades[0]?.messageId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('supports thread ACK observability endpoint with cursor and actor filter', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:example:agent',
      state: 'ACTIVE',
      entries: []
    });
    conductor.getThreadAcks.mockResolvedValueOnce({
      acks: [
        {
          ackId: 7,
          threadId: '11111111-1111-4111-8111-111111111111',
          targetSequence: 3,
          targetMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          actorDid: 'did:key:zTestDid',
          ackMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          traceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          intent: 'ACK_ENTRY',
          schemaVersion: '3.0',
          attestation: ['did:example:counselor-1'],
          agentSignature: 'sig:ack',
          receivedAt: '2026-01-01T00:00:01.000Z',
          acknowledgedAt: '2026-01-01T00:00:02.000Z'
        }
      ],
      nextCursor: 7
    });

    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/acks?cursor=5&limit=20&actor_did=did:key:zTestDid')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.cursor).toBe(5);
    expect(response.body.nextCursor).toBe(7);
    expect(response.body.acks[0]?.ackId).toBe(7);
    expect(conductor.getThreadAcks).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      cursor: 5,
      limit: 20,
      actorDid: 'did:key:zTestDid'
    });
  });

  it('supports ACK cursor fallback via x-ack-replay-cursor header', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:example:agent',
      state: 'ACTIVE',
      entries: []
    });
    conductor.getThreadAcks.mockResolvedValueOnce({
      acks: [],
      nextCursor: 11
    });

    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/acks')
      .set('authorization', `Bearer ${token}`)
      .set('x-ack-replay-cursor', '9');

    expect(response.status).toBe(200);
    expect(response.body.cursor).toBe(9);
    expect(response.body.nextCursor).toBe(11);
    expect(conductor.getThreadAcks).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      cursor: 9,
      limit: 100,
      actorDid: undefined
    });
  });

  it('replay supports from_sequence contract and computes next cursor', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:example:agent',
      state: 'ACTIVE',
      entries: []
    });
    conductor.getThreadReplay.mockResolvedValueOnce([
      {
        clientEnvelope: {
          messageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        },
        ledgerEnvelope: {
          sequence: 4,
          timestamp: '2026-01-01T00:00:00.000Z'
        }
      },
      {
        clientEnvelope: {
          messageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        },
        ledgerEnvelope: {
          sequence: 5,
          timestamp: '2026-01-01T00:00:01.000Z'
        }
      }
    ]);

    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/replay?from_sequence=4')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.cursor).toBe(3);
    expect(response.body.nextCursor).toBe(5);
    expect(response.body.entries).toHaveLength(2);
    expect(conductor.getThreadReplay).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      4
    );
  });

  it('replay supports last-event-id header when cursor query is missing', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:example:agent',
      state: 'ACTIVE',
      entries: []
    });
    conductor.getThreadReplay.mockResolvedValueOnce([]);

    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/replay')
      .set('authorization', `Bearer ${token}`)
      .set('last-event-id', '10');

    expect(response.status).toBe(200);
    expect(response.body.cursor).toBe(10);
    expect(response.body.nextCursor).toBe(10);
    expect(conductor.getThreadReplay).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      11
    );
  });

  it('enforces ACK payload selector requirement', async () => {
    const response = await request
      .post('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/ack')
      .set('authorization', `Bearer ${token}`)
      .send({
        actorDid: 'did:key:zTestDid',
        traceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:ack'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.retryable).toBe(false);
    expect(conductor.acknowledgeEntry).not.toHaveBeenCalled();
  });

  it('accepts ACK payload and forwards normalized write fields', async () => {
    conductor.acknowledgeEntry.mockResolvedValueOnce({
      ackId: 12,
      threadId: '11111111-1111-4111-8111-111111111111',
      targetSequence: 5,
      targetMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      actorDid: 'did:key:zAckActor',
      ackMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      traceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      intent: 'ACK_ENTRY',
      schemaVersion: '3.0',
      attestation: ['did:example:counselor-1'],
      agentSignature: 'sig:ack',
      receivedAt: '2026-01-01T00:00:01.000Z',
      acknowledgedAt: '2026-01-01T00:00:02.000Z'
    });

    const response = await request
      .post('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/ack')
      .set('authorization', `Bearer ${token}`)
      .send({
        actorDid: 'did:key:zAckActor',
        targetMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        traceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:ack',
        receivedAt: '2026-01-01T00:00:01.000Z'
      });

    expect(response.status).toBe(201);
    expect(response.body.ack?.ackId).toBe(12);
    expect(response.body.traceId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    expect(conductor.acknowledgeEntry).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      actorDid: 'did:key:zAckActor',
      targetSequence: undefined,
      targetMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ackMessageId: undefined,
      traceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      intent: 'ACK_ENTRY',
      schemaVersion: '3.0',
      attestation: ['did:example:counselor-1'],
      agentSignature: 'sig:ack',
      receivedAt: '2026-01-01T00:00:01.000Z'
    });
  });

  it('supports DID list/get/upsert endpoints', async () => {
    const listResponse = await request
      .get('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.count).toBe(1);
    expect(Array.isArray(listResponse.body.dids)).toBe(true);

    const getResponse = await request
      .get('/api/v1/sphere/dids/did:key:zTestDid')
      .set('authorization', `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.did?.did).toBe('did:key:zTestDid');

    const upsertResponse = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${token}`)
      .send({
        did: 'did:key:zNewDid',
        label: 'New DID',
        publicKey: 'new-public-key'
      });

    expect(upsertResponse.status).toBe(201);
    expect(upsertResponse.body.did?.did).toBe('did:key:zNewDid');
    expect(didRegistry.register).toHaveBeenCalledWith({
      did: 'did:key:zNewDid',
      label: 'New DID',
      publicKey: 'new-public-key'
    });
  });

  it('returns did not found for missing DID', async () => {
    didRegistry.get.mockResolvedValueOnce(null);

    const response = await request
      .get('/api/v1/sphere/dids/did:key:zMissingDid')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SPHERE_ERR_DID_NOT_FOUND');
    expect(response.body.retryable).toBe(false);
  });

  it('rejects non did:key DID upsert without publicKey when verification is enabled', async () => {
    const response = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${token}`)
      .send({
        did: 'did:example:missing-key',
        label: 'Missing key'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(didRegistry.register).not.toHaveBeenCalled();
  });

  it('rejects write requests from non-verifiable non did:key signers', async () => {
    didRegistry.get.mockResolvedValueOnce(null);

    const response = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:example:unsigned-agent',
        intent: 'MISSION_NOTE',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: { note: 'test' }
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SPHERE_ERR_SIGNER_KEY_REQUIRED');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('allows did:key signer without registry lookup', async () => {
    conductor.dispatchIntent.mockResolvedValueOnce({
      ledgerEnvelope: {
        sequence: 9,
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    });

    const response = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        intent: 'MISSION_NOTE',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: { note: 'test' }
      });

    expect(response.status).toBe(201);
    expect(conductor.dispatchIntent).toHaveBeenCalledTimes(1);
    expect(didRegistry.get).not.toHaveBeenCalled();
  });

  it('accepts cycle event writes with frozen taxonomy and maps to canonical intents', async () => {
    conductor.dispatchIntent.mockResolvedValueOnce({
      ledgerEnvelope: {
        sequence: 10,
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    });

    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'seat_taken',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: { seatId: 'seat-4' }
      });

    expect(response.status).toBe(201);
    expect(response.body.eventType).toBe('seat_taken');
    expect(response.body.intent).toBe('SEAT_TAKEN');
    expect(conductor.dispatchIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'SEAT_TAKEN',
        payload: expect.objectContaining({
          cycleEventType: 'seat_taken',
          seatId: 'seat-4'
        })
      })
    );
  });

  it('rejects non-seat cycle event when thread has no prior cycle phase', async () => {
    conductor.getThread.mockResolvedValueOnce(null);

    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222231',
        traceId: '33333333-3333-4333-8333-333333333342',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'perspective_submitted',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          content: 'First event cannot skip seat.'
        }
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_CYCLE_PHASE');
    expect(response.body.message).toBe('Cycle thread must begin with seat_taken.');
    expect(response.body.details?.expectedNextEventTypes).toEqual(['seat_taken']);
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects invalid cycle phase transition order', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'ACTIVE',
      entries: [
        {
          clientEnvelope: { intent: 'SEAT_TAKEN' },
          ledgerEnvelope: { sequence: 1 }
        }
      ]
    });

    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222232',
        traceId: '33333333-3333-4333-8333-333333333343',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'synthesis_returned',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          summary: 'Cannot jump directly from seat to synthesis.'
        }
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_CYCLE_PHASE');
    expect(response.body.message).toBe('Invalid cycle transition: seat_taken -> synthesis_returned.');
    expect(response.body.details?.expectedNextEventTypes).toEqual(['perspective_submitted']);
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects cycle events outside frozen taxonomy', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'unknown_event',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {}
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects seat_taken payloads missing frozen seat fields', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'seat_taken',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          at: '2026-01-01T00:00:00.000Z'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid seat_taken payload contract.');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects perspective_submitted payloads missing perspective content', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222223',
        traceId: '33333333-3333-4333-8333-333333333334',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'perspective_submitted',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          at: '2026-01-01T00:00:00.000Z'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid perspective_submitted payload contract.');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects synthesis_returned payloads missing synthesis/summary', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222224',
        traceId: '33333333-3333-4333-8333-333333333335',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'synthesis_returned',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          lensName: 'Sentinel',
          at: '2026-01-01T00:00:00.000Z'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid synthesis_returned payload contract.');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects lens_upgraded payloads missing lens-upgrade deltas', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222225',
        traceId: '33333333-3333-4333-8333-333333333336',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'lens_upgraded',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          at: '2026-01-01T00:00:00.000Z'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid lens_upgraded payload contract.');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects mismatched payload cycleEventType and envelope eventType', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222226',
        traceId: '33333333-3333-4333-8333-333333333337',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'seat_taken',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          objective: 'Start cycle',
          cycleEventType: 'lens_upgraded'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('cycleEventType in payload must match eventType in the envelope.');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects lens_upgraded rule tuple when one field is missing', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222227',
        traceId: '33333333-3333-4333-8333-333333333338',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'lens_upgraded',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          ruleId: 'rule-lens-upgrade-v1',
          nextLensVersion: '1.1.0'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toContain(
      'lens_upgraded rule-bound upgrades require ruleId, previousLensVersion, and nextLensVersion together.'
    );
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects unknown lens_upgraded ruleId', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222228',
        traceId: '33333333-3333-4333-8333-333333333339',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'lens_upgraded',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          ruleId: 'rule-does-not-exist',
          previousLensVersion: '1.0.0',
          nextLensVersion: '1.1.0'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Unknown lens upgrade ruleId: rule-does-not-exist.');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('rejects lens_upgraded rule tuple when versions do not match governance rule', async () => {
    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222229',
        traceId: '33333333-3333-4333-8333-333333333340',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'lens_upgraded',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          ruleId: 'rule-lens-upgrade-v1',
          previousLensVersion: '1.0.0',
          nextLensVersion: '2.0.0'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe(
      'lens_upgraded payload version tuple does not match governance rule rule-lens-upgrade-v1.'
    );
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('accepts lens_upgraded rule tuple when governance rule matches', async () => {
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'ACTIVE',
      entries: [
        {
          clientEnvelope: { intent: 'SEAT_TAKEN' },
          ledgerEnvelope: { sequence: 1 }
        },
        {
          clientEnvelope: { intent: 'PERSPECTIVE_SUBMITTED' },
          ledgerEnvelope: { sequence: 2 }
        },
        {
          clientEnvelope: { intent: 'SYNTHESIS_RETURNED' },
          ledgerEnvelope: { sequence: 3 }
        }
      ]
    });
    conductor.dispatchIntent.mockResolvedValueOnce({
      ledgerEnvelope: {
        sequence: 11,
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    });

    const response = await request
      .post('/api/v1/sphere/cycle-events')
      .set('authorization', `Bearer ${token}`)
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222230',
        traceId: '33333333-3333-4333-8333-333333333341',
        authorAgentId: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        eventType: 'lens_upgraded',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'caller-signature',
        payload: {
          ruleId: 'rule-lens-upgrade-v1',
          previousLensVersion: '1.0.0',
          nextLensVersion: '1.1.0',
          selectedLensId: '1'
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.eventType).toBe('lens_upgraded');
    expect(conductor.dispatchIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          ruleId: 'rule-lens-upgrade-v1',
          previousLensVersion: '1.0.0',
          nextLensVersion: '1.1.0',
          selectedLensId: '1',
          cycleEventType: 'lens_upgraded'
        })
      })
    );
  });

  it('can disable alias surface when includeLegacyAlias is false', async () => {
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const routesMod = await import('./c2Routes.js');

    const conductor = {
      listThreads: vi.fn(async () => []),
      getSystemState: vi.fn(() => 'ACTIVE'),
      getDegradedNoLlmReason: vi.fn(() => null),
      dispatchIntent: vi.fn(),
      createThread: vi.fn(),
      getThread: vi.fn(),
      getThreadReplay: vi.fn(),
      getThreadAcks: vi.fn(async () => ({ acks: [], nextCursor: 0 })),
      on: vi.fn(),
      off: vi.fn(),
      acknowledgeEntry: vi.fn(),
      haltAllThreads: vi.fn()
    };

    const appNoAlias = expressMod.default();
    appNoAlias.use(expressMod.default.json());
    appNoAlias.use(
      routesMod.createSphereRoutes({
        conductor: conductor as any,
        didRegistry: didRegistry as any,
        includeLegacyAlias: false
      })
    );
    const localRequest = supertestMod.default(appNoAlias);

    const sphereStatus = await localRequest
      .get('/api/v1/sphere/status')
      .set('authorization', `Bearer ${token}`);
    expect(sphereStatus.status).toBe(200);

    const aliasStatus = await localRequest
      .get('/api/v1/c2/status')
      .set('authorization', `Bearer ${token}`);
    expect(aliasStatus.status).toBe(404);

    const legacyHalt = await localRequest
      .post('/api/v1/threads/halt-all')
      .set('authorization', `Bearer ${token}`)
      .send({});
    expect(legacyHalt.status).toBe(404);
  });
});
