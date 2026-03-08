import { useEffect, useMemo, useRef, useState } from "react";
import { bridgeHttpBaseUrl, fetchProviderRuntimeState, useSphereBridge, type ProviderRuntimeStatus, type SphereEvent } from "@/lib/sphere-client";

type NodeConfig = {
  id: string;
  label: string;
  subtitle: string;
  color: string;
  description: string;
  angle?: number;
};

type RenderNode = NodeConfig & {
  x: number;
  y: number;
  radius: number;
};

type Packet = {
  id: number;
  fromId: string;
  toId: string;
  color: string;
  progress: number;
  intent: string;
};

type RuntimeSummary = {
  latestRoundId: string | null;
  latestIntent: string | null;
  latestProvider: string | null;
  latestModel: string | null;
  runningTask: string | null;
  threadCounts: Record<string, number>;
};

type PrismPanelResult = {
  route?: string;
  roundId?: string;
  provider?: string;
  model?: string;
  eventPublish?: string;
  output?: string;
  lanes: Array<{
    lane: string;
    provider?: string;
    model?: string;
    fallback?: boolean;
    output?: string;
  }>;
};

type ProviderPanelState = {
  snapshotPath: string | null;
  globalProviderId: string | null;
  recommendedProviderId: string | null;
  providers: ProviderRuntimeStatus[];
};

type PrismInvocation = {
  query: string;
  providerId: string;
  submittedAt: string;
  result: PrismPanelResult;
};

type IndexedSphereEvent = {
  event: SphereEvent;
  index: number;
};

const COLORS = {
  background: "#061019",
  panel: "rgba(9, 15, 24, 0.78)",
  border: "rgba(148, 163, 184, 0.18)",
  muted: "#94A3B8",
  text: "#E2E8F0",
  prism: "#61E4FF",
  torus: "#A78BFA",
  watcher: "#34D399",
  synthesis: "#FB923C",
  auditor: "#F5D06C",
  engine: "#38BDF8",
  bridge: "#10B981",
  postgres: "#EAB308",
};

const PRIMARY_NODES: NodeConfig[] = [
  {
    id: "prism",
    label: "Prism",
    subtitle: "User Interface",
    color: COLORS.prism,
    angle: -90,
    description:
      "Receives user messages, decides whether to answer directly or open a Torus round, and returns the final response back through the selected channel.",
  },
  {
    id: "torus",
    label: "Torus",
    subtitle: "Round Coordinator",
    color: COLORS.torus,
    angle: -18,
    description:
      "Coordinates multi-step rounds between Watcher, Synthesis, and Auditor. This is the real deliberation surface, not provider failover.",
  },
  {
    id: "watcher",
    label: "Watcher",
    subtitle: "Constitution & Risk",
    color: COLORS.watcher,
    angle: 54,
    description:
      "Reviews requests and candidate actions for constitutional alignment, safety, and sovereignty concerns before actions are trusted.",
  },
  {
    id: "synthesis",
    label: "Synthesis",
    subtitle: "Constructive Reasoning",
    color: COLORS.synthesis,
    angle: 126,
    description:
      "Produces the constructive answer, plan, or task framing that Torus can converge on and Prism can surface to the user.",
  },
  {
    id: "auditor",
    label: "Auditor",
    subtitle: "Trace & Attestation",
    color: COLORS.auditor,
    angle: 198,
    description:
      "Captures traceability, evidence, and runtime integrity so each round can be inspected and trusted after the fact.",
  },
];

const INFRA_NODES: NodeConfig[] = [
  {
    id: "sphere-engine",
    label: "Sphere Engine",
    subtitle: "Canonical Thread Backbone",
    color: COLORS.engine,
    description:
      "Canonical append-only event path. Prism, Torus, Watcher, Synthesis, and Auditor should all publish through Sphere Thread here.",
  },
  {
    id: "sphere-bridge",
    label: "Sphere Bridge",
    subtitle: "Live WebSocket Fanout",
    color: COLORS.bridge,
    description:
      "Streams Sphere Thread activity into SphereViz so the user can watch the live runtime instead of a static mockup.",
  },
  {
    id: "postgres",
    label: "Postgres",
    subtitle: "Canonical Ledger Store",
    color: COLORS.postgres,
    description:
      "Stores the authoritative thread ledger, round history, audit records, and read-model projections that power the live system.",
  },
];

