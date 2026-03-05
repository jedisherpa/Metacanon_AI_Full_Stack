# MetaCanon AI Installer — Complete Asset Manifest

All SVG assets are provided in two variants: `light/` (Fractal Light) and `void/` (Fractal Void).
Every file is a standalone, self-contained SVG. Import directly or inline in React components.

**Total Assets: 184 files** (158 SVGs + 26 WebP mockups)

---

## 1. Sacred Geometry

`assets/geometry/{light|void}/`

| File | Shape | Vertices | Usage |
|---|---|---|---|
| `tetrahedron.svg` | Tetrahedron | 4 | Personal Node / Welcome card |
| `octahedron.svg` | Octahedron | 6 | Group Node / Done screen |
| `icosahedron.svg` | Icosahedron | 12 | Network Cluster / Observability |
| `genesis-crystal.svg` | Diamond | — | Core node indicator / Provider cards |
| `fractal-scaling-path.svg` | Composite scene | — | Full 3-node scaling diagram (900×320) |
| `tensegrity-tetrahedron.svg` | Composite scene | — | Full architecture diagram with spec panel (900×580) |

---

## 2. UI Icons

`assets/icons/{light|void}/` — All 24×24 viewBox, 2px stroke, round caps.

| File | Usage | Color Token |
|---|---|---|
| `icon-lock.svg` | API key input field | `--accent-genesis` |
| `icon-folder.svg` | Path picker field | `--accent-synthesis` |
| `icon-check.svg` | Inline valid state | `--accent-synthesis` |
| `icon-check-circle.svg` | Success chips, PASS state | `--accent-synthesis` |
| `icon-node.svg` | Network node / provider card | `--accent-synthesis` |
| `icon-sun.svg` | Theme toggle — Light mode | `--accent-genesis` |
| `icon-star.svg` | Theme toggle — Void mode | `--accent-genesis` |
| `icon-warning.svg` | WARN chips, fallback banners | `--color-warning` |
| `icon-error.svg` | FAIL chips, error states | `--color-error` |
| `icon-sliders.svg` | Advanced Setup card | `--accent-auditor` |
| `icon-lightning.svg` | Quick Setup / Genesis Setup | `--accent-genesis` |
| `icon-terminal.svg` | Log console, Observability | `--accent-synthesis` |

---

## 3. UI Components

`assets/components/{light|void}/{category}/`

### Navigation (`nav/`)

| File | Description | Size |
|---|---|---|
| `stepper-step-complete.svg` | Stepper step — completed (checkmark) | 32×32 |
| `stepper-step-active.svg` | Stepper step — current (filled dot) | 32×32 |
| `stepper-step-future.svg` | Stepper step — upcoming (outline) | 32×32 |
| `stepper-connector.svg` | Vertical dashed connector line | 4×40 |
| `tab-bar.svg` | Segmented tab control (3 tabs) | 328×40 |
| `breadcrumb.svg` | Mobile back arrow + step counter | 320×44 |

### Cards (`cards/`)

| File | Description | Size |
|---|---|---|
| `action-card.svg` | Welcome action card (icon + CTA) | 220×180 |
| `provider-card-selected.svg` | Provider card — selected/active | 200×120 |
| `provider-card-unselected.svg` | Provider card — unselected | 200×120 |
| `summary-row.svg` | Review screen key-value row | 400×44 |
| `crystal-action-card.svg` | Security snapshot action card | 200×140 |

### Status Chips (`chips/`)

| File | Description | Size |
|---|---|---|
| `chip-pass.svg` | PASS status chip (green) | 120×24 |
| `chip-warn.svg` | WARN status chip (amber) | 120×24 |
| `chip-fail.svg` | FAIL status chip (red) | 120×24 |
| `chip-healthy.svg` | Healthy provider chip | 120×24 |
| `chip-in-progress.svg` | In-progress chip | 120×24 |
| `chip-system-info.svg` | System info pill | 110×24 |
| `chip-badge-genesis.svg` | "Genesis Core" badge | 120×24 |
| `chip-badge-synthesis.svg` | "Local Runtime" badge | 120×24 |
| `chip-badge-auditor.svg` | "Fractal Mesh" badge | 120×24 |
| `chip-node-verified.svg` | "Node Verified" badge | 120×24 |

### Form Inputs (`inputs/`)

| File | Description | Size |
|---|---|---|
| `text-field-default.svg` | Text input — default state | 320×64 |
| `text-field-focused.svg` | Text input — focused (glowing border) | 320×64 |
| `text-field-error.svg` | Text input — validation error | 320×80 |
| `secret-field.svg` | Masked API key input | 320×64 |
| `path-picker.svg` | File path input + Browse button | 320×64 |
| `slider.svg` | Range slider with gradient track | 320×48 |
| `strength-bar.svg` | Password strength bar (segmented) | 220×24 |
| `log-level-selector.svg` | Segmented log level control | 292×32 |

