import { createCipheriv, createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const runPgIntegration = process.env.RUN_PG_INTEGRATION === '1'

function setEnv(): void {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council'
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173'
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void'
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password'
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key'
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token'
  process.env.WS_TOKEN_SECRET =
    process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012'
  process.env.RUNTIME_ENV = process.env.RUNTIME_ENV || 'local'
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    const sorted: Record<string, unknown> = {}
    for (const [key, nested] of entries) {
      sorted[key] = sortValue(nested)
    }
    return sorted
  }

  return value
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function encryptPrivateKeyForLegacyTextRow(params: {
  conductorSecret: string
  privateKeyPem: string
}): { ciphertextBase64: string; ivBase64: string; tagBase64: string } {
  const iv = randomBytes(12)
  const encryptionKey = createHash('sha256').update(params.conductorSecret).digest()
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(params.privateKeyPem, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertextBase64: ciphertext.toString('base64'),
    ivBase64: iv.toString('base64'),
    tagBase64: tag.toString('base64')
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(input: Buffer): string {
  if (input.length === 0) {
    return ''
  }

  let value = BigInt(`0x${input.toString('hex')}`)
  let encoded = ''

  while (value > 0n) {
    const remainder = Number(value % 58n)
    encoded = BASE58_ALPHABET[remainder] + encoded
    value /= 58n
  }

  let leadingZeros = 0
  for (const byte of input) {
    if (byte === 0) {
      leadingZeros += 1
    } else {
      break
    }
  }

  return `${'1'.repeat(leadingZeros)}${encoded}`
}

function toDidKeyFromPublicKeyDer(spkiDer: Buffer): string {
  const rawPublicKey = spkiDer.subarray(spkiDer.length - 32)
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), rawPublicKey])
  return `did:key:z${base58Encode(multicodec)}`
}

function createEdDsaCompactJws(payload: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
  const headerSegment = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf8').toString('base64url')
  const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url')
  const signingInput = `${headerSegment}.${payloadSegment}`
  const signature = sign(null, Buffer.from(signingInput, 'utf8'), privateKey).toString('base64url')
  return `${headerSegment}.${payloadSegment}.${signature}`
}

function normalizeSetLikeStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  )
}

function buildCanonicalAckPayload(params: {
  threadId: string
  actorDid: string
  targetSequence: number
  targetMessageId: string
  ackMessageId: string
  traceId: string
  intent: string
  schemaVersion: string
  attestation: string[]
  receivedAt: string | null
}): string {
  return canonicalize({
    threadId: params.threadId,
    actorDid: params.actorDid,
    targetSequence: params.targetSequence,
    targetMessageId: params.targetMessageId,
    ackMessageId: params.ackMessageId,
    traceId: params.traceId,
    intent: params.intent.toUpperCase(),
    schemaVersion: params.schemaVersion,
    attestation: normalizeSetLikeStrings(params.attestation),
    receivedAt: params.receivedAt
  })
}

