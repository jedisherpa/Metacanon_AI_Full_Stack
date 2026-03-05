/**
 * MetaCanon AI Installer — Fractal Theming System (TypeScript)
 * Unified token map for Fractal Light and Fractal Void themes.
 * Use with styled-components, Emotion, or any CSS-in-JS library.
 */

export const fractalLight = {
  name: 'light' as const,
  color: {
    bgBase:          '#FFFFFF',
    surface:         '#F9FAFB',
    border:          '#E5E7EB',
    textPrimary:     '#111827',
    textMuted:       '#6B7280',
    accentGenesis:   '#D97706', // Solar Amber
    accentSynthesis: '#0891B2', // Deep Teal
    accentAuditor:   '#7C3AED', // Royal Violet
    success:         '#16A34A',
    warning:         '#F59E0B',
    error:           '#DC2626',
  },
  shadow: {
    sm: '0px 1px 3px rgba(0,0,0,0.06)',
    md: '0px 4px 12px rgba(0,0,0,0.08)',
    lg: '0px 8px 24px rgba(0,0,0,0.10)',
  },
  glass: {
    backdropFilter: 'none',
    background:     '#F9FAFB',
  },
};

export const fractalVoid = {
  name: 'void' as const,
  color: {
    bgBase:          '#05050A',
    surface:         'rgba(10, 10, 18, 0.8)',
    border:          '#1F1F2E',
    textPrimary:     '#EAEAEA',
    textMuted:       '#666677',
    accentGenesis:   '#FFD700', // Gold
    accentSynthesis: '#00F0FF', // Cyan
    accentAuditor:   '#BD00FF', // Purple
    success:         '#4ADE80',
    warning:         '#FBBF24',
    error:           '#F87171',
  },
  shadow: {
    sm: '0 0 8px rgba(0,240,255,0.15)',
    md: '0 0 16px rgba(0,240,255,0.20)',
    lg: '0 0 24px rgba(0,240,255,0.25)',
  },
  glass: {
    backdropFilter: 'blur(12px)',
    background:     'rgba(10, 10, 18, 0.8)',
  },
};

// Shared non-color tokens
export const sharedTokens = {
  font: {
    sans: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
  },
  fontSize: {
    display: '64px',
    h1:      '32px',
    h2:      '22px',
    body:    '15px',
    label:   '13px',
    caption: '12px',
    mono:    '13px',
  },
  space: {
    1:  '4px',
    2:  '8px',
    3:  '12px',
    4:  '16px',
    6:  '24px',
    8:  '32px',
    12: '48px',
    16: '64px',
  },
  radius: {
    sm:   '8px',
    md:   '12px',
    lg:   '16px',
    xl:   '24px',
    pill: '9999px',
  },
  transition: {
    fast:   '100ms ease-in-out',
    normal: '200ms ease-in-out',
    slow:   '300ms ease-in-out',
  },
};

export type Theme = typeof fractalLight | typeof fractalVoid;
export type ThemeName = 'light' | 'void';

export const themes: Record<ThemeName, Theme> = {
  light: fractalLight,
  void:  fractalVoid,
};
