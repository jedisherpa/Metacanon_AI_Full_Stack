import type { LensPack } from '../config/lensPack.js';
import {
  archiveGame,
  createAuditEvent,
  createSynthesisArtifact,
  getCommand,
  getGameById,
  listPlayersByGame,
  listRound1Responses,
  listRound2ResponsesByGame,
  listSynthesisArtifacts,
  replaceRound2Assignments,
  setAllDeliberationEligibility,
  transitionGameState,
  updateGame
} from '../db/queries.js';
import type { Command } from '../db/schema.js';
import { withLensIds } from './lensAssignment.js';
import { buildRound2Assignments } from './round2Assignment.js';
import { assertTransition } from './stateMachine.js';
import {
  generatePositionSummary,
  generateStructuredClashes,
  generateStructuredSynthesis,
  structuredArtifactToStorageJson,
  type ResponseEntry
} from '../llm/service.js';
import type { ProviderChoice } from '../llm/providers.js';

async function transitionOrThrow(params: {
  gameId: string;
  currentStatus: string;
  nextStatus: string;
  deliberationPhase?: string | null;
}) {
  assertTransition(params.currentStatus as any, params.nextStatus as any);
  const updated = await transitionGameState({
    gameId: params.gameId,
    fromStatus: params.currentStatus,
    toStatus: params.nextStatus,
    deliberationPhase: params.deliberationPhase
  });
  if (!updated) {
    throw new Error(`Game state transition failed (${params.currentStatus} -> ${params.nextStatus})`);
  }
  return updated;
}

