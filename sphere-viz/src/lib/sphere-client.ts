import { useCallback, useEffect, useRef, useState } from 'react';

export interface SphereEvent {
  type: 'SPHERE_EVENT';
  thread: string;
  threadId: string;
  data: {
    messageId: string;
    authorAgentId: string;
    intent: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
    traceId?: string;
    replay?: boolean;
    sequence?: number;
    raw?: unknown;
  };
}

export interface SphereRegistryEvent {
  type: 'THREAD_REGISTRY';
  threads: Record<string, string>;
}

export interface SphereErrorEvent {
  type: 'ERROR';
  message: string;
}

export interface ProviderRuntimeStatus {
  providerId: string;
  label: string;
  available: boolean;
  configured: boolean;
  status: 'live' | 'unavailable';
  model?: string;
  runtimeBackend?: string;
}

export interface ProviderRuntimeState {
  ok: boolean;
  snapshotPath: string;
  globalProviderId: string | null;
  recommendedProviderId: string | null;
  providers: ProviderRuntimeStatus[];
}

export type SphereBridgeMessage = SphereEvent | SphereRegistryEvent | SphereErrorEvent;

export interface SphereBridgeState {
  connected: boolean;
  events: SphereEvent[];
  threads: Record<string, string>;
  publish: (thread: string, intent: string, payload: Record<string, unknown>) => void;
  clearEvents: () => void;
}

const SPHERE_BRIDGE_URL = import.meta.env.VITE_SPHERE_BRIDGE_URL || 'ws://localhost:3013/ws';
const SPHERE_BRIDGE_TOKEN = import.meta.env.VITE_SPHERE_BRIDGE_TOKEN || 'dev-sphere-bridge-token';
const MAX_EVENTS = 500;

function normalizeSphereEvent(message: any): SphereEvent {
  const rawData = message?.data ?? {};
  const entry = rawData?.entry;
  if (entry?.clientEnvelope) {
    return {
      type: 'SPHERE_EVENT',
      thread: message.thread,
      threadId: message.threadId,
      data: {
        messageId: entry.clientEnvelope.messageId ?? 'unknown-message',
        authorAgentId: entry.clientEnvelope.authorAgentId ?? 'unknown-author',
        intent: entry.clientEnvelope.intent ?? 'UNKNOWN',
        payload: entry.payload ?? {},
        createdAt: entry.ledgerEnvelope?.timestamp,
        traceId: entry.clientEnvelope.traceId,
        replay: Boolean(rawData?.replay),
        sequence:
          typeof rawData?.cursor === 'number'
            ? rawData.cursor
            : typeof entry.ledgerEnvelope?.sequence === 'number'
              ? entry.ledgerEnvelope.sequence
              : undefined,
        raw: rawData,
      },
    };
  }

  return {
    type: 'SPHERE_EVENT',
    thread: message.thread,
    threadId: message.threadId,
    data: {
      messageId: rawData?.messageId ?? 'unknown-message',
      authorAgentId: rawData?.authorAgentId ?? 'unknown-author',
      intent: rawData?.intent ?? 'UNKNOWN',
      payload: rawData?.payload,
      createdAt: rawData?.createdAt,
      traceId: rawData?.traceId,
      replay: Boolean(rawData?.replay),
      sequence: typeof rawData?.cursor === 'number' ? rawData.cursor : undefined,
      raw: rawData,
    },
  };
}

export function bridgeHttpBaseUrl(): string {
  const explicit = import.meta.env.VITE_SPHERE_BRIDGE_HTTP_URL as string | undefined;
  if (explicit && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }

  return SPHERE_BRIDGE_URL.replace(/^ws/i, 'http').replace(/\/ws$/, '');
}

export function useSphereBridge(): SphereBridgeState {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<SphereEvent[]>([]);
  const [threads, setThreads] = useState<Record<string, string>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const url = `${SPHERE_BRIDGE_URL}?token=${SPHERE_BRIDGE_TOKEN}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[sphere] Connected to Sphere Bridge');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as SphereBridgeMessage | any;
        if (msg.type === 'THREAD_REGISTRY') {
          setThreads(msg.threads);
        } else if (msg.type === 'SPHERE_EVENT') {
          const normalized = normalizeSphereEvent(msg);
          setEvents((prev) => {
            const next = [...prev, normalized];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        } else if (msg.type === 'ERROR') {
          console.error('[sphere] Bridge error:', msg.message);
        }
      } catch (err) {
        console.error('[sphere] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[sphere] Disconnected. Reconnecting in 3s...');
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('[sphere] WebSocket error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const publish = useCallback((thread: string, intent: string, payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'PUBLISH', thread, intent, payload }));
    } else {
      console.warn('[sphere] Cannot publish: WebSocket not connected');
    }
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { connected, events, threads, publish, clearEvents };
}

export function filterByThread(events: SphereEvent[], threadName: string): SphereEvent[] {
  return events.filter((e) => e.thread === threadName);
}

export function filterByIntent(events: SphereEvent[], intent: string): SphereEvent[] {
  return events.filter((e) => e.data.intent === intent.toUpperCase());
}

export const SPHERE_THREADS = [
  'membrane-inbound', 'membrane-outbound', 'mcp-boundary', 'a2a-dmz',
  'heartbeat', 'guardian-narratives', 'genesis', 'aar-artifacts',
  'council', 'council-synthesis', 'council-quorum',
  'liturgy-pulse', 'liturgy-responses', 'liturgy-forge',
  'synthesis-core', 'perspective-refractor', 'event-relay', 'vigilance-watch', 'audit-log',
  'audit-membrane', 'audit-council', 'audit-forge',
  'external-telegram', 'external-discord', 'external-api', 'external-mcp',
  'value-pulse',
] as const;

export type SphereThreadName = typeof SPHERE_THREADS[number];

export async function fetchProviderRuntimeState(): Promise<ProviderRuntimeState> {
  const response = await fetch(`${bridgeHttpBaseUrl()}/api/providers`);
  if (!response.ok) {
    throw new Error(`Failed to load provider runtime state: ${response.status}`);
  }
  return response.json();
}
