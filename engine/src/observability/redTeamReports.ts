import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

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
};

export type RedTeamArtifactPaths = {
  reportPath: string;
  historyPath: string;
  snapshotsDir: string;
};

export type RedTeamArtifactsPayload = {
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
    attackClassTotals
  };
}

export async function loadRedTeamArtifacts(params: {
  reportPath: string;
  trendWindowSize?: number;
}): Promise<RedTeamArtifactsPayload> {
  const artifactPaths = resolveRedTeamArtifactPaths(params.reportPath);
  const [report, history] = await Promise.all([
    readJsonFile<RedTeamLatestReport>(artifactPaths.reportPath),
    readJsonFile<RedTeamHistoryFile>(artifactPaths.historyPath)
  ]);

  let updatedAt: string | null = null;
  try {
    const metadata = await stat(artifactPaths.reportPath);
    updatedAt = metadata.mtime.toISOString();
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  return {
    reportAvailable: Boolean(report),
    reportPath: artifactPaths.reportPath,
    updatedAt,
    report,
    historyAvailable: Boolean(history),
    historyPath: artifactPaths.historyPath,
    history,
    trend: history ? computeRedTeamTrend(history.runs, params.trendWindowSize ?? 10) : null
  };
}
