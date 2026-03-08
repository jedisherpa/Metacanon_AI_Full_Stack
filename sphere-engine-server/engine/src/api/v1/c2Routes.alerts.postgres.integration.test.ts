import { randomUUID } from 'node:crypto'
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

describe.runIf(runPgIntegration)('Sphere status governance alerts integration', () => {
  let request: any
  let pool: QueryablePool
  let conductor: any
  const serviceToken = 'sphere-alerts-token-123456'
  const didKeyActor = 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ'

  beforeAll(async () => {
    setEnv(serviceToken)

    const governanceDir = await mkdtemp(path.join(tmpdir(), 'metacanon-alerts-governance-'))
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
      if (normalized === 'LENS_CHECK') {
        return {
          allowed: false,
          code: 'LENS_NOT_FOUND' as const,
          message: `No contact lens configured for agent ${input.agentDid}.`,
          requiresApproval: false,
          highRisk: false
        }
      }

      if (normalized === 'EMERGENCY_SHUTDOWN') {
        return {
          allowed: false,
          code: 'BREAK_GLASS_AUTH_FAILED' as const,
          message: 'Synthetic break-glass rejection for alert testing.',
          requiresApproval: false,
          highRisk: true
        }
      }

      if (normalized === 'AUDIT_FAIL_TEST') {
        throw new Error('synthetic fault injection: validator panic')
      }

      return {
        allowed: true,
        requiresApproval: false,
        highRisk: normalized === 'FORCE_EVICT'
      }
    }

    conductor = await SphereConductor.create({
      conductorSecret: 'alerts-integration-secret',
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

  it('fires threshold alerts and surfaces them in /status after synthetic fault injection', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()
    await conductor.createThread({
      threadId,
      missionId,
      createdBy: didKeyActor
    })

    const postMessage = async (input: {
      authorAgentId: string
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
          messageId: randomUUID(),
          traceId: randomUUID(),
          schemaVersion: '3.0',
          protocolVersion: '3.0',
          causationId: [],
          ...input
        })

    const lensFail = await postMessage({
      authorAgentId: didKeyActor,
      intent: 'LENS_CHECK',
      attestation: ['did:example:operator'],
      agentSignature: 'sig:lens-fail',
      payload: { note: 'trigger lens missing' }
    })
    expect(lensFail.status).toBe(403)
    expect(lensFail.body.code).toBe('LENS_NOT_FOUND')

    for (let index = 0; index < 3; index += 1) {
      const breakGlassFail = await postMessage({
        authorAgentId: didKeyActor,
        intent: 'EMERGENCY_SHUTDOWN',
        attestation: [didKeyActor],
        agentSignature: `sig:breakglass-${index}`,
        payload: { index }
      })
      expect(breakGlassFail.status).toBe(403)
      expect(breakGlassFail.body.code).toBe('BREAK_GLASS_AUTH_FAILED')
    }

    for (let index = 0; index < 3; index += 1) {
      const signatureFail = await postMessage({
        authorAgentId: didKeyActor,
        intent: 'SIGNATURE_TEST',
        attestation: ['did:example:operator'],
        agentSignature: 'invalid.signature.payload',
        payload: { index }
      })
      expect(signatureFail.status).toBe(401)
      expect(signatureFail.body.code).toBe('STM_ERR_INVALID_SIGNATURE')
    }

    const quorumFail = await postMessage({
      authorAgentId: didKeyActor,
      intent: 'FORCE_EVICT',
      attestation: [],
      agentSignature: 'sig:quorum-fail',
      payload: { reason: 'no signed counselor acks' }
    })
    expect(quorumFail.status).toBe(412)
    expect(quorumFail.body.code).toBe('STM_ERR_MISSING_ATTESTATION')

    const auditFail = await postMessage({
      authorAgentId: didKeyActor,
      intent: 'AUDIT_FAIL_TEST',
      attestation: ['did:example:operator'],
      agentSignature: 'sig:audit-fail',
      payload: { reason: 'synthetic validator panic' }
    })
    expect(auditFail.status).toBe(500)
    expect(auditFail.body.code).toBe('STM_ERR_INTERNAL')

    const status = await request
      .get('/api/v1/sphere/status')
      .set('authorization', `Bearer ${serviceToken}`)

    expect(status.status).toBe(200)

    const metrics = status.body.governanceMetrics
    expect(metrics).toBeTruthy()
    expect(metrics.counters.lensMissingTotal).toBeGreaterThanOrEqual(1)
    expect(metrics.counters.breakGlassFailedTotal).toBeGreaterThanOrEqual(3)
    expect(metrics.counters.signatureVerificationFailureTotal).toBeGreaterThanOrEqual(3)
    expect(metrics.counters.materialImpactQuorumFailureTotal).toBeGreaterThanOrEqual(1)
    expect(metrics.counters.auditFailureTotal).toBeGreaterThanOrEqual(1)

    const alertCodes = new Set((metrics.alerts ?? []).map((alert: { code: string }) => alert.code))
    expect(alertCodes.has('lens_missing_total')).toBe(true)
    expect(alertCodes.has('break_glass_failed_total')).toBe(true)
    expect(alertCodes.has('signature_verification_failure_total')).toBe(true)
    expect(alertCodes.has('material_impact_quorum_failure_total')).toBe(true)
    expect(alertCodes.has('audit_failure_total')).toBe(true)
  })
})
