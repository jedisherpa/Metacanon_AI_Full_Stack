import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { randomToken } from '../lib/crypto.js';
import {
  createAdminSession,
  deleteAdminSessionByHash,
  getAdminSessionByHash,
  purgeExpiredAdminSessions
} from '../db/queries.js';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function startAdminSession() {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);

  await purgeExpiredAdminSessions();
  await createAdminSession(tokenHash, expiresAt);

  return { token, expiresAt };
}

export async function validateAdminSession(token: string | null | undefined) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const session = await getAdminSessionByHash(tokenHash);
  return Boolean(session);
}

export async function endAdminSession(token: string | null | undefined) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await deleteAdminSessionByHash(tokenHash);
}
