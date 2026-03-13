import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const runPgIntegration = process.env.RUN_PG_INTEGRATION === '1'

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }>
  end: () => Promise<void>
}

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
  missionId: string
  authorAgentId: string
  messageId: string
  traceId: string
  intent: string
  attestation: string[]
  schemaVersion: string
  protocolVersion: string
  causationId: string[]
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
      attestation: input.attestation
    },
    payload: input.payload
  })
}

describe.runIf(runPgIntegration)('Sphere routes governance red-team harness', () => {
  let request: any
  let pool: QueryablePool
  let conductor: any
  const serviceToken = 'sphere-redteam-token-123456'
  const didKeyActor = 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ'

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
  })

  afterAll(async () => {
    await pool.end()
  })

  it('blocks common adversarial API and DB attack paths and surfaces detections', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()
    await conductor.createThread({
      threadId,
      missionId,
      createdBy: didKeyActor
    })

    const postMessage = async (input: {
      authorAgentId: string
      messageId?: string
      traceId?: string
      intent: string
      attestation: string[]
      agentSignature: string
      payload: Record<string, unknown>
    }) =>
      request
        .post('/api/v1/sphere/messages')
        .set('authorization', `Bearer ${serviceToken}`)
        .send({
          threadId,
          missionId,
          messageId: input.messageId ?? randomUUID(),
          traceId: input.traceId ?? randomUUID(),
          schemaVersion: '3.0',
          protocolVersion: '3.0',
          causationId: [],
          ...input
        })

    const quorumSigner = generateKeyPairSync('ed25519')
    const breakGlassSigner = generateKeyPairSync('ed25519')
    const quorumDid = 'did:example:redteam-quorum'
    const breakGlassDid = 'did:example:redteam-breakglass'

    const registerQuorumDid = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        did: quorumDid,
        publicKey: quorumSigner.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      })
    expect(registerQuorumDid.status).toBe(201)

    const registerBreakGlassDid = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        did: breakGlassDid,
        publicKey: breakGlassSigner.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      })
    expect(registerBreakGlassDid.status).toBe(201)

    const invalidSignature = await postMessage({
      authorAgentId: didKeyActor,
      intent: 'MISSION_REPORT',
      attestation: ['did:example:operator'],
      agentSignature: 'invalid.signature.payload',
      payload: { note: 'malformed signature probe' }
    })

    const quorumMessageId = randomUUID()
    const quorumTraceId = randomUUID()
    const quorumPayload = { reason: 'missing counselor ACK quorum' }
    const quorumSignature = createEdDsaCompactJws(
      buildCanonicalDispatchPayload({
        threadId,
        missionId,
        authorAgentId: quorumDid,
        messageId: quorumMessageId,
        traceId: quorumTraceId,
        intent: 'FORCE_EVICT',
        attestation: [],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        payload: quorumPayload
      }),
      quorumSigner.privateKey
    )

    const missingQuorum = await postMessage({
      authorAgentId: quorumDid,
      messageId: quorumMessageId,
      traceId: quorumTraceId,
      intent: 'FORCE_EVICT',
      attestation: [],
      agentSignature: quorumSignature,
      payload: quorumPayload
    })

    const breakGlassMessageId = randomUUID()
    const breakGlassTraceId = randomUUID()
    const breakGlassPayload = { reason: 'unauthorized shutdown probe' }
    const breakGlassSignature = createEdDsaCompactJws(
      buildCanonicalDispatchPayload({
        threadId,
        missionId,
        authorAgentId: breakGlassDid,
        messageId: breakGlassMessageId,
        traceId: breakGlassTraceId,
        intent: 'EMERGENCY_SHUTDOWN',
        attestation: [breakGlassDid],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        payload: breakGlassPayload
      }),
      breakGlassSigner.privateKey
    )

    const breakGlassProbe = await postMessage({
      authorAgentId: breakGlassDid,
      messageId: breakGlassMessageId,
      traceId: breakGlassTraceId,
      intent: 'EMERGENCY_SHUTDOWN',
      attestation: [breakGlassDid],
      agentSignature: breakGlassSignature,
      payload: breakGlassPayload
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

    expect(status.status).toBe(200)

    const summary = {
      invalidSignature: { status: invalidSignature.status, code: invalidSignature.body.code },
      missingQuorum: { status: missingQuorum.status, code: missingQuorum.body.code },
      breakGlassProbe: { status: breakGlassProbe.status, code: breakGlassProbe.body.code },
      directEventInsert,
      directAckInsert,
      governanceCounters: status.body.governanceMetrics?.counters
    }

    expect(summary).toMatchObject({
      invalidSignature: { status: 401, code: 'STM_ERR_INVALID_SIGNATURE' },
      missingQuorum: { status: 412, code: 'STM_ERR_MISSING_ATTESTATION' },
      breakGlassProbe: { status: 403, code: 'BREAK_GLASS_AUTH_FAILED' },
      directEventInsert: { code: '42501' },
      directAckInsert: { code: '42501' }
    })
    expect(summary.governanceCounters?.signatureVerificationFailureTotal).toBeGreaterThanOrEqual(1)
    expect(summary.governanceCounters?.materialImpactQuorumFailureTotal).toBeGreaterThanOrEqual(1)
    expect(summary.governanceCounters?.breakGlassFailedTotal).toBeGreaterThanOrEqual(1)
  })
})
