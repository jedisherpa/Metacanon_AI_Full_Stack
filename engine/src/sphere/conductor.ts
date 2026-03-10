import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
  type KeyObject
} from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { PoolClient } from 'pg';
import { pool } from '../db/client.js';
import { env } from '../config/env.js';
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
import {
  GovernanceTelemetry,
  type GovernanceTelemetrySnapshot,
  type SignatureVerificationMode
} from './governanceTelemetry.js';

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

export type GovernanceHashSnapshot = {
  highRiskRegistryHash: string;
  contactLensPackHash: string;
  governanceConfigHash: string;
};

export type LedgerEnvelope = {
  schemaVersion: string;
  sequence: number;
  prevMessageHash: string;
  timestamp: string;
  governance: GovernanceHashSnapshot;
  conductorSignature: string;
  conductorSignatureV2?: {
    alg: 'Ed25519';
    keyId: string;
    signature: string;
  };
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

export type ConductorKeyStatus = 'ACTIVE' | 'RETIRED';
export type ConductorKeyVerificationState = 'active' | 'retired_within_grace' | 'retired_expired';

export type ConductorKeyRecord = {
  keyId: string;
  publicKey: string;
  status: ConductorKeyStatus;
  activationDate: string;
  retirementDate: string | null;
  verificationGraceDays: number;
  createdAt: string;
  updatedAt: string;
  hasEncryptedPrivateMaterial: boolean;
  gracePeriodEndsAt: string | null;
  verificationState: ConductorKeyVerificationState;
  verificationExpired: boolean;
};

export type RotateConductorKeyResult = {
  key: ConductorKeyRecord;
  previousActiveKeyId: string | null;
  gracePeriodEndsAt: string | null;
  privateKeyPem: string;
};

export type RetireConductorKeyResult = {
  key: ConductorKeyRecord;
  gracePeriodEndsAt: string | null;
};

export type LedgerVerificationIssueCode =
  | 'SEQUENCE_MISMATCH'
  | 'PREV_HASH_MISMATCH'
  | 'ENTRY_HASH_MISMATCH'
  | 'MISSING_GOVERNANCE_HASHES'
  | 'MISSING_CONDUCTOR_SIGNATURE_V2'
  | 'INVALID_CONDUCTOR_SIGNATURE_V2'
  | 'MALFORMED_CONDUCTOR_SIGNATURE_V2'
  | 'EXPIRED_CONDUCTOR_SIGNATURE_V2_KEY'
  | 'UNKNOWN_CONDUCTOR_SIGNATURE_V2_KEY'
  | 'THREAD_TAIL_HASH_MISMATCH';

export type LedgerVerificationIssue = {
  code: LedgerVerificationIssueCode;
  message: string;
  sequence?: number;
  expected?: string;
  actual?: string;
};

export type ThreadLedgerVerificationReport = {
  threadId: string;
  verified: boolean;
  checkedEntries: number;
  latestSequence: number;
  latestEntryHash: string | null;
  generatedAt: string;
  issues: LedgerVerificationIssue[];
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

export function normalizeSetLikeStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function deriveDeterministicMessageId(seed: string): string {
  const digest = sha256(seed);
  const versioned = `${digest.slice(0, 8)}${digest.slice(8, 12)}5${digest.slice(13, 16)}a${digest.slice(17, 20)}${digest.slice(20, 32)}`;

  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20, 32)}`;
}

function normalizeMultilineKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
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

const UNKNOWN_GOVERNANCE_HASH = createHash('sha256')
  .update('governance-unavailable')
  .digest('hex');

function normalizeGovernanceHash(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNKNOWN_GOVERNANCE_HASH;
}

export function createGovernanceHashSnapshot(
  value: Partial<GovernanceHashSnapshot> | undefined
): GovernanceHashSnapshot {
  return {
    highRiskRegistryHash: normalizeGovernanceHash(value?.highRiskRegistryHash),
    contactLensPackHash: normalizeGovernanceHash(value?.contactLensPackHash),
    governanceConfigHash: normalizeGovernanceHash(value?.governanceConfigHash)
  };
}

type IntentValidator = (input: IntentValidationInput) => IntentValidationResult;

type ConductorOptions = {
  conductorSecret: string;
  conductorEd25519PrivateKey?: string;
  conductorEd25519KeyId?: string;
  conductorEd25519PublicKeys?: Record<string, string>;
  conductorRotationGraceDaysDefault?: number;
  requireConductorSignatureV2?: boolean;
  conductorSignatureV2ActivationAt?: string;
  conductorSignatureV2GraceDays?: number;
  validateIntent: IntentValidator;
  governanceConfigPath?: string;
  governanceHashes?: Partial<GovernanceHashSnapshot>;
  signatureVerificationMode?: SignatureVerificationMode;
  resolveDidPublicKey?: (did: string) => Promise<string | null>;
};

export type ConductorSigningMode = 'hmac_sha256_internal' | 'dual_hmac_sha256_plus_ed25519';

export type ConductorSignatureProfile = {
  mode: ConductorSigningMode;
  algorithms: readonly string[];
  ed25519KeyId: string | null;
};

export type ConductorSignatureVerificationPolicy = {
  requireV2: boolean;
  activationAt: string | null;
  graceDays: number;
};

type ThreadLogEntryEvent = {
  threadId: string;
  entry: LogEntry;
};

type ThreadAckEntryEvent = {
  threadId: string;
  ack: AckRecord;
};

type ConductorDbKeyRow = {
  key_id: string;
  public_key: string;
  status: ConductorKeyStatus;
  activation_date: string | Date;
  retirement_date: string | Date | null;
  verification_grace_days: number;
  private_key_ciphertext: string | null;
  private_key_iv: string | null;
  private_key_tag: string | null;
  created_at: string | Date;
  updated_at: string | Date;
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

type EventVerificationRow = {
  sequence: number;
  client_envelope: ClientEnvelope;
  ledger_envelope: LedgerEnvelope;
  payload: Record<string, unknown>;
  entry_hash: string;
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

type ConductorKeyMaterial = {
  keyId: string;
  publicKeyRef: string;
  publicKey: KeyObject;
  status: ConductorKeyStatus;
  activationDate: string;
  retirementDate: string | null;
  verificationGraceDays: number;
};

function statusForValidationCode(code: IntentValidationResult['code']): number {
  switch (code) {
    case 'THREAD_HALTED':
      return 412;
    case 'LENS_NOT_FOUND':
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
  private conductorEd25519PrivateKey: KeyObject | null;
  private conductorEd25519KeyId: string | null;
  private readonly conductorEd25519PublicKeys: Map<string, ConductorKeyMaterial>;
  private readonly bootstrapConductorEd25519PublicKeys: Record<string, string>;
  private readonly bootstrapConductorEd25519PrivateKeyPem: string | null;
  private readonly bootstrapConductorEd25519KeyId: string | null;
  private readonly conductorRotationGraceDaysDefault: number;
  private readonly requireConductorSignatureV2: boolean;
  private readonly conductorSignatureV2ActivationAt: string | null;
  private readonly conductorSignatureV2GraceDays: number;
  private readonly validateIntent: IntentValidator;
  private readonly governanceHashes: GovernanceHashSnapshot;
  private readonly governanceConfigPath?: string;
  private readonly signatureVerificationMode: SignatureVerificationMode;
  private readonly resolveDidPublicKey?: (did: string) => Promise<string | null>;
  private readonly governanceTelemetry: GovernanceTelemetry;
  private globalState: 'ACTIVE' | 'DEGRADED_NO_LLM' = 'ACTIVE';
  private degradedNoLlmReason: string | null = null;
  private governanceConfig!: GovernanceConfig;
  private readonly ready: Promise<void>;

  private constructor(options: ConductorOptions) {
    super();
    this.conductorSecret = options.conductorSecret;
    this.conductorEd25519PublicKeys = new Map();
    this.requireConductorSignatureV2 = options.requireConductorSignatureV2 ?? false;
    this.conductorSignatureV2ActivationAt = options.conductorSignatureV2ActivationAt ?? null;
    this.conductorSignatureV2GraceDays = Math.max(0, options.conductorSignatureV2GraceDays ?? 0);
    this.conductorRotationGraceDaysDefault = Math.max(
      0,
      options.conductorRotationGraceDaysDefault ?? this.conductorSignatureV2GraceDays
    );
    this.bootstrapConductorEd25519PublicKeys = options.conductorEd25519PublicKeys ?? {};

    const ed25519PrivateKeyPemRaw = options.conductorEd25519PrivateKey?.trim() ?? null;
    const ed25519KeyId = options.conductorEd25519KeyId?.trim() ?? null;
    if (Boolean(ed25519PrivateKeyPemRaw) !== Boolean(ed25519KeyId)) {
      throw new Error(
        'CONDUCTOR_ED25519_PRIVATE_KEY and CONDUCTOR_ED25519_KEY_ID must both be provided together.'
      );
    }
    if (ed25519PrivateKeyPemRaw && ed25519KeyId) {
      const ed25519PrivateKeyPem = normalizeMultilineKey(ed25519PrivateKeyPemRaw);
      try {
        this.conductorEd25519PrivateKey = createPrivateKey(ed25519PrivateKeyPem);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid Ed25519 private key.';
        throw new Error(`Failed to initialize conductor Ed25519 private key: ${message}`);
      }
      this.conductorEd25519KeyId = ed25519KeyId;
      this.bootstrapConductorEd25519PrivateKeyPem = ed25519PrivateKeyPem;
      this.bootstrapConductorEd25519KeyId = ed25519KeyId;
    } else {
      this.conductorEd25519PrivateKey = null;
      this.conductorEd25519KeyId = null;
      this.bootstrapConductorEd25519PrivateKeyPem = null;
      this.bootstrapConductorEd25519KeyId = null;
    }
    this.validateIntent = options.validateIntent;
    this.governanceHashes = createGovernanceHashSnapshot(options.governanceHashes);
    this.governanceConfigPath = options.governanceConfigPath;
    this.signatureVerificationMode = options.signatureVerificationMode ?? 'did_key';
    this.resolveDidPublicKey = options.resolveDidPublicKey;
    this.governanceTelemetry = new GovernanceTelemetry();
    this.ready = this.bootstrap();
  }

  static async create(options: ConductorOptions): Promise<SphereConductor> {
    const instance = new SphereConductor(options);
    await instance.ready;
    return instance;
  }

  private async bootstrap(): Promise<void> {
    await this.ensureSchema();
    await this.seedConductorKeyRegistryFromBootstrapInputs();
    await this.loadConductorKeyRegistryFromDb();
    if (this.requireConductorSignatureV2 && this.conductorEd25519PublicKeys.size === 0) {
      throw new Error(
        'SPHERE_LEDGER_REQUIRE_V2_SIGNATURE is enabled but no conductor keys are available in database.'
      );
    }
    this.governanceConfig = await loadGovernanceConfig({
      configPath: this.governanceConfigPath
    });
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private encryptionKeyBuffer(): Buffer {
    return createHash('sha256').update(this.conductorSecret).digest();
  }

  private encryptPrivateKeyPem(privateKeyPem: string): {
    ciphertext: string;
    iv: string;
    tag: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKeyBuffer(), iv);
    const encrypted = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  private decryptPrivateKeyPem(params: { ciphertext: string; iv: string; tag: string }): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKeyBuffer(),
      Buffer.from(params.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(params.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(params.ciphertext, 'base64')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  }

  private rowToConductorKeyRecord(row: ConductorDbKeyRow): ConductorKeyRecord {
    const retirementDate = row.retirement_date ? toIsoString(row.retirement_date) : null;
    const verificationGraceDays = Number(row.verification_grace_days ?? 0);
    const graceMs = Math.max(0, verificationGraceDays) * 24 * 60 * 60 * 1000;
    const retirementMs = retirementDate ? Date.parse(retirementDate) : Number.NaN;
    const hasRetirementDate = !Number.isNaN(retirementMs);
    const gracePeriodEndsAt = hasRetirementDate ? new Date(retirementMs + graceMs).toISOString() : null;
    const verificationExpired =
      row.status === 'RETIRED' && hasRetirementDate ? Date.now() > retirementMs + graceMs : false;
    const verificationState: ConductorKeyVerificationState =
      row.status === 'ACTIVE'
        ? 'active'
        : verificationExpired
          ? 'retired_expired'
          : 'retired_within_grace';

    return {
      keyId: row.key_id,
      publicKey: row.public_key,
      status: row.status,
      activationDate: toIsoString(row.activation_date),
      retirementDate,
      verificationGraceDays,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
      hasEncryptedPrivateMaterial:
        Boolean(row.private_key_ciphertext) && Boolean(row.private_key_iv) && Boolean(row.private_key_tag),
      gracePeriodEndsAt,
      verificationState,
      verificationExpired
    };
  }

  private rowToConductorKeyMaterial(row: ConductorDbKeyRow): ConductorKeyMaterial {
    return {
      keyId: row.key_id,
      publicKeyRef: row.public_key,
      publicKey: createPublicKey(normalizeMultilineKey(row.public_key)),
      status: row.status,
      activationDate: toIsoString(row.activation_date),
      retirementDate: row.retirement_date ? toIsoString(row.retirement_date) : null,
      verificationGraceDays: Number(row.verification_grace_days ?? 0)
    };
  }

  private async seedConductorKeyRegistryFromBootstrapInputs(): Promise<void> {
    const bootstrapPublicKeys = Object.entries(this.bootstrapConductorEd25519PublicKeys ?? {});
    for (const [keyIdRaw, publicKeyRaw] of bootstrapPublicKeys) {
      const keyId = keyIdRaw.trim();
      const publicKeyPem = publicKeyRaw?.trim();
      if (!keyId || !publicKeyPem) {
        continue;
      }

      // Validate key shape before persistence.
      createPublicKey(normalizeMultilineKey(publicKeyPem));
      await pool.query(
        `
          INSERT INTO conductor_keys (
            key_id,
            public_key,
            status,
            activation_date,
            verification_grace_days,
            created_at,
            updated_at
          )
          VALUES ($1, $2, 'RETIRED', NOW(), 0, NOW(), NOW())
          ON CONFLICT (key_id) DO UPDATE
          SET
            public_key = EXCLUDED.public_key,
            updated_at = NOW()
        `,
        [keyId, normalizeMultilineKey(publicKeyPem)]
      );
    }

    if (!this.bootstrapConductorEd25519PrivateKeyPem || !this.bootstrapConductorEd25519KeyId) {
      return;
    }

    const publicKeyPem = createPublicKey(this.conductorEd25519PrivateKey as KeyObject)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    const encryptedPrivateKey = this.encryptPrivateKeyPem(this.bootstrapConductorEd25519PrivateKeyPem);

    await pool.query('BEGIN');
    try {
      await pool.query(
        `
          UPDATE conductor_keys
          SET
            status = 'RETIRED',
            retirement_date = COALESCE(retirement_date, NOW()),
            verification_grace_days = $2,
            updated_at = NOW()
          WHERE status = 'ACTIVE'
            AND key_id <> $1
        `,
        [this.bootstrapConductorEd25519KeyId, this.conductorRotationGraceDaysDefault]
      );

      await pool.query(
        `
          INSERT INTO conductor_keys (
            key_id,
            public_key,
            status,
            activation_date,
            retirement_date,
            verification_grace_days,
            private_key_ciphertext,
            private_key_iv,
            private_key_tag,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            'ACTIVE',
            NOW(),
            NULL,
            0,
            $3,
            $4,
            $5,
            NOW(),
            NOW()
          )
          ON CONFLICT (key_id) DO UPDATE
          SET
            public_key = EXCLUDED.public_key,
            status = 'ACTIVE',
            retirement_date = NULL,
            verification_grace_days = 0,
            private_key_ciphertext = EXCLUDED.private_key_ciphertext,
            private_key_iv = EXCLUDED.private_key_iv,
            private_key_tag = EXCLUDED.private_key_tag,
            updated_at = NOW()
        `,
        [
          this.bootstrapConductorEd25519KeyId,
          publicKeyPem,
          encryptedPrivateKey.ciphertext,
          encryptedPrivateKey.iv,
          encryptedPrivateKey.tag
        ]
      );

      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  private async loadConductorKeyRegistryFromDb(): Promise<void> {
    const keysResult = await pool.query<ConductorDbKeyRow>(
      `
        SELECT
          key_id,
          public_key,
          status,
          activation_date,
          retirement_date,
          verification_grace_days,
          private_key_ciphertext,
          private_key_iv,
          private_key_tag,
          created_at,
          updated_at
        FROM conductor_keys
        ORDER BY activation_date ASC, created_at ASC
      `
    );

    this.conductorEd25519PublicKeys.clear();
    let activeRow: ConductorDbKeyRow | null = null;
    for (const row of keysResult.rows) {
      this.conductorEd25519PublicKeys.set(row.key_id, this.rowToConductorKeyMaterial(row));
      if (row.status === 'ACTIVE') {
        activeRow = row;
      }
    }

    if (activeRow?.private_key_ciphertext && activeRow.private_key_iv && activeRow.private_key_tag) {
      try {
        const privateKeyPem = this.decryptPrivateKeyPem({
          ciphertext: activeRow.private_key_ciphertext,
          iv: activeRow.private_key_iv,
          tag: activeRow.private_key_tag
        });
        this.conductorEd25519PrivateKey = createPrivateKey(privateKeyPem);
        this.conductorEd25519KeyId = activeRow.key_id;
      } catch {
        // Keep existing key material if decrypt fails, but verification keys remain DB-backed.
      }
      return;
    }

    if (activeRow) {
      if (this.conductorEd25519KeyId !== activeRow.key_id) {
        this.conductorEd25519PrivateKey = null;
      }
      this.conductorEd25519KeyId = activeRow.key_id;
    }
  }

  private async ensureCurrentSigningKeyPersistedForRotation(): Promise<void> {
    if (!this.conductorEd25519PrivateKey || !this.conductorEd25519KeyId) {
      return;
    }

    const publicKeyPem = createPublicKey(this.conductorEd25519PrivateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    const privateKeyPem = this.conductorEd25519PrivateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const encryptedPrivateKey = this.encryptPrivateKeyPem(privateKeyPem);

    await pool.query(
      `
        INSERT INTO conductor_keys (
          key_id,
          public_key,
          status,
          activation_date,
          retirement_date,
          verification_grace_days,
          private_key_ciphertext,
          private_key_iv,
          private_key_tag,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          'ACTIVE',
          NOW(),
          NULL,
          0,
          $3,
          $4,
          $5,
          NOW(),
          NOW()
        )
        ON CONFLICT (key_id) DO UPDATE
        SET
          public_key = EXCLUDED.public_key,
          private_key_ciphertext = EXCLUDED.private_key_ciphertext,
          private_key_iv = EXCLUDED.private_key_iv,
          private_key_tag = EXCLUDED.private_key_tag,
          updated_at = NOW()
      `,
      [
        this.conductorEd25519KeyId,
        publicKeyPem,
        encryptedPrivateKey.ciphertext,
        encryptedPrivateKey.iv,
        encryptedPrivateKey.tag
      ]
    );
  }

  getSystemState(): 'ACTIVE' | 'DEGRADED_NO_LLM' {
    return this.globalState;
  }

  getDegradedNoLlmReason(): string | null {
    return this.degradedNoLlmReason;
  }

  getGovernanceMetricsSnapshot(): GovernanceTelemetrySnapshot {
    return this.governanceTelemetry.getSnapshot();
  }

  getConductorSignatureProfile(): ConductorSignatureProfile {
    if (this.conductorEd25519PrivateKey && this.conductorEd25519KeyId) {
      return {
        mode: 'dual_hmac_sha256_plus_ed25519',
        algorithms: ['hmac_sha256', 'ed25519'],
        ed25519KeyId: this.conductorEd25519KeyId
      };
    }

    return {
      mode: 'hmac_sha256_internal',
      algorithms: ['hmac_sha256'],
      ed25519KeyId: null
    };
  }

  getConductorSignatureVerificationPolicy(): ConductorSignatureVerificationPolicy {
    return {
      requireV2: this.requireConductorSignatureV2,
      activationAt: this.conductorSignatureV2ActivationAt,
      graceDays: this.conductorSignatureV2GraceDays
    };
  }

  async listConductorKeys(): Promise<ConductorKeyRecord[]> {
    await this.ensureReady();

    const result = await pool.query<ConductorDbKeyRow>(
      `
        SELECT
          key_id,
          public_key,
          status,
          activation_date,
          retirement_date,
          verification_grace_days,
          private_key_ciphertext,
          private_key_iv,
          private_key_tag,
          created_at,
          updated_at
        FROM conductor_keys
        ORDER BY activation_date DESC, created_at DESC
      `
    );

    return result.rows.map((row) => this.rowToConductorKeyRecord(row));
  }

  async getConductorKey(keyId: string): Promise<ConductorKeyRecord | null> {
    await this.ensureReady();

    const result = await pool.query<ConductorDbKeyRow>(
      `
        SELECT
          key_id,
          public_key,
          status,
          activation_date,
          retirement_date,
          verification_grace_days,
          private_key_ciphertext,
          private_key_iv,
          private_key_tag,
          created_at,
          updated_at
        FROM conductor_keys
        WHERE key_id = $1
        LIMIT 1
      `,
      [keyId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.rowToConductorKeyRecord(result.rows[0]);
  }

  async rotateConductorKey(input?: {
    keyId?: string;
    verificationGraceDays?: number;
  }): Promise<RotateConductorKeyResult> {
    await this.ensureReady();
    await this.ensureCurrentSigningKeyPersistedForRotation();

    const keyId =
      input?.keyId?.trim() ||
      `conductor-key-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`;
    const verificationGraceDays = Math.max(
      0,
      input?.verificationGraceDays ?? this.conductorRotationGraceDaysDefault
    );

    const keyPair = generateKeyPairSync('ed25519');
    const privateKeyPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const encryptedPrivateKey = this.encryptPrivateKeyPem(privateKeyPem);
    const previousActiveKeyId = this.conductorEd25519KeyId;

    await pool.query('BEGIN');
    try {
      await pool.query(
        `
          UPDATE conductor_keys
          SET
            status = 'RETIRED',
            retirement_date = COALESCE(retirement_date, NOW()),
            verification_grace_days = $1,
            updated_at = NOW()
          WHERE status = 'ACTIVE'
            AND key_id <> $2
        `,
        [verificationGraceDays, keyId]
      );

      await pool.query(
        `
          INSERT INTO conductor_keys (
            key_id,
            public_key,
            status,
            activation_date,
            retirement_date,
            verification_grace_days,
            private_key_ciphertext,
            private_key_iv,
            private_key_tag,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            'ACTIVE',
            NOW(),
            NULL,
            0,
            $3,
            $4,
            $5,
            NOW(),
            NOW()
          )
          ON CONFLICT (key_id) DO UPDATE
          SET
            public_key = EXCLUDED.public_key,
            status = 'ACTIVE',
            activation_date = NOW(),
            retirement_date = NULL,
            verification_grace_days = 0,
            private_key_ciphertext = EXCLUDED.private_key_ciphertext,
            private_key_iv = EXCLUDED.private_key_iv,
            private_key_tag = EXCLUDED.private_key_tag,
            updated_at = NOW()
        `,
        [
          keyId,
          publicKeyPem,
          encryptedPrivateKey.ciphertext,
          encryptedPrivateKey.iv,
          encryptedPrivateKey.tag
        ]
      );

      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    await this.loadConductorKeyRegistryFromDb();
    this.conductorEd25519PrivateKey = keyPair.privateKey;
    this.conductorEd25519KeyId = keyId;

    const keys = await this.listConductorKeys();
    const keyRecord = keys.find((key) => key.keyId === keyId);
    if (!keyRecord) {
      throw new ConductorError(
        500,
        'STM_ERR_INTERNAL',
        'Rotated conductor key was not found after persistence.'
      );
    }

    const gracePeriodEndsAt = previousActiveKeyId
      ? new Date(Date.now() + verificationGraceDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return {
      key: keyRecord,
      previousActiveKeyId: previousActiveKeyId ?? null,
      gracePeriodEndsAt,
      privateKeyPem
    };
  }

  async retireConductorKey(input: {
    keyId: string;
    verificationGraceDays?: number;
  }): Promise<RetireConductorKeyResult> {
    await this.ensureReady();

    const keyId = input.keyId?.trim();
    if (!keyId) {
      throw new ConductorError(
        400,
        'STM_ERR_INVALID_CONDUCTOR_KEY',
        'retireConductorKey requires a keyId.'
      );
    }

    const verificationGraceDays = Math.max(
      0,
      input.verificationGraceDays ?? this.conductorRotationGraceDaysDefault
    );

    await pool.query('BEGIN');
    try {
      const lookup = await pool.query<ConductorDbKeyRow>(
        `
          SELECT
            key_id,
            public_key,
            status,
            activation_date,
            retirement_date,
            verification_grace_days,
            private_key_ciphertext,
            private_key_iv,
            private_key_tag,
            created_at,
            updated_at
          FROM conductor_keys
          WHERE key_id = $1
          FOR UPDATE
        `,
        [keyId]
      );

      if (lookup.rowCount === 0) {
        throw new ConductorError(
          404,
          'STM_ERR_CONDUCTOR_KEY_NOT_FOUND',
          `Conductor key '${keyId}' was not found.`
        );
      }

      const row = lookup.rows[0];
      if (row.status === 'ACTIVE') {
        throw new ConductorError(
          409,
          'STM_ERR_CONDUCTOR_KEY_ACTIVE',
          `Conductor key '${keyId}' is active. Rotate first, then retire the old key.`
        );
      }

      await pool.query(
        `
          UPDATE conductor_keys
          SET
            status = 'RETIRED',
            retirement_date = COALESCE(retirement_date, NOW()),
            verification_grace_days = $2,
            updated_at = NOW()
          WHERE key_id = $1
        `,
        [keyId, verificationGraceDays]
      );

      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    await this.loadConductorKeyRegistryFromDb();
    const keys = await this.listConductorKeys();
    const keyRecord = keys.find((key) => key.keyId === keyId);

    if (!keyRecord) {
      throw new ConductorError(
        500,
        'STM_ERR_INTERNAL',
        `Retired conductor key '${keyId}' was not found after persistence.`
      );
    }

    const gracePeriodEndsAt = keyRecord.retirementDate
      ? new Date(
          Date.parse(keyRecord.retirementDate) + verificationGraceDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;

    return {
      key: keyRecord,
      gracePeriodEndsAt
    };
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

  async verifyThreadLedger(threadId: string): Promise<ThreadLedgerVerificationReport | null> {
    await this.ensureReady();
    if (this.requireConductorSignatureV2) {
      await this.loadConductorKeyRegistryFromDb();
    }

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

    const eventsResult = await pool.query<EventVerificationRow>(
      `
        SELECT
          sequence,
          client_envelope,
          ledger_envelope,
          payload,
          entry_hash
        FROM sphere_events
        WHERE thread_id = $1
        ORDER BY sequence ASC
      `,
      [threadId]
    );

    const issues: LedgerVerificationIssue[] = [];
    let expectedPrevHash = 'GENESIS';
    let latestEntryHash: string | null = null;
    let latestSequence = 0;

    for (const row of eventsResult.rows) {
      const sequence = Number(row.sequence);
      latestSequence = sequence;

      if (Number(row.ledger_envelope.sequence) !== sequence) {
        issues.push({
          code: 'SEQUENCE_MISMATCH',
          message: `Sequence mismatch at event row ${sequence}.`,
          sequence,
          expected: String(sequence),
          actual: String(row.ledger_envelope.sequence)
        });
      }

      if (row.ledger_envelope.prevMessageHash !== expectedPrevHash) {
        issues.push({
          code: 'PREV_HASH_MISMATCH',
          message: `prevMessageHash mismatch at sequence ${sequence}.`,
          sequence,
          expected: expectedPrevHash,
          actual: row.ledger_envelope.prevMessageHash
        });
      }

      const governance = row.ledger_envelope.governance;
      if (
        !governance?.highRiskRegistryHash ||
        !governance?.contactLensPackHash ||
        !governance?.governanceConfigHash
      ) {
        issues.push({
          code: 'MISSING_GOVERNANCE_HASHES',
          message: `Governance hash snapshot missing at sequence ${sequence}.`,
          sequence
        });
      }

      const requiresConductorV2 = this.requiresConductorSignatureV2({
        timestamp: row.ledger_envelope.timestamp
      });
      const conductorSignatureV2Issue = this.validateConductorSignatureV2({
        sequence,
        clientEnvelope: row.client_envelope,
        payload: row.payload,
        ledgerEnvelope: row.ledger_envelope,
        requiresConductorV2
      });
      if (conductorSignatureV2Issue) {
        issues.push(conductorSignatureV2Issue);
      }

      const reconstructedEntry: LogEntry = {
        clientEnvelope: row.client_envelope,
        ledgerEnvelope: row.ledger_envelope,
        payload: row.payload
      };
      const computedEntryHash = sha256(canonicalize(reconstructedEntry));

      if (computedEntryHash !== row.entry_hash) {
        issues.push({
          code: 'ENTRY_HASH_MISMATCH',
          message: `entry_hash mismatch at sequence ${sequence}.`,
          sequence,
          expected: computedEntryHash,
          actual: row.entry_hash
        });
      }

      expectedPrevHash = row.entry_hash;
      latestEntryHash = row.entry_hash;
    }

    const thread = threadResult.rows[0];
    const threadTailHash = thread.last_entry_hash ?? null;
    if (threadTailHash !== latestEntryHash) {
      issues.push({
        code: 'THREAD_TAIL_HASH_MISMATCH',
        message: 'sphere_threads.last_entry_hash does not match final sphere_events.entry_hash.',
        expected: latestEntryHash ?? 'NULL',
        actual: threadTailHash ?? 'NULL'
      });
    }

    return {
      threadId,
      verified: issues.length === 0,
      checkedEntries: eventsResult.rows.length,
      latestSequence,
      latestEntryHash,
      generatedAt: new Date().toISOString(),
      issues
    };
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
    const attestation = normalizeSetLikeStrings(input.attestation);
    const normalizedIntent = normalizeIntent(input.intent);
    const isBreakGlassAttempt = Boolean(input.breakGlass) || normalizedIntent === 'EMERGENCY_SHUTDOWN';
    const dispatchStartedAt = Date.now();

    this.governanceTelemetry.recordIntentAttempt({ isBreakGlassAttempt });

    const client = await pool.connect();
    let effectiveThreadState: ThreadGovernanceState =
      this.globalState === 'DEGRADED_NO_LLM' ? 'DEGRADED_NO_LLM' : 'ACTIVE';
    let validation: IntentValidationResult | null = null;
    let signatureVerified = false;
    let sequence: number | null = null;
    let prevMessageHash: string | null = null;
    let timestamp: string | null = null;
    let entryHash: string | null = null;

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

      validation = this.validateIntent({
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
        await this.enforceCounselQuorum(client, {
          threadId,
          approvalRefs: attestation
        });
      }

      sequence = Number(thread.next_sequence);
      timestamp = new Date().toISOString();
      prevMessageHash = thread.last_entry_hash ?? 'GENESIS';

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
      signatureVerified = true;

      const clientEnvelope: ClientEnvelope = {
        ...clientEnvelopeBase,
        agentSignature
      };

      const ledgerEnvelopeBase = {
        schemaVersion,
        sequence,
        prevMessageHash,
        timestamp,
        governance: this.governanceHashes
      };

      const conductorSignablePayload = this.buildConductorSignablePayload({
        clientEnvelope,
        ledgerEnvelope: ledgerEnvelopeBase,
        payload: input.payload
      });
      const conductorSignature = this.signPayload(conductorSignablePayload);
      const conductorSignatureV2 = this.signPayloadEd25519(conductorSignablePayload);

      const ledgerEnvelope: LedgerEnvelope = {
        ...ledgerEnvelopeBase,
        conductorSignature,
        ...(conductorSignatureV2 ? { conductorSignatureV2 } : {})
      };

      const entry: LogEntry = {
        clientEnvelope,
        ledgerEnvelope,
        payload: input.payload
      };

      entryHash = sha256(canonicalize(entry));
      const nextState = this.deriveThreadStateAfterIntent(thread.state, input.intent);
      await this.appendSphereEvent(client, {
        threadId,
        sequence,
        messageId,
        authorDid: input.authorAgentId,
        intent: input.intent,
        timestamp,
        clientEnvelope,
        ledgerEnvelope,
        payload: input.payload,
        entryHash
      });

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

      this.governanceTelemetry.recordIntentCommitted({ isBreakGlassAttempt });
      this.governanceTelemetry.recordDispatchLatency(Date.now() - dispatchStartedAt);

      this.emit('governance_outcome', {
        threadId,
        messageId,
        traceId,
        actorDid: input.authorAgentId,
        intentRaw: input.intent,
        intentNormalized: normalizedIntent,
        threadStateEffective: effectiveThreadState,
        validationAllowed: true,
        validationCode: validation.code ?? null,
        validationMessage: validation.message ?? null,
        highRisk: validation.highRisk,
        requiresApproval: validation.requiresApproval,
        prismHolderApproved: Boolean(input.prismHolderApproved),
        lensMissing: false,
        signatureVerificationMode: this.signatureVerificationMode,
        signatureVerified,
        governanceHashes: this.governanceHashes,
        sequence,
        entryHash,
        prevHash: prevMessageHash,
        timestamp,
        outcome: 'committed'
      });

      const event: ThreadLogEntryEvent = { threadId, entry };
      this.emit('log_entry', event);
      this.emit(`thread:${threadId}`, entry);

      return entry;
    } catch (error) {
      await client.query('ROLLBACK');

      let normalizedError: ConductorError;

      if (error && typeof error === 'object' && 'code' in error) {
        const pgError = error as { code?: string; constraint?: string };
        if (
          pgError.code === '23505' &&
          pgError.constraint === 'sphere_events_thread_message_unique'
        ) {
          normalizedError = new ConductorError(
            409,
            'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY',
            'A message with this messageId has already been committed for this thread.'
          );
        } else if (pgError.code === '23505') {
          normalizedError = new ConductorError(
            500,
            'STM_ERR_INTERNAL',
            'Concurrent write conflict while appending to thread.'
          );
        } else {
          normalizedError =
            error instanceof ConductorError
              ? error
              : new ConductorError(
                  500,
                  'STM_ERR_INTERNAL',
                  'Unexpected internal error during dispatch.'
                );
        }
      } else {
        normalizedError =
          error instanceof ConductorError
            ? error
            : new ConductorError(500, 'STM_ERR_INTERNAL', 'Unexpected internal error during dispatch.');
      }

      this.governanceTelemetry.recordIntentRejected({
        code: normalizedError.code,
        isBreakGlassAttempt
      });

      if (normalizedError.code === 'STM_ERR_INVALID_SIGNATURE') {
        this.governanceTelemetry.recordSignatureVerificationFailure();
      }

      if (
        normalizedError.code === 'STM_ERR_MISSING_ATTESTATION' &&
        this.isMaterialImpactIntent(input.intent)
      ) {
        this.governanceTelemetry.recordMaterialImpactQuorumFailure();
      }

      if (normalizedError.status >= 500) {
        this.governanceTelemetry.recordAuditFailure();
      }

      this.governanceTelemetry.recordDispatchLatency(Date.now() - dispatchStartedAt);

      this.emit('governance_outcome', {
        threadId,
        messageId,
        traceId,
        actorDid: input.authorAgentId,
        intentRaw: input.intent,
        intentNormalized: normalizedIntent,
        threadStateEffective: effectiveThreadState,
        validationAllowed: false,
        validationCode: validation?.code ?? normalizedError.code,
        validationMessage: validation?.message ?? normalizedError.message,
        highRisk: validation?.highRisk ?? false,
        requiresApproval: validation?.requiresApproval ?? false,
        prismHolderApproved: Boolean(input.prismHolderApproved),
        lensMissing:
          validation?.code === 'LENS_NOT_FOUND' || normalizedError.code === 'LENS_NOT_FOUND',
        signatureVerificationMode: this.signatureVerificationMode,
        signatureVerified,
        governanceHashes: this.governanceHashes,
        sequence: sequence ?? undefined,
        entryHash: entryHash ?? undefined,
        prevHash: prevMessageHash ?? undefined,
        timestamp: timestamp ?? new Date().toISOString(),
        outcome: normalizedError.status >= 500 ? 'error' : 'rejected',
        errorCode: normalizedError.code
      });

      throw normalizedError;
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
    const attestation = normalizeSetLikeStrings(input.attestation);
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

  private async enforceCounselQuorum(
    client: PoolClient,
    params: { threadId: string; approvalRefs: string[] }
  ): Promise<void> {
    const approvalRefs = normalizeSetLikeStrings(params.approvalRefs);
    if (approvalRefs.length === 0) {
      throw new ConductorError(
        412,
        'STM_ERR_MISSING_ATTESTATION',
        `Material-impact intent requires ${this.governanceConfig.quorumCount} signed counselor ACK approvals.`
      );
    }

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

    const signedApprovals = await client.query<{ actor_did: string }>(
      `
        SELECT DISTINCT actor_did
        FROM sphere_acks
        WHERE thread_id = $1
          AND intent = 'ACK_ENTRY'
          AND target_message_id::text = ANY($2::text[])
      `,
      [params.threadId, approvalRefs]
    );

    const approvedCounselors = new Set(
      signedApprovals.rows
        .map((row) => row.actor_did.trim())
        .filter((did) => activeCounselors.has(did))
    );

    if (approvedCounselors.size < this.governanceConfig.quorumCount) {
      throw new ConductorError(
        412,
        'STM_ERR_MISSING_ATTESTATION',
        `Material-impact intent requires ${this.governanceConfig.quorumCount} signed counselor ACK approvals.`
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

  private requiresConductorSignatureV2(params: { timestamp: string }): boolean {
    if (!this.requireConductorSignatureV2) {
      return false;
    }
    if (!this.conductorSignatureV2ActivationAt) {
      return true;
    }

    const activationMs = Date.parse(this.conductorSignatureV2ActivationAt);
    if (Number.isNaN(activationMs)) {
      return true;
    }

    const entryTimestampMs = Date.parse(params.timestamp);
    if (Number.isNaN(entryTimestampMs)) {
      return true;
    }

    const graceMs = this.conductorSignatureV2GraceDays * 24 * 60 * 60 * 1000;
    return entryTimestampMs >= activationMs + graceMs;
  }

  private buildConductorSignablePayload(params: {
    clientEnvelope: ClientEnvelope;
    ledgerEnvelope:
      | LedgerEnvelope
      | Pick<LedgerEnvelope, 'schemaVersion' | 'sequence' | 'prevMessageHash' | 'timestamp' | 'governance'>;
    payload: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      clientEnvelope: params.clientEnvelope,
      ledgerEnvelope: {
        schemaVersion: params.ledgerEnvelope.schemaVersion,
        sequence: params.ledgerEnvelope.sequence,
        prevMessageHash: params.ledgerEnvelope.prevMessageHash,
        timestamp: params.ledgerEnvelope.timestamp,
        governance: params.ledgerEnvelope.governance
      },
      payload: params.payload,
      signer: 'conductor'
    };
  }

  private validateConductorSignatureV2(params: {
    sequence: number;
    clientEnvelope: ClientEnvelope;
    ledgerEnvelope: LedgerEnvelope;
    payload: Record<string, unknown>;
    requiresConductorV2: boolean;
  }): LedgerVerificationIssue | null {
    const signatureV2 = params.ledgerEnvelope.conductorSignatureV2;

    if (!signatureV2) {
      if (!params.requiresConductorV2) {
        return null;
      }
      return {
        code: 'MISSING_CONDUCTOR_SIGNATURE_V2',
        message: `Missing conductorSignatureV2 at sequence ${params.sequence}.`,
        sequence: params.sequence
      };
    }

    if (signatureV2.alg !== 'Ed25519') {
      return {
        code: 'INVALID_CONDUCTOR_SIGNATURE_V2',
        message: `Invalid conductorSignatureV2 algorithm at sequence ${params.sequence}.`,
        sequence: params.sequence,
        expected: 'Ed25519',
        actual: String(signatureV2.alg)
      };
    }

    const keyId = signatureV2.keyId?.trim();
    if (!keyId) {
      return {
        code: 'INVALID_CONDUCTOR_SIGNATURE_V2',
        message: `Missing conductorSignatureV2 keyId at sequence ${params.sequence}.`,
        sequence: params.sequence
      };
    }

    const keyMaterial = this.conductorEd25519PublicKeys.get(keyId);
    if (!keyMaterial) {
      return {
        code: 'UNKNOWN_CONDUCTOR_SIGNATURE_V2_KEY',
        message: `Unknown conductorSignatureV2 keyId (${keyId}) at sequence ${params.sequence}.`,
        sequence: params.sequence,
        actual: keyId
      };
    }

    if (keyMaterial.status === 'RETIRED' && keyMaterial.retirementDate) {
      const retirementMs = Date.parse(keyMaterial.retirementDate);
      const entryTimestampMs = Date.parse(params.ledgerEnvelope.timestamp);
      if (!Number.isNaN(retirementMs) && !Number.isNaN(entryTimestampMs)) {
        const graceMs = Math.max(0, keyMaterial.verificationGraceDays) * 24 * 60 * 60 * 1000;
        if (entryTimestampMs > retirementMs + graceMs) {
          return {
            code: 'EXPIRED_CONDUCTOR_SIGNATURE_V2_KEY',
            message: `conductorSignatureV2 keyId (${keyId}) is expired for sequence ${params.sequence}.`,
            sequence: params.sequence,
            actual: keyId
          };
        }
      }
    }

    const signatureValue = signatureV2.signature;
    if (typeof signatureValue !== 'string' || signatureValue.trim().length === 0) {
      return {
        code: 'MALFORMED_CONDUCTOR_SIGNATURE_V2',
        message: `Missing conductorSignatureV2 signature payload at sequence ${params.sequence}.`,
        sequence: params.sequence
      };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(signatureValue)) {
      return {
        code: 'MALFORMED_CONDUCTOR_SIGNATURE_V2',
        message: `Malformed conductorSignatureV2 encoding at sequence ${params.sequence}.`,
        sequence: params.sequence
      };
    }

    const signablePayload = this.buildConductorSignablePayload({
      clientEnvelope: params.clientEnvelope,
      ledgerEnvelope: params.ledgerEnvelope,
      payload: params.payload
    });

    try {
      const isValid = verify(
        null,
        Buffer.from(canonicalize(signablePayload), 'utf8'),
        keyMaterial.publicKey,
        Buffer.from(signatureValue, 'base64url')
      );

      if (!isValid) {
        return {
          code: 'INVALID_CONDUCTOR_SIGNATURE_V2',
          message: `Invalid conductorSignatureV2 at sequence ${params.sequence}.`,
          sequence: params.sequence
        };
      }
    } catch {
      return {
        code: 'MALFORMED_CONDUCTOR_SIGNATURE_V2',
        message: `Malformed conductorSignatureV2 encoding at sequence ${params.sequence}.`,
        sequence: params.sequence
      };
    }

    return null;
  }

  private signPayload(value: Record<string, unknown>): string {
    const canonical = canonicalize(value);
    return createHmac('sha256', this.conductorSecret).update(canonical).digest('hex');
  }

  private signPayloadEd25519(
    value: Record<string, unknown>
  ): LedgerEnvelope['conductorSignatureV2'] | undefined {
    if (!this.conductorEd25519PrivateKey || !this.conductorEd25519KeyId) {
      return undefined;
    }

    const canonical = canonicalize(value);
    const signature = sign(
      null,
      Buffer.from(canonical, 'utf8'),
      this.conductorEd25519PrivateKey
    ).toString('base64url');

    return {
      alg: 'Ed25519',
      keyId: this.conductorEd25519KeyId,
      signature
    };
  }

  private async appendSphereEvent(
    client: PoolClient,
    params: {
      threadId: string;
      sequence: number;
      messageId: string;
      authorDid: string;
      intent: string;
      timestamp: string;
      clientEnvelope: ClientEnvelope;
      ledgerEnvelope: LedgerEnvelope;
      payload: Record<string, unknown>;
      entryHash: string;
    }
  ): Promise<void> {
    await client.query(
      `
        SELECT metacanon_append_sphere_event(
          $1::uuid,
          $2::bigint,
          $3::uuid,
          $4::text,
          $5::text,
          $6::timestamptz,
          $7::jsonb,
          $8::jsonb,
          $9::jsonb,
          $10::text
        )
      `,
      [
        params.threadId,
        params.sequence,
        params.messageId,
        params.authorDid,
        params.intent,
        params.timestamp,
        JSON.stringify(params.clientEnvelope),
        JSON.stringify(params.ledgerEnvelope),
        JSON.stringify(params.payload),
        params.entryHash
      ]
    );
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

      CREATE TABLE IF NOT EXISTS sphere_event_write_tokens (
        txid BIGINT PRIMARY KEY,
        issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      REVOKE ALL ON sphere_event_write_tokens FROM PUBLIC;

      CREATE OR REPLACE FUNCTION metacanon_append_sphere_event(
        p_thread_id UUID,
        p_sequence BIGINT,
        p_message_id UUID,
        p_author_did TEXT,
        p_intent TEXT,
        p_timestamp TIMESTAMPTZ,
        p_client_envelope JSONB,
        p_ledger_envelope JSONB,
        p_payload JSONB,
        p_entry_hash TEXT
      )
      RETURNS VOID
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      BEGIN
        INSERT INTO sphere_event_write_tokens (txid)
        VALUES (txid_current())
        ON CONFLICT (txid) DO NOTHING;

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
        VALUES (
          p_thread_id,
          p_sequence,
          p_message_id,
          p_author_did,
          p_intent,
          p_timestamp,
          p_client_envelope,
          p_ledger_envelope,
          p_payload,
          p_entry_hash
        );

        DELETE FROM sphere_event_write_tokens
        WHERE txid = txid_current();
      END;
      $$;

      REVOKE ALL ON FUNCTION metacanon_append_sphere_event(
        UUID,
        BIGINT,
        UUID,
        TEXT,
        TEXT,
        TIMESTAMPTZ,
        JSONB,
        JSONB,
        JSONB,
        TEXT
      ) FROM PUBLIC;

      CREATE OR REPLACE FUNCTION metacanon_apply_sphere_app_role_grants(
        p_role_name TEXT
      )
      RETURNS VOID
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      DECLARE
        target_role TEXT := btrim(COALESCE(p_role_name, ''));
      BEGIN
        IF target_role = '' THEN
          RAISE EXCEPTION 'App role must be non-empty.'
            USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_roles
          WHERE rolname = target_role
        ) THEN
          RAISE EXCEPTION 'App role "%" does not exist.', target_role
            USING ERRCODE = '42704';
        END IF;

        EXECUTE format('REVOKE ALL ON TABLE sphere_events FROM %I', target_role);
        EXECUTE format('GRANT SELECT ON TABLE sphere_events TO %I', target_role);

        EXECUTE format(
          'REVOKE ALL ON FUNCTION metacanon_append_sphere_event(UUID, BIGINT, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, JSONB, JSONB, TEXT) FROM %I',
          target_role
        );
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION metacanon_append_sphere_event(UUID, BIGINT, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, JSONB, JSONB, TEXT) TO %I',
          target_role
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE sphere_threads TO %I', target_role);
        EXECUTE format('GRANT SELECT ON TABLE counselors TO %I', target_role);
        EXECUTE format('GRANT SELECT, INSERT ON TABLE sphere_acks TO %I', target_role);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE sphere_acks_ack_id_seq TO %I', target_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE conductor_keys TO %I', target_role);
      END;
      $$;

      REVOKE ALL ON FUNCTION metacanon_apply_sphere_app_role_grants(TEXT) FROM PUBLIC;

      CREATE OR REPLACE FUNCTION enforce_sphere_events_conductor_guard()
      RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM sphere_event_write_tokens
          WHERE txid = txid_current()
        ) THEN
          RAISE EXCEPTION 'Direct sphere_events writes are blocked; use conductor dispatch path.'
            USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sphere_events_conductor_guard ON sphere_events;
      CREATE TRIGGER trg_sphere_events_conductor_guard
      BEFORE INSERT ON sphere_events
      FOR EACH ROW
      EXECUTE FUNCTION enforce_sphere_events_conductor_guard();

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

      CREATE TABLE IF NOT EXISTS conductor_keys (
        key_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
        activation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        retirement_date TIMESTAMPTZ,
        verification_grace_days INTEGER NOT NULL DEFAULT 0,
        private_key_ciphertext TEXT,
        private_key_iv TEXT,
        private_key_tag TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE conductor_keys
        ADD COLUMN IF NOT EXISTS verification_grace_days INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE conductor_keys
        ADD COLUMN IF NOT EXISTS private_key_ciphertext TEXT;
      ALTER TABLE conductor_keys
        ADD COLUMN IF NOT EXISTS private_key_iv TEXT;
      ALTER TABLE conductor_keys
        ADD COLUMN IF NOT EXISTS private_key_tag TEXT;
      ALTER TABLE conductor_keys
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE conductor_keys
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_conductor_keys_status ON conductor_keys(status);
      CREATE INDEX IF NOT EXISTS idx_conductor_keys_activation_date
        ON conductor_keys(activation_date DESC);
    `);

    if (env.SPHERE_DB_APP_ROLE) {
      await this.applySphereDbRoleGrants(env.SPHERE_DB_APP_ROLE);
    }
  }

  private async applySphereDbRoleGrants(appRole: string): Promise<void> {
    await pool.query(`SELECT metacanon_apply_sphere_app_role_grants($1)`, [appRole]);
  }
}
