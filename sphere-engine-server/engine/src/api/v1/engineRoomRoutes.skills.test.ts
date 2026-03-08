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
    TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'true',
    TELEGRAM_AUTH_DEV_BYPASS_USER_ID: '900000001',
    TELEGRAM_AUTH_DEV_BYPASS_FIRST_NAME: 'Local',
    TELEGRAM_AUTH_DEV_BYPASS_USERNAME: 'local_dev',
    MISSION_STUB_FALLBACK_ENABLED: 'true',
    HYBRID_EXEC_TIMEOUT_MS: '12000',
    ...overrides
  });
}

async function buildTestApp(): Promise<{
  app: express.Express;
  SkillRuntime: (typeof import('../../agents/skillRuntime.js'))['SkillRuntime'];
  createAgentConfig: (typeof import('../../agents/agentConfig.js'))['createAgentConfig'];
}> {
  vi.resetModules();
  applyBaseEnv();

  const routesMod = await import('./engineRoomRoutes.js');
  const runtimeMod = await import('../../agents/skillRuntime.js');
  const configMod = await import('../../agents/agentConfig.js');

  const app = express();
  app.use(express.json());
  app.use(
    routesMod.createEngineRoomRoutes({
      lensPack: {
        pack_id: 'test-pack',
        lenses: [],
        families: {}
      } as never,
      skillRuntime: new runtimeMod.SkillRuntime()
    })
  );

  return {
    app,
    SkillRuntime: runtimeMod.SkillRuntime,
    createAgentConfig: configMod.createAgentConfig
  };
}

describe('engineRoomRoutes skill runtime endpoints', () => {
  it('returns skills list', async () => {
    vi.resetModules();
    applyBaseEnv();
    const routesMod = await import('./engineRoomRoutes.js');
    const runtimeMod = await import('../../agents/skillRuntime.js');
    const configMod = await import('../../agents/agentConfig.js');

    const runtime = new runtimeMod.SkillRuntime();
    runtime.registerSkill({
      skillId: 'test_skill',
      displayName: 'Test Skill',
      config: configMod.createAgentConfig({
        agentId: 'agent-test',
        skillId: 'test_skill',
        skillKind: 'custom'
      }),
      run: async () => ({
        version: 'v1',
        status: 'success',
        output: { ok: true },
        durationMs: 1,
        validation: { allowed: true }
      })
    });

    const app = express();
    app.use(express.json());
    app.use(
      routesMod.createEngineRoomRoutes({
        lensPack: { pack_id: 'test-pack', lenses: [], families: {} } as never,
        skillRuntime: runtime
      })
    );

    const response = await request(app).get('/api/v1/engine-room/skills');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.skills).toHaveLength(1);
    expect(response.body.skills[0].skillId).toBe('test_skill');
  });

  it('returns 400 for invalid skill run payload', async () => {
    vi.resetModules();
    applyBaseEnv();
    const routesMod = await import('./engineRoomRoutes.js');
    const runtimeMod = await import('../../agents/skillRuntime.js');

    const app = express();
    app.use(express.json());
    app.use(
      routesMod.createEngineRoomRoutes({
        lensPack: { pack_id: 'test-pack', lenses: [], families: {} } as never,
        skillRuntime: new runtimeMod.SkillRuntime()
      })
    );

    const response = await request(app).post('/api/v1/engine-room/skills/run').send({});
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SKILL_RUN_INPUT_INVALID');
  });

  it('returns 404 when running unknown skill', async () => {
    vi.resetModules();
    applyBaseEnv();
    const routesMod = await import('./engineRoomRoutes.js');
    const runtimeMod = await import('../../agents/skillRuntime.js');

    const app = express();
    app.use(express.json());
    app.use(
      routesMod.createEngineRoomRoutes({
        lensPack: { pack_id: 'test-pack', lenses: [], families: {} } as never,
        skillRuntime: new runtimeMod.SkillRuntime()
      })
    );

    const response = await request(app)
      .post('/api/v1/engine-room/skills/run')
      .send({ skillId: 'missing', input: {} });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('SKILL_NOT_FOUND');
  });

  it('returns 409 when runtime reports SKILL_ALREADY_RUNNING', async () => {
    vi.resetModules();
    applyBaseEnv();
    const routesMod = await import('./engineRoomRoutes.js');

    const app = express();
    app.use(express.json());
    app.use(
      routesMod.createEngineRoomRoutes({
        lensPack: { pack_id: 'test-pack', lenses: [], families: {} } as never,
        skillRuntime: {
          listSkills: () => [],
          getSkillStatus: () => {
            return {
              skillId: 'test_skill',
              displayName: 'Test Skill',
              enabled: true,
              skillKind: 'custom',
              running: true
            };
          },
          runSkill: async () => ({
            runId: 'run-1',
            skillId: 'test_skill',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 0,
            result: {
              version: 'v1',
              status: 'blocked',
              code: 'SKILL_ALREADY_RUNNING',
              message: 'already running',
              durationMs: 0,
              traceId: 'trace-skill-2',
              validation: {
                allowed: false,
                code: 'SKILL_ALREADY_RUNNING',
                message: 'already running'
              }
            }
          })
        } as never
      })
    );

    const secondRun = await request(app)
      .post('/api/v1/engine-room/skills/run')
      .send({ skillId: 'test_skill', input: {}, traceId: 'trace-skill-2' });

    expect(secondRun.status).toBe(409);
    expect(secondRun.body.run.result.status).toBe('blocked');
    expect(secondRun.body.run.result.code).toBe('SKILL_ALREADY_RUNNING');
    expect(secondRun.body.run.result.traceId).toBe('trace-skill-2');
  });
});