### Controls (`controls/`)

| File | Description | Size |
|---|---|---|
| `toggle-on.svg` | Toggle switch — ON | 52×28 |
| `toggle-off.svg` | Toggle switch — OFF | 52×28 |
| `theme-toggle.svg` | Light/Void theme switcher | 44×44 |
| `checkbox-checked.svg` | Checkbox — checked | 24×24 |
| `checkbox-unchecked.svg` | Checkbox — unchecked | 24×24 |

### Buttons (`buttons/`)

| File | Description | Size |
|---|---|---|
| `primary.svg` | Primary CTA (gradient pill) | 200×48 |
| `primary-disabled.svg` | Primary CTA — disabled | 200×48 |
| `primary-loading.svg` | Primary CTA — loading (dots) | 200×48 |
| `secondary.svg` | Secondary outlined button | 160×48 |
| `ghost.svg` | Ghost/text-only button | 120×48 |
| `destructive.svg` | Destructive action (red outline) | 160×48 |
| `test-link.svg` | Provider "Test Link" inline button | 120×36 |
| `browse.svg` | Path picker "Browse" button | 80×40 |

### Banners & Alerts (`banners/`)

| File | Description | Size |
|---|---|---|
| `banner-warning.svg` | Warning notification (amber) | 480×64 |
| `banner-error.svg` | Error notification (red) | 480×64 |
| `banner-info.svg` | Info notification (teal) | 480×64 |
| `banner-fallback.svg` | Fallback chain active (amber) | 480×64 |
| `banner-success.svg` | Success confirmation (green) | 480×64 |

### Log Console (`console/`)

| File | Description | Size |
|---|---|---|
| `log-console.svg` | Full terminal panel | 480×200 |
| `log-line-info.svg` | Single INFO log line | 440×20 |
| `log-line-warn.svg` | Single WARN log line | 440×20 |
| `log-line-error.svg` | Single ERROR log line | 440×20 |
| `log-line-success.svg` | Single SUCCESS log line | 440×20 |
| `console-header.svg` | Console panel header + LIVE dot | 480×36 |

### Progress (`progress/`)

| File | Description | Size |
|---|---|---|
| `progress-bar.svg` | Gradient progress bar (80%) | 400×24 |
| `progress-bar-complete.svg` | Progress bar — 100% complete | 400×24 |
| `step-indicator.svg` | Mobile step counter "2 of 7" | 80×24 |

### Topology (`topology/`)

| File | Description | Size |
|---|---|---|
| `fallback-chain.svg` | Full fallback chain diagram | 380×70 |
| `node-dot-genesis.svg` | Genesis node dot (amber/gold) | 16×16 |
| `node-dot-synthesis.svg` | Synthesis node dot (teal/cyan) | 16×16 |
| `node-dot-muted.svg` | Inactive/muted node dot | 16×16 |
| `connector-arrow.svg` | Dashed arrow between nodes | 48×16 |

---

## 4. Mockup Images (WebP)

`mockups/{screen}/` — 13 screens × 2 themes = 26 images

| Screen | Void | Light |
|---|---|---|
| `01_welcome` | `_void.webp` | `_light.webp` |
| `02_system_check` | `_void.webp` | `_light.webp` |
| `03_compute` | `_void.webp` | `_light.webp` |
| `04_provider_cfg` | `_void.webp` | `_light.webp` |
| `05_security` | `_void.webp` | `_light.webp` |
| `06_observability` | `_void.webp` | `_light.webp` |
| `07_review` | `_void.webp` | `_light.webp` |
| `08_done` | `_void.webp` | `_light.webp` |
| `09_mob_welcome` | `_void.webp` | `_light.webp` |
| `10_mob_compute` | `_void.webp` | `_light.webp` |
| `11_mob_review` | `_void.webp` | `_light.webp` |
| `12_components` | `_void.webp` | `_light.webp` |
| `13_annotation` | `_void.webp` | `_light.webp` |

---

## React Usage Pattern

```jsx
// Theme-aware component — works for any asset category
const Asset = ({ category, name, theme, ...props }) => (
  <img
    src={`/assets/${category}/${theme}/${name}.svg`}
    alt={name}
    {...props}
  />
);

// Examples
<Asset category="components/light" name="buttons/primary"         theme="" />
<Asset category="geometry"         name="tetrahedron"             theme="void" />
<Asset category="icons"            name="icon-lightning"          theme="light" />
<Asset category="components"       name="chips/chip-pass"         theme="void" />
```

## Inline SVG Pattern (for CSS color control)

```jsx
import { ReactComponent as PrimaryBtn } from
  './assets/components/light/buttons/primary.svg';

// Override stroke/fill via CSS custom properties
<PrimaryBtn style={{ '--accent-synthesis': 'var(--accent-synthesis)' }} />
```
