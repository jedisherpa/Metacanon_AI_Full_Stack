import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export type ApiErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
  traceId: string;
};

function readBodyTraceId(req: Request): string | null {
  if (!req.body || typeof req.body !== 'object') {
    return null;
  }

  const maybeTraceId = (req.body as { traceId?: unknown }).traceId;
  if (typeof maybeTraceId !== 'string') {
    return null;
  }

  const trimmed = maybeTraceId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveTraceId(req: Request): string {
  const headerTraceId = req.header('x-trace-id')?.trim();
  if (headerTraceId && headerTraceId.length > 0) {
    return headerTraceId;
  }

  const bodyTraceId = readBodyTraceId(req);
  if (bodyTraceId) {
    return bodyTraceId;
  }

  return randomUUID();
}

export function sendApiError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: unknown
) {
  const body: ApiErrorBody = {
    code,
    message,
    retryable,
    traceId: resolveTraceId(req)
  };

  if (details !== undefined) {
    body.details = details;
  }

  return res.status(status).json(body);
}
