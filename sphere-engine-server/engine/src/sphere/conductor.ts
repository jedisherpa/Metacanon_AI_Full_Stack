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
import {
  isDidKey,
  publicKeyStringToKeyObject,
  SignatureVerificationError,
  verifyCompactJwsEdDsa
} from './signatureVerification.js';

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

export type AckRecord = {
  ackId: number;
  threadId: string;
  targetSequence: number;
  targetMessageId: string;
  actorDid: string;
  ackMessageId: string;
  traceId: string;
  intent: string;
  schemaVersion: string;
  attestation: string[];
  agentSignature: string;
  receivedAt: string | null;
  acknowledgedAt: string;
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
  agentSignature?: string;
  idempotencyKey?: string;
  prismHolderApproved?: boolean;
  breakGlass?: BreakGlassContext;
  derivedFromVerifiedCommand?: boolean;
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

type SignatureVerificationMode = 'off' | 'did_key' | 'strict';

type ConductorOptions = {
  conductorSecret: string;
  validateIntent: IntentValidator;
  governanceConfigPath?: string;
  signatureVerificationMode?: SignatureVerificationMode;
  resolveDidPublicKey?: (did: string) => Promise<string | null>;
};

type ThreadLogEntryEvent = {
  threadId: string;
  entry: LogEntry;
};

type ThreadAckEntryEvent = {
  threadId: string;
  ack: AckRecord;
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

type EventLookupRow = {
  sequence: number;
  message_id: string;
};

type AckRow = {
  ack_id: number;
  thread_id: string;
  target_sequence: number;
  target_message_id: string;
  actor_did: string;
  ack_message_id: string;
  trace_id: string;
  intent: string;
  schema_version: string;
  attestation: string[];
  agent_signature: string;
  client_received_at: string | Date | null;
  acknowledged_at: string | Date;
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
  private readonly signatureVerificationMode: SignatureVerificationMode;
  private readonly resolveDidPublicKey?: (did: string) => Promise<string | null>;
  private globalState: 'ACTIVE' | 'DEGRADED_NO_LLM' = 'ACTIVE';
  private degradedNoLlmReason: string | null = null;
  private governanceConfig!: GovernanceConfig;
  private readonly ready: Promise<void>;

  private constructor(options: ConductorOptions) {
    super();
    this.conductorSecret = options.conductorSecret;
    this.validateIntent = options.validateIntent;
    this.governanceConfigPath = options.governanceConfigPath;
    this.signatureVerificationMode = options.signatureVerificationMode ?? 'did_key';
    this.resolveDidPublicKey = options.resolveDidPublicKey;
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

  async getThreadAcks(input: {
    threadId: string;
    cursor?: number;
    limit?: number;
    actorDid?: string;
  }): Promise<{ acks: AckRecord[]; nextCursor: number }> {
    await this.ensureReady();

    const rawCursor = input.cursor ?? 0;
    const cursor = Number.isFinite(rawCursor) ? Math.max(0, rawCursor) : 0;
    const rawLimit = input.limit ?? 100;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
    const actorDid = input.actorDid?.trim();

    const result = actorDid
      ? await pool.query<AckRow>(
          `
            SELECT
              ack_id,
              thread_id,
              target_sequence,
              target_message_id,
              actor_did,
              ack_message_id,
              trace_id,
              intent,
              schema_version,
              attestation,
              agent_signature,
              client_received_at,
              acknowledged_at
            FROM sphere_acks
            WHERE thread_id = $1
              AND ack_id > $2
              AND actor_did = $3
            ORDER BY ack_id ASC
            LIMIT $4
          `,
          [input.threadId, cursor, actorDid, limit]
        )
      : await pool.query<AckRow>(
          `
            SELECT
              ack_id,
              thread_id,
              target_sequence,
              target_message_id,
              actor_did,
              ack_message_id,
              trace_id,
              intent,
              schema_version,
              attestation,
              agent_signature,
              client_received_at,
              acknowledged_at
            FROM sphere_acks
            WHERE thread_id = $1
              AND ack_id > $2
            ORDER BY ack_id ASC
            LIMIT $3
          `,
          [input.threadId, cursor, limit]
        );

    const acks = result.rows.map((row) => this.rowToAckRecord(row));
    const nextCursor = acks.length > 0 ? acks[acks.length - 1].ackId : cursor;
    return { acks, nextCursor };
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

      const canonicalAgentPayload = canonicalize({
        clientEnvelope: clientEnvelopeBase,
        payload: input.payload
      });
      const legacyAgentPayload = {
        envelope: clientEnvelopeBase,
        payload: input.payload,
        signer: input.authorAgentId
      };
      const agentSignature = await this.resolveAgentSignature({
        signerDid: input.authorAgentId,
        providedSignature: input.agentSignature,
        canonicalPayload: canonicalAgentPayload,
        legacyPayload: legacyAgentPayload,
        context: 'dispatch',
        allowInternalFallback:
          Boolean(input.derivedFromVerifiedCommand) && input.authorAgentId === 'did:system:conductor'
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
    messageId: string;
    traceId: string;
    intent: string;
    schemaVersion: string;
    attestation: string[];
    agentSignature: string;
    confirmerDid?: string;
    confirmerRole?: string;
    emergencyCredential?: string;
    reason: string;
    prismHolderApproved?: boolean;
  }): Promise<{ haltedCount: number; threadIds: string[] }> {
    await this.ensureReady();

    const normalizedIntent = normalizeIntent(input.intent);
    if (normalizedIntent !== 'EMERGENCY_SHUTDOWN') {
      throw new ConductorError(
        400,
        'STM_ERR_INVALID_SCHEMA',
        'haltAllThreads intent must be EMERGENCY_SHUTDOWN.'
      );
    }

    const threads = await this.listThreads();
    if (threads.length === 0) {
      return { haltedCount: 0, threadIds: [] };
    }

    const controlThread = threads[0];
    const auditTimestamp = new Date().toISOString();
    const authorizationMode = input.confirmerDid ? 'DUAL_CONTROL' : 'EMERGENCY_CREDENTIAL';
    const controlEntry = await this.dispatchIntent({
      threadId: controlThread.threadId,
      missionId: controlThread.missionId,
      authorAgentId: input.actorDid,
      messageId: input.messageId,
      intent: normalizedIntent,
      payload: {
        actorDid: input.actorDid,
        reason: input.reason,
        actorRole: input.actorRole,
        confirmerDid: input.confirmerDid ?? null,
        confirmerRole: input.confirmerRole ?? null,
        authorizationMode,
        auditTimestamp,
        haltAll: {
          controlEvent: true,
          targetThreadCount: threads.length
        }
      },
      schemaVersion: input.schemaVersion,
      traceId: input.traceId,
      attestation: input.attestation,
      agentSignature: input.agentSignature,
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

    const haltedIds: string[] = [];
    haltedIds.push(controlThread.threadId);

    for (const thread of threads.slice(1)) {
      await this.dispatchIntent({
        threadId: thread.threadId,
        missionId: thread.missionId,
        authorAgentId: 'did:system:conductor',
        intent: normalizedIntent,
        payload: {
          sourceActorDid: input.actorDid,
          reason: input.reason,
          actorRole: input.actorRole,
          confirmerDid: input.confirmerDid ?? null,
          confirmerRole: input.confirmerRole ?? null,
          authorizationMode,
          auditTimestamp,
          haltAll: {
            controlEvent: false,
            sourceMessageId: controlEntry.clientEnvelope.messageId,
            sourceTraceId: input.traceId
          }
        },
        schemaVersion: input.schemaVersion,
        traceId: input.traceId,
        causationId: [controlEntry.clientEnvelope.messageId],
        prismHolderApproved: Boolean(input.prismHolderApproved),
        breakGlass: {
          actorDid: input.actorDid,
          actorRole: input.actorRole,
          confirmerDid: input.confirmerDid,
          confirmerRole: input.confirmerRole,
          emergencyCredential: input.emergencyCredential,
          reason: input.reason
        },
        derivedFromVerifiedCommand: true
      });

      haltedIds.push(thread.threadId);
    }

    return { haltedCount: haltedIds.length, threadIds: haltedIds };
  }

  async acknowledgeEntry(input: {
    threadId: string;
    actorDid: string;
    targetSequence?: number;
    targetMessageId?: string;
    ackMessageId?: string;
    traceId?: string;
    intent?: string;
    schemaVersion?: string;
    attestation?: string[];
    agentSignature?: string;
    receivedAt?: string;
  }): Promise<AckRecord> {
    await this.ensureReady();

    if (!input.targetSequence && !input.targetMessageId) {
      throw new ConductorError(
        400,
        'STM_ERR_INVALID_ACK',
        'ACK must include targetSequence or targetMessageId.'
      );
    }

    const normalizedIntent = normalizeIntent(input.intent ?? 'ACK_ENTRY');
    if (normalizedIntent !== 'ACK_ENTRY') {
      throw new ConductorError(400, 'STM_ERR_INVALID_ACK', 'ACK intent must be ACK_ENTRY.');
    }

    const ackMessageId = input.ackMessageId ?? randomUUID();
    const traceId = input.traceId ?? randomUUID();
    const schemaVersion = input.schemaVersion ?? '3.0';
    const attestation = input.attestation ?? [];
    const receivedAt = input.receivedAt ? toIsoString(input.receivedAt) : null;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const targetResult = input.targetSequence
        ? await client.query<EventLookupRow>(
            `
              SELECT sequence, message_id
              FROM sphere_events
              WHERE thread_id = $1 AND sequence = $2
              LIMIT 1
            `,
            [input.threadId, input.targetSequence]
          )
        : await client.query<EventLookupRow>(
            `
              SELECT sequence, message_id
              FROM sphere_events
              WHERE thread_id = $1 AND message_id = $2
              LIMIT 1
            `,
            [input.threadId, input.targetMessageId]
          );

      if (targetResult.rowCount === 0) {
        throw new ConductorError(
          404,
          'STM_ERR_EVENT_NOT_FOUND',
          'Cannot acknowledge a missing thread event.'
        );
      }

      const target = targetResult.rows[0];
      const targetSequence = Number(target.sequence);
      const targetMessageId = target.message_id;

      const ackPayload = {
        threadId: input.threadId,
        actorDid: input.actorDid,
        targetSequence,
        targetMessageId,
        ackMessageId,
        traceId,
        intent: normalizedIntent,
        schemaVersion,
        attestation,
        receivedAt
      };
      const canonicalAckPayload = canonicalize(ackPayload);
      const agentSignature = await this.resolveAgentSignature({
        signerDid: input.actorDid,
        providedSignature: input.agentSignature,
        canonicalPayload: canonicalAckPayload,
        legacyPayload: ackPayload,
        context: 'ack'
      });

      const ackResult = await client.query<AckRow>(
        `
          INSERT INTO sphere_acks (
            thread_id,
            target_sequence,
            target_message_id,
            actor_did,
            ack_message_id,
            trace_id,
            intent,
            schema_version,
            attestation,
            agent_signature,
            client_received_at,
            acknowledged_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::jsonb,
            $10,
            $11,
            NOW()
          )
          ON CONFLICT (thread_id, actor_did, target_sequence) DO UPDATE SET
            ack_message_id = EXCLUDED.ack_message_id,
            trace_id = EXCLUDED.trace_id,
            intent = EXCLUDED.intent,
            schema_version = EXCLUDED.schema_version,
            attestation = EXCLUDED.attestation,
            agent_signature = EXCLUDED.agent_signature,
            client_received_at = EXCLUDED.client_received_at,
            acknowledged_at = NOW()
          RETURNING
            ack_id,
            thread_id,
            target_sequence,
            target_message_id,
            actor_did,
            ack_message_id,
            trace_id,
            intent,
            schema_version,
            attestation,
            agent_signature,
            client_received_at,
            acknowledged_at
        `,
        [
          input.threadId,
          targetSequence,
          targetMessageId,
          input.actorDid,
          ackMessageId,
          traceId,
          normalizedIntent,
          schemaVersion,
          JSON.stringify(attestation),
          agentSignature,
          receivedAt
        ]
      );

      await client.query('COMMIT');

      const ackRecord = this.rowToAckRecord(ackResult.rows[0]);
      const event: ThreadAckEntryEvent = { threadId: ackRecord.threadId, ack: ackRecord };
      this.emit('ack_entry', event);
      this.emit(`thread:${ackRecord.threadId}:ack`, ackRecord);
      return ackRecord;
    } catch (error) {
      await client.query('ROLLBACK');

      if (error instanceof ConductorError) {
        throw error;
      }

      throw new ConductorError(500, 'STM_ERR_INTERNAL', 'Unexpected internal error during ACK.');
    } finally {
      client.release();
    }
  }

  private rowToAckRecord(row: AckRow): AckRecord {
    return {
      ackId: Number(row.ack_id),
      threadId: row.thread_id,
      targetSequence: Number(row.target_sequence),
      targetMessageId: row.target_message_id,
      actorDid: row.actor_did,
      ackMessageId: row.ack_message_id,
      traceId: row.trace_id,
      intent: row.intent,
      schemaVersion: row.schema_version,
      attestation: row.attestation,
      agentSignature: row.agent_signature,
      receivedAt: row.client_received_at ? toIsoString(row.client_received_at) : null,
      acknowledgedAt: toIsoString(row.acknowledged_at)
    };
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

  private async resolveAgentSignature(params: {
    signerDid: string;
    providedSignature?: string;
    canonicalPayload: string;
    legacyPayload: Record<string, unknown>;
    context: 'dispatch' | 'ack';
    allowInternalFallback?: boolean;
  }): Promise<string> {
    const signature = params.providedSignature?.trim();
    if (this.signatureVerificationMode === 'off') {
      return signature && signature.length > 0 ? signature : this.signPayload(params.legacyPayload);
    }

    if (isDidKey(params.signerDid)) {
      if (!signature) {
        throw new ConductorError(
          401,
          'STM_ERR_INVALID_SIGNATURE',
          `Missing agentSignature for did:key signer in ${params.context}.`
        );
      }
      this.verifyJwsSignatureWithKey({
        signerDid: params.signerDid,
        compactJws: signature,
        canonicalPayload: params.canonicalPayload,
        publicKeyRef: params.signerDid
      });
      return signature;
    }

    const publicKeyRef = this.resolveDidPublicKey ? await this.resolveDidPublicKey(params.signerDid) : null;
    const normalizedPublicKeyRef = publicKeyRef?.trim() ? publicKeyRef.trim() : null;
    if (normalizedPublicKeyRef) {
      if (!signature) {
        throw new ConductorError(
          401,
          'STM_ERR_INVALID_SIGNATURE',
          `Missing agentSignature for signer with registered public key in ${params.context}.`
        );
      }

      this.verifyJwsSignatureWithKey({
        signerDid: params.signerDid,
        compactJws: signature,
        canonicalPayload: params.canonicalPayload,
        publicKeyRef: normalizedPublicKeyRef
      });
      return signature;
    }

    if (this.signatureVerificationMode === 'strict') {
      if (params.allowInternalFallback) {
        return this.signPayload(params.legacyPayload);
      }
      throw new ConductorError(
        401,
        'STM_ERR_INVALID_SIGNATURE',
        `Strict signature verification requires a verifiable Ed25519 key for signer (${params.context}).`
      );
    }

    // In did_key mode, non-verifiable signers are compatibility-only and must not persist
    // unverified caller signatures. Re-sign internally for deterministic legacy behavior.
    return this.signPayload(params.legacyPayload);
  }

  private verifyJwsSignatureWithKey(params: {
    signerDid: string;
    compactJws: string;
    canonicalPayload: string;
    publicKeyRef: string;
  }): void {
    try {
      verifyCompactJwsEdDsa({
        compactJws: params.compactJws,
        canonicalPayload: params.canonicalPayload,
        publicKey: publicKeyStringToKeyObject(params.publicKeyRef)
      });
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        throw new ConductorError(
          401,
          'STM_ERR_INVALID_SIGNATURE',
          `${error.message} (signer: ${params.signerDid})`
        );
      }
      throw error;
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

      CREATE TABLE IF NOT EXISTS sphere_acks (
        ack_id BIGSERIAL PRIMARY KEY,
        thread_id UUID NOT NULL REFERENCES sphere_threads(thread_id) ON DELETE CASCADE,
        target_sequence BIGINT NOT NULL,
        target_message_id UUID NOT NULL,
        actor_did TEXT NOT NULL,
        ack_message_id UUID NOT NULL,
        trace_id UUID NOT NULL,
        intent TEXT NOT NULL DEFAULT 'ACK_ENTRY',
        schema_version TEXT NOT NULL DEFAULT '3.0',
        attestation JSONB NOT NULL DEFAULT '[]'::jsonb,
        agent_signature TEXT NOT NULL,
        client_received_at TIMESTAMPTZ,
        acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT sphere_acks_unique UNIQUE (thread_id, actor_did, target_sequence),
        CONSTRAINT sphere_acks_message_unique UNIQUE (thread_id, ack_message_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sphere_acks_thread_sequence
        ON sphere_acks(thread_id, target_sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_sphere_acks_actor
        ON sphere_acks(actor_did);
    `);
  }
}
