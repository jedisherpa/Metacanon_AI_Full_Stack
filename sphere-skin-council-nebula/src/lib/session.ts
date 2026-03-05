export type PlayerSession = {
  playerId: string;
  playerToken: string;
  seatNumber?: number;
  avatarName?: string;
  epistemology?: string;
  hint?: string;
};

const ADMIN_WS_KEY = 'adminWsToken';

export function setAdminWsToken(token: string) {
  localStorage.setItem(ADMIN_WS_KEY, token);
}

export function getAdminWsToken() {
  return localStorage.getItem(ADMIN_WS_KEY) || '';
}

export function clearAdminWsToken() {
  localStorage.removeItem(ADMIN_WS_KEY);
}

export function savePlayerSession(gameId: string, session: PlayerSession) {
  localStorage.setItem(`playerSession:${gameId}`, JSON.stringify(session));
}

export function loadPlayerSession(gameId: string): PlayerSession | null {
  const raw = localStorage.getItem(`playerSession:${gameId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerSession;
  } catch {
    return null;
  }
}

export function clearPlayerSession(gameId: string) {
  localStorage.removeItem(`playerSession:${gameId}`);
}
