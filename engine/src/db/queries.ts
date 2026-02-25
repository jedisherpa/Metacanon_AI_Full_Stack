import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from './client.js';
import type { ProviderChoice } from '../llm/providers.js';
import {
  adminSessions,
  auditEvents,
  commands,
  gamePlayers,
  games,
  round1Responses,
  round2Assignments,
  round2Responses,
  synthesisArtifacts
} from './schema.js';

export type CreateGameInput = {
  question: string;
  groupSize: number;
  provider: ProviderChoice;
  entryMode: 'self_join' | 'pre_registered';
  inviteCode: string;
  positionRevealSeconds: number;
};

export async function createGame(input: CreateGameInput) {
  const [row] = await db
    .insert(games)
    .values({
      question: input.question,
      groupSize: input.groupSize,
      provider: input.provider,
      entryMode: input.entryMode,
      inviteCode: input.inviteCode,
      positionRevealSeconds: input.positionRevealSeconds,
      status: 'draft',
      stateVersion: 0
    })
    .returning();
  return row;
}

export async function listGames(limit = 100) {
  return db.select().from(games).orderBy(desc(games.createdAt)).limit(limit);
}

export async function getGameById(gameId: string) {
  const [row] = await db.select().from(games).where(eq(games.id, gameId));
  return row ?? null;
}

export async function getGameByInviteCode(inviteCode: string) {
  const [row] = await db.select().from(games).where(eq(games.inviteCode, inviteCode));
  return row ?? null;
}

export async function transitionGameState(params: {
  gameId: string;
  fromStatus: string;
  toStatus: string;
  deliberationPhase?: string | null;
}) {
  const [row] = await db
    .update(games)
    .set({
      status: params.toStatus,
      deliberationPhase: params.deliberationPhase ?? null,
      updatedAt: new Date(),
      stateVersion: sql`${games.stateVersion} + 1`
    })
    .where(and(eq(games.id, params.gameId), eq(games.status, params.fromStatus)))
    .returning();
  return row ?? null;
}

export async function updateGame(params: {
  gameId: string;
  patch: Partial<typeof games.$inferInsert>;
}) {
  const [row] = await db
    .update(games)
    .set({ ...params.patch, updatedAt: new Date() })
    .where(eq(games.id, params.gameId))
    .returning();
  return row ?? null;
}

export async function archiveGame(gameId: string) {
  const [row] = await db
    .update(games)
    .set({
      status: 'archived',
      archivedAt: new Date(),
      updatedAt: new Date(),
      stateVersion: sql`${games.stateVersion} + 1`
    })
    .where(eq(games.id, gameId))
    .returning();
  return row ?? null;
}

export async function countPlayers(gameId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(gamePlayers)
    .where(eq(gamePlayers.gameId, gameId));
  return row?.count ?? 0;
}

export async function listPlayersByGame(gameId: string) {
  return db
    .select()
    .from(gamePlayers)
    .where(eq(gamePlayers.gameId, gameId))
    .orderBy(asc(gamePlayers.seatNumber));
}

export async function getPlayerById(playerId: string) {
  const [row] = await db.select().from(gamePlayers).where(eq(gamePlayers.id, playerId));
  return row ?? null;
}

export async function getPlayerByAccessToken(accessToken: string) {
  const [row] = await db.select().from(gamePlayers).where(eq(gamePlayers.accessToken, accessToken));
  return row ?? null;
}

export async function createPlayer(input: {
  gameId: string;
  seatNumber: number;
  name: string;
  email?: string;
  accessToken: string;
  avatarId: string;
  avatarName: string;
  epistemology: string;
  hintText?: string;
  preRegistered: boolean;
}) {
  const [row] = await db
    .insert(gamePlayers)
    .values({
      gameId: input.gameId,
      seatNumber: input.seatNumber,
      name: input.name,
      email: input.email,
      accessToken: input.accessToken,
      avatarId: input.avatarId,
      avatarName: input.avatarName,
      epistemology: input.epistemology,
      hintText: input.hintText,
      preRegistered: input.preRegistered
    })
    .returning();
  return row;
}

export async function updatePlayer(playerId: string, patch: Partial<typeof gamePlayers.$inferInsert>) {
  const [row] = await db.update(gamePlayers).set(patch).where(eq(gamePlayers.id, playerId)).returning();
  return row ?? null;
}

