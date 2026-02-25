import { createCommand } from '../../db/queries.js';
import { enqueueGameCommand } from '../boss.js';

export async function enqueueDeliberationNext(gameId: string) {
  const command = await createCommand({
    gameId,
    commandType: 'deliberation_next',
    dedupeKey: `deliberation-next:${gameId}:${Date.now()}`
  });

  if (!command) {
    throw new Error('Failed to create deliberation_next command');
  }

  await enqueueGameCommand({ commandId: command.id, gameId });
  return command.id;
}
