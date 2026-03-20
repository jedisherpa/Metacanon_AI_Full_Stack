import { describe, expect, it } from "vitest";
import { DIANA_MEMBER_CONFIG } from "./config/member";
import { resolveArtifactResult, resolvePrismPrompt } from "./logic";

describe("resolvePrismPrompt", () => {
  it("returns the default Diana prompt for empty input", () => {
    expect(resolvePrismPrompt("")).toEqual(DIANA_MEMBER_CONFIG.prismPairs[0]);
  });

  it("matches a Diana prompt by content", () => {
    const result = resolvePrismPrompt("grief keeps freezing me");
    expect(result.response).toContain("frozen grief");
  });

  it("falls back to a generic Diana lens response for unmatched prompts", () => {
    const result = resolvePrismPrompt("zebra lantern mathematics");
    expect(result.response).toContain("fragmentation");
  });
});

describe("resolveArtifactResult", () => {
  it("returns a downloadable codex blueprint for the re-self codex", () => {
    const result = resolveArtifactResult(
      DIANA_MEMBER_CONFIG.artifacts.find((artifact) => artifact.id === "reself-codex")!,
      "I keep abandoning myself to stay loved",
      0
    );

    expect(result.downloadableText).toContain("Re-Self Blueprint");
    expect(result.downloadableFileName).toBe("diana-reself-blueprint.pdf");
  });

  it("uses gesture progress inside the black belt storm output", () => {
    const result = resolveArtifactResult(
      DIANA_MEMBER_CONFIG.artifacts.find((artifact) => artifact.id === "black-belt-storm")!,
      "",
      0.74
    );

    expect(result.body).toContain("74%");
  });
});