export async function executeGameCommand(params: {
  command: Command;
  lensPack: LensPack;
  emit?: (channel: 'admin' | 'player' | 'deliberation', gameId: string, payload: unknown) => void;
}) {
  const gameId = params.command.gameId;
  if (!gameId) {
    throw new Error('Command is missing game id');
  }

  const game = await getGameById(gameId);
  if (!game) {
    throw new Error('Game not found');
  }

  const commandType = params.command.commandType;

  switch (commandType) {
    case 'lobby_open': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'lobby_open'
      });
      params.emit?.('player', gameId, { type: 'lobby.opened' });
      break;
    }

    case 'lobby_lock': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'lobby_locked'
      });
      params.emit?.('player', gameId, { type: 'lobby.locked' });
      break;
    }

    case 'round1_open': {
      const updated = await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'round1_open'
      });
      params.emit?.('player', gameId, {
        type: 'round1.opened',
        question: updated.question
      });
      break;
    }

    case 'round1_close': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'round1_closed'
      });
      params.emit?.('player', gameId, { type: 'round1.closed' });
      break;
    }

    case 'round2_assign': {
      if (game.status !== 'round1_closed') {
        throw new Error('Round 2 assignment requires round1_closed state');
      }

      const players = await listPlayersByGame(gameId);
      const round1 = await listRound1Responses(gameId);

      if (players.length < 3) {
        throw new Error('At least 3 players required for round 2 assignment');
      }

      const responsesByPlayer = new Map(round1.map((r) => [r.playerId, r.content]));
      const { assignments, perPlayer } = buildRound2Assignments({
        players: players.map((p) => ({ id: p.id, avatarName: p.avatarName, epistemology: p.epistemology })),
        responsesByPlayer
      });

      await replaceRound2Assignments(gameId, assignments);

      await createAuditEvent({
        gameId,
        actorType: 'system',
        eventType: 'round2.assignments.created',
        payload: { perPlayer, assignmentCount: assignments.length }
      });

      params.emit?.('player', gameId, {
        type: 'round2.assigned',
        perPlayer
      });
      break;
    }

    case 'round2_open': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'round2_open'
      });
      params.emit?.('player', gameId, { type: 'round2.opened' });
      break;
    }

    case 'round2_close': {
      const updated = await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'round2_closed'
      });
      await setAllDeliberationEligibility(gameId);
      params.emit?.('player', gameId, {
        type: 'round2.closed',
        status: updated.status
      });
      break;
    }

    case 'deliberation_start': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'deliberation_running',
        deliberationPhase: 'positions'
      });
      params.emit?.('deliberation', gameId, {
        type: 'deliberation.phase_started',
        phase: 'positions'
      });
      break;
    }

    case 'deliberation_pause': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'deliberation_paused'
      });
      params.emit?.('deliberation', gameId, {
        type: 'deliberation.paused'
      });
      break;
    }

    case 'deliberation_resume': {
      await transitionOrThrow({
        gameId,
        currentStatus: game.status,
        nextStatus: 'deliberation_running'
      });
      params.emit?.('deliberation', gameId, {
        type: 'deliberation.resumed'
      });
      break;
    }

    case 'deliberation_next': {
      const fresh = await getGameById(gameId);
      if (!fresh) throw new Error('Game not found');
      if (fresh.status !== 'deliberation_running') {
        throw new Error('deliberation_next requires deliberation_running status');
      }

      const players = await listPlayersByGame(gameId);
      const round1 = await listRound1Responses(gameId);
      const provider = fresh.provider as ProviderChoice;
      const responseMap = new Map(round1.map((r) => [r.playerId, r]));

      const formattedResponses: ResponseEntry[] = players
        .map((player) => {
          const response = responseMap.get(player.id);
          if (!response) return null;
          return {
            avatarName: player.avatarName,
            epistemology: player.epistemology,
            content: response.content
          };
        })
        .filter(Boolean) as ResponseEntry[];

      const phase = fresh.deliberationPhase ?? 'positions';

      if (phase === 'positions') {
        const lensMap = new Map(withLensIds(params.lensPack).map((lens) => [lens.id, lens]));
        for (const entry of formattedResponses) {
          let summary = '';
          try {
            summary = await generatePositionSummary({
              lensPack: params.lensPack,
              response: entry,
              provider
            });
          } catch {
            summary = '';
          }

          const lens = Array.from(lensMap.values()).find((l) => l.avatar_name === entry.avatarName);

          params.emit?.('deliberation', gameId, {
            type: 'deliberation.phase_stream',
            phase: 'positions',
            payload: {
              avatarName: entry.avatarName,
              epistemology: entry.epistemology,
              signatureColor: lens?.signature_color?.hex ?? '',
              content: entry.content,
              summary
            }
          });
        }

        await updateGame({ gameId, patch: { deliberationPhase: 'clash' } });
        params.emit?.('deliberation', gameId, {
          type: 'deliberation.phase_started',
          phase: 'clash'
        });
        break;
      }

      if (phase === 'clash') {
        const clashArtifact = await generateStructuredClashes({
          lensPack: params.lensPack,
          question: fresh.question,
          responses: formattedResponses,
          provider
        });

        const clashJson = structuredArtifactToStorageJson(clashArtifact);

        params.emit?.('deliberation', gameId, {
          type: 'deliberation.phase_stream',
          phase: 'clash',
          payload: clashArtifact
        });

        await createSynthesisArtifact({
          gameId,
          artifactType: 'clash',
          content: clashJson
        });

        await updateGame({ gameId, patch: { deliberationPhase: 'consensus' } });
        params.emit?.('deliberation', gameId, {
          type: 'deliberation.phase_started',
          phase: 'consensus'
        });
        break;
      }

      const artifactOrder: Array<'consensus' | 'options' | 'paradox' | 'minority'> = [
        'consensus',
        'options',
        'paradox',
        'minority'
      ];

      if (artifactOrder.includes(phase as any)) {
        const currentArtifact = phase as 'consensus' | 'options' | 'paradox' | 'minority';
        const artifacts = await listSynthesisArtifacts(gameId);
        const prior = {
          consensus: artifacts.find((a) => a.artifactType === 'consensus')?.content,
          options: artifacts.find((a) => a.artifactType === 'options')?.content,
          clashes: artifacts.find((a) => a.artifactType === 'clash')?.content
        };

        const artifact = await generateStructuredSynthesis({
          lensPack: params.lensPack,
          question: fresh.question,
          responses: formattedResponses,
          artifact: currentArtifact,
          prior,
          provider
        });

        const artifactJson = structuredArtifactToStorageJson(artifact);

        params.emit?.('deliberation', gameId, {
          type: 'deliberation.phase_stream',
          phase: currentArtifact,
          payload: artifact
        });

        await createSynthesisArtifact({
          gameId,
          artifactType: currentArtifact,
          content: artifactJson
        });

        const currentIndex = artifactOrder.indexOf(currentArtifact);
        const nextArtifact = artifactOrder[currentIndex + 1];

        if (!nextArtifact) {
          await transitionGameState({
            gameId,
            fromStatus: 'deliberation_running',
            toStatus: 'deliberation_complete',
            deliberationPhase: 'complete'
          });
          params.emit?.('deliberation', gameId, { type: 'deliberation.completed' });
          break;
        }

        await updateGame({ gameId, patch: { deliberationPhase: nextArtifact } });
        params.emit?.('deliberation', gameId, {
          type: 'deliberation.phase_started',
          phase: nextArtifact
        });
        break;
      }

      break;
    }

    case 'archive': {
      if (game.status !== 'deliberation_complete') {
        throw new Error('archive requires deliberation_complete status');
      }
      await archiveGame(gameId);
      params.emit?.('player', gameId, { type: 'game.archived' });
      break;
    }

    default:
      throw new Error(`Unknown command type: ${commandType}`);
  }

  await createAuditEvent({
    gameId,
    actorType: 'system',
    eventType: `command.${commandType}.completed`,
    payload: {
      commandId: params.command.id
    }
  });

  return getCommand(params.command.id);
}

export async function buildDeliberationFeed(gameId: string) {
  const [game, players, round1, round2, artifacts] = await Promise.all([
    getGameById(gameId),
    listPlayersByGame(gameId),
    listRound1Responses(gameId),
    listRound2ResponsesByGame(gameId),
    listSynthesisArtifacts(gameId)
  ]);

  return {
    game,
    players,
    round1,
    round2,
    artifacts
  };
}
