import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_METACANON_CORE_DIR = path.join(ROOT_DIR, 'metacanon-core');
const DEFAULT_METACANON_CORE_BIN = path.join(DEFAULT_METACANON_CORE_DIR, 'target', 'debug', 'metacanon');

const DEFAULT_RUNTIME_SNAPSHOT_PATH = process.env.HOME
  ? path.join(process.env.HOME, '.metacanon_ai', 'runtime_snapshot.json')
  : path.join(ROOT_DIR, 'runtime_snapshot.json');

const SPHERE_ENGINE_URL = process.env.SPHERE_ENGINE_URL || 'http://localhost:3101';
const SPHERE_BFF_SERVICE_TOKEN = process.env.SPHERE_BFF_SERVICE_TOKEN || 'dev-sphere-bff-service-token';
const SPHERE_BRIDGE_TOKEN = process.env.SPHERE_BRIDGE_TOKEN || 'dev-sphere-bridge-token';
const PORT = Number.parseInt(process.env.PORT || '3013', 10);
const SPHERE_API_BASE = `${SPHERE_ENGINE_URL}/api/v1/sphere`;
const METACANON_CORE_DIR = process.env.METACANON_CORE_DIR || DEFAULT_METACANON_CORE_DIR;
const METACANON_CORE_BIN = process.env.METACANON_CORE_BIN || DEFAULT_METACANON_CORE_BIN;
const RUNTIME_SNAPSHOT_PATH = process.env.METACANON_RUNTIME_SNAPSHOT_PATH || DEFAULT_RUNTIME_SNAPSHOT_PATH;
const LOCAL_PATH = process.env.PATH || '';
const METACANON_RUNTIME_PATH = [
  '/opt/homebrew/opt/rustup/bin',
  process.env.HOME ? path.join(process.env.HOME, '.cargo', 'bin') : null,
  LOCAL_PATH,
]
  .filter(Boolean)
  .join(':');

const THREAD_NAMES = [
  'prism-inbound',
  'torus-rounds',
  'lane-watcher',
  'lane-synthesis',
  'lane-auditor',
  'prism-outbound',
  'task-events',
  'memory-events',
  'constitution-events',
  'audit-events',
  'external-telegram',
  'external-discord',
  'external-inapp'
];

