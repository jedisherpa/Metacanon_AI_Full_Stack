import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { validateAdminSession } from './sessionService.js';
import { bearerToken } from '../lib/auth.js';

export async function requireAdminSession(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.ADMIN_SESSION_COOKIE] || bearerToken(req);
  const valid = await validateAdminSession(token);

  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
