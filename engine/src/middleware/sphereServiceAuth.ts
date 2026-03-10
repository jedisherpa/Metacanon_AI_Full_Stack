import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { sendSphereError } from '../api/v1/sphereApi.js';

declare global {
  namespace Express {
    interface Request {
      sphereTraceId?: string;
      spherePrincipal?: 'bff-service';
    }
  }
}

function parseBearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (!authorization) {
    return null;
  }

  if (authorization.toLowerCase().startsWith('tma ')) {
    return '__tma__';
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function tokensMatch(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(actual, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function sphereServiceAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const bearer = parseBearerToken(req);
  const headerToken = req.header('x-sphere-service-token');
  const token = bearer && bearer !== '__tma__' ? bearer : headerToken ?? null;

  if (bearer === '__tma__') {
    sendSphereError(req, res, 403, {
      code: 'SPHERE_ERR_TMA_DIRECT_FORBIDDEN',
      message: 'Direct Telegram Mini App authorization is not accepted on Sphere routes.',
      retryable: false
    });
    return;
  }

  if (!token) {
    sendSphereError(req, res, 401, {
      code: 'SPHERE_ERR_AUTH_REQUIRED',
      message: 'Sphere service token is required.',
      retryable: false
    });
    return;
  }

  if (!tokensMatch(env.SPHERE_BFF_SERVICE_TOKEN, token)) {
    sendSphereError(req, res, 401, {
      code: 'SPHERE_ERR_AUTH_INVALID',
      message: 'Sphere service token is invalid.',
      retryable: false
    });
    return;
  }

  req.spherePrincipal = 'bff-service';
  next();
}