function deriveThreadUuid(threadName: string): string {
  const hash = crypto.createHash('sha256').update(`metacanon-thread:${threadName}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const THREAD_UUID_MAP: Record<string, string> = {};
for (const name of THREAD_NAMES) {
  THREAD_UUID_MAP[name] = deriveThreadUuid(name);
}

const lastCursorByThread = new Map<string, number>();
const replayInitializedByThread = new Set<string>();
const replayInFlightByThread = new Set<string>();
const THREAD_REPLAY_POLL_MS = 1200;

const PROVIDER_LABELS: Record<string, string> = {
  qwen_local: 'Qwen Local',
  ollama: 'Ollama',
  moonshot_kimi: 'Moonshot Kimi',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  grok: 'Grok',
  morpheus: 'Morpheus',
};

const PROVIDER_PREFERENCE = [
  'qwen_local',
  'ollama',
  'moonshot_kimi',
  'openai',
  'anthropic',
  'grok',
  'morpheus',
];

type PrismRoundBridgeRequest = {
  query?: string;
  providerId?: string;
  channel?: string;
  forceDeliberation?: boolean;
};

type ProviderRuntimeStatus = {
  providerId: string;
  label: string;
  available: boolean;
  configured: boolean;
  status: 'live' | 'unavailable';
  model?: string;
  runtimeBackend?: string;
};

type ProviderRuntimeState = {
  snapshotPath: string;
  globalProviderId: string | null;
  recommendedProviderId: string | null;
  providers: ProviderRuntimeStatus[];
};

type ParsedPrismRound = {
  orchestrator?: string;
  signerDid?: string;
  route?: string;
  roundId?: string;
  eventPublish?: string;
  skill?: {
    skillId?: string;
    status?: string;
    message?: string;
    code?: string;
    runId?: string;
    output?: string;
  };
  provider?: string;
  model?: string;
  usedFallback?: boolean;
  output?: string;
  lanes: Array<{
    lane: string;
    provider?: string;
    model?: string;
    fallback?: boolean;
    output?: string;
  }>;
};

async function spherePost(pathname: string, body: object): Promise<any> {
  const response = await fetch(`${SPHERE_API_BASE}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sphere-service-token': SPHERE_BFF_SERVICE_TOKEN
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Sphere API error [${response.status}] on POST ${pathname}: ${text}`);
  }

  return response.json().catch(() => ({}));
}

async function publishToThread(threadName: string, intent: string, payload: object, authorId = 'sphere-bridge'): Promise<void> {
  const threadId = THREAD_UUID_MAP[threadName];
  if (!threadId) throw new Error(`Unknown thread: ${threadName}`);

  await spherePost('/messages', {
    threadId,
    authorAgentId: `did:key:${authorId}`,
    messageId: uuidv4(),
    traceId: uuidv4(),
    intent: intent.toUpperCase(),
    attestation: [],
    schemaVersion: '3.0',
    agentSignature: 'sphere-bridge-v1',
    payload
  });
}

function providerLiveStatus(providerId: string, rawConfig: Record<string, unknown>): { configured: boolean; status: 'live' | 'unavailable' } {
  const explicitlyAvailable = rawConfig.available !== false;
  if (!explicitlyAvailable) {
    return { configured: false, status: 'unavailable' };
  }

  const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

  switch (providerId) {
    case 'openai':
    case 'anthropic':
    case 'moonshot_kimi':
    case 'grok': {
      const configured = nonEmpty(rawConfig.api_key);
      return { configured, status: configured ? 'live' : 'unavailable' };
    }
    case 'morpheus': {
      const configured = nonEmpty(rawConfig.endpoint) && nonEmpty(rawConfig.model) && nonEmpty(rawConfig.key_id);
      return { configured, status: configured ? 'live' : 'unavailable' };
    }
    case 'ollama': {
      const configured = nonEmpty(rawConfig.base_url) && nonEmpty(rawConfig.default_model);
      return { configured, status: configured ? 'live' : 'unavailable' };
    }
    case 'qwen_local': {
      const configured = nonEmpty(rawConfig.base_url) && nonEmpty(rawConfig.primary_model_id);
      return { configured, status: configured ? 'live' : 'unavailable' };
    }
    default:
      return { configured: false, status: 'unavailable' };
  }
}

function providerConfigured(rawConfig: Record<string, unknown>): boolean {
  for (const key of ['api_key', 'base_url', 'endpoint', 'model', 'default_model_id', 'primary_model_id']) {
    const value = rawConfig[key];
    if (typeof value === 'string' && value.trim()) {
      return true;
    }
  }
  return rawConfig.available === true;
}

function loadProviderRuntimeState(): ProviderRuntimeState {
  try {
    const raw = fs.readFileSync(RUNTIME_SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw) as Record<string, unknown>;
    const providerConfigs = (snapshot.provider_configs && typeof snapshot.provider_configs === 'object'
      ? snapshot.provider_configs
      : {}) as Record<string, Record<string, unknown>>;

    const providers = Object.entries(providerConfigs).map(([providerId, config]) => {
      const liveStatus = providerLiveStatus(providerId, config);
      return {
        providerId,
        label: PROVIDER_LABELS[providerId] || providerId,
        available: liveStatus.status === 'live',
        configured: liveStatus.configured,
        status: liveStatus.status,
        model: typeof config.model === 'string' ? config.model : typeof config.default_model_id === 'string' ? config.default_model_id : undefined,
        runtimeBackend: typeof config.runtime_backend === 'string' ? config.runtime_backend : undefined,
      } satisfies ProviderRuntimeStatus;
    });

    providers.sort((left, right) => {
      const leftIndex = PROVIDER_PREFERENCE.indexOf(left.providerId);
      const rightIndex = PROVIDER_PREFERENCE.indexOf(right.providerId);
      const leftRank = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
      const rightRank = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.label.localeCompare(right.label);
    });

    const recommendedProvider = providers.find((provider) => provider.status === 'live' && provider.configured)
      || providers.find((provider) => provider.status === 'live')
      || null;

    return {
      snapshotPath: RUNTIME_SNAPSHOT_PATH,
      globalProviderId: typeof snapshot.global_provider_id === 'string' ? snapshot.global_provider_id : null,
      recommendedProviderId: recommendedProvider?.providerId || null,
      providers,
    };
  } catch (error) {
    return {
      snapshotPath: RUNTIME_SNAPSHOT_PATH,
      globalProviderId: null,
      recommendedProviderId: null,
      providers: [],
    };
  }
}

function parsePrismRoundOutput(stdout: string): ParsedPrismRound {
  const result: ParsedPrismRound = { lanes: [] };
  const lines = stdout.replace(/\r\n/g, '\n').split('\n');
  let currentLane: ParsedPrismRound['lanes'][number] | null = null;
  let capture: 'lane_output' | 'output' | null = null;

  const flushToCapture = (line: string) => {
    if (capture === 'lane_output' && currentLane) {
      currentLane.output = currentLane.output ? `${currentLane.output}\n${line}` : line;
      return true;
    }
    if (capture === 'output') {
      result.output = result.output ? `${result.output}\n${line}` : line;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (line.startsWith('orchestrator=')) {
      capture = null;
      result.orchestrator = line.slice('orchestrator='.length).trim();
      continue;
    }
    if (line.startsWith('signer_did=')) {
      capture = null;
      result.signerDid = line.slice('signer_did='.length).trim();
      continue;
    }
    if (line.startsWith('route=')) {
      capture = null;
      result.route = line.slice('route='.length).trim();
      continue;
    }
    if (line.startsWith('round_id=')) {
      capture = null;
      result.roundId = line.slice('round_id='.length).trim();
      continue;
    }
    if (line.startsWith('event_publish=')) {
      capture = null;
      result.eventPublish = line.slice('event_publish='.length).trim();
      continue;
    }
    if (line.startsWith('lane=')) {
      capture = null;
      const parts = line.trim().split(/\s+/);
      currentLane = {
        lane: parts[0]?.split('=')[1] || 'unknown',
        provider: parts[1]?.split('=')[1],
        model: parts[2]?.split('=')[1],
        fallback: parts[3]?.split('=')[1] === 'true',
      };
      result.lanes.push(currentLane);
      continue;
    }
    if (line.startsWith('lane_output=')) {
      capture = 'lane_output';
      const value = line.slice('lane_output='.length);
      if (currentLane) {
        currentLane.output = value;
      }
      continue;
    }
    if (line.startsWith('provider=')) {
      capture = null;
      result.provider = line.slice('provider='.length).trim();
      continue;
    }
    if (line.startsWith('skill_id=')) {
      capture = null;
      result.skill = result.skill || {};
      result.skill.skillId = line.slice('skill_id='.length).trim();
      continue;
    }
    if (line.startsWith('skill_status=')) {
      capture = null;
      result.skill = result.skill || {};
      result.skill.status = line.slice('skill_status='.length).trim();
      continue;
    }
    if (line.startsWith('skill_message=')) {
      capture = null;
      result.skill = result.skill || {};
      result.skill.message = line.slice('skill_message='.length).trim();
      continue;
    }
    if (line.startsWith('skill_code=')) {
      capture = null;
      result.skill = result.skill || {};
      result.skill.code = line.slice('skill_code='.length).trim();
      continue;
    }
    if (line.startsWith('skill_run_id=')) {
      capture = null;
      result.skill = result.skill || {};
      result.skill.runId = line.slice('skill_run_id='.length).trim();
      continue;
    }
    if (line.startsWith('skill_output=')) {
      capture = null;
      result.skill = result.skill || {};
      result.skill.output = line.slice('skill_output='.length).trim();
      continue;
    }
    if (line.startsWith('model=')) {
      capture = null;
      result.model = line.slice('model='.length).trim();
      continue;
    }
    if (line.startsWith('used_fallback=')) {
      capture = null;
      result.usedFallback = line.slice('used_fallback='.length).trim() === 'true';
      continue;
    }
    if (line.startsWith('output=')) {
      capture = 'output';
      result.output = line.slice('output='.length);
      continue;
    }
    flushToCapture(line);
  }

  if (result.output) {
    result.output = result.output.trim();
  }
  for (const lane of result.lanes) {
    if (lane.output) {
      lane.output = lane.output.trim();
    }
  }
  return result;
}

function runPrismRound(request: PrismRoundBridgeRequest): Promise<{ stdout: string; stderr: string; parsed: ParsedPrismRound }> {
  const query = request.query?.trim();
  if (!query) {
    return Promise.reject(new Error('query is required'));
  }

  const channel = request.channel?.trim() || 'sphereviz';
  const providerId = request.providerId?.trim() || 'moonshot_kimi';
  const forceDeliberation = request.forceDeliberation !== false;
  const preferredCommand = METACANON_CORE_BIN;
  const preferredArgs = ['prism-round', query, '--channel', channel, '--provider', providerId];
  if (forceDeliberation) {
    preferredArgs.push('--force-deliberation');
  } else {
    preferredArgs.push('--direct');
  }

  const fallbackCommand = 'cargo';
  const fallbackArgs = ['run', '--', ...preferredArgs];

  return new Promise((resolve, reject) => {
    const command = requireBinary(preferredCommand) ? preferredCommand : fallbackCommand;
    const args = command === preferredCommand ? preferredArgs : fallbackArgs;
    const child = spawn(command, args, {
      cwd: METACANON_CORE_DIR,
      env: {
        ...process.env,
        PATH: METACANON_RUNTIME_PATH,
        SPHERE_ENGINE_URL,
        SPHERE_BFF_SERVICE_TOKEN,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Prism round timed out after 120s'));
    }, 120000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `metacanon prism-round exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr, parsed: parsePrismRoundOutput(stdout) });
    });
  });
}

