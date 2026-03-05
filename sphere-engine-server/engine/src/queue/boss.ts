import PgBoss from 'pg-boss';
import { env } from '../config/env.js';

export const GAME_COMMAND_QUEUE = 'game.command';

let boss: PgBoss | null = null;
let started = false;
let queuesPrepared = false;

export async function getBoss() {
  if (!boss) {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: env.PG_BOSS_SCHEMA
    });
  }

  if (!started) {
    await boss.start();
    started = true;
  }

  if (!queuesPrepared) {
    await boss.createQueue(GAME_COMMAND_QUEUE);
    queuesPrepared = true;
  }

  return boss;
}

export async function enqueueGameCommand(input: {
  commandId: string;
  gameId?: string | null;
}) {
  const instance = await getBoss();
  const jobId = await instance.send(
    GAME_COMMAND_QUEUE,
    {
      commandId: input.commandId,
      gameId: input.gameId
    },
    {
      retryLimit: env.COMMAND_MAX_RETRIES
    }
  );

  if (!jobId) {
    throw new Error('Failed to enqueue game command');
  }

  return jobId;
}
