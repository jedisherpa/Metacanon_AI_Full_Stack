import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { listRedTeamRuns, type StoredRedTeamRun } from './redTeamStore.js';

export type RedTeamScenarioReport = {
  scenarioId: string;
  attackClass: string;
  status: 'passed' | 'failed';
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  capturedAt: string;
};

export type RedTeamLatestReport = {
  generatedAt: string;
  suite: string;
  metrics: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    blockedProbeScenarios: number;
    attackClassCounts: Record<string, number>;
  };
  scenarios: RedTeamScenarioReport[];
  runner?: {
    command?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    exitCode?: number;
    status?: string;
    reportPath?: string;
  };
};

export type RedTeamRunSummary = {
  runId: string;
  generatedAt: string;
  status: 'passed' | 'failed';
  durationMs: number | null;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  blockedProbeScenarios: number;
  attackClassCounts: Record<string, number>;
  snapshotPath?: string;
};

export type RedTeamHistoryFile = {
  updatedAt: string;
  latestReportPath: string;
  latestSnapshotPath?: string;
  runs: RedTeamRunSummary[];
};

export type RedTeamTrendPoint = {
  runId: string;
  generatedAt: string;
  status: 'passed' | 'failed';
  durationMs: number | null;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  blockedProbeScenarios: number;
  scenarioPassRate: number | null;
  attackClassCounts: Record<string, number>;
};

export type RedTeamTrendSummary = {
  windowSize: number;
  runCount: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
  averageDurationMs: number | null;
  averageBlockedProbeScenarios: number | null;
  latestRunAt: string | null;
  attackClassTotals: Record<string, number>;
  series: RedTeamTrendPoint[];
};

export type RedTeamArtifactPaths = {
  reportPath: string;
  historyPath: string;
  snapshotsDir: string;
};

export type RedTeamStorageMode = 'auto' | 'file' | 'database';
export type RedTeamStorageSource = 'unavailable' | 'filesystem' | 'database';

export type RedTeamArtifactsPayload = {
  storageMode: RedTeamStorageMode;
  storageSource: RedTeamStorageSource;
  reportAvailable: boolean;
  reportPath: string;
  updatedAt: string | null;
  report: RedTeamLatestReport | null;
  historyAvailable: boolean;
  historyPath: string;
  history: RedTeamHistoryFile | null;
  trend: RedTeamTrendSummary | null;
};

