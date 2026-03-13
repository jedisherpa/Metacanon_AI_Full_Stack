import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { z } from 'zod';
import type { LensPack } from '../../config/lensPack.js';
import { env } from '../../config/env.js';
import { error } from '../../lib/http.js';
import { randomCode, randomToken } from '../../lib/crypto.js';
import { requireAdminSession } from '../../admin/middleware.js';
import {
  countPlayers,
  createAuditEvent,
  createCommand,
  createGame,
  getGameById,
  insertPreRegisteredPlayers,
  listGames,
  listCommandsByGame,
  listPlayersByGame,
  listRound1Responses,
  listRound2AssignmentsByGame,
  listRound2ResponsesByGame,
  listSynthesisArtifacts
} from '../../db/queries.js';
import { assignLenses } from '../../game/lensAssignment.js';
import { enqueueGameCommand } from '../../queue/boss.js';
import { generateHint } from '../../llm/service.js';
import type { ProviderChoice } from '../../llm/providers.js';
import type { WebSocketHub } from '../../ws/hub.js';
import { loadRedTeamArtifacts } from '../../observability/redTeamReports.js';
import { buildGameExport } from '../../export/jsonExport.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../../../../');
const defaultRedTeamReportPath = path.join(
  projectRoot,
  'artifacts',
  'redteam',
  'governance-redteam-report.json'
);

function resolveRedTeamReportPath(configuredPath?: string): string {
  if (!configuredPath?.trim()) {
    return defaultRedTeamReportPath;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(projectRoot, configuredPath);
}

const createGameSchema = z.object({
  question: z.string().min(3),
  groupSize: z.number().int().min(3).max(12).default(env.DEFAULT_GROUP_SIZE),
  provider: z.enum(['morpheus', 'groq', 'kimi', 'auto']).optional(),
  entryMode: z.enum(['self_join', 'pre_registered']).default('self_join'),
  positionRevealSeconds: z.number().int().min(5).max(120).optional()
});

const rosterSchema = z.object({
  players: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional()
      })
    )
    .min(1)
    .max(12)
});

function inviteBase(reqOrigin?: string | null): string {
  if (reqOrigin) return reqOrigin;
  const first = env.CORS_ORIGINS.split(',')[0]?.trim();
  return first || 'http://localhost:5173';
}

async function enqueueCommand(params: {
  gameId: string;
  commandType: string;
  wsHub?: WebSocketHub;
  payload?: Record<string, unknown>;
}) {
  const game = await getGameById(params.gameId);
  if (!game) {
    throw new Error('Game not found');
  }

  const command = await createCommand({
    gameId: game.id,
    commandType: params.commandType,
    payload: params.payload,
    dedupeKey: `${game.id}:${params.commandType}:${game.stateVersion}`
  });

  if (!command) {
    throw new Error('Failed to create command');
  }

  await enqueueGameCommand({
    commandId: command.id,
    gameId: game.id
  });

  params.wsHub?.broadcast('admin', game.id, {
    type: 'command.accepted',
    commandId: command.id,
    commandType: params.commandType
  });

  await createAuditEvent({
    gameId: game.id,
    actorType: 'admin',
    eventType: `command.${params.commandType}.queued`,
    payload: {
      commandId: command.id
    }
  });

  return command;
}

