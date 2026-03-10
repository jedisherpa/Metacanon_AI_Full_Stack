import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
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

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
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
        sphere_acks,
        sphere_events,
        sphere_threads,
        counselors,
        sphere_event_write_tokens
      RESTART IDENTITY CASCADE
    `)
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
    expect(issueCodes.has('INVALID_CONDUCTOR_SIGNATURE_V2')).toBe(true)
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
})
