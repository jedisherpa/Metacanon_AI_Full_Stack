/**
 * MetaCanon Sovereign AI Installer — Design Tokens (TypeScript)
 * Design Language: Cupertino Sovereign
 * Generated: 2026-03-04
 *
 * Usage: Import `tokens` into your component library, Tailwind config,
 * or styled-components theme provider.
 */

export const tokens = {
  color: {
    // Backgrounds
    bgBase:       '#F5F5F7',
    surface:      '#FFFFFF',
    consoleBg:    '#1C1C1E',

    // Borders
    border:       '#E5E5EA',
    borderFocus:  '#0A3628',
    borderError:  '#C0392B',

    // Text
    textPrimary:  '#1D1D1F',
    textMuted:    '#8E8E93',
    textInverse:  '#FFFFFF',
    consoleText:  '#4ADE80',

    // Accent — Green (Primary)
    accentGreen:    '#0A3628',
    accentGreenBg:  '#D4EDDF',
    accentGreenMid: '#1C7C54',

    // Accent — Amber (Warning)
    accentAmber:    '#B45309',
    accentAmberBg:  '#FEF3C7',

    // Accent — Red (Error)
    accentRed:    '#C0392B',
    accentRedBg:  '#FADBD8',

    // Accent — Navy (Info)
    accentNavy:   '#1E4A7A',
    accentNavyBg: '#EBF4FF',
  },

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

  fontWeight: {
    regular:  400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },

  lineHeight: {
    tight:   1.1,
    snug:    1.25,
    normal:  1.5,
    relaxed: 1.6,
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

  shadow: {
    sm: '0px 1px 3px rgba(0, 0, 0, 0.06)',
    md: '0px 4px 12px rgba(0, 0, 0, 0.08)',
    lg: '0px 8px 24px rgba(0, 0, 0, 0.10)',
    xl: '0px 16px 48px rgba(0, 0, 0, 0.12)',
  },

  transition: {
    fast:   '100ms ease-in-out',
    normal: '200ms ease-in-out',
    slow:   '300ms ease-in-out',
  },

  layout: {
    sidebarWidth:    '240px',
    contentMaxWidth: '960px',
    gridColumns:     12,
    gridGutter:      '24px',
  },
} as const;

export type Tokens = typeof tokens;
