import { beforeEach, describe, expect, it, vi } from 'vitest';

function setEnv(overrides: Record<string, string | undefined> = {}): void {
  process.env.DATABASE_URL = 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.LENS_PACK = 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = 'test-password';
  process.env.KIMI_API_KEY = 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';
  process.env.WS_TOKEN_SECRET = '12345678901234567890123456789012';
  process.env.RUNTIME_ENV = 'local';
  process.env.SPHERE_DB_ENFORCE_ROLE_SEPARATION = 'false';
  delete process.env.SPHERE_DB_APP_ROLE;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadClientModule(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  setEnv(overrides);
  return import('./client.js');
}

describe('ensureSphereDbRoleSeparationOnStartup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no-ops when role separation enforcement is disabled', async () => {
    const { ensureSphereDbRoleSeparationOnStartup } = await loadClientModule();

    await expect(
      ensureSphereDbRoleSeparationOnStartup({
        enforce: false
      })
    ).resolves.toBeUndefined();
  });

  it('fails when enforcement is enabled but expected role is missing', async () => {
    const { ensureSphereDbRoleSeparationOnStartup } = await loadClientModule();

    await expect(
      ensureSphereDbRoleSeparationOnStartup({
        enforce: true,
        expectedRole: '   ',
        resolveCurrentUser: async () => 'sphere_app'
      })
    ).rejects.toThrow(
      'SPHERE_DB_APP_ROLE must be set when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.'
    );
  });

  it('passes when current user matches expected role', async () => {
    const { ensureSphereDbRoleSeparationOnStartup } = await loadClientModule();

    await expect(
      ensureSphereDbRoleSeparationOnStartup({
        enforce: true,
        expectedRole: 'sphere_app',
        resolveCurrentUser: async () => 'sphere_app'
      })
    ).resolves.toBeUndefined();
  });

  it('fails when current user does not match expected role', async () => {
    const { ensureSphereDbRoleSeparationOnStartup } = await loadClientModule();

    await expect(
      ensureSphereDbRoleSeparationOnStartup({
        enforce: true,
        expectedRole: 'sphere_app',
        resolveCurrentUser: async () => 'council'
      })
    ).rejects.toThrow(
      'DB role separation check failed. Connected as "council", expected "sphere_app".'
    );
  });

  it('fails module load when DATABASE_URL role does not match expected app role', async () => {
    await expect(
      loadClientModule({
        SPHERE_DB_ENFORCE_ROLE_SEPARATION: 'true',
        SPHERE_DB_APP_ROLE: 'sphere_app',
        DATABASE_URL: 'postgresql://council:council@localhost:5432/council'
      })
    ).rejects.toThrow(
      'DATABASE_URL user "council" must match SPHERE_DB_APP_ROLE "sphere_app" when SPHERE_DB_ENFORCE_ROLE_SEPARATION is true.'
    );
  });

  it('allows module load when DATABASE_URL role matches expected app role', async () => {
    await expect(
      loadClientModule({
        SPHERE_DB_ENFORCE_ROLE_SEPARATION: 'true',
        SPHERE_DB_APP_ROLE: 'sphere_app',
        DATABASE_URL: 'postgresql://sphere_app:council@localhost:5432/council'
      })
    ).resolves.toBeTruthy();
  });
});
