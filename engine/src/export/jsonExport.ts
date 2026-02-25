import {
  getGameById,
  listPlayersByGame,
  listRound1Responses,
  listRound2AssignmentsByGame,
  listRound2ResponsesByGame,
  listSynthesisArtifacts
} from '../db/queries.js';

export async function buildGameExport(gameId: string) {
  const [game, players, round1, round2Assignments, round2Responses, artifacts] = await Promise.all([
    getGameById(gameId),
    listPlayersByGame(gameId),
    listRound1Responses(gameId),
    listRound2AssignmentsByGame(gameId),
    listRound2ResponsesByGame(gameId),
    listSynthesisArtifacts(gameId)
  ]);

  return {
    exportedAt: new Date().toISOString(),
    game,
    players,
    round1,
    round2Assignments,
    round2Responses,
    artifacts
  };
}
