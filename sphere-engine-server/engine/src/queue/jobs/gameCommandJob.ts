import type { LensPack } from '../../config/lensPack.js';
import type { WebSocketHub } from '../../ws/hub.js';
import { getCommand, updateCommandStatus } from '../../db/queries.js';
import { executeGameCommand } from '../../game/orchestrationService.js';

export async function processGameCommandJob(params: {
  data: { commandId?: string };
  lensPack: LensPack;
  wsHub?: WebSocketHub;
  retryCount?: number;
}) {
  const commandId = params.data.commandId;
  if (!commandId) {
    throw new Error('Job missing command id');
  }

  const command = await getCommand(commandId);
  if (!command) {
    throw new Error('Command not found');
  }

  const attempts = (params.retryCount ?? 0) + 1;
  await updateCommandStatus({
    commandId,
    status: 'running',
    attempts
  });

  if (command.gameId) {
    params.wsHub?.broadcast('admin', command.gameId, {
      type: 'command.running',
      commandId
    });
  }

  try {
    await executeGameCommand({
      command,
      lensPack: params.lensPack,
      emit: params.wsHub
        ? (channel, gameId, payload) => {
            params.wsHub?.broadcast(channel, gameId, payload);
          }
        : undefined
    });

    await updateCommandStatus({
      commandId,
      status: 'completed',
      attempts
    });

    if (command.gameId) {
      params.wsHub?.broadcast('admin', command.gameId, {
        type: 'command.completed',
        commandId
      });
      params.wsHub?.broadcast('admin', command.gameId, {
        type: 'state.refresh',
        gameId: command.gameId
      });
      params.wsHub?.broadcast('player', command.gameId, {
        type: 'state.refresh',
        gameId: command.gameId
      });
      params.wsHub?.broadcast('deliberation', command.gameId, {
        type: 'state.refresh',
        gameId: command.gameId
      });
    }
  } catch (err) {
    await updateCommandStatus({
      commandId,
      status: 'failed',
      attempts,
      error: err instanceof Error ? err.message : 'Command failed'
    });

    if (command.gameId) {
      params.wsHub?.broadcast('admin', command.gameId, {
        type: 'command.failed',
        commandId,
        error: err instanceof Error ? err.message : 'Command failed'
      });
      params.wsHub?.broadcast('player', command.gameId, {
        type: 'state.refresh',
        gameId: command.gameId
      });
    }

    throw err;
  }
}
