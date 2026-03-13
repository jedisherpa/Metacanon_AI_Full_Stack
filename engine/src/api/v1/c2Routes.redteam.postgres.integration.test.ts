import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const runPgIntegration = process.env.RUN_PG_INTEGRATION === '1'
const redTeamReportPath = process.env.METACANON_REDTEAM_REPORT_PATH?.trim() || null

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }>
  end: () => Promise<void>
}

type ScenarioStatus = 'passed' | 'failed'

type RedTeamScenarioResult = {
  scenarioId: string
  attackClass:
    | 'signature_validation'
    | 'quorum_and_breakglass'
    | 'db_write_bypass'
    | 'replay_idempotency'
    | 'mixed_key_rotation'
  status: ScenarioStatus
  expected: Record<string, unknown>
  observed: Record<string, unknown>
  capturedAt: string
}

type RegisteredSigner = {
  did: string
  keyPair: ReturnType<typeof generateKeyPairSync>
}

const scenarioResults: RedTeamScenarioResult[] = []

function setEnv(serviceToken: string): void {
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
  process.env.SPHERE_BFF_SERVICE_TOKEN = serviceToken
  process.env.SPHERE_SIGNATURE_VERIFICATION = 'did_key'
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

function createEdDsaCompactJws(
  payload: string,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']
): string {
  const headerSegment = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf8').toString(
    'base64url'
  )
  const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url')
  const signingInput = `${headerSegment}.${payloadSegment}`
  const signatureSegment = sign(null, Buffer.from(signingInput, 'utf8'), privateKey).toString(
    'base64url'
  )
  return `${headerSegment}.${payloadSegment}.${signatureSegment}`
}

function buildCanonicalDispatchPayload(input: {
  threadId: string
  authorAgentId: string
  messageId: string
  traceId: string
  intent: string
  attestation: string[]
  schemaVersion: string
  protocolVersion: string
  causationId: string[]
  idempotencyKey?: string
  payload: Record<string, unknown>
}): string {
  return canonicalize({
    clientEnvelope: {
      messageId: input.messageId,
      threadId: input.threadId,
      authorAgentId: input.authorAgentId,
      intent: input.intent,
      protocolVersion: input.protocolVersion,
      schemaVersion: input.schemaVersion,
      traceId: input.traceId,
      causationId: input.causationId,
      attestation: input.attestation,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {})
    },
    payload: input.payload
  })
}

function recordScenario(result: RedTeamScenarioResult): void {
  scenarioResults.push(result)
}

async function flushRedTeamReport(): Promise<void> {
  if (!redTeamReportPath) {
    return
  }

  const attackClassCounts = scenarioResults.reduce<Record<string, number>>((counts, scenario) => {
    counts[scenario.attackClass] = (counts[scenario.attackClass] ?? 0) + 1
    return counts
  }, {})
  const passedScenarios = scenarioResults.filter((scenario) => scenario.status === 'passed').length
  const failedScenarios = scenarioResults.length - passedScenarios

  const report = {
    generatedAt: new Date().toISOString(),
    suite: 'governance_redteam',
    metrics: {
      totalScenarios: scenarioResults.length,
      passedScenarios,
      failedScenarios,
      blockedProbeScenarios: passedScenarios,
      attackClassCounts
    },
    scenarios: scenarioResults
  }

  await mkdir(path.dirname(redTeamReportPath), { recursive: true })
  await writeFile(redTeamReportPath, JSON.stringify(report, null, 2), 'utf8')
}

