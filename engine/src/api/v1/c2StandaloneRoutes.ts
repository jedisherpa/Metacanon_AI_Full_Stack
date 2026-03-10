import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { generateMissionReport, MissionServiceError } from '../../agents/missionService.js';
import { resolveTraceId, sendSphereError } from './sphereApi.js';
import { sphereServiceAuthMiddleware } from '../../middleware/sphereServiceAuth.js';
import { env } from '../../config/env.js';

const missionWriteRequiredFields = [
  'messageId',
  'traceId',
  'intent',
  'attestation[]',
  'schemaVersion',
  'threadId|missionId',
  'agentSignature'
] as const;

const dispatchMissionSchema = z.object({
  threadId: z.string().uuid().optional(),
  missionId: z.string().uuid().optional(),
  messageId: z.string().uuid(),
  agentDid: z.string().min(1),
  intent: z.literal('DISPATCH_MISSION'),
  objective: z.string().min(3),
  provider: z.enum(['morpheus', 'groq', 'kimi', 'auto']).default('auto'),
  attestation: z.array(z.string().min(1)),
  schemaVersion: z.literal('3.0'),
  traceId: z.string().uuid(),
  agentSignature: z.string().min(1)
});

function sphereDisabledPayload(traceId: string) {
  return {
    code: 'SPHERE_THREAD_DISABLED',
    message: 'Sphere Thread is disabled for this deployment.',
    retryable: false,
    sphereThreadEnabled: false,
    traceId
  };
}

function registerGet(router: Router, bases: string[], suffix: string, handler: RequestHandler): void {
  for (const base of bases) {
    router.get(`${base}${suffix}`, handler);
  }
}

function registerPost(
  router: Router,
  bases: string[],
  suffix: string,
  handler: RequestHandler
): void {
  for (const base of bases) {
    router.post(`${base}${suffix}`, handler);
  }
}

type C2StandaloneRouteOptions = {
  includeLegacyAlias?: boolean;
};

const CANONICAL_SPHERE_BASE = '/api/v1/sphere';
const LEGACY_ALIAS_BASE = '/api/v1/c2';

function isSphereBoundaryPath(path: string): boolean {
  return (
    path.startsWith(`${CANONICAL_SPHERE_BASE}/`) ||
    path === CANONICAL_SPHERE_BASE ||
    path.startsWith(`${LEGACY_ALIAS_BASE}/`) ||
    path === LEGACY_ALIAS_BASE ||
    path === '/api/v1/threads/halt-all'
  );
}

