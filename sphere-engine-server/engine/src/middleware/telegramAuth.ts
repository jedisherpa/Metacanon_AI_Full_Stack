import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { sendApiError } from '../lib/apiError.js';

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

// Extend Express Request with telegram user
declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
      telegramUserId?: string;
    }
  }
}

function isDevBypassEnabled(): boolean {
  return env.TELEGRAM_AUTH_DEV_BYPASS_ENABLED && env.RUNTIME_ENV !== 'production';
}

function parseDevBypassUserId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildDevBypassUser(req: Request): TelegramUser {
  const idFromHeader = parseDevBypassUserId(req.header('x-dev-telegram-user-id'));
  const idFromEnv = parseDevBypassUserId(env.TELEGRAM_AUTH_DEV_BYPASS_USER_ID);
  const id = idFromHeader ?? idFromEnv ?? 900000001;

  const firstName = req.header('x-dev-telegram-first-name') ?? env.TELEGRAM_AUTH_DEV_BYPASS_FIRST_NAME;
  const username = req.header('x-dev-telegram-username') ?? env.TELEGRAM_AUTH_DEV_BYPASS_USERNAME;

  return {
    id,
    first_name: firstName,
    username
  };
}

function applyDevBypass(req: Request, res: Response, next: NextFunction): void {
  const user = buildDevBypassUser(req);
  req.telegramUser = user;
  req.telegramUserId = String(user.id);
  res.setHeader('x-telegram-auth-mode', 'dev_bypass');
  next();
}

/**
 * Validates Telegram initData using HMAC-SHA256.
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Check expiry (1 hour max)
    const authDate = parseInt(params.get('auth_date') ?? '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 3600) return null;

    // Build data-check-string: sorted key=value pairs excluding hash
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // HMAC key = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    const userParam = params.get('user');
    if (!userParam) return null;

    return JSON.parse(decodeURIComponent(userParam)) as TelegramUser;
  } catch {
    return null;
  }
}

/**
 * Express middleware: validates Telegram initData from Authorization header.
 * Sets req.telegramUser and req.telegramUserId on success.
 * Returns 401 on failure.
 */
export function telegramAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('tma ')) {
    if (isDevBypassEnabled()) {
      applyDevBypass(req, res, next);
      return;
    }

    sendApiError(req, res, 401, 'TG_AUTH_MISSING', 'Missing Telegram init data.', false);
    return;
  }

  const initData = authHeader.slice(4);
  const user = validateInitData(initData, env.TELEGRAM_BOT_TOKEN);

  if (!user) {
    if (isDevBypassEnabled()) {
      applyDevBypass(req, res, next);
      return;
    }

    sendApiError(req, res, 401, 'TG_AUTH_INVALID', 'Invalid Telegram init data.', false);
    return;
  }

  req.telegramUser = user;
  req.telegramUserId = String(user.id);
  res.setHeader('x-telegram-auth-mode', 'telegram');
  next();
}
