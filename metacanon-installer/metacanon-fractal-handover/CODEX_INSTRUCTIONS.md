# MetaCanon AI Installer — Codex Implementation Brief

**Design System:** MetaCanon Fractal System
**Themes:** Fractal Light (Sovereign Day) + Fractal Void (Cosmic Night)
**Toggle Mechanism:** `data-theme` attribute on `<html>`

---

## 1. Project Overview

You are building the **MetaCanon AI Installer**, a 7-step setup wizard. The UI must support two themes that the user can toggle at any time during the setup flow. The themes share the same layout, component structure, and interaction logic — only the visual appearance changes.

---

## 2. Theme Toggle Implementation

### HTML Root

```html
<!-- Default: Fractal Light -->
<html lang="en" data-theme="light">
```

### CSS Tokens (import first in your stylesheet)

```css
/* Import the unified token file */
@import './tokens/design-tokens.css';
```

### JavaScript Toggle

```javascript
const ThemeToggle = {
  LIGHT: 'light',
  VOID: 'void',

  init() {
    const saved = localStorage.getItem('mc-theme') || this.LIGHT;
    this.apply(saved);
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mc-theme', theme);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    this.apply(current === this.VOID ? this.LIGHT : this.VOID);
  }
};

// Initialize on load
ThemeToggle.init();
```

### Toggle Button (place in the installer header)

```html
<button
  class="theme-toggle"
  onclick="ThemeToggle.toggle()"
  aria-label="Toggle theme"
>
  <!-- Light mode icon (sun) -->
  <span class="icon-light">☀</span>
  <!-- Void mode icon (moon/star) -->
  <span class="icon-void">✦</span>
</button>
```

```css
/* Show/hide toggle icons based on active theme */
[data-theme="light"] .icon-void { display: none; }
[data-theme="void"]  .icon-light { display: none; }

/* Void-mode glass surface treatment */
[data-theme="void"] .glass-surface {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
```

---

## 3. Installer Step Structure

The installer is a 7-step linear wizard with a persistent sidebar stepper.

| Step | Screen | File Reference |
|---|---|---|
| 1 | Welcome | `mockups/01_welcome/` |
| 2 | System Check | `mockups/02_system_check/` |
| 3 | Compute Selection | `mockups/03_compute_selection/` |
| 4 | Provider Config | `mockups/04_provider_config/` |
| 5 | Security & Persistence | `mockups/05_security_persistence/` |
| 6 | Observability | `mockups/06_observability/` |
| 7 | Review & Install | `mockups/07_review_install/` |
| — | Done | `mockups/08_done/` |

---

## 4. Component Token Usage Rules

Every component MUST use semantic tokens, never hardcoded hex values.

```css
/* CORRECT */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

/* WRONG — breaks theming */
.card {
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  color: #111827;
}
```

---

## 5. Semantic Token Reference

| Token | Fractal Light | Fractal Void | Usage |
|---|---|---|---|
| `--bg-base` | `#FFFFFF` | `#05050A` | Page background |
| `--surface` | `#F9FAFB` | `rgba(10,10,18,0.8)` | Cards, panels |
| `--border` | `#E5E7EB` | `#1F1F2E` | All borders |
| `--text-primary` | `#111827` | `#EAEAEA` | Headings, body |
| `--text-muted` | `#6B7280` | `#666677` | Labels, captions |
| `--accent-genesis` | `#D97706` | `#FFD700` | Qwen 3.5, core actions |
| `--accent-synthesis` | `#0891B2` | `#00F0FF` | Network, Ollama, primary CTA |
| `--accent-auditor` | `#7C3AED` | `#BD00FF` | Encryption, Morpheus, secondary CTA |
| `--success` | `#16A34A` | `#4ADE80` | Pass chips, valid states |
| `--warning` | `#F59E0B` | `#FBBF24` | Warn chips, fallback banners |
| `--error` | `#DC2626` | `#F87171` | Fail chips, error states |

---

## 6. Typography

```css
/* Load fonts */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

/* Apply fonts */
body {
  font-family: 'Space Grotesk', -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-base);
}

code, .mono, .log-output, .path-field {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
}
```

---

## 7. Spacing & Shape

```css
/* Spacing: 8px base unit */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;

/* Corner Radii */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-pill: 9999px;

/* Shadows (Light) */
--shadow-sm: 0px 1px 3px rgba(0,0,0,0.06);
--shadow-md: 0px 4px 12px rgba(0,0,0,0.08);
--shadow-lg: 0px 8px 24px rgba(0,0,0,0.10);

/* Shadows (Void) — use glow instead */
--shadow-glow-genesis:   0 0 12px rgba(255,215,0,0.3);
--shadow-glow-synthesis: 0 0 12px rgba(0,240,255,0.3);
--shadow-glow-auditor:   0 0 12px rgba(189,0,255,0.3);
```

---

## 8. Transition Rules

All theme transitions should be smooth. Apply this to the root element:

```css
html {
  transition:
    background-color 250ms ease-in-out,
    color 250ms ease-in-out;
}

* {
  transition:
    background-color 200ms ease-in-out,
    border-color 200ms ease-in-out,
    color 200ms ease-in-out,
    box-shadow 200ms ease-in-out;
}
```

---

## 9. Mockup Reference

Each screen folder in `mockups/` contains two files:
- `{screen}_light.webp` — Fractal Light reference
- `{screen}_void.webp` — Fractal Void reference

Use these as pixel-level references for layout, spacing, and component placement. The two files for each screen should be structurally identical — only colors and surface treatments differ.
