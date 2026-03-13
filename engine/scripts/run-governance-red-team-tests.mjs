import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const engineRoot = path.resolve(scriptDir, '..')
const databaseUrl = process.env.DATABASE_URL?.trim()

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
const result = spawnSync('node', [vitestBin, 'run', testFile], {
  cwd: engineRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    RUN_PG_INTEGRATION: '1'
  }
})

if (result.error) {
  console.error(`Failed to launch governance red-team tests: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
