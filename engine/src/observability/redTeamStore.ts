import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { redTeamRuns } from '../db/schema.js';

export type PersistRedTeamRunInput = {
  runId: string;
  suite: string;
  status: 'passed' | 'failed';
  generatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  blockedProbeScenarios: number;
  attackClassCounts: Record<string, number>;
  report: Record<string, unknown>;
  reportPath?: string | null;
  snapshotPath?: string | null;
};

export type StoredRedTeamRun = typeof redTeamRuns.$inferSelect;

function toDateOrNull(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function upsertRedTeamRun(input: PersistRedTeamRunInput): Promise<StoredRedTeamRun> {
  const values = {
    runId: input.runId,
    suite: input.suite,
    status: input.status,
    generatedAt: new Date(input.generatedAt),
    startedAt: toDateOrNull(input.startedAt),
    completedAt: toDateOrNull(input.completedAt),
    durationMs: input.durationMs ?? null,
    totalScenarios: input.totalScenarios,
    passedScenarios: input.passedScenarios,
    failedScenarios: input.failedScenarios,
    blockedProbeScenarios: input.blockedProbeScenarios,
    attackClassCounts: input.attackClassCounts,
    report: input.report,
    reportPath: input.reportPath ?? null,
    snapshotPath: input.snapshotPath ?? null
  };

  const [row] = await db
    .insert(redTeamRuns)
    .values(values)
    .onConflictDoUpdate({
      target: redTeamRuns.runId,
      set: values
    })
    .returning();

  return row;
}

export async function listRedTeamRuns(params?: {
  suite?: string;
  limit?: number;
}): Promise<StoredRedTeamRun[]> {
  const suite = params?.suite ?? 'governance_redteam';
  const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));

  return db
    .select()
    .from(redTeamRuns)
    .where(eq(redTeamRuns.suite, suite))
    .orderBy(desc(redTeamRuns.generatedAt))
    .limit(limit);
}

export async function getLatestRedTeamRun(params?: {
  suite?: string;
}): Promise<StoredRedTeamRun | null> {
  const [row] = await db
    .select()
    .from(redTeamRuns)
    .where(eq(redTeamRuns.suite, params?.suite ?? 'governance_redteam'))
    .orderBy(desc(redTeamRuns.generatedAt))
    .limit(1);

  return row ?? null;
}
