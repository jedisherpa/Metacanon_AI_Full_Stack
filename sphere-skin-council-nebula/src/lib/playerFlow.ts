const DELIBERATION_STATES = new Set([
  'deliberation_running',
  'deliberation_paused',
  'deliberation_complete'
]);

export function resolvePlayerRoute(gameId: string, game: any, player: any) {
  if (!game || !player) return `/play/${gameId}/lobby`;

  if (game.status === 'round1_open' && !player.round1Complete) {
    return `/play/${gameId}/round1`;
  }

  if (game.status === 'round2_open' && !player.round2Complete) {
    return `/play/${gameId}/round2`;
  }

  if (DELIBERATION_STATES.has(game.status) && player.deliberationEligible) {
    return `/play/${gameId}/deliberation`;
  }

  if (game.status === 'archived' && player.deliberationEligible) {
    return `/play/${gameId}/results`;
  }

  return `/play/${gameId}/lobby`;
}

export function friendlyGameStage(status?: string) {
  switch (status) {
    case 'draft':
      return 'Setup';
    case 'lobby_open':
    case 'lobby_locked':
      return 'Lobby';
    case 'round1_open':
    case 'round1_closed':
      return 'Round 1';
    case 'round2_open':
    case 'round2_closed':
      return 'Round 2';
    case 'deliberation_ready':
    case 'deliberation_running':
    case 'deliberation_paused':
    case 'deliberation_complete':
      return 'Deliberation';
    case 'archived':
      return 'Complete';
    default:
      return 'Session';
  }
}
