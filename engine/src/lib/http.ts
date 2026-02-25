import type { Response } from 'express';

export function error(res: Response, status: number, message: string, detail?: string) {
  return res.status(status).json({ error: message, detail });
}
