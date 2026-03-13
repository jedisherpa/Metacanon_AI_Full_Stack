import { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  Activity,
  Database,
  BookOpen,
  List,
  Terminal,
  Search,
  Play,
  Link2,
  Check,
  AlertTriangle
} from 'lucide-react';
import {
  api,
  ApiRequestError,
  type EngineRoomRedTeamReportResponse,
  type EngineRoomRedTeamTrendPoint,
  type RuntimeBridgeState,
  type RuntimeComputeOption,
  type RuntimeHealth,
  type SphereCapabilities,
  type SphereStatus
} from '../lib/api';
import {
  commandCatalog,
  commandCatalogById,
  getOpenClawCommandId,
  resolveCommandIdFromValue,
  type CommandDefinition
} from '../lib/commands';
import { getTelegramStartParam, triggerHaptic } from '../lib/telegram';
import { clearAgentApiKey, readAgentApiKey, saveAgentApiKey } from '../lib/agentApiKey';
import { clearControlApiKey, readControlApiKey, saveControlApiKey } from '../lib/controlApiKey';

type Tab = 'status' | 'db' | 'glossary' | 'constellations' | 'commands';
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type Props = {
  defaultTab?: Tab;
};

type CommandErrorState = {
  kind: 'degraded' | 'halted' | 'quorum' | 'auth' | 'generic';
  message: string;
  code?: string;
  retryable?: boolean;
  traceId?: string;
};

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholderTokenRegex = /\{([a-zA-Z0-9_]+)\}/g;

function isSphereBoundaryPath(path: string): boolean {
  return (
    path.startsWith('/api/v1/sphere/') ||
    path === '/api/v1/sphere' ||
    path.startsWith('/api/v1/c2/') ||
    path === '/api/v1/c2' ||
    path === '/api/v1/threads/halt-all'
  );
}

function isTemplateUuid(value: string): boolean {
  if (!uuidV4LikeRegex.test(value)) {
    return false;
  }

  const normalized = value.toLowerCase();
  const repeatedPatterns = [
    /^11111111-1111-4111-8111-111111111111$/,
    /^22222222-2222-4222-8222-222222222222$/,
    /^33333333-3333-4333-8333-333333333333$/,
    /^44444444-4444-4444-8444-444444444444$/,
    /^55555555-5555-4555-8555-555555555555$/,
    /^aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa$/,
    /^bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb$/,
    /^cccccccc-cccc-4ccc-8ccc-cccccccccccc$/,
    /^dddddddd-dddd-4ddd-8ddd-dddddddddddd$/
  ];

  return repeatedPatterns.some((pattern) => pattern.test(normalized));
}

function extractPlaceholderTokens(value: string): string[] {
  return Array.from(value.matchAll(placeholderTokenRegex))
    .map((match) => match[1])
    .filter((token): token is string => Boolean(token));
}

function collectStringLeaves(value: unknown, path: string, out: Array<{ path: string; value: string }>): void {
  if (typeof value === 'string') {
    out.push({ path, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringLeaves(item, `${path}[${index}]`, out));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      collectStringLeaves(nested, `${path}.${key}`, out);
    });
  }
}

function hasObjectField(value: Record<string, unknown> | undefined, field: string): boolean {
  if (!value) {
    return false;
  }

  if (!(field in value)) {
    return false;
  }

  const fieldValue = value[field];
  if (typeof fieldValue === 'string') {
    return fieldValue.trim().length > 0;
  }

  if (Array.isArray(fieldValue)) {
    return true;
  }

  return fieldValue !== undefined && fieldValue !== null;
}

function collectWriteEnvelopeIssues(params: {
  method: HttpMethod;
  path: string;
  body: Record<string, unknown> | undefined;
}): string[] {
  const method = params.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return [];
  }

  const path = params.path;
  const body = params.body;
  const issues: string[] = [];
  const requireField = (field: string) => {
    if (!hasObjectField(body, field)) {
      issues.push(`body.${field} is required.`);
    }
  };
  const requireAnyField = (fields: string[]) => {
    if (fields.some((field) => hasObjectField(body, field))) {
      return;
    }
    issues.push(`body must include one of: ${fields.join(', ')}.`);
  };

  if (path === '/api/v1/sphere/cycle-events' || path === '/api/v1/c2/cycle-events') {
    requireField('threadId');
    requireField('messageId');
    requireField('traceId');
    requireField('eventType');
    requireField('attestation');
    requireField('schemaVersion');
    requireField('agentSignature');
  }

  if (path === '/api/v1/sphere/messages' || path === '/api/v1/c2/messages') {
    requireField('threadId');
    requireField('messageId');
    requireField('traceId');
    requireField('intent');
    requireField('attestation');
    requireField('schemaVersion');
    requireField('agentSignature');
  }

  if (path === '/api/v1/sphere/missions' || path === '/api/v1/c2/missions') {
    requireAnyField(['threadId', 'missionId']);
    requireField('messageId');
    requireField('traceId');
    requireField('intent');
    requireField('attestation');
    requireField('schemaVersion');
    requireField('agentSignature');
  }

  if (
    (path.startsWith('/api/v1/sphere/threads/') && path.endsWith('/ack')) ||
    (path.startsWith('/api/v1/c2/threads/') && path.endsWith('/ack'))
  ) {
    requireField('traceId');
    requireField('intent');
    requireField('attestation');
    requireField('schemaVersion');
    requireField('agentSignature');
    requireAnyField(['targetSequence', 'targetMessageId']);
  }

  if (
    path === '/api/v1/sphere/halt-all' ||
    path === '/api/v1/c2/halt-all' ||
    path === '/api/v1/threads/halt-all'
  ) {
    requireField('messageId');
    requireField('traceId');
    requireField('intent');
    requireField('attestation');
    requireField('schemaVersion');
    requireField('agentSignature');
  }

  if (body && 'attestation' in body && !Array.isArray(body.attestation)) {
    issues.push('body.attestation must be an array.');
  }

  return issues;
}

