import crypto from 'node:crypto';
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
  process.env.SPHERE_SIGNATURE_VERIFICATION = process.env.SPHERE_SIGNATURE_VERIFICATION || 'strict';
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

describe('createSphereBffRoutes production mission failure parity', () => {
  let app: any;
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
  let didRegistry: {
    register: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let threadAccessRegistry: {
    checkWriteAccess: ReturnType<typeof vi.fn>;
    getMembership: ReturnType<typeof vi.fn>;
    grantMembership: ReturnType<typeof vi.fn>;
    createInvite: ReturnType<typeof vi.fn>;
    acceptInvite: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    listInvites: ReturnType<typeof vi.fn>;
    revokeInvite: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
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

    didRegistry = {
      register: vi.fn(async () => ({
        did: 'did:key:zTestDid',
        label: 'Test DID',
        publicKey: null,
        registeredAt: '2026-01-01T00:00:00.000Z'
      })),
      list: vi.fn(async () => []),
      get: vi.fn(async () => null)
    };

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

    threadAccessRegistry = {
      checkWriteAccess: vi.fn(async () => ({ allowed: true, bootstrap: false })),
      getMembership: vi.fn(async () => ({
        threadId: '11111111-1111-4111-8111-111111111111',
        principal: 'alpha',
        role: 'owner',
        joinedAt: '2026-01-01T00:00:00.000Z'
      })),
      grantMembership: vi.fn(),
      createInvite: vi.fn(),
      acceptInvite: vi.fn(),
      listMembers: vi.fn(async () => []),
      listInvites: vi.fn(async () => []),
      revokeInvite: vi.fn(),
      removeMember: vi.fn()
    };

    const sphereRoutes = routesMod.createSphereRoutes({
      conductor: conductor as any,
      didRegistry: didRegistry as any,
      includeLegacyAlias: true
    });

    app = expressMod.default();
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
    didRegistry.register.mockReset();
    didRegistry.list.mockReset();
    didRegistry.get.mockReset();
    conductor.listThreads.mockReset();
    conductor.getSystemState.mockReset();
    conductor.getDegradedNoLlmReason.mockReset();
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

    threadAccessRegistry.checkWriteAccess.mockReset();
    threadAccessRegistry.getMembership.mockReset();

    conductor.getSystemState.mockReturnValue('ACTIVE');
    conductor.getDegradedNoLlmReason.mockReturnValue(null);
    conductor.getThreadAcks.mockResolvedValue({ acks: [], nextCursor: 0 });
    conductor.createThread.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.dispatchIntent.mockResolvedValue({
      clientEnvelope: {
        messageId: '22222222-2222-4222-8222-222222222222'
      }
    });
    conductor.markThreadDegradedNoLlm.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });

    threadAccessRegistry.checkWriteAccess.mockResolvedValue({ allowed: true, bootstrap: false });
    threadAccessRegistry.getMembership.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00.000Z'
    });

    didRegistry.register.mockResolvedValue({
      did: 'did:key:zTestDid',
      label: 'Test DID',
      publicKey: null,
      registeredAt: '2026-01-01T00:00:00.000Z'
    });
    didRegistry.list.mockResolvedValue([]);
    didRegistry.get.mockResolvedValue(null);
  });

  it('preserves mission failure degraded contract through bff mission route in production', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Production LLM outage')
    );

    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
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
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(response.body.details).toEqual({
      degraded: true,
      degradedReason: 'Production LLM outage',
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      state: 'DEGRADED_NO_LLM'
    });
    expect(conductor.enterGlobalDegradedNoLlm).toHaveBeenCalledWith('Production LLM outage');
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Production LLM outage'
    );
    expect(threadAccessRegistry.checkWriteAccess).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
  });

  it('preserves mission runtime telemetry and x-trace-id precedence on degraded bff mission errors', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Production LLM outage with route context', {
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
      .set('x-trace-id', '99999999-9999-4999-8999-999999999999')
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
    expect(response.body.traceId).toBe('99999999-9999-4999-8999-999999999999');
    expect(response.body.details).toEqual({
      degraded: true,
      degradedReason: 'Production LLM outage with route context',
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
      'Production LLM outage with route context'
    );
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Production LLM outage with route context'
    );
  });

  it('requires an agent api key for mission writes on bff route in production', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
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

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('BFF_ERR_AGENT_API_KEY_REQUIRED');
    expect(response.body.message).toBe('Agent API key is required for this request.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('44444444-4444-4444-8444-444444444444');
    expect(threadAccessRegistry.checkWriteAccess).not.toHaveBeenCalled();
    expect(conductor.createThread).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff mission routes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
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

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.checkWriteAccess).not.toHaveBeenCalled();
    expect(conductor.createThread).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff cycle-events writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/cycle-events')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '44444444-4444-4444-8444-444444444444',
        authorAgentId: 'did:key:zAgent',
        eventType: 'seat_taken',
        attestation: ['did:example:counselor-1'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'sig:dispatch',
        payload: {
          objective: 'Analyze options',
          cycleEventType: 'seat_taken'
        }
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.checkWriteAccess).not.toHaveBeenCalled();
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff did upsert writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/dids')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        did: 'did:key:zAlpha',
        label: 'Alpha'
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(didRegistry.register).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff invite create writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        label: 'Launch cohort',
        purpose: 'Invite early testers',
        maxUses: 10,
        expiresInMinutes: 60
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.createInvite).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff invite accept writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/invites/invite-code-abc/accept')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.acceptInvite).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff invite revoke writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites/invite-code-abc/revoke')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({ reason: 'test' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.revokeInvite).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff member remove writes', async () => {
    const response = await request
      .delete('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members/beta')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.removeMember).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff ack writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/ack')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        actorDid: 'did:key:zAckActor',
        targetMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        traceId: '44444444-4444-4444-8444-444444444444',
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:ack'
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.checkWriteAccess).not.toHaveBeenCalled();
    expect(conductor.acknowledgeEntry).not.toHaveBeenCalled();
  });

  it('propagates TG_AUTH_INVALID with x-trace-id on bff DID upsert writes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/dids')
      .set('authorization', 'tma invalid-init-data')
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        did: 'did:key:zAlpha',
        label: 'Alpha'
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_INVALID');
    expect(response.body.message).toBe('Invalid Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(didRegistry.register).not.toHaveBeenCalled();
  });

  it('rejects invalid agent api key for mission writes on bff route in production', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'invalid-agent-key')
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

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('BFF_ERR_AGENT_API_KEY_INVALID');
    expect(response.body.message).toBe('Agent API key is invalid.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('44444444-4444-4444-8444-444444444444');
    expect(threadAccessRegistry.checkWriteAccess).not.toHaveBeenCalled();
    expect(conductor.createThread).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
  });

  it('uses x-trace-id header precedence over body traceId on mission auth errors', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'invalid-agent-key')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
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

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('BFF_ERR_AGENT_API_KEY_INVALID');
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.checkWriteAccess).not.toHaveBeenCalled();
    expect(conductor.createThread).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
  });

  it('preserves mission schema rejection contract through bff mission route', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/missions')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        traceId: '44444444-4444-4444-8444-444444444444'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid mission dispatch payload.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('44444444-4444-4444-8444-444444444444');
    expect(response.body.details).toBeTruthy();
    expect(conductor.createThread).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
  });

  it('uses x-trace-id header precedence over body traceId on bff ack schema errors', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/ack')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        actorDid: 'did:key:zTestDid',
        traceId: '44444444-4444-4444-8444-444444444444',
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['did:example:counselor-1'],
        agentSignature: 'sig:ack'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid ACK payload.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(threadAccessRegistry.checkWriteAccess).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
    expect(conductor.acknowledgeEntry).not.toHaveBeenCalled();
  });

  it('propagates x-trace-id header on bff replay thread-not-found errors', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/threads/99999999-9999-4999-8999-999999999999/replay')
      .set('authorization', `tma ${initData}`)
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SPHERE_ERR_THREAD_NOT_FOUND');
    expect(response.body.message).toBe('Thread not found.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(conductor.getThreadReplay).not.toHaveBeenCalled();
  });

  it('propagates x-trace-id header on bff stream telegram-auth errors', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/stream')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_MISSING');
    expect(response.body.message).toBe('Missing Telegram init data.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('propagates x-trace-id header on bff stream thread-not-found errors', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/threads/99999999-9999-4999-8999-999999999999/stream')
      .set('authorization', `tma ${initData}`)
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SPHERE_ERR_THREAD_NOT_FOUND');
    expect(response.body.message).toBe('Thread not found.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(conductor.getThreadReplay).not.toHaveBeenCalled();
  });
});
