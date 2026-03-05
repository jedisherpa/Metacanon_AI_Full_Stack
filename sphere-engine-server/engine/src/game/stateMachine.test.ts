import { describe, expect, it } from 'vitest';
import { canTransition } from './stateMachine.js';

describe('state machine transitions', () => {
  it('allows expected lifecycle transitions', () => {
    expect(canTransition('draft', 'lobby_open')).toBe(true);
    expect(canTransition('lobby_open', 'lobby_locked')).toBe(true);
    expect(canTransition('round2_closed', 'deliberation_running')).toBe(true);
    expect(canTransition('deliberation_complete', 'archived')).toBe(true);
  });

  it('blocks invalid transitions', () => {
    expect(canTransition('draft', 'round1_open')).toBe(false);
    expect(canTransition('round1_open', 'round2_open')).toBe(false);
    expect(canTransition('archived', 'lobby_open')).toBe(false);
  });
});