export async function nextAvailableSeat(gameId: string, groupSize: number) {
  const players = await listPlayersByGame(gameId);
  for (let seat = 1; seat <= groupSize; seat += 1) {
    if (!players.find((p) => p.seatNumber === seat)) {
      return seat;
    }
  }
  return null;
}

export async function insertPreRegisteredPlayers(
  rows: Array<{
    gameId: string;
    seatNumber: number;
    name: string;
    email?: string;
    accessToken: string;
    avatarId: string;
    avatarName: string;
    epistemology: string;
    hintText?: string;
  }>
) {
  if (rows.length === 0) return [];
  return db
    .insert(gamePlayers)
    .values(
      rows.map((row) => ({
        ...row,
        preRegistered: true
      }))
    )
    .returning();
}

export async function upsertRound1Response(input: {
  gameId: string;
  playerId: string;
  content: string;
  wordCount: number;
}) {
  const [row] = await db
    .insert(round1Responses)
    .values(input)
    .onConflictDoUpdate({
      target: [round1Responses.gameId, round1Responses.playerId],
      set: {
        content: input.content,
        wordCount: input.wordCount,
        submittedAt: new Date()
      }
    })
    .returning();

  await db
    .update(gamePlayers)
    .set({ round1Complete: true })
    .where(eq(gamePlayers.id, input.playerId));

  return row;
}

export async function listRound1Responses(gameId: string) {
  return db
    .select()
    .from(round1Responses)
    .where(eq(round1Responses.gameId, gameId))
    .orderBy(desc(round1Responses.submittedAt));
}

export async function replaceRound2Assignments(
  gameId: string,
  assignments: Array<{
    assigneePlayerId: string;
    targetPlayerId: string;
    promptText: string;
  }>
) {
  await db.delete(round2Assignments).where(eq(round2Assignments.gameId, gameId));

  if (assignments.length === 0) return [];

  return db
    .insert(round2Assignments)
    .values(
      assignments.map((a) => ({
        gameId,
        assigneePlayerId: a.assigneePlayerId,
        targetPlayerId: a.targetPlayerId,
        promptText: a.promptText
      }))
    )
    .returning();
}

export async function listRound2AssignmentsByGame(gameId: string) {
  return db
    .select()
    .from(round2Assignments)
    .where(eq(round2Assignments.gameId, gameId))
    .orderBy(asc(round2Assignments.createdAt));
}

export async function listRound2AssignmentsForPlayer(gameId: string, playerId: string) {
  return db
    .select()
    .from(round2Assignments)
    .where(and(eq(round2Assignments.gameId, gameId), eq(round2Assignments.assigneePlayerId, playerId)))
    .orderBy(asc(round2Assignments.createdAt));
}

export async function upsertRound2Response(input: {
  gameId: string;
  assignmentId: string;
  assigneePlayerId: string;
  targetPlayerId: string;
  content: string;
  wordCount: number;
}) {
  const [row] = await db
    .insert(round2Responses)
    .values(input)
    .onConflictDoUpdate({
      target: [round2Responses.assignmentId],
      set: {
        content: input.content,
        wordCount: input.wordCount,
        submittedAt: new Date()
      }
    })
    .returning();

  return row;
}

export async function listRound2ResponsesByGame(gameId: string) {
  return db
    .select()
    .from(round2Responses)
    .where(eq(round2Responses.gameId, gameId))
    .orderBy(desc(round2Responses.submittedAt));
}

export async function listRound2ResponsesForPlayer(gameId: string, playerId: string) {
  return db
    .select()
    .from(round2Responses)
    .where(and(eq(round2Responses.gameId, gameId), eq(round2Responses.assigneePlayerId, playerId)));
}

export async function markRound2Completion(gameId: string, playerId: string) {
  const assignments = await listRound2AssignmentsForPlayer(gameId, playerId);
  const responses = await listRound2ResponsesForPlayer(gameId, playerId);
  const complete = assignments.length > 0 && responses.length >= assignments.length;

  const [row] = await db
    .update(gamePlayers)
    .set({ round2Complete: complete, deliberationEligible: complete })
    .where(eq(gamePlayers.id, playerId))
    .returning();

  return row ?? null;
}

