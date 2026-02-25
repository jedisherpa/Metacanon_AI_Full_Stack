import { getPlayerByAccessToken } from '../db/queries.js';
import { validateAdminSession } from '../admin/sessionService.js';

export async function authorizeSocketChannel(params: {
  channel: 'admin' | 'player' | 'deliberation';
  gameId: string;
  token?: string | null;
}) {
  if (!params.token) {
    return false;
  }

  const adminValid = await validateAdminSession(params.token);
  if (adminValid) {
    return true;
  }

  const player = await getPlayerByAccessToken(params.token);
  if (!player) {
    return false;
  }

  if (player.gameId !== params.gameId) {
    return false;
  }

  if (params.channel === 'deliberation') {
    return Boolean(player.deliberationEligible);
  }

  return true;
}
