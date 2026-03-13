/**
 * LensForge Living Atlas — API client
 * All requests include the Telegram initData as a Bearer token.
 */

import { getSphereSigner } from './sphereIdentity';
import { readAgentApiKey } from './agentApiKey';
import { readControlApiKey } from './controlApiKey';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const SPHERE_CANONICAL_BASE = '/api/v1/sphere';
const SPHERE_ALIAS_BASE = '/api/v1/c2';
const SPHERE_BFF_BASE = '/api/v1/bff/sphere';
const RUNTIME_BASE = '/api/v1/runtime';
const SPHERE_AGENT_PRINCIPAL_HEADER = 'x-sphere-agent-principal';

type QueryParams = Record<string, unknown>;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable?: boolean;
  readonly details?: unknown;
  readonly traceId?: string;

  constructor(params: {
    status: number;
    message: string;
    code?: string;
    retryable?: boolean;
    details?: unknown;
    traceId?: string;
  }) {
    super(params.message);
    this.name = 'ApiRequestError';
    this.status = params.status;
    this.code = params.code;
    this.retryable = params.retryable;
    this.details = params.details;
    this.traceId = params.traceId;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseErrorBody(status: number, body: unknown): ApiRequestError {
  if (isObject(body)) {
    const message =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      `HTTP ${status}`;
    return new ApiRequestError({
      status,
      message,
      code: typeof body.code === 'string' ? body.code : undefined,
      retryable: typeof body.retryable === 'boolean' ? body.retryable : undefined,
      details: body.details,
      traceId: typeof body.traceId === 'string' ? body.traceId : undefined
    });
  }

  return new ApiRequestError({
    status,
    message: `HTTP ${status}`
  });
}

function getInitData(): string {
  // In the real TMA, Telegram.WebApp.initData is populated automatically
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
    return (window as any).Telegram.WebApp.initData;
  }
  // Dev fallback
  return import.meta.env.VITE_DEV_INIT_DATA ?? '';
}

function normalizeApiPath(path: string): string {
  const [pathname, query = ''] = path.split('?', 2);
  const suffix = query ? `?${query}` : '';

  if (pathname === SPHERE_CANONICAL_BASE || pathname.startsWith(`${SPHERE_CANONICAL_BASE}/`)) {
    return `${SPHERE_BFF_BASE}${pathname.slice(SPHERE_CANONICAL_BASE.length)}${suffix}`;
  }

  if (pathname === SPHERE_ALIAS_BASE || pathname.startsWith(`${SPHERE_ALIAS_BASE}/`)) {
    return `${SPHERE_BFF_BASE}${pathname.slice(SPHERE_ALIAS_BASE.length)}${suffix}`;
  }

  if (pathname === '/api/v1/threads/halt-all') {
    return `${SPHERE_BFF_BASE}/halt-all`;
  }

  return path;
}

function buildRequestUrl(path: string): string {
  return `${API_BASE}${normalizeApiPath(path)}`;
}

function isRuntimePath(path: string): boolean {
  const [pathname] = path.split('?', 2);
  return pathname === RUNTIME_BASE || pathname.startsWith(`${RUNTIME_BASE}/`);
}

function buildRequestHeaders(path: string): Record<string, string> {
  const initData = getInitData();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `tma ${initData}`
  };

  const agentApiKey = readAgentApiKey();
  if (agentApiKey) {
    headers['x-agent-api-key'] = agentApiKey;
  }

  if (isRuntimePath(path)) {
    const controlApiKey = readControlApiKey();
    if (controlApiKey) {
      headers['x-metacanon-key'] = controlApiKey;
    }
  }

  return headers;
}

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

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (isObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      const nestedValue = sortValue(value[key]);
      if (nestedValue !== undefined) {
        sorted[key] = nestedValue;
      }
    }
    return sorted;
  }

  return value;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

async function requestWithResponse<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ data: T; response: Response }> {
  const res = await fetch(buildRequestUrl(path), {
    method,
    headers: buildRequestHeaders(path),
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: res.statusText }));
    throw parseErrorBody(res.status, errorBody);
  }

  const data = await res.json() as T;
  return { data, response: res };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const result = await requestWithResponse<T>(method, path, body);
  return result.data;
}

function buildPath(path: string, query?: QueryParams): string {
  if (!query) return path;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        params.append(key, String(item));
      }
      continue;
    }
    params.append(key, String(value));
  }

  const queryString = params.toString();
  if (!queryString) return path;
  return `${path}?${queryString}`;
}

function executeEndpoint<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options?: { query?: QueryParams; body?: unknown }
): Promise<T> {
  return request<T>(method, buildPath(path, options?.query), options?.body);
}

