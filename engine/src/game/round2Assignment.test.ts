import { describe, expect, it } from 'vitest';
import { buildRound2Assignments } from './round2Assignment.js';

describe('round2 assignment engine', () => {
  it('assigns 2 targets for <= 6 players', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i + 1}`,
      avatarName: `Avatar ${i + 1}`,
      epistemology: 'Test'
    }));

    const responsesByPlayer = new Map(players.map((p) => [p.id, `Response for ${p.id}`]));
    const result = buildRound2Assignments({ players, responsesByPlayer });

    expect(result.perPlayer).toBe(2);
    expect(result.assignments.length).toBe(12);
    for (const assignment of result.assignments) {
      expect(assignment.assigneePlayerId).not.toBe(assignment.targetPlayerId);
    }
  });

  it('assigns 3 targets for > 6 players', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      avatarName: `Avatar ${i + 1}`,
      epistemology: 'Test'
    }));

    const responsesByPlayer = new Map(players.map((p) => [p.id, `Response for ${p.id}`]));
    const result = buildRound2Assignments({ players, responsesByPlayer });

    expect(result.perPlayer).toBe(3);
    expect(result.assignments.length).toBe(24);
  });
});
