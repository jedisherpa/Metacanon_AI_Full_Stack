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
import { createRuntimeRoutes } from './api/v1/runtimeRoutes.js';
import { createSphereRoutes } from './api/v1/c2Routes.js';
import { createC2StandaloneRoutes } from './api/v1/c2StandaloneRoutes.js';
import { createSphereBffRoutes } from './api/v1/sphereBffRoutes.js';
import { loadGovernancePolicies } from './governance/policyLoader.js';
import { loadGovernanceConfig } from './governance/governanceConfig.js';
import { createIntentValidator } from './governance/contactLensValidator.js';
import { DidRegistry } from './sphere/didRegistry.js';
import { SphereConductor } from './sphere/conductor.js';
import { WebhookGovernanceAlertNotifier } from './sphere/governanceAlertNotifier.js';
import { PrometheusConductorMetrics } from './sphere/prometheusMetrics.js';
import { ThreadAccessRegistry } from './sphere/threadAccessRegistry.js';
import { ensureSphereDbRoleSeparationOnStartup } from './db/client.js';
import { WebSocketHub } from './ws/hub.js';
import { authorizeSocketChannel } from './ws/auth.js';
import { startWorkers } from './queue/worker.js';
import { getBoss } from './queue/boss.js';
import { sendApiError } from './lib/apiError.js';
import { startTelegramMessageBridge } from './telegram/messageBridge.js';
import { createDefaultSkillRuntime } from './agents/skillRuntime.js';
import { createEnvSecretResolver, createHttpEmailFetcher } from './agents/emailSkillProviders.js';

const logger = pino({
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});

function parseConductorPublicKeyRegistry(
  raw: string | undefined
): Record<string, string> | undefined {
  if (!raw?.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid json';
    throw new Error(`Invalid CONDUCTOR_ED25519_PUBLIC_KEYS_JSON: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid CONDUCTOR_ED25519_PUBLIC_KEYS_JSON: expected JSON object map.');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const keyRegistry: Record<string, string> = {};
  for (const [keyId, value] of entries) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(
        `Invalid CONDUCTOR_ED25519_PUBLIC_KEYS_JSON: value for "${keyId}" must be a non-empty string.`
      );
    }
    keyRegistry[keyId] = value;
  }

  return keyRegistry;
}

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
await ensureSphereDbRoleSeparationOnStartup();
const prometheusConductorMetrics = new PrometheusConductorMetrics();
const governanceAlertNotifier = env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_URL
  ? new WebhookGovernanceAlertNotifier({
      webhookUrl: env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_URL,
      secretToken: env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_TOKEN,
      timeoutMs: env.SPHERE_GOVERNANCE_ALERT_WEBHOOK_TIMEOUT_MS
    })
  : undefined;
let liveConductor: SphereConductor | null = null;
const sphereRoutes = env.SPHERE_THREAD_ENABLED
  ? await (async () => {
      const governancePolicies = await loadGovernancePolicies({
        governanceDir: env.GOVERNANCE_DIR
      });
      const governanceConfig = await loadGovernanceConfig({
        configPath: env.GOVERNANCE_CONFIG_PATH
      });
      const validateIntent = createIntentValidator(governancePolicies);
      const didRegistry = await DidRegistry.create();
      const conductorEd25519PublicKeys = parseConductorPublicKeyRegistry(
        env.CONDUCTOR_ED25519_PUBLIC_KEYS_JSON
      );
      const conductor = await SphereConductor.create({
        conductorSecret: env.CONDUCTOR_PRIVATE_KEY,
        conductorEd25519PrivateKey: env.CONDUCTOR_ED25519_PRIVATE_KEY,
        conductorEd25519KeyId: env.CONDUCTOR_ED25519_KEY_ID,
        conductorEd25519PublicKeys,
        conductorRotationGraceDaysDefault: env.SPHERE_LEDGER_V2_GRACE_DAYS,
        requireConductorSignatureV2: env.SPHERE_LEDGER_REQUIRE_V2_SIGNATURE,
        conductorSignatureV2ActivationAt: env.SPHERE_LEDGER_V2_ACTIVATION_AT,
        conductorSignatureV2GraceDays: env.SPHERE_LEDGER_V2_GRACE_DAYS,
        requireVerifiedCounselorAckSignatures: env.SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES,
        counselorAckSignatureActivationAt: env.SPHERE_ACK_VERIFIED_SIGNATURES_ACTIVATION_AT,
        counselorAckSignatureGraceDays: env.SPHERE_ACK_VERIFIED_SIGNATURES_GRACE_DAYS,
        prometheusMetrics: prometheusConductorMetrics,
        governanceAlertNotifier,
        validateIntent,
        governanceConfigPath: governanceConfig.configPath,
        governanceHashes: {
          highRiskRegistryHash: governancePolicies.checksums.highRiskRegistry,
          contactLensPackHash: governancePolicies.checksums.contactLensPack,
          governanceConfigHash: governanceConfig.configHash
        },
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
          governanceAlertWebhookEnabled: Boolean(governanceAlertNotifier),
          governanceHashSnapshot: {
            highRiskRegistryHash: governancePolicies.checksums.highRiskRegistry,
            contactLensPackHash: governancePolicies.checksums.contactLensPack,
            governanceConfigHash: governanceConfig.configHash
          },
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
let emailFetcher: ReturnType<typeof createHttpEmailFetcher> | undefined;
if (env.EMAIL_SKILL_ADAPTER_URL) {
  try {
    const secretResolver = createEnvSecretResolver({
      secretMapJson: env.EMAIL_SKILL_SECRET_MAP_JSON
    });
    emailFetcher = createHttpEmailFetcher({
      adapterUrl: env.EMAIL_SKILL_ADAPTER_URL,
      adapterToken: env.EMAIL_SKILL_ADAPTER_TOKEN,
      secretResolver
    });
    logger.info('Email checking adapter configured.');
  } catch (error) {
    logger.warn({ error }, 'Email adapter configuration invalid. email_checking will remain blocked.');
  }
} else {
  logger.info('Email adapter URL not configured. email_checking will remain blocked.');
}
const skillRuntime = createDefaultSkillRuntime({
  emailFetcher
});

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
app.use(createEngineRoomRoutes({ lensPack, skillRuntime }));
app.use(createRuntimeRoutes());
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

app.get('/metrics', async (_req, res) => {
  try {
    const body = await prometheusConductorMetrics.renderMetrics();
    res.setHeader('Content-Type', prometheusConductorMetrics.contentType);
    res.status(200).send(body);
  } catch (error) {
    logger.error({ error }, 'Failed to render Prometheus metrics');
    res.status(500).send('metrics_unavailable');
  }
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
