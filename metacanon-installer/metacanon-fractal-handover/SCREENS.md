# MetaCanon AI Installer — Screen-by-Screen Spec

This document provides per-screen layout notes, key components, and theming behavior for each of the 13 screens. Reference the paired mockup images in `mockups/{screen}/` for visual detail.

---

## Screen 01 — Welcome

**Layout:** Centered floating window. Two side-by-side action cards.
**Key Components:** Logo header, hero text, two action cards, system info pills.
**Theme Toggle Placement:** Top-right of the window header.
**Fractal Light:** White window, fine-line tetrahedron icons, Amber/Teal buttons.
**Fractal Void:** Glass window, glowing Gold tetrahedron icons, Cyan-to-Purple gradient button.

---

## Screen 02 — System Check

**Layout:** Two-column (Sidebar 25%, Content 75%).
**Key Components:** Vertical stepper, 2-column check grid, status chips (Pass/Warn/Fail), warning banner, readiness score gauge.
**Fractal Light:** Teal 'PASS' chips, Amber 'WARN' chip, fine-line Tetrahedron diagram.
**Fractal Void:** Cyan glowing 'PASS' chips, Gold glowing 'WARN' chip, glowing wireframe Tetrahedron.

---

## Screen 03 — Compute Selection

**Layout:** Two-column (Sidebar 25%, Content 75%). Provider card grid (3 columns) + fallback chain.
**Key Components:** Provider cards (with toggle), fallback topology flow, stepper.
**Provider Color Coding:**
- Qwen 3.5: Genesis (Amber/Gold)
- Ollama: Synthesis (Teal/Cyan)
- Morpheus: Auditor (Violet/Purple)
**Fractal Light:** Fine-line jewel-tone borders on cards.
**Fractal Void:** Neon glowing borders on dark glass cards.

---

## Screen 04 — Provider Config

**Layout:** Two-column (Sidebar 25%, Content 75%). Tabbed form.
**Key Components:** Segmented tab control, API key input (masked), model input, endpoint input, temperature slider, 'Test Link' button, health chip.
**Fractal Light:** Clean white form, Teal focus borders, Amber lock icon.
**Fractal Void:** Dark glass form, Cyan glowing focus borders, Gold lock icon.

---

## Screen 05 — Security & Persistence

**Layout:** Two-column (Sidebar 25%, Content 75%). Two-column within main content.
**Key Components:** Path picker input, encryption toggle, passphrase input with strength bar, 'Save Crystal' button, recent snapshots list.
**Fractal Light:** Violet toggle, Amber strength bar, Teal path text.
**Fractal Void:** Cyan glowing toggle, Gold strength bar, Cyan path text.

---

## Screen 06 — Observability

**Layout:** Two-column (Sidebar 25%, Content 75%). Dual-panel log/topology view.
**Key Components:** Event stream console, fractal topology diagram (Icosahedron), retention slider, log level segmented control, fallback banner.
**Fractal Light:** Light mode console (pale gray bg, dark text), fine-line Icosahedron.
**Fractal Void:** Dark terminal (black bg, Cyan text), glowing wireframe Icosahedron.

---

## Screen 07 — Review & Install

**Layout:** Two-column (Sidebar 25%, Content 75%). Split main content (Summary 55%, Log 45%).
**Key Components:** Config summary list, install log console, progress bar, 'Initiate Sequence' button (disabled until ready).
**Fractal Light:** Pale gray console, gradient Teal-to-Violet progress bar.
**Fractal Void:** Black glass console, gradient Cyan-to-Purple progress bar.

---

## Screen 08 — Done

**Layout:** Centered floating window.
**Key Components:** Geometric success mark (Octahedron), headline, stats chips, three action buttons.
**Fractal Light:** Fine-line Octahedron in Teal/Violet, Amber core.
**Fractal Void:** Glowing wireframe Octahedron in Cyan/Purple, Gold core.

---

## Screen 09 — Mobile Welcome

**Layout:** Single-column portrait. Stacked action cards.
**Fractal Light:** White surface, fine-line geometry.
**Fractal Void:** Dark glass surface, glowing geometry.

---

## Screen 10 — Mobile Compute

**Layout:** Single-column portrait. iOS-style grouped list.
**Fractal Light:** White cards, jewel-tone fine borders.
**Fractal Void:** Dark glass cards, neon glowing borders.

---

## Screen 11 — Mobile Review

**Layout:** Single-column portrait. Stacked summary and log cards.
**Fractal Light:** Pale gray console, gradient progress bar.
**Fractal Void:** Black glass console, neon gradient progress bar.

---

## Screen 12 — Component Sheet

A reference sheet showing all atomic UI components in both themes. Use this as a QA checklist.

---

## Screen 13 — Visual System

A design system documentation page. For reference only; not a user-facing screen.