function requireBinary(candidatePath: string): boolean {
  try {
    return Boolean(candidatePath) && !process.env.METACANON_CORE_FORCE_CARGO && fs.existsSync(candidatePath);
  } catch {
    return false;
  }
}

function forwardThreadEntry(
  threadName: string,
  threadId: string,
  payload: { cursor?: number; replay?: boolean; entry?: unknown }
): void {
  const cursor = typeof payload?.cursor === 'number'
    ? payload.cursor
    : typeof (payload?.entry as any)?.ledgerEnvelope?.sequence === 'number'
      ? (payload!.entry as any).ledgerEnvelope.sequence
      : null;

  if (cursor !== null) {
    const lastCursor = lastCursorByThread.get(threadName) ?? 0;
    if (cursor <= lastCursor) {
      return;
    }
    lastCursorByThread.set(threadName, cursor);
  }

  broadcast({ type: 'SPHERE_EVENT', thread: threadName, threadId, data: payload });
}

async function replayThreadEntries(
  threadName: string,
  options: { force?: boolean; markReplay?: boolean } = {}
): Promise<void> {
  const { force = false, markReplay } = options;

  if (replayInFlightByThread.has(threadName) && !force) {
    return;
  }

  const threadId = THREAD_UUID_MAP[threadName];
  if (!threadId) {
    return;
  }

  replayInFlightByThread.add(threadName);
  try {
    const cursor = lastCursorByThread.get(threadName) ?? 0;
    const response = await fetch(
      `${SPHERE_API_BASE}/threads/${threadId}/replay?cursor=${cursor}`,
      {
        headers: {
          Accept: 'application/json',
          'x-sphere-service-token': SPHERE_BFF_SERVICE_TOKEN,
        },
      }
    );

    if (!response.ok) {
      return;
    }

    const body = await response.json().catch(() => null) as
      | { entries?: Array<{ ledgerEnvelope?: { sequence?: number } }> }
      | null;
    const entries = Array.isArray(body?.entries) ? body.entries : [];
    const shouldMarkReplay =
      typeof markReplay === 'boolean' ? markReplay : !replayInitializedByThread.has(threadName);

    for (const entry of entries) {
      const sequence =
        typeof entry?.ledgerEnvelope?.sequence === 'number'
          ? entry.ledgerEnvelope.sequence
          : undefined;
      forwardThreadEntry(threadName, threadId, {
        replay: shouldMarkReplay,
        cursor: sequence,
        entry,
      });
    }

    replayInitializedByThread.add(threadName);
  } catch {
    // Ignore poll failures; the next interval or stream reconnect can recover.
  } finally {
    replayInFlightByThread.delete(threadName);
  }
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();

function broadcast(data: object): void {
  const encoded = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const token = url.searchParams.get('token');
  if (token !== SPHERE_BRIDGE_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  clients.add(ws);
  ws.send(JSON.stringify({ type: 'THREAD_REGISTRY', threads: THREAD_UUID_MAP }));

  ws.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'PUBLISH' && message.thread && message.intent && message.payload) {
        await publishToThread(message.thread, message.intent, message.payload, message.authorId || 'ws-client');
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'ERROR', message: error instanceof Error ? error.message : 'unknown bridge error' }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

async function subscribeToThread(threadName: string): Promise<void> {
  const threadId = THREAD_UUID_MAP[threadName];
  const url = `${SPHERE_API_BASE}/threads/${threadId}/stream`;

  const connect = async () => {
    try {
      const lastCursor = lastCursorByThread.get(threadName) ?? 0;
      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          'x-sphere-service-token': SPHERE_BFF_SERVICE_TOKEN,
          'last-event-id': String(lastCursor),
        }
      });

      if (!response.ok || !response.body) {
        setTimeout(connect, 5000);
        return;
      }

      let buffer = '';
      response.body.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const lines = block.split('\n');
          let eventName = 'message';
          let dataPayload = '';
          let eventId: number | null = null;

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataPayload += line.slice(6);
            } else if (line.startsWith('id: ')) {
              const parsed = Number.parseInt(line.slice(4).trim(), 10);
              if (Number.isFinite(parsed)) {
                eventId = parsed;
              }
            }
          }

          if (eventName !== 'log_entry' || !dataPayload) {
            continue;
          }

          try {
            const data = JSON.parse(dataPayload) as Record<string, unknown>;
            if (eventId !== null && typeof data.cursor !== 'number') {
              data.cursor = eventId;
            }
            forwardThreadEntry(threadName, threadId, data as { cursor?: number; replay?: boolean; entry?: unknown });
          } catch {
            // ignore malformed SSE lines
          }
        }
      });

      response.body.on('error', () => {
        setTimeout(connect, 5000);
      });

      response.body.on('end', () => {
        setTimeout(connect, 2000);
      });
    } catch {
      setTimeout(connect, 5000);
    }
  };

  await replayThreadEntries(threadName);
  connect();
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json());
app.get('/health', (_req, res) => {
  res.json({ ok: true, clients: clients.size, threads: THREAD_UUID_MAP });
});

app.get('/threads', (_req, res) => {
  res.json({ threads: THREAD_UUID_MAP });
});

app.get('/api/providers', (_req, res) => {
  res.json({ ok: true, ...loadProviderRuntimeState() });
});

app.post('/publish', async (req, res) => {
  const { thread, intent, payload, authorId } = req.body || {};
  if (!thread || !intent || !payload) {
    res.status(400).json({ error: 'thread, intent, and payload are required' });
    return;
  }

  try {
    await publishToThread(thread, intent, payload, authorId || 'bridge-rest');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'publish failed' });
  }
});

app.post('/api/prism-round', async (req, res) => {
  try {
    const result = await runPrismRound(req.body || {});
    await Promise.allSettled(
      THREAD_NAMES.map((threadName) =>
        replayThreadEntries(threadName, { force: true, markReplay: false })
      )
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'prism round failed',
    });
  }
});

for (const threadName of THREAD_NAMES) {
  subscribeToThread(threadName);
}

setInterval(() => {
  for (const threadName of THREAD_NAMES) {
    void replayThreadEntries(threadName);
  }
}, THREAD_REPLAY_POLL_MS);

server.listen(PORT, () => {
  console.log(`[sphere-bridge] listening on :${PORT}`);
});
