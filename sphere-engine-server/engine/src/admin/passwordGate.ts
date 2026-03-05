import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

export function verifyAdminPassword(input: string) {
  const expected = sha256(env.ADMIN_PANEL_PASSWORD);
  const actual = sha256(input);
  return timingSafeEqual(expected, actual);
}
