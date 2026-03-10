/**
 * LensForge Skin Constants
 * Separated from SkinContext.tsx to satisfy Vite Fast Refresh
 * (React context files must only export components/hooks).
 */

export type SkinId = 'aethel' | 'cypher' | 'obsidian';

export interface SkinMeta {
  id: SkinId;
  name: string;
  tagline: string;
  philosophy: string;
  accent: string;
  accentLabel: string;
  fontFamily: string;
  radiusLabel: string;
  motionLabel: string;
}

export const SKINS: SkinMeta[] = [
  {
    id: 'aethel',
    name: 'Aethel',
    tagline: 'Cathedral-Brutalism',
    philosophy: 'The experience of witnessing a collapsing cathedral.',
    accent: '#9E78FF',
    accentLabel: 'Spectral Violet',
    fontFamily: 'IBM Plex Mono',
    radiusLabel: '0px — no curves',
    motionLabel: '600–900ms, geological',
  },
  {
    id: 'cypher',
    name: 'Cypher',
    tagline: 'Calligraphic Hardware',
    philosophy: 'A direct engagement with a living, evolving cryptographic entity.',
    accent: '#00E87A',
    accentLabel: 'Precision Ink Green',
    fontFamily: 'Roboto Mono',
    radiusLabel: '2–8px, tactical',
    motionLabel: '120–500ms, decisive',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'MetaCanon AI',
    philosophy: 'Structure and soul. The interface disappears. Only the work remains.',
    accent: '#B8860B',
    accentLabel: 'Muted Warm Gold',
    fontFamily: 'SF Pro / system-ui',
    radiusLabel: '12px, precise',
    motionLabel: '300–500ms, physics',
  },
];

export const VALID_SKINS: SkinId[] = ['aethel', 'cypher', 'obsidian'];
