import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
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

async function writeGovernanceDir(baseDir: string): Promise<void> {
  await mkdir(path.join(baseDir, 'contact_lenses'), { recursive: true })

  await writeFile(
    path.join(baseDir, 'governance.yaml'),
    [
      'material_impact_intents:',
      '  - EMERGENCY_SHUTDOWN',
      'quorum_rules:',
      '  value: 2'
    ].join('\n'),
    'utf8'
  )

  await writeFile(
    path.join(baseDir, 'contact_lens_schema.json'),
    JSON.stringify({
      version: '1.0',
      description: 'integration schema placeholder'
    }),
    'utf8'
  )

  await writeFile(
    path.join(baseDir, 'high_risk_intent_registry.json'),
    JSON.stringify(
      {
        version: '1.1',
        description: 'integration high risk registry',
        prismHolderApprovalRequired: [
          {
            intent: 'EMERGENCY_SHUTDOWN',
            rationale: 'break glass control',
            approvalTimeoutSeconds: 60,
            timeoutBehavior: 'ALLOW_WITH_LOG'
          }
        ],
        breakGlassPolicy: {
          intent: 'EMERGENCY_SHUTDOWN',
          allowedInDegradedConsensus: true,
          authorizedRoles: ['Prism Holder', 'Commander'],
          dualControlRequired: true,
          alternateAuthorization: 'PRE_APPROVED_EMERGENCY_CREDENTIAL',
          auditFieldsRequired: ['reason', 'actorDid', 'confirmerDid', 'timestamp']
        },
        degradedConsensusBlockedIntents: ['DISPATCH_MISSION'],
        auditOnlyIntents: ['STEER_MISSION']
      },
      null,
      2
    ),
    'utf8'
  )

  await writeFile(
    path.join(baseDir, 'lens_upgrade_rules.json'),
    JSON.stringify(
      {
        version: '1.0',
        description: 'integration lens rules',
        rules: [
          {
            ruleId: 'rule-lens-upgrade-v1',
            fromVersion: '1.0.0',
            toVersion: '1.1.0',
            permittedLensIds: ['core-lens-1']
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  )

  const breakerLens = {
    did: 'did:example:breaker',
    scope: 'integration-test',
    permittedActivities: ['MISSION_REPORT', 'EMERGENCY_SHUTDOWN'],
    prohibitedActions: [],
    humanInTheLoopRequirements: [],
    interpretiveBoundaries: 'Stay inside constitutional policy.'
  }

  await writeFile(
    path.join(baseDir, 'contact_lenses', 'did_example_breaker.json'),
    JSON.stringify(breakerLens, null, 2),
    'utf8'
  )
}

describe.runIf(runPgIntegration)('Sphere routes break-glass Postgres integration', () => {
  let request: any
  let pool: QueryablePool
  let conductor: any
  const serviceToken = 'sphere-breakglass-token-123456'

  beforeAll(async () => {
    setEnv(serviceToken)

    const governanceDir = await mkdtemp(path.join(tmpdir(), 'metacanon-breakglass-governance-'))
    await writeGovernanceDir(governanceDir)

    const expressMod = await import('express')
    const supertestMod = await import('supertest')
    const routesMod = await import('./c2Routes.js')
    const { SphereConductor } = await import('../../sphere/conductor.js')
    const { DidRegistry } = await import('../../sphere/didRegistry.js')
    const { loadGovernancePolicies } = await import('../../governance/policyLoader.js')
    const { createIntentValidator } = await import('../../governance/contactLensValidator.js')
    ;({ pool } = await import('../../db/client.js'))

    const policies = await loadGovernancePolicies({ governanceDir })
    const validateIntent = createIntentValidator(policies)

    conductor = await SphereConductor.create({
      conductorSecret: 'breakglass-integration-secret',
      signatureVerificationMode: 'off',
      governanceConfigPath: path.join(governanceDir, 'governance.yaml'),
      governanceHashes: {
        highRiskRegistryHash: policies.checksums.highRiskRegistry,
        contactLensPackHash: policies.checksums.contactLensPack,
        governanceConfigHash: 'integration-governance-config-hash'
      },
      validateIntent
    })

    const didRegistry = await DidRegistry.create()

    const app = expressMod.default()
    app.use(expressMod.default.json())
    app.use(
      routesMod.createSphereRoutes({
        conductor,
        didRegistry,
        governancePolicies: policies,
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

  it('rejects break-glass halt-all when dual-control/credential is missing in degraded mode', async () => {
    const threadId = randomUUID()
    const missionId = randomUUID()

    await conductor.createThread({
      threadId,
      missionId,
      createdBy: 'did:example:breaker'
    })

    conductor.enterGlobalDegradedNoLlm('integration outage simulation')

    const response = await request
      .post('/api/v1/sphere/halt-all')
      .set('authorization', `Bearer ${serviceToken}`)
      .send({
        actorDid: 'did:example:breaker',
        actorRole: 'Prism Holder',
        reason: 'Need emergency shutdown',
        messageId: randomUUID(),
        traceId: randomUUID(),
        intent: 'EMERGENCY_SHUTDOWN',
        attestation: ['did:example:breaker'],
        schemaVersion: '3.0',
        agentSignature: 'sig:breakglass'
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('BREAK_GLASS_AUTH_FAILED')
    expect(String(response.body.message ?? '')).toContain('Break-glass authorization failed')
  })
})
