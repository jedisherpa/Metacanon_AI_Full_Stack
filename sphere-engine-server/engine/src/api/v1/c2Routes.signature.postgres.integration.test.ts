import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
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
  process.env.SPHERE_SIGNATURE_VERIFICATION = 'strict'
}

function createEdDsaCompactJws(payload: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
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

describe.runIf(runPgIntegration)('Sphere routes strict signature Postgres integration', () => {
  let request: any
  let pool: QueryablePool
  const serviceToken = 'sphere-signature-token-123456'

  beforeAll(async () => {
    setEnv(serviceToken)

    const expressMod = await import('express')
    const supertestMod = await import('supertest')
    const routesMod = await import('./c2Routes.js')
    const { SphereConductor } = await import('../../sphere/conductor.js')
    const { DidRegistry } = await import('../../sphere/didRegistry.js')
    ;({ pool } = await import('../../db/client.js'))

    const conductor = await SphereConductor.create({
      conductorSecret: 'strict-signature-secret',
      signatureVerificationMode: 'strict',
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

  it('rejects tampered compact JWS for registered DID in strict mode', async () => {
    const keyPair = generateKeyPairSync('ed25519')
    const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const signerDid = 'did:example:strict-agent'

    const registerDid = await request
      .post('/api/v1/sphere/dids')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({ did: signerDid, publicKey: publicKeyPem })

    expect(registerDid.status).toBe(201)

    const threadId = randomUUID()
    const missionId = randomUUID()
    const messageId = randomUUID()
    const traceId = randomUUID()
    const payload = { body: 'strict signature check' }
    const attestation = ['did:example:operator']

    const validJws = createEdDsaCompactJws('{"tampered":"payload"}', keyPair.privateKey)
    const tamperedJws = `${validJws}tampered`

    const response = await request
      .post('/api/v1/sphere/messages')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        threadId,
        missionId,
        authorAgentId: signerDid,
        messageId,
        traceId,
        intent: 'MISSION_REPORT',
        attestation,
        schemaVersion: '3.0',
        protocolVersion: '3.0',
        causationId: [],
        agentSignature: tamperedJws,
        payload
      })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('STM_ERR_INVALID_SIGNATURE')
  })
})