function isMissingFile(errorValue: unknown): boolean {
  return (
    typeof errorValue === 'object' &&
    errorValue !== null &&
    'code' in errorValue &&
    errorValue.code === 'ENOENT'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

function coerceLatestReportFromRun(row: StoredRedTeamRun): RedTeamLatestReport {
  if (isObjectRecord(row.report)) {
    return row.report as unknown as RedTeamLatestReport;
  }

  return {
    generatedAt: row.generatedAt.toISOString(),
    suite: row.suite,
    metrics: {
      totalScenarios: row.totalScenarios,
      passedScenarios: row.passedScenarios,
      failedScenarios: row.failedScenarios,
      blockedProbeScenarios: row.blockedProbeScenarios,
      attackClassCounts: row.attackClassCounts ?? {}
    },
    scenarios: [],
    runner: {
      startedAt: toIsoStringOrNull(row.startedAt) ?? undefined,
      completedAt: toIsoStringOrNull(row.completedAt) ?? undefined,
      durationMs: row.durationMs ?? undefined,
      status: row.status,
      reportPath: row.reportPath ?? undefined
    }
  };
}

function toRunSummary(row: StoredRedTeamRun): RedTeamRunSummary {
  return {
    runId: row.runId,
    generatedAt: row.generatedAt.toISOString(),
    status: row.status === 'passed' ? 'passed' : 'failed',
    durationMs: row.durationMs ?? null,
    totalScenarios: row.totalScenarios,
    passedScenarios: row.passedScenarios,
    failedScenarios: row.failedScenarios,
    blockedProbeScenarios: row.blockedProbeScenarios,
    attackClassCounts: row.attackClassCounts ?? {},
    snapshotPath: row.snapshotPath ?? undefined
  };
}

function toTrendPoint(run: RedTeamRunSummary): RedTeamTrendPoint {
  return {
    runId: run.runId,
    generatedAt: run.generatedAt,
    status: run.status,
    durationMs: run.durationMs,
    totalScenarios: run.totalScenarios,
    passedScenarios: run.passedScenarios,
    failedScenarios: run.failedScenarios,
    blockedProbeScenarios: run.blockedProbeScenarios,
    scenarioPassRate: run.totalScenarios > 0 ? run.passedScenarios / run.totalScenarios : null,
    attackClassCounts: run.attackClassCounts
  };
}

function buildHistoryFromRuns(
  runs: RedTeamRunSummary[],
  artifactPaths: RedTeamArtifactPaths,
  updatedAt: string,
  latestReportPath?: string | null
): RedTeamHistoryFile {
  return {
    updatedAt,
    latestReportPath: latestReportPath ?? artifactPaths.reportPath,
    latestSnapshotPath: runs[0]?.snapshotPath,
    runs
  };
}

export function resolveRedTeamArtifactPaths(reportPath: string): RedTeamArtifactPaths {
  const reportDir = path.dirname(reportPath);
  return {
    reportPath,
    historyPath: path.join(reportDir, 'governance-redteam-history.json'),
    snapshotsDir: path.join(reportDir, 'history', 'runs')
  };
}

export function computeRedTeamTrend(
  runs: RedTeamRunSummary[],
  windowSize = 10
): RedTeamTrendSummary | null {
  if (runs.length === 0) {
    return null;
  }

  const sample = runs.slice(0, Math.max(1, windowSize));
  const passedRuns = sample.filter((run) => run.status === 'passed').length;
  const failedRuns = sample.length - passedRuns;
  const durationValues = sample
    .map((run) => run.durationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const blockedProbeValues = sample.map((run) => run.blockedProbeScenarios);
  const attackClassTotals = sample.reduce<Record<string, number>>((totals, run) => {
    for (const [attackClass, count] of Object.entries(run.attackClassCounts)) {
      totals[attackClass] = (totals[attackClass] ?? 0) + count;
    }
    return totals;
  }, {});

  return {
    windowSize,
    runCount: sample.length,
    passedRuns,
    failedRuns,
    passRate: sample.length > 0 ? passedRuns / sample.length : null,
    averageDurationMs:
      durationValues.length > 0
        ? durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length
        : null,
    averageBlockedProbeScenarios:
      blockedProbeValues.length > 0
        ? blockedProbeValues.reduce((sum, value) => sum + value, 0) / blockedProbeValues.length
        : null,
    latestRunAt: sample[0]?.generatedAt ?? null,
    attackClassTotals,
    series: [...sample].reverse().map((run) => toTrendPoint(run))
  };
}

async function loadRedTeamArtifactsFromFilesystem(params: {
  artifactPaths: RedTeamArtifactPaths;
  trendWindowSize: number;
  storageMode: RedTeamStorageMode;
}): Promise<RedTeamArtifactsPayload> {
  const [report, history] = await Promise.all([
    readJsonFile<RedTeamLatestReport>(params.artifactPaths.reportPath),
    readJsonFile<RedTeamHistoryFile>(params.artifactPaths.historyPath)
  ]);

  let updatedAt: string | null = null;
  try {
    const metadata = await stat(params.artifactPaths.reportPath);
    updatedAt = metadata.mtime.toISOString();
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  return {
    storageMode: params.storageMode,
    storageSource: report || history ? 'filesystem' : 'unavailable',
    reportAvailable: Boolean(report),
    reportPath: params.artifactPaths.reportPath,
    updatedAt,
    report,
    historyAvailable: Boolean(history),
    historyPath: params.artifactPaths.historyPath,
    history,
    trend: history ? computeRedTeamTrend(history.runs, params.trendWindowSize) : null
  };
}

async function loadRedTeamArtifactsFromDatabase(params: {
  artifactPaths: RedTeamArtifactPaths;
  suite: string;
  trendWindowSize: number;
  storageMode: RedTeamStorageMode;
}): Promise<RedTeamArtifactsPayload | null> {
  try {
    const rows = await listRedTeamRuns({ suite: params.suite, limit: 100 });
    if (rows.length === 0) {
      return null;
    }

    const latestRow = rows[0];
    const runs = rows.map((row) => toRunSummary(row));
    const updatedAt = latestRow.generatedAt.toISOString();
    const history = buildHistoryFromRuns(
      runs,
      params.artifactPaths,
      updatedAt,
      latestRow.reportPath ?? params.artifactPaths.reportPath
    );

    return {
      storageMode: params.storageMode,
      storageSource: 'database',
      reportAvailable: true,
      reportPath: latestRow.reportPath ?? params.artifactPaths.reportPath,
      updatedAt,
      report: coerceLatestReportFromRun(latestRow),
      historyAvailable: true,
      historyPath: params.artifactPaths.historyPath,
      history,
      trend: computeRedTeamTrend(runs, params.trendWindowSize)
    };
  } catch {
    return null;
  }
}

export async function loadRedTeamArtifacts(params: {
  reportPath: string;
  trendWindowSize?: number;
  storageMode?: RedTeamStorageMode;
  suite?: string;
}): Promise<RedTeamArtifactsPayload> {
  const artifactPaths = resolveRedTeamArtifactPaths(params.reportPath);
  const storageMode = params.storageMode ?? 'auto';
  const trendWindowSize = params.trendWindowSize ?? 10;
  const suite = params.suite ?? 'governance_redteam';

  if (storageMode !== 'file') {
    const databasePayload = await loadRedTeamArtifactsFromDatabase({
      artifactPaths,
      suite,
      trendWindowSize,
      storageMode
    });

    if (databasePayload) {
      return databasePayload;
    }
  }

  return loadRedTeamArtifactsFromFilesystem({
    artifactPaths,
    trendWindowSize,
    storageMode
  });
}