const THREAD_COLORS: Record<string, string> = {
  "external-telegram": "#2AABEE",
  "external-discord": "#5865F2",
  "external-inapp": "#CBD5E1",
  "prism-inbound": COLORS.prism,
  "torus-rounds": COLORS.torus,
  "lane-watcher": COLORS.watcher,
  "lane-synthesis": COLORS.synthesis,
  "lane-auditor": COLORS.auditor,
  "constitution-events": COLORS.watcher,
  "memory-events": COLORS.prism,
  "audit-events": COLORS.auditor,
  "task-events": "#38BDF8",
  "prism-outbound": COLORS.prism,
};

function routeForEvent(event: SphereEvent): { fromId: string; toId: string; color: string } | null {
  const intent = event.data.intent.toUpperCase();
  switch (event.thread) {
    case "external-telegram":
    case "external-discord":
    case "external-inapp":
    case "prism-inbound":
      return { fromId: "sphere-engine", toId: "prism", color: THREAD_COLORS[event.thread] || COLORS.prism };
    case "torus-rounds":
      if (intent === "ROUND_CONVERGED") {
        return { fromId: "torus", toId: "prism", color: COLORS.torus };
      }
      return { fromId: "prism", toId: "torus", color: COLORS.torus };
    case "lane-watcher":
      return intent === "LANE_RESPONSE_RECORDED"
        ? { fromId: "watcher", toId: "torus", color: COLORS.watcher }
        : { fromId: "torus", toId: "watcher", color: COLORS.watcher };
    case "lane-synthesis":
      return intent === "LANE_RESPONSE_RECORDED"
        ? { fromId: "synthesis", toId: "torus", color: COLORS.synthesis }
        : { fromId: "torus", toId: "synthesis", color: COLORS.synthesis };
    case "lane-auditor":
      return intent === "LANE_RESPONSE_RECORDED"
        ? { fromId: "auditor", toId: "torus", color: COLORS.auditor }
        : { fromId: "torus", toId: "auditor", color: COLORS.auditor };
    case "prism-outbound":
      return { fromId: "prism", toId: "sphere-engine", color: COLORS.prism };
    case "audit-events":
      return { fromId: "auditor", toId: "sphere-engine", color: COLORS.auditor };
    case "memory-events":
      return { fromId: "prism", toId: "sphere-engine", color: COLORS.prism };
    case "constitution-events":
      return { fromId: "watcher", toId: "sphere-engine", color: COLORS.watcher };
    case "task-events":
      return { fromId: "prism", toId: "sphere-engine", color: THREAD_COLORS[event.thread] || COLORS.engine };
    default:
      return null;
  }
}

function polar(angleDeg: number, radius: number, cx: number, cy: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius,
  };
}

