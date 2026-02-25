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
