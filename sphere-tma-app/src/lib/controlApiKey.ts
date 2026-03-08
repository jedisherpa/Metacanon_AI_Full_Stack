const CONTROL_API_KEY_STORAGE_KEY = 'metacanon_control_api_key_v1';

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
    return normalizeApiKey(window.localStorage.getItem(CONTROL_API_KEY_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readControlApiKey(): string | null {
  const stored = readStoredApiKey();
  if (stored) {
    return stored;
  }

  return normalizeApiKey(import.meta.env.VITE_METACANON_CONTROL_API_KEY as string | undefined);
}

export function saveControlApiKey(value: string): string | null {
  const normalized = normalizeApiKey(value);

  if (typeof window !== 'undefined') {
    try {
      if (!normalized) {
        window.localStorage.removeItem(CONTROL_API_KEY_STORAGE_KEY);
      } else {
        window.localStorage.setItem(CONTROL_API_KEY_STORAGE_KEY, normalized);
      }
    } catch {
      // Ignore storage errors in privacy mode.
    }
  }

  return normalized;
}

export function clearControlApiKey(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(CONTROL_API_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage errors in privacy mode.
  }
}