const CYCLE_EVENT_INTENTS: Record<SphereCycleEventType, string> = {
  seat_taken: 'SEAT_TAKEN',
  perspective_submitted: 'PERSPECTIVE_SUBMITTED',
  synthesis_returned: 'SYNTHESIS_RETURNED',
  lens_upgraded: 'LENS_UPGRADED'
};

async function buildSignedDispatchEnvelope(input: {
  threadId: string;
  intent: string;
  payload: Record<string, unknown>;
  missionId?: string;
  messageId?: string;
  traceId?: string;
  causationId?: string[];
  attestation?: string[];
  idempotencyKey?: string;
  protocolVersion?: string;
  schemaVersion?: '3.0';
  prismHolderApproved?: boolean;
}): Promise<{
  threadId: string;
  missionId?: string;
  authorAgentId: string;
  messageId: string;
  traceId: string;
  intent: string;
  attestation: string[];
  schemaVersion: '3.0';
  protocolVersion: string;
  causationId: string[];
  idempotencyKey?: string;
  agentSignature: string;
  prismHolderApproved?: boolean;
}> {
  const signer = await getSphereSigner();
  const messageId = input.messageId ?? nextUuid();
  const traceId = input.traceId ?? nextUuid();
  const schemaVersion = input.schemaVersion ?? '3.0';
  const protocolVersion = input.protocolVersion ?? '3.0';
  const causationId = input.causationId ?? [];
  const attestation = input.attestation ?? [];

  const clientEnvelopeBase = {
    messageId,
    threadId: input.threadId,
    authorAgentId: signer.did,
    intent: input.intent,
    protocolVersion,
    schemaVersion,
    traceId,
    causationId,
    attestation,
    idempotencyKey: input.idempotencyKey
  };

  const agentSignature = await signer.signCanonicalPayload(
    canonicalize({
      clientEnvelope: clientEnvelopeBase,
      payload: input.payload
    })
  );

  return {
    threadId: input.threadId,
    missionId: input.missionId,
    authorAgentId: signer.did,
    messageId,
    traceId,
    intent: input.intent,
    attestation,
    schemaVersion,
    protocolVersion,
    causationId,
    idempotencyKey: input.idempotencyKey,
    agentSignature,
    prismHolderApproved: input.prismHolderApproved
  };
}

async function buildSignedAckEnvelope(input: {
  threadId: string;
  targetSequence: number;
  targetMessageId: string;
  traceId?: string;
  ackMessageId?: string;
  attestation?: string[];
  receivedAt?: string;
}): Promise<{
  actorDid: string;
  targetSequence: number;
  targetMessageId: string;
  ackMessageId: string;
  traceId: string;
  intent: 'ACK_ENTRY';
  schemaVersion: '3.0';
  attestation: string[];
  agentSignature: string;
  receivedAt?: string;
}> {
  const signer = await getSphereSigner();
  const traceId = input.traceId ?? nextUuid();
  const ackMessageId = input.ackMessageId ?? nextUuid();
  const attestation = input.attestation ?? [];
  const receivedAt = input.receivedAt;
  const receivedAtCanonical = receivedAt ?? null;

  const signaturePayload = {
    threadId: input.threadId,
    actorDid: signer.did,
    targetSequence: input.targetSequence,
    targetMessageId: input.targetMessageId,
    ackMessageId,
    traceId,
    intent: 'ACK_ENTRY',
    schemaVersion: '3.0',
    attestation,
    receivedAt: receivedAtCanonical
  };

  const agentSignature = await signer.signCanonicalPayload(canonicalize(signaturePayload));

  return {
    actorDid: signer.did,
    targetSequence: input.targetSequence,
    targetMessageId: input.targetMessageId,
    ackMessageId,
    traceId,
    intent: 'ACK_ENTRY',
    schemaVersion: '3.0',
    attestation,
    agentSignature,
    receivedAt
  };
}

export type SphereStreamEvent = {
  event: string;
  id?: string;
  retry?: number;
  data: unknown;
};

export type SphereThreadStreamOptions = {
  threadId: string;
  cursor?: number;
  ackCursor?: number;
  onEvent: (event: SphereStreamEvent) => void;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
};

function parseSseBlock(rawBlock: string): SphereStreamEvent | null {
  const block = rawBlock.trim();
  if (!block) {
    return null;
  }

  const lines = block.split('\n');
  let event = 'message';
  let id: string | undefined;
  let retry: number | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }
    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).trimStart();

    if (field === 'event') {
      event = value || event;
      continue;
    }
    if (field === 'id') {
      id = value || undefined;
      continue;
    }
    if (field === 'retry') {
      const parsedRetry = Number.parseInt(value, 10);
      if (!Number.isNaN(parsedRetry)) {
        retry = parsedRetry;
      }
      continue;
    }
    if (field === 'data') {
      dataLines.push(value);
    }
  }

  const rawData = dataLines.join('\n');
  let data: unknown = rawData;
  if (rawData) {
    try {
      data = JSON.parse(rawData) as unknown;
    } catch {
      data = rawData;
    }
  }

  return {
    event,
    id,
    retry,
    data
  };
}

