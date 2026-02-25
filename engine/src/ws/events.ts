export type AdminEvent =
  | { type: 'command.accepted'; commandId: string; commandType: string }
  | { type: 'command.completed'; commandId: string }
  | { type: 'command.failed'; commandId: string; error: string }
  | { type: 'state.refresh'; gameId: string };

export type PlayerEvent =
  | { type: 'lobby.opened' }
  | { type: 'lobby.locked' }
  | { type: 'round1.opened'; question: string }
  | { type: 'round1.closed' }
  | { type: 'round2.assigned'; perPlayer: number }
  | { type: 'round2.opened' }
  | { type: 'round2.closed'; status: string }
  | { type: 'game.archived' };

export type DeliberationEvent =
  | { type: 'deliberation.phase_started'; phase: string }
  | { type: 'deliberation.phase_stream'; phase: string; delta?: string; payload?: unknown }
  | { type: 'deliberation.paused' }
  | { type: 'deliberation.resumed' }
  | { type: 'deliberation.completed' };
