import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap,
  BookOpen,
  Dumbbell,
  Eye,
  Sparkles,
  Orbit,
  RefreshCw,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Lock
} from 'lucide-react';
import {
  api,
  ApiRequestError,
  type Passport,
  type Lens,
  type UserProfile,
  type SphereCapabilities,
  type SphereStatus,
  type SphereThreadEntry,
  type SphereThreadInvite,
  type SphereThreadMember,
  type SphereLensUpgradeRule,
  type SphereAckRecord,
  type SphereCycleEventType,
  type SphereStreamEvent
} from '../lib/api';
import { triggerHaptic } from '../lib/telegram';
import {
  buildCycleInviteStartParam,
  formatBotUsername,
  isInviteCode,
  isUuid,
  readCycleInviteCodeFromSearch,
  readCycleThreadIdFromSearch
} from '../lib/cycleInvite';
import { readAgentApiKey } from '../lib/agentApiKey';

type Props = { profile: UserProfile };

type Tab = 'passport' | 'lenses' | 'drill' | 'cycle';
type StreamState = 'idle' | 'connecting' | 'live' | 'offline' | 'error';
type CycleNoticeKind = 'degraded' | 'halted' | 'quorum';
type RelayTarget = 'none' | 'friend' | 'owner' | 'custom';
type RelayTransportMode = 'direct' | 'bridge_hint';

type CycleNotice = {
  kind: CycleNoticeKind;
  message: string;
  traceId?: string;
  retryable?: boolean;
};

type DrillResultPayload = {
  hint: string;
  lensName: string;
};

function nextUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hex = `${hash.toString(16).padStart(8, '0')}${Date.now().toString(16).padStart(24, '0')}`.slice(
    0,
    32
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function classifyCycleNotice(error: unknown): CycleNotice | null {
  const requestError = error instanceof ApiRequestError ? error : null;
  const code = requestError?.code ?? '';
  const message = requestError?.message ?? (error instanceof Error ? error.message : String(error));
  const normalizedMessage = message.toLowerCase();

  if (
    code === 'THREAD_HALTED' ||
    normalizedMessage.includes('thread is halted') ||
    normalizedMessage.includes('halted and cannot')
  ) {
    return {
      kind: 'halted',
      message,
      traceId: requestError?.traceId,
      retryable: requestError?.retryable
    };
  }

  if (
    code === 'STM_ERR_MISSING_ATTESTATION' ||
    code === 'PRISM_HOLDER_APPROVAL_REQUIRED' ||
    normalizedMessage.includes('attestation') ||
    normalizedMessage.includes('quorum')
  ) {
    return {
      kind: 'quorum',
      message,
      traceId: requestError?.traceId,
      retryable: requestError?.retryable
    };
  }

  if (
    code === 'DEGRADED_NO_LLM' ||
    code === 'INTENT_BLOCKED_IN_DEGRADED_MODE' ||
    normalizedMessage.includes('degraded') ||
    normalizedMessage.includes('llm unavailable')
  ) {
    return {
      kind: 'degraded',
      message,
      traceId: requestError?.traceId,
      retryable: requestError?.retryable
    };
  }

  return null;
}

function parseAttestationCsv(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function intentToCycleEvent(intent: string): SphereCycleEventType | null {
  const normalized = intent.trim().toUpperCase();
  if (normalized === 'SEAT_TAKEN') return 'seat_taken';
  if (normalized === 'PERSPECTIVE_SUBMITTED') return 'perspective_submitted';
  if (normalized === 'SYNTHESIS_RETURNED') return 'synthesis_returned';
  if (normalized === 'LENS_UPGRADED') return 'lens_upgraded';
  return null;
}

function cycleEventLabel(eventType: SphereCycleEventType): string {
  switch (eventType) {
    case 'seat_taken':
      return 'Seat Taken';
    case 'perspective_submitted':
      return 'Perspective Submitted';
    case 'synthesis_returned':
      return 'Synthesis Returned';
    case 'lens_upgraded':
      return 'Lens Upgraded';
    default:
      return eventType;
  }
}

function buildCycleInviteUrl(inviteCode: string, botUsername: string | null): string | null {
  const startParam = buildCycleInviteStartParam(inviteCode);

  if (botUsername) {
    return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  url.pathname = '/forge';
  url.searchParams.set('cycleInviteCode', inviteCode);
  return url.toString();
}

function formatIsoCompact(value: string | undefined): string {
  if (!value) {
    return 'n/a';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string): [number, number, number] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    if (!match) {
      return null;
    }

    return [
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
      Number.parseInt(match[3], 10)
    ];
  };

  const leftParts = parse(left);
  const rightParts = parse(right);
  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function summarizeAgentPayload(payload: Record<string, unknown>): string {
  const candidates = ['text', 'message', 'content', 'note', 'summary'];
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const serialized = JSON.stringify(payload);
  if (!serialized || serialized === '{}') {
    return '(empty payload)';
  }
  return serialized;
}

function normalizeRelayTarget(target: RelayTarget, customValue: string): string | null {
  if (target === 'none') {
    return null;
  }

  const value = target === 'custom' ? customValue.trim() : target;
  if (!value) {
    return null;
  }

  const normalized = value.startsWith('@') ? value : `@${value.replace(/^@+/, '')}`;
  return normalized.length > 1 ? normalized : null;
}

export default function ForgePage({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('passport');
  const [passport, setPassport] = useState<Passport | null>(null);
  const [allLenses, setAllLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillQuestion, setDrillQuestion] = useState('');
  const [drillResult, setDrillResult] = useState<DrillResultPayload | null>(null);
  const [drilling, setDrilling] = useState(false);
  const [selectedLensId, setSelectedLensId] = useState<string | null>(null);

  const [sphereCapabilities, setSphereCapabilities] = useState<SphereCapabilities | null>(null);
  const [sphereStatus, setSphereStatus] = useState<SphereStatus | null>(null);
  const [lensUpgradeRules, setLensUpgradeRules] = useState<SphereLensUpgradeRule[]>([]);
  const [lensUpgradeRegistryVersion, setLensUpgradeRegistryVersion] = useState<string | null>(null);
  const [cycleCurrentLensVersion, setCycleCurrentLensVersion] = useState<string | null>(null);

  const [cycleThreadId, setCycleThreadId] = useState<string | null>(null);
  const [cycleObjective, setCycleObjective] = useState('What perspective should guide this cycle?');
  const [cyclePerspective, setCyclePerspective] = useState('');
  const [cycleSynthesisDraft, setCycleSynthesisDraft] = useState('');
  const [lensUpgradeNote, setLensUpgradeNote] = useState('');
  const [agentRelayIntent, setAgentRelayIntent] = useState('AGENT_MESSAGE');
  const [agentRelayText, setAgentRelayText] = useState('');
  const [agentRelayTarget, setAgentRelayTarget] = useState<RelayTarget>('none');
  const [agentRelayTargetCustomValue, setAgentRelayTargetCustomValue] = useState('');
  const [agentRelayTransportMode, setAgentRelayTransportMode] =
    useState<RelayTransportMode>('direct');
  const [attestationCsv, setAttestationCsv] = useState('');

  const [cyclePhase, setCyclePhase] = useState<SphereCycleEventType | null>(null);
  const [cycleEntries, setCycleEntries] = useState<SphereThreadEntry[]>([]);
  const [cycleAcks, setCycleAcks] = useState<SphereAckRecord[]>([]);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [streamHeartbeatAt, setStreamHeartbeatAt] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [cycleNotice, setCycleNotice] = useState<CycleNotice | null>(null);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [cycleInviteUrl, setCycleInviteUrl] = useState<string | null>(null);
  const [manualInviteCode, setManualInviteCode] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [agentApiKeyAttached, setAgentApiKeyAttached] = useState<boolean>(() => Boolean(readAgentApiKey()));
  const [cycleMembers, setCycleMembers] = useState<SphereThreadMember[]>([]);
  const [cycleInvites, setCycleInvites] = useState<SphereThreadInvite[]>([]);
  const [cycleAccessPrincipal, setCycleAccessPrincipal] = useState<string | null>(null);
  const [cycleAccessRoleHint, setCycleAccessRoleHint] = useState<'owner' | 'member' | null>(null);
  const [syncingAccess, setSyncingAccess] = useState(false);
  const [accessActionKey, setAccessActionKey] = useState<string | null>(null);
  const [submittingCycle, setSubmittingCycle] = useState(false);
  const [syncingReplay, setSyncingReplay] = useState(false);

  const streamCloseRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualStopRef = useRef(false);
  const replayCursorRef = useRef(0);
  const ackCursorRef = useRef(0);
  const ackingSequencesRef = useRef<Set<number>>(new Set());
  const streamRetryMsRef = useRef(1000);

  const cycleFeatures = sphereCapabilities?.features;
  const cycleEventsEnabled = sphereCapabilities
    ? cycleFeatures?.cycleEvents !== false
    : false;
  const replayEnabled = sphereCapabilities
    ? cycleFeatures?.replay !== false
    : false;
  const streamEnabled = sphereCapabilities
    ? cycleFeatures?.stream !== false
    : false;
  const ackEnabled = sphereCapabilities
    ? cycleFeatures?.ack !== false
    : false;
  const messagesEnabled = sphereCapabilities
    ? cycleFeatures?.messages !== false
    : false;
  const writesBlocked = cycleNotice?.kind === 'halted';

  const cycleEntryCount = useMemo(() => cycleEntries.length, [cycleEntries]);
  const cycleAckCount = useMemo(() => cycleAcks.length, [cycleAcks]);
  const agentRelayEntries = useMemo(() => {
    return [...cycleEntries]
      .sort((left, right) => left.ledgerEnvelope.sequence - right.ledgerEnvelope.sequence)
      .filter((entry) => intentToCycleEvent(entry.clientEnvelope.intent) === null);
  }, [cycleEntries]);
  const checklistThreadReady = Boolean(cycleThreadId);
  const checklistPeerJoined = cycleMembers.length > 1;
  const checklistRelayReady = agentRelayEntries.length > 0;
  const normalizedRelayTarget = normalizeRelayTarget(agentRelayTarget, agentRelayTargetCustomValue);
  const botLinkCommand = cycleThreadId ? `/link ${cycleThreadId}` : null;
  const inferredLensVersion = useMemo(() => {
    const semverPattern = /^\d+\.\d+\.\d+$/;
    const upgrades = [...cycleEntries]
      .sort((left, right) => left.ledgerEnvelope.sequence - right.ledgerEnvelope.sequence)
      .filter((entry) => entry.clientEnvelope.intent.trim().toUpperCase() === 'LENS_UPGRADED')
      .map((entry) => {
        const version = entry.payload.nextLensVersion;
        return typeof version === 'string' && semverPattern.test(version.trim())
          ? version.trim()
          : null;
      })
      .filter((version): version is string => Boolean(version));

    return upgrades[upgrades.length - 1] ?? '1.0.0';
  }, [cycleEntries]);
  const effectiveCurrentLensVersion = cycleCurrentLensVersion ?? inferredLensVersion;
  const effectiveLensId = selectedLensId ?? profile.activeLensId ?? null;
  const recommendedLensUpgradeRule = useMemo<SphereLensUpgradeRule | null>(() => {
    if (lensUpgradeRules.length === 0) {
      return null;
    }

    const fromVersionMatches = lensUpgradeRules
      .filter((rule) => rule.fromVersion === effectiveCurrentLensVersion)
      .sort((left, right) => compareSemver(left.toVersion, right.toVersion));

    if (fromVersionMatches.length === 0) {
      return null;
    }

    if (effectiveLensId) {
      const permitted = fromVersionMatches.find((rule) => {
        return !rule.permittedLensIds || rule.permittedLensIds.includes(effectiveLensId);
      });
      if (permitted) {
        return permitted;
      }
    }

    return fromVersionMatches[0];
  }, [lensUpgradeRules, effectiveCurrentLensVersion, effectiveLensId]);
  const cycleAccessRole = useMemo<'owner' | 'member' | null>(() => {
    if (cycleAccessRoleHint) {
      return cycleAccessRoleHint;
    }

    if (!cycleAccessPrincipal) {
      return null;
    }

    return cycleMembers.find((member) => member.principal === cycleAccessPrincipal)?.role ?? null;
  }, [cycleMembers, cycleAccessPrincipal, cycleAccessRoleHint]);
  const directChannelReady = Boolean(
    cycleThreadId &&
      agentApiKeyAttached &&
      cycleAccessPrincipal &&
      messagesEnabled &&
      (cycleAccessRole === 'owner' || cycleAccessRole === 'member')
  );
  const canManageMembers = cycleAccessRole === 'owner';
  const accessControlReason = useMemo(() => {
    if (!cycleThreadId) {
      return 'Start or join a thread to manage access.';
    }
    if (!cycleAccessPrincipal) {
      return 'Access principal unavailable. Add an agent API key to enable owner controls.';
    }
    if (cycleAccessRole === null) {
      return 'Your principal is not listed in this thread membership set.';
    }
    if (cycleAccessRole !== 'owner') {
      return 'Only owners can remove members. Invite revoke is limited to owners or invite creators.';
    }
    return null;
  }, [cycleThreadId, cycleAccessPrincipal, cycleAccessRole]);
  const botUsername = formatBotUsername(import.meta.env.VITE_TMA_BOT_USERNAME as string | undefined);

  function resetStreamState() {
    setStreamState('idle');
    setStreamError(null);
    setStreamHeartbeatAt(null);
  }

  function applyCycleError(error: unknown, fallback: string): void {
    const notice = classifyCycleNotice(error);
    if (notice) {
      setCycleNotice(notice);
      setCycleError(null);
      return;
    }

    const message = error instanceof Error ? error.message : fallback;
    setCycleError(message || fallback);
  }

  function stopStream() {
    manualStopRef.current = true;

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (streamCloseRef.current) {
      streamCloseRef.current();
      streamCloseRef.current = null;
    }

    setStreamState('offline');
  }

  function upsertEntries(entries: SphereThreadEntry[]) {
    if (entries.length === 0) return;

    setCycleEntries((prev) => {
      const bySequence = new Map<number, SphereThreadEntry>();

      for (const entry of prev) {
        bySequence.set(entry.ledgerEnvelope.sequence, entry);
      }

      for (const entry of entries) {
        bySequence.set(entry.ledgerEnvelope.sequence, entry);
        replayCursorRef.current = Math.max(replayCursorRef.current, entry.ledgerEnvelope.sequence);
      }

      return Array.from(bySequence.values()).sort(
        (a, b) => a.ledgerEnvelope.sequence - b.ledgerEnvelope.sequence
      );
    });
  }

  function upsertAcks(acks: SphereAckRecord[]) {
    if (acks.length === 0) return;

    setCycleAcks((prev) => {
      const byAckId = new Map<number, SphereAckRecord>();

      for (const ack of prev) {
        byAckId.set(ack.ackId, ack);
      }

      for (const ack of acks) {
        byAckId.set(ack.ackId, ack);
        ackCursorRef.current = Math.max(ackCursorRef.current, ack.ackId);
      }

      return Array.from(byAckId.values()).sort((a, b) => a.ackId - b.ackId);
    });
  }

  async function refreshSphereBoundary() {
    const [capabilitiesResult, statusResult, lensRulesResult] = await Promise.allSettled([
      api.getSphereCapabilities(),
      api.getSphereStatus(),
      api.getSphereLensUpgradeRules()
    ]);

    if (capabilitiesResult.status === 'fulfilled') {
      setSphereCapabilities(capabilitiesResult.value);
    }

    if (statusResult.status === 'fulfilled') {
      setSphereStatus(statusResult.value);
      if (statusResult.value.systemState === 'DEGRADED_NO_LLM') {
        setCycleNotice((existing) => {
          if (existing?.kind === 'halted' || existing?.kind === 'quorum') {
            return existing;
          }
          return {
            kind: 'degraded',
            message:
              statusResult.value.degradedNoLlmReason ??
              'Sphere is in DEGRADED_NO_LLM mode. Model-dependent actions may be gated.'
          };
        });
      } else if (statusResult.value.haltedThreads > 0) {
        setCycleNotice((existing) => {
          if (existing?.kind === 'quorum') {
            return existing;
          }
          return {
            kind: 'halted',
            message: `Detected ${statusResult.value.haltedThreads} halted thread(s). Write paths may be blocked.`
          };
        });
      }
    }

    if (lensRulesResult.status === 'fulfilled') {
      setLensUpgradeRegistryVersion(lensRulesResult.value.registryVersion);
      setLensUpgradeRules(lensRulesResult.value.rules ?? []);
    }
  }

  async function syncReplay(threadId: string): Promise<void> {
    if (!replayEnabled && !cycleFeatures?.threadAcks) {
      return;
    }

    setSyncingReplay(true);
    try {
      const tasks: Array<Promise<unknown>> = [];

      if (replayEnabled) {
        tasks.push(
          api.getSphereReplay(threadId, { cursor: replayCursorRef.current }).then((response) => {
            upsertEntries(response.entries ?? []);
            replayCursorRef.current = Math.max(replayCursorRef.current, response.nextCursor ?? 0);
            if (ackEnabled) {
              for (const entry of response.entries ?? []) {
                void ackEntry(threadId, entry);
              }
            }
          })
        );
      }

      if (cycleFeatures?.threadAcks || ackEnabled) {
        tasks.push(
          api
            .getSphereAcks(threadId, {
              cursor: ackCursorRef.current,
              ack_cursor: ackCursorRef.current,
              limit: 200
            })
            .then((response) => {
              upsertAcks(response.acks ?? []);
              ackCursorRef.current = Math.max(ackCursorRef.current, response.nextCursor ?? 0);
            })
        );
      }

      await Promise.all(tasks);
      setCycleError(null);
    } catch (error) {
      applyCycleError(error, 'Replay sync failed.');
    } finally {
      setSyncingReplay(false);
    }
  }

  async function syncThreadAccess(threadId: string): Promise<void> {
    setSyncingAccess(true);

    try {
      const [membersResponse, invitesResponse] = await Promise.all([
        api.getSphereThreadMembers(threadId, { limit: 200 }),
        api.getSphereThreadInvites(threadId, { limit: 200, includeRevoked: true })
      ]);

      const requestPrincipal =
        membersResponse.agentPrincipal ??
        invitesResponse.agentPrincipal ??
        membersResponse.requestPrincipal ??
        membersResponse.principal ??
        invitesResponse.requestPrincipal ??
        null;
      const requestRole = membersResponse.requestRole ?? invitesResponse.requestRole ?? null;

      setCycleAccessPrincipal(requestPrincipal);
      setCycleAccessRoleHint(requestRole);
      setCycleMembers(membersResponse.members ?? []);
      setCycleInvites(invitesResponse.invites ?? []);
    } catch (error) {
      setCycleAccessRoleHint(null);
      const message =
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to sync members/invites for this thread.';
      setInviteStatus(message);
    } finally {
      setSyncingAccess(false);
    }
  }

  async function syncLensProgression(threadId: string): Promise<void> {
    try {
      const progression = await api.getSphereLensProgression(threadId);
      setCycleCurrentLensVersion(progression.currentVersion ?? null);
    } catch {
      // Optional read path; fall back to replay-derived inference when unavailable.
    }
  }

  async function ackEntry(threadId: string, entry: SphereThreadEntry): Promise<void> {
    if (!ackEnabled) return;

    const sequence = entry.ledgerEnvelope.sequence;
    const targetMessageId = entry.clientEnvelope.messageId;

    if (!sequence || !targetMessageId) return;

    if (ackingSequencesRef.current.has(sequence)) return;

    const alreadyAcked = cycleAcks.some((ack) => ack.targetSequence === sequence);
    if (alreadyAcked) return;

    ackingSequencesRef.current.add(sequence);

    try {
      const response = await api.ackSphereThreadEntry({
        threadId,
        targetSequence: sequence,
        targetMessageId,
        traceId: nextUuid(),
        receivedAt: new Date().toISOString(),
        attestation: parseAttestationCsv(attestationCsv)
      });
      upsertAcks([response.ack]);
    } catch (error) {
      applyCycleError(error, 'ACK write failed.');
    } finally {
      ackingSequencesRef.current.delete(sequence);
    }
  }

  function scheduleReconnect(threadId: string) {
    if (!streamEnabled) return;
    if (manualStopRef.current) return;
    if (reconnectTimerRef.current !== null) return;

    const attempt = reconnectAttemptRef.current;
    const baseRetry = Math.max(500, streamRetryMsRef.current || 1000);
    const delay = Math.min(8000, baseRetry * 2 ** Math.min(attempt, 3));

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectStream(threadId);
    }, delay);

    reconnectAttemptRef.current = attempt + 1;
  }

  async function connectStream(threadId: string): Promise<void> {
    if (!streamEnabled) return;

    manualStopRef.current = false;

    if (streamCloseRef.current) {
      streamCloseRef.current();
      streamCloseRef.current = null;
    }

    setStreamError(null);
    setStreamState('connecting');

    const handleStreamEvent = (event: SphereStreamEvent) => {
      const payload = event.data as Record<string, unknown> | null;

      if (event.event === 'ready') {
        setStreamState('live');
        reconnectAttemptRef.current = 0;

        if (typeof event.retry === 'number' && event.retry > 0) {
          streamRetryMsRef.current = event.retry;
        }

        if (payload && typeof payload.cursor === 'number') {
          replayCursorRef.current = Math.max(replayCursorRef.current, payload.cursor);
        }
        if (payload && typeof payload.ackCursor === 'number') {
          ackCursorRef.current = Math.max(ackCursorRef.current, payload.ackCursor);
        }
        if (payload && typeof payload.retryMs === 'number' && payload.retryMs > 0) {
          streamRetryMsRef.current = payload.retryMs;
        }

        return;
      }

      if (event.event === 'log_entry' && payload && typeof payload === 'object') {
        const entry = payload.entry as SphereThreadEntry | undefined;
        if (entry?.ledgerEnvelope?.sequence) {
          upsertEntries([entry]);
          if (entry.clientEnvelope.intent.trim().toUpperCase() === 'LENS_UPGRADED') {
            const version = entry.payload.nextLensVersion;
            if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version.trim())) {
              setCycleCurrentLensVersion(version.trim());
            }
          }
          void ackEntry(threadId, entry);
        }
        return;
      }

      if (event.event === 'ack_entry' && payload && typeof payload === 'object') {
        const ack = payload.ack as SphereAckRecord | undefined;
        if (ack?.ackId) {
          upsertAcks([ack]);
        }
        return;
      }

      if (event.event === 'heartbeat') {
        setStreamHeartbeatAt(new Date().toISOString());
      }
    };

    streamCloseRef.current = await api.connectSphereThreadStream({
      threadId,
      cursor: replayCursorRef.current,
      ackCursor: ackCursorRef.current,
      onOpen: () => {
        setStreamState('live');
        reconnectAttemptRef.current = 0;
      },
      onEvent: handleStreamEvent,
      onError: (error) => {
        setStreamState('error');
        const message = error instanceof Error ? error.message : 'SSE stream failed.';
        setStreamError(message);
        applyCycleError(error, message);
        scheduleReconnect(threadId);
      },
      onClose: () => {
        if (manualStopRef.current) {
          setStreamState('offline');
          return;
        }

        setStreamState('offline');
        scheduleReconnect(threadId);
      }
    });
  }

  async function writeCycleEvent(eventType: SphereCycleEventType, payload: Record<string, unknown>) {
    const threadId = cycleThreadId ?? nextUuid();
    if (!cycleThreadId) {
      setCycleThreadId(threadId);
      replayCursorRef.current = 0;
      ackCursorRef.current = 0;
      setCycleEntries([]);
      setCycleAcks([]);
      setCycleMembers([]);
      setCycleInvites([]);
      setCycleCurrentLensVersion(null);
      setCycleAccessPrincipal(null);
      setCycleAccessRoleHint(null);
      resetStreamState();
    }

    const lastMessageId = cycleEntries[cycleEntries.length - 1]?.clientEnvelope.messageId;
    const response = await api.submitSphereCycleEvent({
      threadId,
      eventType,
      payload,
      idempotencyKey: `${eventType}-${Date.now()}`,
      causationId: lastMessageId ? [lastMessageId] : [],
      attestation: parseAttestationCsv(attestationCsv),
      prismHolderApproved: true
    });

    setCyclePhase(eventType);

    await syncReplay(threadId);
    await syncLensProgression(threadId);

    if (streamEnabled && streamState !== 'live') {
      void connectStream(threadId);
    }

    return { response, threadId };
  }

  async function handleTakeSeat() {
    if (!cycleEventsEnabled || writesBlocked || submittingCycle) {
      return;
    }

    setSubmittingCycle(true);
    setCycleError(null);
    setCycleNotice(null);

    try {
      const { threadId } = await writeCycleEvent('seat_taken', {
        objective: cycleObjective.trim(),
        actor: profile.username ? `@${profile.username}` : profile.firstName,
        at: new Date().toISOString()
      });
      await syncThreadAccess(threadId);
      triggerHaptic('notification_success');
      await refreshSphereBoundary();
    } catch (error) {
      triggerHaptic('notification_error');
      applyCycleError(error, 'Unable to take seat.');
    } finally {
      setSubmittingCycle(false);
    }
  }

  async function handleSubmitPerspectiveAndSynthesis() {
    if (!cycleEventsEnabled || writesBlocked || submittingCycle || !cyclePerspective.trim()) {
      return;
    }

    setSubmittingCycle(true);
    setCycleError(null);

    try {
      const perspectiveWrite = await writeCycleEvent('perspective_submitted', {
        content: cyclePerspective.trim(),
        at: new Date().toISOString()
      });

      let synthesized = cycleSynthesisDraft.trim();
      let lensName = allLenses.find((lens) => lens.id === selectedLensId)?.name ?? 'Selected Lens';

      if (!synthesized) {
        const drillResponse = await api.runDrill({
          question: `Objective: ${cycleObjective.trim()}\nPerspective: ${cyclePerspective.trim()}`,
          lensId: selectedLensId ?? undefined
        }) as {
          drill?: { hint?: string; lensName?: string };
          hapticTrigger?: string | null;
        };

        synthesized = drillResponse.drill?.hint?.trim() || 'Synthesis unavailable.';
        lensName = drillResponse.drill?.lensName ?? lensName;
        triggerHaptic(drillResponse.hapticTrigger);
      }

      setCycleSynthesisDraft(synthesized);

      await writeCycleEvent('synthesis_returned', {
        synthesis: synthesized,
        lensName,
        at: new Date().toISOString()
      });

      await syncThreadAccess(perspectiveWrite.threadId);
      triggerHaptic('notification_success');
      await refreshSphereBoundary();
    } catch (error) {
      triggerHaptic('notification_error');
      applyCycleError(error, 'Unable to submit perspective or synthesis.');
    } finally {
      setSubmittingCycle(false);
    }
  }

  async function handleAgentRelayMessage() {
    if (!messagesEnabled || writesBlocked || submittingCycle || !cycleThreadId || !agentRelayText.trim()) {
      return;
    }

    if (agentRelayTarget === 'custom' && !normalizedRelayTarget) {
      setCycleError('Add a custom relay target or switch target mode.');
      triggerHaptic('notification_warning');
      return;
    }

    setSubmittingCycle(true);
    setCycleError(null);

    try {
      const normalizedIntent = agentRelayIntent.trim().replace(/\s+/g, '_').toUpperCase() || 'AGENT_MESSAGE';
      const lastMessageId = cycleEntries[cycleEntries.length - 1]?.clientEnvelope.messageId;
      const rawText = agentRelayText.trim();
      const outboundText =
        normalizedRelayTarget && !rawText.toLowerCase().startsWith(normalizedRelayTarget.toLowerCase())
          ? `${normalizedRelayTarget} ${rawText}`
          : rawText;

      await api.submitSphereMessage({
        threadId: cycleThreadId,
        intent: normalizedIntent,
        payload: {
          text: outboundText,
          at: new Date().toISOString(),
          channel: 'agent_relay',
          relayTarget: normalizedRelayTarget,
          transportMode:
            agentRelayTransportMode === 'direct'
              ? 'sphere_direct'
              : 'sphere_direct_with_bot_bridge_hint'
        },
        causationId: lastMessageId ? [lastMessageId] : [],
        attestation: parseAttestationCsv(attestationCsv),
        prismHolderApproved: true
      });

      setAgentRelayText('');
      await syncReplay(cycleThreadId);
      await syncLensProgression(cycleThreadId);
      triggerHaptic('notification_success');
    } catch (error) {
      triggerHaptic('notification_error');
      applyCycleError(error, 'Unable to send agent relay message.');
    } finally {
      setSubmittingCycle(false);
    }
  }

  async function handleLensUpgrade() {
    if (!cycleEventsEnabled || writesBlocked || submittingCycle) {
      return;
    }

    setSubmittingCycle(true);
    setCycleError(null);

    try {
      const lensUpgradePayload: Record<string, unknown> = {
        note: lensUpgradeNote.trim() || null,
        activeLensId: profile.activeLensId ?? null,
        selectedLensId: effectiveLensId,
        at: new Date().toISOString()
      };

      if (recommendedLensUpgradeRule) {
        lensUpgradePayload.ruleId = recommendedLensUpgradeRule.ruleId;
        lensUpgradePayload.previousLensVersion = recommendedLensUpgradeRule.fromVersion;
        lensUpgradePayload.nextLensVersion = recommendedLensUpgradeRule.toVersion;
      }

      const { threadId } = await writeCycleEvent('lens_upgraded', {
        ...lensUpgradePayload
      });
      await syncThreadAccess(threadId);
      triggerHaptic('notification_success');
      await refreshSphereBoundary();
    } catch (error) {
      triggerHaptic('notification_error');
      applyCycleError(error, 'Unable to record lens upgrade.');
    } finally {
      setSubmittingCycle(false);
    }
  }

  async function handleManualReplaySync() {
    if (!cycleThreadId) return;
    await syncReplay(cycleThreadId);
    await syncLensProgression(cycleThreadId);
  }

  async function copyTextWithStatus(
    value: string,
    successMessage: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setInviteStatus(successMessage);
      triggerHaptic('notification_success');
    } catch {
      setInviteStatus(errorMessage);
      triggerHaptic('notification_warning');
    }
  }

  async function handleCopyCycleInvite(): Promise<void> {
    if (!cycleThreadId) {
      setInviteStatus('Start or join a thread before creating invites.');
      return;
    }

    try {
      const inviteResponse = await api.createSphereThreadInvite(cycleThreadId, {
        maxUses: 25,
        expiresInMinutes: 60 * 24 * 7
      });
      const inviteLink = buildCycleInviteUrl(inviteResponse.invite.inviteCode, botUsername);
      if (!inviteLink) {
        setInviteStatus('Invite link unavailable.');
        triggerHaptic('notification_warning');
        return;
      }

      setCycleInviteUrl(inviteLink);
      await navigator.clipboard.writeText(inviteLink);
      setInviteStatus('Invite link copied.');
      await syncThreadAccess(cycleThreadId);
      triggerHaptic('notification_success');
    } catch (error) {
      const message = error instanceof ApiRequestError ? error.message : 'Copy failed. Share the link manually.';
      setInviteStatus(message);
      triggerHaptic('notification_warning');
    }
  }

  async function handleCopyThreadId(): Promise<void> {
    if (!cycleThreadId) {
      setInviteStatus('Start or join a thread first.');
      triggerHaptic('notification_warning');
      return;
    }

    await copyTextWithStatus(cycleThreadId, 'Thread ID copied.', 'Unable to copy thread ID.');
  }

  async function handleCopyBotLinkCommand(): Promise<void> {
    if (!botLinkCommand) {
      setInviteStatus('Start or join a thread first.');
      triggerHaptic('notification_warning');
      return;
    }

    await copyTextWithStatus(botLinkCommand, 'Bot /link command copied.', 'Unable to copy /link command.');
  }

  async function handleCopyBotThreadCommand(): Promise<void> {
    await copyTextWithStatus('/thread', 'Bot /thread command copied.', 'Unable to copy /thread command.');
  }

  async function handleCopyBotUnlinkCommand(): Promise<void> {
    await copyTextWithStatus('/unlink', 'Bot /unlink command copied.', 'Unable to copy /unlink command.');
  }

  async function handleJoinCycleInviteByCode(): Promise<void> {
    const value = manualInviteCode.trim();
    if (isUuid(value)) {
      setCycleThreadId(value);
      setActiveTab('cycle');
      setManualInviteCode('');
      setInviteStatus('Joined thread by ID.');
      triggerHaptic('notification_success');
      return;
    }

    if (!isInviteCode(value)) {
      setInviteStatus('Enter a valid invite code or thread ID.');
      triggerHaptic('notification_warning');
      return;
    }

    setJoiningInvite(true);
    setInviteStatus('Joining thread from invite...');

    try {
      const response = await api.acceptSphereThreadInvite(value);
      setCycleThreadId(response.acceptance.threadId);
      setActiveTab('cycle');
      setManualInviteCode('');
      setInviteStatus('Joined thread from invite.');
      triggerHaptic('notification_success');
    } catch (error) {
      const message = error instanceof ApiRequestError ? error.message : 'Invite acceptance failed.';
      setInviteStatus(message);
      triggerHaptic('notification_warning');
    } finally {
      setJoiningInvite(false);
    }
  }

  function canRevokeInvite(invite: SphereThreadInvite): boolean {
    if (invite.revokedAt) {
      return false;
    }
    if (!cycleAccessPrincipal) {
      return false;
    }
    if (canManageMembers) {
      return true;
    }
    return invite.createdBy === cycleAccessPrincipal;
  }

  async function handleRevokeInvite(inviteCode: string): Promise<void> {
    if (!cycleThreadId) {
      return;
    }

    const invite = cycleInvites.find((candidate) => candidate.inviteCode === inviteCode);
    if (!invite) {
      setInviteStatus('Invite not found in current thread state.');
      triggerHaptic('notification_warning');
      return;
    }

    if (!canRevokeInvite(invite)) {
      setInviteStatus('Only owners or invite creators can revoke invites.');
      triggerHaptic('notification_warning');
      return;
    }

    const reasonInput =
      typeof window !== 'undefined'
        ? window.prompt('Optional revoke reason (for audit trail):', '') ?? null
        : null;
    if (reasonInput === null) {
      setInviteStatus('Invite revoke cancelled.');
      return;
    }
    const reason = reasonInput.trim();

    const actionKey = `revoke:${inviteCode}`;
    setAccessActionKey(actionKey);

    try {
      await api.revokeSphereThreadInvite(cycleThreadId, inviteCode, reason ? { reason } : undefined);
      await syncThreadAccess(cycleThreadId);
      setInviteStatus('Invite revoked.');
      triggerHaptic('notification_success');
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : 'Unable to revoke invite.';
      setInviteStatus(message);
      triggerHaptic('notification_warning');
    } finally {
      setAccessActionKey((existing) => (existing === actionKey ? null : existing));
    }
  }

  async function handleRemoveMember(memberPrincipal: string): Promise<void> {
    if (!cycleThreadId) {
      return;
    }

    if (!canManageMembers) {
      setInviteStatus('Only thread owners can remove members.');
      triggerHaptic('notification_warning');
      return;
    }

    const actionKey = `remove:${memberPrincipal}`;
    setAccessActionKey(actionKey);

    try {
      await api.removeSphereThreadMember(cycleThreadId, memberPrincipal);
      await syncThreadAccess(cycleThreadId);
      setInviteStatus('Member removed.');
      triggerHaptic('notification_success');
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : 'Unable to remove member.';
      setInviteStatus(message);
      triggerHaptic('notification_warning');
    } finally {
      setAccessActionKey((existing) => (existing === actionKey ? null : existing));
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const refreshApiKeyState = () => {
      setAgentApiKeyAttached(Boolean(readAgentApiKey()));
    };

    refreshApiKeyState();
    window.addEventListener('storage', refreshApiKeyState);
    window.addEventListener('focus', refreshApiKeyState);

    return () => {
      window.removeEventListener('storage', refreshApiKeyState);
      window.removeEventListener('focus', refreshApiKeyState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const inviteCode = readCycleInviteCodeFromSearch(window.location.search);
    if (inviteCode) {
      let cancelled = false;
      setActiveTab('cycle');
      setInviteStatus('Joining thread from invite...');

      void api
        .acceptSphereThreadInvite(inviteCode)
        .then((response) => {
          if (cancelled) {
            return;
          }

          setCycleThreadId((existing) => existing ?? response.acceptance.threadId);
          setInviteStatus('Joined thread from invite.');
          triggerHaptic('notification_success');
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setInviteStatus('Invite acceptance failed.');
          triggerHaptic('notification_warning');
        });

      return () => {
        cancelled = true;
      };
    }

    const inviteThreadId = readCycleThreadIdFromSearch(window.location.search);
    if (!inviteThreadId) {
      return;
    }

    setCycleThreadId((existing) => existing ?? inviteThreadId);
    setActiveTab('cycle');
  }, []);

  useEffect(() => {
    if (!cycleThreadId || typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const currentThread = url.searchParams.get('cycleThreadId');
    if (currentThread === cycleThreadId) {
      return;
    }

    url.searchParams.set('cycleThreadId', cycleThreadId);
    url.searchParams.delete('cycleInviteCode');
    url.searchParams.delete('cycle_invite_code');
    const next = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
    window.history.replaceState(null, '', next);
  }, [cycleThreadId]);

  useEffect(() => {
    if (!inviteStatus) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInviteStatus(null);
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inviteStatus]);

  useEffect(() => {
    setCycleInviteUrl(null);
  }, [cycleThreadId]);

  useEffect(() => {
    if (!cycleThreadId) {
      setCycleMembers([]);
      setCycleInvites([]);
      setCycleCurrentLensVersion(null);
      setCycleAccessPrincipal(null);
      setCycleAccessRoleHint(null);
      return;
    }

    setCycleCurrentLensVersion(null);
    void syncThreadAccess(cycleThreadId);
    void syncLensProgression(cycleThreadId);
  }, [cycleThreadId]);

  useEffect(() => {
    Promise.allSettled([
      api.getPassport(),
      api.getLenses(),
      api.getSphereCapabilities(),
      api.getSphereStatus(),
      api.getSphereLensUpgradeRules()
    ])
      .then(([passportResult, lensesResult, capabilitiesResult, statusResult, lensRulesResult]) => {
        if (passportResult.status === 'fulfilled') {
          setPassport(passportResult.value.passport);
        }

        if (lensesResult.status === 'fulfilled') {
          setAllLenses(lensesResult.value.lenses);
        }

        if (capabilitiesResult.status === 'fulfilled') {
          setSphereCapabilities(capabilitiesResult.value);
        }

        if (statusResult.status === 'fulfilled') {
          setSphereStatus(statusResult.value);
          if (statusResult.value.systemState === 'DEGRADED_NO_LLM') {
            setCycleNotice({
              kind: 'degraded',
              message:
                statusResult.value.degradedNoLlmReason ??
                'Sphere is in DEGRADED_NO_LLM mode. Model-dependent actions may be gated.'
            });
          } else if (statusResult.value.haltedThreads > 0) {
            setCycleNotice({
              kind: 'halted',
              message: `Detected ${statusResult.value.haltedThreads} halted thread(s). Write paths may be blocked.`
            });
          }
        }

        if (lensRulesResult.status === 'fulfilled') {
          setLensUpgradeRegistryVersion(lensRulesResult.value.registryVersion);
          setLensUpgradeRules(lensRulesResult.value.rules ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      if (streamCloseRef.current) {
        streamCloseRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!cycleThreadId || !streamEnabled) {
      return;
    }

    void connectStream(cycleThreadId);

    return () => {
      manualStopRef.current = true;
      if (streamCloseRef.current) {
        streamCloseRef.current();
        streamCloseRef.current = null;
      }
    };
  }, [cycleThreadId, streamEnabled]);

  const tabs: { id: Tab; icon: typeof Zap; label: string }[] = [
    { id: 'passport', icon: BookOpen, label: 'Passport' },
    { id: 'lenses', icon: Eye, label: 'Lenses' },
    { id: 'drill', icon: Dumbbell, label: 'Drill' },
    { id: 'cycle', icon: Orbit, label: 'Cycle' }
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4 pb-3 border-b border-forge/30">
        <Zap size={18} className="text-forge" />
        <h2 className="text-forge font-mono font-semibold tracking-wide">THE FORGE</h2>
      </div>

      <div className="flex-shrink-0 flex border-b border-white/10">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => {
              triggerHaptic('selection');
              setActiveTab(id);
            }}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors
              ${activeTab === id ? 'text-forge border-b-2 border-forge' : 'text-white/40 hover:text-white/70'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 scroll-area">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border border-forge rounded-sm animate-spin" />
          </div>
        )}

        {!loading && activeTab === 'passport' && passport && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Games Played', value: passport.stats.gamesPlayed },
                { label: 'Games Won', value: passport.stats.gamesWon },
                { label: 'CXP Total', value: passport.stats.cxpTotal.toLocaleString() },
                { label: 'Streak', value: passport.stats.currentStreak }
              ].map(({ label, value }) => (
                <div key={label} className="border border-forge/30 bg-forge/5 rounded-sm p-3">
                  <p className="text-forge text-lg font-mono font-bold">{value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">
                Earned Lenses ({passport.earnedLenses.length})
              </p>
              {passport.earnedLenses.length === 0 ? (
                <div className="border border-white/10 rounded-sm p-4 text-center">
                  <Sparkles size={24} className="text-white/20 mx-auto mb-2" />
                  <p className="text-white/40 text-xs">Win deliberations to earn lenses</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {passport.earnedLenses.map((lens) => (
                    <div
                      key={lens.id}
                      className="flex items-center gap-3 border border-white/10 rounded-sm p-3"
                      style={{ borderColor: `${lens.color.hex}40` }}
                    >
                      <div
                        className="w-8 h-8 rounded-sm flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                        style={{ backgroundColor: `${lens.color.hex}20`, color: lens.color.hex }}
                      >
                        {lens.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{lens.name}</p>
                        <p className="text-white/50 text-xs truncate">{lens.epistemology}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && activeTab === 'lenses' && (
          <div className="p-4 space-y-2">
            <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-3">
              Council of Twelve — All Lenses
            </p>
            {allLenses.map((lens) => {
              const isEarned = profile.earnedLenses.includes(lens.id);
              const isActive = profile.activeLensId === lens.id;
              return (
                <div
                  key={lens.id}
                  className={`flex items-center gap-3 border rounded-sm p-3 transition-colors ${
                    isActive ? 'border-forge bg-forge/10' : 'border-white/10 bg-void-light'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-sm flex items-center justify-center text-sm font-mono font-bold flex-shrink-0"
                    style={{ backgroundColor: `${lens.color.hex}20`, color: lens.color.hex }}
                  >
                    {lens.id.padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium">{lens.name}</p>
                      {isEarned && (
                        <span className="text-[9px] font-mono text-forge border border-forge/50 px-1 rounded-sm">
                          EARNED
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[9px] font-mono text-citadel border border-citadel/50 px-1 rounded-sm">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-white/50 text-xs truncate">{lens.epistemology}</p>
                    <p className="text-white/30 text-xs capitalize">{lens.family}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && activeTab === 'drill' && (
          <div className="p-4 space-y-4">
            <p className="text-white/60 text-xs">
              Practice deliberating on any question with a lens of your choice.
            </p>

            <div>
              <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Select Lens</p>
              <div className="grid grid-cols-4 gap-2">
                {allLenses.slice(0, 12).map((lens) => (
                  <button
                    key={lens.id}
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedLensId(lens.id);
                    }}
                    className={`
                      aspect-square rounded-sm flex items-center justify-center text-xs font-mono font-bold border transition-all
                      ${selectedLensId === lens.id ? 'border-forge scale-105' : 'border-white/20'}
                    `}
                    style={{
                      backgroundColor: selectedLensId === lens.id ? `${lens.color.hex}30` : `${lens.color.hex}10`,
                      color: lens.color.hex
                    }}
                    title={lens.name}
                  >
                    {lens.id.padStart(2, '0')}
                  </button>
                ))}
              </div>
              {selectedLensId && (
                <p className="text-white/50 text-xs mt-1">{allLenses.find((l) => l.id === selectedLensId)?.name}</p>
              )}
            </div>

            <div>
              <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Question</p>
              <textarea
                value={drillQuestion}
                onChange={(e) => setDrillQuestion(e.target.value)}
                placeholder="Enter a question to deliberate on..."
                rows={3}
                className="lf-input w-full bg-void-light border border-white/20 text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-forge/60 resize-none"
              />
            </div>

            <button
              onClick={async () => {
                if (!drillQuestion.trim()) return;
                setDrilling(true);
                setDrillResult(null);
                try {
                  const response = await api.runDrill({
                    question: drillQuestion,
                    lensId: selectedLensId ?? undefined
                  }) as {
                    drill?: DrillResultPayload;
                    hapticTrigger?: string | null;
                  };
                  triggerHaptic(response.hapticTrigger);
                  setDrillResult(response.drill ?? null);
                } catch (error) {
                  console.error(error);
                } finally {
                  setDrilling(false);
                }
              }}
              disabled={drilling || !drillQuestion.trim()}
              className="lf-button lf-button--primary w-full bg-forge text-void font-mono text-sm py-3 rounded-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {drilling ? (
                <>
                  <div className="w-4 h-4 border-2 border-void/40 border-t-void rounded-full animate-spin" />
                  THINKING...
                </>
              ) : (
                <>
                  <Dumbbell size={16} />
                  RUN DRILL
                </>
              )}
            </button>

            {drillResult && (
              <div className="territory-card lf-card border border-forge/40 bg-forge/5 rounded-sm p-4">
                <p className="text-forge text-xs font-mono uppercase tracking-wider mb-2">
                  {drillResult.lensName} says:
                </p>
                <p className="text-white text-sm leading-relaxed">{drillResult.hint}</p>
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'cycle' && (
          <div className="p-4 space-y-5">
            <div className="territory-card lf-card border border-engine/30 bg-engine/5 rounded-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-engine text-xs font-mono uppercase tracking-wider">Sphere Cycle Runtime</p>
                <span className="text-white/45 text-xs font-mono">thread: {cycleThreadId ?? 'not started'}</span>
              </div>

              <div className="territory-card lf-card border border-white/15 rounded-sm bg-void-light p-3 space-y-2">
                <p className="text-white/70 text-xs font-mono uppercase tracking-wider">Tonight Launch Checklist</p>
                <div data-testid="launch-step-api-key" className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/70">Attach agent API key (Engine Room)</span>
                  <span className={`font-mono ${agentApiKeyAttached ? 'text-engine' : 'text-white/45'}`}>
                    {agentApiKeyAttached ? 'DONE' : 'PENDING'}
                  </span>
                </div>
                <div data-testid="launch-step-thread" className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/70">Create or join shared thread</span>
                  <span className={`font-mono ${checklistThreadReady ? 'text-engine' : 'text-white/45'}`}>
                    {checklistThreadReady ? 'DONE' : 'PENDING'}
                  </span>
                </div>
                <div data-testid="launch-step-peer" className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/70">Bring at least one friend into thread</span>
                  <span className={`font-mono ${checklistPeerJoined ? 'text-engine' : 'text-white/45'}`}>
                    {checklistPeerJoined ? 'DONE' : 'PENDING'}
                  </span>
                </div>
                <div data-testid="launch-step-relay" className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/70">Exchange at least one agent message</span>
                  <span className={`font-mono ${checklistRelayReady ? 'text-engine' : 'text-white/45'}`}>
                    {checklistRelayReady ? 'DONE' : 'PENDING'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-white/45 text-xs font-mono">Join By Invite Code Or Thread ID</p>
                <div className="flex items-center gap-2">
                  <input
                    value={manualInviteCode}
                    onChange={(event) => setManualInviteCode(event.target.value)}
                    placeholder="Paste invite code or thread ID"
                    className="lf-input flex-1 bg-void-light border border-white/15 text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-engine/60 font-mono"
                  />
                  <button
                    onClick={() => {
                      void handleJoinCycleInviteByCode();
                    }}
                    disabled={joiningInvite || !manualInviteCode.trim()}
                    className="lf-button lf-button--secondary border border-engine/40 text-engine font-mono text-xs px-3 py-2 rounded-sm disabled:opacity-40"
                  >
                    {joiningInvite ? 'JOINING...' : 'JOIN'}
                  </button>
                </div>
              </div>

              {cycleThreadId && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        void handleCopyCycleInvite();
                      }}
                      className="lf-button lf-button--secondary border border-engine/40 text-engine font-mono text-xs px-3 py-2 rounded-sm"
                    >
                      COPY INVITE LINK
                    </button>
                    <button
                      onClick={() => {
                        void handleCopyThreadId();
                      }}
                      className="lf-button lf-button--secondary border border-engine/40 text-engine font-mono text-xs px-3 py-2 rounded-sm"
                    >
                      COPY THREAD ID
                    </button>
                    {!botUsername && (
                      <span className="text-white/35 text-xs">
                        Set `VITE_TMA_BOT_USERNAME` for Telegram deep links.
                      </span>
                    )}
                  </div>
                  {cycleInviteUrl && (
                    <input
                      value={cycleInviteUrl}
                      readOnly
                      className="lf-input w-full bg-void-light border border-white/15 text-white/60 text-xs px-3 py-2 rounded-sm font-mono"
                    />
                  )}
                </div>
              )}

              {inviteStatus && <p className="text-engine text-xs">{inviteStatus}</p>}

              {cycleThreadId && (
                <div className="territory-card lf-card border border-engine/30 bg-engine/5 rounded-sm p-4 space-y-3">
                  <p className="text-engine text-xs font-mono uppercase tracking-wider">
                    Connection Channels
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="territory-card lf-card border border-white/15 rounded-sm bg-void-light p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white/70 text-xs font-mono uppercase tracking-wider">
                          Direct Sphere Channel
                        </p>
                        <span
                          className={`text-xs font-mono ${
                            directChannelReady ? 'text-engine' : 'text-amber-300'
                          }`}
                        >
                          {directChannelReady ? 'SECURE + ACTIVE' : 'SETUP NEEDED'}
                        </span>
                      </div>
                      <p className="text-white/45 text-xs">
                        Web app writes straight to Sphere/DB through BFF + membership ACL. Telegram is optional.
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <p className="flex items-center justify-between gap-2">
                          <span className="text-white/60">API key attached</span>
                          <span className={`font-mono ${agentApiKeyAttached ? 'text-engine' : 'text-white/45'}`}>
                            {agentApiKeyAttached ? 'DONE' : 'PENDING'}
                          </span>
                        </p>
                        <p className="flex items-center justify-between gap-2">
                          <span className="text-white/60">Thread joined</span>
                          <span className={`font-mono ${cycleThreadId ? 'text-engine' : 'text-white/45'}`}>
                            {cycleThreadId ? 'DONE' : 'PENDING'}
                          </span>
                        </p>
                        <p className="flex items-center justify-between gap-2">
                          <span className="text-white/60">Membership principal</span>
                          <span className={`font-mono ${cycleAccessPrincipal ? 'text-engine' : 'text-white/45'}`}>
                            {cycleAccessPrincipal ? 'DETECTED' : 'UNSET'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="territory-card lf-card border border-white/15 rounded-sm bg-void-light p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white/70 text-xs font-mono uppercase tracking-wider">
                          Telegram Bot Bridge
                        </p>
                        <span
                          className={`text-xs font-mono ${
                            botUsername ? 'text-engine' : 'text-amber-300'
                          }`}
                        >
                          {botUsername ? 'READY TO LINK' : 'MANUAL MODE'}
                        </span>
                      </div>
                      <p className="text-white/45 text-xs">
                        Optional mirror for group/topic threads. Use bot commands to bind Telegram context to this thread.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            void handleCopyBotLinkCommand();
                          }}
                          className="lf-button lf-button--secondary border border-engine/40 text-engine font-mono text-xs px-3 py-2 rounded-sm"
                        >
                          COPY /LINK
                        </button>
                        <button
                          onClick={() => {
                            void handleCopyBotThreadCommand();
                          }}
                          className="lf-button lf-button--secondary border border-white/25 text-white/80 font-mono text-xs px-3 py-2 rounded-sm"
                        >
                          COPY /THREAD
                        </button>
                        <button
                          onClick={() => {
                            void handleCopyBotUnlinkCommand();
                          }}
                          className="lf-button lf-button--secondary border border-white/25 text-white/80 font-mono text-xs px-3 py-2 rounded-sm"
                        >
                          COPY /UNLINK
                        </button>
                      </div>
                      {botLinkCommand && (
                        <p className="text-white/35 text-xs font-mono truncate">{botLinkCommand}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-white/40">Sphere mode</p>
                  <p className="text-white font-mono">
                    {sphereStatus?.systemState ?? (sphereCapabilities ? 'ACTIVE' : 'unknown')}
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Stream</p>
                  <p className="text-white font-mono uppercase">{streamState}</p>
                </div>
                <div>
                  <p className="text-white/40">Entries</p>
                  <p className="text-white font-mono">{cycleEntryCount}</p>
                </div>
                <div>
                  <p className="text-white/40">Acks</p>
                  <p className="text-white font-mono">{cycleAckCount}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded-sm border font-mono ${
                    cycleEventsEnabled ? 'border-engine/40 text-engine' : 'border-white/20 text-white/40'
                  }`}
                >
                  cycleEvents
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-sm border font-mono ${
                    messagesEnabled ? 'border-engine/40 text-engine' : 'border-white/20 text-white/40'
                  }`}
                >
                  messages
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-sm border font-mono ${
                    replayEnabled ? 'border-engine/40 text-engine' : 'border-white/20 text-white/40'
                  }`}
                >
                  replay
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-sm border font-mono ${
                    streamEnabled ? 'border-engine/40 text-engine' : 'border-white/20 text-white/40'
                  }`}
                >
                  stream
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-sm border font-mono ${
                    ackEnabled ? 'border-engine/40 text-engine' : 'border-white/20 text-white/40'
                  }`}
                >
                  ack
                </span>
              </div>

              {streamHeartbeatAt && (
                <p className="text-white/40 text-xs font-mono">Last heartbeat: {streamHeartbeatAt}</p>
              )}
            </div>

            {cycleThreadId && (
              <div className="territory-card lf-card border border-white/10 rounded-sm p-4 bg-void-light space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white/50 text-xs font-mono uppercase tracking-wider">
                    Thread Access Controls
                  </p>
                  <button
                    onClick={() => {
                      void syncThreadAccess(cycleThreadId);
                    }}
                    disabled={syncingAccess}
                    className="lf-button lf-button--secondary border border-white/20 text-white/70 font-mono text-xs px-3 py-2 rounded-sm disabled:opacity-40"
                  >
                    {syncingAccess ? 'SYNCING...' : 'SYNC ACCESS'}
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-white/40 text-xs font-mono">
                    principal: {cycleAccessPrincipal ?? 'unavailable'}
                    {cycleAccessRole ? ` (${cycleAccessRole})` : ''}
                  </p>
                  {accessControlReason && (
                    <p className="text-amber-300/80 text-xs">{accessControlReason}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <p className="text-white/35 text-xs font-mono uppercase tracking-wider">
                      Members ({cycleMembers.length})
                    </p>
                    {cycleMembers.length === 0 ? (
                      <p className="text-white/35 text-xs">No members found.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {cycleMembers.map((member) => (
                          <div
                            key={member.principal}
                            className="border border-white/10 rounded-sm px-3 py-2 text-xs font-mono flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-white/75 truncate">{member.principal}</p>
                              <p className="text-white/35">{member.role}</p>
                            </div>
                            {member.role !== 'owner' && (
                              <button
                                onClick={() => {
                                  void handleRemoveMember(member.principal);
                                }}
                                disabled={Boolean(accessActionKey) || !canManageMembers}
                                className="border border-red-400/40 text-red-300 text-xs px-2 py-1 rounded-sm disabled:opacity-40"
                              >
                                {accessActionKey === `remove:${member.principal}` ? '...' : 'REMOVE'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-white/35 text-xs font-mono uppercase tracking-wider">
                      Invites ({cycleInvites.length})
                    </p>
                    {cycleInvites.length === 0 ? (
                      <p className="text-white/35 text-xs">No invites yet.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {cycleInvites.map((invite) => {
                          const revoked = Boolean(invite.revokedAt);
                          const actionKey = `revoke:${invite.inviteCode}`;
                          const canRevoke = canRevokeInvite(invite);

                          return (
                            <div
                              key={invite.inviteCode}
                              className="border border-white/10 rounded-sm px-3 py-2 text-xs font-mono space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-white/75 truncate">{invite.inviteCode}</p>
                                <span className={revoked ? 'text-red-300' : 'text-engine'}>
                                  {revoked ? 'revoked' : `${invite.remainingUses} left`}
                                </span>
                              </div>
                              {(invite.label || invite.purpose) && (
                                <p className="text-white/55">
                                  {invite.label ? `label: ${invite.label}` : ''}
                                  {invite.label && invite.purpose ? ' | ' : ''}
                                  {invite.purpose ? `purpose: ${invite.purpose}` : ''}
                                </p>
                              )}
                              <p className="text-white/35 truncate">created by {invite.createdBy}</p>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-white/35">
                                  used {invite.usedCount}/{invite.maxUses}
                                </p>
                                <p className="text-white/35">exp {formatIsoCompact(invite.expiresAt)}</p>
                                {!revoked && (
                                  <button
                                    onClick={() => {
                                      void handleRevokeInvite(invite.inviteCode);
                                    }}
                                    disabled={Boolean(accessActionKey) || !canRevoke}
                                    className="border border-red-400/40 text-red-300 text-xs px-2 py-1 rounded-sm disabled:opacity-40"
                                  >
                                    {accessActionKey === actionKey ? '...' : 'REVOKE'}
                                  </button>
                                )}
                              </div>
                              {revoked && (
                                <div className="space-y-0.5">
                                  <p className="text-red-200/80">
                                    revoked by {invite.revokedBy ?? 'unknown'} at {formatIsoCompact(invite.revokedAt)}
                                  </p>
                                  {invite.revocationReason && (
                                    <p className="text-red-200/70">reason: {invite.revocationReason}</p>
                                  )}
                                </div>
                              )}
                              {!revoked && !canRevoke && (
                                <p className="text-amber-300/70">
                                  Only owners or invite creators can revoke this invite.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {cycleNotice && (
              <div
                className={`border rounded-sm p-3 ${
                  cycleNotice.kind === 'halted'
                    ? 'border-red-500/50 bg-red-500/10'
                    : cycleNotice.kind === 'quorum'
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-orange-500/50 bg-orange-500/10'
                }`}
              >
                <div className="flex items-start gap-2">
                  {cycleNotice.kind === 'halted' ? (
                    <Lock size={14} className="text-red-300 mt-0.5" />
                  ) : (
                    <AlertTriangle size={14} className="text-amber-300 mt-0.5" />
                  )}
                  <div>
                    <p className="text-white text-xs font-mono uppercase tracking-wider">
                      {cycleNotice.kind === 'halted'
                        ? 'Halted'
                        : cycleNotice.kind === 'quorum'
                          ? 'Quorum Required'
                          : 'Degraded'}
                    </p>
                    <p className="text-white/80 text-xs mt-1">{cycleNotice.message}</p>
                    {cycleNotice.traceId && (
                      <p className="text-white/45 text-xs mt-1 font-mono">traceId: {cycleNotice.traceId}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {cycleError && (
              <div className="territory-card lf-card border border-red-500/40 bg-red-500/5 rounded-sm p-3">
                <p className="text-red-300 text-xs">{cycleError}</p>
              </div>
            )}

            {streamError && (
              <div className="territory-card lf-card border border-red-500/30 bg-red-500/5 rounded-sm p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-300 mt-0.5" />
                  <p className="text-red-300 text-xs">{streamError}</p>
                </div>
                <button
                  onClick={() => {
                    if (cycleThreadId) {
                      void connectStream(cycleThreadId);
                    }
                  }}
                  className="lf-button lf-button--secondary text-xs font-mono border border-red-400/40 text-red-200 px-3 py-2 rounded-sm"
                >
                  RETRY
                </button>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                Cycle Objective
              </label>
              <textarea
                value={cycleObjective}
                onChange={(event) => setCycleObjective(event.target.value)}
                rows={2}
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-forge/60 resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                Attestations (comma-separated DIDs)
              </label>
              <input
                value={attestationCsv}
                onChange={(event) => setAttestationCsv(event.target.value)}
                placeholder="did:key:z... , did:key:z..."
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-forge/60"
              />
            </div>

            <button
              onClick={handleTakeSeat}
              disabled={submittingCycle || !cycleEventsEnabled || writesBlocked}
              className="lf-button lf-button--primary w-full bg-forge text-void font-mono text-sm py-2.5 rounded-sm font-bold disabled:opacity-50"
            >
              {submittingCycle ? 'WORKING...' : cyclePhase ? 'TAKE SEAT (NEW ROUND)' : 'TAKE SEAT'}
            </button>

            <div className="space-y-2">
              <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                Perspective
              </label>
              <textarea
                value={cyclePerspective}
                onChange={(event) => setCyclePerspective(event.target.value)}
                placeholder="Enter your perspective for this cycle"
                rows={3}
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-forge/60 resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                Synthesis Draft (optional override)
              </label>
              <textarea
                value={cycleSynthesisDraft}
                onChange={(event) => setCycleSynthesisDraft(event.target.value)}
                placeholder="Leave blank to auto-generate via drill"
                rows={3}
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-forge/60 resize-y"
              />
            </div>

            <button
              onClick={handleSubmitPerspectiveAndSynthesis}
              disabled={submittingCycle || !cycleEventsEnabled || writesBlocked || !cyclePerspective.trim()}
              className="lf-button lf-button--secondary w-full border border-forge/50 text-forge font-mono text-xs py-2.5 rounded-sm disabled:opacity-40"
            >
              SUBMIT PERSPECTIVE + RECORD SYNTHESIS
            </button>

            <div className="territory-card lf-card border border-engine/20 bg-engine/5 rounded-sm p-4 space-y-3">
              <p className="text-engine text-xs font-mono uppercase tracking-wider">
                Agent Relay
              </p>
              <p className="text-white/55 text-xs">
                Use this thread as the control bus for API-key agents. Direct mode bypasses Telegram transport.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                    Target
                  </label>
                  <select
                    value={agentRelayTarget}
                    onChange={(event) => setAgentRelayTarget(event.target.value as RelayTarget)}
                    className="lf-input w-full bg-void-light border border-white/15 text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-engine/60 font-mono"
                  >
                    <option value="none">No Prefix</option>
                    <option value="friend">@friend</option>
                    <option value="owner">@owner</option>
                    <option value="custom">Custom...</option>
                  </select>
                  {agentRelayTarget === 'custom' && (
                    <input
                      value={agentRelayTargetCustomValue}
                      onChange={(event) => setAgentRelayTargetCustomValue(event.target.value)}
                      placeholder="@max_agent"
                      className="lf-input w-full bg-void-light border border-white/15 text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-engine/60 font-mono"
                    />
                  )}
                  <p className="text-white/35 text-xs">
                    {normalizedRelayTarget
                      ? `Messages auto-prefix with ${normalizedRelayTarget}.`
                      : 'No target prefix applied.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                    Transport
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAgentRelayTransportMode('direct')}
                      className={`lf-button lf-button--secondary flex-1 border font-mono text-xs px-3 py-2 rounded-sm ${
                        agentRelayTransportMode === 'direct'
                          ? 'border-engine/50 text-engine'
                          : 'border-white/20 text-white/60'
                      }`}
                    >
                      DIRECT
                    </button>
                    <button
                      onClick={() => setAgentRelayTransportMode('bridge_hint')}
                      className={`lf-button lf-button--secondary flex-1 border font-mono text-xs px-3 py-2 rounded-sm ${
                        agentRelayTransportMode === 'bridge_hint'
                          ? 'border-engine/50 text-engine'
                          : 'border-white/20 text-white/60'
                      }`}
                    >
                      BOT MIRROR HINT
                    </button>
                  </div>
                  <p className="text-white/35 text-xs">
                    {agentRelayTransportMode === 'direct'
                      ? 'Direct mode writes only to Sphere/DB thread.'
                      : 'Adds bridge metadata for bot-linked contexts.'}
                  </p>
                </div>
              </div>
              <input
                value={agentRelayIntent}
                onChange={(event) => setAgentRelayIntent(event.target.value)}
                placeholder="AGENT_MESSAGE"
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-engine/60 font-mono"
              />
              <textarea
                value={agentRelayText}
                onChange={(event) => setAgentRelayText(event.target.value)}
                placeholder="Send an agent message to this thread"
                rows={2}
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-engine/60 resize-y"
              />
              <button
                onClick={handleAgentRelayMessage}
                disabled={submittingCycle || !messagesEnabled || writesBlocked || !cycleThreadId || !agentRelayText.trim()}
                className="lf-button lf-button--secondary w-full border border-engine/50 text-engine font-mono text-xs py-2.5 rounded-sm disabled:opacity-40"
              >
                SEND AGENT MESSAGE
              </button>
              {!directChannelReady && (
                <p className="text-amber-300/80 text-xs">
                  Direct secure channel is not fully ready yet. Attach API key and sync thread membership.
                </p>
              )}
              {!messagesEnabled && (
                <p className="text-amber-300/80 text-xs">
                  Sphere message writes are currently disabled by capability flags.
                </p>
              )}
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {agentRelayEntries.length === 0 ? (
                  <p className="text-white/35 text-xs">No agent relay entries yet.</p>
                ) : (
                  agentRelayEntries.slice(-6).map((entry) => (
                    <div
                      key={`relay-${entry.clientEnvelope.messageId}-${entry.ledgerEnvelope.sequence}`}
                      className="border border-white/10 rounded-sm px-3 py-2"
                    >
                      <p className="text-white/70 text-xs font-mono">
                        #{entry.ledgerEnvelope.sequence} {entry.clientEnvelope.intent}
                      </p>
                      <p className="text-white/60 text-xs truncate">
                        {summarizeAgentPayload(entry.payload)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="territory-card lf-card border border-engine/20 bg-engine/5 rounded-sm p-4 space-y-2">
              <p className="text-engine text-xs font-mono uppercase tracking-wider">
                Lens Progression Rule Binding
              </p>
              <p className="text-white/55 text-xs font-mono">
                current version: {effectiveCurrentLensVersion} | registry: {lensUpgradeRegistryVersion ?? 'unknown'}
              </p>
              {recommendedLensUpgradeRule ? (
                <p className="text-white/75 text-xs">
                  {recommendedLensUpgradeRule.ruleId}: {recommendedLensUpgradeRule.fromVersion} -&gt;{' '}
                  {recommendedLensUpgradeRule.toVersion}
                </p>
              ) : (
                <p className="text-amber-300/80 text-xs">
                  No matching rule for {effectiveCurrentLensVersion}. Upgrade will submit without rule tuple.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-white/50 text-xs font-mono uppercase tracking-wider">
                Lens Upgrade Note
              </label>
              <textarea
                value={lensUpgradeNote}
                onChange={(event) => setLensUpgradeNote(event.target.value)}
                placeholder="What changed in your lens after this cycle?"
                rows={2}
                className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm outline-none focus:border-forge/60 resize-y"
              />
            </div>

            <button
              onClick={handleLensUpgrade}
              disabled={submittingCycle || !cycleEventsEnabled || writesBlocked}
              className="lf-button lf-button--secondary w-full border border-engine/50 text-engine font-mono text-xs py-2.5 rounded-sm disabled:opacity-40"
            >
              RECORD LENS UPGRADE
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleManualReplaySync}
                disabled={!cycleThreadId || syncingReplay}
                className="lf-button lf-button--secondary border border-white/20 text-white/80 font-mono text-xs py-2.5 rounded-sm disabled:opacity-40 flex items-center justify-center gap-1"
              >
                <RefreshCw size={11} className={syncingReplay ? 'animate-spin' : ''} />
                SYNC REPLAY
              </button>
              {streamState === 'live' ? (
                <button
                  onClick={stopStream}
                  className="lf-button lf-button--secondary border border-amber-400/50 text-amber-200 font-mono text-xs py-2.5 rounded-sm flex items-center justify-center gap-1"
                >
                  <Radio size={11} />
                  STOP STREAM
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (cycleThreadId) {
                      void connectStream(cycleThreadId);
                    }
                  }}
                  disabled={!cycleThreadId || !streamEnabled}
                  className="lf-button lf-button--secondary border border-engine/50 text-engine font-mono text-xs py-2.5 rounded-sm disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <Radio size={11} />
                  START STREAM
                </button>
              )}
            </div>

            <div className="territory-card lf-card border border-white/10 rounded-sm p-4 bg-void-light">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/50 text-xs font-mono uppercase tracking-wider">Cycle Replay</p>
                <p className="text-white/30 text-xs font-mono">
                  cursor {replayCursorRef.current} / ack {ackCursorRef.current}
                </p>
              </div>

              {cycleEntries.length === 0 ? (
                <p className="text-white/40 text-xs">No cycle entries yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {cycleEntries.map((entry) => {
                    const sequence = entry.ledgerEnvelope.sequence;
                    const mappedEvent = intentToCycleEvent(entry.clientEnvelope.intent);
                    const acknowledged = cycleAcks.some((ack) => ack.targetSequence === sequence);

                    return (
                      <div key={`${entry.clientEnvelope.messageId}-${sequence}`} className="border border-white/10 rounded-sm p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-engine text-xs font-mono">#{sequence}</span>
                            <p className="text-white text-xs truncate">
                              {mappedEvent ? cycleEventLabel(mappedEvent) : entry.clientEnvelope.intent}
                            </p>
                          </div>
                          {acknowledged ? (
                            <span className="text-xs text-engine font-mono flex items-center gap-1">
                              <CheckCircle2 size={11} /> ACK
                            </span>
                          ) : (
                            <span className="text-xs text-white/35 font-mono">pending ack</span>
                          )}
                        </div>
                        <p className="text-white/35 text-xs font-mono mt-1 truncate">
                          {entry.clientEnvelope.messageId}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="territory-card lf-card border border-white/10 rounded-sm p-4 bg-void-light">
              <p className="text-white/50 text-xs font-mono uppercase tracking-wider mb-2">Latest ACKs</p>
              {cycleAcks.length === 0 ? (
                <p className="text-white/40 text-xs">No acknowledgements yet.</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                  {cycleAcks.slice(-10).map((ack) => (
                    <div key={ack.ackId} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-white/60">ack#{ack.ackId}</span>
                      <span className="text-engine">seq {ack.targetSequence}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-white/35 font-mono space-y-2">
              <p>Phase: {cyclePhase ? cycleEventLabel(cyclePhase) : 'not started'}</p>
              <p>Writes blocked: {writesBlocked ? 'yes' : 'no'}</p>
              <p>Syncing replay: {syncingReplay ? 'yes' : 'no'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
