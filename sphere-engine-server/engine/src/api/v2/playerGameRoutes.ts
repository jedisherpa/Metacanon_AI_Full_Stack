import { Router } from 'express';
import { z } from 'zod';
import type { LensPack } from '../../config/lensPack.js';
import { error } from '../../lib/http.js';
import { bearerToken } from '../../lib/auth.js';
import { randomToken } from '../../lib/crypto.js';
import { wordCount } from '../../lib/words.js';
import {
  areAllRound1Complete,
  createPlayer,
  getGameById,
  getGameByInviteCode,
  getPlayerByAccessToken,
  getRoundCompletionStats,
  listPlayersByGame,
  listRound2AssignmentsForPlayer,
  markRound2Completion,
  nextAvailableSeat,
  updatePlayer,
  upsertRound1Response,
  upsertRound2Response
} from '../../db/queries.js';
import { pickLensForJoin } from '../../game/lensAssignment.js';
import { generateHint } from '../../llm/service.js';
import type { ProviderChoice } from '../../llm/providers.js';
import type { WebSocketHub } from '../../ws/hub.js';
import { buildDeliberationFeed } from '../../game/orchestrationService.js';

const joinSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional()
});

const round1SubmitSchema = z.object({
  content: z.string().min(1)
});

const round2SubmitSchema = z.object({
  responses: z
    .array(
      z.object({
        assignmentId: z.string().uuid(),
        content: z.string().min(1)
      })
    )
    .min(1)
});

const QUESTION_VISIBLE_STATUSES = new Set([
  'round1_open',
  'round1_closed',
  'round2_open',
  'round2_closed',
  'deliberation_ready',
  'deliberation_running',
  'deliberation_paused',
  'deliberation_complete',
  'archived'
]);

function questionVisible(status: string) {
  return QUESTION_VISIBLE_STATUSES.has(status);
}

async function requirePlayer(gameId: string, token: string | null | undefined) {
  if (!token) return null;
  const player = await getPlayerByAccessToken(token);
  if (!player) return null;
  if (player.gameId !== gameId) return null;
  return player;
}