function preflightSphereTemplate(params: {
  method: HttpMethod;
  path: string;
  query: Record<string, unknown> | undefined;
  body: Record<string, unknown> | undefined;
}): string[] {
  if (!isSphereBoundaryPath(params.path)) {
    return [];
  }

  const issues: string[] = [];
  const leaves: Array<{ path: string; value: string }> = [{ path: 'path', value: params.path }];
  collectStringLeaves(params.query, 'query', leaves);
  collectStringLeaves(params.body, 'body', leaves);

  if (params.method !== 'GET' && !params.body) {
    issues.push('Body JSON is required for non-GET Sphere writes.');
  }

  const writeEnvelopeIssues = collectWriteEnvelopeIssues({
    method: params.method,
    path: params.path,
    body: params.body
  });
  issues.push(...writeEnvelopeIssues);

  for (const leaf of leaves) {
    const raw = leaf.value;
    const value = raw.trim();
    if (!value) continue;

    const placeholders = extractPlaceholderTokens(value);
    if (placeholders.length > 0) {
      const tokenList = placeholders.map((token) => `{${token}}`).join(', ');
      issues.push(`${leaf.path} has unresolved placeholders: ${tokenList}.`);
      continue;
    }

    const normalized = value.toLowerCase();
    if (
      normalized === 'compact-jws-signature' ||
      normalized === 'did:key:zyouragentdid' ||
      normalized.includes('youragentdid') ||
      normalized.includes('replace-me') ||
      normalized.includes('<threadid>')
    ) {
      issues.push(`${leaf.path} contains a template placeholder value.`);
      continue;
    }

    if (isTemplateUuid(value)) {
      issues.push(`${leaf.path} uses an obvious template UUID. Replace with a real UUID.`);
      continue;
    }

    if (
      (leaf.path.endsWith('.traceId') ||
        leaf.path.endsWith('.messageId') ||
        leaf.path.endsWith('.threadId') ||
        leaf.path.endsWith('.missionId') ||
        leaf.path.endsWith('.ackMessageId') ||
        leaf.path.endsWith('.targetMessageId')) &&
      !uuidV4LikeRegex.test(value)
    ) {
      issues.push(`${leaf.path} must be a UUID value.`);
      continue;
    }

    if (leaf.path.endsWith('.agentSignature') && !value.includes('.')) {
      issues.push(`${leaf.path} must be a compact JWS string.`);
      continue;
    }
  }

  return issues;
}

function resolveCommandPath(
  command: CommandDefinition,
  query: Record<string, unknown> | undefined,
  body: Record<string, unknown> | undefined
): {
  path: string;
  query?: Record<string, unknown>;
} {
  if (!command.pathParams || command.pathParams.length === 0) {
    return { path: command.path, query };
  }

  const queryDraft = { ...(query ?? {}) };
  let resolvedPath = command.path;

  for (const paramName of command.pathParams) {
    const fromQuery = queryDraft[paramName];
    const fromBody = body?.[paramName];
    const value = fromQuery ?? fromBody;

    if (value === undefined || value === null || String(value).trim().length === 0) {
      throw new Error(`Missing path parameter: ${paramName}.`);
    }

    resolvedPath = resolvedPath.replace(`:${paramName}`, encodeURIComponent(String(value)));
    delete queryDraft[paramName];
  }

  return {
    path: resolvedPath,
    query: Object.keys(queryDraft).length > 0 ? queryDraft : undefined
  };
}

type SphereQuickTemplate = {
  id: string;
  label: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

function parseJsonObject(value: string, label: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function resolveCommandId(rawId: string | null): string | null {
  if (!rawId) return null;
  if (commandCatalogById[rawId]) return rawId;
  return resolveCommandIdFromValue(rawId);
}

function toTemplateString(template?: Record<string, unknown>): string {
  return JSON.stringify(template ?? {}, null, 2);
}

const sphereQuickTemplates: SphereQuickTemplate[] = [
  {
    id: 'sphere_capabilities',
    label: 'Capabilities',
    method: 'GET',
    path: '/api/v1/sphere/capabilities',
    query: {}
  },
  {
    id: 'sphere_status',
    label: 'Status',
    method: 'GET',
    path: '/api/v1/sphere/status',
    query: {}
  },
  {
    id: 'sphere_lens_upgrade_rules',
    label: 'Lens Rules',
    method: 'GET',
    path: '/api/v1/sphere/lens-upgrade-rules',
    query: {}
  },
  {
    id: 'sphere_cycle_event',
    label: 'Cycle Event',
    method: 'POST',
    path: '/api/v1/sphere/cycle-events',
    body: {
      threadId: '{threadId}',
      messageId: '22222222-2222-4222-8222-222222222222',
      traceId: '33333333-3333-4333-8333-333333333333',
      authorAgentId: 'did:key:zYourAgentDid',
      eventType: 'seat_taken',
      attestation: [],
      schemaVersion: '3.0',
      protocolVersion: '3.0',
      causationId: [],
      agentSignature: '{agentSignature}',
      payload: {
        seatId: 'seat-1'
      }
    }
  },
  {
    id: 'sphere_message',
    label: 'Message',
    method: 'POST',
    path: '/api/v1/sphere/messages',
    body: {
      threadId: '{threadId}',
      messageId: '22222222-2222-4222-8222-222222222222',
      traceId: '33333333-3333-4333-8333-333333333333',
      authorAgentId: 'did:key:zYourAgentDid',
      intent: 'AGENT_MESSAGE',
      attestation: [],
      schemaVersion: '3.0',
      protocolVersion: '3.0',
      causationId: [],
      agentSignature: '{agentSignature}',
      payload: {
        text: 'Hello from my agent'
      }
    }
  },
  {
    id: 'sphere_replay',
    label: 'Replay',
    method: 'GET',
    path: '/api/v1/sphere/threads/{threadId}/replay',
    query: {
      cursor: 0
    }
  },
  {
    id: 'sphere_lens_progression',
    label: 'Lens Progression',
    method: 'GET',
    path: '/api/v1/sphere/threads/{threadId}/lens-progression',
    query: {}
  },
  {
    id: 'sphere_stream',
    label: 'Stream',
    method: 'GET',
    path: '/api/v1/sphere/threads/{threadId}/stream',
    query: {
      cursor: 0,
      ack_cursor: 0
    }
  },
  {
    id: 'sphere_acks',
    label: 'Acks',
    method: 'GET',
    path: '/api/v1/sphere/threads/{threadId}/acks',
    query: {
      cursor: 0,
      limit: 100
    }
  },
  {
    id: 'sphere_ack_write',
    label: 'Ack Write',
    method: 'POST',
    path: '/api/v1/sphere/threads/{threadId}/ack',
    body: {
      actorDid: 'did:key:zYourAgentDid',
      targetSequence: 1,
      targetMessageId: '22222222-2222-4222-8222-222222222222',
      ackMessageId: '44444444-4444-4444-8444-444444444444',
      traceId: '55555555-5555-4555-8555-555555555555',
      intent: 'ACK_ENTRY',
      schemaVersion: '3.0',
      attestation: [],
      agentSignature: '{agentSignature}',
      receivedAt: '2026-02-26T00:00:00.000Z'
    }
  },
  {
    id: 'sphere_members',
    label: 'Members',
    method: 'GET',
    path: '/api/v1/sphere/threads/{threadId}/members',
    query: {
      limit: 100
    }
  },
  {
    id: 'sphere_invite_create',
    label: 'Create Invite',
    method: 'POST',
    path: '/api/v1/sphere/threads/{threadId}/invites',
    body: {
      maxUses: 25,
      expiresInMinutes: 10080
    }
  },
  {
    id: 'sphere_invite_accept',
    label: 'Accept Invite',
    method: 'POST',
    path: '/api/v1/sphere/invites/{inviteCode}/accept',
    body: {}
  },
  {
    id: 'sphere_invites',
    label: 'Invites',
    method: 'GET',
    path: '/api/v1/sphere/threads/{threadId}/invites',
    query: {
      limit: 100,
      includeRevoked: false
    }
  },
  {
    id: 'sphere_invite_revoke',
    label: 'Revoke Invite',
    method: 'POST',
    path: '/api/v1/sphere/threads/{threadId}/invites/{inviteCode}/revoke',
    body: {
      reason: 'membership rotation'
    }
  },
  {
    id: 'sphere_member_remove',
    label: 'Remove Member',
    method: 'DELETE',
    path: '/api/v1/sphere/threads/{threadId}/members/{memberPrincipal}',
    body: {}
  }
];

const commandDraftStorageKey = 'open_claw_command_drafts_v1';

type CommandDraft = {
  query?: string;
  body?: string;
};

type CommandDraftMap = Record<string, CommandDraft>;

function readCommandDrafts(): CommandDraftMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(commandDraftStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as CommandDraftMap;
  } catch {
    return {};
  }
}

function writeCommandDrafts(drafts: CommandDraftMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(commandDraftStorageKey, JSON.stringify(drafts));
  } catch {
    // Ignore storage failures (private mode/disabled storage).
  }
}

