import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../agents/missionService.js', () => {
  class MissionServiceError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    MissionServiceError,
    generateMissionReport: vi.fn()
  };
});

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
}

describe('createC2StandaloneRoutes', () => {
  let app: any;
  let request: any;
  let token: string;
  let generateMissionReport: Mock;
  let MissionServiceError: new (code: string, message: string) => Error;

  beforeAll(async () => {
    setEnv();
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const standaloneRoutesMod = await import('./c2StandaloneRoutes.js');
    const missionServiceMod = await import('../../agents/missionService.js');

    token = process.env.SPHERE_BFF_SERVICE_TOKEN as string;
    generateMissionReport = missionServiceMod.generateMissionReport as Mock;
    MissionServiceError = missionServiceMod.MissionServiceError as new (code: string, message: string) => Error;

    app = expressMod.default();
    app.use(expressMod.default.json());
    app.use(standaloneRoutesMod.createC2StandaloneRoutes());
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
  });

  it('returns SPHERE_DISABLED status on canonical sphere endpoint', async () => {
    const response = await request.get('/api/v1/sphere/status').set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.systemState).toBe('SPHERE_DISABLED');
    expect(response.body.sphereThreadEnabled).toBe(false);
    expect(typeof response.body.traceId).toBe('string');
    expect(response.headers['x-trace-id']).toBe(response.body.traceId);
  });

  it('publishes standalone capabilities on canonical sphere endpoint', async () => {
    const response = await request
      .get('/api/v1/sphere/capabilities')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.sphereThreadEnabled).toBe(false);
    expect(response.body.mode).toBe('standalone_mission');
    expect(response.body.auth?.serviceTokenRequired).toBe(true);
    expect(response.body.auth?.acceptsDirectTmaAuth).toBe(false);
    expect(response.body.surface?.legacyAliasDeprecated).toBe(true);
    expect(response.body.surface?.legacyAliasSuccessorBase).toBe('/api/v1/sphere');
    expect(response.body.features?.missions).toBe(true);
    expect(response.body.features?.dids).toBe(false);
    expect(response.body.features?.ack).toBe(false);
    expect(response.body.features?.lensUpgradeRules).toBe(false);
    expect(response.body.features?.lensProgression).toBe(false);
  });

  it('returns SPHERE_THREAD_DISABLED for lens-upgrade rules in standalone mode', async () => {
    const response = await request
      .get('/api/v1/sphere/lens-upgrade-rules')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SPHERE_THREAD_DISABLED');
    expect(response.body.sphereThreadEnabled).toBe(false);
  });

  it('rejects missing service token in standalone mode', async () => {
    const response = await request.get('/api/v1/sphere/status');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SPHERE_ERR_AUTH_REQUIRED');
  });

  it('does not enforce sphere auth on non-sphere routes in standalone mode', async () => {
    const response = await request.get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('rejects direct TMA auth in standalone mode', async () => {
    const response = await request
      .get('/api/v1/sphere/status')
      .set('authorization', 'tma telegram-init-data');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SPHERE_ERR_TMA_DIRECT_FORBIDDEN');
  });

  it('accepts mission calls on canonical sphere endpoint', async () => {
    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        messageId: '11111111-1111-4111-8111-111111111111',
        traceId: '11111111-1111-4111-8111-111111111112',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['operator-approved'],
        agentSignature: 'sig:agent-1',
        agentDid: 'did:example:agent-1',
        objective: 'Analyze options',
        provider: 'auto'
      });

    expect(response.status).toBe(201);
    expect(response.body.sphereThreadEnabled).toBe(false);
    expect(response.body.state).toBe('ACTIVE');
    expect(Array.isArray(response.body.logEntries)).toBe(true);
    expect(response.body.logEntries).toHaveLength(0);
    expect(generateMissionReport).toHaveBeenCalledTimes(1);
  });

  it('supports legacy c2 alias mission endpoint', async () => {
    const response = await request
      .post('/api/v1/c2/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        messageId: '11111111-1111-4111-8111-111111111121',
        traceId: '11111111-1111-4111-8111-111111111122',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['operator-approved'],
        agentSignature: 'sig:agent-2',
        agentDid: 'did:example:agent-2',
        objective: 'Run analysis',
        provider: 'auto'
      });

    expect(response.status).toBe(201);
    expect(response.body.sphereThreadEnabled).toBe(false);
    expect(response.headers['deprecation']).toBe('true');
    expect(response.headers['x-sphere-canonical-base']).toBe('/api/v1/sphere');
    expect(String(response.headers['link'] ?? '')).toContain('/api/v1/sphere');
  });

  it('can disable legacy alias surface', async () => {
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const standaloneRoutesMod = await import('./c2StandaloneRoutes.js');

    const appWithoutAlias = expressMod.default();
    appWithoutAlias.use(expressMod.default.json());
    appWithoutAlias.use(
      standaloneRoutesMod.createC2StandaloneRoutes({
        includeLegacyAlias: false
      })
    );
    const localRequest = supertestMod.default(appWithoutAlias);

    const capabilities = await localRequest
      .get('/api/v1/sphere/capabilities')
      .set('authorization', `Bearer ${token}`);
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.surface?.legacyAliasBase).toBeNull();
    expect(capabilities.body.surface?.legacyAliasDeprecated).toBe(false);
    expect(capabilities.body.surface?.legacyAliasSuccessorBase).toBeNull();

    const aliasStatus = await localRequest
      .get('/api/v1/c2/status')
      .set('authorization', `Bearer ${token}`);
    expect(aliasStatus.status).toBe(404);
  });

  it('returns normalized validation error for invalid mission payload', async () => {
    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .set('x-trace-id', '22222222-2222-4222-8222-222222222222')
      .send({
        agentDid: 'did:example:agent-3'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPHERE_ERR_INVALID_SCHEMA');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('returns SPHERE_THREAD_DISABLED for thread replay path', async () => {
    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/replay')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SPHERE_THREAD_DISABLED');
    expect(response.body.retryable).toBe(false);
    expect(response.body.sphereThreadEnabled).toBe(false);
  });

  it('returns SPHERE_THREAD_DISABLED for thread lens-progression path', async () => {
    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/lens-progression')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SPHERE_THREAD_DISABLED');
    expect(response.body.sphereThreadEnabled).toBe(false);
  });

  it('returns SPHERE_THREAD_DISABLED for thread ACK observability path', async () => {
    const response = await request
      .get('/api/v1/sphere/threads/11111111-1111-4111-8111-111111111111/acks')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SPHERE_THREAD_DISABLED');
    expect(response.body.retryable).toBe(false);
    expect(response.body.sphereThreadEnabled).toBe(false);
  });

  it('returns SPHERE_THREAD_DISABLED for DID routes', async () => {
    const listResponse = await request
      .get('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${token}`);
    const getResponse = await request
      .get('/api/v1/sphere/dids/did:key:zExample')
      .set('authorization', `Bearer ${token}`);
    const postResponse = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${token}`)
      .send({
        did: 'did:key:zExample'
      });

    for (const response of [listResponse, getResponse, postResponse]) {
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('SPHERE_THREAD_DISABLED');
      expect(response.body.retryable).toBe(false);
      expect(response.body.sphereThreadEnabled).toBe(false);
    }
  });

  it('returns MissionServiceError as normalized retryable failure', async () => {
    generateMissionReport.mockRejectedValueOnce(
      new MissionServiceError('LLM_UNAVAILABLE', 'Provider unreachable')
    );

    const response = await request
      .post('/api/v1/sphere/missions')
      .set('authorization', `Bearer ${token}`)
      .send({
        messageId: '11111111-1111-4111-8111-111111111131',
        traceId: '11111111-1111-4111-8111-111111111132',
        intent: 'DISPATCH_MISSION',
        schemaVersion: '3.0',
        attestation: ['operator-approved'],
        agentSignature: 'sig:agent-4',
        agentDid: 'did:example:agent-4',
        objective: 'Do work',
        provider: 'auto'
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('LLM_UNAVAILABLE');
    expect(response.body.retryable).toBe(true);
    expect(response.body.details?.sphereThreadEnabled).toBe(false);
  });
});
