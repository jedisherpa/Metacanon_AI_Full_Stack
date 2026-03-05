import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const requiredEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://council:council@localhost:5432/council',
  CORS_ORIGINS: 'http://localhost:5173',
  LENS_PACK: 'hands-of-the-void',
  ADMIN_PANEL_PASSWORD: 'test-password',
  KIMI_API_KEY: 'test-kimi-key',
  TELEGRAM_BOT_TOKEN: 'test-telegram-token',
  WS_TOKEN_SECRET: '12345678901234567890123456789012',
  RUNTIME_ENV: 'local'
};

function applyEnv(overrides: Record<string, string>): void {
  Object.assign(process.env, requiredEnv, overrides);
}

async function loadEnvModule(): Promise<(typeof import('./env.js'))['env']> {
  const mod = await import('./env.js');
  return mod.env;
}

describe('env boolean parsing', () => {
  beforeEach(() => {
    vi.resetModules();
    applyEnv({});
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('parses explicit false values as false', async () => {
    applyEnv({
      MISSION_STUB_FALLBACK_ENABLED: 'false',
      SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES: 'false',
      SPHERE_THREAD_ENABLED: 'false',
      SPHERE_C2_ALIAS_ENABLED: 'false',
      SESSION_SECURE_COOKIES: 'false',
      INLINE_WORKER_ENABLED: 'false',
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'false'
    });

    const env = await loadEnvModule();

    expect(env.MISSION_STUB_FALLBACK_ENABLED).toBe(false);
    expect(env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES).toBe(false);
    expect(env.SPHERE_THREAD_ENABLED).toBe(false);
    expect(env.SPHERE_C2_ALIAS_ENABLED).toBe(false);
    expect(env.SESSION_SECURE_COOKIES).toBe(false);
    expect(env.INLINE_WORKER_ENABLED).toBe(false);
    expect(env.TELEGRAM_AUTH_DEV_BYPASS_ENABLED).toBe(false);
  });

  it('parses numeric boolean variants 1/0', async () => {
    applyEnv({
      MISSION_STUB_FALLBACK_ENABLED: '1',
      SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES: '1',
      SPHERE_THREAD_ENABLED: '1',
      SPHERE_C2_ALIAS_ENABLED: '1',
      SESSION_SECURE_COOKIES: '0',
      INLINE_WORKER_ENABLED: '0',
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: '1'
    });

    const env = await loadEnvModule();

    expect(env.MISSION_STUB_FALLBACK_ENABLED).toBe(true);
    expect(env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES).toBe(true);
    expect(env.SPHERE_THREAD_ENABLED).toBe(true);
    expect(env.SPHERE_C2_ALIAS_ENABLED).toBe(true);
    expect(env.SESSION_SECURE_COOKIES).toBe(false);
    expect(env.INLINE_WORKER_ENABLED).toBe(false);
    expect(env.TELEGRAM_AUTH_DEV_BYPASS_ENABLED).toBe(true);
  });

  it('rejects invalid boolean strings', async () => {
    applyEnv({
      SPHERE_THREAD_ENABLED: 'definitely-not-a-bool'
    });

    await expect(import('./env.js')).rejects.toThrow();
  });
});
