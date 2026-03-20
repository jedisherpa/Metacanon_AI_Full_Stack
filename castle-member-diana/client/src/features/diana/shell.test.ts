import { describe, expect, it } from "vitest";
import { DIANA_MEMBER_CONFIG } from "./config/member";
import {
  buildLandingPagePath,
  createCollageLayout,
  getNextCollageViewId,
  resolveLandingWindowId,
} from "./shell";

describe("buildLandingPagePath", () => {
  it("preserves the original query string when leaving the splash route", () => {
    expect(
      buildLandingPagePath("?from=castle-paul&uuid=abc123&held_artifact=reself-codex")
    ).toBe("/landing-page?from=castle-paul&uuid=abc123&held_artifact=reself-codex");
  });

  it("returns the bare landing page path when no query string exists", () => {
    expect(buildLandingPagePath("")).toBe("/landing-page");
  });
});

describe("getNextCollageViewId", () => {
  it("cycles through Diana's four collage presets and wraps back to the start", () => {
    const views = DIANA_MEMBER_CONFIG.collageViews.map((view) => ({ id: view.id }));

    expect(getNextCollageViewId(views, "view-1")).toBe("view-2");
    expect(getNextCollageViewId(views, "view-2")).toBe("view-3");
    expect(getNextCollageViewId(views, "view-3")).toBe("view-4");
    expect(getNextCollageViewId(views, "view-4")).toBe("view-1");
  });
});

describe("resolveLandingWindowId", () => {
  it("maps a requested nav id to a known landing window view", () => {
    expect(
      resolveLandingWindowId(
        "relics",
        DIANA_MEMBER_CONFIG.desktopNavItems,
        DIANA_MEMBER_CONFIG.desktopNavItems[0].id
      )
    ).toBe("relics");
  });

  it("falls back to the default landing window when the nav id is unknown", () => {
    expect(
      resolveLandingWindowId(
        "unknown-view",
        DIANA_MEMBER_CONFIG.desktopNavItems,
        DIANA_MEMBER_CONFIG.desktopNavItems[0].id
      )
    ).toBe("origin");
  });
});

describe("createCollageLayout", () => {
  it("uses the mobile placements when requested", () => {
    const layout = createCollageLayout(DIANA_MEMBER_CONFIG.collageViews[0], true);

    expect(layout["view-1-forest-wide"]).toMatchObject({
      x: 52,
      y: 18,
      width: 264,
      height: 162,
    });
  });
});
