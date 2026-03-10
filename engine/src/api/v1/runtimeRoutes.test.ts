import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

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

async function buildTestApp(overrides: Record<string, string> = {}): Promise<express.Express> {
  vi.resetModules();
  applyBaseEnv(overrides);

  const runtimeRoutes = await import('./runtimeRoutes.js');
  const app = express();
  app.use(express.json());
  app.use(runtimeRoutes.createRuntimeRoutes());

  return app;
}

describe('runtimeRoutes', () => {
  it('exposes runtime health and compute options defaults', async () => {
    const app = await buildTestApp();

    const health = await request(app).get('/api/v1/runtime/healthz');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.bridge_ready).toBe(true);

    const computeOptions = await request(app).get('/api/v1/runtime/compute/options');
    expect(computeOptions.status).toBe(200);
    expect(Array.isArray(computeOptions.body)).toBe(true);
    expect(computeOptions.body.some((entry: { provider_id?: string; selected_global?: boolean }) =>
      entry.provider_id === 'qwen_local' && entry.selected_global
    )).toBe(true);
  });

  it('supports sub-sphere lifecycle through runtime routes', async () => {
    const app = await buildTestApp();

    const created = await request(app).post('/api/v1/runtime/sub-spheres').send({
      name: 'Research Pod',
      objective: 'Collect references',
      hitl_required: true
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('active');

    const subSphereId = created.body.sub_sphere_id as string;
    const paused = await request(app).post(`/api/v1/runtime/sub-spheres/${subSphereId}/pause`).send({});
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe('paused');

    const query = await request(app).post(`/api/v1/runtime/sub-spheres/${subSphereId}/query`).send({
      query: 'summarize risks'
    });
    expect(query.status).toBe(409);
    expect(query.body.code).toBe('RUNTIME_SUB_SPHERE_NOT_ACTIVE');
  });

  it('enforces x-metacanon-key when control key is configured', async () => {
    const app = await buildTestApp({ METACANON_CONTROL_API_KEY: 'runtime-secret' });

    const unauthorized = await request(app).get('/api/v1/runtime/healthz');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.code).toBe('RUNTIME_AUTH_REQUIRED');

    const authorized = await request(app)
      .get('/api/v1/runtime/healthz')
      .set('x-metacanon-key', 'runtime-secret');
    expect(authorized.status).toBe(200);
  });
});
