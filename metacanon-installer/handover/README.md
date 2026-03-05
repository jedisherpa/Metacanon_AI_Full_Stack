# MetaCanon Sovereign AI Installer — Design Handover Package

**Design Language:** Cupertino Sovereign
**Version:** 1.0
**Date:** 2026-03-04

This package contains everything the development team needs to implement the MetaCanon Sovereign AI Installer UI. The design language is "Cupertino Sovereign" — a premium, light-first aesthetic inspired by Apple's native software design, adapted for a technical, sovereign AI product.

---

## Package Contents

```
metacanon-installer-handover/
│
├── README.md                    ← You are here
├── DESIGN_SYSTEM.md             ← Color tokens, typography, spacing, shadows
├── COMPONENTS.md                ← Every UI component, its states, and props
├── STATES.md                    ← All required UI states (error, loading, etc.)
├── USER_FLOW.md                 ← Step-by-step user journey and logic
├── FONTS.md                     ← Font loading instructions
│
├── tokens/
│   ├── design-tokens.css        ← CSS custom properties (import at root)
│   ├── design-tokens.ts         ← TypeScript tokens object for JS frameworks
│   └── tailwind.config.extend.js ← Tailwind CSS theme extension
│
└── mockups/
    ├── desktop/
    │   ├── 01-welcome.webp
    │   ├── 02-system-check.webp
    │   ├── 03-compute-selection.webp
    │   ├── 04-provider-config.webp
    │   ├── 05-security-persistence.webp
    │   ├── 06-observability.webp
    │   ├── 07-review-install.webp
    │   └── 08-done.webp
    ├── mobile/
    │   ├── 09-mobile-welcome.webp
    │   ├── 10-mobile-compute.webp
    │   └── 11-mobile-review.webp
    └── reference/
        ├── 12-component-sheet.webp
        └── 13-visual-system.webp
```

---

## Quick Start for Developers

**1. Install Fonts.** Follow the instructions in `FONTS.md` to load Space Grotesk and IBM Plex Mono.

**2. Import Tokens.** Import `tokens/design-tokens.css` at the root of your application. All design values are available as CSS custom properties (e.g., `var(--color-accent-green)`). If using a JS framework, import `tokens/design-tokens.ts` instead.

**3. Extend Tailwind (if applicable).** Merge `tokens/tailwind.config.extend.js` into your `tailwind.config.js` to get all design tokens as Tailwind utility classes.

**4. Reference Mockups.** All 13 high-fidelity mockup images are in the `mockups/` directory, organized by screen type.

**5. Build Components.** Use `COMPONENTS.md` as the spec for each reusable UI component. All props and states are documented there.

**6. Implement States.** Use `STATES.md` to ensure every required UI state (loading, error, fallback, etc.) is handled correctly.

**7. Follow the Flow.** Use `USER_FLOW.md` to understand the navigation logic and conditional routing between screens.

---

## Design Principles

The "Cupertino Sovereign" aesthetic is built on four principles that should guide every implementation decision.

**Restraint.** One accent color (`#0A3628`). No gradients. No decorative elements. Every pixel must earn its place.

**Depth through light.** Hierarchy is created through surface elevation (white cards on gray background) and shadow, not color. Use the shadow scale in `DESIGN_SYSTEM.md`.

**Precision.** Spacing is always a multiple of 8px. Corner radii follow the defined scale. Alignment is always intentional.

**Technical identity.** IBM Plex Mono is used for all data, paths, API keys, and log output. This is not optional — it is what makes the UI feel like a tool built by engineers, for engineers.
