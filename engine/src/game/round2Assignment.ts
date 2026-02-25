export type AssignmentPlayer = {
  id: string;
  avatarName: string;
  epistemology: string;
};

type Round1Lookup = Map<string, string>;

function shuffled<T>(rows: T[]) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildRound2Assignments(params: {
  players: AssignmentPlayer[];
  responsesByPlayer: Round1Lookup;
}) {
  const players = params.players;
  const perPlayer = players.length > 6 ? 3 : 2;

  if (players.length < perPlayer + 1) {
    throw new Error('Not enough players to assign round 2 targets');
  }

  const targetLoad = new Map<string, number>();
  players.forEach((player) => targetLoad.set(player.id, 0));

  const orderedAssignees = shuffled(players);
  const assignments: Array<{
    assigneePlayerId: string;
    targetPlayerId: string;
    promptText: string;
  }> = [];

  for (const assignee of orderedAssignees) {
    const chosen = new Set<string>();

    for (let i = 0; i < perPlayer; i += 1) {
      const candidates = players.filter((candidate) => {
        return candidate.id !== assignee.id && !chosen.has(candidate.id);
      });

      if (candidates.length === 0) {
        break;
      }

      let minLoad = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        minLoad = Math.min(minLoad, targetLoad.get(candidate.id) ?? 0);
      }

      const best = candidates.filter((candidate) => (targetLoad.get(candidate.id) ?? 0) === minLoad);
      const pick = shuffled(best)[0];

      chosen.add(pick.id);
      targetLoad.set(pick.id, (targetLoad.get(pick.id) ?? 0) + 1);

      const targetResponse = params.responsesByPlayer.get(pick.id) ?? '';
      const promptText = [
        `Respond to ${pick.avatarName} (${pick.epistemology}) while maintaining your own perspective lens.`,
        'Address the strongest point and where you disagree.',
        '',
        'Target perspective response:',
        targetResponse
      ].join('\n');

      assignments.push({
        assigneePlayerId: assignee.id,
        targetPlayerId: pick.id,
        promptText
      });
    }
  }

  return { assignments, perPlayer };
}
