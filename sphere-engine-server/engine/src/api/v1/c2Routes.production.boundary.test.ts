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
  process.env.SPHERE_SIGNATURE_VERIFICATION = process.env.SPHERE_SIGNATURE_VERIFICATION || 'strict';
  process.env.RUNTIME_ENV = 'production';
  process.env.MISSION_STUB_FALLBACK_ENABLED = 'false';
}

describe('createSphereRoutes production degraded behavior', () => {
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

  beforeAll(async () => {
    vi.resetModules();
    setProductionEnv();
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const routesMod = await import('./c2Routes.js');
    const missionServiceMod = await import('../../agents/missionService.js');

    token = process.env.SPHERE_BFF_SERVICE_TOKEN as string;
    generateMissionReport = missionServiceMod.generateMissionReport as Mock;
    MissionServiceError = missionServiceMod.MissionServiceError as new (
      code: string,
      message: string,
      details?: Record<string, unknown>
    ) => Error;

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

    app = expressMod.default();
    app.use(expressMod.default.json());
    app.use(
      routesMod.createSphereRoutes({
        conductor: conductor as any,
        didRegistry: didRegistry as any,
        includeLegacyAlias: true
      })
    );
    request = supertestMod.default(app);
  });

  beforeEach(() => {
    generateMissionReport.mockReset();
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

    conductor.getSystemState.mockReturnValue('ACTIVE');
    conductor.getDegradedNoLlmReason.mockReturnValue(null);
    conductor.getThreadAcks.mockResolvedValue({ acks: [], nextCursor: 0 });
    conductor.markThreadDegradedNoLlm.mockResolvedValue({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'did:key:zAgent',
      state: 'DEGRADED_NO_LLM',
      entries: []
    });
  });

  it('invokes global degraded hook when mission service fails in production', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Production LLM outage')
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

    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
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
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(conductor.enterGlobalDegradedNoLlm).toHaveBeenCalledWith('Production LLM outage');
    expect(conductor.markThreadDegradedNoLlm).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Production LLM outage'
    );
  });

  it('short-circuits mission dispatch when system is already DEGRADED_NO_LLM', async () => {
    conductor.getSystemState.mockReturnValueOnce('DEGRADED_NO_LLM');
    conductor.getDegradedNoLlmReason.mockReturnValueOnce('Pre-existing production outage');
    conductor.createThread.mockResolvedValueOnce({
      threadId: '11111111-1111-4111-8111-111111111111',
      missionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });
    conductor.getThread.mockResolvedValueOnce({
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
    expect(response.body.code).toBe('DEGRADED_NO_LLM');
    expect(response.body.message).toBe(
      'Model-dependent mission execution is blocked while LLM is unavailable.'
    );
    expect(response.body.retryable).toBe(true);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
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
  });

  it('uses x-trace-id header precedence over body traceId on mission schema errors', async () => {
    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555')
      .send({
        threadId: '11111111-1111-4111-8111-111111111111',
        traceId: '44444444-4444-4444-8444-444444444444'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.message).toBe('Invalid mission dispatch payload.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(conductor.createThread).not.toHaveBeenCalled();
    expect(generateMissionReport).not.toHaveBeenCalled();
  });

  it('uses x-trace-id header precedence over body traceId on ack schema errors', async () => {
    const response = await request
      .post('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/ack')
      .set('authorization', `Bearer ${token}`)
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
    expect(conductor.acknowledgeEntry).not.toHaveBeenCalled();
  });

  it('propagates x-trace-id header on replay thread-not-found errors', async () => {
    const response = await request
      .get('/api/v1/sphere/threads/99999999-9999-4999-8999-999999999999/replay')
      .set('authorization', `Bearer ${token}`)
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SPHERE_ERR_THREAD_NOT_FOUND');
    expect(response.body.message).toBe('Thread not found.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(conductor.getThreadReplay).not.toHaveBeenCalled();
  });

  it('propagates x-trace-id header on stream auth-required errors', async () => {
    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/stream')
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SPHERE_ERR_AUTH_REQUIRED');
    expect(response.body.message).toBe('Sphere service token is required.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('propagates x-trace-id header on stream thread-not-found errors', async () => {
    const response = await request
      .get('/api/v1/sphere/threads/99999999-9999-4999-8999-999999999999/stream')
      .set('authorization', `Bearer ${token}`)
      .set('x-trace-id', '55555555-5555-4555-8555-555555555555');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SPHERE_ERR_THREAD_NOT_FOUND');
    expect(response.body.message).toBe('Thread not found.');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('55555555-5555-4555-8555-555555555555');
  });
});
