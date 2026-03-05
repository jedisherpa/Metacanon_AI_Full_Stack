type StageTransitionPayload = {
  title: string;
  subtitle: string;
  targetPath: string;
  durationMs: number;
  createdAt: number;
};

const TRANSITION_DURATION_MS = 5000;
const KEY_PREFIX = 'playerStageTransition:';

function keyFor(gameId: string) {
  return `${KEY_PREFIX}${gameId}`;
}

function buildMessage(status: string, targetPath: string) {
  if (targetPath.includes('/round1')) {
    return {
      title: 'Round 1 Starting',
      subtitle: 'Claim your perspective and submit your first position.'
    };
  }

  if (status === 'round1_closed' || targetPath.includes('/round2')) {
    return {
      title: 'Round 1 Complete',
      subtitle: 'Round 2 is about to start. Get ready to respond to assigned perspectives.'
    };
  }

  if (status === 'round2_closed' || targetPath.includes('/deliberation')) {
    return {
      title: 'Round 2 Complete',
      subtitle: 'Deliberation is about to begin. Watch the perspectives interact live.'
    };
  }

  if (targetPath.includes('/results')) {
    return {
      title: 'Deliberation Complete',
      subtitle: 'Final synthesis is ready. Reviewing results now.'
    };
  }

  return {
    title: 'Stage Update',
    subtitle: 'The host advanced the session. Preparing your next view.'
  };
}

export function queueStageTransition(params: { gameId: string; status: string; targetPath: string }) {
  const message = buildMessage(params.status, params.targetPath);
  const payload: StageTransitionPayload = {
    ...message,
    targetPath: params.targetPath,
    durationMs: TRANSITION_DURATION_MS,
    createdAt: Date.now()
  };

  sessionStorage.setItem(keyFor(params.gameId), JSON.stringify(payload));
}

export function consumeStageTransition(gameId: string): StageTransitionPayload | null {
  const raw = sessionStorage.getItem(keyFor(gameId));
  if (!raw) return null;
  sessionStorage.removeItem(keyFor(gameId));

  try {
    return JSON.parse(raw) as StageTransitionPayload;
  } catch {
    return null;
  }
}
