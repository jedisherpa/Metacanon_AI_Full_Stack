# MetaCanon Sovereign AI Installer — Design System

**Project:** MetaCanon Sovereign AI Installer
**Design Language:** Cupertino Sovereign
**Date:** 2026-03-04

This document outlines the visual and interactive design system for the installer UI. The goal is to create a premium, intentional, and trustworthy experience that feels like native, high-end software, not a generic web app.

## Color Tokens

The palette is minimal and precise, using a cool gray base with a single, strong accent for all primary actions.

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#F5F5F7` | Main window/app background (Apple cool gray) |
| `surface` | `#FFFFFF` | Card backgrounds, floating panels, inputs |
| `border` | `#E5E5EA` | Subtle borders, dividers, disabled input outlines |
| `text-primary` | `#1D1D1F` | Headings, primary body text (Apple near-black) |
| `text-muted` | `#8E8E93` | Secondary labels, captions, disabled text |
| `accent-green` | `#0A3628` | Primary buttons, active states, toggles (Deep Forest Green) |
| `accent-green-bg` | `#D4EDDF` | Success chip backgrounds, light green tints |
| `accent-amber` | `#B45309` | Warning text, icons |
| `accent-amber-bg` | `#FEF3C7` | Warning chip backgrounds |
| `accent-red` | `#C0392B` | Error text, icons, destructive actions |
| `accent-red-bg` | `#FADBD8` | Error chip backgrounds |
| `console-bg` | `#1C1C1E` | Dark log console background |
| `console-text` | `#4ADE80` | Log console text |

## Typography

The typography pairs a technical sans-serif with a clean monospaced font to balance personality with precision.

- **Headline Font:** `Space Grotesk`
- **Body Font:** `Space Grotesk`
- **Code/Data Font:** `IBM Plex Mono`

| Role | Font | Weight | Size | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| Display | Space Grotesk | 700 | 64px | 1.1 | -0.5px |
| H1 | Space Grotesk | 700 | 32px | 1.2 | -0.25px |
| H2 | Space Grotesk | 600 | 22px | 1.25 | Normal |
| Body | Space Grotesk | 400 | 15px | 1.6 | Normal |
| Body (Strong) | Space Grotesk | 500 | 15px | 1.6 | Normal |
| Label | Space Grotesk | 500 | 13px | 1.4 | +0.25px (UPPERCASE) |
| Code/Mono | IBM Plex Mono | 400 | 13px | 1.6 | Normal |

## Spacing & Layout

A consistent 8px base unit is used for all spacing and layout decisions.

- **Base Unit:** `8px`
- **Scale:** `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`
- **Grid:** 12-column grid with 24px gutters.
- **Padding:**
  - Cards: `24px`
  - Inputs: `12px` vertical, `16px` horizontal
  - Buttons: `12px` vertical, `24px` horizontal

## Shadows & Materials

Shadows are subtle and smooth to create a sense of depth and hierarchy.

- **Standard Shadow:** `0px 4px 12px rgba(0, 0, 0, 0.08)`
- **Floating Shadow:** `0px 8px 24px rgba(0, 0, 0, 0.1)` (for modals or active panels)
- **Material:** Frosted glass/backdrop blur (`backdrop-filter: blur(16px)`) for sidebars and sticky headers.

## Corner Radius

We use a continuous curve (squircle) for a softer, more organic feel, consistent with modern Apple hardware and software.

- **Cards & Windows:** `24px`
- **Inputs & Controls:** `12px`
- **Buttons (Pill):** `9999px`
- **Chips:** `8px`

## Interaction Cues

- **Hover:** Subtle lift/scale (`transform: scale(1.02)`) and shadow increase on interactive cards.
- **Press:** Scale down (`transform: scale(0.98)`) and slight brightness change.
- **Toggle Switches:** Smooth 200ms ease-in-out transition.
- **Progress Bars:** Linear fill animation over 300ms.
- **State Changes:** Fade-in/out transitions for new elements appearing on screen.
