import { getAdminWsToken } from './session';

const API_BASE = import.meta.env.VITE_ENGINE_URL || 'http://localhost:3001';

export type ApiError = { error: string; detail?: string };
export type AdminRedTeamAttackClass =
  | 'signature_validation'
  | 'quorum_and_breakglass'
  | 'db_write_bypass'
  | 'replay_idempotency'
  | 'mixed_key_rotation'
  | 'counselor_ack_forgery'
  | 'degraded_mode_abuse'
  | string;

export type AdminRedTeamScenario = {
  scenarioId: string;
  attackClass: AdminRedTeamAttackClass;
  status: 'passed' | 'failed';
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  capturedAt: string;
};

export type AdminRedTeamReport = {
  generatedAt: string;
  suite: string;
  metrics: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    blockedProbeScenarios: number;
    attackClassCounts: Record<string, number>;
  };
  scenarios: AdminRedTeamScenario[];
  runner?: {
    command?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    exitCode?: number;
    status?: string;
    reportPath?: string;
  };
};

export type AdminRedTeamReportResponse = {
  reportAvailable: boolean;
  reportPath: string;
  updatedAt: string | null;
  report: AdminRedTeamReport | null;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers({
    'Content-Type': 'application/json'
  });

  const incomingHeaders = new Headers(options.headers || {});
  for (const [key, value] of incomingHeaders.entries()) {
    headers.set(key, value);
  }

  if (path.startsWith('/api/v2/admin') && !headers.has('Authorization')) {
    const token = typeof window !== 'undefined' ? getAdminWsToken() : '';
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers
  });

  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as ApiError;
    throw new Error(data.detail || data.error || `Request failed (${resp.status})`);
  }

  return (await resp.json()) as T;
}

function withPlayerToken(token?: string) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function adminUnlock(password: string) {
  return request<{ ok: boolean; expiresAt: string; wsToken?: string }>('/api/v2/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export function adminSession() {
  return request<{ ok: boolean }>('/api/v2/admin/session');
}

export function adminLock() {
  return request<{ ok: boolean }>('/api/v2/admin/lock', {
    method: 'POST'
  });
}

export function adminCreateGame(payload: {
  question: string;
  groupSize: number;
  provider: 'morpheus' | 'groq' | 'auto';
  entryMode: 'self_join' | 'pre_registered';
  positionRevealSeconds: number;
}) {
  return request<{ game: any; inviteUrl: string }>('/api/v2/admin/games', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function adminListGames() {
  return request<{ games: any[] }>('/api/v2/admin/games');
}

export function adminGetRedTeamReport() {
  return request<AdminRedTeamReportResponse>('/api/v2/admin/redteam-report');
}

export function adminGetGame(gameId: string) {
  return request<{
    game: any;
    players: any[];
    round1: any[];
    round2Assignments: any[];
    round2: any[];
    artifacts: any[];
    commands: any[];
  }>(
    `/api/v2/admin/games/${gameId}`
  );
}

export function adminAddRoster(gameId: string, players: Array<{ name: string; email?: string }>) {
  return request<{ players: any[] }>(`/api/v2/admin/games/${gameId}/roster`, {
    method: 'POST',
    body: JSON.stringify({ players })
  });
}

export function adminRosterLinks(gameId: string) {
  return request<{ links: any[] }>(`/api/v2/admin/games/${gameId}/roster/links`);
}

export function adminAction(gameId: string, actionPath: string) {
  return request<{ commandId: string; status: string }>(`/api/v2/admin/games/${gameId}${actionPath}`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function adminCommand(commandId: string) {
  return request<{ command: any }>(`/api/v2/admin/commands/${commandId}`);
}

export function adminExport(gameId: string) {
  return request<any>(`/api/v2/admin/games/${gameId}/export?format=json`);
}

export function inviteLookup(code: string) {
  return request<{ gameId: string }>(`/api/v2/games/invite/${code}`);
}

export function playerJoin(gameId: string, payload: { name: string; email?: string }) {
  return request<{ player: any; playerToken: string }>(`/api/v2/games/${gameId}/join`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function playerAccess(gameId: string, accessToken: string) {
  return request<{ player: any; playerToken: string }>(`/api/v2/games/${gameId}/access/${accessToken}`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function playerMe(gameId: string, playerToken: string) {
  return request<{ game: any; player: any }>(`/api/v2/games/${gameId}/me`, {
    headers: withPlayerToken(playerToken)
  });
}

export function playerLobby(gameId: string) {
  return request<{ game: any; players: any[]; stats: any }>(`/api/v2/games/${gameId}/lobby`);
}

export function submitRound1(gameId: string, playerToken: string, content: string) {
  return request<{ responseId: string; submittedAt: string; stats: any }>(`/api/v2/games/${gameId}/round1/submit`, {
    method: 'POST',
    headers: withPlayerToken(playerToken),
    body: JSON.stringify({ content })
  });
}

export function getRound2Assignments(gameId: string, playerToken: string) {
  return request<{ assignments: any[] }>(`/api/v2/games/${gameId}/round2/assignments/me`, {
    headers: withPlayerToken(playerToken)
  });
}

export function submitRound2(
  gameId: string,
  playerToken: string,
  responses: Array<{ assignmentId: string; content: string }>
) {
  return request<{ ok: boolean; round2Complete: boolean; deliberationEligible: boolean; stats: any }>(
    `/api/v2/games/${gameId}/round2/submit`,
    {
      method: 'POST',
      headers: withPlayerToken(playerToken),
      body: JSON.stringify({ responses })
    }
  );
}

export function deliberationFeed(gameId: string, playerToken: string) {
  return request<any>(`/api/v2/games/${gameId}/deliberation/feed`, {
    headers: withPlayerToken(playerToken)
  });
}