export async function setAllDeliberationEligibility(gameId: string) {
  const players = await listPlayersByGame(gameId);
  for (const player of players) {
    const eligible = Boolean(player.round1Complete && player.round2Complete);
    await db
      .update(gamePlayers)
      .set({ deliberationEligible: eligible })
      .where(eq(gamePlayers.id, player.id));
  }
}

export async function createSynthesisArtifact(input: {
  gameId: string;
  artifactType: string;
  content: string;
}) {
  const [row] = await db.insert(synthesisArtifacts).values(input).returning();
  return row;
}

export async function listSynthesisArtifacts(gameId: string) {
  return db
    .select()
    .from(synthesisArtifacts)
    .where(eq(synthesisArtifacts.gameId, gameId))
    .orderBy(asc(synthesisArtifacts.generatedAt));
}

export async function clearSynthesisArtifacts(gameId: string) {
  await db.delete(synthesisArtifacts).where(eq(synthesisArtifacts.gameId, gameId));
}

export async function createCommand(input: {
  gameId?: string;
  commandType: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}) {
  const [row] = await db
    .insert(commands)
    .values({
      gameId: input.gameId,
      commandType: input.commandType,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey,
      status: 'queued'
    })
    .onConflictDoNothing({ target: [commands.dedupeKey] })
    .returning();

  if (row) return row;

  if (!input.dedupeKey) return null;
  const [existing] = await db.select().from(commands).where(eq(commands.dedupeKey, input.dedupeKey));
  return existing ?? null;
}

export async function getCommand(commandId: string) {
  const [row] = await db.select().from(commands).where(eq(commands.id, commandId));
  return row ?? null;
}

export async function listCommandsByGame(gameId: string, limit = 50) {
  return db
    .select()
    .from(commands)
    .where(eq(commands.gameId, gameId))
    .orderBy(desc(commands.createdAt))
    .limit(limit);
}

export async function updateCommandStatus(params: {
  commandId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  attempts?: number;
}) {
  const patch: Partial<typeof commands.$inferInsert> = {
    status: params.status,
    error: params.error ?? null
  };

  if (typeof params.attempts === 'number') {
    patch.attempts = params.attempts;
  }

  if (params.status === 'running') {
    patch.startedAt = new Date();
  }

  if (params.status === 'completed' || params.status === 'failed') {
    patch.finishedAt = new Date();
  }

  const [row] = await db.update(commands).set(patch).where(eq(commands.id, params.commandId)).returning();
  return row ?? null;
}

export async function createAuditEvent(input: {
  gameId?: string;
  actorType: 'admin' | 'player' | 'system';
  actorId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(auditEvents)
    .values({
      gameId: input.gameId,
      actorType: input.actorType,
      actorId: input.actorId,
      eventType: input.eventType,
      payload: input.payload ?? {}
    })
    .returning();
  return row;
}

export async function createAdminSession(tokenHash: string, expiresAt: Date) {
  const [row] = await db.insert(adminSessions).values({ tokenHash, expiresAt }).returning();
  return row;
}

export async function getAdminSessionByHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, new Date())));
  return row ?? null;
}

export async function deleteAdminSessionByHash(tokenHash: string) {
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
}

export async function purgeExpiredAdminSessions() {
  await db.delete(adminSessions).where(sql`${adminSessions.expiresAt} <= now()`);
}

export async function getRoundCompletionStats(gameId: string) {
  const players = await listPlayersByGame(gameId);
  const round1Done = players.filter((p) => p.round1Complete).length;
  const round2Done = players.filter((p) => p.round2Complete).length;
  return {
    total: players.length,
    round1Done,
    round2Done
  };
}

export async function areAllRound1Complete(gameId: string) {
  const players = await listPlayersByGame(gameId);
  return players.length > 0 && players.every((p) => p.round1Complete);
}

export async function areAllRound2Complete(gameId: string) {
  const players = await listPlayersByGame(gameId);
  return players.length > 0 && players.every((p) => p.round2Complete);
}

export async function getPlayersByIds(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  return db.select().from(gamePlayers).where(inArray(gamePlayers.id, playerIds));
}
