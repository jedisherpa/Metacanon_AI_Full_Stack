import crypto from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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

function setProductionEnv(): void {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
  process.env.WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012';
  process.env.CONDUCTOR_PRIVATE_KEY = process.env.CONDUCTOR_PRIVATE_KEY || 'test-conductor-secret';
  process.env.SPHERE_BFF_SERVICE_TOKEN =
    process.env.SPHERE_BFF_SERVICE_TOKEN || 'test-sphere-service-token-123456';
  process.env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES = 'true';
  process.env.SPHERE_BFF_AGENT_API_KEYS = 'alpha=test-agent-key-123456';
  process.env.SPHERE_SIGNATURE_VERIFICATION = 'strict';
  process.env.RUNTIME_ENV = 'production';
  process.env.MISSION_STUB_FALLBACK_ENABLED = 'false';
}

function buildInitData(botToken: string, userId = 123456): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'AAEAAABBB');
  params.set('user', JSON.stringify({ id: userId, first_name: 'TestUser' }));

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('createSphereBffRoutes production degraded behavior', () => {
  let request: any;
  let initData: string;
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

  beforeAll(async () => {
    vi.resetModules();
    setProductionEnv();
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const routesMod = await import('./c2Routes.js');
    const bffRoutesMod = await import('./sphereBffRoutes.js');
    const missionServiceMod = await import('../../agents/missionService.js');

    generateMissionReport = missionServiceMod.generateMissionReport as Mock;
    MissionServiceError = missionServiceMod.MissionServiceError as new (
      code: string,
      message: string,
      details?: Record<string, unknown>
    ) => Error;
    initData = buildInitData(process.env.TELEGRAM_BOT_TOKEN as string);

    conductor = {
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
      haltAllThreads: vi.fn(),
      markThreadDegradedNoLlm: vi.fn(),
      enterGlobalDegradedNoLlm: vi.fn()
    };

    const didRegistry = {
      register: vi.fn(async () => ({
        did: 'did:key:zAlpha',
        label: 'Alpha',
        publicKey: null
      })),
      list: vi.fn(async () => []),
      get: vi.fn(async () => null)
    };

    const threadAccessRegistry = {
      checkWriteAccess: vi.fn(async () => ({ allowed: true, bootstrap: false })),
      getMembership: vi.fn(async () => null),
      grantMembership: vi.fn(async () => null),
      createInvite: vi.fn(async () => null),
      acceptInvite: vi.fn(async () => null),
      listMembers: vi.fn(async () => []),
      listInvites: vi.fn(async () => []),
      revokeInvite: vi.fn(async () => null),
      removeMember: vi.fn(async () => null)
    };

    const sphereRoutes = routesMod.createSphereRoutes({
      conductor: conductor as any,
      didRegistry: didRegistry as any,
      includeLegacyAlias: true
    });

    const app = expressMod.default();
    app.use(expressMod.default.json());
    app.use(
      bffRoutesMod.createSphereBffRoutes({
        sphereRoutes,
        threadAccessRegistry: threadAccessRegistry as any
      })
    );
    app.use(sphereRoutes);
    request = supertestMod.default(app);
  });

  beforeEach(() => {
    generateMissionReport.mockReset();
    conductor.getSystemState.mockReset();
    conductor.getDegradedNoLlmReason.mockReset();
    conductor.dispatchIntent.mockReset();
    conductor.createThread.mockReset();
    conductor.getThread.mockReset();
    conductor.markThreadDegradedNoLlm.mockReset();
    conductor.enterGlobalDegradedNoLlm.mockReset();

    conductor.getSystemState.mockReturnValue('ACTIVE');
    conductor.getDegradedNoLlmReason.mockReturnValue(null);
    conductor.createThread.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.getThread.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAlpha',
      state: 'ACTIVE',
      entries: []
    });
    conductor.dispatchIntent.mockResolvedValue({
      ledgerEnvelope: {
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    });
    conductor.markThreadDegradedNoLlm.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAlpha',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });
  });

  it('invokes global degraded hook for mission failure through bff surface in production', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Production BFF outage')
    );

    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAlpha',
        objective: 'Analyze options',
        provider: 'morpheus'
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('LLM_UNAVAILABLE');
    expect(response.body.retryable).toBe(true);
    expect(response.body.details).toEqual({
      degraded: true,
      degradedReason: 'Production BFF outage',
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      state: 'DEGRADED_NO_LLM'
    });
    expect(conductor.enterGlobalDegradedNoLlm).toHaveBeenCalledWith('Production BFF outage');
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Production BFF outage'
    );
  });

  it('preserves runtime route telemetry on bff mission degraded errors in production', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Production BFF outage with route context', {
        runtime: {
          attemptedRoutes: ['external', 'internal'],
          failedRoutes: [
            { route: 'external', message: 'external adapter down' },
            { route: 'internal', message: 'internal provider down' }
          ]
        }
      })
    );

    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAlpha',
        objective: 'Analyze options',
        provider: 'morpheus'
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('LLM_UNAVAILABLE');
    expect(response.body.retryable).toBe(true);
    expect(response.body.details).toEqual({
      degraded: true,
      degradedReason: 'Production BFF outage with route context',
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      state: 'DEGRADED_NO_LLM',
      runtime: {
        attemptedRoutes: ['external', 'internal'],
        failedRoutes: [
          { route: 'external', message: 'external adapter down' },
          { route: 'internal', message: 'internal provider down' }
        ]
      }
    });
    expect(conductor.enterGlobalDegradedNoLlm).toHaveBeenCalledWith(
      'Production BFF outage with route context'
    );
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Production BFF outage with route context'
    );
  });

  it('short-circuits mission dispatch when bff surface is already DEGRADED_NO_LLM', async () => {
    conductor.getSystemState.mockReturnValueOnce('DEGRADED_NO_LLM');
    conductor.getDegradedNoLlmReason.mockReturnValueOnce('Pre-existing production outage');
    conductor.getThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAlpha',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });

    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:dispatch',
        agentDid: 'did:key:zAlpha',
        objective: 'Analyze options',
        provider: 'morpheus'
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('DEGRADED_NO_LLM');
    expect(response.body.retryable).toBe(true);
    expect(response.body.details).toEqual({
      degraded: true,
      degradedReason: 'Pre-existing production outage',
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      state: 'DEGRADED_NO_LLM'
    });
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Pre-existing production outage'
    );
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
    expect(conductor.enterGlobalDegradedNoLlm).not.toHaveBeenCalled();
  });
});
