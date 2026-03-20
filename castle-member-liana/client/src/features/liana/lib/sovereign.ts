import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { LIANA_MEMBER_CONFIG } from "../config/member";
import type {
  ArrivalContext,
  SovereignBadge,
  SovereignEventPayload,
  WallEntry
} from "../types";

type LedgerRow = {
  uuid: string;
  realm_id: string;
  event_type: string;
  artifact_id?: string | null;
  portal_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

const UUID_KEY = "liana:sovereign:uuid";
const QUEUE_KEY = "liana:sovereign:queue";
const LOCAL_LEDGER_KEY = "liana:sovereign:local-ledger";
const SEEN_BADGES_KEY = "liana:sovereign:seen-badges";
const SESSION_EVENT_KEY = "liana:sovereign:session-events";

let supabaseClient: SupabaseClient | null | undefined;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getSupabaseClient() {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseClient;
}

function readJson<T>(key: string, fallback: T) {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function readSessionJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return fallback;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson<T>(key: string, value: T) {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function mapRealmName(realm: string | null) {
  if (!realm) {
    return null;
  }

  return LIANA_MEMBER_CONFIG.realmNames[realm] ?? realm.replace(/[-_]/g, " ");
}

export function getArrivalContext(
  input: string | URLSearchParams
): ArrivalContext {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;

  const fromRealm = params.get("from");

  return {
    fromRealm,
    fromLabel: mapRealmName(fromRealm),
    incomingUuid: params.get("uuid"),
    heldArtifact: params.get("held_artifact"),
    quest: params.get("quest")
  };
}

export function getOrCreateSovereignUUID(seed?: string | null) {
  if (!canUseStorage()) {
    return seed ?? nanoid(12);
  }

  if (seed) {
    window.sessionStorage.setItem(UUID_KEY, seed);
    return seed;
  }

  const existing = window.sessionStorage.getItem(UUID_KEY);
  if (existing) {
    return existing;
  }

  const created = nanoid(12);
  window.sessionStorage.setItem(UUID_KEY, created);
  return created;
}

function queueEvent(row: LedgerRow) {
  const queue = readJson<LedgerRow[]>(QUEUE_KEY, []);
  queue.push(row);
  writeJson(QUEUE_KEY, queue);
}

function recordLocalLedger(row: LedgerRow) {
  const events = readJson<LedgerRow[]>(LOCAL_LEDGER_KEY, []);
  events.push(row);
  writeJson(LOCAL_LEDGER_KEY, events.slice(-200));
}

function getLocalLedger() {
  return readJson<LedgerRow[]>(LOCAL_LEDGER_KEY, []);
}

function buildLedgerRow(
  uuid: string,
  arrival: ArrivalContext,
  payload: SovereignEventPayload
): LedgerRow {
  return {
    uuid,
    realm_id: import.meta.env.VITE_REALM_ID ?? LIANA_MEMBER_CONFIG.realmId,
    event_type: payload.eventType,
    artifact_id: payload.artifactId ?? null,
    portal_id: payload.portalId ?? null,
    metadata: {
      fromRealm: arrival.fromRealm,
      fromLabel: arrival.fromLabel,
      heldArtifact: arrival.heldArtifact,
      quest: arrival.quest,
      ...(payload.metadata ?? {})
    },
    created_at: new Date().toISOString()
  };
}

function getEventDeduplicationKey(payload: SovereignEventPayload) {
  switch (payload.eventType) {
    case "artifact_click":
      return payload.artifactId ? `artifact_click:${payload.artifactId}` : null;
    case "visit":
      return "visit";
    case "wall_view":
      return "wall_view";
    default:
      return null;
  }
}

export async function logSovereignEvent(
  payload: SovereignEventPayload,
  arrival: ArrivalContext,
  uuid: string
) {
  const deduplicationKey = getEventDeduplicationKey(payload);
  const seenEvents = new Set(readSessionJson<string[]>(SESSION_EVENT_KEY, []));
  if (deduplicationKey && seenEvents.has(deduplicationKey)) {
    return false;
  }

  const row = buildLedgerRow(uuid, arrival, payload);
  recordLocalLedger(row);
  if (deduplicationKey) {
    seenEvents.add(deduplicationKey);
    writeSessionJson(SESSION_EVENT_KEY, Array.from(seenEvents));
  }

  const client = getSupabaseClient();
  if (!client) {
    queueEvent(row);
    return true;
  }

  try {
    const { error } = await client.from("sovereign_ledger").insert(row);
    if (error) {
      throw error;
    }
  } catch {
    queueEvent(row);
  }

  return true;
}

export async function flushQueuedEvents() {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  const queue = readJson<LedgerRow[]>(QUEUE_KEY, []);
  if (queue.length === 0) {
    return;
  }

  try {
    const { error } = await client.from("sovereign_ledger").insert(queue);
    if (!error) {
      writeJson<LedgerRow[]>(QUEUE_KEY, []);
    }
  } catch {
    // Keep the queue for a later retry.
  }
}

type BadgeLedgerRow = Pick<LedgerRow, "event_type" | "metadata" | "portal_id" | "artifact_id">;

export function deriveSovereignBadge(rows: BadgeLedgerRow[]): SovereignBadge | null {
  const artifactCount = new Set(
    rows
      .filter((row) => row.event_type === "artifact_click" && row.artifact_id)
      .map((row) => String(row.artifact_id))
  ).size;
  const portalRealms = new Set(
    rows
      .filter((row) => row.event_type === "portal_exit")
      .map((row) => String(row.metadata?.destinationRealm ?? row.portal_id ?? ""))
      .filter(Boolean)
  );
  const hasAscended = rows.some((row) => row.event_type === "ddos_sign");

  if (artifactCount >= 5) {
    return {
      id: "phoenix-initiate",
      title: "Phoenix Initiate",
      description:
        "All five artifacts have been opened. The forge recognizes a complete first passage."
    };
  }

  if (portalRealms.size >= 3) {
    return {
      id: "sovereign-wayfinder",
      title: "Sovereign Wayfinder",
      description:
        "Three outbound portals have been crossed. The ecosystem now knows this traveler by motion, not only by intent."
    };
  }

  if (hasAscended) {
    return {
      id: "covenant-bearer",
      title: "Covenant Bearer",
      description:
        "A declaration action has been completed. The visitor has stepped from observation into public alignment."
    };
  }

  return null;
}

export async function checkSovereignBadge(uuid: string) {
  const seen = new Set(readJson<string[]>(SEEN_BADGES_KEY, []));
  let rows = getLocalLedger().filter((row) => row.uuid === uuid);

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data } = await client
        .from("sovereign_ledger")
        .select("uuid, realm_id, event_type, artifact_id, portal_id, metadata, created_at")
        .eq("uuid", uuid)
        .order("created_at", { ascending: false })
        .limit(200);

      if (data && data.length > 0) {
        rows = data as LedgerRow[];
      }
    } catch {
      // Local ledger fallback is already loaded.
    }
  }

  const badge = deriveSovereignBadge(rows);
  if (!badge || seen.has(badge.id)) {
    return null;
  }

  seen.add(badge.id);
  writeJson(SEEN_BADGES_KEY, Array.from(seen));
  return badge;
}

