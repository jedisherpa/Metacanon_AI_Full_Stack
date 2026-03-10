# Codex Sphere Thread Code Export

Generated: 2026-02-25 21:06:58 UTC

This file aggregates the Sphere Thread stack code currently implemented in this repo.


## engine/src/index.ts

```ts
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

\`\`\`

## engine/src/api/v1/c2Routes.ts

```ts
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import type { DidRegistry } from '../../sphere/didRegistry.js';
import { ConductorError, SphereConductor } from '../../sphere/conductor.js';
import { generateMissionReport, MissionServiceError } from '../../agents/missionService.js';

const dispatchMissionSchema = z.object({
  threadId: z.string().uuid().optional(),
  missionId: z.string().uuid().optional(),
  agentDid: z.string().min(1),
  objective: z.string().min(3),
  provider: z.enum(['morpheus', 'groq', 'kimi', 'auto']).default('auto'),
  attestation: z.array(z.string().min(1)).optional(),
  idempotencyKey: z.string().min(1).optional(),
  traceId: z.string().uuid().optional(),
  prismHolderApproved: z.boolean().optional()
});

const haltAllSchema = z.object({
  actorDid: z.string().min(1),
  actorRole: z.string().min(1),
  reason: z.string().min(3),
  confirmerDid: z.string().min(1).optional(),
  confirmerRole: z.string().min(1).optional(),
  emergencyCredential: z.string().min(1).optional(),
  prismHolderApproved: z.boolean().optional()
});

