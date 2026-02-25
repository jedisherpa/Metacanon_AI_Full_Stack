import { Router } from 'express';
import { z } from 'zod';
import { error } from '../../lib/http.js';
import { verifyAdminPassword } from '../../admin/passwordGate.js';
import { endAdminSession, startAdminSession, validateAdminSession } from '../../admin/sessionService.js';
import { env } from '../../config/env.js';
import { bearerToken } from '../../lib/auth.js';

const unlockSchema = z.object({
  password: z.string().min(1)
});

export function createAdminAuthRoutes() {
  const router = Router();

  router.post('/api/v2/admin/unlock', async (req, res) => {
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    if (!verifyAdminPassword(parsed.data.password)) {
      return error(res, 401, 'Invalid password');
    }

    const session = await startAdminSession();
    const sameSite = env.SESSION_SECURE_COOKIES ? 'none' : 'lax';

    res.cookie(env.ADMIN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: env.SESSION_SECURE_COOKIES,
      sameSite,
      expires: session.expiresAt,
      path: '/'
    });

    res.json({
      ok: true,
      expiresAt: session.expiresAt.toISOString(),
      wsToken: session.token
    });
  });

  router.get('/api/v2/admin/session', async (req, res) => {
    const token = req.cookies?.[env.ADMIN_SESSION_COOKIE] || bearerToken(req);
    const valid = await validateAdminSession(token);
    res.json({ ok: valid });
  });

  router.post('/api/v2/admin/lock', async (req, res) => {
    const token = req.cookies?.[env.ADMIN_SESSION_COOKIE] || bearerToken(req);
    await endAdminSession(token);
    res.clearCookie(env.ADMIN_SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