export function buildPortalUrl(baseUrl: string, uuid: string, destinationRealm: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("from", LIANA_MEMBER_CONFIG.realmId);
  url.searchParams.set("uuid", uuid);
  url.searchParams.set("destinationRealm", destinationRealm);
  return url.toString();
}

export async function fetchWallEntries(): Promise<WallEntry[]> {
  const fallback = LIANA_MEMBER_CONFIG.wallSeeds.map((label, index) => ({
    id: `seed-${index}`,
    label,
    subtitle: "Anchored in the coherence eclipse"
  }));

  const client = getSupabaseClient();
  if (!client) {
    return fallback;
  }

  try {
    const { data } = await client
      .from("sovereign_ledger")
      .select("*")
      .eq("event_type", "ddos_sign")
      .order("created_at", { ascending: false })
      .limit(12);

    if (!data || data.length === 0) {
      return fallback;
    }

    return (data as Array<Record<string, unknown>>).map((row, index) => {
      const metadata = (row.metadata as Record<string, unknown> | null) ?? null;
      const label =
        (typeof row.visitor_name === "string" && row.visitor_name) ||
        (typeof metadata?.displayName === "string" && metadata.displayName) ||
        (typeof metadata?.name === "string" && metadata.name) ||
        `Sovereign ${index + 1}`;

      const subtitle =
        (typeof row.realm_id === "string" && row.realm_id) ||
        "Signed through the ascension threshold";

      return {
        id: String(row.id ?? row.uuid ?? index),
        label,
        subtitle
      };
    });
  } catch {
    return fallback;
  }
}

export function subscribeToWallEntries(onRefresh: () => void) {
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }

  const channel = client
    .channel("liana-wall-realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "sovereign_ledger",
        filter: "event_type=eq.ddos_sign"
      },
      () => onRefresh()
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
