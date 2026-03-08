import pino from 'pino';
import { env } from './config/env.js';
import { loadLensPack } from './config/lensPack.js';
import { ensureSphereDbRoleSeparationOnStartup } from './db/client.js';
import { getBoss } from './queue/boss.js';
import { startWorkers } from './queue/worker.js';

const logger = pino({
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});

const lensPack = await loadLensPack(env.LENS_PACK);
await ensureSphereDbRoleSeparationOnStartup();
await getBoss();
await startWorkers({ lensPack });

logger.info('Council Engine worker started');
