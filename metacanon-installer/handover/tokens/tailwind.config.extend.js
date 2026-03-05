/**
 * MetaCanon Sovereign AI Installer — Tailwind CSS Config Extension
 * Design Language: Cupertino Sovereign
 *
 * Usage: Merge this `extend` block into your project's tailwind.config.js.
 *
 * Example:
 *   const obsidianExtend = require('./tokens/tailwind.config.extend.js');
 *   module.exports = { theme: { extend: obsidianExtend } };
 */

module.exports = {
  colors: {
    // Backgrounds
    'bg-base':      '#F5F5F7',
    'surface':      '#FFFFFF',
    'console-bg':   '#1C1C1E',

    // Borders
    'border-default': '#E5E5EA',
    'border-focus':   '#0A3628',
    'border-error':   '#C0392B',

    // Text
    'text-primary': '#1D1D1F',
    'text-muted':   '#8E8E93',
    'text-inverse': '#FFFFFF',
    'console-text': '#4ADE80',

    // Accent — Green
    'green-accent':    '#0A3628',
    'green-accent-bg': '#D4EDDF',
    'green-mid':       '#1C7C54',

    // Accent — Amber
    'amber-accent':    '#B45309',
    'amber-accent-bg': '#FEF3C7',

    // Accent — Red
    'red-accent':    '#C0392B',
    'red-accent-bg': '#FADBD8',

    // Accent — Navy
    'navy-accent':    '#1E4A7A',
    'navy-accent-bg': '#EBF4FF',
  },

  fontFamily: {
    sans: ["'Space Grotesk'", '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
    mono: ["'IBM Plex Mono'", "'SFMono-Regular'", 'Consolas', 'monospace'],
  },

  fontSize: {
    'display': ['64px', { lineHeight: '1.1', letterSpacing: '-0.5px' }],
    'h1':      ['32px', { lineHeight: '1.2', letterSpacing: '-0.25px' }],
    'h2':      ['22px', { lineHeight: '1.25' }],
    'body':    ['15px', { lineHeight: '1.6' }],
    'label':   ['13px', { lineHeight: '1.4' }],
    'caption': ['12px', { lineHeight: '1.5' }],
    'mono':    ['13px', { lineHeight: '1.6' }],
  },

  borderRadius: {
    'sm':   '8px',
    'md':   '12px',
    'lg':   '16px',
    'xl':   '24px',
    'pill': '9999px',
  },

  boxShadow: {
    'sm': '0px 1px 3px rgba(0, 0, 0, 0.06)',
    'md': '0px 4px 12px rgba(0, 0, 0, 0.08)',
    'lg': '0px 8px 24px rgba(0, 0, 0, 0.10)',
    'xl': '0px 16px 48px rgba(0, 0, 0, 0.12)',
  },

  transitionDuration: {
    'fast':   '100ms',
    'normal': '200ms',
    'slow':   '300ms',
  },

  spacing: {
    '1':  '4px',
    '2':  '8px',
    '3':  '12px',
    '4':  '16px',
    '6':  '24px',
    '8':  '32px',
    '12': '48px',
    '16': '64px',
  },
};
