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
  process.env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES =
    process.env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES || 'true';
  process.env.SPHERE_BFF_AGENT_API_KEYS =
    process.env.SPHERE_BFF_AGENT_API_KEYS || 'alpha=test-agent-key-123456';
  process.env.SPHERE_SIGNATURE_VERIFICATION = process.env.SPHERE_SIGNATURE_VERIFICATION || 'did_key';
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

describe('createSphereBffRoutes', () => {
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
  let ThreadAccessErrorCtor: new (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) => Error;

  beforeAll(async () => {
    setEnv();
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const routesMod = await import('./c2Routes.js');
    const bffRoutesMod = await import('./sphereBffRoutes.js');
    const threadAccessMod = await import('../../sphere/threadAccessRegistry.js');
    const missionServiceMod = await import('../../agents/missionService.js');
    ThreadAccessErrorCtor = threadAccessMod.ThreadAccessError;
    generateMissionReport = missionServiceMod.generateMissionReport as Mock;
    MissionServiceError = missionServiceMod.MissionServiceError as new (
      code: string,
      message: string,
      details?: Record<string, unknown>
    ) => Error;

    initData = buildInitData(process.env.TELEGRAM_BOT_TOKEN as string);

    didRegistry = {
      register: vi.fn(),
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
      grantMembership: vi.fn(async () => ({
        threadId: '11111111-1111-4111-8111-111111111111',
        principal: 'alpha',
        role: 'owner',
        joinedAt: '2026-01-01T00:00:00.000Z'
      })),
      createInvite: vi.fn(async () => ({
        inviteCode: 'invite-code-abc',
        threadId: '11111111-1111-4111-8111-111111111111',
        createdBy: 'alpha',
        label: 'Launch cohort',
        purpose: 'Invite early testers',
        maxUses: 25,
        usedCount: 0,
        remainingUses: 25,
        createdAt: '2026-01-01T00:00:00.000Z'
      })),
      acceptInvite: vi.fn(async () => ({
        inviteCode: 'invite-code-abc',
        threadId: '11111111-1111-4111-8111-111111111111',
        principal: 'alpha',
        role: 'member',
        acceptedAt: '2026-01-01T00:00:00.000Z',
        remainingUses: 24
      })),
      listMembers: vi.fn(async () => [
        {
          threadId: '11111111-1111-4111-8111-111111111111',
          principal: 'alpha',
          role: 'owner',
          joinedAt: '2026-01-01T00:00:00.000Z'
        }
      ]),
      listInvites: vi.fn(async () => [
        {
          inviteCode: 'invite-code-abc',
          threadId: '11111111-1111-4111-8111-111111111111',
          createdBy: 'alpha',
          label: 'Launch cohort',
          purpose: 'Invite early testers',
          maxUses: 25,
          usedCount: 1,
          remainingUses: 24,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]),
      revokeInvite: vi.fn(async () => ({
        inviteCode: 'invite-code-abc',
        threadId: '11111111-1111-4111-8111-111111111111',
        createdBy: 'alpha',
        label: 'Launch cohort',
        purpose: 'Invite early testers',
        maxUses: 25,
        usedCount: 1,
        remainingUses: 24,
        revokedAt: '2026-01-02T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z'
      })),
      removeMember: vi.fn(async () => ({
        threadId: '11111111-1111-4111-8111-111111111111',
        principal: 'beta',
        role: 'member',
        removedAt: '2026-01-02T00:00:00.000Z'
      }))
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
    generateMissionReport.mockResolvedValue({
      summary: 'ok',
      keyFindings: ['finding'],
      risks: ['risk'],
      recommendedActions: ['action'],
      provider: 'auto',
      usageMetering: {
        route: 'internal',
        adapter: 'internal_llm_router',
        provider: 'morpheus',
        model: 'test-model',
        timeoutMs: 12000,
        latencyMs: 20,
        attempts: 1,
        fallbackUsed: false
      },
      degraded: false
    });
    conductor.listThreads.mockReset();
    conductor.getSystemState.mockReset();
    conductor.getDegradedNoLlmReason.mockReset();
    conductor.dispatchIntent.mockReset();
    conductor.createThread.mockReset();
    conductor.getThread.mockReset();
    didRegistry.register.mockReset();
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
    threadAccessRegistry.grantMembership.mockReset();
    threadAccessRegistry.createInvite.mockReset();
    threadAccessRegistry.acceptInvite.mockReset();
    threadAccessRegistry.listMembers.mockReset();
    threadAccessRegistry.listInvites.mockReset();
    threadAccessRegistry.revokeInvite.mockReset();
    threadAccessRegistry.removeMember.mockReset();
    conductor.listThreads.mockResolvedValue([]);
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
    conductor.getThreadAcks.mockResolvedValue({ acks: [], nextCursor: 0 });
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
    didRegistry.register.mockResolvedValue({
      did: 'did:key:zAlpha',
      label: 'Alpha',
      publicKey: null
    });
    threadAccessRegistry.checkWriteAccess.mockResolvedValue({ allowed: true, bootstrap: false });
    threadAccessRegistry.getMembership.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00.000Z'
    });
    threadAccessRegistry.grantMembership.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00.000Z'
    });
    threadAccessRegistry.createInvite.mockResolvedValue({
      inviteCode: 'invite-code-abc',
      threadId: '11111111-1111-4111-8111-111111111111',
      createdBy: 'alpha',
      label: 'Launch cohort',
      purpose: 'Invite early testers',
      maxUses: 25,
      usedCount: 0,
      remainingUses: 25,
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    threadAccessRegistry.acceptInvite.mockResolvedValue({
      inviteCode: 'invite-code-abc',
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha',
      role: 'member',
      acceptedAt: '2026-01-01T00:00:00.000Z',
      remainingUses: 24
    });
    threadAccessRegistry.listMembers.mockResolvedValue([
      {
        threadId: '11111111-1111-4111-8111-111111111111',
        principal: 'alpha',
        role: 'owner',
        joinedAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    threadAccessRegistry.listInvites.mockResolvedValue([
      {
        inviteCode: 'invite-code-abc',
        threadId: '11111111-1111-4111-8111-111111111111',
        createdBy: 'alpha',
        label: 'Launch cohort',
        purpose: 'Invite early testers',
        maxUses: 25,
        usedCount: 1,
        remainingUses: 24,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    threadAccessRegistry.revokeInvite.mockResolvedValue({
      inviteCode: 'invite-code-abc',
      threadId: '11111111-1111-4111-8111-111111111111',
      createdBy: 'alpha',
      label: 'Launch cohort',
      purpose: 'Invite early testers',
      maxUses: 25,
      usedCount: 1,
      remainingUses: 24,
      revokedAt: '2026-01-02T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    threadAccessRegistry.removeMember.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'beta',
      role: 'member',
      removedAt: '2026-01-02T00:00:00.000Z'
    });
  });

  it('proxies bff capabilities using Telegram auth and injects service principal', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/capabilities')
      .set('authorization', `tma ${initData}`);

    expect(response.status).toBe(200);
    expect(response.body.auth?.principal).toBe('bff-service');
    expect(response.body.auth?.acceptsDirectTmaAuth).toBe(false);
    expect(response.body.surface?.canonicalBase).toBe('/api/v1/sphere');
  });

  it('proxies bff status request through canonical sphere route', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/status')
      .set('authorization', `tma ${initData}`);

    expect(response.status).toBe(200);
    expect(response.body.systemState).toBe('ACTIVE');
    expect(response.body.threadCount).toBe(0);
    expect(conductor.listThreads).toHaveBeenCalledTimes(1);
  });

  it('rejects missing Telegram auth on bff surface', async () => {
    const response = await request.get('/api/v1/bff/sphere/status');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TG_AUTH_MISSING');
    expect(conductor.listThreads).not.toHaveBeenCalled();
  });

  it('keeps direct tma calls forbidden on canonical sphere surface', async () => {
    const response = await request
      .get('/api/v1/sphere/status')
      .set('authorization', `tma ${initData}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SPHERE_ERR_TMA_DIRECT_FORBIDDEN');
    expect(conductor.listThreads).not.toHaveBeenCalled();
  });

  it('requires an agent API key for bff write routes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/dids')
      .set('authorization', `tma ${initData}`)
      .send({
        did: 'did:key:zAlpha'
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('BFF_ERR_AGENT_API_KEY_REQUIRED');
    expect(didRegistry.register).not.toHaveBeenCalled();
  });

  it('rejects invalid agent API key for bff write routes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/dids')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'invalid-agent-key')
      .send({
        did: 'did:key:zAlpha'
      });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('BFF_ERR_AGENT_API_KEY_INVALID');
    expect(didRegistry.register).not.toHaveBeenCalled();
  });

  it('accepts valid agent API key for bff write routes', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/dids')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        did: 'did:key:zAlpha'
      });

    expect(response.status).toBe(201);
    expect(response.body.did?.did).toBe('did:key:zAlpha');
    expect(response.headers['x-sphere-agent-principal']).toBe('alpha');
    expect(didRegistry.register).toHaveBeenCalledTimes(1);
  });

  it('rejects thread write when principal is not a member', async () => {
    threadAccessRegistry.checkWriteAccess.mockResolvedValueOnce({
      allowed: false,
      bootstrap: false
    });

    const response = await request
      .post('/api/v1/bff/sphere/cycle-events')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:key:zAlpha',
        eventType: 'seat_taken',
        attestation: [],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'a.b.c',
        payload: {
          objective: 'Test cycle objective',
          cycleEventType: 'seat_taken'
        }
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('BFF_ERR_THREAD_ACCESS_DENIED');
    expect(conductor.dispatchIntent).not.toHaveBeenCalled();
  });

  it('bootstraps owner membership on first successful thread write', async () => {
    threadAccessRegistry.checkWriteAccess.mockResolvedValueOnce({
      allowed: true,
      bootstrap: true
    });

    const response = await request
      .post('/api/v1/bff/sphere/cycle-events')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        messageId: '22222222-2222-4222-8222-222222222222',
        traceId: '33333333-3333-4333-8333-333333333333',
        authorAgentId: 'did:key:zAlpha',
        eventType: 'seat_taken',
        attestation: [],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'a.b.c',
        payload: {
          objective: 'Test cycle objective',
          cycleEventType: 'seat_taken'
        }
      });

    expect(response.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(threadAccessRegistry.grantMembership).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha',
      role: 'owner'
    });
  });

  it('proxies degraded mission short-circuit contract through bff surface', async () => {
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
  });

  it('proxies mission-service failure contract through bff surface', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Upstream mission service outage')
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
      degradedReason: 'Upstream mission service outage',
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      state: 'DEGRADED_NO_LLM'
    });
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Upstream mission service outage'
    );
    expect(conductor.dispatchIntent).toHaveBeenCalledTimes(1);
  });

  it('creates thread invite through bff membership endpoint', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({
        label: 'Launch cohort',
        purpose: 'Invite early testers',
        maxUses: 10,
        expiresInMinutes: 60
      });

    expect(response.status).toBe(201);
    expect(response.body.invite?.inviteCode).toBe('invite-code-abc');
    expect(response.body.invite?.label).toBe('Launch cohort');
    expect(response.body.invite?.purpose).toBe('Invite early testers');
    expect(response.body.startParam).toBe('cycle_invite_invite-code-abc');
    expect(threadAccessRegistry.createInvite).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha',
      label: 'Launch cohort',
      purpose: 'Invite early testers',
      maxUses: 10,
      expiresInMinutes: 60
    });
  });

  it('accepts thread invite through bff membership endpoint', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/invites/invite-code-abc/accept')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(201);
    expect(response.body.acceptance?.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.acceptance?.principal).toBe('alpha');
    expect(threadAccessRegistry.acceptInvite).toHaveBeenCalledWith({
      inviteCode: 'invite-code-abc',
      principal: 'alpha'
    });
  });

  it('lists thread members through bff membership endpoint', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members?limit=50')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(200);
    expect(response.body.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.principal).toBe('alpha');
    expect(response.body.requestPrincipal).toBe('alpha');
    expect(response.body.requestRole).toBe('owner');
    expect(response.body.count).toBe(1);
    expect(threadAccessRegistry.checkWriteAccess).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
    expect(threadAccessRegistry.getMembership).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'alpha'
    );
    expect(threadAccessRegistry.listMembers).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      50
    );
  });

  it('lists thread members with null requestRole when membership lookup misses', async () => {
    threadAccessRegistry.getMembership.mockResolvedValueOnce(null);

    const response = await request
      .get('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members?limit=25')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(200);
    expect(response.body.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.requestPrincipal).toBe('alpha');
    expect(response.body.requestRole).toBeNull();
    expect(response.body.count).toBe(1);
  });

  it('lists thread invites through bff membership endpoint', async () => {
    const response = await request
      .get('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites?limit=25&includeRevoked=true')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(200);
    expect(response.body.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.requestPrincipal).toBe('alpha');
    expect(response.body.requestRole).toBe('owner');
    expect(response.body.count).toBe(1);
    expect(threadAccessRegistry.checkWriteAccess).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
    expect(threadAccessRegistry.getMembership).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'alpha'
    );
    expect(threadAccessRegistry.listInvites).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { limit: 25, includeRevoked: true }
    );
  });

  it('lists thread invites with null requestRole when membership lookup misses', async () => {
    threadAccessRegistry.getMembership.mockResolvedValueOnce(null);

    const response = await request
      .get('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites?limit=10')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(200);
    expect(response.body.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.requestPrincipal).toBe('alpha');
    expect(response.body.requestRole).toBeNull();
    expect(response.body.count).toBe(1);
  });

  it('revokes thread invite through bff membership endpoint', async () => {
    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites/invite-code-abc/revoke')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456')
      .send({ reason: 'Membership rotation' });

    expect(response.status).toBe(200);
    expect(response.body.invite?.inviteCode).toBe('invite-code-abc');
    expect(response.body.invite?.revokedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(threadAccessRegistry.revokeInvite).toHaveBeenCalledWith({
      inviteCode: 'invite-code-abc',
      principal: 'alpha',
      reason: 'Membership rotation'
    });
  });

  it('returns stable owner-required contract when invite revoke is denied', async () => {
    threadAccessRegistry.revokeInvite.mockRejectedValueOnce(
      new ThreadAccessErrorCtor(
        403,
        'BFF_ERR_OWNER_REQUIRED',
        'Only thread owner or invite creator can revoke this invite.',
        {
          threadId: '11111111-1111-4111-8111-111111111111',
          principal: 'alpha'
        }
      )
    );

    const response = await request
      .post('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/invites/invite-code-abc/revoke')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('BFF_ERR_OWNER_REQUIRED');
    expect(response.body.message).toBe('Only thread owner or invite creator can revoke this invite.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.details).toEqual({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
    expect(typeof response.body.traceId).toBe('string');
  });

  it('removes thread member through bff membership endpoint', async () => {
    const response = await request
      .delete('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members/beta')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(200);
    expect(response.body.removal?.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.removal?.principal).toBe('beta');
    expect(threadAccessRegistry.removeMember).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      actorPrincipal: 'alpha',
      memberPrincipal: 'beta'
    });
  });

  it('returns stable owner-required contract when member removal is denied', async () => {
    threadAccessRegistry.removeMember.mockRejectedValueOnce(
      new ThreadAccessErrorCtor(403, 'BFF_ERR_OWNER_REQUIRED', 'Only thread owner can remove members.', {
        threadId: '11111111-1111-4111-8111-111111111111',
        principal: 'alpha'
      })
    );

    const response = await request
      .delete('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members/beta')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('BFF_ERR_OWNER_REQUIRED');
    expect(response.body.message).toBe('Only thread owner can remove members.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.details).toEqual({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
    expect(typeof response.body.traceId).toBe('string');
  });

  it('returns stable owner self-remove forbidden contract when actor targets self', async () => {
    threadAccessRegistry.removeMember.mockRejectedValueOnce(
      new ThreadAccessErrorCtor(
        409,
        'BFF_ERR_OWNER_SELF_REMOVE_FORBIDDEN',
        'Owner cannot remove themselves from thread membership.',
        {
          threadId: '11111111-1111-4111-8111-111111111111',
          principal: 'alpha'
        }
      )
    );

    const response = await request
      .delete('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members/alpha')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BFF_ERR_OWNER_SELF_REMOVE_FORBIDDEN');
    expect(response.body.message).toBe('Owner cannot remove themselves from thread membership.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.details).toEqual({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'alpha'
    });
    expect(typeof response.body.traceId).toBe('string');
  });

  it('returns stable owner-target remove forbidden contract when target is owner', async () => {
    threadAccessRegistry.removeMember.mockRejectedValueOnce(
      new ThreadAccessErrorCtor(
        409,
        'BFF_ERR_OWNER_REMOVE_FORBIDDEN',
        'Owner membership cannot be removed directly.',
        {
          threadId: '11111111-1111-4111-8111-111111111111',
          principal: 'beta'
        }
      )
    );

    const response = await request
      .delete('/api/v1/bff/sphere/threads/11111111-1111-4111-8111-111111111111/members/beta')
      .set('authorization', `tma ${initData}`)
      .set('x-agent-api-key', 'test-agent-key-123456');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BFF_ERR_OWNER_REMOVE_FORBIDDEN');
    expect(response.body.message).toBe('Owner membership cannot be removed directly.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.details).toEqual({
      threadId: '11111111-1111-4111-8111-111111111111',
      principal: 'beta'
    });
    expect(typeof response.body.traceId).toBe('string');
  });
});