function parseBooleanHeader(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

export function createC2Routes(options: {
  conductor: SphereConductor;
  didRegistry: DidRegistry;
}) {
  const router = Router();

  router.get('/api/v1/c2/status', async (_req, res) => {
    try {
      const threads = await options.conductor.listThreads();
      const degradedThreads = threads.filter((thread) => thread.state === 'DEGRADED_NO_LLM').length;
      const haltedThreads = threads.filter((thread) => thread.state === 'HALTED').length;

      return res.json({
        systemState: options.conductor.getSystemState(),
        degradedNoLlmReason: options.conductor.getDegradedNoLlmReason(),
        threadCount: threads.length,
        degradedThreads,
        haltedThreads
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.post('/api/v1/c2/missions', async (req, res) => {
    const parsed = dispatchMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const prismHolderApproved =
      input.prismHolderApproved ?? parseBooleanHeader(req.header('x-prism-holder-approved'));

    options.didRegistry.register({ did: input.agentDid });

    let threadId = input.threadId;
    let missionId = input.missionId;

    try {
      const thread = await options.conductor.createThread({
        threadId: input.threadId,
        missionId: input.missionId,
        createdBy: input.agentDid
      });
      threadId = thread.threadId;
      missionId = thread.missionId;

      if (options.conductor.getSystemState() === 'DEGRADED_NO_LLM') {
        const reason = options.conductor.getDegradedNoLlmReason() ?? 'LLM outage in production';
        await options.conductor.markThreadDegradedNoLlm(thread.threadId, reason);
        const degradedThread = await options.conductor.getThread(thread.threadId);
        return res.status(503).json({
          error: 'DEGRADED_NO_LLM',
          message: 'Model-dependent mission execution is blocked while LLM is unavailable.',
          degraded: true,
          degradedReason: reason,
          threadId: thread.threadId,
          missionId: thread.missionId,
          state: degradedThread?.state
        });
      }

      const dispatchEntry = await options.conductor.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: input.agentDid,
        intent: 'DISPATCH_MISSION',
        payload: {
          objective: input.objective,
          provider: input.provider,
          submittedAt: new Date().toISOString()
        },
        attestation: input.attestation,
        idempotencyKey: input.idempotencyKey,
        traceId: input.traceId,
        prismHolderApproved
      });

      const report = await generateMissionReport({
        agentDid: input.agentDid,
        objective: input.objective,
        provider: input.provider
      });

      if (report.degraded) {
        await options.conductor.markThreadDegradedNoLlm(
          thread.threadId,
          report.degradedReason ?? 'LLM unavailable'
        );
      }

      const reportEntry = await options.conductor.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: input.agentDid,
        intent: 'MISSION_REPORT',
        payload: {
          report,
          completedAt: new Date().toISOString()
        },
        causationId: [dispatchEntry.clientEnvelope.messageId],
        prismHolderApproved: true,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:report` : undefined,
        traceId: input.traceId
      });

      const updatedThread = await options.conductor.getThread(thread.threadId);

      return res.status(201).json({
        threadId: thread.threadId,
        missionId: thread.missionId,
        state: updatedThread?.state,
        report,
        logEntries: [
          dispatchEntry.clientEnvelope.messageId,
          reportEntry.clientEnvelope.messageId
        ]
      });
    } catch (err) {
      if (err instanceof MissionServiceError) {
        if (env.RUNTIME_ENV === 'production') {
          options.conductor.enterGlobalDegradedNoLlm(err.message);
        }
        const degradedThread = threadId
          ? await options.conductor.markThreadDegradedNoLlm(threadId, err.message)
          : null;
        return res.status(503).json({
          error: err.code,
          message: err.message,
          degraded: true,
          degradedReason: err.message,
          threadId,
          missionId,
          state: degradedThread?.state ?? 'DEGRADED_NO_LLM'
        });
      }

      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }

      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/api/v1/c2/threads/:threadId', async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      return res.json({
        threadId: thread.threadId,
        missionId: thread.missionId,
        createdAt: thread.createdAt,
        createdBy: thread.createdBy,
        state: thread.state,
        entries: thread.entries
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/api/v1/c2/threads/:threadId/replay', async (req, res) => {
    try {
      const fromSequence = Number.parseInt(String(req.query.from_sequence ?? '1'), 10);
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      return res.json({
        threadId: thread.threadId,
        fromSequence,
        entries: await options.conductor.getThreadReplay(
          thread.threadId,
          Number.isNaN(fromSequence) ? 1 : fromSequence
        )
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/api/v1/c2/threads/:threadId/stream', async (req, res) => {
    try {
      const thread = await options.conductor.getThread(req.params.threadId);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const send = (event: string, payload: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      send('ready', {
        threadId: thread.threadId,
        missionId: thread.missionId,
        state: thread.state,
        replayFrom:
          thread.entries.length > 0
            ? thread.entries[thread.entries.length - 1].ledgerEnvelope.sequence
            : 0
      });

      const onLogEntry = (payload: { threadId: string; entry: unknown }) => {
        if (payload.threadId !== thread.threadId) {
          return;
        }
        send('log_entry', payload.entry);
      };

      const heartbeat = setInterval(() => {
        send('heartbeat', { at: new Date().toISOString() });
      }, 15000);

      options.conductor.on('log_entry', onLogEntry);

      req.on('close', () => {
        clearInterval(heartbeat);
        options.conductor.off('log_entry', onLogEntry);
        res.end();
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.post('/api/v1/threads/halt-all', async (req, res) => {
    const parsed = haltAllSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten()
      });
    }

    const input = parsed.data;
    const prismHolderApproved =
      input.prismHolderApproved ?? parseBooleanHeader(req.header('x-prism-holder-approved'));

    try {
      const result = await options.conductor.haltAllThreads({
        actorDid: input.actorDid,
        actorRole: input.actorRole,
        reason: input.reason,
        confirmerDid: input.confirmerDid,
        confirmerRole: input.confirmerRole,
        emergencyCredential: input.emergencyCredential,
        prismHolderApproved
      });

      return res.status(202).json({
        haltedCount: result.haltedCount,
        threadIds: result.threadIds,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      if (err instanceof ConductorError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}

\`\`\`

## engine/src/sphere/conductor.ts

```ts
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { PoolClient } from 'pg';
import { pool } from '../db/client.js';
import {
  loadGovernanceConfig,
  type GovernanceConfig
} from '../governance/governanceConfig.js';
import type {
  BreakGlassContext,
  IntentValidationInput,
  IntentValidationResult,
  ThreadGovernanceState
} from '../governance/contactLensValidator.js';

export type C2Intent = string;

export type ClientEnvelope = {
  messageId: string;
  threadId: string;
  authorAgentId: string;
  intent: C2Intent;
  protocolVersion: string;
  schemaVersion: string;
  traceId: string;
  causationId: string[];
  attestation: string[];
  idempotencyKey?: string;
  agentSignature: string;
};

export type LedgerEnvelope = {
  schemaVersion: string;
  sequence: number;
  prevMessageHash: string;
  timestamp: string;
  conductorSignature: string;
};

export type LogEntry = {
  clientEnvelope: ClientEnvelope;
  ledgerEnvelope: LedgerEnvelope;
  payload: Record<string, unknown>;
};

export type ThreadRecord = {
  threadId: string;
  missionId: string;
  createdAt: string;
  createdBy: string;
  state: ThreadGovernanceState;
  entries: LogEntry[];
};

export type DispatchIntentInput = {
  threadId: string;
  missionId?: string;
  authorAgentId: string;
  messageId?: string;
  intent: C2Intent;
  payload: Record<string, unknown>;
  protocolVersion?: string;
  schemaVersion?: string;
  traceId?: string;
  causationId?: string[];
  attestation?: string[];
  idempotencyKey?: string;
  prismHolderApproved?: boolean;
  breakGlass?: BreakGlassContext;
};

export class ConductorError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      sorted[key] = sortValue(nested);
    }
    return sorted;
  }

  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeIntent(value: string): string {
  return value.trim().toUpperCase();
}

function deriveDeterministicMessageId(seed: string): string {
  const digest = sha256(seed);
  const versioned = `${digest.slice(0, 8)}${digest.slice(8, 12)}5${digest.slice(13, 16)}a${digest.slice(17, 20)}${digest.slice(20, 32)}`;

  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20, 32)}`;
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

type IntentValidator = (input: IntentValidationInput) => IntentValidationResult;

type ConductorOptions = {
  conductorSecret: string;
  validateIntent: IntentValidator;
  governanceConfigPath?: string;
};

type ThreadLogEntryEvent = {
  threadId: string;
  entry: LogEntry;
};

type ThreadRow = {
  thread_id: string;
  mission_id: string;
  created_at: string | Date;
  created_by: string;
  state: ThreadGovernanceState;
  next_sequence: string | number;
  last_entry_hash: string | null;
};

type EventRow = {
  client_envelope: ClientEnvelope;
  ledger_envelope: LedgerEnvelope;
  payload: Record<string, unknown>;
};

function statusForValidationCode(code: IntentValidationResult['code']): number {
  switch (code) {
    case 'THREAD_HALTED':
      return 412;
    case 'PRISM_HOLDER_APPROVAL_REQUIRED':
    case 'LENS_PROHIBITED_ACTION':
    case 'LENS_ACTION_NOT_PERMITTED':
    case 'BREAK_GLASS_AUTH_FAILED':
      return 403;
    default:
      return 400;
  }
}

export class SphereConductor extends EventEmitter {
  private readonly conductorSecret: string;
  private readonly validateIntent: IntentValidator;
  private readonly governanceConfigPath?: string;
  private globalState: 'ACTIVE' | 'DEGRADED_NO_LLM' = 'ACTIVE';
  private degradedNoLlmReason: string | null = null;
  private governanceConfig!: GovernanceConfig;
  private readonly ready: Promise<void>;

  private constructor(options: ConductorOptions) {
    super();
    this.conductorSecret = options.conductorSecret;
    this.validateIntent = options.validateIntent;
    this.governanceConfigPath = options.governanceConfigPath;
    this.ready = this.bootstrap();
  }

  static async create(options: ConductorOptions): Promise<SphereConductor> {
    const instance = new SphereConductor(options);
    await instance.ready;
    return instance;
  }

  private async bootstrap(): Promise<void> {
    await this.ensureSchema();
    this.governanceConfig = await loadGovernanceConfig({
      configPath: this.governanceConfigPath
    });
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  getSystemState(): 'ACTIVE' | 'DEGRADED_NO_LLM' {
    return this.globalState;
  }

  getDegradedNoLlmReason(): string | null {
    return this.degradedNoLlmReason;
  }

  enterGlobalDegradedNoLlm(reason: string): void {
    this.globalState = 'DEGRADED_NO_LLM';
    this.degradedNoLlmReason = reason;
  }

  async createThread(input: {
    threadId?: string;
    missionId?: string;
    createdBy: string;
  }): Promise<ThreadRecord> {
    await this.ensureReady();

    const threadId = input.threadId ?? randomUUID();
    const missionId = input.missionId ?? randomUUID();
    const initialState: ThreadGovernanceState =
      this.globalState === 'DEGRADED_NO_LLM' ? 'DEGRADED_NO_LLM' : 'ACTIVE';

    await pool.query(
      `
        INSERT INTO sphere_threads (
          thread_id,
          mission_id,
          created_by,
          state,
          next_sequence,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
        ON CONFLICT (thread_id) DO NOTHING
      `,
      [threadId, missionId, input.createdBy, initialState]
    );

    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new ConductorError(500, 'STM_ERR_INTERNAL', 'Failed to initialize thread record.');
    }

    return thread;
  }

  async getThread(threadId: string): Promise<ThreadRecord | null> {
    await this.ensureReady();

    const threadResult = await pool.query<ThreadRow>(
      `
        SELECT
          thread_id,
          mission_id,
          created_at,
          created_by,
          state,
          next_sequence,
          last_entry_hash
        FROM sphere_threads
        WHERE thread_id = $1
      `,
      [threadId]
    );

    if (threadResult.rowCount === 0) {
      return null;
    }

    const thread = threadResult.rows[0];
    const entries = await this.fetchEntries(threadId);

    return {
      threadId: thread.thread_id,
      missionId: thread.mission_id,
      createdAt: toIsoString(thread.created_at),
      createdBy: thread.created_by,
      state: thread.state,
      entries
    };
  }

  async getThreadReplay(threadId: string, fromSequence = 1): Promise<LogEntry[]> {
    await this.ensureReady();
    return this.fetchEntries(threadId, fromSequence);
  }

  async listThreads(): Promise<ThreadRecord[]> {
    await this.ensureReady();

    const result = await pool.query<ThreadRow>(
      `
        SELECT
          thread_id,
          mission_id,
          created_at,
          created_by,
          state,
          next_sequence,
          last_entry_hash
        FROM sphere_threads
        ORDER BY created_at ASC
      `
    );

    return result.rows.map((thread) => ({
      threadId: thread.thread_id,
      missionId: thread.mission_id,
      createdAt: toIsoString(thread.created_at),
      createdBy: thread.created_by,
      state: thread.state,
      entries: []
    }));
  }

  async setThreadState(
    threadId: string,
    state: ThreadGovernanceState
  ): Promise<ThreadRecord | null> {
    await this.ensureReady();

    await pool.query(
      `
        UPDATE sphere_threads
        SET state = $2, updated_at = NOW()
        WHERE thread_id = $1
      `,
      [threadId, state]
    );

    return this.getThread(threadId);
  }

  async markThreadDegradedNoLlm(threadId: string, reason: string): Promise<ThreadRecord | null> {
    await this.ensureReady();

    const thread = await this.getThread(threadId);
    if (!thread) {
      return null;
    }

    if (thread.state === 'HALTED') {
      return thread;
    }

    await this.setThreadState(threadId, 'DEGRADED_NO_LLM');

    try {
      await this.dispatchIntent({
        threadId,
        missionId: thread.missionId,
        authorAgentId: 'did:system:conductor',
        intent: 'SYSTEM_DEGRADED_NO_LLM',
        payload: {
          reason,
          degraded: true,
          outageAt: new Date().toISOString()
        },
        prismHolderApproved: true,
        idempotencyKey: `degraded-${threadId}-${Date.now()}`
      });
    } catch {
      // Degraded annotation should not fail mission error handling paths.
    }

    return this.getThread(threadId);
  }

  async dispatchIntent(input: DispatchIntentInput): Promise<LogEntry> {
    await this.ensureReady();

    const threadId = input.threadId;
    const missionId = input.missionId ?? randomUUID();
    const messageId =
      input.messageId ??
      (input.idempotencyKey
        ? deriveDeterministicMessageId(`${threadId}:${input.authorAgentId}:${input.idempotencyKey}`)
        : randomUUID());

    const schemaVersion = input.schemaVersion ?? '3.0';
    const protocolVersion = input.protocolVersion ?? '3.0';
    const traceId = input.traceId ?? randomUUID();
    const attestation = input.attestation ?? [];

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const thread = await this.fetchOrCreateThreadForUpdate(client, {
        threadId,
        missionId,
        createdBy: input.authorAgentId
      });

      const effectiveThreadState: ThreadGovernanceState =
        thread.state === 'HALTED'
          ? 'HALTED'
          : this.globalState === 'DEGRADED_NO_LLM'
            ? 'DEGRADED_NO_LLM'
            : thread.state;

      const validation = this.validateIntent({
        intent: input.intent,
        agentDid: input.authorAgentId,
        threadState: effectiveThreadState,
        prismHolderApproved: Boolean(input.prismHolderApproved),
        breakGlass: input.breakGlass
      });

      if (!validation.allowed) {
        throw new ConductorError(
          statusForValidationCode(validation.code),
          validation.code ?? 'STM_ERR_INVALID_SCHEMA',
          validation.message ?? 'Intent rejected by governance policy.'
        );
      }

      if (this.isMaterialImpactIntent(input.intent)) {
        await this.enforceCounselQuorum(client, attestation);
      }

      const sequence = Number(thread.next_sequence);
      const timestamp = new Date().toISOString();
      const prevMessageHash = thread.last_entry_hash ?? 'GENESIS';

      const clientEnvelopeBase = {
        messageId,
        threadId,
        authorAgentId: input.authorAgentId,
        intent: input.intent,
        protocolVersion,
        schemaVersion,
        traceId,
        causationId: input.causationId ?? [],
        attestation,
        idempotencyKey: input.idempotencyKey
      };

      const agentSignature = this.signPayload({
        envelope: clientEnvelopeBase,
        payload: input.payload,
        signer: input.authorAgentId
      });

      const clientEnvelope: ClientEnvelope = {
        ...clientEnvelopeBase,
        agentSignature
      };

      const ledgerEnvelopeBase = {
        schemaVersion,
        sequence,
        prevMessageHash,
        timestamp
      };

      const conductorSignature = this.signPayload({
        clientEnvelope,
        ledgerEnvelope: ledgerEnvelopeBase,
        payload: input.payload,
        signer: 'conductor'
      });

      const ledgerEnvelope: LedgerEnvelope = {
        ...ledgerEnvelopeBase,
        conductorSignature
      };

      const entry: LogEntry = {
        clientEnvelope,
        ledgerEnvelope,
        payload: input.payload
      };

      const entryHash = sha256(canonicalize(entry));
      const nextState = this.deriveThreadStateAfterIntent(thread.state, input.intent);

      await client.query(
        `
          INSERT INTO sphere_events (
            thread_id,
            sequence,
            message_id,
            author_did,
            intent,
            timestamp,
            client_envelope,
            ledger_envelope,
            payload,
            entry_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
        `,
        [
          threadId,
          sequence,
          messageId,
          input.authorAgentId,
          input.intent,
          timestamp,
          JSON.stringify(clientEnvelope),
          JSON.stringify(ledgerEnvelope),
          JSON.stringify(input.payload),
          entryHash
        ]
      );

      await client.query(
        `
          UPDATE sphere_threads
          SET
            next_sequence = next_sequence + 1,
            last_entry_hash = $2,
            state = $3,
            updated_at = NOW()
          WHERE thread_id = $1
        `,
        [threadId, entryHash, nextState]
      );

      await client.query('COMMIT');

      const event: ThreadLogEntryEvent = { threadId, entry };
      this.emit('log_entry', event);
      this.emit(`thread:${threadId}`, entry);

      return entry;
    } catch (error) {
      await client.query('ROLLBACK');

      if (error && typeof error === 'object' && 'code' in error) {
        const pgError = error as { code?: string; constraint?: string };
        if (
          pgError.code === '23505' &&
          pgError.constraint === 'sphere_events_thread_message_unique'
        ) {
          throw new ConductorError(
            409,
            'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY',
            'A message with this messageId has already been committed for this thread.'
          );
        }
      }

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConductorError(
          500,
          'STM_ERR_INTERNAL',
          'Concurrent write conflict while appending to thread.'
        );
      }

      if (error instanceof ConductorError) {
        throw error;
      }

      throw new ConductorError(500, 'STM_ERR_INTERNAL', 'Unexpected internal error during dispatch.');
    } finally {
      client.release();
    }
  }

  async haltAllThreads(input: {
    actorDid: string;
    actorRole: string;
    confirmerDid?: string;
    confirmerRole?: string;
    emergencyCredential?: string;
    reason: string;
    prismHolderApproved?: boolean;
  }): Promise<{ haltedCount: number; threadIds: string[] }> {
    await this.ensureReady();

    const threads = await this.listThreads();
    const haltedIds: string[] = [];

    for (const thread of threads) {
      await this.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: input.actorDid,
        intent: 'EMERGENCY_SHUTDOWN',
        payload: {
          actorDid: input.actorDid,
          reason: input.reason,
          actorRole: input.actorRole,
          confirmerDid: input.confirmerDid ?? null,
          confirmerRole: input.confirmerRole ?? null,
          authorizationMode: input.confirmerDid ? 'DUAL_CONTROL' : 'EMERGENCY_CREDENTIAL',
          auditTimestamp: new Date().toISOString()
        },
        prismHolderApproved: Boolean(input.prismHolderApproved),
        breakGlass: {
          actorDid: input.actorDid,
          actorRole: input.actorRole,
          confirmerDid: input.confirmerDid,
          confirmerRole: input.confirmerRole,
          emergencyCredential: input.emergencyCredential,
          reason: input.reason
        }
      });

      haltedIds.push(thread.threadId);
    }

    return { haltedCount: haltedIds.length, threadIds: haltedIds };
  }

  private deriveThreadStateAfterIntent(
    currentState: ThreadGovernanceState,
    intent: string
  ): ThreadGovernanceState {
    const normalizedIntent = normalizeIntent(intent);

    if (normalizedIntent === 'EMERGENCY_SHUTDOWN' || normalizedIntent === 'HALT_THREAD') {
      return 'HALTED';
    }

    if (normalizedIntent === 'RESUME_THREAD') {
      return 'ACTIVE';
    }

    if (this.globalState === 'DEGRADED_NO_LLM' && currentState !== 'HALTED') {
      return 'DEGRADED_NO_LLM';
    }

    return currentState;
  }

  private async fetchEntries(threadId: string, fromSequence = 1): Promise<LogEntry[]> {
    const result = await pool.query<EventRow>(
      `
        SELECT client_envelope, ledger_envelope, payload
        FROM sphere_events
        WHERE thread_id = $1 AND sequence >= $2
        ORDER BY sequence ASC
      `,
      [threadId, fromSequence]
    );

    return result.rows.map((row) => ({
      clientEnvelope: row.client_envelope,
      ledgerEnvelope: row.ledger_envelope,
      payload: row.payload
    }));
  }

  private async fetchOrCreateThreadForUpdate(
    client: PoolClient,
    input: { threadId: string; missionId: string; createdBy: string }
  ): Promise<ThreadRow> {
    await client.query(
      `
        INSERT INTO sphere_threads (
          thread_id,
          mission_id,
          created_by,
          state,
          next_sequence,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
        ON CONFLICT (thread_id) DO NOTHING
      `,
      [
        input.threadId,
        input.missionId,
        input.createdBy,
        this.globalState === 'DEGRADED_NO_LLM' ? 'DEGRADED_NO_LLM' : 'ACTIVE'
      ]
    );

    const result = await client.query<ThreadRow>(
      `
        SELECT
          thread_id,
          mission_id,
          created_at,
          created_by,
          state,
          next_sequence,
          last_entry_hash
        FROM sphere_threads
        WHERE thread_id = $1
        FOR UPDATE
      `,
      [input.threadId]
    );

    if (result.rowCount === 0) {
      throw new ConductorError(500, 'STM_ERR_INTERNAL', 'Failed to lock thread row.');
    }

    return result.rows[0];
  }

  private isMaterialImpactIntent(intent: string): boolean {
    return this.governanceConfig.materialImpactIntents.has(normalizeIntent(intent));
  }

  private async enforceCounselQuorum(client: PoolClient, attestations: string[]): Promise<void> {
    const activeCounselorsResult = await client.query<{ counselor_did: string }>(
      `
        SELECT counselor_did
        FROM counselors
        WHERE is_active = TRUE
          AND revoked_at IS NULL
      `
    );

    const activeCounselors = new Set(
      activeCounselorsResult.rows.map((row) => row.counselor_did.trim()).filter(Boolean)
    );

    const approvedCounselors = new Set(
      attestations.map((value) => value.trim()).filter((did) => activeCounselors.has(did))
    );

    if (approvedCounselors.size < this.governanceConfig.quorumCount) {
      throw new ConductorError(
        412,
        'STM_ERR_MISSING_ATTESTATION',
        `Material-impact intent requires ${this.governanceConfig.quorumCount} counselor attestations.`
      );
    }
  }

  private signPayload(value: Record<string, unknown>): string {
    const canonical = canonicalize(value);
    return createHmac('sha256', this.conductorSecret).update(canonical).digest('hex');
  }

  private async ensureSchema(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sphere_threads (
        thread_id UUID PRIMARY KEY,
        mission_id UUID NOT NULL,
        created_by TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'ACTIVE',
        next_sequence BIGINT NOT NULL DEFAULT 1,
        last_entry_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sphere_threads_created_at ON sphere_threads(created_at);
      CREATE INDEX IF NOT EXISTS idx_sphere_threads_state ON sphere_threads(state);

      CREATE TABLE IF NOT EXISTS sphere_events (
        event_id BIGSERIAL PRIMARY KEY,
        thread_id UUID NOT NULL REFERENCES sphere_threads(thread_id) ON DELETE CASCADE,
        sequence BIGINT NOT NULL,
        message_id UUID NOT NULL,
        author_did TEXT NOT NULL,
        intent TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        client_envelope JSONB NOT NULL,
        ledger_envelope JSONB NOT NULL,
        payload JSONB NOT NULL,
        entry_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT sphere_events_thread_sequence_unique UNIQUE (thread_id, sequence),
        CONSTRAINT sphere_events_thread_message_unique UNIQUE (thread_id, message_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sphere_events_thread_sequence
        ON sphere_events(thread_id, sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_sphere_events_author ON sphere_events(author_did);
      CREATE INDEX IF NOT EXISTS idx_sphere_events_intent ON sphere_events(intent);

      CREATE TABLE IF NOT EXISTS counselors (
        id BIGSERIAL PRIMARY KEY,
        counselor_did TEXT NOT NULL,
        counselor_set TEXT NOT NULL DEFAULT 'security_council',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        CONSTRAINT counselors_did_unique UNIQUE (counselor_did)
      );

      CREATE INDEX IF NOT EXISTS idx_counselors_active ON counselors(is_active);
    `);
  }
}

\`\`\`

## engine/src/sphere/didRegistry.ts

```ts
export type AgentIdentity = {
  did: string;
  label?: string;
  publicKey?: string;
  registeredAt: string;
};

export class DidRegistry {
  private readonly identities = new Map<string, AgentIdentity>();

  register(identity: { did: string; label?: string; publicKey?: string }): AgentIdentity {
    const existing = this.identities.get(identity.did);
    if (existing) {
      return existing;
    }

    const created: AgentIdentity = {
      did: identity.did,
      label: identity.label,
      publicKey: identity.publicKey,
      registeredAt: new Date().toISOString()
    };

    this.identities.set(identity.did, created);
    return created;
  }

  get(did: string): AgentIdentity | null {
    return this.identities.get(did) ?? null;
  }

  has(did: string): boolean {
    return this.identities.has(did);
  }
}

\`\`\`

## engine/src/governance/governanceConfig.ts

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type GovernanceConfig = {
  configPath: string;
  materialImpactIntents: Set<string>;
  quorumCount: number;
};

function normalizeIntent(value: string): string {
  return value.trim().toUpperCase();
}

function stripInlineComment(value: string): string {
  const index = value.indexOf('#');
  return index === -1 ? value : value.slice(0, index);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseGovernanceYaml(raw: string): { materialImpactIntents: string[]; quorumCount: number } {
  const materialImpactIntents: string[] = [];
  let quorumCount: number | null = null;
  let section: 'none' | 'material_impact_intents' | 'quorum_rules' = 'none';

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = stripInlineComment(line);
    if (!withoutComment.trim()) {
      continue;
    }

    const trimmed = withoutComment.trim();

    if (trimmed === 'material_impact_intents:') {
      section = 'material_impact_intents';
      continue;
    }

    if (trimmed === 'quorum_rules:') {
      section = 'quorum_rules';
      continue;
    }

    if (section === 'material_impact_intents' && trimmed.startsWith('- ')) {
      const intent = normalizeIntent(unquote(trimmed.slice(2)));
      if (intent) {
        materialImpactIntents.push(intent);
      }
      continue;
    }

    if (section === 'quorum_rules' && trimmed.startsWith('value:')) {
      const valueRaw = unquote(trimmed.slice('value:'.length));
      const parsed = Number.parseInt(valueRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        quorumCount = parsed;
      }
      continue;
    }
  }

  if (materialImpactIntents.length === 0) {
    throw new Error('governance.yaml must include at least one material_impact_intents entry.');
  }

  if (quorumCount == null) {
    throw new Error('governance.yaml must define quorum_rules value.');
  }

  return { materialImpactIntents, quorumCount };
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveGovernanceConfigPath(configPath?: string): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    ...(configPath ? [path.resolve(cwd, configPath)] : []),
    path.resolve(cwd, 'governance/governance.yaml'),
    path.resolve(cwd, '../governance/governance.yaml'),
    path.resolve(cwd, '../../governance/governance.yaml')
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`governance.yaml not found. Checked: ${candidates.join(', ')}`);
}

export async function loadGovernanceConfig(options?: {
  configPath?: string;
}): Promise<GovernanceConfig> {
  const configPath = await resolveGovernanceConfigPath(options?.configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = parseGovernanceYaml(raw);

  return {
    configPath,
    materialImpactIntents: new Set(parsed.materialImpactIntents),
    quorumCount: parsed.quorumCount
  };
}

\`\`\`

## engine/src/governance/governanceConfig.test.ts

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGovernanceConfig } from './governanceConfig.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function writeGovernanceFile(contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'governance-config-'));
  tempDirs.push(dir);

  const file = path.join(dir, 'governance.yaml');
  await writeFile(file, contents, 'utf8');
  return file;
}

describe('loadGovernanceConfig', () => {
  it('loads material-impact intents and quorum count', async () => {
    const configPath = await writeGovernanceFile(`
material_impact_intents:
  - "FORCE_EVICT"
  - "AMEND_CONSTITUTION"

quorum_rules:
  - name: "default_quorum"
    type: "fixed_count"
    value: 3
`);

    const config = await loadGovernanceConfig({ configPath });

    expect(config.materialImpactIntents.has('FORCE_EVICT')).toBe(true);
    expect(config.materialImpactIntents.has('AMEND_CONSTITUTION')).toBe(true);
    expect(config.quorumCount).toBe(3);
  });

  it('throws when quorum is missing', async () => {
    const configPath = await writeGovernanceFile(`
material_impact_intents:
  - "FORCE_EVICT"
`);

    await expect(loadGovernanceConfig({ configPath })).rejects.toThrow(
      'governance.yaml must define quorum_rules value.'
    );
  });
});

\`\`\`

## engine/src/governance/policyLoader.ts

```ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const humanInLoopRequirementSchema = z.object({
  intent: z.string().min(1),
  approverRole: z.string().min(1)
});

const contactLensSchema = z.object({
  did: z.string().min(1),
  scope: z.string().min(1),
  permittedActivities: z.array(z.string().min(1)),
  prohibitedActions: z.array(z.string().min(1)),
  humanInTheLoopRequirements: z.array(humanInLoopRequirementSchema),
  interpretiveBoundaries: z.string().min(1)
});

const highRiskIntentRuleSchema = z.object({
  intent: z.string().min(1),
  rationale: z.string().min(1),
  approvalTimeoutSeconds: z.number().int().positive(),
  timeoutBehavior: z.enum(['REJECT', 'ALLOW_WITH_LOG'])
});

const breakGlassPolicySchema = z.object({
  intent: z.string().min(1),
  allowedInDegradedConsensus: z.boolean(),
  authorizedRoles: z.array(z.string().min(1)).min(1),
  dualControlRequired: z.boolean(),
  alternateAuthorization: z.string().min(1),
  auditFieldsRequired: z.array(z.string().min(1)).min(1)
});

const highRiskRegistrySchema = z.object({
  $schema: z.string().min(1).optional(),
  version: z.string().min(1),
  description: z.string().min(1),
  prismHolderApprovalRequired: z.array(highRiskIntentRuleSchema),
  breakGlassPolicy: breakGlassPolicySchema,
  degradedConsensusBlockedIntents: z.array(z.string().min(1)),
  auditOnlyIntents: z.array(z.string().min(1))
});

export type ContactLens = z.infer<typeof contactLensSchema>;
export type HighRiskIntentRule = z.infer<typeof highRiskIntentRuleSchema>;
export type HighRiskRegistry = z.infer<typeof highRiskRegistrySchema>;

export type GovernancePolicies = {
  governanceRoot: string;
  contactLensSchemaPath: string;
  highRiskRegistryPath: string;
  contactLensesPath: string;
  contactLensesByDid: Map<string, ContactLens>;
  highRiskRegistry: HighRiskRegistry;
  highRiskByIntent: Map<string, HighRiskIntentRule>;
  checksums: {
    contactLensSchema: string;
    highRiskRegistry: string;
    contactLenses: Record<string, string>;
  };
};

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeIntent(value: string): string {
  return value.trim().toUpperCase();
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target: string): Promise<{ parsed: unknown; raw: string }> {
  const raw = await fs.readFile(target, 'utf8');
  return { parsed: JSON.parse(raw), raw };
}

async function resolveGovernanceRoot(governanceDir?: string): Promise<string> {
  const cwd = process.cwd();
  const candidates = governanceDir
    ? [path.resolve(cwd, governanceDir)]
    : [
        path.resolve(cwd, 'governance'),
        path.resolve(cwd, '../governance'),
        path.resolve(cwd, '../../governance')
      ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Governance directory not found. Checked: ${candidates.join(', ')}`);
}

export async function loadGovernancePolicies(options?: { governanceDir?: string }): Promise<GovernancePolicies> {
  const governanceRoot = await resolveGovernanceRoot(options?.governanceDir);
  const contactLensSchemaPath = path.join(governanceRoot, 'contact_lens_schema.json');
  const highRiskRegistryPath = path.join(governanceRoot, 'high_risk_intent_registry.json');
  const contactLensesPath = path.join(governanceRoot, 'contact_lenses');

  const [{ raw: schemaRaw }, { parsed: highRiskRaw, raw: highRiskRawText }] = await Promise.all([
    readJson(contactLensSchemaPath),
    readJson(highRiskRegistryPath)
  ]);

  const highRiskRegistry = highRiskRegistrySchema.parse(highRiskRaw);
  const breakGlassIntent = normalizeIntent(highRiskRegistry.breakGlassPolicy.intent);
  const blockedIntents = new Set(
    highRiskRegistry.degradedConsensusBlockedIntents.map(normalizeIntent)
  );

  if (blockedIntents.has(breakGlassIntent)) {
    throw new Error(
      `Invalid governance policy: ${highRiskRegistry.breakGlassPolicy.intent} must not be listed in degradedConsensusBlockedIntents.`
    );
  }

  const highRiskByIntent = new Map<string, HighRiskIntentRule>(
    highRiskRegistry.prismHolderApprovalRequired.map((rule) => [rule.intent, rule])
  );

  const lensFiles = (await fs.readdir(contactLensesPath))
    .filter((entry) => entry.endsWith('.json'))
    .sort();

  const contactLensesByDid = new Map<string, ContactLens>();
  const contactLensesChecksums: Record<string, string> = {};

  for (const fileName of lensFiles) {
    const target = path.join(contactLensesPath, fileName);
    const { parsed, raw } = await readJson(target);
    const lens = contactLensSchema.parse(parsed);

    if (contactLensesByDid.has(lens.did)) {
      throw new Error(`Duplicate contact lens DID found: ${lens.did}`);
    }

    contactLensesByDid.set(lens.did, lens);
    contactLensesChecksums[fileName] = hashText(raw);
  }

  return {
    governanceRoot,
    contactLensSchemaPath,
    highRiskRegistryPath,
    contactLensesPath,
    contactLensesByDid,
    highRiskRegistry,
    highRiskByIntent,
    checksums: {
      contactLensSchema: hashText(schemaRaw),
      highRiskRegistry: hashText(highRiskRawText),
      contactLenses: contactLensesChecksums
    }
  };
}

\`\`\`

## engine/src/governance/contactLensValidator.ts

```ts
import type { GovernancePolicies } from './policyLoader.js';

export type ThreadGovernanceState = 'ACTIVE' | 'HALTED' | 'DEGRADED_NO_LLM';

export type BreakGlassContext = {
  actorDid?: string;
  actorRole?: string;
  confirmerDid?: string;
  confirmerRole?: string;
  emergencyCredential?: string;
  reason?: string;
};

export type IntentValidationInput = {
  intent: string;
  agentDid: string;
  threadState: ThreadGovernanceState;
  prismHolderApproved: boolean;
  breakGlass?: BreakGlassContext;
};

export type IntentValidationResult = {
  allowed: boolean;
  code?:
    | 'THREAD_HALTED'
    | 'INTENT_BLOCKED_IN_DEGRADED_MODE'
    | 'LENS_PROHIBITED_ACTION'
    | 'LENS_ACTION_NOT_PERMITTED'
    | 'PRISM_HOLDER_APPROVAL_REQUIRED'
    | 'BREAK_GLASS_AUTH_FAILED';
  message?: string;
  requiresApproval: boolean;
  highRisk: boolean;
};

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

export function createIntentValidator(policies: GovernancePolicies) {
  const blockedInDegraded = new Set(
    policies.highRiskRegistry.degradedConsensusBlockedIntents.map(normalize)
  );

  return function validateIntent(input: IntentValidationInput): IntentValidationResult {
    const normalizedIntent = normalize(input.intent);
    const highRiskRule = policies.highRiskByIntent.get(input.intent);
    const highRisk = Boolean(highRiskRule);
    const lens = policies.contactLensesByDid.get(input.agentDid);

    if (input.threadState === 'HALTED' && normalizedIntent !== 'EMERGENCY_SHUTDOWN') {
      return {
        allowed: false,
        code: 'THREAD_HALTED',
        message: 'Thread is halted and cannot accept this intent.',
        requiresApproval: false,
        highRisk
      };
    }

    const isBreakGlassIntent =
      normalize(policies.highRiskRegistry.breakGlassPolicy.intent) === normalizedIntent;

    if (
      input.threadState === 'DEGRADED_NO_LLM' &&
      blockedInDegraded.has(normalizedIntent) &&
      !isBreakGlassIntent
    ) {
      return {
        allowed: false,
        code: 'INTENT_BLOCKED_IN_DEGRADED_MODE',
        message: `Intent ${input.intent} is blocked while system is in DEGRADED_NO_LLM mode.`,
        requiresApproval: highRisk,
        highRisk
      };
    }

    if (lens) {
      const prohibited = lens.prohibitedActions.map(normalize);
      if (prohibited.includes(normalizedIntent)) {
        return {
          allowed: false,
          code: 'LENS_PROHIBITED_ACTION',
          message: `Intent ${input.intent} is prohibited by contact lens for ${input.agentDid}.`,
          requiresApproval: false,
          highRisk
        };
      }

      const permitted = lens.permittedActivities.map(normalize);
      if (permitted.length > 0 && !permitted.includes(normalizedIntent)) {
        return {
          allowed: false,
          code: 'LENS_ACTION_NOT_PERMITTED',
          message: `Intent ${input.intent} is not in permitted activities for ${input.agentDid}.`,
          requiresApproval: false,
          highRisk
        };
      }
    }

    const hasHumanRequirement = Boolean(
      lens?.humanInTheLoopRequirements.some((rule) => normalize(rule.intent) === normalizedIntent)
    );

    const requiresApproval = highRisk || hasHumanRequirement;

    if (isBreakGlassIntent && input.threadState === 'DEGRADED_NO_LLM') {
      const breakGlass = policies.highRiskRegistry.breakGlassPolicy;
      const actorRole = input.breakGlass?.actorRole?.trim();
      const actorAllowed = Boolean(actorRole && breakGlass.authorizedRoles.includes(actorRole));
      const confirmerRole = input.breakGlass?.confirmerRole?.trim();
      const authorizedConfirmer = Boolean(
        input.breakGlass?.confirmerDid?.trim() &&
          confirmerRole &&
          breakGlass.authorizedRoles.includes(confirmerRole)
      );
      const dualControlSatisfied =
        !breakGlass.dualControlRequired ||
        authorizedConfirmer ||
        Boolean(input.breakGlass?.emergencyCredential?.trim());
      const reasonProvided = Boolean(input.breakGlass?.reason?.trim());

      if (!actorAllowed || !dualControlSatisfied || !reasonProvided) {
        return {
          allowed: false,
          code: 'BREAK_GLASS_AUTH_FAILED',
          message:
            'Break-glass authorization failed for EMERGENCY_SHUTDOWN (role, dual-control/credential, or reason missing).',
          requiresApproval: false,
          highRisk
        };
      }

      return {
        allowed: true,
        requiresApproval: false,
        highRisk
      };
    }

    if (requiresApproval && !input.prismHolderApproved) {
      return {
        allowed: false,
        code: 'PRISM_HOLDER_APPROVAL_REQUIRED',
        message: `Intent ${input.intent} requires Prism Holder approval.`,
        requiresApproval,
        highRisk
      };
    }

    return {
      allowed: true,
      requiresApproval,
      highRisk
    };
  };
}

\`\`\`

## engine/src/governance/contactLensValidator.test.ts

```ts
import { describe, expect, it } from 'vitest';
import { createIntentValidator } from './contactLensValidator.js';
import type { GovernancePolicies } from './policyLoader.js';

function makePolicies(): GovernancePolicies {
  const highRiskRegistry = {
    version: '1.1',
    description: 'test',
    prismHolderApprovalRequired: [
      {
        intent: 'DISPATCH_MISSION',
        rationale: 'high risk',
        approvalTimeoutSeconds: 300,
        timeoutBehavior: 'REJECT' as const
      },
      {
        intent: 'EMERGENCY_SHUTDOWN',
        rationale: 'break glass',
        approvalTimeoutSeconds: 60,
        timeoutBehavior: 'ALLOW_WITH_LOG' as const
      }
    ],
    breakGlassPolicy: {
      intent: 'EMERGENCY_SHUTDOWN',
      allowedInDegradedConsensus: true,
      authorizedRoles: ['Prism Holder', 'Commander'],
      dualControlRequired: true,
      alternateAuthorization: 'PRE_APPROVED_EMERGENCY_CREDENTIAL',
      auditFieldsRequired: ['reason', 'actorDid', 'confirmerDid', 'timestamp']
    },
    degradedConsensusBlockedIntents: ['DISPATCH_MISSION'],
    auditOnlyIntents: []
  };

  const highRiskByIntent = new Map(
    highRiskRegistry.prismHolderApprovalRequired.map((rule) => [rule.intent, rule])
  );

  const contactLensesByDid = new Map([
    [
      'did:test:alpha',
      {
        did: 'did:test:alpha',
        scope: 'test scope',
        permittedActivities: ['DISPATCH_MISSION', 'MISSION_REPORT', 'EMERGENCY_SHUTDOWN'],
        prohibitedActions: ['MODIFY_CONTACT_LENS'],
        humanInTheLoopRequirements: [],
        interpretiveBoundaries: 'none'
      }
    ]
  ]);

  return {
    governanceRoot: '/tmp/governance',
    contactLensSchemaPath: '/tmp/governance/contact_lens_schema.json',
    highRiskRegistryPath: '/tmp/governance/high_risk_intent_registry.json',
    contactLensesPath: '/tmp/governance/contact_lenses',
    checksums: {
      contactLensSchema: 'x',
      highRiskRegistry: 'y',
      contactLenses: {}
    },
    highRiskRegistry,
    highRiskByIntent,
    contactLensesByDid
  };
}

describe('createIntentValidator', () => {
  it('rejects high-risk intent without prism holder approval', () => {
    const validate = createIntentValidator(makePolicies());

    const result = validate({
      intent: 'DISPATCH_MISSION',
      agentDid: 'did:test:alpha',
      threadState: 'ACTIVE',
      prismHolderApproved: false
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('PRISM_HOLDER_APPROVAL_REQUIRED');
  });

  it('allows break-glass emergency shutdown in degraded mode with dual control', () => {
    const validate = createIntentValidator(makePolicies());

    const result = validate({
      intent: 'EMERGENCY_SHUTDOWN',
      agentDid: 'did:test:alpha',
      threadState: 'DEGRADED_NO_LLM',
      prismHolderApproved: false,
      breakGlass: {
        actorDid: 'did:test:commander',
        actorRole: 'Commander',
        confirmerDid: 'did:test:observer',
        confirmerRole: 'Prism Holder',
        reason: 'safety stop'
      }
    });

    expect(result.allowed).toBe(true);
  });

  it('rejects break-glass emergency shutdown in degraded mode without controls', () => {
    const validate = createIntentValidator(makePolicies());

    const result = validate({
      intent: 'EMERGENCY_SHUTDOWN',
      agentDid: 'did:test:alpha',
      threadState: 'DEGRADED_NO_LLM',
      prismHolderApproved: false,
      breakGlass: {
        actorDid: 'did:test:commander',
        actorRole: 'Commander'
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('BREAK_GLASS_AUTH_FAILED');
  });
});

\`\`\`

## engine/src/db/schema.ts

```ts
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const games = pgTable(
  'games',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    question: text('question').notNull(),
    groupSize: integer('group_size').notNull(),
    provider: varchar('provider', { length: 10 }).notNull().default('morpheus'),
    entryMode: varchar('entry_mode', { length: 20 }).notNull().default('self_join'),
    status: varchar('status', { length: 30 }).notNull().default('draft'),
    inviteCode: varchar('invite_code', { length: 20 }).notNull(),
    positionRevealSeconds: integer('position_reveal_seconds').notNull().default(15),
    stateVersion: integer('state_version').notNull().default(0),
    deliberationPhase: varchar('deliberation_phase', { length: 30 }),
    archivedAt: timestamp('archived_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    inviteCodeUnique: uniqueIndex('games_invite_code_unique').on(table.inviteCode),
    statusIdx: index('games_status_idx').on(table.status)
  })
);

export const gamePlayers = pgTable(
  'game_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    seatNumber: integer('seat_number').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    accessToken: varchar('access_token', { length: 255 }).notNull(),
    avatarId: varchar('avatar_id', { length: 100 }).notNull(),
    avatarName: varchar('avatar_name', { length: 120 }).notNull(),
    epistemology: varchar('epistemology', { length: 160 }).notNull(),
    hintText: text('hint_text'),
    preRegistered: boolean('pre_registered').notNull().default(false),
    round1Complete: boolean('round1_complete').notNull().default(false),
    round2Complete: boolean('round2_complete').notNull().default(false),
    deliberationEligible: boolean('deliberation_eligible').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    gameSeatUnique: uniqueIndex('game_players_game_seat_unique').on(table.gameId, table.seatNumber),
    accessTokenUnique: uniqueIndex('game_players_access_token_unique').on(table.accessToken),
    gameIdIdx: index('game_players_game_id_idx').on(table.gameId)
  })
);

export const round1Responses = pgTable(
  'round1_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    playerId: uuid('player_id').notNull(),
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniquePlayerRound1: uniqueIndex('round1_responses_game_player_unique').on(table.gameId, table.playerId),
    gameIdx: index('round1_responses_game_idx').on(table.gameId)
  })
);

export const round2Assignments = pgTable(
  'round2_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    assigneePlayerId: uuid('assignee_player_id').notNull(),
    targetPlayerId: uuid('target_player_id').notNull(),
    promptText: text('prompt_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniqueAssignment: uniqueIndex('round2_assignments_unique').on(
      table.gameId,
      table.assigneePlayerId,
      table.targetPlayerId
    ),
    gameAssigneeIdx: index('round2_assignments_assignee_idx').on(table.gameId, table.assigneePlayerId)
  })
);

export const round2Responses = pgTable(
  'round2_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    assignmentId: uuid('assignment_id').notNull(),
    assigneePlayerId: uuid('assignee_player_id').notNull(),
    targetPlayerId: uuid('target_player_id').notNull(),
    content: text('content').notNull(),
    wordCount: integer('word_count').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    uniqueAssignmentResponse: uniqueIndex('round2_responses_assignment_unique').on(table.assignmentId),
    gameIdx: index('round2_responses_game_idx').on(table.gameId)
  })
);

export const synthesisArtifacts = pgTable(
  'synthesis_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id').notNull(),
    artifactType: varchar('artifact_type', { length: 30 }).notNull(),
    content: text('content').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    gameIdx: index('synthesis_artifacts_game_idx').on(table.gameId)
  })
);

