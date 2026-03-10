import { createHash, randomUUID } from 'node:crypto'
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
  process.env.SPHERE_SIGNATURE_VERIFICATION = 'off'
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

describe.runIf(runPgIntegration)('Sphere routes Postgres integration', () => {
  let request: any
  let pool: QueryablePool
  let conductor: any
  const serviceToken = 'sphere-integration-token-123456'

  beforeAll(async () => {
    setEnv(serviceToken)

    const governanceDir = await mkdtemp(path.join(tmpdir(), 'metacanon-api-governance-'))
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

    conductor = await SphereConductor.create({
      conductorSecret: 'integration-secret',
      signatureVerificationMode: 'off',
      governanceConfigPath,
      validateIntent: () => ({
        allowed: true,
        highRisk: false,
        requiresApproval: false
      })
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
        sphere_event_write_tokens
      RESTART IDENTITY CASCADE
    `)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('commits messages via API and preserves replay hash-chain ordering', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()
    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:agent-1'
    })

    const firstMessageId = randomUUID()
    const secondMessageId = randomUUID()

    const firstResponse = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-1',
        messageId: firstMessageId,
        traceId: randomUUID(),
        intent: 'MISSION_REPORT',
        attestation: ['did:example:operator'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'sig:first',
        payload: { body: 'first' }
      })

    expect(firstResponse.status).toBe(201)
    expect(firstResponse.body.sequence).toBe(1)

    const secondResponse = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-1',
        messageId: secondMessageId,
        traceId: randomUUID(),
        intent: 'DISPATCH_MISSION',
        attestation: ['did:example:operator'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [firstMessageId],
        agentSignature: 'sig:second',
        payload: { body: 'second' }
      })

    expect(secondResponse.status).toBe(201)
    expect(secondResponse.body.sequence).toBe(2)

    const replayResponse = await request
      .get(`/api/v1/sphere/threads/${threadId}/replay?from_sequence=1`)
      .set('authorization', `Bearer ${serviceToken}`)

    expect(replayResponse.status).toBe(200)
    expect(replayResponse.body.entries).toHaveLength(2)

    const firstEntry = replayResponse.body.entries[0]
    const secondEntry = replayResponse.body.entries[1]
    expect(firstEntry.ledgerEnvelope.sequence).toBe(1)
    expect(secondEntry.ledgerEnvelope.sequence).toBe(2)

    const firstEntryHash = sha256(canonicalize(firstEntry))
    expect(secondEntry.ledgerEnvelope.prevMessageHash).toBe(firstEntryHash)
  })

  it('enforces signed ACK quorum over API before allowing material-impact intent', async () => {
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

    const targetMessageId = randomUUID()
    const targetResponse = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-2',
        messageId: targetMessageId,
        traceId: randomUUID(),
        intent: 'MISSION_REPORT',
        attestation: ['did:example:operator'],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: 'sig:target',
        payload: { body: 'target' }
      })

    expect(targetResponse.status).toBe(201)

    const firstAck = await request
      .post(`/api/v1/sphere/threads/${threadId}/ack`)
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        actorDid: 'did:example:counselor-1',
        targetMessageId,
        ackMessageId: randomUUID(),
        traceId: randomUUID(),
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['approve-force-evict'],
        agentSignature: 'sig:ack-1'
      })

    expect(firstAck.status).toBe(201)

    const insufficientQuorum = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-2',
        messageId: randomUUID(),
        traceId: randomUUID(),
        intent: 'FORCE_EVICT',
        attestation: [targetMessageId],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [targetMessageId],
        agentSignature: 'sig:force-evict-fail',
        payload: { reason: 'first attempt should fail' }
      })

    expect(insufficientQuorum.status).toBe(412)
    expect(insufficientQuorum.body.code).toBe('STM_ERR_MISSING_ATTESTATION')

    const secondAck = await request
      .post(`/api/v1/sphere/threads/${threadId}/ack`)
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        actorDid: 'did:example:counselor-2',
        targetMessageId,
        ackMessageId: randomUUID(),
        traceId: randomUUID(),
        intent: 'ACK_ENTRY',
        schemaVersion: '3.0',
        attestation: ['approve-force-evict'],
        agentSignature: 'sig:ack-2'
      })

    expect(secondAck.status).toBe(201)

    const committed = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        threadId,
        missionId,
        authorAgentId: 'did:example:agent-2',
        messageId: randomUUID(),
        traceId: randomUUID(),
        intent: 'FORCE_EVICT',
        attestation: [targetMessageId],
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [targetMessageId],
        agentSignature: 'sig:force-evict-pass',
        payload: { reason: 'quorum met' }
      })

    expect(committed.status).toBe(201)
    expect(committed.body.sequence).toBe(2)
  })

  it('rotates conductor key through API and exposes registry', async () => {
    const rotateResponse = await request
      .post('/api/v1/sphere/rotate-conductor-key')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        keyId: 'conductor-key-api-rotation-1',
        verificationGraceDays: 7
      })

    expect(rotateResponse.status).toBe(201)
    expect(rotateResponse.body.rotatedKey?.keyId).toBe('conductor-key-api-rotation-1')
    expect(rotateResponse.body.rotatedKey?.status).toBe('ACTIVE')
    expect(rotateResponse.body.privateKeyPem).toContain('PRIVATE KEY')

    const keyRegistryResponse = await request
      .get('/api/v1/sphere/conductor-keys')
      .set('authorization', `Bearer ${serviceToken}`)

    expect(keyRegistryResponse.status).toBe(200)
    expect(Array.isArray(keyRegistryResponse.body.keys)).toBe(true)
    expect(
      keyRegistryResponse.body.keys.some(
        (key: { keyId: string; status: string }) =>
          key.keyId === 'conductor-key-api-rotation-1' && key.status === 'ACTIVE'
      )
    ).toBe(true)
  })

  it('retires non-active conductor keys through API and rejects active-key retirement', async () => {
    const firstRotate = await request
      .post('/api/v1/sphere/rotate-conductor-key')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        keyId: 'conductor-key-api-retire-a',
        verificationGraceDays: 3
      })

    expect(firstRotate.status).toBe(201)
    expect(firstRotate.body.rotatedKey?.keyId).toBe('conductor-key-api-retire-a')
    expect(firstRotate.body.rotatedKey?.status).toBe('ACTIVE')

    const secondRotate = await request
      .post('/api/v1/sphere/rotate-conductor-key')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        keyId: 'conductor-key-api-retire-b',
        verificationGraceDays: 3
      })

    expect(secondRotate.status).toBe(201)
    expect(secondRotate.body.rotatedKey?.keyId).toBe('conductor-key-api-retire-b')
    expect(secondRotate.body.previousActiveKeyId).toBe('conductor-key-api-retire-a')

    const retireResponse = await request
      .post('/api/v1/sphere/retire-conductor-key')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        keyId: 'conductor-key-api-retire-a',
        verificationGraceDays: 9
      })

    expect(retireResponse.status).toBe(200)
    expect(retireResponse.body.retiredKey?.keyId).toBe('conductor-key-api-retire-a')
    expect(retireResponse.body.retiredKey?.status).toBe('RETIRED')
    expect(retireResponse.body.retiredKey?.verificationGraceDays).toBe(9)
    expect(retireResponse.body.gracePeriodEndsAt).toBeTypeOf('string')

    const keyRegistryResponse = await request
      .get('/api/v1/sphere/conductor-keys')
      .set('authorization', `Bearer ${serviceToken}`)

    expect(keyRegistryResponse.status).toBe(200)
    const retired = keyRegistryResponse.body.keys.find(
      (key: { keyId: string }) => key.keyId === 'conductor-key-api-retire-a'
    )
    expect(retired?.status).toBe('RETIRED')
    expect(retired?.verificationGraceDays).toBe(9)
    expect(retired?.retirementDate).toBeTypeOf('string')

    const activeRetireResponse = await request
      .post('/api/v1/sphere/retire-conductor-key')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        keyId: 'conductor-key-api-retire-b'
      })

    expect(activeRetireResponse.status).toBe(409)
    expect(activeRetireResponse.body.code).toBe('STM_ERR_CONDUCTOR_KEY_ACTIVE')
  })
})
