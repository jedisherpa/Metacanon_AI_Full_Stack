# PrismAI Manual Screenshot Capture Plan

This document translates the narrative shot list into a practical capture brief for the current PrismAI fork.

The goal is not just to collect beautiful images. The goal is to produce screenshots that teach users exactly what to click, what mode they are in, and what the system is doing.

## Capture Principles

- Every screenshot should show a real route, real control, or real state.
- Every screenshot should teach an action, not just imply one.
- Avoid purely decorative hero shots unless they also clarify a workflow.
- Prefer screenshots with one clear focal action per frame.
- When a concept is not fully implemented yet, note that honestly instead of faking it.

## Core Capture Setup

Before capturing the full set, prepare the following:

1. A clean admin account in the packaged `PrismAI.app`.
2. One active workspace named `Prism Preview`.
3. One connected LLM provider in `Settings > LLM`.
4. At least one uploaded document in `Prism Preview`.
5. Theme toggle available for `Dark`, `Light`, and `Cathedral`.
6. The imported MetaCanon library loaded with:
   - `12` Councils
   - `208` Lenses
   - `21` Presets
   - `3` Skills
   - Governance Documents
7. One sample saved Constellation in the Library.
8. One example chat thread with a real assistant response.
9. One example Lens alignment active from the sidebar.

## Device / Frame Specs

Use these base capture sizes:

- Mobile MVP: `390 x 844`
- Desktop app: `1440 x 900`
- Wide desktop overview: `1728 x 1117` or similar

For the mobile set, use a responsive browser/device frame unless we build a dedicated mobile shell.

## Readiness Legend

- `Ready`: can be captured now from real UI with minimal staging
- `Partial`: can be approximated now, but the exact concept is not yet expressed cleanly in UI
- `Needs UI Work`: should not be captured until we add or tighten the relevant surface

## Part I: Awakening the Artifact

### 1. The Threshold (Onboarding)

- Objective: Show the very first step into PrismAI.
- Target surface: `/onboarding`
- What should be visible:
  - Welcome title
  - PrismAI logo
  - `Explore the Artifact`
- Current status: `Partial`
- Notes:
  - The current onboarding home clearly supports `Explore the Artifact`.
  - A distinct `Awaken Prism` QR-pairing button is not present on this screen yet.
  - If we want the shot exactly as described, we need one onboarding pass to add a second CTA or a pairing state.

### 2. The Scrying Glass (Default Chat)

- Objective: Show the default mobile chat experience and the calm idle atmosphere.
- Target surface: `/workspace/prism-preview`
- What should be visible:
  - clean mobile chat shell
  - idle Prism state
  - composer
- Current status: `Partial`
- Notes:
  - We can capture the mobile chat surface in a responsive viewport.
  - The gold idle ambience is present in desktop shells, but the exact “subtle gold edge lighting” on mobile should be checked and may need a small mobile-specific polish pass.

### 3. The Alignment Menu

- Objective: Show how a user selects a starting Lens pack.
- Target surface: currently best mapped to the left rail featured lens area and the Library
- What should be visible:
  - `Default`
  - `Research`
  - `Strategy`
  - `Builder`
  - `Reflection`
  - icons and hex color coding
- Current status: `Needs UI Work`
- Notes:
  - We do have alignment state and featured lenses in the sidebar.
  - We do not currently have a dedicated mobile bottom sheet with a clean starter-pack lineup.
  - This should be built as a specific capture-friendly mobile control before shooting.

### 4. Prism in Motion

- Objective: Show `thinking` to `response` state change.
- Target surface: chat shell with Prism state transitions
- What should be visible:
  - teal thinking pulse
  - gold response flare
  - streaming response tokens
- Current status: `Partial`
- Notes:
  - The Prism state model exists.
  - We can stage separate captures for `thinking` and `response`.
  - A single perfect split-screen shot is possible, but the choreography should be tightened first so the two states read clearly.

### 5. Feeding Prism

- Objective: Show document/context upload clearly.
- Target surface: home quick actions or workspace upload flow
- What should be visible:
  - `Feed Prism`
  - document attach or upload interaction
- Current status: `Ready`
- Notes:
  - The label `Feed Prism` is already in the shell.
  - We should capture both:
    - the quick action button
    - the actual upload modal or document attach flow

## Part II: The Forge

### 6. The Forge Overview

- Objective: Show the main desktop shell in dark mode.
- Target surface: `/workspace/prism-preview`
- What should be visible:
  - desktop chat pane
  - left sidebar
  - composer
  - Prism branding
- Current status: `Ready`
- Notes:
  - This is one of the strongest current surfaces.

### 7. The Three Modes

- Objective: Show Dark, Light, and Cathedral side by side.
- Target surface: home/chat shell with theme switcher
- What should be visible:
  - Forge (Dark)
  - Atelier (Light)
  - Sanctuary (Cathedral)
- Current status: `Ready`
- Notes:
  - Theme switching exists and the three modes are working.
  - This should be captured as a controlled side-by-side composite from the same screen state.

### 8. The Decorated Sidebar