function classifyCommandError(error: unknown): CommandErrorState {
  if (error instanceof ApiRequestError) {
    const code = error.code ?? '';
    const kind: CommandErrorState['kind'] =
      code === 'DEGRADED_NO_LLM' || code === 'INTENT_BLOCKED_IN_DEGRADED_MODE'
        ? 'degraded'
        : code === 'THREAD_HALTED'
          ? 'halted'
          : code === 'STM_ERR_MISSING_ATTESTATION' || code === 'PRISM_HOLDER_APPROVAL_REQUIRED'
            ? 'quorum'
            : error.status === 401 ||
                error.status === 403 ||
                code === 'SPHERE_ERR_AUTH_REQUIRED' ||
                code === 'SPHERE_ERR_AUTH_INVALID' ||
                code === 'SPHERE_ERR_INVALID_TOKEN' ||
                code === 'SPHERE_ERR_TMA_DIRECT_FORBIDDEN' ||
                code === 'SPHERE_ERR_SIGNER_KEY_REQUIRED' ||
                code === 'BFF_ERR_AGENT_API_KEY_REQUIRED' ||
                code === 'BFF_ERR_AGENT_API_KEY_INVALID' ||
                code === 'BFF_ERR_AGENT_API_KEY_CONFIG_MISSING' ||
                code === 'BFF_ERR_THREAD_ACCESS_DENIED' ||
                code === 'STM_ERR_INVALID_SIGNATURE'
              ? 'auth'
              : 'generic';

    return {
      kind,
      message: error.message || 'Command execution failed.',
      code: error.code,
      retryable: error.retryable,
      traceId: error.traceId
    };
  }

  return {
    kind: 'generic',
    message: error instanceof Error ? error.message : 'Command execution failed.'
  };
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatAttackClass(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(' ');
}

function buildSparklinePoints(values: number[], width: number, height: number, padding = 8): string {
  if (values.length === 0) {
    return '';
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = padding + (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth);
      const normalized = (value - minValue) / range;
      const y = height - padding - normalized * usableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

function formatChartMetric(value: number | null, formatter: (value: number) => string): string {
  if (value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return formatter(value);
}

function RedTeamSparkline(props: {
  title: string;
  subtitle: string;
  series: EngineRoomRedTeamTrendPoint[];
  valueAccessor: (point: EngineRoomRedTeamTrendPoint) => number | null;
  formatter: (value: number) => string;
  stroke: string;
}) {
  const values = props.series
    .map((point) => props.valueAccessor(point))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return (
      <div className="border border-white/10 rounded-sm px-2 py-2 bg-white/[0.03]">
        <p className="text-white/80 text-[11px] font-mono">{props.title}</p>
        <p className="text-white/40 text-[10px]">{props.subtitle}</p>
        <p className="text-white/35 text-[10px] mt-2">No chartable run history yet.</p>
      </div>
    );
  }

  const points = buildSparklinePoints(values, 220, 68);
  const latestValue = values.length > 0 ? values[values.length - 1] : null;
  const peakValue = Math.max(...values);

  return (
    <div className="border border-white/10 rounded-sm px-2 py-2 bg-white/[0.03] space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white/80 text-[11px] font-mono">{props.title}</p>
          <p className="text-white/40 text-[10px]">{props.subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-white text-[11px] font-mono">
            {formatChartMetric(latestValue, props.formatter)}
          </p>
          <p className="text-white/35 text-[10px] font-mono">
            peak {formatChartMetric(peakValue, props.formatter)}
          </p>
        </div>
      </div>
      <svg viewBox="0 0 220 68" className="w-full h-[68px] rounded-sm bg-white/[0.02]" aria-hidden="true">
        <polyline
          fill="none"
          points={points}
          stroke={props.stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function EngineRoomPage({ defaultTab = 'status' }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [status, setStatus] = useState<any>({});
  const [sphereStatus, setSphereStatus] = useState<SphereStatus | null>(null);
  const [sphereCapabilities, setSphereCapabilities] = useState<SphereCapabilities | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [runtimeBridgeState, setRuntimeBridgeState] = useState<RuntimeBridgeState | null>(null);
  const [runtimeComputeOptions, setRuntimeComputeOptions] = useState<RuntimeComputeOption[]>([]);
  const [runtimeCommunicationStatus, setRuntimeCommunicationStatus] =
    useState<Record<string, unknown> | null>(null);
  const [redTeamReport, setRedTeamReport] = useState<EngineRoomRedTeamReportResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<any>(null);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [constellations, setConstellations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [commandFilter, setCommandFilter] = useState('');
  const [selectedCommandId, setSelectedCommandId] = useState('open_claw');
  const [customRequestEnabled, setCustomRequestEnabled] = useState(false);
  const [customMethod, setCustomMethod] = useState<HttpMethod>('GET');
  const [customPath, setCustomPath] = useState('/api/v1/sphere/capabilities');
  const [queryEditor, setQueryEditor] = useState('{}');
  const [bodyEditor, setBodyEditor] = useState('{}');
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandError, setCommandError] = useState<CommandErrorState | null>(null);
  const [commandResult, setCommandResult] = useState<string>('');
  const [commandLinkCopied, setCommandLinkCopied] = useState(false);
  const [commandSelectionInitialized, setCommandSelectionInitialized] = useState(false);
  const [agentApiKeyInput, setAgentApiKeyInput] = useState('');
  const [agentApiKeySaved, setAgentApiKeySaved] = useState<boolean>(false);
  const [controlApiKeyInput, setControlApiKeyInput] = useState('');
  const [controlApiKeySaved, setControlApiKeySaved] = useState<boolean>(false);

  const selectedCommand = useMemo<CommandDefinition>(() => {
    return commandCatalogById[selectedCommandId] ?? commandCatalog[0];
  }, [selectedCommandId]);

  const filteredCommands = useMemo(() => {
    const query = commandFilter.trim().toLowerCase();
    if (!query) return commandCatalog;
    return commandCatalog.filter((command) => {
      return (
        command.id.toLowerCase().includes(query) ||
        command.label.toLowerCase().includes(query) ||
        command.path.toLowerCase().includes(query) ||
        command.scope.toLowerCase().includes(query)
      );
    });
  }, [commandFilter]);

  const effectiveMethod: HttpMethod = customRequestEnabled
    ? customMethod
    : selectedCommand.method;
  const effectivePath = customRequestEnabled
    ? (customPath.trim() || selectedCommand.path)
    : selectedCommand.path;

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    const commandFromSearch = typeof window !== 'undefined'
      ? resolveCommandId(new URLSearchParams(window.location.search).get('command'))
      : null;

    if (commandFromSearch) {
      setActiveTab('commands');
      setSelectedCommandId(commandFromSearch);
    } else {
      const commandFromStartParam = getOpenClawCommandId(getTelegramStartParam());
      if (commandFromStartParam) {
        setActiveTab('commands');
        setSelectedCommandId(commandFromStartParam);
      }
    }

    setCommandSelectionInitialized(true);
  }, []);

  useEffect(() => {
    const existing = readAgentApiKey();
    setAgentApiKeyInput(existing ?? '');
    setAgentApiKeySaved(Boolean(existing));
  }, []);

  useEffect(() => {
    const existing = readControlApiKey();
    setControlApiKeyInput(existing ?? '');
    setControlApiKeySaved(Boolean(existing));
  }, []);

  useEffect(() => {
    const draft = readCommandDrafts()[selectedCommand.id];
    setQueryEditor(draft?.query ?? toTemplateString(selectedCommand.queryTemplate));
    setBodyEditor(draft?.body ?? toTemplateString(selectedCommand.bodyTemplate));
    setCommandError(null);
    setCommandLinkCopied(false);
  }, [selectedCommand]);

  useEffect(() => {
    const drafts = readCommandDrafts();
    drafts[selectedCommand.id] = {
      query: queryEditor,
      body: bodyEditor
    };
    writeCommandDrafts(drafts);
  }, [selectedCommand.id, queryEditor, bodyEditor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!commandSelectionInitialized) return;
    if (activeTab !== 'commands') return;

    const url = new URL(window.location.href);
    if (url.pathname !== '/open-claw' && url.pathname !== '/engine-room') return;

    if (url.searchParams.get('command') === selectedCommand.id) return;

    url.searchParams.set('command', selectedCommand.id);
    const nextUrl = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [activeTab, selectedCommand.id, commandSelectionInitialized]);

  useEffect(() => {
    if (activeTab === 'commands') {
      setLoading(false);
      return;
    }

    setLoading(true);
    if (activeTab === 'status') {
      Promise.allSettled([
        api.getStatusAll(),
        api.getDbHealth(),
        api.getSphereCapabilities(),
        api.getSphereStatus(),
        api.getRuntimeHealth(),
        api.getRuntimeBridgeState(),
        api.getRuntimeComputeOptions(),
        api.getRuntimeCommunicationStatus(),
        api.getRedTeamReport()
      ])
        .then(([
          statusResult,
          dbResult,
          capabilitiesResult,
          sphereStatusResult,
          runtimeHealthResult,
          runtimeBridgeResult,
          runtimeComputeOptionsResult,
          runtimeCommunicationStatusResult,
          redTeamReportResult
        ]) => {
          if (statusResult.status === 'fulfilled') {
            setStatus((statusResult.value as any).status);
          }
          if (dbResult.status === 'fulfilled') {
            setDbHealth(dbResult.value);
          }
          setSphereCapabilities(capabilitiesResult.status === 'fulfilled' ? capabilitiesResult.value : null);
          setSphereStatus(sphereStatusResult.status === 'fulfilled' ? sphereStatusResult.value : null);
          setRuntimeHealth(runtimeHealthResult.status === 'fulfilled' ? runtimeHealthResult.value : null);
          setRuntimeBridgeState(runtimeBridgeResult.status === 'fulfilled' ? runtimeBridgeResult.value : null);
          setRuntimeComputeOptions(
            runtimeComputeOptionsResult.status === 'fulfilled' ? runtimeComputeOptionsResult.value : []
          );
          setRuntimeCommunicationStatus(
            runtimeCommunicationStatusResult.status === 'fulfilled'
              ? runtimeCommunicationStatusResult.value
              : null
          );
          setRedTeamReport(redTeamReportResult.status === 'fulfilled' ? redTeamReportResult.value : null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (activeTab === 'db') {
      api.getDbHealth().then((r: any) => {
        setDbHealth(r);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else if (activeTab === 'glossary') {
      api.getGlossary().then((r: any) => {
        setGlossary(r.glossary ?? []);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else if (activeTab === 'constellations') {
      api.listConstellations().then((r: any) => {
        setConstellations(r.constellations ?? []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [activeTab]);

  async function handleRunCommand() {
    setCommandRunning(true);
    setCommandError(null);
    setCommandResult('');

    try {
      const effectiveMethod: HttpMethod = customRequestEnabled
        ? customMethod
        : selectedCommand.method;
      const effectivePath = customRequestEnabled
        ? customPath.trim()
        : selectedCommand.path;

      if (!effectivePath.startsWith('/')) {
        throw new Error('Request path must start with "/".');
      }

      const query = parseJsonObject(queryEditor, 'Query JSON');
      const body = effectiveMethod === 'GET'
        ? undefined
        : parseJsonObject(bodyEditor, 'Body JSON') ?? {};
      const resolvedCommand = customRequestEnabled
        ? { path: effectivePath, query }
        : resolveCommandPath(selectedCommand, query, body);

      const preflightIssues = preflightSphereTemplate({
        method: effectiveMethod,
        path: resolvedCommand.path,
        query: resolvedCommand.query,
        body
      });

      if (preflightIssues.length > 0) {
        throw new Error(
          [
            'Preflight check failed. Update template placeholders before running:',
            ...preflightIssues.map((issue) => `- ${issue}`)
          ].join('\n')
        );
      }

      const response = await api.executeEndpoint(effectiveMethod, resolvedCommand.path, {
        query: resolvedCommand.query,
        body
      });

      if (response && typeof response === 'object') {
        const trigger = (response as Record<string, unknown>).hapticTrigger;
        if (typeof trigger === 'string' || trigger === null || trigger === undefined) {
          triggerHaptic(trigger);
        }
      }

      setCommandResult(JSON.stringify(response, null, 2));
    } catch (error) {
      setCommandError(classifyCommandError(error));
    } finally {
      setCommandRunning(false);
    }
  }

  async function handleCopyCommandLink() {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    url.pathname = '/open-claw';
    url.searchParams.set('command', selectedCommand.id);

    try {
      await navigator.clipboard.writeText(url.toString());
      setCommandLinkCopied(true);
      setTimeout(() => setCommandLinkCopied(false), 1200);
    } catch {
      setCommandError({
        kind: 'generic',
        message: 'Unable to copy link to clipboard.'
      });
    }
  }

  function handleSaveAgentApiKey() {
    const saved = saveAgentApiKey(agentApiKeyInput);
    setAgentApiKeyInput(saved ?? '');
    setAgentApiKeySaved(Boolean(saved));
    if (!saved) {
      setCommandError({
        kind: 'auth',
        message: 'Agent API key is empty. Add a key to save it.'
      });
      return;
    }

    setCommandError(null);
    triggerHaptic('notification_success');
  }

  function handleClearAgentApiKey() {
    clearAgentApiKey();
    setAgentApiKeyInput('');
    setAgentApiKeySaved(false);
    setCommandError(null);
    triggerHaptic('selection');
  }

  function handleSaveControlApiKey() {
    const saved = saveControlApiKey(controlApiKeyInput);
    setControlApiKeyInput(saved ?? '');
    setControlApiKeySaved(Boolean(saved));
    if (!saved) {
      setCommandError({
        kind: 'auth',
        message: 'Control API key is empty. Add a key to save it.'
      });
      return;
    }

    setCommandError(null);
    triggerHaptic('notification_success');
  }

  function handleClearControlApiKey() {
    clearControlApiKey();
    setControlApiKeyInput('');
    setControlApiKeySaved(false);
    setCommandError(null);
    triggerHaptic('selection');
  }

  function applySphereQuickTemplate(template: SphereQuickTemplate): void {
    setCustomRequestEnabled(true);
    setCustomMethod(template.method);
    setCustomPath(template.path);
    setQueryEditor(toTemplateString(template.query));
    setBodyEditor(toTemplateString(template.body));
    setCommandError(null);
    setCommandResult('');
    triggerHaptic('selection');
  }

  const tabs: { id: Tab; icon: typeof Cpu; label: string }[] = [
    { id: 'status', icon: Activity, label: 'Status' },
    { id: 'db', icon: Database, label: 'DB' },
    { id: 'glossary', icon: BookOpen, label: 'Glossary' },
    { id: 'constellations', icon: List, label: 'Constellations' },
    { id: 'commands', icon: Terminal, label: 'Open Claw' }
  ];
  const recentRedTeamRuns = redTeamReport?.history?.runs.slice(0, 4) ?? [];
  const redTeamTrend = redTeamReport?.trend ?? null;
  const redTeamTrendSeries = redTeamTrend?.series ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-4 pb-3 border-b border-engine/30">
        <Cpu size={18} className="text-engine" />
        <h2 className="text-engine font-mono font-semibold tracking-wide">ENGINE ROOM</h2>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/10">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { triggerHaptic('selection'); setActiveTab(id); }}
            className={`
              lf-button lf-button--secondary
              flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors
              ${activeTab === id ? 'text-engine border-b-2 border-engine' : 'text-white/40 hover:text-white/70'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 scroll-area p-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border border-engine rounded-sm animate-spin" />
          </div>
        )}

        {/* Status tab */}
        {!loading && activeTab === 'status' && status && (
          <div className="space-y-4">
            <div className="territory-card lf-card border border-engine/30 bg-engine/5 rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-engine text-xs font-mono uppercase tracking-wider">System</p>
                <span className="text-engine text-xs font-mono">● ONLINE</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-white/40">Provider</p>
                  <p className="text-white font-mono">{status.provider ?? 'kimi'}</p>
                </div>
                <div>
                  <p className="text-white/40">Uptime</p>
                  <p className="text-white font-mono">{Math.floor((status.uptime ?? 0) / 60)}m</p>
                </div>
                <div>
                  <p className="text-white/40">Total Users</p>
                  <p className="text-white font-mono">{status.totalUsers ?? 0}</p>
                </div>
                <div>
                  <p className="text-white/40">DB</p>
                  <p className={`font-mono ${dbHealth?.ok ? 'text-engine' : 'text-red-400'}`}>
                    {dbHealth?.ok ? 'healthy' : 'error'}
                  </p>
                </div>
              </div>
            </div>

            <div className="territory-card lf-card border border-white/15 bg-white/[0.03] rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-xs font-mono uppercase tracking-wider">Sphere Boundary</p>
                <span className={`text-xs font-mono ${sphereStatus ? 'text-engine' : 'text-white/40'}`}>
                  {sphereStatus ? sphereStatus.systemState : 'UNAVAILABLE'}
                </span>
              </div>

              {sphereStatus ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-white/40">Threads</p>
                    <p className="text-white font-mono">{sphereStatus.threadCount}</p>
                  </div>
                  <div>
                    <p className="text-white/40">Halted</p>
                    <p className="text-white font-mono">{sphereStatus.haltedThreads}</p>
                  </div>
                  <div>
                    <p className="text-white/40">Degraded</p>
                    <p className="text-white font-mono">{sphereStatus.degradedThreads}</p>
                  </div>
                  <div>
                    <p className="text-white/40">Mode</p>
                    <p className="text-white font-mono">
                      {sphereCapabilities?.sphereThreadEnabled ? 'ENABLED' : 'STANDALONE'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-white/45 text-xs">BFF adapter or Sphere status endpoint unavailable.</p>
              )}

              {sphereCapabilities?.features && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(Object.entries(sphereCapabilities.features) as Array<[string, boolean | undefined]>).map(
                    ([feature, enabled]) => (
                      <span
                        key={feature}
                        className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-mono ${
                          enabled
                            ? 'border-engine/40 text-engine'
                            : 'border-white/20 text-white/40'
                        }`}
                      >
                        {feature}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="territory-card lf-card border border-engine/20 bg-engine/[0.03] rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-xs font-mono uppercase tracking-wider">MetaCanon Runtime</p>
                <span
                  className={`text-xs font-mono ${
                    runtimeHealth?.bridge_ready ? 'text-engine' : 'text-white/45'
                  }`}
                >
                  {runtimeHealth?.status?.toUpperCase() ?? 'UNAVAILABLE'}
                </span>
              </div>

              {runtimeHealth ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-white/40">Bridge Ready</p>
                    <p className={`font-mono ${runtimeHealth.bridge_ready ? 'text-engine' : 'text-red-400'}`}>
                      {runtimeHealth.bridge_ready ? 'YES' : 'NO'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40">Compute Providers</p>
                    <p className="text-white font-mono">{runtimeComputeOptions.length}</p>
                  </div>
                  <div>
                    <p className="text-white/40">Bridge Loaded</p>
                    <p className="text-white font-mono">
                      {runtimeBridgeState?.loaded ? 'YES' : 'NO'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40">Agent Bindings</p>
                    <p className="text-white font-mono">
                      {Array.isArray(runtimeCommunicationStatus?.agent_bindings)
                        ? runtimeCommunicationStatus.agent_bindings.length
                        : 0}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-white/45 text-xs">
                  Runtime control API unavailable. Set API base to metacanon-code-api and configure control key if enabled.
                </p>
              )}
            </div>

            <div className="territory-card lf-card border border-cyan-400/20 bg-cyan-400/[0.04] rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-xs font-mono uppercase tracking-wider">Governance Red-Team</p>
                <span
                  className={`text-xs font-mono ${
                    redTeamReport?.report?.runner?.status === 'passed' ? 'text-engine' : 'text-red-400'
                  }`}
                >
                  {redTeamReport?.report?.runner?.status?.toUpperCase() ?? 'NO REPORT'}
                </span>
              </div>

              {redTeamReport?.report ? (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-white/40">Scenarios</p>
                      <p className="text-white font-mono">{redTeamReport.report.metrics.totalScenarios}</p>
                    </div>
                    <div>
                      <p className="text-white/40">Blocked Probes</p>
                      <p className="text-white font-mono">{redTeamReport.report.metrics.blockedProbeScenarios}</p>
                    </div>
                    <div>
                      <p className="text-white/40">Latest Run</p>
                      <p className="text-white font-mono">{formatTimestamp(redTeamReport.updatedAt)}</p>
                    </div>
                    <div>
                      <p className="text-white/40">History Window</p>
                      <p className="text-white font-mono">{redTeamTrend?.runCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-white/40">Storage</p>
                      <p className="text-white font-mono">{redTeamReport.storageSource.toUpperCase()}</p>
                    </div>
                  </div>

                  {redTeamTrend ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-white/40">Pass Rate</p>
                        <p className="text-white font-mono">
                          {redTeamTrend.passRate !== null ? `${Math.round(redTeamTrend.passRate * 100)}%` : 'n/a'}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/40">Avg Duration</p>
                        <p className="text-white font-mono">
                          {redTeamTrend.averageDurationMs !== null
                            ? `${Math.round(redTeamTrend.averageDurationMs)} ms`
                            : 'n/a'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {redTeamTrendSeries.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      <RedTeamSparkline
                        title="Scenario Pass Rate"
                        subtitle="Oldest to newest retained run."
                        series={redTeamTrendSeries}
                        valueAccessor={(point) =>
                          point.scenarioPassRate !== null ? point.scenarioPassRate * 100 : null
                        }
                        formatter={(value) => `${Math.round(value)}%`}
                        stroke="#1de9b6"
                      />
                      <RedTeamSparkline
                        title="Run Duration"
                        subtitle="Wall-clock PG harness duration."
                        series={redTeamTrendSeries}
                        valueAccessor={(point) => point.durationMs}
                        formatter={(value) => `${Math.round(value)} ms`}
                        stroke="#7dd3fc"
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-1">
                    {Object.entries(redTeamReport.report.metrics.attackClassCounts)
                      .sort(([left], [right]) => left.localeCompare(right))
                      .map(([attackClass, count]) => (
                        <span
                          key={attackClass}
                          className="px-1.5 py-0.5 rounded-sm border border-cyan-400/30 text-[10px] font-mono text-cyan-200"
                        >
                          {formatAttackClass(attackClass)}: {count}
                        </span>
                      ))}
                  </div>

                  {recentRedTeamRuns.length > 0 ? (
                    <div className="space-y-1">
                      {recentRedTeamRuns.map((run) => (
                        <div
                          key={run.runId}
                          className="flex items-center justify-between border border-white/10 rounded-sm px-2 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-white font-mono truncate">{run.runId}</p>
                            <p className="text-white/40 font-mono">
                              {run.totalScenarios} scenarios · {run.durationMs !== null ? `${Math.round(run.durationMs)} ms` : 'n/a'}
                            </p>
                          </div>
                          <span className={`font-mono ${run.status === 'passed' ? 'text-engine' : 'text-red-400'}`}>
                            {run.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-white/45 text-xs">
                    No red-team artifact is available yet for this operator surface.
                  </p>
                  <p className="text-white/35 text-[10px] font-mono break-all">
                    {redTeamReport?.reportPath ?? 'artifacts/redteam/governance-redteam-report.json'}
                  </p>
                </div>
              )}
            </div>

            {status.games?.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Games</p>
                <div className="space-y-1">
                  {status.games.map((game: any) => (
                    <div key={game.status} className="flex items-center justify-between border border-white/10 rounded-sm px-3 py-2">
                      <span className="text-white/60 text-xs font-mono">{game.status}</span>
                      <span className="text-engine text-xs font-mono font-bold">{game.cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status.commands?.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-mono uppercase tracking-wider mb-2">Commands</p>
                <div className="space-y-1">
                  {status.commands.map((command: any) => (
                    <div key={command.status} className="flex items-center justify-between border border-white/10 rounded-sm px-3 py-2">
                      <span className="text-white/60 text-xs font-mono">{command.status}</span>
                      <span className={`text-xs font-mono font-bold ${command.status === 'failed' ? 'text-red-400' : 'text-engine'}`}>
                        {command.cnt}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DB tab */}
        {!loading && activeTab === 'db' && (
          <div className="space-y-3">
            <div className={`territory-card lf-card border rounded-sm p-4 text-center ${dbHealth?.ok ? 'border-engine/40 bg-engine/5' : 'border-red-500/40 bg-red-500/5'}`}>
              <Database size={24} className={`mx-auto mb-2 ${dbHealth?.ok ? 'text-engine' : 'text-red-400'}`} />
              <p className={`font-mono text-sm font-bold ${dbHealth?.ok ? 'text-engine' : 'text-red-400'}`}>
                {dbHealth?.ok ? 'DATABASE HEALTHY' : 'DATABASE ERROR'}
              </p>
              {!dbHealth?.ok && dbHealth?.error && (
                <p className="text-red-400/70 text-xs mt-2 font-mono break-all">{dbHealth.error}</p>
              )}
            </div>
          </div>
        )}

        {/* Glossary tab */}
        {!loading && activeTab === 'glossary' && (
          <div className="space-y-3">
            {glossary.map((item) => (
              <div key={item.term} className="territory-card lf-card border border-white/10 rounded-sm p-3">
                <p className="text-engine text-sm font-mono font-semibold">{item.term}</p>
                <p className="text-white/60 text-xs mt-1 leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </div>
        )}

        {/* Constellations tab */}
        {!loading && activeTab === 'constellations' && (
          <div className="space-y-3">
            {constellations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <List size={32} className="text-white/20" />
                <p className="text-white/40 text-sm font-mono">No constellations available</p>
              </div>
            )}
            {constellations.map((constellation) => (
              <div key={constellation.id} className="territory-card lf-card border border-engine/30 bg-engine/5 rounded-sm p-3">
                <p className="text-engine text-sm font-mono font-semibold">{constellation.name}</p>
                <p className="text-white/60 text-xs mt-1">{constellation.description}</p>
                {constellation.seats?.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {constellation.seats.map((seat: number) => (
                      <span key={seat} className="text-[10px] font-mono text-engine/70 border border-engine/30 px-1 rounded-sm">
                        {String(seat).padStart(2, '0')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Commands tab */}
        {activeTab === 'commands' && (
          <div className="space-y-4">
            <div className="territory-card lf-card border border-engine/30 bg-gradient-to-r from-engine/15 via-engine/5 to-transparent rounded-sm p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-engine text-xs font-mono uppercase tracking-wider">Open Claw Command Deck</p>
                <span className="text-white/40 text-[11px] font-mono">{commandCatalog.length} commands</span>
              </div>
              <p className="text-white/55 text-xs mt-1">
                Interop console for TG command execution across the current API surface.
              </p>
              <div className="mt-3 relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-white/35" />
                <input
                  value={commandFilter}
                  onChange={(event) => setCommandFilter(event.target.value)}
                  placeholder="Filter by command, scope, or path..."
                  className="lf-input w-full bg-void-light border border-white/15 text-white text-xs pl-8 pr-3 py-2 rounded-sm outline-none focus:border-engine/60"
                />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="territory-card lf-card border border-white/10 rounded-sm p-2 max-h-[24rem] overflow-y-auto space-y-1">
                {filteredCommands.map((command) => (
                  <button
                    key={command.id}
                    onClick={() => { triggerHaptic('selection'); setSelectedCommandId(command.id); }}
                    className={`
                      w-full text-left border rounded-sm p-2 transition-colors
                      ${selectedCommandId === command.id ? 'border-engine/50 bg-engine/10' : 'border-white/10 bg-void-light hover:border-engine/30'}
                    `}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white text-xs font-mono">{command.id}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm border border-white/20 text-white/50 font-mono">
                        {command.method}
                      </span>
                    </div>
                    <p className="text-engine/90 text-[11px] mt-0.5">{command.label}</p>
                    <p className="text-white/35 text-[10px] font-mono mt-1 truncate">{command.path}</p>
                  </button>
                ))}

                {filteredCommands.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-white/40 text-xs font-mono">No matching commands</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="territory-card lf-card border border-engine/30 bg-engine/5 rounded-sm p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-engine text-xs font-mono uppercase tracking-wider">{selectedCommand.id}</p>
                    <span className="text-white/50 text-[10px] font-mono">{selectedCommand.scope}</span>
                  </div>
                  <p className="text-white text-sm mt-1">{selectedCommand.label}</p>
                  <p className="text-white/55 text-xs mt-1 leading-relaxed">{selectedCommand.description}</p>
                  <p className="text-white/45 text-[11px] font-mono mt-2">
                    {effectiveMethod} {effectivePath}
                  </p>
                  {selectedCommand.pathParams && selectedCommand.pathParams.length > 0 && (
                    <p className="text-white/35 text-[10px] font-mono mt-1">
                      path params via Query/Body: {selectedCommand.pathParams.join(', ')}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleCopyCommandLink}
                      className="lf-button lf-button--secondary text-[10px] font-mono border border-engine/40 text-engine px-2 py-1 rounded-sm flex items-center gap-1"
                    >
                      {commandLinkCopied ? <Check size={11} /> : <Link2 size={11} />}
                      {commandLinkCopied ? 'LINK COPIED' : 'COPY LINK'}
                    </button>
                    <span className="text-white/35 text-[10px] font-mono">
                      start_param: open_claw:{selectedCommand.id}
                    </span>
                  </div>

                  <div className="territory-card lf-card mt-3 border border-white/10 rounded-sm p-2.5 bg-void-light/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/55 text-[10px] font-mono uppercase tracking-wider">
                        Agent API Key
                      </p>
                      <span className={`text-[10px] font-mono ${agentApiKeySaved ? 'text-engine' : 'text-white/45'}`}>
                        {agentApiKeySaved ? 'ATTACHED' : 'NOT SET'}
                      </span>
                    </div>
                    <input
                      type="password"
                      value={agentApiKeyInput}
                      onChange={(event) => {
                        setAgentApiKeyInput(event.target.value);
                        setAgentApiKeySaved(false);
                      }}
                      placeholder="x-agent-api-key"
                      className="lf-input w-full bg-void border border-white/20 text-white text-xs px-2 py-1.5 rounded-sm font-mono outline-none focus:border-engine/60"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveAgentApiKey}
                        className="lf-button lf-button--secondary text-[10px] font-mono border border-engine/40 text-engine px-2 py-1 rounded-sm"
                      >
                        SAVE KEY
                      </button>
                      <button
                        onClick={handleClearAgentApiKey}
                        className="lf-button lf-button--secondary text-[10px] font-mono border border-white/20 text-white/55 px-2 py-1 rounded-sm"
                      >
                        CLEAR KEY
                      </button>
                    </div>
                    <p className="text-white/35 text-[10px]">
                      Writes can be gated by key at the BFF boundary. Saved key is sent as
                      {' '}
                      <span className="font-mono">x-agent-api-key</span>.
                    </p>
                  </div>

                  <div className="territory-card lf-card mt-3 border border-white/10 rounded-sm p-2.5 bg-void-light/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/55 text-[10px] font-mono uppercase tracking-wider">
                        Control API Key
                      </p>
                      <span className={`text-[10px] font-mono ${controlApiKeySaved ? 'text-engine' : 'text-white/45'}`}>
                        {controlApiKeySaved ? 'ATTACHED' : 'OPTIONAL'}
                      </span>
                    </div>
                    <input
                      type="password"
                      value={controlApiKeyInput}
                      onChange={(event) => {
                        setControlApiKeyInput(event.target.value);
                        setControlApiKeySaved(false);
                      }}
                      placeholder="x-metacanon-key"
                      className="lf-input w-full bg-void border border-white/20 text-white text-xs px-2 py-1.5 rounded-sm font-mono outline-none focus:border-engine/60"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveControlApiKey}
                        className="lf-button lf-button--secondary text-[10px] font-mono border border-engine/40 text-engine px-2 py-1 rounded-sm"
                      >
                        SAVE KEY
                      </button>
                      <button
                        onClick={handleClearControlApiKey}
                        className="lf-button lf-button--secondary text-[10px] font-mono border border-white/20 text-white/55 px-2 py-1 rounded-sm"
                      >
                        CLEAR KEY
                      </button>
                    </div>
                    <p className="text-white/35 text-[10px]">
                      Required only when runtime control API enables auth. Saved key is sent as
                      {' '}
                      <span className="font-mono">x-metacanon-key</span>
                      {' '}
                      on
                      {' '}
                      <span className="font-mono">/api/v1/runtime/*</span>
                      {' '}
                      requests.
                    </p>
                  </div>

                  <div className="territory-card lf-card mt-3 border border-white/10 rounded-sm p-2.5 bg-void-light/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/55 text-[10px] font-mono uppercase tracking-wider">
                        Advanced Override
                      </p>
                      <button
                        onClick={() => setCustomRequestEnabled((current) => !current)}
                        className={`lf-button lf-button--secondary text-[10px] font-mono px-2 py-1 rounded-sm border ${
                          customRequestEnabled
                            ? 'border-engine/50 text-engine'
                            : 'border-white/20 text-white/50'
                        }`}
                      >
                        {customRequestEnabled ? 'CUSTOM ON' : 'CUSTOM OFF'}
                      </button>
                    </div>

                    {customRequestEnabled && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={customMethod}
                            onChange={(event) => setCustomMethod(event.target.value as HttpMethod)}
                            className="lf-input bg-void border border-white/20 text-white text-xs px-2 py-1.5 rounded-sm font-mono outline-none focus:border-engine/60"
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PATCH">PATCH</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                          <input
                            value={customPath}
                            onChange={(event) => setCustomPath(event.target.value)}
                            placeholder="/api/v1/sphere/..."
                            className="lf-input col-span-2 bg-void border border-white/20 text-white text-xs px-2 py-1.5 rounded-sm font-mono outline-none focus:border-engine/60"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {sphereQuickTemplates.map((template) => (
                            <button
                              key={template.id}
                              onClick={() => applySphereQuickTemplate(template)}
                              className="lf-button lf-button--secondary text-[10px] font-mono border border-engine/30 text-engine/90 px-1.5 py-0.5 rounded-sm"
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-white/35 text-[10px]">
                          Use this for protocol endpoints not yet in catalog (for example
                          {' '}
                          <span className="font-mono">/api/v1/sphere/cycle-events</span>).
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-white/50 text-[10px] font-mono uppercase tracking-wider">
                    Query JSON
                  </label>
                  <textarea
                    value={queryEditor}
                    onChange={(event) => setQueryEditor(event.target.value)}
                    rows={5}
                    className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm font-mono outline-none focus:border-engine/60 resize-y"
                  />
                </div>

                {effectiveMethod !== 'GET' && (
                  <div className="space-y-2">
                    <label className="block text-white/50 text-[10px] font-mono uppercase tracking-wider">
                      Body JSON
                    </label>
                    <textarea
                      value={bodyEditor}
                      onChange={(event) => setBodyEditor(event.target.value)}
                      rows={8}
                      className="lf-input w-full bg-void-light border border-white/15 text-white text-xs px-3 py-2 rounded-sm font-mono outline-none focus:border-engine/60 resize-y"
                    />
                  </div>
                )}

                <button
                  onClick={handleRunCommand}
                  disabled={commandRunning}
                  className="lf-button lf-button--primary w-full bg-engine text-void font-mono text-sm py-2.5 rounded-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {commandRunning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-void/40 border-t-void rounded-full animate-spin" />
                      EXECUTING...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      RUN COMMAND
                    </>
                  )}
                </button>

                {commandError && (
                  <div
                    className={`border rounded-sm p-3 ${
                      commandError.kind === 'degraded'
                        ? 'border-yellow-500/40 bg-yellow-500/10'
                        : commandError.kind === 'halted'
                          ? 'border-red-500/40 bg-red-500/10'
                          : commandError.kind === 'quorum'
                            ? 'border-orange-500/40 bg-orange-500/10'
                            : commandError.kind === 'auth'
                              ? 'border-indigo-500/40 bg-indigo-500/10'
                              : 'border-red-500/40 bg-red-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-red-200 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-red-100 text-xs font-mono">{commandError.message}</p>
                        {commandError.code && (
                          <p className="text-red-200/80 text-[10px] font-mono mt-1">
                            code={commandError.code}
                          </p>
                        )}
                        {commandError.traceId && (
                          <p className="text-red-200/70 text-[10px] font-mono">
                            traceId={commandError.traceId}
                          </p>
                        )}
                        {typeof commandError.retryable === 'boolean' && (
                          <p className="text-red-200/70 text-[10px] font-mono">
                            retryable={String(commandError.retryable)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {commandResult && (
                  <div className="territory-card lf-card border border-white/10 rounded-sm p-3 bg-void-light">
                    <p className="text-white/40 text-[10px] font-mono uppercase tracking-wider mb-2">Response</p>
                    <pre className="text-[11px] text-white/75 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                      {commandResult}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
