import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

type EnvOverrides = Partial<Record<string, string>>;

const baseEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://council:council@localhost:5432/council',
  CORS_ORIGINS: 'http://localhost:5173',
  LENS_PACK: 'hands-of-the-void',
  ADMIN_PANEL_PASSWORD: 'test-password',
  KIMI_API_KEY: 'test-kimi-key',
  TELEGRAM_BOT_TOKEN: 'test-telegram-token',
  WS_TOKEN_SECRET: '12345678901234567890123456789012',
  RUNTIME_ENV: 'local',
  TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'false',
  TELEGRAM_AUTH_DEV_BYPASS_USER_ID: '900000001',
  TELEGRAM_AUTH_DEV_BYPASS_FIRST_NAME: 'Local',
  TELEGRAM_AUTH_DEV_BYPASS_USERNAME: 'local_dev'
};

function applyEnv(overrides: EnvOverrides = {}): void {
  for (const [key, value] of Object.entries(baseEnv)) {
    process.env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
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

function createReq(
  authorization?: string,
  headers: Record<string, string> = {}
): Request {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }
  if (authorization !== undefined) {
    normalizedHeaders.authorization = authorization;
  }

  return {
    headers: normalizedHeaders,
    header: (name: string) => normalizedHeaders[name.toLowerCase()] ?? undefined
  } as unknown as Request;
}

function createRes() {
  const state: {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string>;
  } = {
    headers: {}
  };

  const response = {
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return response;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      state.headers[name.toLowerCase()] = value;
      return response;
    })
  };

  return {
    res: response as unknown as Response,
    state
  };
}

async function loadMiddleware(overrides: EnvOverrides = {}) {
  applyEnv(overrides);
  vi.resetModules();
  return import('./telegramAuth.js');
}

describe('telegramAuthMiddleware', () => {
  beforeEach(() => {
    applyEnv();
  });

  it('returns TG_AUTH_MISSING when auth header is absent and bypass is disabled', async () => {
    const { telegramAuthMiddleware } = await loadMiddleware({
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'false'
    });
    const req = createReq();
    const { res, state } = createRes();
    const next = vi.fn() as unknown as NextFunction;

    telegramAuthMiddleware(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual(
      expect.objectContaining({
        code: 'TG_AUTH_MISSING',
        message: 'Missing Telegram init data.',
        retryable: false
      })
    );
    expect(typeof (state.body as { traceId?: unknown }).traceId).toBe('string');
    expect((next as any as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('accepts valid Telegram initData and sets telegram user context', async () => {
    const { telegramAuthMiddleware } = await loadMiddleware({
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'false'
    });
    const initData = buildInitData(process.env.TELEGRAM_BOT_TOKEN as string, 777111);
    const req = createReq(`tma ${initData}`);
    const { res, state } = createRes();
    const next = vi.fn() as unknown as NextFunction;

    telegramAuthMiddleware(req, res, next);

    expect((next as any as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((req as any).telegramUserId).toBe('777111');
    expect((req as any).telegramUser?.first_name).toBe('TestUser');
    expect(state.headers['x-telegram-auth-mode']).toBe('telegram');
  });

  it('returns TG_AUTH_INVALID with traceId for invalid initData when bypass is disabled', async () => {
    const { telegramAuthMiddleware } = await loadMiddleware({
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'false'
    });
    const req = createReq('tma invalid-init-data', {
      'x-trace-id': '55555555-5555-4555-8555-555555555555'
    });
    const { res, state } = createRes();
    const next = vi.fn() as unknown as NextFunction;

    telegramAuthMiddleware(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({
      code: 'TG_AUTH_INVALID',
      message: 'Invalid Telegram init data.',
      retryable: false,
      traceId: '55555555-5555-4555-8555-555555555555'
    });
    expect((next as any as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('allows local dev bypass without Telegram auth when enabled', async () => {
    const { telegramAuthMiddleware } = await loadMiddleware({
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'true',
      RUNTIME_ENV: 'local'
    });
    const req = createReq(undefined, {
      'x-dev-telegram-user-id': '4242',
      'x-dev-telegram-first-name': 'Paul',
      'x-dev-telegram-username': 'pc'
    });
    const { res, state } = createRes();
    const next = vi.fn() as unknown as NextFunction;

    telegramAuthMiddleware(req, res, next);

    expect((next as any as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((req as any).telegramUserId).toBe('4242');
    expect((req as any).telegramUser?.first_name).toBe('Paul');
    expect((req as any).telegramUser?.username).toBe('pc');
    expect(state.headers['x-telegram-auth-mode']).toBe('dev_bypass');
  });

  it('allows local dev bypass for invalid Telegram initData when enabled', async () => {
    const { telegramAuthMiddleware } = await loadMiddleware({
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'true',
      RUNTIME_ENV: 'local'
    });
    const req = createReq('tma invalid-init-data');
    const { res } = createRes();
    const next = vi.fn() as unknown as NextFunction;

    telegramAuthMiddleware(req, res, next);

    expect((next as any as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((req as any).telegramUserId).toBe('900000001');
  });

  it('never bypasses in production runtime', async () => {
    const { telegramAuthMiddleware } = await loadMiddleware({
      TELEGRAM_AUTH_DEV_BYPASS_ENABLED: 'true',
      RUNTIME_ENV: 'production',
      MISSION_STUB_FALLBACK_ENABLED: ''
    });
    const req = createReq();
    const { res, state } = createRes();
    const next = vi.fn() as unknown as NextFunction;

    telegramAuthMiddleware(req, res, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual(
      expect.objectContaining({
        code: 'TG_AUTH_MISSING',
        message: 'Missing Telegram init data.',
        retryable: false
      })
    );
    expect(typeof (state.body as { traceId?: unknown }).traceId).toBe('string');
    expect((next as any as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});
