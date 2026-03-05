/**
 * MetaCanon AI Installer — Tailwind CSS Config Extension
 * Fractal Theming System (Light + Void)
 *
 * Usage: Merge this `extend` block into your tailwind.config.js.
 * Theme switching is handled via CSS custom properties in design-tokens.css.
 * Reference tokens as: bg-[--bg-base], text-[--text-primary], etc.
 */

module.exports = {
  // Enable class-based dark mode (optional, we use data-theme instead)
  darkMode: ['selector', '[data-theme="void"]'],

  theme: {
    extend: {
      colors: {
        // Map Tailwind classes to CSS custom properties
        'bg-base':          'var(--bg-base)',
        'surface':          'var(--surface)',
        'border-default':   'var(--border)',
        'text-primary':     'var(--text-primary)',
        'text-muted':       'var(--text-muted)',
        'accent-genesis':   'var(--accent-genesis)',
        'accent-synthesis': 'var(--accent-synthesis)',
        'accent-auditor':   'var(--accent-auditor)',
        'success':          'var(--success)',
        'warning':          'var(--warning)',
        'error':            'var(--error)',
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

      transitionDuration: {
        'fast':   '100ms',
        'normal': '200ms',
        'slow':   '300ms',
      },
    },
  },
};
