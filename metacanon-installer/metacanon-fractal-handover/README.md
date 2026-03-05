# MetaCanon AI Installer — Fractal System Handover

**Version:** 1.0
**Date:** 2026-03-04

This package contains the complete design and theming architecture for the **MetaCanon AI Installer**, designed for implementation by **Codex**. It includes two themes, **Fractal Light** and **Fractal Void**, which can be toggled at runtime.

---

## Package Contents

```
metacanon-fractal-handover/
│
├── README.md                    ← You are here
├── THEMING.md                   ← Core theming architecture guide
│
├── tokens/
│   └── design-tokens.css        ← Unified CSS custom properties for both themes
│
└── mockups/
    ├── 01_welcome/
    │   ├── welcome_light.webp
    │   └── welcome_void.webp
    ├── 02_system_check/
    │   ├── system_check_light.webp
    │   └── system_check_void.webp
    ├── ... (and so on for all 13 screens)
```

---

## Quick Start for Codex

**1. Review Theming Architecture.** Read `THEMING.md` for a complete overview of the `data-theme` toggle system and semantic token mapping.

**2. Import Tokens.** Import `tokens/design-tokens.css` at the root of your application. This single file contains all color definitions for both themes.

**3. Implement the Theme Toggle.** Use JavaScript to set the `data-theme` attribute on the `<html>` element to either `"light"` or `"void"`.

**4. Build Components with Semantic Tokens.** All components should use `var(--token-name)` in their CSS. Do not use hardcoded hex values. This ensures the UI will react instantly to the theme toggle.

**5. Reference Mockups.** The `mockups/` directory is organized by screen. Each folder contains the `_light` and `_void` versions for direct visual comparison.

---

## Design Philosophy

-   **Fractal Light (Sovereign Day):** An architectural, pristine, and intellectual aesthetic. It evokes the feeling of a crystalline blueprint on premium paper.
-   **Fractal Void (Cosmic Night):** A cyberpunk, high-tech, and mysterious aesthetic. It evokes the feeling of a cosmic terminal with glowing geometric constellations.

The unified token system ensures that while the aesthetics are distinct, the underlying structure and layout remain consistent, providing a seamless user experience when toggling themes.