- Objective: Show Councils / Lens cards with color coding and hover behavior.
- Target surface: sidebar plus featured lens section
- What should be visible:
  - category headers
  - Lens cards
  - active alignment state
  - hover pulse if possible
- Current status: `Partial`
- Notes:
  - The sidebar lens section exists.
  - It does not yet fully match the exact “Category Header + hover pulse + card rhythm” handoff language for all sections.
  - We can shoot it now, but one more sidebar polish pass would improve this shot a lot.

### 9. Chat vs. Query Mode

- Objective: Show the switch between synthesis chat and direct retrieval/query behavior.
- Target surface: chat input / mode control
- Current status: `Needs UI Work`
- Notes:
  - We do not currently have a clean explicit `Chat vs Query` toggle exposed as a user-facing control.
  - The concept exists in workflow terms, but not as a screenshot-ready surface.

### 10. The Library Dashboard

- Objective: Show the operational overview of the library.
- Target surface: `/metacanonai/library`
- What should be visible:
  - stat cards
  - Councils
  - Lenses
  - Presets
  - Saved Constellations
  - Governance Documents
  - Draft Constellation builder
- Current status: `Ready`
- Notes:
  - This is already one of the clearest instructional pages in the app.

## Part III: Scaling Up

### 11. Building a Constellation

- Objective: Show users how to compose a custom formation.
- Target surface: `/metacanonai/library`
- What should be visible:
  - adding Lenses to draft
  - naming a Constellation
  - saving it
- Current status: `Ready`
- Notes:
  - Current UI uses selection and save, not drag-and-drop.
  - The manual should describe the real interaction as “select and assemble,” not “drag and drop,” unless we build drag-and-drop later.

### 12. A Sub-Sphere in Action

- Objective: Show a multi-Lens deliberation inside chat.
- Target surface: workspace chat with a Council / Preset run
- What should be visible:
  - multiple lenses participating
  - distinct visual differentiation
  - final synthesis
- Current status: `Needs UI Work`
- Notes:
  - The backend can run multi-lens deliberation.
  - The chat UI does not yet clearly distinguish multiple participating Lenses inside one thread in a screenshot-friendly way.
  - We need a visible deliberation transcript treatment before this becomes a real manual shot.

### 13. The Ratchet Mechanism

- Objective: Show authority grant/revoke in a concrete way.
- Target surface: settings or per-chat authority control
- Current status: `Needs UI Work`
- Notes:
  - This specific control does not exist yet as a clean user-facing toggle.
  - We should not fake this in the manual.

## Part IV: Sovereignty & Administration

### 14. The Provider Matrix

- Objective: Show flexibility and privacy in model selection.
- Target surface: `/settings/llm-preference`
- What should be visible:
  - multiple providers
  - dropdown or search selection
  - local and remote options
- Current status: `Ready`
- Notes:
  - This page already supports a strong screenshot.
  - Good candidate providers to show:
    - Ollama or LM Studio
    - xAI
    - OpenAI
    - Anthropic or Groq

### 15. Giving Prism a Voice

- Objective: Show speech-to-text and text-to-speech setup.
- Target surfaces:
  - `/settings/transcription-preference`
  - `/settings/audio-preference`
- What should be visible:
  - Whisper provider selection
  - ElevenLabs key input or TTS provider area
- Current status: `Ready`
- Notes:
  - Best handled as a two-panel spread or two consecutive screenshots.

### 16. Ingesting Lenses

- Objective: Show how new Lens batches enter the system.
- Target surface: admin import UI
- Current status: `Needs UI Work`
- Notes:
  - Right now Lens import is script/runtime-level, not a finished admin UI flow.
  - If we want this in the manual, we need a real import surface first.

## Recommended Capture Order

Capture these first because they are already strong and teach real usage:

1. The Forge Overview
2. The Three Modes
3. The Library Dashboard
4. Building a Constellation
5. The Provider Matrix
6. Giving Prism a Voice
7. Feeding Prism

Then tighten and capture these next:

8. The Threshold
9. The Scrying Glass
10. Prism in Motion
11. The Decorated Sidebar

Then build before capture:

12. The Alignment Menu
13. Chat vs. Query Mode
14. A Sub-Sphere in Action
15. The Ratchet Mechanism
16. Ingesting Lenses

## Suggested Next UI Work Before Manual Production

If the manual is the goal, these are the highest-leverage UI additions:

1. Add a real mobile Alignment Menu bottom sheet with starter Lens packs.
2. Add an explicit `Chat / Query` mode control.
3. Add a multi-Lens deliberation transcript treatment in chat.
4. Add a visible authority / autonomy control if the ratchet mechanism is part of the product promise.
5. Add an admin Lens import UI if we want to document ingestion as an in-app workflow.

## Bottom Line

We already have enough real UI to build a strong first manual section around:

- onboarding
- the main desktop shell
- theme modes
- the library
- Constellation building
- provider setup
- voice setup

The remaining shots are not blocked by philosophy. They are blocked by a handful of concrete UI surfaces that still need to exist in screenshot-ready form.
