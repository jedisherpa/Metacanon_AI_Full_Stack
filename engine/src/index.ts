import http from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import { env } from './config/env.js';
import { loadLensPack } from './config/lensPack.js';
import { createAdminAuthRoutes } from './api/v2/adminAuthRoutes.js';
import { createAdminGameRoutes } from './api/v2/adminGameRoutes.js';
import { createPlayerGameRoutes } from './api/v2/playerGameRoutes.js';
import { createCommandRoutes } from './api/v2/commandRoutes.js';
// Living Atlas v1 routes
import { createAtlasRoutes } from './api/v1/atlasRoutes.js';
import { createCitadelRoutes } from './api/v1/citadelRoutes.js';
import { createForgeRoutes } from './api/v1/forgeRoutes.js';
import { createHubRoutes } from './api/v1/hubRoutes.js';
import { createEngineRoomRoutes } from './api/v1/engineRoomRoutes.js';
import { createC2Routes } from './api/v1/c2Routes.js';
import { loadGovernancePolicies } from './governance/policyLoader.js';
import { createIntentValidator } from './governance/contactLensValidator.js';
import { DidRegistry } from './sphere/didRegistry.js';
import { SphereConductor } from './sphere/conductor.js';
import { WebSocketHub } from './ws/hub.js';
import { authorizeSocketChannel } from './ws/auth.js';
import { startWorkers } from './queue/worker.js';
import { getBoss } from './queue/boss.js';

const logger = pino({
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});

const app = express();

const sentryDsn = env.SENTRY_DSN?.trim();
if (sentryDsn && sentryDsn !== '__REPLACE__') {
  const integrations = [Sentry.httpIntegration(), Sentry.expressIntegration()];

  try {
    const { nodeProfilingIntegration } = await import('@sentry/profiling-node');
    integrations.push(nodeProfilingIntegration());
  } catch (error) {
    logger.warn({ error }, 'Sentry profiling integration unavailable; continuing without profiling');
  }

  Sentry.init({
    dsn: sentryDsn,
    integrations,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0
  });
}

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: env.CORS_ORIGINS.split(',').map((value) => value.trim()),
    credentials: true
  })
);

const lensPack = await loadLensPack(env.LENS_PACK);
const governancePolicies = await loadGovernancePolicies({
  governanceDir: env.GOVERNANCE_DIR
});
const validateIntent = createIntentValidator(governancePolicies);
const didRegistry = new DidRegistry();
const conductor = await SphereConductor.create({
  conductorSecret: env.CONDUCTOR_PRIVATE_KEY,
  validateIntent,
  governanceConfigPath: env.GOVERNANCE_CONFIG_PATH
});
logger.info(
  {
    governanceRoot: governancePolicies.governanceRoot,
    contactLensCount: governancePolicies.contactLensesByDid.size,
    checksums: governancePolicies.checksums
  },
  'Loaded governance policies'
);
const server = http.createServer(app);

const wsHub = new WebSocketHub(({ channel, gameId, token }) =>
  authorizeSocketChannel({ channel, gameId, token })
);

await getBoss();
if (env.INLINE_WORKER_ENABLED) {
  await startWorkers({ lensPack, wsHub });
}

// v2 routes (existing admin + player API)
app.use(createAdminAuthRoutes());
app.use(createAdminGameRoutes({ lensPack, wsHub }));
app.use(createPlayerGameRoutes({ lensPack, wsHub }));
app.use(createCommandRoutes());

// v1 routes (Living Atlas TMA API)
app.use(createAtlasRoutes());
app.use(createCitadelRoutes({ wsHub }));
app.use(createForgeRoutes({ wsHub, lensPack }));
app.use(createHubRoutes({ wsHub }));
app.use(createEngineRoomRoutes({ lensPack }));
app.use(
  createC2Routes({
    conductor,
    didRegistry
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, queue: 'ready', version: '2.0.0-atlas' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/config/lenses', (_req, res) => {
  res.json(lensPack);
});

if (sentryDsn && sentryDsn !== '__REPLACE__') {
  Sentry.setupExpressErrorHandler(app);
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws/v2/')) {
    socket.destroy();
    return;
  }

  wsHub.handleUpgrade(req, socket, head);
});

server.listen(env.PORT, () => {
  logger.info(`LensForge Living Atlas API listening on :${env.PORT}`);
});
