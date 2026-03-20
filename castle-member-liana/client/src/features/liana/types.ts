export type SovereignEventType =
  | "visit"
  | "artifact_click"
  | "story_interact"
  | "influence_click"
  | "wall_view"
  | "prism_cta"
  | "ddos_sign"
  | "portal_exit";

export type ArtifactInteractionType = "rotate" | "spin" | "pulse" | "open" | "walk";
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
  audioSrc?: string | null;
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

export interface HeroPortraitOption {
  id: string;
  label: string;
  path: string;
  objectPosition?: string;
  scale?: number;
  rotation?: number;
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
  pageTitle: string;
  pageDescription: string;
  primaryHeadline: string;
  subheadline: string;
  activationMessage: string;
  arrivalBody: string;
  originHeadline: string;
  originBody: string;
  originMoments: Array<{ id: string; label: string; detail: string }>;
  artifacts: ArtifactDefinition[];
  influences: InfluenceDefinition[];
  prismPairs: PrismPromptPair[];
  heroPortraitOptions: HeroPortraitOption[];
  ascensionQuote: string;
  wallSeeds: string[];
  realmNames: Record<string, string>;
  assets: {
    heroPortrait: string;
    originPortrait: string;
    ascensionPortrait: string;
    staticScene: string;
  };
}
