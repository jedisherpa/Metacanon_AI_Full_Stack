import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const engineRoot = path.resolve(scriptDir, '..')
const databaseUrl = process.env.DATABASE_URL?.trim()

function printSetupHint() {
  console.error('')
  console.error('Postgres integration tests require a reachable DATABASE_URL.')
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

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000
})

try {
  await client.connect()
  await client.query('SELECT 1')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Unable to connect to Postgres at DATABASE_URL: ${message}`)
  printSetupHint()
  process.exit(1)
} finally {
  await client.end().catch(() => undefined)
}

const vitestBin = path.resolve(engineRoot, '../node_modules/vitest/vitest.mjs')
const testFiles = [
  'src/sphere/conductor.postgres.integration.test.ts',
  'src/api/v1/c2Routes.postgres.integration.test.ts',
  'src/api/v1/c2Routes.breakglass.postgres.integration.test.ts',
  'src/api/v1/c2Routes.signature.postgres.integration.test.ts',
  'src/api/v1/c2Routes.alerts.postgres.integration.test.ts'
]

for (const testFile of testFiles) {
  const result = spawnSync('node', [vitestBin, 'run', testFile], {
    cwd: engineRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      RUN_PG_INTEGRATION: '1'
    }
  })

  if (result.error) {
    console.error(`Failed to launch integration tests for ${testFile}: ${result.error.message}`)
    process.exit(1)
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }
}

process.exit(0)
