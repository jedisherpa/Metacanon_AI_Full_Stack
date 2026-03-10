import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    METACANON_CONTROL_API_KEY: '',
    RUNTIME_ENV: 'local',
    MISSION_STUB_FALLBACK_ENABLED: 'true',
    HYBRID_EXEC_TIMEOUT_MS: '12000',
    ...overrides
  });
}

async function buildTestApp(
  overrides: Record<string, string> = {},
  bridgeCommands?: Record<string, (...args: unknown[]) => unknown>
): Promise<express.Express> {
  vi.resetModules();
  applyBaseEnv(overrides);

  const runtimeRoutes = await import('./runtimeRoutes.js');
  const app = express();
  app.use(express.json());
  app.use(
    runtimeRoutes.createRuntimeRoutes(
      bridgeCommands
        ? { bridgeCommands: bridgeCommands as never, bridgeModulePath: 'runtime-test-bridge' }
        : undefined
    )
  );

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

  it('uses injected bridge commands when provided', async () => {
    const app = await buildTestApp(
      {},
      {
        getComputeOptions: () => [{ provider_id: 'bridge_provider', selected_global: true }],
        setGlobalComputeProvider: (providerId: unknown) => ({ ok: true, provider_id: providerId }),
        setProviderPriority: (priority: unknown) => ({ ok: true, cloud_provider_priority: priority }),
        updateProviderConfig: (providerId: unknown, config: unknown) => ({
          ok: true,
          provider_id: providerId,
          config
        }),
        invokeGenesisRite: () => ({ ok: true, genesis_hash: 'bridge-hash' }),
        validateAction: () => true,
        createTaskSubSphere: () => ({ sub_sphere_id: 'bridge-sphere', status: 'active' }),
        getSubSphereList: () => [],
        getSubSphereStatus: () => ({ sub_sphere_id: 'bridge-sphere', status: 'active' }),
        pauseSubSphere: () => ({ ok: true }),
        dissolveSubSphere: () => ({ ok: true }),
        submitSubSphereQuery: () => ({ ok: true, provider_id: 'bridge_provider' }),
        updateTelegramIntegration: () => ({ ok: true }),
        updateDiscordIntegration: () => ({ ok: true }),
        bindAgentCommunicationRoute: () => ({ ok: true }),
        bindSubSpherePrismRoute: () => ({ ok: true }),
        sendAgentMessage: () => ({ ok: true }),
        sendSubSpherePrismMessage: () => ({ ok: true }),
        getCommunicationStatus: () => ({ ok: true, agent_bindings: [] })
      }
    );

    const health = await request(app).get('/api/v1/runtime/healthz');
    expect(health.status).toBe(200);
    expect(health.body.bridge_mode).toBe('ffi');
    expect(health.body.commands_module_path).toBe('runtime-test-bridge');

    const options = await request(app).get('/api/v1/runtime/compute/options');
    expect(options.status).toBe(200);
    expect(options.body[0].provider_id).toBe('bridge_provider');

    const provider = await request(app)
      .post('/api/v1/runtime/compute/global-provider')
      .send({ provider_id: 'qwen_local' });
    expect(provider.status).toBe(200);
    expect(provider.body.ok).toBe(true);
    expect(provider.body.provider_id).toBe('qwen_local');
  });

  it('loads bridge commands from explicit module path when enabled', async () => {
    const bridgeModulePath = path.join(
      os.tmpdir(),
      `runtime-bridge-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`
    );

    fs.writeFileSync(
      bridgeModulePath,
      [
        'module.exports = {',
        '  createInstallerWebappCommands() {',
        '    return {',
        "      getComputeOptions: () => [{ provider_id: 'disk_bridge', selected_global: true }],",
        '      setGlobalComputeProvider: (providerId) => ({ ok: true, provider_id: providerId }),',
        '      setProviderPriority: (priority) => ({ ok: true, cloud_provider_priority: priority }),',
        '      updateProviderConfig: (providerId, config) => ({ ok: true, provider_id: providerId, config }),',
        "      invokeGenesisRite: () => ({ ok: true, genesis_hash: 'disk-bridge-hash' }),",
        '      validateAction: () => true,',
        "      createTaskSubSphere: () => ({ sub_sphere_id: 'disk-bridge-sphere', status: 'active' }),",
        '      getSubSphereList: () => [],',
        "      getSubSphereStatus: () => ({ sub_sphere_id: 'disk-bridge-sphere', status: 'active' }),",
        '      pauseSubSphere: () => ({ ok: true }),',
        '      dissolveSubSphere: () => ({ ok: true }),',
        "      submitSubSphereQuery: () => ({ ok: true, provider_id: 'disk_bridge' }),",
        '      updateTelegramIntegration: () => ({ ok: true }),',
        '      updateDiscordIntegration: () => ({ ok: true }),',
        '      bindAgentCommunicationRoute: () => ({ ok: true }),',
        '      bindSubSpherePrismRoute: () => ({ ok: true }),',
        '      sendAgentMessage: () => ({ ok: true }),',
        '      sendSubSpherePrismMessage: () => ({ ok: true }),',
        '      getCommunicationStatus: () => ({ ok: true, agent_bindings: [] })',
        '    };',
        '  }',
        '};',
        ''
      ].join('\n'),
      'utf8'
    );

    try {
      const app = await buildTestApp({
        METACANON_RUNTIME_BRIDGE_ENABLED: 'true',
        METACANON_RUNTIME_BRIDGE_MODULE: bridgeModulePath
      });

      const health = await request(app).get('/api/v1/runtime/healthz');
      expect(health.status).toBe(200);
      expect(health.body.bridge_mode).toBe('ffi');
      expect(health.body.commands_module_path).toBe(bridgeModulePath);

      const options = await request(app).get('/api/v1/runtime/compute/options');
      expect(options.status).toBe(200);
      expect(options.body[0].provider_id).toBe('disk_bridge');
    } finally {
      if (fs.existsSync(bridgeModulePath)) {
        fs.unlinkSync(bridgeModulePath);
      }
    }
  });
});