function extractPayload(event: SphereEvent): Record<string, unknown> {
  const payload = event.data.payload;
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function previewForEvent(event: SphereEvent): string {
  const payload = extractPayload(event);
  const candidates = [
    payload.responsePreview,
    payload.promptPreview,
    payload.query,
    payload.summary,
    payload.task,
    payload.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return event.data.intent;
}

function buildNodes(width: number, height: number): RenderNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const engineNode: RenderNode = {
    ...INFRA_NODES[0],
    x: cx,
    y: cy,
    radius: 48,
  };

  const orbit = PRIMARY_NODES.map((node) => {
    const pos = polar(node.angle ?? 0, 220, cx, cy);
    return {
      ...node,
      x: pos.x,
      y: pos.y,
      radius: 34,
    };
  });

  return [engineNode, ...orbit];
}

function eventSortValue(event: SphereEvent, fallbackIndex: number): number {
  if (event.data.createdAt) {
    const parsed = Date.parse(event.data.createdAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof event.data.sequence === 'number') {
    return event.data.sequence;
  }

  const payload = extractPayload(event);
  if (typeof payload.cursor === 'number') {
    return payload.cursor;
  }

  return fallbackIndex;
}

function eventMatchesInvocation(
  indexedEvent: IndexedSphereEvent,
  invocation: PrismInvocation,
  syntheticEvent: SphereEvent,
): boolean {
  const event = indexedEvent.event;
  if (event.thread !== syntheticEvent.thread || event.data.intent !== syntheticEvent.data.intent) {
    return false;
  }

  const eventPayload = extractPayload(event);
  const syntheticPayload = extractPayload(syntheticEvent);

  if (typeof syntheticPayload.lane === 'string') {
    return eventPayload.lane === syntheticPayload.lane;
  }

  if (typeof syntheticPayload.roundId === 'string' && typeof eventPayload.roundId === 'string') {
    return syntheticPayload.roundId === eventPayload.roundId;
  }

  if (typeof syntheticPayload.query === 'string' && typeof eventPayload.query === 'string') {
    return syntheticPayload.query === eventPayload.query;
  }

  const invocationStart = Date.parse(invocation.submittedAt);
  const eventTime = eventSortValue(event, indexedEvent.index);
  if (Number.isFinite(invocationStart) && eventTime < invocationStart - 1000) {
    return false;
  }

  return true;
}

function roundEventKey(event: SphereEvent): string {
  const payload = extractPayload(event);
  const roundId = typeof payload.roundId === 'string' ? payload.roundId : '';
  const lane = typeof payload.lane === 'string' ? payload.lane : '';
  return `${event.thread}|${event.data.intent}|${roundId}|${lane}`;
}

function buildSyntheticPrismEvents(invocation: PrismInvocation): SphereEvent[] {
  const roundId = invocation.result.roundId || `local-${Date.parse(invocation.submittedAt)}`;
  const providerId = invocation.result.provider || invocation.providerId || 'unknown';
  const model = invocation.result.model || 'unknown';
  const laneResults = new Map(invocation.result.lanes.map((lane) => [lane.lane.toLowerCase(), lane]));
  const baseTime = Date.parse(invocation.submittedAt) || Date.now();

  function buildEvent(
    thread: string,
    intent: string,
    authorAgentId: string,
    payload: Record<string, unknown>,
    offsetMs: number,
  ): SphereEvent {
    return {
      type: 'SPHERE_EVENT',
      thread,
      threadId: `synthetic:${thread}`,
      data: {
        messageId: `synthetic:${roundId}:${thread}:${intent}:${offsetMs}`,
        authorAgentId,
        intent,
        payload,
        createdAt: new Date(baseTime + offsetMs).toISOString(),
      },
    };
  }

  function laneEvents(laneName: 'watcher' | 'synthesis' | 'auditor', offsetMs: number): SphereEvent[] {
    const lane = laneResults.get(laneName);
    const provider = lane?.provider || providerId;
    const laneModel = lane?.model || model;
    return [
      buildEvent(
        `lane-${laneName}`,
        'LANE_REQUESTED',
        'torus',
        {
          roundId,
          lane: laneName,
          query: invocation.query,
          providerId: provider,
          model: laneModel,
          promptPreview: invocation.query,
        },
        offsetMs,
      ),
      buildEvent(
        `lane-${laneName}`,
        'LANE_RESPONSE_RECORDED',
        laneName,
        {
          roundId,
          lane: laneName,
          providerId: provider,
          model: laneModel,
          responsePreview: lane?.output || `${laneName} completed.`,
        },
        offsetMs + 1,
      ),
    ];
  }

  return [
    buildEvent('prism-inbound', 'USER_MESSAGE_RECEIVED', 'sphereviz', { roundId, query: invocation.query, providerId, model }, 0),
    buildEvent('prism-inbound', 'PRISM_MESSAGE_ACCEPTED', 'prism', { roundId, query: invocation.query, providerId, model }, 1),
    buildEvent('torus-rounds', 'TORUS_ROUND_OPENED', 'torus', { roundId, query: invocation.query, providerId, model }, 2),
    ...laneEvents('watcher', 3),
    ...laneEvents('synthesis', 5),
    ...laneEvents('auditor', 7),
    buildEvent('torus-rounds', 'ROUND_CONVERGED', 'torus', { roundId, providerId, model, responsePreview: invocation.result.output || 'Round converged.' }, 9),
    buildEvent('prism-outbound', 'PRISM_RESPONSE_READY', 'prism', { roundId, providerId, model, responsePreview: invocation.result.output || 'No output returned.' }, 10),
  ];
}

export default function Home() {
  const { connected, events, threads } = useSphereBridge();
  const [selectedId, setSelectedId] = useState<string>("prism");
  const [packets, setPackets] = useState<Packet[]>([]);
  const [prismInput, setPrismInput] = useState<string>('Create a short system health summary.');
  const [prismProvider, setPrismProvider] = useState<string>('');
  const [providerState, setProviderState] = useState<ProviderPanelState>({
    snapshotPath: null,
    globalProviderId: null,
    recommendedProviderId: null,
    providers: [],
  });
  const [providerError, setProviderError] = useState<string | null>(null);
  const [prismBusy, setPrismBusy] = useState(false);
  const [prismError, setPrismError] = useState<string | null>(null);
  const [prismResult, setPrismResult] = useState<PrismPanelResult | null>(null);
  const [prismInvocation, setPrismInvocation] = useState<PrismInvocation | null>(null);
  const packetIdRef = useRef(0);
  const seenEventsRef = useRef(0);
  const bridgeHttpBase = useMemo(() => bridgeHttpBaseUrl(), []);

  const width = 760;
  const height = 760;
  const nodes = useMemo(() => buildNodes(width, height), [width, height]);
  const nodeMap = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const selectedNode = useMemo(() => {
    return [...PRIMARY_NODES, ...INFRA_NODES].find((node) => node.id === selectedId) ?? PRIMARY_NODES[0];
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    void fetchProviderRuntimeState()
      .then((state) => {
        if (cancelled) {
          return;
        }
        setProviderState({
          snapshotPath: state.snapshotPath,
          globalProviderId: state.globalProviderId,
          recommendedProviderId: state.recommendedProviderId,
          providers: state.providers,
        });
        setProviderError(null);
        setPrismProvider((current) => {
          if (current && state.providers.some((provider) => provider.providerId === current)) {
            return current;
          }
          return state.recommendedProviderId || state.globalProviderId || state.providers[0]?.providerId || '';
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setProviderError(error instanceof Error ? error.message : 'Failed to load provider status.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const displayEvents = useMemo(() => {
    if (!prismInvocation) {
      return events;
    }

    const indexedEvents = events.map((event, index) => ({ event, index }));
    const supplementalEvents = buildSyntheticPrismEvents(prismInvocation).filter((syntheticEvent) => {
      const syntheticKey = roundEventKey(syntheticEvent);
      if (events.some((event) => roundEventKey(event) === syntheticKey)) {
        return false;
      }
      return !indexedEvents.some((indexedEvent) => eventMatchesInvocation(indexedEvent, prismInvocation, syntheticEvent));
    });

    return [...events, ...supplementalEvents];
  }, [events, prismInvocation]);

  useEffect(() => {
    if (seenEventsRef.current > displayEvents.length) {
      seenEventsRef.current = 0;
    }
    const freshEvents = displayEvents.slice(seenEventsRef.current);
    if (!freshEvents.length) {
      return;
    }
    seenEventsRef.current = displayEvents.length;

    const livePackets = freshEvents
      .map((event) => {
        if (event.data.replay) {
          return null;
        }
        const route = routeForEvent(event);
        if (!route) {
          return null;
        }
        return {
          id: packetIdRef.current++,
          fromId: route.fromId,
          toId: route.toId,
          color: route.color,
          progress: 0,
          intent: event.data.intent,
        } satisfies Packet;
      })
      .filter((packet): packet is Packet => packet !== null);

    if (!livePackets.length) {
      return;
    }

    setPackets((current) => [...current.slice(-100), ...livePackets]);
  }, [displayEvents]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPackets((current) =>
        current
          .map((packet) => ({ ...packet, progress: packet.progress + 0.03 }))
          .filter((packet) => packet.progress < 1),
      );
    }, 30);

    return () => window.clearInterval(interval);
  }, []);

  const summary = useMemo<RuntimeSummary>(() => {
    const threadCounts: Record<string, number> = {};
    let latestRoundId: string | null = null;
    let latestIntent: string | null = null;
    let latestProvider: string | null = null;
    let latestModel: string | null = null;
    let runningTask: string | null = null;

    for (const event of displayEvents) {
      threadCounts[event.thread] = (threadCounts[event.thread] ?? 0) + 1;
      const payload = extractPayload(event);
      if (typeof payload.roundId === "string") {
        latestRoundId = payload.roundId;
        latestIntent = event.data.intent;
      }
      if (typeof payload.providerId === "string") {
        latestProvider = payload.providerId;
      }
      if (typeof payload.model === "string") {
        latestModel = payload.model;
      }
      if (typeof payload.task === "string") {
        runningTask = payload.task;
      }
      if (!runningTask && typeof payload.query === "string" && event.data.intent === "TASK_STARTED") {
        runningTask = payload.query;
      }
    }

    return {
      latestRoundId,
      latestIntent,
      latestProvider,
      latestModel,
      runningTask,
      threadCounts,
    };
  }, [displayEvents]);

  const laneStatus = useMemo(() => {
    const latestRoundId = prismResult?.roundId || summary.latestRoundId;
    const base = [
      { lane: 'watcher', label: 'Watcher', color: COLORS.watcher },
      { lane: 'synthesis', label: 'Synthesis', color: COLORS.synthesis },
      { lane: 'auditor', label: 'Auditor', color: COLORS.auditor },
    ].map((lane) => ({ ...lane, status: 'idle' as string, preview: 'No activity yet.' }));
    if (!latestRoundId) {
      return base;
    }
    for (const lane of base) {
      for (let index = displayEvents.length - 1; index >= 0; index -= 1) {
        const event = displayEvents[index];
        const payload = extractPayload(event);
        if (payload.roundId !== latestRoundId) {
          continue;
        }
        if (payload.lane !== lane.lane) {
          continue;
        }
        if (event.data.intent === 'LANE_RESPONSE_RECORDED') {
          lane.status = 'complete';
          lane.preview = previewForEvent(event);
          break;
        }
        if (event.data.intent === 'LANE_REQUESTED') {
          lane.status = 'running';
          lane.preview = previewForEvent(event);
          break;
        }
      }
    }
    return base;
  }, [displayEvents, prismResult, summary.latestRoundId]);

  const recentEvents = useMemo(() => {
    return [...displayEvents]
      .map((event, index) => ({ event, sortValue: eventSortValue(event, index) }))
      .sort((left, right) => right.sortValue - left.sortValue)
      .slice(0, 10)
      .map(({ event }) => event);
  }, [displayEvents]);
  const topThreads = useMemo(
    () =>
      Object.entries(summary.threadCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6),
    [summary.threadCounts],
  );

  async function sendMessageToPrism() {
    const query = prismInput.trim();
    if (!query) {
      setPrismError('Enter a message for Prism.');
      return;
    }

    const submittedAt = new Date().toISOString();
    setPrismBusy(true);
    setPrismError(null);
    try {
      const response = await fetch(`${bridgeHttpBase}/api/prism-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          providerId: prismProvider,
          channel: 'sphereviz',
          forceDeliberation: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'Prism request failed.');
      }
      const parsed = payload.parsed as PrismPanelResult;
      setPrismResult(parsed);
      setPrismInvocation({
        query,
        providerId: prismProvider,
        submittedAt,
        result: parsed,
      });
    } catch (error) {
      setPrismError(error instanceof Error ? error.message : 'Prism request failed.');
    } finally {
      setPrismBusy(false);
    }
  }

  return (
    <>
      <div
        style={{
          minHeight: "100vh",
          background: `radial-gradient(circle at top, rgba(97,228,255,0.12), transparent 32%), radial-gradient(circle at 80% 20%, rgba(167,139,250,0.14), transparent 30%), ${COLORS.background}`,
          color: COLORS.text,
          fontFamily: "'Space Grotesk', sans-serif",
          padding: "28px 20px 40px",
        }}
      >
        <div style={{ maxWidth: 1380, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
              marginBottom: 22,
              padding: "14px 18px",
              borderRadius: 20,
              border: `1px solid ${COLORS.border}`,
              background: "rgba(7, 12, 19, 0.72)",
              boxShadow: "0 24px 80px rgba(2, 6, 23, 0.35)",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: COLORS.muted,
                  marginBottom: 8,
                }}
              >
                Metacanon SphereViz
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(2rem, 4vw, 4rem)",
                  lineHeight: 1,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  background: "linear-gradient(135deg, #F8FAFC 0%, #61E4FF 55%, #A78BFA 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Live Prism / Torus Runtime
              </h1>
              <p style={{ margin: "14px 0 0", maxWidth: 760, color: COLORS.muted, lineHeight: 1.7 }}>
                This surface is reading the Sphere Engine through Sphere Bridge. Prism is the only user-facing interface.
                Watcher, Synthesis, and Auditor are internal lanes inside live Torus rounds.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                { label: "Bridge", value: connected ? "Connected" : "Disconnected", color: connected ? COLORS.bridge : COLORS.synthesis },
                { label: "Buffered Events", value: String(displayEvents.length), color: COLORS.prism },
                { label: "Known Threads", value: String(Object.keys(threads).length), color: COLORS.auditor },
              ].map((chip) => (
                <div
                  key={chip.label}
                  style={{
                    minWidth: 126,
                    padding: "12px 14px",
                    borderRadius: 16,
                    border: `1px solid ${COLORS.border}`,
                    background: "rgba(15, 23, 42, 0.56)",
                  }}
                >
                  <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 6 }}>
                    {chip.label}
                  </div>
                  <div style={{ fontWeight: 700, color: chip.color }}>{chip.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <section style={{ flex: "1 1 280px", minWidth: 280, display: "grid", gap: 16 }}>
              <div style={{ borderRadius: 22, border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
                  Send Message To Prism
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <textarea
                    value={prismInput}
                    onChange={(event) => setPrismInput(event.target.value)}
                    rows={5}
                    placeholder="Ask Prism to deliberate on a task..."
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 14,
                      border: `1px solid ${COLORS.border}`,
                      background: 'rgba(15, 23, 42, 0.54)',
                      color: COLORS.text,
                      padding: '12px 14px',
                      lineHeight: 1.6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select
                      value={prismProvider}
                      onChange={(event) => setPrismProvider(event.target.value)}
                      style={{
                        flex: '1 1 180px',
                        borderRadius: 14,
                        border: `1px solid ${COLORS.border}`,
                        background: 'rgba(15, 23, 42, 0.54)',
                        color: COLORS.text,
                        padding: '10px 12px',
                      }}
                    >
                      {providerState.providers.map((provider) => (
                        <option key={provider.providerId} value={provider.providerId}>
                          {provider.label} {provider.status === "live" ? "(Live)" : "(Unavailable)"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void sendMessageToPrism()}
                      disabled={prismBusy || !prismProvider || !providerState.providers.some((provider) => provider.providerId === prismProvider && provider.status === 'live')}
                      style={{
                        borderRadius: 14,
                        border: 'none',
                        background: 'linear-gradient(135deg, #61E4FF 0%, #A78BFA 100%)',
                        color: '#061019',
                        fontWeight: 700,
                        padding: '10px 16px',
                        cursor: prismBusy ? 'wait' : 'pointer',
                        opacity: prismBusy ? 0.75 : 1,
                      }}
                    >
                      {prismBusy ? 'Running...' : 'Send To Prism'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
                    This runs a real Prism round through the local bridge, publishes live events into Sphere Engine, and returns the final Prism response here.
                  </div>
                  {providerError ? (
                    <div style={{ borderRadius: 14, background: 'rgba(127,29,29,0.28)', border: '1px solid rgba(248,113,113,0.35)', padding: 12, color: '#FCA5A5', lineHeight: 1.6 }}>
                      {providerError}
                    </div>
                  ) : null}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>
                      Snapshot: {providerState.snapshotPath || 'not loaded'}
                    </div>
                    {providerState.providers.length ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {providerState.providers.map((provider) => (
                          <div key={provider.providerId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: COLORS.text }}>
                            <span>{provider.label}</span>
                            <span style={{ color: provider.status === 'live' ? COLORS.bridge : '#FCA5A5' }}>
                              {provider.status === 'live' ? 'Live' : 'Unavailable'}
                              {provider.model ? ` / ${provider.model}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {prismError ? (
                    <div style={{ borderRadius: 14, background: 'rgba(127,29,29,0.28)', border: '1px solid rgba(248,113,113,0.35)', padding: 12, color: '#FCA5A5', lineHeight: 1.6 }}>
                      {prismError}
                    </div>
                  ) : null}
                  {prismResult ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ borderRadius: 14, background: 'rgba(15, 23, 42, 0.54)', border: `1px solid ${COLORS.border}`, padding: 12 }}>
                        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 8 }}>Final Response</div>
                        <div style={{ color: COLORS.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{prismResult.output || 'No output returned.'}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {[
                          ['Route', prismResult.route || 'unknown'],
                          ['Round ID', prismResult.roundId || 'not opened'],
                          ['Provider', prismResult.provider || 'unknown'],
                          ['Model', prismResult.model || 'unknown'],
                          ['Event Publish', prismResult.eventPublish || 'unknown'],
                        ].map(([label, value]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span style={{ color: COLORS.muted }}>{label}</span>
                            <span style={{ color: COLORS.text, textAlign: 'right' }}>{value}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {prismResult.lanes.map((lane) => (
                          <div key={lane.lane} style={{ borderRadius: 14, background: 'rgba(15, 23, 42, 0.54)', border: `1px solid ${COLORS.border}`, padding: 12 }}>
                            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>{lane.lane}</div>
                            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>{lane.provider || 'unknown'} / {lane.model || 'unknown'} / fallback={String(Boolean(lane.fallback))}</div>
                            <div style={{ color: '#CBD5E1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lane.output || 'No lane output returned.'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ borderRadius: 22, border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
                  Active Round Lanes
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {laneStatus.map((lane) => (
                    <div key={lane.lane} style={{ borderRadius: 14, border: `1px solid ${COLORS.border}`, background: 'rgba(15, 23, 42, 0.54)', padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: lane.color }}>{lane.label}</span>
                        <span style={{ color: lane.status === 'complete' ? COLORS.bridge : lane.status === 'running' ? lane.color : COLORS.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{lane.status}</span>
                      </div>
                      <div style={{ color: '#CBD5E1', lineHeight: 1.6, fontSize: 13 }}>{lane.preview}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderRadius: 22, border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
                  Runtime Summary
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    { label: "Latest Round", value: summary.latestRoundId ?? "No round yet" },
                    { label: "Latest Intent", value: summary.latestIntent ?? "No events yet" },
                    { label: "Latest Provider", value: summary.latestProvider ?? "Unknown" },
                    { label: "Latest Model", value: summary.latestModel ?? "Unknown" },
                    { label: "Running Task", value: summary.runningTask ?? "Idle" },
                  ].map((row) => (
                    <div key={row.label} style={{ paddingBottom: 12, borderBottom: `1px solid rgba(148,163,184,0.12)` }}>
                      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 6 }}>{row.label}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderRadius: 22, border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
                  Thread Activity
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {topThreads.length === 0 ? (
                    <div style={{ color: COLORS.muted }}>No live thread traffic yet.</div>
                  ) : (
                    topThreads.map(([thread, count]) => (
                      <div key={thread} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ color: COLORS.text }}>{thread}</span>
                        <span style={{ color: COLORS.prism, fontFamily: "'IBM Plex Mono', monospace" }}>{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section
              style={{
                flex: "2 1 640px",
                minWidth: 320,
                borderRadius: 28,
                border: `1px solid ${COLORS.border}`,
                background: "linear-gradient(180deg, rgba(8, 12, 20, 0.88) 0%, rgba(6, 10, 18, 0.98) 100%)",
                padding: 18,
                boxShadow: "0 30px 80px rgba(2, 6, 23, 0.42)",
              }}
            >
              <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
                <defs>
                  {nodes.map((node) => (
                    <filter key={node.id} id={`glow-${node.id}`} x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="10" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  ))}
                </defs>

                {PRIMARY_NODES.map((node) => {
                  const center = nodeMap["sphere-engine"];
                  const target = nodeMap[node.id];
                  return (
                    <line
                      key={`edge-${node.id}`}
                      x1={center.x}
                      y1={center.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="rgba(148, 163, 184, 0.2)"
                      strokeWidth="2"
                    />
                  );
                })}

                <circle
                  cx={nodeMap["sphere-engine"].x}
                  cy={nodeMap["sphere-engine"].y}
                  r={250}
                  fill="none"
                  stroke="rgba(97,228,255,0.08)"
                  strokeWidth="1.5"
                />

                {packets.map((packet) => {
                  const from = nodeMap[packet.fromId];
                  const to = nodeMap[packet.toId];
                  if (!from || !to) {
                    return null;
                  }
                  const x = from.x + (to.x - from.x) * packet.progress;
                  const y = from.y + (to.y - from.y) * packet.progress;
                  return (
                    <g key={packet.id}>
                      <circle cx={x} cy={y} r={5} fill={packet.color} opacity={0.95} />
                      <circle cx={x} cy={y} r={12} fill={packet.color} opacity={0.18} />
                    </g>
                  );
                })}

                {nodes.map((node) => {
                  const isSelected = node.id === selectedId;
                  return (
                    <g key={node.id} onClick={() => setSelectedId(node.id)} style={{ cursor: "pointer" }}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius + (isSelected ? 6 : 0)}
                        fill={`${node.color}18`}
                        stroke={node.color}
                        strokeWidth={isSelected ? 3 : 2}
                        filter={`url(#glow-${node.id})`}
                      />
                      <text
                        x={node.x}
                        y={node.y - 4}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="18"
                        fontWeight="700"
                        fontFamily="'Space Grotesk', sans-serif"
                      >
                        {node.label}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + 18}
                        textAnchor="middle"
                        fill="rgba(226,232,240,0.72)"
                        fontSize="11"
                        fontFamily="'IBM Plex Mono', monospace"
                        letterSpacing="0.08em"
                      >
                        {node.subtitle.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </section>

            <section style={{ flex: "1 1 320px", minWidth: 300, display: "grid", gap: 16 }}>
              <div style={{ borderRadius: 22, border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
                  Selected Node
                </div>
                <div style={{ marginBottom: 8, fontSize: 26, fontWeight: 700, color: selectedNode.color }}>{selectedNode.label}</div>
                <div style={{ marginBottom: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: COLORS.muted }}>
                  {selectedNode.subtitle}
                </div>
                <div style={{ lineHeight: 1.7, color: COLORS.text }}>{selectedNode.description}</div>
              </div>

              <div style={{ borderRadius: 22, border: `1px solid ${COLORS.border}`, background: COLORS.panel, padding: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 12 }}>
                  Recent Events
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {recentEvents.length === 0 ? (
                    <div style={{ color: COLORS.muted }}>Waiting for live Sphere Thread events.</div>
                  ) : (
                    recentEvents.map((event) => (
                      <div key={event.data.messageId} style={{ borderRadius: 16, padding: 12, background: "rgba(15, 23, 42, 0.54)", border: `1px solid rgba(148,163,184,0.12)` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                          <span style={{ color: COLORS.prism, fontWeight: 700 }}>{event.data.intent}</span>
                          <span style={{ color: COLORS.muted, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{event.thread}</span>
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#CBD5E1" }}>{previewForEvent(event)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>

          <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 12 }}>
            {INFRA_NODES.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                style={{
                  borderRadius: 16,
                  border: `1px solid ${COLORS.border}`,
                  background: "rgba(15, 23, 42, 0.54)",
                  padding: "12px 16px",
                  color: node.color,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {node.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
