import type { Request } from 'express';

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export function cookieToken(req: Request, key: string): string | null {
  const value = req.cookies?.[key];
  if (!value || typeof value !== 'string') {
    return null;
  }
  return value;
}