export const commands = pgTable(
  'commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id'),
    commandType: varchar('command_type', { length: 60 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    dedupeKey: varchar('dedupe_key', { length: 120 }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: false }),
    finishedAt: timestamp('finished_at', { withTimezone: false })
  },
  (table) => ({
    dedupeKeyUnique: uniqueIndex('commands_dedupe_key_unique').on(table.dedupeKey),
    gameIdx: index('commands_game_idx').on(table.gameId),
    statusIdx: index('commands_status_idx').on(table.status)
  })
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id'),
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    gameIdx: index('audit_events_game_idx').on(table.gameId),
    eventIdx: index('audit_events_event_idx').on(table.eventType)
  })
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow()
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('admin_sessions_token_hash_unique').on(table.tokenHash),
    expiresIdx: index('admin_sessions_expires_idx').on(table.expiresAt)
  })
);

export const sphereThreads = pgTable(
  'sphere_threads',
  {
    threadId: uuid('thread_id').primaryKey(),
    missionId: uuid('mission_id').notNull(),
    createdBy: text('created_by').notNull(),
    state: varchar('state', { length: 40 }).notNull().default('ACTIVE'),
    nextSequence: bigint('next_sequence', { mode: 'number' }).notNull().default(1),
    lastEntryHash: text('last_entry_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdAtIdx: index('sphere_threads_created_at_idx').on(table.createdAt),
    stateIdx: index('sphere_threads_state_idx').on(table.state)
  })
);