export function createPlayerGameRoutes(params: { lensPack: LensPack; wsHub?: WebSocketHub }) {
  const router = Router();

  router.get('/api/v2/games/invite/:code', async (req, res) => {
    const game = await getGameByInviteCode(req.params.code);
    if (!game) {
      return error(res, 404, 'Invite not found');
    }
    res.json({ gameId: game.id });
  });

  router.post('/api/v2/games/:id/join', async (req, res) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    if (game.entryMode !== 'self_join') {
      return error(res, 409, 'Self join is not enabled for this game');
    }

    if (game.status !== 'lobby_open') {
      return error(res, 409, 'Game is not accepting joins');
    }

    const players = await listPlayersByGame(game.id);
    if (players.length >= game.groupSize) {
      return error(res, 409, 'Game is full');
    }

    const seatNumber = await nextAvailableSeat(game.id, game.groupSize);
    if (!seatNumber) {
      return error(res, 409, 'No seats available');
    }

    const assignedIds = players.map((p) => p.avatarId);
    const lens = pickLensForJoin(params.lensPack, assignedIds, game.groupSize >= 4, game.groupSize);

    const accessToken = randomToken(24);

    const created = await createPlayer({
      gameId: game.id,
      seatNumber,
      name: parsed.data.name,
      email: parsed.data.email,
      accessToken,
      avatarId: lens.id,
      avatarName: lens.avatar_name,
      epistemology: lens.epistemology,
      hintText: '',
      preRegistered: false
    });

    params.wsHub?.broadcast('player', game.id, {
      type: 'lobby.player_joined',
      player: {
        id: created.id,
        seatNumber: created.seatNumber,
        name: created.name,
        avatarName: created.avatarName
      }
    });
    params.wsHub?.broadcast('admin', game.id, {
      type: 'state.refresh',
      gameId: game.id
    });

    res.json({
      player: {
        id: created.id,
        seatNumber: created.seatNumber,
        name: created.name,
        avatarName: created.avatarName,
        epistemology: created.epistemology,
        hint: created.hintText ?? ''
      },
      playerToken: accessToken
    });

    // Hint generation should not block seat-claim UX; update it asynchronously when ready.
    void generateHint({
      lens,
      question: game.question,
      provider: game.provider as ProviderChoice
    })
      .then(async (hint) => {
        if (!hint) return;
        await updatePlayer(created.id, { hintText: hint });
        params.wsHub?.broadcast('player', game.id, {
          type: 'player.hint_updated',
          playerId: created.id
        });
      })
      .catch(() => {
        // Hint is optional; failures should not affect join flow.
      });
  });

  router.post('/api/v2/games/:id/access/:playerAccessToken', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    const player = await getPlayerByAccessToken(req.params.playerAccessToken);
    if (!player || player.gameId !== game.id) {
      return error(res, 404, 'Player access link is invalid');
    }

    res.json({
      player: {
        id: player.id,
        seatNumber: player.seatNumber,
        name: player.name,
        avatarName: player.avatarName,
        epistemology: player.epistemology,
        hint: player.hintText ?? ''
      },
      playerToken: player.accessToken
    });
  });

  router.get('/api/v2/games/:id/me', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    const player = await requirePlayer(game.id, bearerToken(req));
    if (!player) {
      return error(res, 401, 'Unauthorized');
    }

    res.json({
      game: {
        id: game.id,
        status: game.status,
        entryMode: game.entryMode,
        question: questionVisible(game.status) ? game.question : null,
        groupSize: game.groupSize,
        provider: game.provider,
        deliberationPhase: game.deliberationPhase
      },
      player: {
        id: player.id,
        seatNumber: player.seatNumber,
        name: player.name,
        avatarName: player.avatarName,
        epistemology: player.epistemology,
        hint: player.hintText ?? '',
        round1Complete: player.round1Complete,
        round2Complete: player.round2Complete,
        deliberationEligible: player.deliberationEligible
      }
    });
  });

  router.get('/api/v2/games/:id/lobby', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    const players = await listPlayersByGame(game.id);
    const stats = await getRoundCompletionStats(game.id);

    res.json({
      game: {
        id: game.id,
        status: game.status,
        question: questionVisible(game.status) ? game.question : null
      },
      players: players.map((player) => ({
        id: player.id,
        seatNumber: player.seatNumber,
        name: player.name,
        avatarName: player.avatarName,
        round1Complete: player.round1Complete,
        round2Complete: player.round2Complete
      })),
      stats
    });
  });

  router.post('/api/v2/games/:id/round1/submit', async (req, res) => {
    const parsed = round1SubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    if (game.status !== 'round1_open') {
      return error(res, 409, 'Round 1 is not open');
    }

    const player = await requirePlayer(game.id, bearerToken(req));
    if (!player) {
      return error(res, 401, 'Unauthorized');
    }

    const response = await upsertRound1Response({
      gameId: game.id,
      playerId: player.id,
      content: parsed.data.content,
      wordCount: wordCount(parsed.data.content)
    });

    const stats = await getRoundCompletionStats(game.id);
    params.wsHub?.broadcast('player', game.id, {
      type: 'round1.progress',
      stats
    });
    params.wsHub?.broadcast('admin', game.id, {
      type: 'state.refresh',
      gameId: game.id
    });

    const allRound1Complete = await areAllRound1Complete(game.id);
    if (allRound1Complete) {
      params.wsHub?.broadcast('admin', game.id, {
        type: 'state.refresh',
        gameId: game.id
      });
    }

    res.json({
      responseId: response.id,
      submittedAt: response.submittedAt,
      stats
    });
  });

  router.get('/api/v2/games/:id/round2/assignments/me', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    if (!['round2_open', 'round2_closed', 'deliberation_running', 'deliberation_paused', 'deliberation_complete', 'archived'].includes(game.status)) {
      return error(res, 409, 'Round 2 assignments are not available yet');
    }

    const player = await requirePlayer(game.id, bearerToken(req));
    if (!player) {
      return error(res, 401, 'Unauthorized');
    }

    const [assignments, players] = await Promise.all([
      listRound2AssignmentsForPlayer(game.id, player.id),
      listPlayersByGame(game.id)
    ]);

    const playerMap = new Map(players.map((p) => [p.id, p]));

    res.json({
      assignments: assignments.map((assignment) => {
        const target = playerMap.get(assignment.targetPlayerId);
        return {
          id: assignment.id,
          targetPlayerId: assignment.targetPlayerId,
          targetAvatarName: target?.avatarName ?? 'Unknown',
          targetEpistemology: target?.epistemology ?? 'Unknown',
          promptText: assignment.promptText
        };
      })
    });
  });

  router.post('/api/v2/games/:id/round2/submit', async (req, res) => {
    const parsed = round2SubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    if (game.status !== 'round2_open') {
      return error(res, 409, 'Round 2 is not open');
    }

    const player = await requirePlayer(game.id, bearerToken(req));
    if (!player) {
      return error(res, 401, 'Unauthorized');
    }

    const assignments = await listRound2AssignmentsForPlayer(game.id, player.id);
    if (assignments.length === 0) {
      return error(res, 409, 'No round 2 assignments found for this player');
    }

    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));

    for (const entry of parsed.data.responses) {
      const assignment = assignmentById.get(entry.assignmentId);
      if (!assignment) {
        return error(res, 400, `Invalid assignment id: ${entry.assignmentId}`);
      }

      await upsertRound2Response({
        gameId: game.id,
        assignmentId: assignment.id,
        assigneePlayerId: player.id,
        targetPlayerId: assignment.targetPlayerId,
        content: entry.content,
        wordCount: wordCount(entry.content)
      });
    }

    const updated = await markRound2Completion(game.id, player.id);
    const stats = await getRoundCompletionStats(game.id);

    params.wsHub?.broadcast('player', game.id, {
      type: 'round2.progress',
      stats
    });
    params.wsHub?.broadcast('admin', game.id, {
      type: 'state.refresh',
      gameId: game.id
    });

    res.json({
      ok: true,
      round2Complete: updated?.round2Complete ?? false,
      deliberationEligible: updated?.deliberationEligible ?? false,
      stats
    });
  });

  router.get('/api/v2/games/:id/deliberation/feed', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    if (!['deliberation_running', 'deliberation_paused', 'deliberation_complete', 'archived'].includes(game.status)) {
      return error(res, 409, 'Deliberation feed is not available yet');
    }

    const player = await requirePlayer(game.id, bearerToken(req));
    if (!player) {
      return error(res, 401, 'Unauthorized');
    }

    if (!player.deliberationEligible) {
      return error(res, 403, 'Complete both rounds to access deliberation');
    }

    const feed = await buildDeliberationFeed(game.id);
    res.json(feed);
  });

  return router;
}
