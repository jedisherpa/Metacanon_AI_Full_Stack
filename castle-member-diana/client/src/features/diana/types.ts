export type SovereignEventType =
  | "visit"
  | "artifact_click"
  | "story_interact"
  | "influence_click"
  | "wall_view"
  | "prism_cta"
  | "ddos_sign"
  | "portal_exit";

export type ArtifactInteractionType = "input" | "gesture";
export type ArtifactOutputType = "text" | "pdf";

export interface ArtifactDefinition {
  id: string;
  title: string;
  headline: string;
  body: string;
  promptLabel: string;
  promptPlaceholder: string;
  ctaLabel: string;
  interactionType: ArtifactInteractionType;
  outputType: ArtifactOutputType;
  realmToken: string;
}

export interface InfluenceDefinition {
  id: string;
  title: string;
  author: string;
  body: string;
  reflection: string;
}

export interface PrismPromptPair {
  prompt: string;
  response: string;
}

export type LandingWindowViewId =
  | "origin"
  | "relics"
  | "lineage"
  | "prism"
  | "wall"
  | "ascend"
  | "portals";

export interface HeroPortraitOption {
  id: string;
  label: string;
  path: string;
  objectPosition?: string;
  scale?: number;
}

export interface SplashScreenConfig {
  windowTitle: string;
  fromLabel: string;
  toLabel: string;
  subjectLine: string;
  headline: string;
  realmLine: string;
  typewriterText: string;
  instruction: string;
  floatingFolders: string[];
}

export interface DesktopNavItem {
  id: LandingWindowViewId;
  label: string;
  title: string;
  subtitle: string;
}

export interface FooterQuickLinkDefinition {
  id: string;
  label: string;
  description: string;
  url: string;
  eventType: SovereignEventType;
  metadata?: Record<string, unknown>;
}

export interface CollageCardPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  objectPosition?: string;
}

export interface CollageCardDefinition {
  id: string;
  path: string;
  alt: string;
  caption: string;
  desktop: CollageCardPlacement;
  mobile: CollageCardPlacement;
}

export interface CollageViewDefinition {
  id: string;
  label: string;
  cards: CollageCardDefinition[];
}

export interface PortalDefinition {
  id: string;
  destinationRealm: string;
  destinationUrl: string;
  label: string;
  description: string;
}

export interface ArrivalContext {
  fromRealm: string | null;
  fromLabel: string | null;
  incomingUuid: string | null;
  heldArtifact: string | null;
  quest: string | null;
}

export interface SovereignEventPayload {
  eventType: SovereignEventType;
  artifactId?: string;
  portalId?: string;
  metadata?: Record<string, unknown>;
}

export interface SovereignBadge {
  id: string;
  title: string;
  description: string;
}

export interface ArtifactResult {
  heading: string;
  body: string;
  bullets: string[];
  downloadableText?: string;
  downloadableFileName?: string;
}

export interface WallEntry {
  id: string;
  label: string;
  subtitle: string;
}

export interface MemberConfig {
  realmId: string;
  realmName: string;
  brandName: string;
  pageTitle: string;
  pageDescription: string;
  primaryHeadline: string;
  subheadline: string;
  activationMessage: string;
  arrivalBody: string;
  splashScreen: SplashScreenConfig;
  desktopNavItems: DesktopNavItem[];
  collageViews: CollageViewDefinition[];
  footerQuickLinks: FooterQuickLinkDefinition[];
  footerLine: string;
  originHeadline: string;
  originBody: string;
  originMoments: Array<{ id: string; label: string; detail: string }>;
  artifacts: ArtifactDefinition[];
  influences: InfluenceDefinition[];
  prismPairs: PrismPromptPair[];
  ascensionQuote: string;
  wallSeeds: string[];
  realmNames: Record<string, string>;
  heroPortraitOptions: HeroPortraitOption[];
  assets: {
    heroPortrait: string;
    originPortrait: string;
    ascensionPortrait: string;
    staticScene: string;
  };
}