export const sphereEvents = pgTable(
  'sphere_events',
  {
    eventId: bigserial('event_id', { mode: 'number' }).primaryKey(),
    threadId: uuid('thread_id').notNull(),
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    messageId: uuid('message_id').notNull(),
    authorDid: text('author_did').notNull(),
    intent: text('intent').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    clientEnvelope: jsonb('client_envelope').$type<Record<string, unknown>>().notNull(),
    ledgerEnvelope: jsonb('ledger_envelope').$type<Record<string, unknown>>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    entryHash: text('entry_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    threadSequenceUnique: uniqueIndex('sphere_events_thread_sequence_unique').on(
      table.threadId,
      table.sequence
    ),
    idempotencyUnique: uniqueIndex('sphere_events_thread_message_unique').on(
      table.threadId,
      table.messageId
    ),
    threadSequenceIdx: index('sphere_events_thread_sequence_idx').on(table.threadId, table.sequence),
    intentIdx: index('sphere_events_intent_idx').on(table.intent),
    authorIdx: index('sphere_events_author_idx').on(table.authorDid)
  })
);

export const counselors = pgTable(
  'counselors',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    counselorDid: text('counselor_did').notNull(),
    counselorSet: varchar('counselor_set', { length: 80 }).notNull().default('security_council'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true })
  },
  (table) => ({
    didUnique: uniqueIndex('counselors_did_unique').on(table.counselorDid),
    activeIdx: index('counselors_active_idx').on(table.isActive)
  })
);

