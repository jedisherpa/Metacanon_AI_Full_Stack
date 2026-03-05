# MetaCanon Sovereign AI Installer — Font Loading Guide

The design uses two fonts: **Space Grotesk** (headings and body) and **IBM Plex Mono** (code, data, and logs). Both are available via Google Fonts.

## Google Fonts (Web)

Add the following `<link>` tags to the `<head>` of your HTML, or import them in your global CSS file.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## CSS Import

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
```

## Self-Hosted (Recommended for Production)

For production environments where external requests should be minimized, download the font files from Google Fonts and host them locally. Use `font-display: swap` to prevent invisible text during loading.

```css
@font-face {
  font-family: 'Space Grotesk';
  src: url('/fonts/SpaceGrotesk-VariableFont_wght.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'IBM Plex Mono';
  src: url('/fonts/IBMPlexMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'IBM Plex Mono';
  src: url('/fonts/IBMPlexMono-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
```

## Fallback Stack

The `design-tokens.css` file already includes system font fallbacks. If the custom fonts fail to load, the UI will gracefully fall back to:

- **Sans:** `-apple-system, BlinkMacSystemFont, sans-serif`
- **Mono:** `SFMono-Regular, Consolas, monospace`