export function createAdminGameRoutes(params: { lensPack: LensPack; wsHub?: WebSocketHub }) {
  const router = Router();

  router.use('/api/v2/admin/games', requireAdminSession);
  router.use('/api/v2/admin/redteam-report', requireAdminSession);

  router.post('/api/v2/admin/games', async (req, res) => {
    const parsed = createGameSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    const row = await createGame({
      question: parsed.data.question,
      groupSize: parsed.data.groupSize,
      provider: parsed.data.provider ?? env.LLM_PROVIDER_DEFAULT,
      entryMode: parsed.data.entryMode,
      inviteCode: randomCode(8),
      positionRevealSeconds: parsed.data.positionRevealSeconds ?? env.POSITION_REVEAL_SECONDS
    });

    const base = inviteBase(req.headers.origin);
    const inviteUrl = `${base}/play/${row.id}/join`;

    res.json({
      game: row,
      inviteUrl
    });
  });

  router.get('/api/v2/admin/games', async (_req, res) => {
    const rows = await listGames(200);

    const withCounts = await Promise.all(
      rows.map(async (game) => ({
        ...game,
        playerCount: await countPlayers(game.id)
      }))
    );

    res.json({ games: withCounts });
  });

  router.get('/api/v2/admin/redteam-report', async (_req, res) => {
    const reportPath = resolveRedTeamReportPath(env.SPHERE_REDTEAM_REPORT_PATH);

    try {
      return res.json(
        await loadRedTeamArtifacts({
          reportPath,
          storageMode: env.SPHERE_REDTEAM_STORAGE_MODE,
          trendWindowSize: env.SPHERE_REDTEAM_TREND_WINDOW
        })
      );
    } catch (cause) {
      return error(
        res,
        500,
        'Failed to load red-team report',
        cause instanceof Error ? cause.message : 'unknown error'
      );
    }
  });

  router.get('/api/v2/admin/games/:id', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    const [players, round1, round2Assignments, round2, artifacts, commands] = await Promise.all([
      listPlayersByGame(game.id),
      listRound1Responses(game.id),
      listRound2AssignmentsByGame(game.id),
      listRound2ResponsesByGame(game.id),
      listSynthesisArtifacts(game.id),
      listCommandsByGame(game.id, 20)
    ]);

    res.json({ game, players, round1, round2Assignments, round2, artifacts, commands });
  });

  router.post('/api/v2/admin/games/:id/roster', async (req, res) => {
    const parsed = rosterSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, 400, 'Invalid payload', parsed.error.message);
    }

    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    if (game.entryMode !== 'pre_registered') {
      return error(res, 409, 'Roster preload requires pre_registered entry mode');
    }

    if (!['draft', 'lobby_open'].includes(game.status)) {
      return error(res, 409, 'Roster can only be updated before round1 starts');
    }

    if (parsed.data.players.length > game.groupSize) {
      return error(res, 409, 'Roster exceeds game size');
    }

    const lenses = assignLenses(params.lensPack, parsed.data.players.length, parsed.data.players.length >= 4);

    const rows = await Promise.all(
      parsed.data.players.map(async (player, index) => {
        const lens = lenses[index];
        let hint = '';

        try {
          hint = await generateHint({
            lens,
            question: game.question,
            provider: game.provider as ProviderChoice
          });
        } catch {
          hint = '';
        }

        return {
          gameId: game.id,
          seatNumber: index + 1,
          name: player.name,
          email: player.email,
          accessToken: randomToken(24),
          avatarId: lens.id,
          avatarName: lens.avatar_name,
          epistemology: lens.epistemology,
          hintText: hint
        };
      })
    );

    const inserted = await insertPreRegisteredPlayers(rows);

    res.json({
      players: inserted.map((player) => ({
        id: player.id,
        name: player.name,
        seatNumber: player.seatNumber,
        accessToken: player.accessToken
      }))
    });
  });

  router.get('/api/v2/admin/games/:id/roster/links', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    const base = inviteBase(req.headers.origin);
    const players = await listPlayersByGame(game.id);

    res.json({
      links: players.map((player) => ({
        playerId: player.id,
        name: player.name,
        seatNumber: player.seatNumber,
        url: `${base}/play/${game.id}/access/${player.accessToken}`
      }))
    });
  });

  const commandRoute = (path: string, commandType: string) => {
    router.post(path, async (req, res) => {
      const gameId = req.params.id;
      try {
        const command = await enqueueCommand({
          gameId,
          commandType,
          payload: req.body,
          wsHub: params.wsHub
        });

        res.status(202).json({
          commandId: command.id,
          status: command.status
        });
      } catch (err) {
        return error(res, 409, (err as Error).message);
      }
    });
  };

  commandRoute('/api/v2/admin/games/:id/lobby/open', 'lobby_open');
  commandRoute('/api/v2/admin/games/:id/lobby/lock', 'lobby_lock');
  commandRoute('/api/v2/admin/games/:id/round1/open', 'round1_open');
  commandRoute('/api/v2/admin/games/:id/round1/close', 'round1_close');
  commandRoute('/api/v2/admin/games/:id/round2/assign', 'round2_assign');
  commandRoute('/api/v2/admin/games/:id/round2/open', 'round2_open');
  commandRoute('/api/v2/admin/games/:id/round2/close', 'round2_close');
  commandRoute('/api/v2/admin/games/:id/deliberation/start', 'deliberation_start');
  commandRoute('/api/v2/admin/games/:id/deliberation/pause', 'deliberation_pause');
  commandRoute('/api/v2/admin/games/:id/deliberation/resume', 'deliberation_resume');
  commandRoute('/api/v2/admin/games/:id/deliberation/next', 'deliberation_next');
  commandRoute('/api/v2/admin/games/:id/archive', 'archive');

  router.get('/api/v2/admin/games/:id/export', async (req, res) => {
    const game = await getGameById(req.params.id);
    if (!game) {
      return error(res, 404, 'Game not found');
    }

    const exportPayload = await buildGameExport(game.id);
    res.json(exportPayload);
  });

  return router;
}
