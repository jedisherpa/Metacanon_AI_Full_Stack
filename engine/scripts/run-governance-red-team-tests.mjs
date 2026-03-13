import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const engineRoot = path.resolve(scriptDir, '..')
const databaseUrl = process.env.DATABASE_URL?.trim()
const reportPath =
  process.env.METACANON_REDTEAM_REPORT_PATH?.trim() ||
  path.resolve(engineRoot, '../artifacts/redteam/governance-redteam-report.json')
const historyPath = path.join(path.dirname(reportPath), 'governance-redteam-history.json')
const snapshotDir = path.join(path.dirname(reportPath), 'history', 'runs')

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
const runId = startedAt.replace(/[:.]/g, '-')
const snapshotPath = path.join(snapshotDir, `${runId}.json`)

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

function buildRunSummary() {
  return {
    runId,
    generatedAt: finalReport.generatedAt ?? completedAt,
    status: finalReport.runner?.status === 'passed' ? 'passed' : 'failed',
    durationMs: finalReport.runner?.durationMs ?? durationMs,
    totalScenarios: finalReport.metrics?.totalScenarios ?? 0,
    passedScenarios: finalReport.metrics?.passedScenarios ?? 0,
    failedScenarios: finalReport.metrics?.failedScenarios ?? 0,
    blockedProbeScenarios: finalReport.metrics?.blockedProbeScenarios ?? 0,
    attackClassCounts: finalReport.metrics?.attackClassCounts ?? {},
    snapshotPath
  }
}

let history = {
  updatedAt: completedAt,
  latestReportPath: reportPath,
  latestSnapshotPath: snapshotPath,
  runs: []
}

if (fs.existsSync(historyPath)) {
  try {
    const parsedHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    if (parsedHistory && typeof parsedHistory === 'object' && Array.isArray(parsedHistory.runs)) {
      history = parsedHistory
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to parse governance red-team history at ${historyPath}: ${message}`)
  }
}

const nextRunSummary = buildRunSummary()
history = {
  ...history,
  updatedAt: completedAt,
  latestReportPath: reportPath,
  latestSnapshotPath: nextRunSummary.snapshotPath,
  runs: [
    nextRunSummary,
    ...history.runs.filter((entry) => entry && entry.runId !== nextRunSummary.runId)
  ].slice(0, 100)
}

fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2))
fs.mkdirSync(snapshotDir, { recursive: true })
fs.writeFileSync(snapshotPath, JSON.stringify(finalReport, null, 2))
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
console.log(`[redteam] Report written to ${reportPath}`)

async function persistRunToDatabase() {
  const pool = new Pool({
    connectionString: databaseUrl
  })

  try {
    await pool.query(
      `
        INSERT INTO redteam_runs (
          run_id,
          suite,
          status,
          generated_at,
          started_at,
          completed_at,
          duration_ms,
          total_scenarios,
          passed_scenarios,
          failed_scenarios,
          blocked_probe_scenarios,
          attack_class_counts,
          report,
          report_path,
          snapshot_path
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15
        )
        ON CONFLICT (run_id) DO UPDATE
        SET
          suite = EXCLUDED.suite,
          status = EXCLUDED.status,
          generated_at = EXCLUDED.generated_at,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          duration_ms = EXCLUDED.duration_ms,
          total_scenarios = EXCLUDED.total_scenarios,
          passed_scenarios = EXCLUDED.passed_scenarios,
          failed_scenarios = EXCLUDED.failed_scenarios,
          blocked_probe_scenarios = EXCLUDED.blocked_probe_scenarios,
          attack_class_counts = EXCLUDED.attack_class_counts,
          report = EXCLUDED.report,
          report_path = EXCLUDED.report_path,
          snapshot_path = EXCLUDED.snapshot_path
      `,
      [
        runId,
        finalReport.suite ?? 'governance_redteam',
        finalReport.runner?.status === 'passed' ? 'passed' : 'failed',
        finalReport.generatedAt ?? completedAt,
        startedAt,
        completedAt,
        finalReport.runner?.durationMs ?? durationMs,
        finalReport.metrics?.totalScenarios ?? 0,
        finalReport.metrics?.passedScenarios ?? 0,
        finalReport.metrics?.failedScenarios ?? 0,
        finalReport.metrics?.blockedProbeScenarios ?? 0,
        JSON.stringify(finalReport.metrics?.attackClassCounts ?? {}),
        JSON.stringify(finalReport),
        reportPath,
        snapshotPath
      ]
    )
    console.log('[redteam] Report persisted to Postgres')
  } finally {
    await pool.end().catch(() => undefined)
  }
}

try {
  await persistRunToDatabase()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[redteam] Failed to persist report to Postgres: ${message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
