import type { LensPack } from '../config/lensPack.js';
import type { WebSocketHub } from '../ws/hub.js';
import { GAME_COMMAND_QUEUE, getBoss } from './boss.js';
import { processGameCommandJob } from './jobs/gameCommandJob.js';

let registered = false;

export async function startWorkers(params: { lensPack: LensPack; wsHub?: WebSocketHub }) {
  if (registered) return;

  const boss = await getBoss();
  await boss.work(GAME_COMMAND_QUEUE, async (jobs) => {
    const batch = Array.isArray(jobs) ? jobs : [jobs];

    for (const job of batch) {
      await processGameCommandJob({
        data: (job.data ?? {}) as { commandId?: string },
        lensPack: params.lensPack,
        wsHub: params.wsHub,
        retryCount: (job as any).retrycount ?? (job as any).retryCount
      });
    }
  });

  registered = true;
}
