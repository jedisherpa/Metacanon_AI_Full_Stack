import { describe, expect, it } from "vitest";
import {
  buildPortalUrl,
  deriveSovereignBadge,
  getArrivalContext,
} from "./sovereign";

describe("getArrivalContext", () => {
  it("parses inbound realm parameters and passthrough context", () => {
    const arrival = getArrivalContext(
      "?from=castle-paul&uuid=abc123&held_artifact=phoenix-wing&quest=ascend"
    );

    expect(arrival).toEqual({
      fromRealm: "castle-paul",
      fromLabel: "Architect's Forge",
      incomingUuid: "abc123",
      heldArtifact: "phoenix-wing",
      quest: "ascend",
    });
  });

  it("normalizes unknown realm labels", () => {
    const arrival = getArrivalContext("?from=signal-garden");
    expect(arrival.fromLabel).toBe("signal garden");
  });
});

describe("buildPortalUrl", () => {
  it("preserves existing params while appending Liana realm identity", () => {
    const url = new URL(
      buildPortalUrl("https://example.com/threshold?mode=preview", "uuid-77", "godsminddreaming")
    );

    expect(url.searchParams.get("mode")).toBe("preview");
    expect(url.searchParams.get("from")).toBe("castle-liana");
    expect(url.searchParams.get("uuid")).toBe("uuid-77");
    expect(url.searchParams.get("destinationRealm")).toBe("godsminddreaming");
  });
});

describe("deriveSovereignBadge", () => {
  it("awards Phoenix Initiate after five distinct artifacts", () => {
    const badge = deriveSovereignBadge([
      { event_type: "artifact_click", artifact_id: "a1", metadata: null, portal_id: null },
      { event_type: "artifact_click", artifact_id: "a2", metadata: null, portal_id: null },
      { event_type: "artifact_click", artifact_id: "a3", metadata: null, portal_id: null },
      { event_type: "artifact_click", artifact_id: "a4", metadata: null, portal_id: null },
      { event_type: "artifact_click", artifact_id: "a5", metadata: null, portal_id: null },
      { event_type: "artifact_click", artifact_id: "a5", metadata: null, portal_id: null },
    ]);

    expect(badge?.id).toBe("phoenix-initiate");
  });

  it("awards Sovereign Wayfinder after three distinct portal exits", () => {
    const badge = deriveSovereignBadge([
      {
        event_type: "portal_exit",
        artifact_id: null,
        portal_id: "p1",
        metadata: { destinationRealm: "godsminddreaming" },
      },
      {
        event_type: "portal_exit",
        artifact_id: null,
        portal_id: "p2",
        metadata: { destinationRealm: "metacanonai" },
      },
      {
        event_type: "portal_exit",
        artifact_id: null,
        portal_id: "p3",
        metadata: { destinationRealm: "iampaulcooper" },
      },
    ]);

    expect(badge?.id).toBe("sovereign-wayfinder");
  });

  it("awards Covenant Bearer after declaration activity", () => {
    const badge = deriveSovereignBadge([
      { event_type: "ddos_sign", artifact_id: null, metadata: null, portal_id: null },
    ]);

    expect(badge?.id).toBe("covenant-bearer");
  });
});
