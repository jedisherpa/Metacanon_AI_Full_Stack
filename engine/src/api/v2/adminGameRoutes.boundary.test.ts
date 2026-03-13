import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const mockEnv = {
  DEFAULT_GROUP_SIZE: 6,
  CORS_ORIGINS: 'http://localhost:5173',
  LLM_PROVIDER_DEFAULT: 'auto' as const,
  POSITION_REVEAL_SECONDS: 15,
  SPHERE_REDTEAM_REPORT_PATH: undefined as string | undefined
};

const mockRequireAdminSession: RequestHandler = (_req, _res, next) => {
  next();
};

vi.mock('../../config/env.js', () => ({
  env: mockEnv
}));

vi.mock('../../admin/middleware.js', () => ({
  requireAdminSession: mockRequireAdminSession
}));

vi.mock('../../db/queries.js', () => ({
  countPlayers: vi.fn(),
  createAuditEvent: vi.fn(),
  createCommand: vi.fn(),
  createGame: vi.fn(),
  getGameById: vi.fn(),
  insertPreRegisteredPlayers: vi.fn(),
  listGames: vi.fn(),
  listCommandsByGame: vi.fn(),
  listPlayersByGame: vi.fn(),
  listRound1Responses: vi.fn(),
  listRound2AssignmentsByGame: vi.fn(),
  listRound2ResponsesByGame: vi.fn(),
  listSynthesisArtifacts: vi.fn()
}));

vi.mock('../../game/lensAssignment.js', () => ({
  assignLenses: vi.fn()
}));

vi.mock('../../queue/boss.js', () => ({
  enqueueGameCommand: vi.fn()
}));

vi.mock('../../llm/service.js', () => ({
  generateHint: vi.fn()
}));

vi.mock('../../export/jsonExport.js', () => ({
  buildGameExport: vi.fn()
}));

async function buildApp() {
  const { createAdminGameRoutes } = await import('./adminGameRoutes.js');
  const app = express();
  app.use(createAdminGameRoutes({ lensPack: {} as any }));
  return app;
}

describe('adminGameRoutes red-team report endpoint', () => {
  it('returns reportAvailable=false when the artifact has not been generated yet', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'metacanon-admin-redteam-missing-'));
    mockEnv.SPHERE_REDTEAM_REPORT_PATH = path.join(tempDir, 'governance-redteam-report.json');

    const app = await buildApp();
    const response = await request(app).get('/api/v2/admin/redteam-report');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reportAvailable: false,
      reportPath: mockEnv.SPHERE_REDTEAM_REPORT_PATH,
      updatedAt: null,
      report: null,
      historyAvailable: false,
      historyPath: path.join(tempDir, 'governance-redteam-history.json'),
      history: null,
      trend: null
    });
  });

  it('returns the parsed report payload and timestamp when the artifact exists', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'metacanon-admin-redteam-present-'));
    const reportPath = path.join(tempDir, 'governance-redteam-report.json');
    const historyPath = path.join(tempDir, 'governance-redteam-history.json');
    mockEnv.SPHERE_REDTEAM_REPORT_PATH = reportPath;

    await writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: '2026-03-12T01:02:03.000Z',
          suite: 'governance_redteam',
          metrics: {
            totalScenarios: 5,
            passedScenarios: 5,
            failedScenarios: 0,
            blockedProbeScenarios: 5,
            attackClassCounts: {
              replay_idempotency: 1,
              mixed_key_rotation: 1
            }
          },
          scenarios: [
            {
              scenarioId: 'replay_duplicate_message',
              attackClass: 'replay_idempotency',
              status: 'passed',
              expected: { replayedResponse: 'STM_ERR_DUPLICATE_IDEMPOTENCY_KEY' },
              observed: { replayedResponse: { status: 409 } },
              capturedAt: '2026-03-12T01:02:04.000Z'
            }
          ],
          runner: {
            status: 'passed',
            reportPath
          }
        },
        null,
        2
      ),
      'utf8'
    );
    await writeFile(
      historyPath,
      JSON.stringify(
        {
          updatedAt: '2026-03-12T01:05:00.000Z',
          latestReportPath: reportPath,
          latestSnapshotPath: path.join(tempDir, 'history', 'runs', '2026-03-12T01-02-03-000Z.json'),
          runs: [
            {
              runId: '2026-03-12T01-02-03-000Z',
              generatedAt: '2026-03-12T01:02:03.000Z',
              status: 'passed',
              durationMs: 914,
              totalScenarios: 5,
              passedScenarios: 5,
              failedScenarios: 0,
              blockedProbeScenarios: 5,
              attackClassCounts: {
                replay_idempotency: 1,
                mixed_key_rotation: 1
              }
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    const app = await buildApp();
    const response = await request(app).get('/api/v2/admin/redteam-report');

    expect(response.status).toBe(200);
    expect(response.body.reportAvailable).toBe(true);
    expect(response.body.reportPath).toBe(reportPath);
    expect(response.body.updatedAt).toEqual(expect.any(String));
    expect(response.body.report).toMatchObject({
      suite: 'governance_redteam',
      metrics: {
        totalScenarios: 5,
        passedScenarios: 5
      },
      scenarios: [
        expect.objectContaining({
          scenarioId: 'replay_duplicate_message',
          attackClass: 'replay_idempotency',
          status: 'passed'
        })
      ],
      runner: {
        status: 'passed',
        reportPath
      }
    });
    expect(response.body.historyAvailable).toBe(true);
    expect(response.body.historyPath).toBe(historyPath);
    expect(response.body.history).toMatchObject({
      latestReportPath: reportPath,
      runs: [
        expect.objectContaining({
          runId: '2026-03-12T01-02-03-000Z',
          status: 'passed',
          totalScenarios: 5
        })
      ]
    });
    expect(response.body.trend).toMatchObject({
      runCount: 1,
      passedRuns: 1,
      failedRuns: 0,
      latestRunAt: '2026-03-12T01:02:03.000Z',
      attackClassTotals: {
        replay_idempotency: 1,
        mixed_key_rotation: 1
      }
    });
  });
});
