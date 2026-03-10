import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';

const traceIdSchema = z.string().uuid();

export type SphereErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
  traceId: string;
};

export function resolveTraceId(req: Request): string {
  if (typeof req.sphereTraceId === 'string' && req.sphereTraceId) {
    return req.sphereTraceId;
  }

  const headerTrace = req.header('x-trace-id');
  if (headerTrace && traceIdSchema.safeParse(headerTrace).success) {
    return headerTrace;
  }

  const body = req.body as Record<string, unknown> | null | undefined;
  const bodyTrace = body?.traceId;
  if (typeof bodyTrace === 'string' && traceIdSchema.safeParse(bodyTrace).success) {
    return bodyTrace;
  }

  return randomUUID();
}

export function sendSphereError(
  req: Request,
  res: Response,
  status: number,
  params: {
    code: string;
    message: string;
    retryable?: boolean;
    details?: unknown;
  }
) {
  const traceId = resolveTraceId(req);
  const body: SphereErrorBody = {
    code: params.code,
    message: params.message,
    retryable: Boolean(params.retryable),
    details: params.details,
    traceId
  };

  return res.status(status).json(body);
}