async function streamSphereThread(options: SphereThreadStreamOptions): Promise<() => void> {
  const query = new URLSearchParams();
  if (typeof options.cursor === 'number') {
    query.set('cursor', String(options.cursor));
  }
  if (typeof options.ackCursor === 'number') {
    query.set('ack_cursor', String(options.ackCursor));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const path = `${SPHERE_CANONICAL_BASE}/threads/${options.threadId}/stream${suffix}`;

  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(buildRequestUrl(path), {
        method: 'GET',
        headers: buildRequestHeaders(path),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        throw parseErrorBody(response.status, errorBody);
      }

      if (!response.body) {
        throw new Error('SSE stream body was empty.');
      }

      options.onOpen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        while (true) {
          const boundary = buffer.indexOf('\n\n');
          if (boundary === -1) {
            break;
          }
          const rawBlock = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseBlock(rawBlock);
          if (parsed) {
            options.onEvent(parsed);
          }
        }
      }

      options.onClose?.();
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        options.onClose?.();
        return;
      }
      options.onError?.(error);
    }
  })();

  return () => {
    controller.abort();
  };
}

export const api = {
  executeEndpoint,

  // MetaCanon Runtime Control
  getRuntimeHealth: () =>
    request<RuntimeHealth>('GET', `${RUNTIME_BASE}/healthz`),
  getRuntimeBridgeState: () =>
    request<RuntimeBridgeState>('GET', `${RUNTIME_BASE}/bridge/state`),
  getRuntimeComputeOptions: () =>
    request<RuntimeComputeOption[]>('GET', `${RUNTIME_BASE}/compute/options`),
  setRuntimeGlobalComputeProvider: (providerId: string) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/compute/global-provider`, {
      provider_id: providerId
    }),
  setRuntimeProviderPriority: (cloudProviderPriority: string[]) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/compute/priority`, {
      cloud_provider_priority: cloudProviderPriority
    }),
  updateRuntimeProviderConfig: (providerId: string, config: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/providers/${providerId}/config`, {
      config
    }),
  invokeRuntimeGenesis: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/genesis/invoke`, payload),
  validateRuntimeAction: (action: Record<string, unknown>, willVector: Record<string, unknown>) =>
    request<{ valid: boolean }>('POST', `${RUNTIME_BASE}/actions/validate`, {
      action,
      will_vector: willVector
    }),
  createRuntimeSubSphere: (payload: {
    name: string;
    objective: string;
    hitl_required?: boolean;
  }) => request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/sub-spheres`, payload),
  listRuntimeSubSpheres: () =>
    request<Array<Record<string, unknown>>>('GET', `${RUNTIME_BASE}/sub-spheres`),
  getRuntimeSubSphere: (subSphereId: string) =>
    request<Record<string, unknown>>('GET', `${RUNTIME_BASE}/sub-spheres/${subSphereId}`),
  pauseRuntimeSubSphere: (subSphereId: string) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/sub-spheres/${subSphereId}/pause`, {}),
  dissolveRuntimeSubSphere: (subSphereId: string, reason: string) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/sub-spheres/${subSphereId}/dissolve`, {
      reason
    }),
  queryRuntimeSubSphere: (subSphereId: string, query: string, providerOverride?: string | null) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/sub-spheres/${subSphereId}/query`, {
      query,
      provider_override: providerOverride ?? null
    }),
  getRuntimeCommunicationStatus: () =>
    request<Record<string, unknown>>('GET', `${RUNTIME_BASE}/communications/status`),
  updateRuntimeTelegramIntegration: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/communications/telegram`, payload),
  updateRuntimeDiscordIntegration: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/communications/discord`, payload),
  bindRuntimeAgentRoute: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/communications/agents/bind`, payload),
  bindRuntimeSubSpherePrismRoute: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      'POST',
      `${RUNTIME_BASE}/communications/sub-spheres/prism/bind`,
      payload
    ),
  sendRuntimeAgentMessage: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', `${RUNTIME_BASE}/communications/agents/message`, payload),
  sendRuntimeSubSphereMessage: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      'POST',
      `${RUNTIME_BASE}/communications/sub-spheres/message`,
      payload
    ),

  // Sphere (via BFF auth adapter)
  getSphereCapabilities: () =>
    request<SphereCapabilities>('GET', `${SPHERE_CANONICAL_BASE}/capabilities`),
  getSphereStatus: () => request<SphereStatus>('GET', `${SPHERE_CANONICAL_BASE}/status`),
  getSphereLensUpgradeRules: () =>
    request<SphereLensUpgradeRulesResponse>('GET', `${SPHERE_CANONICAL_BASE}/lens-upgrade-rules`),
  getSphereLensProgression: (threadId: string) =>
    request<SphereLensProgressionResponse>(
      'GET',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/lens-progression`
    ),
  getSphereCycleState: (threadId: string) =>
    request<SphereCycleStateResponse>(
      'GET',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/cycle-state`
    ),
  getSphereThread: (threadId: string) =>
    request<SphereThread>('GET', `${SPHERE_CANONICAL_BASE}/threads/${threadId}`),
  getSphereReplay: (threadId: string, query?: { cursor?: number; from_sequence?: number }) =>
    executeEndpoint<SphereReplayResponse>(
      'GET',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/replay`,
      { query }
    ),
  getSphereAcks: (
    threadId: string,
    query?: { cursor?: number; ack_cursor?: number; limit?: number; actor_did?: string }
  ) =>
    executeEndpoint<SphereAckReplayResponse>(
      'GET',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/acks`,
      { query }
    ),
  getSphereThreadMembers: (threadId: string, query?: { limit?: number }) =>
    requestWithResponse<SphereThreadMembersResponse>(
      'GET',
      buildPath(`${SPHERE_CANONICAL_BASE}/threads/${threadId}/members`, query)
    ).then(({ data, response }) => ({
      ...data,
      agentPrincipal: response.headers.get(SPHERE_AGENT_PRINCIPAL_HEADER) ?? undefined
    })),
  getSphereThreadInvites: (
    threadId: string,
    query?: { limit?: number; includeRevoked?: boolean }
  ) =>
    requestWithResponse<SphereThreadInvitesResponse>(
      'GET',
      buildPath(`${SPHERE_CANONICAL_BASE}/threads/${threadId}/invites`, query)
    ).then(({ data, response }) => ({
      ...data,
      agentPrincipal: response.headers.get(SPHERE_AGENT_PRINCIPAL_HEADER) ?? undefined
    })),
  createSphereThreadInvite: (
    threadId: string,
    body?: {
      label?: string;
      purpose?: string;
      maxUses?: number;
      expiresInMinutes?: number;
    }
  ) =>
    request<SphereThreadInviteCreateResponse>(
      'POST',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/invites`,
      body ?? {}
    ),
  acceptSphereThreadInvite: (inviteCode: string) =>
    request<SphereThreadInviteAcceptResponse>(
      'POST',
      `${SPHERE_CANONICAL_BASE}/invites/${encodeURIComponent(inviteCode)}/accept`,
      {}
    ),
  revokeSphereThreadInvite: (
    threadId: string,
    inviteCode: string,
    body?: { reason?: string }
  ) =>
    request<SphereThreadInviteRevokeResponse>(
      'POST',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/invites/${encodeURIComponent(inviteCode)}/revoke`,
      body ?? {}
    ),
  removeSphereThreadMember: (threadId: string, memberPrincipal: string) =>
    request<SphereThreadMemberRemoveResponse>(
      'DELETE',
      `${SPHERE_CANONICAL_BASE}/threads/${threadId}/members/${encodeURIComponent(memberPrincipal)}`
    ),
  connectSphereThreadStream: (options: SphereThreadStreamOptions) => streamSphereThread(options),
  submitSphereMessage: async (input: {
    threadId: string;
    intent: string;
    payload?: Record<string, unknown>;
    missionId?: string;
    messageId?: string;
    traceId?: string;
    causationId?: string[];
    attestation?: string[];
    idempotencyKey?: string;
    prismHolderApproved?: boolean;
  }) => {
    const normalizedIntent = input.intent.trim();
    if (!normalizedIntent) {
      throw new ApiRequestError({
        status: 400,
        message: 'Message intent is required.'
      });
    }

    const dispatchEnvelope = await buildSignedDispatchEnvelope({
      threadId: input.threadId,
      missionId: input.missionId,
      messageId: input.messageId,
      traceId: input.traceId,
      intent: normalizedIntent,
      payload: input.payload ?? {},
      causationId: input.causationId,
      attestation: input.attestation,
      idempotencyKey: input.idempotencyKey,
      prismHolderApproved: input.prismHolderApproved
    });

    return request<SphereMessageWriteResponse>('POST', `${SPHERE_CANONICAL_BASE}/messages`, {
      threadId: dispatchEnvelope.threadId,
      missionId: dispatchEnvelope.missionId,
      authorAgentId: dispatchEnvelope.authorAgentId,
      messageId: dispatchEnvelope.messageId,
      traceId: dispatchEnvelope.traceId,
      intent: dispatchEnvelope.intent,
      attestation: dispatchEnvelope.attestation,
      schemaVersion: dispatchEnvelope.schemaVersion,
      protocolVersion: dispatchEnvelope.protocolVersion,
      causationId: dispatchEnvelope.causationId,
      idempotencyKey: dispatchEnvelope.idempotencyKey,
      agentSignature: dispatchEnvelope.agentSignature,
      prismHolderApproved: dispatchEnvelope.prismHolderApproved,
      payload: input.payload ?? {}
    });
  },
  submitSphereCycleEvent: async (input: {
    threadId: string;
    eventType: SphereCycleEventType;
    payload?: Record<string, unknown>;
    missionId?: string;
    messageId?: string;
    traceId?: string;
    causationId?: string[];
    attestation?: string[];
    idempotencyKey?: string;
    prismHolderApproved?: boolean;
  }) => {
    const payloadWithTaxonomy = {
      ...(input.payload ?? {}),
      cycleEventType: input.eventType
    };
    const dispatchEnvelope = await buildSignedDispatchEnvelope({
      threadId: input.threadId,
      missionId: input.missionId,
      messageId: input.messageId,
      traceId: input.traceId,
      intent: CYCLE_EVENT_INTENTS[input.eventType],
      payload: payloadWithTaxonomy,
      causationId: input.causationId,
      attestation: input.attestation,
      idempotencyKey: input.idempotencyKey,
      prismHolderApproved: input.prismHolderApproved
    });

    return request<SphereCycleEventWriteResponse>('POST', `${SPHERE_CANONICAL_BASE}/cycle-events`, {
      threadId: dispatchEnvelope.threadId,
      missionId: dispatchEnvelope.missionId,
      authorAgentId: dispatchEnvelope.authorAgentId,
      messageId: dispatchEnvelope.messageId,
      traceId: dispatchEnvelope.traceId,
      eventType: input.eventType,
      attestation: dispatchEnvelope.attestation,
      schemaVersion: dispatchEnvelope.schemaVersion,
      protocolVersion: dispatchEnvelope.protocolVersion,
      causationId: dispatchEnvelope.causationId,
      idempotencyKey: dispatchEnvelope.idempotencyKey,
      agentSignature: dispatchEnvelope.agentSignature,
      prismHolderApproved: dispatchEnvelope.prismHolderApproved,
      payload: input.payload ?? {}
    });
  },
  ackSphereThreadEntry: async (input: {
    threadId: string;
    targetSequence: number;
    targetMessageId: string;
    traceId?: string;
    ackMessageId?: string;
    attestation?: string[];
    receivedAt?: string;
  }) => {
    const ackEnvelope = await buildSignedAckEnvelope(input);
    return request<SphereAckWriteResponse>(
      'POST',
      `${SPHERE_CANONICAL_BASE}/threads/${input.threadId}/ack`,
      {
        actorDid: ackEnvelope.actorDid,
        targetSequence: ackEnvelope.targetSequence,
        targetMessageId: ackEnvelope.targetMessageId,
        ackMessageId: ackEnvelope.ackMessageId,
        traceId: ackEnvelope.traceId,
        intent: ackEnvelope.intent,
        schemaVersion: ackEnvelope.schemaVersion,
        attestation: ackEnvelope.attestation,
        agentSignature: ackEnvelope.agentSignature,
        ...(ackEnvelope.receivedAt ? { receivedAt: ackEnvelope.receivedAt } : {})
      }
    );
  },

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
    executeEndpoint<{ proposals: Proposal[] }>('GET', '/api/v1/citadel/proposals', { query: { sphereId } }),
  getGovernanceReport: (sphereId?: string) =>
    executeEndpoint('GET', '/api/v1/citadel/governance-report', { query: { sphereId } }),
  getConstitution: (sphereId?: string) =>
    executeEndpoint('GET', '/api/v1/citadel/constitution', { query: { sphereId } }),
  adviceProcess: (body: { voteId: string; notes: string }) =>
    request('POST', '/api/v1/citadel/advice-process', body),
  aiGovernanceReview: (body: { voteId: string }) =>
    request('POST', '/api/v1/citadel/ai-governance-review', body),
  emergencyShutdown: (body: { sphereId: string; reason: string }) =>
    request('POST', '/api/v1/citadel/emergency-shutdown', body),
  flagImpact: (body: { voteId: string; notes?: string }) =>
    request('POST', '/api/v1/citadel/flag-impact', body),
  governanceMeeting: (body: { sphereId: string; agenda: string; scheduledAt?: string }) =>
    request('POST', '/api/v1/citadel/governance-meeting', body),
  logGovernanceEvent: (body: { sphereId: string; eventType: string; payload?: Record<string, unknown> }) =>
    request('POST', '/api/v1/citadel/log-event', body),
  ratchet: (body: { voteId: string; decision: string }) =>
    request('POST', '/api/v1/citadel/ratchet', body),

  // Forge
  getPassport: () => request<{ passport: Passport }>('GET', '/api/v1/forge/passport'),
  getLenses: () => request<{ lenses: Lens[] }>('GET', '/api/v1/forge/lens'),
  getMyLens: () => request<{ lens: Lens | null }>('GET', '/api/v1/forge/my-lens'),
  getCxp: () => request('GET', '/api/v1/forge/cxp'),
  submitPerspective: (body: { gameId: string; content: string }) =>
    request('POST', '/api/v1/forge/perspective', body),
  askLens: (body: { gameId: string; lensId?: string }) =>
    request<{ hint: string; lensName: string }>('POST', '/api/v1/forge/ask', body),
  converge: (body: { gameId: string }) =>
    request('POST', '/api/v1/forge/converge', body),
  runDrill: (body: { question: string; lensId?: string }) =>
    request('POST', '/api/v1/forge/run-drill', body),
  getPrism: (gameId: string) =>
    executeEndpoint('GET', '/api/v1/forge/prism', { query: { gameId } }),
  getStory: (gameId: string) =>
    executeEndpoint('GET', '/api/v1/forge/story', { query: { gameId } }),
  summarize: (gameId: string) =>
    executeEndpoint('GET', '/api/v1/forge/summarize', { query: { gameId } }),

  // Hub
  broadcast: (body: { sphereId: string; message: string; messageType?: string }) =>
    request('POST', '/api/v1/hub/broadcast', body),
  cancelInvite: (body: { gameId: string }) =>
    request('POST', '/api/v1/hub/cancel-invite', body),
  declineInvite: (body: { gameId: string }) =>
    request('POST', '/api/v1/hub/decline', body),
  deferDecision: (body: { gameId: string; deferUntil?: string; reason?: string }) =>
    request('POST', '/api/v1/hub/defer', body),
  getEscalations: () => request('GET', '/api/v1/hub/escalations'),
  getEveryone: (gameId?: string) =>
    executeEndpoint('GET', '/api/v1/hub/everyone', { query: { gameId } }),
  sync: (body: { gameId: string }) => request('POST', '/api/v1/hub/sync', body),
  whoSeesWhat: (gameId: string) =>
    executeEndpoint('GET', '/api/v1/hub/who-sees-what', { query: { gameId } }),

  // Engine Room
  getStatusAll: () => request('GET', '/api/v1/engine-room/status-all'),
  getDbHealth: () => request('GET', '/api/v1/engine-room/db-health'),
  getDbView: (query?: { table?: string; limit?: number }) =>
    executeEndpoint('GET', '/api/v1/engine-room/db-view', { query }),
  deployConstellation: (body: { constellationId: string; question: string; groupSize?: number }) =>
    request('POST', '/api/v1/engine-room/deploy-constellation', body),
  getConfig: () => request('GET', '/api/v1/engine-room/config'),
  patchConfig: (body: { defaultGroupSize?: number; positionRevealSeconds?: number }) =>
    request('PATCH', '/api/v1/engine-room/config', body),
  listConstellations: () => request('GET', '/api/v1/engine-room/list-constellations'),
  getDrills: () => request('GET', '/api/v1/engine-room/drills'),
  exportGame: (gameId: string) =>
    executeEndpoint('GET', '/api/v1/engine-room/export', { query: { gameId } }),
  getGlossary: () => request('GET', '/api/v1/engine-room/glossary'),
  getFallbackReport: () => request('GET', '/api/v1/engine-room/fallback-report'),
  getRedTeamReport: () => request<EngineRoomRedTeamReportResponse>('GET', '/api/v1/engine-room/redteam-report'),
  heartbeatMute: (body: { gameId?: string; durationMinutes?: number }) =>
    request('POST', '/api/v1/engine-room/heartbeat-mute', body),
  pauseDrills: () => request('POST', '/api/v1/engine-room/pause-drills'),
  resumeDrills: () => request('POST', '/api/v1/engine-room/resume-drills'),
  getSphere: (sphereId?: string) =>
    executeEndpoint('GET', '/api/v1/engine-room/sphere', { query: { sphereId } }),
  whatIsASphere: () => request('GET', '/api/v1/engine-room/what-is-a-sphere')
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuntimeHealth = {
  status: 'ok' | 'degraded';
  bridge_ready: boolean;
  commands_module_path?: string;
  error?: string;
};

export type RuntimeBridgeState = {
  commands_module_path: string;
  loaded: boolean;
  load_error?: string | null;
};

export type RuntimeComputeOption = {
  provider_id: string;
  display_name?: string;
  kind?: string;
  configured?: boolean;
  available?: boolean;
  selected_global?: boolean;
  default_if_skipped?: boolean;
  [key: string]: unknown;
};

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

export type EngineRoomRedTeamScenario = {
  scenarioId: string;
  attackClass: string;
  status: 'passed' | 'failed';
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  capturedAt: string;
};

export type EngineRoomRedTeamReport = {
  generatedAt: string;
  suite: string;
  metrics: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    blockedProbeScenarios: number;
    attackClassCounts: Record<string, number>;
  };
  scenarios: EngineRoomRedTeamScenario[];
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

export type EngineRoomRedTeamRunSummary = {
  runId: string;
  generatedAt: string;
  status: 'passed' | 'failed';
  durationMs: number | null;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  blockedProbeScenarios: number;
  attackClassCounts: Record<string, number>;
  snapshotPath?: string;
};

export type EngineRoomRedTeamTrendPoint = {
  runId: string;
  generatedAt: string;
  status: 'passed' | 'failed';
  durationMs: number | null;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  blockedProbeScenarios: number;
  scenarioPassRate: number | null;
  attackClassCounts: Record<string, number>;
};

export type EngineRoomRedTeamHistory = {
  updatedAt: string;
  latestReportPath: string;
  latestSnapshotPath?: string;
  runs: EngineRoomRedTeamRunSummary[];
};

export type EngineRoomRedTeamTrend = {
  windowSize: number;
  runCount: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number | null;
  averageDurationMs: number | null;
  averageBlockedProbeScenarios: number | null;
  latestRunAt: string | null;
  attackClassTotals: Record<string, number>;
  series: EngineRoomRedTeamTrendPoint[];
};

export type EngineRoomRedTeamReportResponse = {
  ok: boolean;
  storageMode: 'auto' | 'file' | 'database';
  storageSource: 'unavailable' | 'filesystem' | 'database';
  reportAvailable: boolean;
  reportPath: string;
  updatedAt: string | null;
  report: EngineRoomRedTeamReport | null;
  historyAvailable: boolean;
  historyPath: string;
  history: EngineRoomRedTeamHistory | null;
  trend: EngineRoomRedTeamTrend | null;
  hapticTrigger?: string | null;
};

export type SphereCapabilities = {
  sphereThreadEnabled: boolean;
  auth?: {
    boundary?: string;
    principal?: string | null;
    serviceTokenRequired?: boolean;
    agentApiKeyHeader?: string;
    agentApiKeyWriteRequired?: boolean;
    threadAccessModel?: string;
  };
  features?: {
    missions?: boolean;
    messages?: boolean;
    cycleEvents?: boolean;
    dids?: boolean;
    threadRead?: boolean;
    threadAcks?: boolean;
    replay?: boolean;
    stream?: boolean;
    ack?: boolean;
    haltAll?: boolean;
    threadMemberships?: boolean;
    threadInvites?: boolean;
    lensUpgradeRules?: boolean;
    lensProgression?: boolean;
    cycleState?: boolean;
  };
  protocol?: {
    stream?: {
      mode?: string;
      replay?: boolean;
      ack?: boolean;
      cursorQuery?: string;
      ackCursorQuery?: string;
      fromSequenceQuery?: string;
      retryMs?: number;
    };
    writeEnvelope?: {
      schemaVersion?: string;
      missionsRequiredFields?: string[];
      messagesRequiredFields?: string[];
      cycleEventsRequiredFields?: string[];
      ackRequiredFields?: string[];
    };
    cycleEventTaxonomy?: {
      eventTypes?: SphereCycleEventType[];
      phaseTransitions?: {
        start?: SphereCycleEventType[];
        seat_taken?: SphereCycleEventType[];
        perspective_submitted?: SphereCycleEventType[];
        synthesis_returned?: SphereCycleEventType[];
        lens_upgraded?: SphereCycleEventType[];
      };
      initialEventTypes?: SphereCycleEventType[];
    };
  };
};

export type SphereLensUpgradeRule = {
  ruleId: string;
  fromVersion: string;
  toVersion: string;
  permittedLensIds?: string[];
  rationale?: string;
};

export type SphereLensUpgradeRulesResponse = {
  registryVersion: string | null;
  description: string | null;
  tupleFields: string[];
  rules: SphereLensUpgradeRule[];
  traceId?: string;
};

export type SphereStatus = {
  systemState: string;
  degradedNoLlmReason?: string | null;
  threadCount: number;
  degradedThreads: number;
  haltedThreads: number;
  traceId?: string;
};

export type SphereCycleEventType =
  | 'seat_taken'
  | 'perspective_submitted'
  | 'synthesis_returned'
  | 'lens_upgraded';

export type SphereClientEnvelope = {
  messageId: string;
  threadId: string;
  authorAgentId: string;
  intent: string;
  protocolVersion: string;
  schemaVersion: string;
  traceId: string;
  causationId: string[];
  attestation: string[];
  idempotencyKey?: string;
  agentSignature: string;
};

export type SphereLedgerEnvelope = {
  schemaVersion: string;
  sequence: number;
  prevMessageHash: string;
  timestamp: string;
  conductorSignature: string;
};

export type SphereThreadEntry = {
  clientEnvelope: SphereClientEnvelope;
  ledgerEnvelope: SphereLedgerEnvelope;
  payload: Record<string, unknown>;
};

export type SphereThread = {
  threadId: string;
  missionId: string;
  createdAt: string;
  createdBy: string;
  state: string;
  entries: SphereThreadEntry[];
  traceId?: string;
};

export type SphereLensProgressionUpgrade = {
  sequence: number;
  messageId: string | null;
  traceId: string | null;
  ruleId: string | null;
  fromVersion: string;
  toVersion: string;
  selectedLensId: string | null;
  timestamp: string | null;
};

export type SphereLensProgressionResponse = {
  threadId: string;
  initialVersion: string;
  currentVersion: string;
  upgradeCount: number;
  latestUpgrade: SphereLensProgressionUpgrade | null;
  upgrades: SphereLensProgressionUpgrade[];
  traceId?: string;
};

export type SphereCycleStateEventCounts = Record<SphereCycleEventType, number>;

export type SphereCycleStateLastEvent = {
  eventType: SphereCycleEventType;
  sequence: number;
  messageId: string | null;
  traceId: string | null;
  timestamp: string | null;
};

export type SphereCycleStateResponse = {
  threadId: string;
  threadState: string;
  phase: SphereCycleEventType | null;
  expectedNextEventTypes: SphereCycleEventType[];
  initialEventTypes: SphereCycleEventType[];
  cycleStarted: boolean;
  completedRounds: number;
  eventCounts: SphereCycleStateEventCounts;
  lastEvent: SphereCycleStateLastEvent | null;
  traceId?: string;
};

export type SphereReplayResponse = {
  threadId: string;
  cursor: number;
  nextCursor: number;
  entries: SphereThreadEntry[];
  traceId?: string;
};

export type SphereAckRecord = {
  ackId: number;
  threadId: string;
  targetSequence: number;
  targetMessageId: string;
  actorDid: string;
  ackMessageId: string;
  traceId: string;
  intent: string;
  schemaVersion: string;
  attestation: string[];
  agentSignature: string;
  receivedAt: string | null;
  acknowledgedAt: string;
};

export type SphereAckReplayResponse = {
  threadId: string;
  cursor: number;
  nextCursor: number;
  acks: SphereAckRecord[];
  traceId?: string;
};

export type SphereCycleEventWriteResponse = {
  threadId: string;
  eventType: SphereCycleEventType;
  intent: string;
  sequence: number;
  timestamp: string;
  traceId?: string;
};

export type SphereMessageWriteResponse = {
  threadId: string;
  sequence: number;
  timestamp: string;
  traceId?: string;
};

export type SphereAckWriteResponse = {
  ack: SphereAckRecord;
  traceId?: string;
};

export type SphereThreadMember = {
  threadId: string;
  principal: string;
  role: 'owner' | 'member';
  invitedBy?: string;
  inviteCode?: string;
  joinedAt: string;
};

export type SphereThreadMembersResponse = {
  threadId: string;
  agentPrincipal?: string;
  principal?: string;
  requestPrincipal?: string;
  requestRole?: 'owner' | 'member' | null;
  members: SphereThreadMember[];
  count: number;
  traceId?: string;
};

export type SphereThreadInvite = {
  inviteCode: string;
  threadId: string;
  createdBy: string;
  label?: string;
  purpose?: string;
  maxUses: number;
  usedCount: number;
  remainingUses: number;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
  createdAt: string;
};

export type SphereThreadInvitesResponse = {
  threadId: string;
  agentPrincipal?: string;
  requestPrincipal?: string;
  requestRole?: 'owner' | 'member' | null;
  invites: SphereThreadInvite[];
  count: number;
  traceId?: string;
};

export type SphereThreadInviteCreateResponse = {
  invite: SphereThreadInvite;
  startParam: string;
  traceId?: string;
};

export type SphereThreadInviteAcceptance = {
  inviteCode: string;
  threadId: string;
  principal: string;
  role: 'owner' | 'member';
  acceptedAt: string;
  remainingUses: number;
  expiresAt?: string;
};

export type SphereThreadInviteAcceptResponse = {
  acceptance: SphereThreadInviteAcceptance;
  traceId?: string;
};

export type SphereThreadInviteRevokeResponse = {
  invite: SphereThreadInvite;
  traceId?: string;
};

export type SphereThreadMembershipRemoval = {
  threadId: string;
  principal: string;
  role: 'owner' | 'member';
  removedAt: string;
};

export type SphereThreadMemberRemoveResponse = {
  removal: SphereThreadMembershipRemoval;
  traceId?: string;
};
