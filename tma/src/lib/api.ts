/**
 * LensForge Living Atlas — API client
 * All requests include the Telegram initData as a Bearer token.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function getInitData(): string {
  // In the real TMA, Telegram.WebApp.initData is populated automatically
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
    return (window as any).Telegram.WebApp.initData;
  }
  // Dev fallback
  return import.meta.env.VITE_DEV_INIT_DATA ?? '';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const initData = getInitData();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `tma ${initData}`
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Atlas
  getAtlasState: () => request<AtlasState>('GET', '/api/v1/atlas/state'),
  updateProfile: (body: { activeLensId?: string }) =>
    request('PATCH', '/api/v1/atlas/profile', body),

  // Citadel
  propose: (body: { sphereId: string; title: string; description: string; closesAt?: string }) =>
    request('POST', '/api/v1/citadel/propose', body),
  castVote: (body: { voteId: string; choice: 'yes' | 'no' | 'abstain'; rationale?: string }) =>
    request('POST', '/api/v1/citadel/vote', body),
  getProposals: (sphereId?: string) =>
    request<{ proposals: Proposal[] }>('GET', `/api/v1/citadel/proposals${sphereId ? `?sphereId=${sphereId}` : ''}`),
  getGovernanceReport: (sphereId?: string) =>
    request('GET', `/api/v1/citadel/governance-report${sphereId ? `?sphereId=${sphereId}` : ''}`),
  getConstitution: (sphereId?: string) =>
    request('GET', `/api/v1/citadel/constitution${sphereId ? `?sphereId=${sphereId}` : ''}`),

  // Forge
  getPassport: () => request<{ passport: Passport }>('GET', '/api/v1/forge/passport'),
  getLenses: () => request<{ lenses: Lens[] }>('GET', '/api/v1/forge/lens'),
  getMyLens: () => request<{ lens: Lens | null }>('GET', '/api/v1/forge/my-lens'),
  getCxp: () => request('GET', '/api/v1/forge/cxp'),
  askLens: (body: { gameId: string; lensId?: string }) =>
    request<{ hint: string; lensName: string }>('POST', '/api/v1/forge/ask', body),
  runDrill: (body: { question: string; lensId?: string }) =>
    request('POST', '/api/v1/forge/run-drill', body),
  getPrism: (gameId: string) =>
    request('GET', `/api/v1/forge/prism?gameId=${gameId}`),
  getStory: (gameId: string) =>
    request('GET', `/api/v1/forge/story?gameId=${gameId}`),

  // Hub
  broadcast: (body: { sphereId: string; message: string; messageType?: string }) =>
    request('POST', '/api/v1/hub/broadcast', body),
  getEscalations: () => request('GET', '/api/v1/hub/escalations'),
  getEveryone: (gameId?: string) =>
    request('GET', `/api/v1/hub/everyone${gameId ? `?gameId=${gameId}` : ''}`),
  sync: (body: { gameId: string }) => request('POST', '/api/v1/hub/sync', body),

  // Engine Room
  getStatusAll: () => request('GET', '/api/v1/engine-room/status-all'),
  getDbHealth: () => request('GET', '/api/v1/engine-room/db-health'),
  getConfig: () => request('GET', '/api/v1/engine-room/config'),
  listConstellations: () => request('GET', '/api/v1/engine-room/list-constellations'),
  getDrills: () => request('GET', '/api/v1/engine-room/drills'),
  getGlossary: () => request('GET', '/api/v1/engine-room/glossary'),
  getFallbackReport: () => request('GET', '/api/v1/engine-room/fallback-report'),
  whatIsASphere: () => request('GET', '/api/v1/engine-room/what-is-a-sphere')
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type AtlasState = {
  ok: boolean;
  profile: UserProfile;
  territories: {
    citadel: { status: string; pendingVotes: number };
    forge: { status: string; activeGames: number };
    hub: { status: string; pendingEscalations: number };
    engineRoom: { status: string };
  };
  activeGames: Game[];
};

export type UserProfile = {
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  isPremium: boolean;
  photoUrl?: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    cxpTotal: number;
    currentStreak: number;
  };
  earnedLenses: string[];
  activeLensId?: string | null;
};

export type Passport = {
  telegramId: string;
  stats: UserProfile['stats'];
  earnedLenses: Lens[];
  activeLensId?: string | null;
};

export type Lens = {
  id: string;
  name: string;
  epistemology: string;
  family: string;
  color: { name: string; hex: string };
  philosophy?: {
    core_quote: string;
    worldview: string;
  };
};

export type Game = {
  id: string;
  question: string;
  status: string;
  createdAt: string;
};

export type Proposal = {
  id: string;
  sphereId: string;
  title: string;
  description: string;
  proposedBy: string;
  status: string;
  createdAt: string;
};