describe.runIf(runPgIntegration)('Sphere routes governance red-team harness', () => {
  let request: any
  let pool: QueryablePool
  let conductor: any
  const serviceToken = 'sphere-redteam-token-123456'
  const didKeyActor = 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ'

  async function registerSigner(signer: RegisteredSigner): Promise<void> {
    const response = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        did: signer.did,
        publicKey: signer.keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      })

    expect(response.status).toBe(201)
  }

  async function postSignedMessage(input: {
    threadId: string
    authorAgentId: string
    signer: RegisteredSigner
    intent: string
    attestation: string[]
    payload: Record<string, unknown>
    messageId?: string
    traceId?: string
    idempotencyKey?: string
  }): Promise<any> {
    const messageId = input.messageId ?? randomUUID()
    const traceId = input.traceId ?? randomUUID()
    const schemaVersion = '3.0'
    const protocolVersion = '3.0'
    const causationId: string[] = []

    const payload = {
      threadId: input.threadId,
      authorAgentId: input.authorAgentId,
      messageId,
      traceId,
      schemaVersion,
      protocolVersion,
      causationId,
      intent: input.intent,
      attestation: input.attestation,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      payload: input.payload
    }

    const agentSignature = createEdDsaCompactJws(
      buildCanonicalDispatchPayload({
        threadId: input.threadId,
        authorAgentId: input.authorAgentId,
        messageId,
        traceId,
        intent: input.intent,
        attestation: input.attestation,
        schemaVersion,
        protocolVersion,
        causationId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload
      }),
      input.signer.keyPair.privateKey
    )

    return request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        ...payload,
        agentSignature
      })
  }

  beforeAll(async () => {
    setEnv(serviceToken)

    const governanceDir = await mkdtemp(path.join(tmpdir(), 'metacanon-redteam-governance-'))
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

    const bootstrapKeyPair = generateKeyPairSync('ed25519')

    const expressMod = await import('express')
    const supertestMod = await import('supertest')
    const routesMod = await import('./c2Routes.js')
    const { SphereConductor } = await import('../../sphere/conductor.js')
    const { DidRegistry } = await import('../../sphere/didRegistry.js')
    ;({ pool } = await import('../../db/client.js'))

    const validateIntent = (input: {
      intent: string
      agentDid: string
      threadState: 'ACTIVE' | 'HALTED' | 'DEGRADED_NO_LLM'
      prismHolderApproved: boolean
    }) => {
      const normalized = input.intent.trim().toUpperCase()

      if (normalized === 'EMERGENCY_SHUTDOWN') {
        return {
          allowed: false,
          code: 'BREAK_GLASS_AUTH_FAILED' as const,
          message: 'Synthetic break-glass rejection for red-team harness.',
          requiresApproval: false,
          highRisk: true
        }
      }

      return {
        allowed: true,
        requiresApproval: false,
        highRisk: normalized === 'FORCE_EVICT'
      }
    }

    conductor = await SphereConductor.create({
      conductorSecret: 'redteam-harness-secret',
      conductorEd25519PrivateKey: bootstrapKeyPair.privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      conductorEd25519KeyId: 'conductor-key-redteam-bootstrap',
      requireConductorSignatureV2: true,
      signatureVerificationMode: 'did_key',
      governanceConfigPath,
      validateIntent
    })

    const didRegistry = await DidRegistry.create()

    const app = expressMod.default()
    app.use(expressMod.default.json())
    app.use(
      routesMod.createSphereRoutes({
        conductor,
        didRegistry,
        includeLegacyAlias: false
      })
    )

    request = supertestMod.default(app)
  })

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        conductor_keys,
        sphere_acks,
        sphere_events,
        sphere_threads,
        counselors,
        did_registry,
        sphere_ack_write_tokens,
        sphere_event_write_tokens
      RESTART IDENTITY CASCADE
    `)

    await conductor['ensureCurrentSigningKeyPersistedForRotation']()
    await conductor['loadConductorKeyRegistryFromDb']()
  })

  afterAll(async () => {
    await flushRedTeamReport()
    await pool.end()
  })

  it('blocks signature, quorum, break-glass, and direct DB bypass probes', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()
    let observed: Record<string, unknown> = {}

    try {
      await conductor.createThread({
        threadId,
        missionId,
        createdBy: didKeyActor
      })

      const quorumSigner: RegisteredSigner = {
        did: 'did:example:redteam-quorum',
        keyPair: generateKeyPairSync('ed25519')
      }
      const breakGlassSigner: RegisteredSigner = {
        did: 'did:example:redteam-breakglass',
        keyPair: generateKeyPairSync('ed25519')
      }
      await registerSigner(quorumSigner)
      await registerSigner(breakGlassSigner)

      const invalidSignature = await request
        .post('/api/v1/sphere/messages')
        .set('authorization', `Bearer ${serviceToken}`)
        .send({
          threadId,
          messageId: randomUUID(),
          traceId: randomUUID(),
          authorAgentId: didKeyActor,
          intent: 'MISSION_REPORT',
          attestation: ['did:example:operator'],
          schemaVersion: '3.0',
          protocolVersion: '3.0',
          causationId: [],
          agentSignature: 'invalid.signature.payload',
          payload: { note: 'malformed signature probe' }
        })

      const missingQuorum = await postSignedMessage({
        threadId,
        authorAgentId: quorumSigner.did,
        signer: quorumSigner,
        intent: 'FORCE_EVICT',
        attestation: [],
        payload: { reason: 'missing counselor ACK quorum' }
      })

      const breakGlassProbe = await postSignedMessage({
        threadId,
        authorAgentId: breakGlassSigner.did,
        signer: breakGlassSigner,
        intent: 'EMERGENCY_SHUTDOWN',
        attestation: [breakGlassSigner.did],
        payload: { reason: 'unauthorized shutdown probe' }
      })

      const directEventInsert = await pool
        .query(
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
            99,
            randomUUID(),
            'did:example:attacker',
            'MISSION_REPORT',
            JSON.stringify({}),
            JSON.stringify({}),
            JSON.stringify({}),
            'deadbeef'
          ]
        )
        .then(
          () => ({ code: 'unexpected_success' }),
          (error: { code?: string }) => ({ code: error.code ?? 'unknown_error' })
        )

      const directAckInsert = await pool
        .query(
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
              'did:example:ack-attacker',
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
            1,
            randomUUID(),
            randomUUID(),
            randomUUID()
          ]
        )
        .then(
          () => ({ code: 'unexpected_success' }),
          (error: { code?: string }) => ({ code: error.code ?? 'unknown_error' })
        )

      const status = await request
        .get('/api/v1/sphere/status')
        .set('authorization', `Bearer ${serviceToken}`)

      observed = {
        invalidSignature: { status: invalidSignature.status, code: invalidSignature.body.code },
        missingQuorum: { status: missingQuorum.status, code: missingQuorum.body.code },
        breakGlassProbe: { status: breakGlassProbe.status, code: breakGlassProbe.body.code },
        directEventInsert,
        directAckInsert,
        governanceCounters: status.body.governanceMetrics?.counters
      }

      expect(observed).toMatchObject({
        invalidSignature: { status: 401, code: 'STM_ERR_INVALID_SIGNATURE' },
        missingQuorum: { status: 412, code: 'STM_ERR_MISSING_ATTESTATION' },
        breakGlassProbe: { status: 403, code: 'BREAK_GLASS_AUTH_FAILED' },
        directEventInsert: { code: '42501' },
        directAckInsert: { code: '42501' }
      })
      expect((observed.governanceCounters as Record<string, number> | undefined)?.signatureVerificationFailureTotal).toBeGreaterThanOrEqual(1)
      expect((observed.governanceCounters as Record<string, number> | undefined)?.materialImpactQuorumFailureTotal).toBeGreaterThanOrEqual(1)
      expect((observed.governanceCounters as Record<string, number> | undefined)?.breakGlassFailedTotal).toBeGreaterThanOrEqual(1)

      recordScenario({
        scenarioId: 'core_blocking_probes',
        attackClass: 'db_write_bypass',
        status: 'passed',
        expected: {
          invalidSignature: 'STM_ERR_INVALID_SIGNATURE',
          missingQuorum: 'STM_ERR_MISSING_ATTESTATION',
          breakGlassProbe: 'BREAK_GLASS_AUTH_FAILED',
          directEventInsert: '42501',
          directAckInsert: '42501'
        },
        observed,
        capturedAt: new Date().toISOString()
      })
    } catch (error) {
      recordScenario({
        scenarioId: 'core_blocking_probes',
        attackClass: 'db_write_bypass',
        status: 'failed',
        expected: {
          invalidSignature: 'STM_ERR_INVALID_SIGNATURE',
          missingQuorum: 'STM_ERR_MISSING_ATTESTATION',
          breakGlassProbe: 'BREAK_GLASS_AUTH_FAILED',
          directEventInsert: '42501',
          directAckInsert: '42501'
        },
        observed,
        capturedAt: new Date().toISOString()
      })
      throw error
    }
  })

  it('rejects replay and duplicate-message idempotency abuse attempts', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()
    let observed: Record<string, unknown> = {}

    try {
      await conductor.createThread({
        threadId,
        missionId,
        createdBy: didKeyActor
      })

      const replaySigner: RegisteredSigner = {
        did: 'did:example:redteam-replay',
        keyPair: generateKeyPairSync('ed25519')
      }
      await registerSigner(replaySigner)

      const replayMessageId = randomUUID()
      const firstResponse = await postSignedMessage({
        threadId,
        authorAgentId: replaySigner.did,
        signer: replaySigner,
        messageId: replayMessageId,
        idempotencyKey: 'redteam-replay-key',
        intent: 'MISSION_REPORT',
        attestation: ['did:example:operator'],
        payload: { body: 'baseline message' }
      })

      const replayedResponse = await postSignedMessage({
        threadId,
        authorAgentId: replaySigner.did,
        signer: replaySigner,
        messageId: replayMessageId,
        idempotencyKey: 'redteam-replay-key',
        intent: 'MISSION_REPORT',
        attestation: ['did:example:operator'],
        payload: { body: 'tampered replay payload' }
      })

      observed = {
        firstResponse: { status: firstResponse.status, sequence: firstResponse.body.sequence },
        replayedResponse: { status: replayedResponse.status, code: replayedResponse.body.code }
      }

      expect(observed).toMatchObject({
        firstResponse: { status: 201, sequence: 1 },
        replayedResponse: { status: 409, code: 'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY' }
      })

      recordScenario({
        scenarioId: 'replay_duplicate_message',
        attackClass: 'replay_idempotency',
        status: 'passed',
        expected: {
          firstResponse: 201,
          replayedResponse: 'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY'
        },
        observed,
        capturedAt: new Date().toISOString()
      })
    } catch (error) {
      recordScenario({
        scenarioId: 'replay_duplicate_message',
        attackClass: 'replay_idempotency',
        status: 'failed',
        expected: {
          firstResponse: 201,
          replayedResponse: 'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY'
        },
        observed,
        capturedAt: new Date().toISOString()
      })
      throw error
    }
  })

  it('detects mixed-key rotation edge tampering through ledger verification', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()
    let observed: Record<string, unknown> = {}

    try {
      await conductor.createThread({
        threadId,
        missionId,
        createdBy: didKeyActor
      })

      const signer: RegisteredSigner = {
        did: 'did:example:redteam-rotation',
        keyPair: generateKeyPairSync('ed25519')
      }
      await registerSigner(signer)

      const firstResponse = await postSignedMessage({
        threadId,
        authorAgentId: signer.did,
        signer,
        intent: 'MISSION_REPORT',
        attestation: ['did:example:operator'],
        payload: { body: 'pre-rotation entry' }
      })
      expect(firstResponse.status).toBe(201)

      const rotateResponse = await request
        .post('/api/v1/sphere/rotate-conductor-key')
        .set('authorization', `Bearer ${serviceToken}`)
        .send({
          keyId: 'conductor-key-redteam-rotated',
          verificationGraceDays: 7
        })
      expect(rotateResponse.status).toBe(201)

      const secondResponse = await postSignedMessage({
        threadId,
        authorAgentId: signer.did,
        signer,
        intent: 'MISSION_REPORT',
        attestation: ['did:example:operator'],
        payload: { body: 'post-rotation entry' }
      })
      expect(secondResponse.status).toBe(201)

      await pool.query(
        `
          UPDATE sphere_events
          SET ledger_envelope = jsonb_set(
            ledger_envelope,
            '{conductorSignatureV2,keyId}',
            to_jsonb($2::text),
            false
          )
          WHERE thread_id = $1
            AND sequence = 1
        `,
        [threadId, 'conductor-key-redteam-rotated']
      )

      const verifyResponse = await request
        .get(`/api/v1/sphere/threads/${threadId}/verify-ledger`)
        .set('authorization', `Bearer ${serviceToken}`)

      const issueCodes = new Set(
        (verifyResponse.body.issues ?? []).map((issue: { code: string }) => issue.code)
      )
      observed = {
        rotateStatus: rotateResponse.status,
        verifyStatus: verifyResponse.status,
        verified: verifyResponse.body.verified,
        issueCodes: [...issueCodes]
      }

      expect(verifyResponse.status).toBe(200)
      expect(verifyResponse.body.verified).toBe(false)
      expect(issueCodes.has('INVALID_CONDUCTOR_SIGNATURE_V2')).toBe(true)
      expect(issueCodes.has('ENTRY_HASH_MISMATCH')).toBe(true)

      recordScenario({
        scenarioId: 'mixed_key_rotation_tamper',
        attackClass: 'mixed_key_rotation',
        status: 'passed',
        expected: {
          verifyStatus: 200,
          verified: false,
          requiredIssueCodes: ['INVALID_CONDUCTOR_SIGNATURE_V2', 'ENTRY_HASH_MISMATCH']
        },
        observed,
        capturedAt: new Date().toISOString()
      })
    } catch (error) {
      recordScenario({
        scenarioId: 'mixed_key_rotation_tamper',
        attackClass: 'mixed_key_rotation',
        status: 'failed',
        expected: {
          verifyStatus: 200,
          verified: false,
          requiredIssueCodes: ['INVALID_CONDUCTOR_SIGNATURE_V2', 'ENTRY_HASH_MISMATCH']
        },
        observed,
        capturedAt: new Date().toISOString()
      })
      throw error
    }
  })
})
