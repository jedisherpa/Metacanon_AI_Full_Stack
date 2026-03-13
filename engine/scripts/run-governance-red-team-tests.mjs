import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const engineRoot = path.resolve(scriptDir, '..')
const databaseUrl = process.env.DATABASE_URL?.trim()
const reportPath =
  process.env.METACANON_REDTEAM_REPORT_PATH?.trim() ||
  path.resolve(engineRoot, '../artifacts/redteam/governance-redteam-report.json')

function printSetupHint() {
  console.error('')
  console.error('Governance red-team tests require a reachable DATABASE_URL.')
  console.error('Expected format: postgresql://user:password@host:5432/database')
  console.error('Quick start from repo root: docker compose up -d db')
  console.error('Then run: npm run db:migrate -w engine')
  console.error('')
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL environment variable.')
  printSetupHint()
  process.exit(1)
}

const vitestBin = path.resolve(engineRoot, '../node_modules/vitest/vitest.mjs')
const testFile = 'src/api/v1/c2Routes.redteam.postgres.integration.test.ts'
const startedAt = new Date().toISOString()
const result = spawnSync('node', [vitestBin, 'run', testFile], {
  cwd: engineRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    RUN_PG_INTEGRATION: '1',
    METACANON_REDTEAM_REPORT_PATH: reportPath
  }
})

if (result.error) {
  console.error(`Failed to launch governance red-team tests: ${result.error.message}`)
  process.exit(1)
}

const completedAt = new Date().toISOString()
const durationMs = Date.parse(completedAt) - Date.parse(startedAt)

let report = {
  generatedAt: completedAt,
  suite: 'governance_redteam',
  metrics: {
    totalScenarios: 0,
    passedScenarios: 0,
    failedScenarios: 0,
    blockedProbeScenarios: 0,
    attackClassCounts: {}
  },
  scenarios: []
}

if (fs.existsSync(reportPath)) {
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to parse governance red-team report at ${reportPath}: ${message}`)
  }
} else {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
}

const finalReport = {
  ...report,
  runner: {
    command: 'npm run test:redteam:pg -w engine',
    startedAt,
    completedAt,
    durationMs,
    exitCode: result.status ?? 1,
    status: (result.status ?? 1) === 0 ? 'passed' : 'failed',
    reportPath
  }
}

fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2))
console.log(`[redteam] Report written to ${reportPath}`)

process.exit(result.status ?? 1)