describe.runIf(runPgIntegration)('SphereConductor Postgres integration', () => {
  let SphereConductor: any
  let pool: {
    query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }>
    end: () => Promise<void>
  }
  let conductor: any
  const conductorKeyId = 'conductor-key-integration-2026-03'

  beforeAll(async () => {
    setEnv()

    const governanceDir = await mkdtemp(path.join(tmpdir(), 'metacanon-governance-'))
    const governanceConfigPath = path.join(governanceDir, 'governance.yaml')
    await writeFile(
      governanceConfigPath,
      [
        'material_impact_intents:',
        '  - FORCE_EVICT',
        'quorum_rules:',
        '  value: 2'
      ].join('\n'),
      'utf8'
    )

    const conductorModule = await import('./conductor.js')
    SphereConductor = conductorModule.SphereConductor
    ;({ pool } = await import('../db/client.js'))
    const conductorKeyPair = generateKeyPairSync('ed25519')

    conductor = await SphereConductor.create({
      conductorSecret: 'integration-secret',
      conductorEd25519PrivateKey: conductorKeyPair.privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      conductorEd25519KeyId: conductorKeyId,
      requireConductorSignatureV2: true,
      signatureVerificationMode: 'off',
      governanceConfigPath,
      validateIntent: () => ({
        allowed: true,
        highRisk: false,
        requiresApproval: false
      })
    })
  })

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        conductor_keys,
        sphere_acks,
        sphere_events,
        sphere_threads,
        counselors,
        sphere_ack_write_tokens,
        sphere_event_write_tokens
      RESTART IDENTITY CASCADE
    `)

    await conductor['ensureCurrentSigningKeyPersistedForRotation']()
    await conductor['loadConductorKeyRegistryFromDb']()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('dispatches entries and preserves hash-linked replay order', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-1'
    })

    const first = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-1',
      intent: 'MISSION_REPORT',
      payload: { body: 'first entry' },
      prismHolderApproved: true
    })

    const second = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-1',
      intent: 'DISPATCH_MISSION',
      payload: { body: 'second entry' },
      prismHolderApproved: true,
      causationId: [first.clientEnvelope.messageId]
    })

    const replay = await conductor.getThreadReplay(threadId, 1)

    expect(replay).toHaveLength(2)
    expect(replay[0].ledgerEnvelope.sequence).toBe(1)
    expect(replay[1].ledgerEnvelope.sequence).toBe(2)

    const firstEntryHash = sha256(canonicalize(replay[0]))
    expect(second.ledgerEnvelope.prevMessageHash).toBe(firstEntryHash)
  })

  it('verifies ledger integrity report for untampered thread history', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-verify'
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-verify',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 1' },
      prismHolderApproved: true
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-verify',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 2' },
      prismHolderApproved: true
    })

    const report = await conductor.verifyThreadLedger(threadId)

    expect(report).not.toBeNull()
    expect(report.verified).toBe(true)
    expect(report.checkedEntries).toBe(2)
    expect(report.latestSequence).toBe(2)
    expect(report.issues).toEqual([])
  })

  it('detects tampered entry hash in ledger verification report', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-tamper'
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-tamper',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 1' },
      prismHolderApproved: true
    })

    await pool.query(
      `
        UPDATE sphere_events
        SET entry_hash = 'tampered-hash'
        WHERE thread_id = $1 AND sequence = 1
      `,
      [threadId]
    )

    const report = await conductor.verifyThreadLedger(threadId)

    expect(report).not.toBeNull()
    expect(report.verified).toBe(false)
    const issueCodes = new Set(report.issues.map((issue: { code: string }) => issue.code))
    expect(issueCodes.has('ENTRY_HASH_MISMATCH')).toBe(true)
    expect(issueCodes.has('THREAD_TAIL_HASH_MISMATCH')).toBe(true)
  })

  it('detects invalid conductorSignatureV2 values in ledger verification report', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-signature-invalid'
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-signature-invalid',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 1' },
      prismHolderApproved: true
    })

    await pool.query(
      `
        UPDATE sphere_events
        SET ledger_envelope = jsonb_set(
          ledger_envelope,
          '{conductorSignatureV2,signature}',
          '"invalid-signature-value"',
          true
        )
        WHERE thread_id = $1 AND sequence = 1
      `,
      [threadId]
    )

    const report = await conductor.verifyThreadLedger(threadId)
    expect(report).not.toBeNull()
    expect(report.verified).toBe(false)
    const issueCodes = new Set(report.issues.map((issue: { code: string }) => issue.code))
    expect(issueCodes.has('INVALID_CONDUCTOR_SIGNATURE_V2')).toBe(true)
  })

  it('detects malformed conductorSignatureV2 values in ledger verification report', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-signature-malformed'
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-signature-malformed',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 1' },
      prismHolderApproved: true
    })

    await pool.query(
      `
        UPDATE sphere_events
        SET ledger_envelope = jsonb_set(
          ledger_envelope,
          '{conductorSignatureV2,signature}',
          '\"invalid$$$signature\"',
          true
        )
        WHERE thread_id = $1 AND sequence = 1
      `,
      [threadId]
    )

    const report = await conductor.verifyThreadLedger(threadId)
    expect(report).not.toBeNull()
    expect(report.verified).toBe(false)
    const issueCodes = new Set(report.issues.map((issue: { code: string }) => issue.code))
    expect(issueCodes.has('MALFORMED_CONDUCTOR_SIGNATURE_V2')).toBe(true)
  })

  it('detects unknown conductorSignatureV2 key ids in ledger verification report', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-signature-key'
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-signature-key',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 1' },
      prismHolderApproved: true
    })

    await pool.query(
      `
        UPDATE sphere_events
        SET ledger_envelope = jsonb_set(
          ledger_envelope,
          '{conductorSignatureV2,keyId}',
          '"unknown-conductor-key"',
          true
        )
        WHERE thread_id = $1 AND sequence = 1
      `,
      [threadId]
    )

    const report = await conductor.verifyThreadLedger(threadId)
    expect(report).not.toBeNull()
    expect(report.verified).toBe(false)
    const issueCodes = new Set(report.issues.map((issue: { code: string }) => issue.code))
    expect(issueCodes.has('UNKNOWN_CONDUCTOR_SIGNATURE_V2_KEY')).toBe(true)
  })

  it('detects missing conductorSignatureV2 when strict requirement is enabled', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-signature-missing'
    })

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-signature-missing',
      intent: 'MISSION_REPORT',
      payload: { body: 'entry 1' },
      prismHolderApproved: true
    })

    await pool.query(
      `
        UPDATE sphere_events
        SET ledger_envelope = ledger_envelope - 'conductorSignatureV2'
        WHERE thread_id = $1 AND sequence = 1
      `,
      [threadId]
    )

    const report = await conductor.verifyThreadLedger(threadId)
    expect(report).not.toBeNull()
    expect(report.verified).toBe(false)
    const issueCodes = new Set(report.issues.map((issue: { code: string }) => issue.code))
    expect(issueCodes.has('MISSING_CONDUCTOR_SIGNATURE_V2')).toBe(true)
  })

  it('accepts mixed old/new signatures during grace and fails after grace expiry', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-rotation'
    })

    const firstEntry = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-rotation',
      intent: 'MISSION_REPORT',
      payload: { body: 'pre-rotation' },
      prismHolderApproved: true
    })

    const rotation = await conductor.rotateConductorKey({
      keyId: 'conductor-key-rotation-test-2',
      verificationGraceDays: 2
    })
    expect(rotation.key.keyId).toBe('conductor-key-rotation-test-2')

    await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-rotation',
      intent: 'MISSION_REPORT',
      payload: { body: 'post-rotation' },
      prismHolderApproved: true,
      causationId: [firstEntry.clientEnvelope.messageId]
    })

    const duringGrace = await conductor.verifyThreadLedger(threadId)
    expect(duringGrace).not.toBeNull()
    expect(duringGrace.verified).toBe(true)

    await pool.query(
      `
        UPDATE conductor_keys
        SET
          retirement_date = NOW() - INTERVAL '5 days',
          verification_grace_days = 0,
          updated_at = NOW()
        WHERE key_id = $1
      `,
      [conductorKeyId]
    )

    await conductor['loadConductorKeyRegistryFromDb']()
    const afterGrace = await conductor.verifyThreadLedger(threadId)
    expect(afterGrace).not.toBeNull()
    expect(afterGrace.verified).toBe(false)
    const issueCodes = new Set(afterGrace.issues.map((issue: { code: string }) => issue.code))
    expect(issueCodes.has('EXPIRED_CONDUCTOR_SIGNATURE_V2_KEY')).toBe(true)
  })

  it('migrates legacy conductor_keys text/base64 columns to BYTEA without losing key material', async () => {
    const legacyKeyId = `legacy-conductor-key-${randomUUID()}`
    const keyPair = generateKeyPairSync('ed25519')
    const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const privateKeyPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const encrypted = encryptPrivateKeyForLegacyTextRow({
      conductorSecret: 'integration-secret',
      privateKeyPem
    })

    await pool.query(
      `
        ALTER TABLE conductor_keys
          ALTER COLUMN public_key TYPE TEXT USING convert_from(public_key, 'UTF8'),
          ALTER COLUMN private_key_ciphertext TYPE TEXT USING CASE
            WHEN private_key_ciphertext IS NULL THEN NULL
            ELSE encode(private_key_ciphertext, 'base64')
          END,
          ALTER COLUMN private_key_iv TYPE TEXT USING CASE
            WHEN private_key_iv IS NULL THEN NULL
            ELSE encode(private_key_iv, 'base64')
          END,
          ALTER COLUMN private_key_tag TYPE TEXT USING CASE
            WHEN private_key_tag IS NULL THEN NULL
            ELSE encode(private_key_tag, 'base64')
          END
      `
    )

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
        VALUES ($1, $2, 'RETIRED', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 0, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (key_id) DO UPDATE
        SET
          public_key = EXCLUDED.public_key,
          private_key_ciphertext = EXCLUDED.private_key_ciphertext,
          private_key_iv = EXCLUDED.private_key_iv,
          private_key_tag = EXCLUDED.private_key_tag,
          updated_at = NOW()
      `,
      [legacyKeyId, publicKeyPem, encrypted.ciphertextBase64, encrypted.ivBase64, encrypted.tagBase64]
    )

    await conductor['ensureSchema']()

    const columnTypes = await pool.query(
      `
        SELECT column_name, udt_name
        FROM information_schema.columns
        WHERE table_name = 'conductor_keys'
          AND column_name IN ('public_key', 'private_key_ciphertext', 'private_key_iv', 'private_key_tag')
      `
    )
    const typedColumnRows = columnTypes.rows as Array<{ column_name: string; udt_name: string }>
    const typeByColumn = new Map<string, string>(
      typedColumnRows.map((row) => [row.column_name, row.udt_name])
    )
    expect(typeByColumn.get('public_key')).toBe('bytea')
    expect(typeByColumn.get('private_key_ciphertext')).toBe('bytea')
    expect(typeByColumn.get('private_key_iv')).toBe('bytea')
    expect(typeByColumn.get('private_key_tag')).toBe('bytea')

    const migrated = await pool.query(
      `
        SELECT public_key, private_key_ciphertext, private_key_iv, private_key_tag
        FROM conductor_keys
        WHERE key_id = $1
      `,
      [legacyKeyId]
    )
    const migratedRow = migrated.rows[0] as {
      public_key: Buffer
      private_key_ciphertext: Buffer
      private_key_iv: Buffer
      private_key_tag: Buffer
    }

    expect(Buffer.isBuffer(migratedRow.public_key)).toBe(true)
    expect(migratedRow.public_key.toString('utf8')).toBe(publicKeyPem)
    expect(migratedRow.private_key_ciphertext.equals(Buffer.from(encrypted.ciphertextBase64, 'base64'))).toBe(
      true
    )
    expect(migratedRow.private_key_iv.equals(Buffer.from(encrypted.ivBase64, 'base64'))).toBe(true)
    expect(migratedRow.private_key_tag.equals(Buffer.from(encrypted.tagBase64, 'base64'))).toBe(true)
  })

  it('maintains exactly one ACTIVE conductor key under concurrent rotations', async () => {
    const rotations = Array.from({ length: 4 }, (_, index) =>
      conductor.rotateConductorKey({
        keyId: `conductor-key-concurrent-${index}-${randomUUID()}`,
        verificationGraceDays: 2
      })
    )

    const settled = await Promise.allSettled(rotations)
    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(failures).toHaveLength(0)

    const activeRows = await pool.query(
      `
        SELECT key_id
        FROM conductor_keys
        WHERE status = 'ACTIVE'
        ORDER BY updated_at DESC
      `
    )
    expect(activeRows.rows).toHaveLength(1)

    const listedKeys = await conductor.listConductorKeys()
    expect(listedKeys.filter((key: { status: string }) => key.status === 'ACTIVE')).toHaveLength(1)
  })

  it('survives corrupted encrypted private key rows without crashing loader or dispatch', async () => {
    const rotation = await conductor.rotateConductorKey({
      keyId: `conductor-key-corrupt-${randomUUID()}`,
      verificationGraceDays: 2
    })
    const activeKeyId = rotation.key.keyId

    await pool.query(
      `
        UPDATE conductor_keys
        SET
          private_key_ciphertext = decode('00', 'hex'),
          private_key_iv = decode('00', 'hex'),
          private_key_tag = decode('00', 'hex'),
          updated_at = NOW()
        WHERE key_id = $1
      `,
      [activeKeyId]
    )

    await expect(conductor['loadConductorKeyRegistryFromDb']()).resolves.toBeUndefined()

    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-corrupt-key'
    })

    const committed = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-corrupt-key',
      intent: 'MISSION_REPORT',
      payload: { body: 'dispatch should still succeed with in-memory key material' },
      prismHolderApproved: true
    })
    expect(committed.ledgerEnvelope.conductorSignatureV2?.keyId).toBe(activeKeyId)

    const report = await conductor.verifyThreadLedger(threadId)
    expect(report).not.toBeNull()
    expect(report.verified).toBe(true)
  })

  it('benchmarks verifyThreadLedger throughput on a 120-entry thread', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-benchmark'
    })

    for (let index = 0; index < 120; index += 1) {
      await conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-benchmark',
        intent: 'MISSION_REPORT',
        payload: { body: `entry-${index}` },
        prismHolderApproved: true
      })
    }

    const startedAt = Date.now()
    const report = await conductor.verifyThreadLedger(threadId)
    const durationMs = Date.now() - startedAt

    expect(report).not.toBeNull()
    expect(report.verified).toBe(true)
    expect(report.checkedEntries).toBe(120)
    // Keep a generous ceiling to avoid flaky CI while still catching severe regressions.
    expect(durationMs).toBeLessThan(15_000)
  })

  it('benchmarks concurrent ACK throughput with 100 simultaneous acknowledge calls', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:ack-benchmark'
    })

    const targetEntry = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:ack-benchmark',
      intent: 'MISSION_REPORT',
      payload: { body: 'ack benchmark target' },
      prismHolderApproved: true
    })

    const startedAt = Date.now()
    const ackResults = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        conductor.acknowledgeEntry({
          threadId,
          actorDid: `did:example:ack-bench-${index}`,
          targetMessageId: targetEntry.clientEnvelope.messageId,
          attestation: [`bench-${index}`]
        })
      )
    )
    const durationMs = Date.now() - startedAt

    expect(ackResults).toHaveLength(100)
    expect(new Set(ackResults.map((ack: { ackId: number }) => ack.ackId)).size).toBe(100)

    const storedCount = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM sphere_acks
        WHERE thread_id = $1
          AND target_message_id = $2
      `,
      [threadId, targetEntry.clientEnvelope.messageId]
    )
    expect(storedCount.rows[0]?.count).toBe(100)
    // Generous threshold to catch severe regressions while avoiding flaky CI.
    expect(durationMs).toBeLessThan(20_000)
  })

  it('benchmarks conductor key registry read path with 10k historical keys', async () => {
    await pool.query(
      `
        WITH active_key AS (
          SELECT public_key
          FROM conductor_keys
          WHERE status = 'ACTIVE'
          ORDER BY activation_date DESC
          LIMIT 1
        )
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
        SELECT
          'bench-registry-' || gs::text,
          active_key.public_key,
          'RETIRED',
          NOW() - (gs || ' minutes')::interval,
          NOW() - (gs || ' minutes')::interval,
          0,
          NULL,
          NULL,
          NULL,
          NOW(),
          NOW()
        FROM generate_series(1, 9999) AS gs
        CROSS JOIN active_key
      `
    )

    const listStartedAt = Date.now()
    const listedKeys = await conductor.listConductorKeys()
    const listDurationMs = Date.now() - listStartedAt

    expect(listedKeys.length).toBeGreaterThanOrEqual(10_000)

    const loadStartedAt = Date.now()
    await conductor['loadConductorKeyRegistryFromDb']()
    const loadDurationMs = Date.now() - loadStartedAt

    const materialCount = conductor['conductorEd25519PublicKeys'].size as number
    expect(materialCount).toBeGreaterThanOrEqual(10_000)

    // Thresholds are intentionally broad to avoid CI flakiness while still flagging regressions.
    expect(listDurationMs).toBeLessThan(30_000)
    expect(loadDurationMs).toBeLessThan(30_000)
  })

  it('requires signed counselor ACK quorum for material-impact intents', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await pool.query(
      `
        INSERT INTO counselors (counselor_did, counselor_set, is_active)
        VALUES
          ($1, 'security_council', TRUE),
          ($2, 'security_council', TRUE)
      `,
      ['did:example:counselor-1', 'did:example:counselor-2']
    )

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-2'
    })

    const targetEntry = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-2',
      intent: 'MISSION_REPORT',
      payload: { body: 'target for quorum acks' },
      prismHolderApproved: true
    })

    await conductor.acknowledgeEntry({
      threadId,
      actorDid: 'did:example:counselor-1',
      targetMessageId: targetEntry.clientEnvelope.messageId,
      attestation: ['approve-force-evict']
    })

    await expect(
      conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-2',
        intent: 'FORCE_EVICT',
        payload: { reason: 'insufficient quorum should fail first' },
        attestation: [targetEntry.clientEnvelope.messageId],
        prismHolderApproved: true
      })
    ).rejects.toMatchObject({
      code: 'STM_ERR_MISSING_ATTESTATION'
    })

    await conductor.acknowledgeEntry({
      threadId,
      actorDid: 'did:example:counselor-2',
      targetMessageId: targetEntry.clientEnvelope.messageId,
      attestation: ['approve-force-evict']
    })

    const committed = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:agent-2',
      intent: 'FORCE_EVICT',
      payload: { reason: 'quorum met' },
      attestation: [targetEntry.clientEnvelope.messageId],
      prismHolderApproved: true
    })

    expect(committed.clientEnvelope.intent).toBe('FORCE_EVICT')
    expect(committed.ledgerEnvelope.sequence).toBe(2)
  })

  it('enforces verified counselor ACK signatures for quorum after activation grace', async () => {
    const priorRequire = conductor['requireVerifiedCounselorAckSignatures']
    const priorActivationAt = conductor['counselorAckSignatureActivationAt']
    const priorGraceDays = conductor['counselorAckSignatureGraceDays']

    conductor['requireVerifiedCounselorAckSignatures'] = true
    conductor['counselorAckSignatureActivationAt'] = new Date(Date.now() - 60_000).toISOString()
    conductor['counselorAckSignatureGraceDays'] = 0

    try {
      const counselorOne = generateKeyPairSync('ed25519')
      const counselorTwo = generateKeyPairSync('ed25519')
      const counselorOneDid = toDidKeyFromPublicKeyDer(
        counselorOne.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
      )
      const counselorTwoDid = toDidKeyFromPublicKeyDer(
        counselorTwo.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
      )

      await pool.query(
        `
          INSERT INTO counselors (counselor_did, counselor_set, is_active)
          VALUES
            ($1, 'security_council', TRUE),
            ($2, 'security_council', TRUE)
        `,
        [counselorOneDid, counselorTwoDid]
      )

      const threadId = randomUUID()
      const missionId = randomUUID()
      await conductor.createThread({
        threadId,
        missionId,
        createdBy: 'did:example:agent-verified-quorum'
      })

      const targetEntry = await conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-verified-quorum',
        intent: 'MISSION_REPORT',
        payload: { body: 'target for verified quorum' },
        prismHolderApproved: true
      })

      const ackTwoMessageId = randomUUID()
      const ackTwoTraceId = randomUUID()
      const ackTwoCanonical = buildCanonicalAckPayload({
        threadId,
        actorDid: counselorTwoDid,
        targetSequence: targetEntry.ledgerEnvelope.sequence,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: ackTwoMessageId,
        traceId: ackTwoTraceId,
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['approve-force-evict'],
        receivedAt: null
      })

      await conductor.acknowledgeEntry({
        threadId,
        actorDid: counselorOneDid,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        attestation: ['approve-force-evict']
      })

      await conductor.acknowledgeEntry({
        threadId,
        actorDid: counselorTwoDid,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: ackTwoMessageId,
        traceId: ackTwoTraceId,
        attestation: ['approve-force-evict'],
        agentSignature: createEdDsaCompactJws(ackTwoCanonical, counselorTwo.privateKey)
      })

      await expect(
        conductor.dispatchIntent({
          threadId,
          missionId,
          authorAgentId: 'did:example:agent-verified-quorum',
          intent: 'FORCE_EVICT',
          payload: { reason: 'one ack is not verifiable and should fail quorum' },
          attestation: [targetEntry.clientEnvelope.messageId],
          prismHolderApproved: true
        })
      ).rejects.toMatchObject({
        code: 'STM_ERR_MISSING_ATTESTATION'
      })

      const ackOneMessageId = randomUUID()
      const ackOneTraceId = randomUUID()
      const ackOneCanonical = buildCanonicalAckPayload({
        threadId,
        actorDid: counselorOneDid,
        targetSequence: targetEntry.ledgerEnvelope.sequence,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: ackOneMessageId,
        traceId: ackOneTraceId,
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['approve-force-evict'],
        receivedAt: null
      })

      await conductor.acknowledgeEntry({
        threadId,
        actorDid: counselorOneDid,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: ackOneMessageId,
        traceId: ackOneTraceId,
        attestation: ['approve-force-evict'],
        agentSignature: createEdDsaCompactJws(ackOneCanonical, counselorOne.privateKey)
      })

      const committed = await conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-verified-quorum',
        intent: 'FORCE_EVICT',
        payload: { reason: 'both counselor ACK signatures now verifiable' },
        attestation: [targetEntry.clientEnvelope.messageId],
        prismHolderApproved: true
      })
      expect(committed.clientEnvelope.intent).toBe('FORCE_EVICT')
    } finally {
      conductor['requireVerifiedCounselorAckSignatures'] = priorRequire
      conductor['counselorAckSignatureActivationAt'] = priorActivationAt
      conductor['counselorAckSignatureGraceDays'] = priorGraceDays
    }
  })

  it('accepts mixed verified/unverified counselor ACKs during grace and rejects partial legacy quorum after grace', async () => {
    const priorRequire = conductor['requireVerifiedCounselorAckSignatures']
    const priorActivationAt = conductor['counselorAckSignatureActivationAt']
    const priorGraceDays = conductor['counselorAckSignatureGraceDays']

    conductor['requireVerifiedCounselorAckSignatures'] = true
    conductor['counselorAckSignatureActivationAt'] = new Date(Date.now() - 60_000).toISOString()
    conductor['counselorAckSignatureGraceDays'] = 1

    try {
      const counselorOne = generateKeyPairSync('ed25519')
      const counselorTwo = generateKeyPairSync('ed25519')
      const counselorOneDid = toDidKeyFromPublicKeyDer(
        counselorOne.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
      )
      const counselorTwoDid = toDidKeyFromPublicKeyDer(
        counselorTwo.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
      )

      await pool.query(
        `
          INSERT INTO counselors (counselor_did, counselor_set, is_active)
          VALUES
            ($1, 'security_council', TRUE),
            ($2, 'security_council', TRUE)
        `,
        [counselorOneDid, counselorTwoDid]
      )

      const threadId = randomUUID()
      const missionId = randomUUID()
      await conductor.createThread({
        threadId,
        missionId,
        createdBy: 'did:example:agent-grace-quorum'
      })

      const targetEntry = await conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-grace-quorum',
        intent: 'MISSION_REPORT',
        payload: { body: 'target for grace-quorum behavior' },
        prismHolderApproved: true
      })

      // ACK #1 is legacy/unverified (no caller-provided JWS, internal fallback signature).
      await conductor.acknowledgeEntry({
        threadId,
        actorDid: counselorOneDid,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        attestation: ['approve-force-evict']
      })

      // ACK #2 is explicitly verifiable Ed25519 JWS.
      const verifiedAckMessageId = randomUUID()
      const verifiedAckTraceId = randomUUID()
      const verifiedAckCanonical = buildCanonicalAckPayload({
        threadId,
        actorDid: counselorTwoDid,
        targetSequence: targetEntry.ledgerEnvelope.sequence,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: verifiedAckMessageId,
        traceId: verifiedAckTraceId,
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['approve-force-evict'],
        receivedAt: null
      })

      await conductor.acknowledgeEntry({
        threadId,
        actorDid: counselorTwoDid,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: verifiedAckMessageId,
        traceId: verifiedAckTraceId,
        attestation: ['approve-force-evict'],
        agentSignature: createEdDsaCompactJws(verifiedAckCanonical, counselorTwo.privateKey)
      })

      // During grace, mixed legacy+verified counselor ACKs still satisfy quorum.
      const duringGrace = await conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-grace-quorum',
        intent: 'FORCE_EVICT',
        payload: { reason: 'mixed acknowledgements during grace' },
        attestation: [targetEntry.clientEnvelope.messageId],
        prismHolderApproved: true
      })
      expect(duringGrace.clientEnvelope.intent).toBe('FORCE_EVICT')

      // Move to post-grace strict enforcement window.
      conductor['counselorAckSignatureGraceDays'] = 0
      conductor['counselorAckSignatureActivationAt'] = new Date(Date.now() - 60_000).toISOString()

      // Same mixed quorum must now fail because one counselor ACK is unverifiable.
      await expect(
        conductor.dispatchIntent({
          threadId,
          missionId,
          authorAgentId: 'did:example:agent-grace-quorum',
          intent: 'FORCE_EVICT',
          payload: { reason: 'mixed acknowledgements after grace should fail' },
          attestation: [targetEntry.clientEnvelope.messageId],
          prismHolderApproved: true
        })
      ).rejects.toMatchObject({
        code: 'STM_ERR_MISSING_ATTESTATION'
      })

      // Upgrade counselor #1 ACK to a verifiable signature, then strict quorum should pass.
      const upgradedAckMessageId = randomUUID()
      const upgradedAckTraceId = randomUUID()
      const upgradedAckCanonical = buildCanonicalAckPayload({
        threadId,
        actorDid: counselorOneDid,
        targetSequence: targetEntry.ledgerEnvelope.sequence,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: upgradedAckMessageId,
        traceId: upgradedAckTraceId,
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['approve-force-evict'],
        receivedAt: null
      })

      await conductor.acknowledgeEntry({
        threadId,
        actorDid: counselorOneDid,
        targetMessageId: targetEntry.clientEnvelope.messageId,
        ackMessageId: upgradedAckMessageId,
        traceId: upgradedAckTraceId,
        attestation: ['approve-force-evict'],
        agentSignature: createEdDsaCompactJws(upgradedAckCanonical, counselorOne.privateKey)
      })

      const afterUpgrade = await conductor.dispatchIntent({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-grace-quorum',
        intent: 'FORCE_EVICT',
        payload: { reason: 'strict window with fully verifiable quorum' },
        attestation: [targetEntry.clientEnvelope.messageId],
        prismHolderApproved: true
      })
      expect(afterUpgrade.clientEnvelope.intent).toBe('FORCE_EVICT')
    } finally {
      conductor['requireVerifiedCounselorAckSignatures'] = priorRequire
      conductor['counselorAckSignatureActivationAt'] = priorActivationAt
      conductor['counselorAckSignatureGraceDays'] = priorGraceDays
    }
  })

  it('rejects direct sphere_events insert outside conductor-owned write path', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-3'
    })

    await expect(
      pool.query(
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
          VALUES ($1, $2, $3, $4, $5, NOW(), $6::jsonb, $7::jsonb, $8::jsonb, $9)
        `,
        [
          threadId,
          1,
          randomUUID(),
          'did:example:attacker',
          'MISSION_REPORT',
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify({}),
          'deadbeef'
        ]
      )
    ).rejects.toMatchObject({
      code: '42501'
    })
  })

  it('enforces app-role grants: direct insert blocked, append function allowed', async () => {
    const roleName = `sphere_app_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    const rolePassword = `pw_${randomUUID().replace(/-/g, '')}`
    const threadId = randomUUID()

    await pool.query(
      `CREATE ROLE ${quoteIdentifier(roleName)} LOGIN PASSWORD '${rolePassword.replace(/'/g, "''")}'`
    )

    try {
      await pool.query('SELECT metacanon_apply_sphere_app_role_grants($1)', [roleName])

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
          VALUES ($1, $2, $3, 'ACTIVE', 1, NOW(), NOW())
        `,
        [threadId, randomUUID(), 'did:example:owner']
      )

      const appUrl = new URL(process.env.DATABASE_URL as string)
      appUrl.username = roleName
      appUrl.password = rolePassword
      const appPool = new Pool({ connectionString: appUrl.toString() })

      try {
        await expect(
          appPool.query(
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
              VALUES ($1, 1, $2, $3, 'MISSION_REPORT', NOW(), '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'deadbeef')
            `,
            [threadId, randomUUID(), 'did:example:app-role']
          )
        ).rejects.toMatchObject({
          code: '42501'
        })

        await appPool.query(
          `
            SELECT metacanon_append_sphere_event(
              $1::uuid,
              1,
              $2::uuid,
              $3::text,
              'MISSION_REPORT'::text,
              NOW(),
              '{"messageId":"x"}'::jsonb,
              '{"sequence":1}'::jsonb,
              '{"ok":true}'::jsonb,
              'abc123'::text
            )
          `,
          [threadId, randomUUID(), 'did:example:app-role']
        )
      } finally {
        await appPool.end()
      }

      const inserted = await pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM sphere_events
          WHERE thread_id = $1
        `,
        [threadId]
      )
      expect(inserted.rows[0]?.count).toBe(1)
    } finally {
      await pool.query(`DROP OWNED BY ${quoteIdentifier(roleName)}`)
      await pool.query(`DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`)
    }
  })

  it('enforces sphere_acks bypass guard: direct writes blocked, append function allowed', async () => {
    const roleName = `sphere_app_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    const rolePassword = `pw_${randomUUID().replace(/-/g, '')}`
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:owner-ack'
    })
    const targetEntry = await conductor.dispatchIntent({
      threadId,
      missionId,
      authorAgentId: 'did:example:owner-ack',
      intent: 'MISSION_REPORT',
      payload: { body: 'target for ack guard' },
      prismHolderApproved: true
    })

    await pool.query(
      `CREATE ROLE ${quoteIdentifier(roleName)} LOGIN PASSWORD '${rolePassword.replace(/'/g, "''")}'`
    )

    try {
      await pool.query('SELECT metacanon_apply_sphere_app_role_grants($1)', [roleName])

      const appUrl = new URL(process.env.DATABASE_URL as string)
      appUrl.username = roleName
      appUrl.password = rolePassword
      const appPool = new Pool({ connectionString: appUrl.toString() })

      try {
        await expect(
          appPool.query(
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
                agent_signature
              )
              VALUES (
                $1,
                $2,
                $3,
                'did:example:app-role-ack',
                $4,
                $5,
                'ACK_ENTRY',
                '3.0',
                '[]'::jsonb,
                'sig:direct-insert'
              )
            `,
            [
              threadId,
              targetEntry.ledgerEnvelope.sequence,
              targetEntry.clientEnvelope.messageId,
              randomUUID(),
              randomUUID()
            ]
          )
        ).rejects.toMatchObject({
          code: '42501'
        })

        await appPool.query(
          `
            SELECT ack_id
            FROM metacanon_append_sphere_ack(
              $1::uuid,
              $2::bigint,
              $3::uuid,
              $4::text,
              $5::uuid,
              $6::uuid,
              'ACK_ENTRY'::text,
              '3.0'::text,
              '[]'::jsonb,
              'sig:app-role-function'::text,
              NULL::timestamptz
            )
          `,
          [
            threadId,
            targetEntry.ledgerEnvelope.sequence,
            targetEntry.clientEnvelope.messageId,
            'did:example:app-role-ack',
            randomUUID(),
            randomUUID()
          ]
        )

        await expect(
          appPool.query(
            `
              UPDATE sphere_acks
              SET agent_signature = 'sig:tampered-update'
              WHERE thread_id = $1
                AND actor_did = 'did:example:app-role-ack'
            `,
            [threadId]
          )
        ).rejects.toMatchObject({
          code: '42501'
        })
      } finally {
        await appPool.end()
      }

      const ackRows = await pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM sphere_acks
          WHERE thread_id = $1
            AND actor_did = 'did:example:app-role-ack'
        `,
        [threadId]
      )
      expect(ackRows.rows[0]?.count).toBe(1)
    } finally {
      await pool.query(`DROP OWNED BY ${quoteIdentifier(roleName)}`)
      await pool.query(`DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`)
    }
  })
})
