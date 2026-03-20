import type {
  CollageCardDefinition,
  CollageCardPlacement,
  CollageViewDefinition,
  DesktopNavItem,
  LandingWindowViewId,
} from "./types";

export function buildLandingPagePath(search: string) {
  if (!search) {
    return "/landing-page";
  }

  return `/landing-page${search.startsWith("?") ? search : `?${search}`}`;
}

export function getNextCollageViewId(
  views: Array<Pick<CollageViewDefinition, "id">>,
  currentId: string | null
) {
  if (views.length === 0) {
    return "";
  }

  const currentIndex = views.findIndex((view) => view.id === currentId);
  if (currentIndex < 0) {
    return views[0].id;
  }

  return views[(currentIndex + 1) % views.length].id;
}

export function resolveLandingWindowId(
  nextId: string | null | undefined,
  navItems: Array<Pick<DesktopNavItem, "id">>,
  fallback: LandingWindowViewId
) {
  if (nextId && navItems.some((item) => item.id === nextId)) {
    return nextId as LandingWindowViewId;
  }

  return fallback;
}

export function selectCollagePlacement(
  card: CollageCardDefinition,
  isMobile: boolean
): CollageCardPlacement {
  return isMobile ? card.mobile : card.desktop;
}

export function createCollageLayout(
  view: CollageViewDefinition,
  isMobile: boolean
): Record<string, CollageCardPlacement> {
  return Object.fromEntries(
    view.cards.map((card) => [card.id, selectCollagePlacement(card, isMobile)])
  );
}
