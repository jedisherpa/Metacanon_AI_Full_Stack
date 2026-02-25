declare module 'cookie-parser' {
  import type { RequestHandler } from 'express';
  function cookieParser(secret?: string | string[]): RequestHandler;
  export default cookieParser;
}

declare module 'pg-boss' {
  type Job = {
    data?: unknown;
    retrycount?: number;
    retryCount?: number;
  };

  type WorkHandler = (job: Job | Job[]) => Promise<void>;

  export default class PgBoss {
    constructor(options?: Record<string, unknown>);
    start(): Promise<void>;
    stop(): Promise<void>;
    createQueue(name: string): Promise<void>;
    send(name: string, data: unknown, options?: Record<string, unknown>): Promise<string | null>;
    work(name: string, handler: WorkHandler): Promise<() => void>;
  }
}