export function createC2StandaloneRoutes(options: C2StandaloneRouteOptions = {}) {
  const router = Router();
  const bases = [CANONICAL_SPHERE_BASE];
  const includeLegacyAlias = options.includeLegacyAlias ?? true;
  if (includeLegacyAlias) {
    bases.push(LEGACY_ALIAS_BASE);
  }

  router.use((req, res, next) => {
    if (!isSphereBoundaryPath(req.path)) {
      next();
      return;
    }
    const traceId = resolveTraceId(req);
    req.sphereTraceId = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  });
  router.use((req, res, next) => {
    if (!isSphereBoundaryPath(req.path)) {
      next();
      return;
    }
    sphereServiceAuthMiddleware(req, res, next);
  });
  router.use((req, res, next) => {
    if (
      req.path.startsWith(`${LEGACY_ALIAS_BASE}/`) ||
      req.path === LEGACY_ALIAS_BASE ||
      req.path === '/api/v1/threads/halt-all'
    ) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', `</${CANONICAL_SPHERE_BASE.slice(1)}>; rel="successor-version"`);
      res.setHeader('x-sphere-canonical-base', CANONICAL_SPHERE_BASE);
    }
    next();
  });

  registerGet(router, bases, '/status', (_req, res) => {
    const traceId = String(res.getHeader('x-trace-id') ?? randomUUID());
    return res.json({
      systemState: 'SPHERE_DISABLED',
      sphereThreadEnabled: false,
      threadCount: 0,
      degradedThreads: 0,
      haltedThreads: 0,
      traceId
    });
  });

  registerGet(router, bases, '/capabilities', (req, res) => {
    return res.json({
      apiVersion: 'v1',
      mode: 'standalone_mission',
      surface: {
        canonicalBase: CANONICAL_SPHERE_BASE,
        legacyAliasBase: includeLegacyAlias ? LEGACY_ALIAS_BASE : null,
        legacyAliasDeprecated: includeLegacyAlias,
        legacyAliasSuccessorBase: includeLegacyAlias ? CANONICAL_SPHERE_BASE : null
      },
      sphereThreadEnabled: false,
      auth: {
        boundary: 'TMA -> Webapp BFF -> Sphere',
        serviceTokenRequired: true,
        agentApiKeyHeader: 'x-agent-api-key',
        agentApiKeyWriteRequired: env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES,
        threadAccessModel: 'principal_membership_acl',
        acceptsDirectTmaAuth: false,
        principal: req.spherePrincipal ?? null
      },
      features: {
        status: true,
        missions: true,
        messages: false,
        dids: false,
        threadRead: false,
        threadAcks: false,
        replay: false,
        stream: false,
        ack: false,
        haltAll: false,
        threadMemberships: false,
        threadInvites: false,
        lensUpgradeRules: false,
        lensProgression: false,
        ledgerVerification: false,
        conductorKeyRegistry: false,
        conductorKeyLookup: false,
        conductorKeyRotation: false,
        conductorKeyRetirement: false
      },
      protocol: {
        stream: {
          mode: 'disabled',
          replay: false,
          ack: false
        },
        writeEnvelope: {
          validationMode: 'strict_v1',
          schemaVersion: '3.0',
          missionsRequiredFields: missionWriteRequiredFields,
          messagesRequiredFields: [],
          ackRequiredFields: []
        }
      },
      signatures: {
        clientEnvelopeAgentSignatureRequired: true,
        runtimeVerificationMode: 'not_applicable_standalone'
      },
      errors: {
        disabledCode: 'SPHERE_THREAD_DISABLED',
        envelopeFields: ['code', 'message', 'retryable', 'details', 'traceId']
      },
      traceId: req.sphereTraceId
    });
  });

  registerPost(router, bases, '/missions', async (req, res) => {
    const parsed = dispatchMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendSphereError(req, res, 400, {
        code: 'SPHERE_ERR_INVALID_SCHEMA',
        message: 'Invalid mission dispatch payload.',
        retryable: false,
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const threadId = input.threadId ?? randomUUID();
    const missionId = input.missionId ?? randomUUID();

    try {
      const report = await generateMissionReport({
        agentDid: input.agentDid,
        objective: input.objective,
        provider: input.provider
      });

      return res.status(201).json({
        threadId,
        missionId,
        state: report.degraded ? 'DEGRADED_NO_LLM' : 'ACTIVE',
        report,
        logEntries: [],
        sphereThreadEnabled: false,
        traceId: req.sphereTraceId
      });
    } catch (err) {
      if (err instanceof MissionServiceError) {
        return sendSphereError(req, res, 503, {
          code: err.code,
          message: err.message,
          retryable: true,
          details: {
            degraded: true,
            degradedReason: err.message,
            threadId,
            missionId,
            state: 'DEGRADED_NO_LLM',
            sphereThreadEnabled: false
          }
        });
      }

      return sendSphereError(req, res, 500, {
        code: 'SPHERE_ERR_INTERNAL',
        message: 'Unexpected internal error.',
        retryable: true,
        details: { sphereThreadEnabled: false }
      });
    }
  });

  registerPost(router, bases, '/messages', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/lens-upgrade-rules', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/dids', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/dids/:did', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerPost(router, bases, '/dids', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/threads/:threadId', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/threads/:threadId/lens-progression', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/threads/:threadId/verify-ledger', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/conductor-keys', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/conductor-keys/:keyId', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerPost(router, bases, '/rotate-conductor-key', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerPost(router, bases, '/retire-conductor-key', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/threads/:threadId/acks', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/threads/:threadId/replay', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerGet(router, bases, '/threads/:threadId/stream', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerPost(router, bases, '/halt-all', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  registerPost(router, bases, '/threads/:threadId/ack', (req, res) => {
    return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
  });

  if (includeLegacyAlias) {
    router.post('/api/v1/threads/halt-all', (req, res) => {
      return res.status(503).json(sphereDisabledPayload(resolveTraceId(req)));
    });
  }

  return router;
}
