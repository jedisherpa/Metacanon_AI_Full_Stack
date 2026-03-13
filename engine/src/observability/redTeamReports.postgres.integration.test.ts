import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const runPgIntegration = process.env.RUN_PG_INTEGRATION === '1';

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }>;
  end: () => Promise<void>;
};

function applyBaseEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council',
    CORS_ORIGINS: 'http://localhost:5173',
    LENS_PACK: 'hands-of-the-void',
    ADMIN_PANEL_PASSWORD: 'test-password',
    KIMI_API_KEY: 'test-kimi-key',
    TELEGRAM_BOT_TOKEN: 'test-telegram-token',
    WS_TOKEN_SECRET: '12345678901234567890123456789012',
    RUNTIME_ENV: 'local',
    SPHERE_REDTEAM_STORAGE_MODE: 'database',
    SPHERE_REDTEAM_TREND_WINDOW: '10',
    ...overrides
  });
}

describe.runIf(runPgIntegration)('redTeamReports durable storage', () => {
  let pool: QueryablePool;
  let upsertRedTeamRun: (typeof import('./redTeamStore.js'))['upsertRedTeamRun'];
  let loadRedTeamArtifacts: (typeof import('./redTeamReports.js'))['loadRedTeamArtifacts'];

  beforeAll(async () => {
    vi.resetModules();
    applyBaseEnv();
    ({ pool } = await import('../db/client.js'));
    ({ upsertRedTeamRun } = await import('./redTeamStore.js'));
    ({ loadRedTeamArtifacts } = await import('./redTeamReports.js'));
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE redteam_runs RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('loads latest red-team report history and chart series from Postgres', async () => {
    await upsertRedTeamRun({
      runId: '2026-03-11T03-05-00-000Z',
      suite: 'governance_redteam',
      status: 'passed',
      generatedAt: '2026-03-11T03:05:00.000Z',
      startedAt: '2026-03-11T03:04:59.000Z',
      completedAt: '2026-03-11T03:05:00.100Z',
      durationMs: 1100,
      totalScenarios: 5,
      passedScenarios: 5,
      failedScenarios: 0,
      blockedProbeScenarios: 5,
      attackClassCounts: {
        replay_idempotency: 1
      },
      report: {
        generatedAt: '2026-03-11T03:05:00.000Z',
        suite: 'governance_redteam',
        metrics: {
          totalScenarios: 5,
          passedScenarios: 5,
          failedScenarios: 0,
          blockedProbeScenarios: 5,
          attackClassCounts: {
            replay_idempotency: 1
          }
        },
        scenarios: [],
        runner: {
          status: 'passed'
        }
      },
      reportPath: '/tmp/redteam/report-1.json',
      snapshotPath: '/tmp/redteam/run-1.json'
    });

    await upsertRedTeamRun({
      runId: '2026-03-12T03-05-00-000Z',
      suite: 'governance_redteam',
      status: 'failed',
      generatedAt: '2026-03-12T03:05:00.000Z',
      startedAt: '2026-03-12T03:04:58.000Z',
      completedAt: '2026-03-12T03:05:00.250Z',
      durationMs: 2250,
      totalScenarios: 7,
      passedScenarios: 6,
      failedScenarios: 1,
      blockedProbeScenarios: 6,
      attackClassCounts: {
        replay_idempotency: 1,
        degraded_mode_abuse: 1
      },
      report: {
        generatedAt: '2026-03-12T03:05:00.000Z',
        suite: 'governance_redteam',
        metrics: {
          totalScenarios: 7,
          passedScenarios: 6,
          failedScenarios: 1,
          blockedProbeScenarios: 6,
          attackClassCounts: {
            replay_idempotency: 1,
            degraded_mode_abuse: 1
          }
        },
        scenarios: [
          {
            scenarioId: 'degraded_mode_abuse_chain',
            attackClass: 'degraded_mode_abuse',
            status: 'failed',
            expected: {},
            observed: {},
            capturedAt: '2026-03-12T03:05:00.000Z'
          }
        ],
        runner: {
          status: 'failed',
          durationMs: 2250
        }
      },
      reportPath: '/tmp/redteam/report-2.json',
      snapshotPath: '/tmp/redteam/run-2.json'
    });

    const payload = await loadRedTeamArtifacts({
      reportPath: '/tmp/does-not-exist/governance-redteam-report.json',
      storageMode: 'database',
      trendWindowSize: 10
    });

    expect(payload.storageSource).toBe('database');
    expect(payload.reportAvailable).toBe(true);
    expect(payload.historyAvailable).toBe(true);
    expect(payload.reportPath).toBe('/tmp/redteam/report-2.json');
    expect(payload.report?.metrics.totalScenarios).toBe(7);
    expect(payload.history?.runs).toHaveLength(2);
    expect(payload.trend).toMatchObject({
      runCount: 2,
      passedRuns: 1,
      failedRuns: 1,
      latestRunAt: '2026-03-12T03:05:00.000Z',
      attackClassTotals: {
        replay_idempotency: 2,
        degraded_mode_abuse: 1
      },
      series: [
        expect.objectContaining({
          runId: '2026-03-11T03-05-00-000Z',
          scenarioPassRate: 1
        }),
        expect.objectContaining({
          runId: '2026-03-12T03-05-00-000Z',
          scenarioPassRate: 6 / 7
        })
      ]
    });
  });

  it('prefers database-backed data over stale file artifacts in auto mode', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'metacanon-redteam-db-auto-'));
    const reportPath = path.join(tempDir, 'governance-redteam-report.json');

    await writeFile(
      reportPath,
      JSON.stringify({
        generatedAt: '2026-03-10T00:00:00.000Z',
        suite: 'governance_redteam',
        metrics: {
          totalScenarios: 1,
          passedScenarios: 1,
          failedScenarios: 0,
          blockedProbeScenarios: 1,
          attackClassCounts: {
            stale_file: 1
          }
        },
        scenarios: [],
        runner: {
          status: 'passed'
        }
      }),
      'utf8'
    );

    await upsertRedTeamRun({
      runId: '2026-03-13T04-00-00-000Z',
      suite: 'governance_redteam',
      status: 'passed',
      generatedAt: '2026-03-13T04:00:00.000Z',
      durationMs: 900,
      totalScenarios: 3,
      passedScenarios: 3,
      failedScenarios: 0,
      blockedProbeScenarios: 3,
      attackClassCounts: {
        db_write_bypass: 1
      },
      report: {
        generatedAt: '2026-03-13T04:00:00.000Z',
        suite: 'governance_redteam',
        metrics: {
          totalScenarios: 3,
          passedScenarios: 3,
          failedScenarios: 0,
          blockedProbeScenarios: 3,
          attackClassCounts: {
            db_write_bypass: 1
          }
        },
        scenarios: [],
        runner: {
          status: 'passed'
        }
      },
      reportPath: '/tmp/redteam/current.json',
      snapshotPath: '/tmp/redteam/current-run.json'
    });

    const payload = await loadRedTeamArtifacts({
      reportPath,
      storageMode: 'auto',
      trendWindowSize: 5
    });

    expect(payload.storageSource).toBe('database');
    expect(payload.report?.metrics.attackClassCounts).toEqual({
      db_write_bypass: 1
    });
    expect(payload.reportPath).toBe('/tmp/redteam/current.json');
  });
});
