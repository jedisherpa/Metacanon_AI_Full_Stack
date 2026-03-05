# MetaCanon AI Installer — Fractal Theming Guide

**Version:** 1.0
**Date:** 2026-03-04

This document outlines the architecture for implementing the dual-theme system (Fractal Void & Fractal Light) for the MetaCanon AI Installer. The system is designed to be toggled at runtime with a single attribute change.

---

## Theming Architecture

The entire theme system is controlled by a `data-theme` attribute on the root `<html>` element.

-   **Fractal Light (Default):** `<html data-theme="light">`
-   **Fractal Void (Dark Mode):** `<html data-theme="void">`

All color tokens are defined as CSS custom properties within the `tokens/design-tokens.css` file. The values of these properties change based on the `data-theme` attribute.

### Example Implementation (JavaScript)

```javascript
// Function to toggle the theme
const toggleTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('metacanon-theme', theme); // Persist preference
};

// Set initial theme based on user preference or system settings
const preferredTheme = localStorage.getItem('metacanon-theme') || 'light';
toggleTheme(preferredTheme);
```

---

## Semantic Color Tokens

Instead of using hardcoded hex values, all components should reference the semantic color tokens defined in the CSS. This ensures that when the theme is toggled, the UI updates automatically.

**Key Token Mapping:**

| Semantic Token | `data-theme="light"` (Fractal Light) | `data-theme="void"` (Fractal Void) |
|---|---|---|
| `--bg-base` | `#FFFFFF` (White) | `#05050A` (Void Black) |
| `--surface` | `#F9FAFB` (Pale Gray) | `#0A0A12` (Glass Black) + Blur |
| `--border` | `#E5E7EB` (Light Gray) | `#1F1F2E` (Void Border) |
| `--text-primary` | `#111827` (Deep Black) | `#EAEAEA` (Bright White) |
| `--text-muted` | `#6B7280` (Medium Gray) | `#666677` (Muted Void) |
| `--accent-genesis` | `#D97706` (Solar Amber) | `#FFD700` (Gold) |
| `--accent-synthesis`| `#0891B2` (Deep Teal) | `#00F0FF` (Cyan) |
| `--accent-auditor` | `#7C3AED` (Royal Violet) | `#BD00FF` (Purple) |

**Usage in CSS:**

```css
.card {
  background-color: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.button-primary {
  background: linear-gradient(to right, var(--accent-synthesis), var(--accent-auditor));
  color: var(--text-primary);
}
```

By adhering to this token-based approach, the entire UI will be fully themeable with minimal code overhead. The `design-tokens.css` file contains the complete implementation for both themes.
