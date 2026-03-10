const CYCLE_START_PREFIX = 'cycle_';
const CYCLE_INVITE_START_PREFIX = 'cycle_invite_';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{16,160}$/;

export function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_V4_PATTERN.test(value.trim());
}

export function buildCycleStartParam(threadId: string): string {
  return `${CYCLE_START_PREFIX}${threadId}`;
}

export function buildCycleInviteStartParam(inviteCode: string): string {
  return `${CYCLE_INVITE_START_PREFIX}${inviteCode}`;
}

export function parseCycleThreadIdFromStartParam(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith(CYCLE_INVITE_START_PREFIX)) {
    return null;
  }
  if (!trimmed.toLowerCase().startsWith(CYCLE_START_PREFIX)) {
    return null;
  }

  const threadId = trimmed.slice(CYCLE_START_PREFIX.length);
  return isUuid(threadId) ? threadId : null;
}

export function readCycleThreadIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('cycleThreadId') ?? params.get('cycle_thread_id');
  return isUuid(raw) ? raw : null;
}

export function isInviteCode(value: string | null | undefined): value is string {
  if (!value) return false;
  return INVITE_CODE_PATTERN.test(value.trim());
}

export function parseCycleInviteCodeFromStartParam(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith(CYCLE_INVITE_START_PREFIX)) {
    return null;
  }

  const inviteCode = trimmed.slice(CYCLE_INVITE_START_PREFIX.length);
  return isInviteCode(inviteCode) ? inviteCode : null;
}

export function readCycleInviteCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('cycleInviteCode') ?? params.get('cycle_invite_code');
  return isInviteCode(raw) ? raw : null;
}

export function formatBotUsername(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^@+/, '');
  return normalized.length > 0 ? normalized : null;
}
