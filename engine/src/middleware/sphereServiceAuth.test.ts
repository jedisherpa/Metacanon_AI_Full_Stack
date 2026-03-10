import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describe('sphereServiceAuthMiddleware', () => {
  let app: any;
  let request: any;
  let token: string;

  beforeAll(async () => {
    setEnv();
    const expressMod = await import('express');
    const supertestMod = await import('supertest');
    const middlewareMod = await import('./sphereServiceAuth.js');

    token = process.env.SPHERE_BFF_SERVICE_TOKEN as string;
    app = expressMod.default();
    app.use(expressMod.default.json());
    app.get('/protected', middlewareMod.sphereServiceAuthMiddleware, (req: any, res: any) => {
      res.json({
        ok: true,
        principal: req.spherePrincipal ?? null
      });
    });
    request = supertestMod.default(app);
  });

  beforeEach(() => {
    expect(token.length).toBeGreaterThanOrEqual(16);
  });

  it('rejects direct TMA authorization', async () => {
    const response = await request
      .get('/protected')
      .set('authorization', 'tma some-telegram-init-data')
      .set('x-trace-id', '11111111-1111-4111-8111-111111111111');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SPHERE_ERR_TMA_DIRECT_FORBIDDEN');
    expect(response.body.retryable).toBe(false);
    expect(response.body.traceId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects missing service token', async () => {
    const response = await request.get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SPHERE_ERR_AUTH_REQUIRED');
    expect(response.body.retryable).toBe(false);
    expect(typeof response.body.traceId).toBe('string');
    expect(response.body.traceId.length).toBeGreaterThan(0);
  });

  it('rejects invalid bearer token', async () => {
    const response = await request.get('/protected').set('authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SPHERE_ERR_AUTH_INVALID');
  });

  it('accepts valid bearer token', async () => {
    const response = await request.get('/protected').set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.principal).toBe('bff-service');
  });

  it('accepts lowercase bearer scheme', async () => {
    const response = await request.get('/protected').set('authorization', `bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.principal).toBe('bff-service');
  });

  it('accepts valid x-sphere-service-token header', async () => {
    const response = await request.get('/protected').set('x-sphere-service-token', token);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.principal).toBe('bff-service');
  });
});
