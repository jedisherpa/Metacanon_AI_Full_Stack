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
import { createSphereRoutes } from './api/v1/c2Routes.js';
import { createC2StandaloneRoutes } from './api/v1/c2StandaloneRoutes.js';
import { createSphereBffRoutes } from './api/v1/sphereBffRoutes.js';
import { loadGovernancePolicies } from './governance/policyLoader.js';
import { createIntentValidator } from './governance/contactLensValidator.js';
import { DidRegistry } from './sphere/didRegistry.js';
import { SphereConductor } from './sphere/conductor.js';
import { ThreadAccessRegistry } from './sphere/threadAccessRegistry.js';
import { WebSocketHub } from './ws/hub.js';
import { authorizeSocketChannel } from './ws/auth.js';
import { startWorkers } from './queue/worker.js';
import { getBoss } from './queue/boss.js';
import { sendApiError } from './lib/apiError.js';
import { startTelegramMessageBridge } from './telegram/messageBridge.js';

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
let liveConductor: SphereConductor | null = null;
const sphereRoutes = env.SPHERE_THREAD_ENABLED
  ? await (async () => {
      const governancePolicies = await loadGovernancePolicies({
        governanceDir: env.GOVERNANCE_DIR
      });
      const validateIntent = createIntentValidator(governancePolicies);
      const didRegistry = await DidRegistry.create();
      const conductor = await SphereConductor.create({
        conductorSecret: env.CONDUCTOR_PRIVATE_KEY,
        validateIntent,
        governanceConfigPath: env.GOVERNANCE_CONFIG_PATH,
        signatureVerificationMode: env.SPHERE_SIGNATURE_VERIFICATION,
        resolveDidPublicKey: async (did) => {
          const identity = await didRegistry.get(did);
          return identity?.publicKey ?? null;
        }
      });

      logger.info(
        {
          governanceRoot: governancePolicies.governanceRoot,
          contactLensCount: governancePolicies.contactLensesByDid.size,
          checksums: governancePolicies.checksums
        },
        'Loaded governance policies'
      );
      liveConductor = conductor;

      return createSphereRoutes({
        conductor,
        didRegistry,
        governancePolicies,
        includeLegacyAlias: env.SPHERE_C2_ALIAS_ENABLED
      });
    })()
  : (() => {
      logger.info(
        'Sphere Thread disabled (SPHERE_THREAD_ENABLED=false); using standalone mission mode.'
      );
      return createC2StandaloneRoutes({
        includeLegacyAlias: env.SPHERE_C2_ALIAS_ENABLED
      });
    })();
const threadAccessRegistry = await ThreadAccessRegistry.create();
const sphereBffRoutes = createSphereBffRoutes({ sphereRoutes, threadAccessRegistry });
const server = http.createServer(app);

const wsHub = new WebSocketHub(({ channel, gameId, token }) =>
  authorizeSocketChannel({ channel, gameId, token })
);
let stopTelegramBridge: (() => void) | null = null;

if (env.TELEGRAM_MESSAGE_BRIDGE_ENABLED) {
  if (liveConductor) {
    stopTelegramBridge = await startTelegramMessageBridge({
      botToken: env.TELEGRAM_BOT_TOKEN,
      conductor: liveConductor,
      logger,
      pollTimeoutSeconds: env.TELEGRAM_BRIDGE_POLL_TIMEOUT_SECONDS,
      errorBackoffMs: env.TELEGRAM_BRIDGE_ERROR_BACKOFF_MS
    });
  } else {
    logger.warn(
      'TELEGRAM_MESSAGE_BRIDGE_ENABLED=true ignored because SPHERE_THREAD_ENABLED=false.'
    );
  }
}

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
app.use(sphereBffRoutes);
app.use(sphereRoutes);

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

app.use((req, res) => {
  sendApiError(req, res, 404, 'NOT_FOUND', 'Route not found.', false);
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

function shutdownTelegramBridge(): void {
  if (!stopTelegramBridge) {
    return;
  }

  stopTelegramBridge();
  stopTelegramBridge = null;
}

process.once('SIGINT', shutdownTelegramBridge);
process.once('SIGTERM', shutdownTelegramBridge);