export type Game = typeof games.$inferSelect;
export type GamePlayer = typeof gamePlayers.$inferSelect;
export type Round1Response = typeof round1Responses.$inferSelect;
export type Round2Assignment = typeof round2Assignments.$inferSelect;
export type Round2Response = typeof round2Responses.$inferSelect;
export type SynthesisArtifact = typeof synthesisArtifacts.$inferSelect;
export type Command = typeof commands.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type SphereThread = typeof sphereThreads.$inferSelect;
export type SphereEvent = typeof sphereEvents.$inferSelect;
export type Counselor = typeof counselors.$inferSelect;

\`\`\`

## governance/governance.yaml

```yaml
material_impact_intents:
  - "FORCE_EVICT"
  - "AMEND_CONSTITUTION"

quorum_rules:
  - name: "default_quorum"
    type: "fixed_count"
    value: 2

\`\`\`

## governance/high_risk_intent_registry.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": "1.1",
  "description": "Registry of intents classified as Material Impact under Metacanon Constitution Article VI.",
  "prismHolderApprovalRequired": [
    {
      "intent": "DISPATCH_MISSION",
      "rationale": "Initiates agent action with potential real-world consequences.",
      "approvalTimeoutSeconds": 300,
      "timeoutBehavior": "REJECT"
    },
    {
      "intent": "APPROVE_MATERIAL_IMPACT",
      "rationale": "Explicit Material Impact approval always requires Prism Holder sign-off.",
      "approvalTimeoutSeconds": 300,
      "timeoutBehavior": "REJECT"
    },
    {
      "intent": "RATCHET",
      "rationale": "Escalates constitutional threshold for an agent.",
      "approvalTimeoutSeconds": 600,
      "timeoutBehavior": "REJECT"
    },
    {
      "intent": "EMERGENCY_SHUTDOWN",
      "rationale": "Break-glass kill switch. Must remain executable even during degraded consensus.",
      "approvalTimeoutSeconds": 60,
      "timeoutBehavior": "ALLOW_WITH_LOG"
    },
    {
      "intent": "DEPLOY_CONSTELLATION",
      "rationale": "Activates multi-agent constellation with amplified impact.",
      "approvalTimeoutSeconds": 300,
      "timeoutBehavior": "REJECT"
    },
    {
      "intent": "MODIFY_CONTACT_LENS",
      "rationale": "Changes constitutional agent boundaries and requires governance review.",
      "approvalTimeoutSeconds": 600,
      "timeoutBehavior": "REJECT"
    }
  ],
  "breakGlassPolicy": {
    "intent": "EMERGENCY_SHUTDOWN",
    "allowedInDegradedConsensus": true,
    "authorizedRoles": [
      "Prism Holder",
      "Commander"
    ],
    "dualControlRequired": true,
    "alternateAuthorization": "PRE_APPROVED_EMERGENCY_CREDENTIAL",
    "auditFieldsRequired": [
      "reason",
      "actorDid",
      "confirmerDid",
      "timestamp"
    ]
  },
  "degradedConsensusBlockedIntents": [
    "DISPATCH_MISSION",
    "APPROVE_MATERIAL_IMPACT",
    "RATCHET",
    "DEPLOY_CONSTELLATION",
    "MODIFY_CONTACT_LENS"
  ],
  "auditOnlyIntents": [
    "STEER_MISSION",
    "RECALL_MISSION",
    "RATE_AGENT",
    "PRIORITY_OVERRIDE"
  ]
}

\`\`\`
