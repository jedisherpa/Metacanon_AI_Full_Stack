export type GameStatus =
  | 'draft'
  | 'lobby_open'
  | 'lobby_locked'
  | 'round1_open'
  | 'round1_closed'
  | 'round2_open'
  | 'round2_closed'
  | 'deliberation_ready'
  | 'deliberation_running'
  | 'deliberation_paused'
  | 'deliberation_complete'
  | 'archived';

const transitions: Record<GameStatus, GameStatus[]> = {
  draft: ['lobby_open'],
  lobby_open: ['lobby_locked'],
  lobby_locked: ['round1_open'],
  round1_open: ['round1_closed'],
  round1_closed: ['round2_open'],
  round2_open: ['round2_closed'],
  round2_closed: ['deliberation_running'],
  deliberation_ready: ['deliberation_running'],
  deliberation_running: ['deliberation_paused', 'deliberation_complete'],
  deliberation_paused: ['deliberation_running', 'deliberation_complete'],
  deliberation_complete: ['archived'],
  archived: []
};

export function canTransition(from: GameStatus, to: GameStatus) {
  return transitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: GameStatus, to: GameStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}`);
  }
}

export type GameCommandType =
  | 'lobby_open'
  | 'lobby_lock'
  | 'round1_open'
  | 'round1_close'
  | 'round2_assign'
  | 'round2_open'
  | 'round2_close'
  | 'deliberation_start'
  | 'deliberation_pause'
  | 'deliberation_resume'
  | 'deliberation_next'
  | 'archive';
