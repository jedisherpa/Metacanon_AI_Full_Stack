const AGENT_API_KEY_STORAGE_KEY = 'lensforge_agent_api_key_v1';

function normalizeApiKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStoredApiKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeApiKey(window.localStorage.getItem(AGENT_API_KEY_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readAgentApiKey(): string | null {
  const stored = readStoredApiKey();
  if (stored) {
    return stored;
  }

  return normalizeApiKey(import.meta.env.VITE_AGENT_API_KEY as string | undefined);
}

export function saveAgentApiKey(value: string): string | null {
  const normalized = normalizeApiKey(value);

  if (typeof window !== 'undefined') {
    try {
      if (!normalized) {
        window.localStorage.removeItem(AGENT_API_KEY_STORAGE_KEY);
      } else {
        window.localStorage.setItem(AGENT_API_KEY_STORAGE_KEY, normalized);
      }
    } catch {
      // Ignore storage errors in privacy mode.
    }
  }

  return normalized;
}

export function clearAgentApiKey(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(AGENT_API_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage errors in privacy mode.
  }
}
