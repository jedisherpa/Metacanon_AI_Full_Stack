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
      SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES: 'false',
      SESSION_SECURE_COOKIES: 'false',
      INLINE_WORKER_ENABLED: 'false',
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'false'
    });

    const env = await loadEnvModule();

    expect(env.MISSION_STUB_FALLBACK_ENABLED).toBe(false);
    expect(env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES).toBe(false);
    expect(env.SPHERE_THREAD_ENABLED).toBe(false);
    expect(env.SPHERE_C2_ALIAS_ENABLED).toBe(false);
    expect(env.SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES).toBe(false);
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
      SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES: '1',
      SESSION_SECURE_COOKIES: '0',
      INLINE_WORKER_ENABLED: '0',
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: '1'
    });

    const env = await loadEnvModule();

    expect(env.MISSION_STUB_FALLBACK_ENABLED).toBe(true);
    expect(env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES).toBe(true);
    expect(env.SPHERE_THREAD_ENABLED).toBe(true);
    expect(env.SPHERE_C2_ALIAS_ENABLED).toBe(true);
    expect(env.SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES).toBe(true);
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

  it('rejects production boot when conductor key is default', async () => {
    applyEnv({
      RUNTIME_ENV: 'production',
      MISSION_STUB_FALLBACK_ENABLED: 'false',
      CONDUCTOR_PRIVATE_KEY: 'dev-conductor-secret',
      SPHERE_SIGNATURE_VERIFICATION: 'strict'
    });

    await expect(import('./env.js')).rejects.toThrow(
      'CONDUCTOR_PRIVATE_KEY must be set to a non-default value in production.'
    );
  });

  it('rejects production boot when signature verification mode is not strict', async () => {
    applyEnv({
      RUNTIME_ENV: 'production',
      MISSION_STUB_FALLBACK_ENABLED: 'false',
      CONDUCTOR_PRIVATE_KEY: 'prod-conductor-secret',
      SPHERE_SIGNATURE_VERIFICATION: 'did_key'
    });

    await expect(import('./env.js')).rejects.toThrow(
      'SPHERE_SIGNATURE_VERIFICATION must be strict in production.'
    );
  });

  it('accepts production boot when required hardening guards are met', async () => {
    applyEnv({
      RUNTIME_ENV: 'production',
      MISSION_STUB_FALLBACK_ENABLED: 'false',
      CONDUCTOR_PRIVATE_KEY: 'prod-conductor-secret',
      SPHERE_SIGNATURE_VERIFICATION: 'strict'
    });

    const env = await loadEnvModule();
    expect(env.RUNTIME_ENV).toBe('production');
    expect(env.SPHERE_SIGNATURE_VERIFICATION).toBe('strict');
  });

  it('rejects boot when conductor Ed25519 key pair is partially configured', async () => {
    applyEnv({
      CONDUCTOR_ED25519_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----'
    });

    await expect(import('./env.js')).rejects.toThrow(
      'CONDUCTOR_ED25519_PRIVATE_KEY and CONDUCTOR_ED25519_KEY_ID must both be set together.'
    );
  });

  it('accepts boot when conductor Ed25519 key pair is fully configured', async () => {
    applyEnv({
      CONDUCTOR_ED25519_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----',
      CONDUCTOR_ED25519_KEY_ID: 'conductor-key-2026-03'
    });

    const env = await loadEnvModule();
    expect(env.CONDUCTOR_ED25519_PRIVATE_KEY).toContain('PRIVATE KEY');
    expect(env.CONDUCTOR_ED25519_KEY_ID).toBe('conductor-key-2026-03');
  });

  it('accepts strict V2 ledger enforcement without bootstrap key env values', async () => {
    applyEnv({
      SPHERE_LEDGER_REQUIRE_V2_SIGNATURE: 'true'
    });

    const env = await loadEnvModule();
    expect(env.SPHERE_LEDGER_REQUIRE_V2_SIGNATURE).toBe(true);
  });

  it('accepts strict V2 ledger enforcement with public-key registry json', async () => {
    applyEnv({
      SPHERE_LEDGER_REQUIRE_V2_SIGNATURE: 'true',
      CONDUCTOR_ED25519_PUBLIC_KEYS_JSON: '{"conductor-key-2026-03":"-----BEGIN PUBLIC KEY-----test-----END PUBLIC KEY-----"}',
      SPHERE_LEDGER_V2_ACTIVATION_AT: '2026-03-10T00:00:00.000Z',
      SPHERE_LEDGER_V2_GRACE_DAYS: '7'
    });

    const env = await loadEnvModule();
    expect(env.SPHERE_LEDGER_REQUIRE_V2_SIGNATURE).toBe(true);
    expect(env.SPHERE_LEDGER_V2_ACTIVATION_AT).toBe('2026-03-10T00:00:00.000Z');
    expect(env.SPHERE_LEDGER_V2_GRACE_DAYS).toBe(7);
  });

  it('accepts governance alert webhook configuration', async () => {
    applyEnv({
      SPHERE_GOVERNANCE_ALERT_WEBHOOK_URL: 'https://alerts.example.com/metacanon',
      SPHERE_GOVERNANCE_ALERT_WEBHOOK_TOKEN: 'alert-token-123',
      SPHERE_GOVERNANCE_ALERT_WEBHOOK_TIMEOUT_MS: '9000'
    });

    const env = await loadEnvModule();
    expect(env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_URL).toBe(
      'https://alerts.example.com/metacanon'
    );
    expect(env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_TOKEN).toBe('alert-token-123');
    expect(env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_TIMEOUT_MS).toBe(9000);
  });

});
