# MetaCanon AI Full Stack

This repository contains the full-stack source for the current MetaCanon runtime.

This branch (`max`) is ahead of `main` with the latest Rust runtime work, the guided installer changes, a local full-stack launcher, a live `sphere-viz` dashboard, and the first real `Prism -> Torus -> Watcher/Synthesis/Auditor -> Prism` round flow.

## Repository Layout

| Directory | Description | Stack |
|---|---|---|
| `metacanon-code-api` | Proxy service for serving live source snippets into external web surfaces | Node.js / TypeScript |
| `metacanon-core` | Core sovereign runtime: Prism/Torus flow, genesis artifact handling, compute routing, lane prompts, local runtime state, Sphere publishing | Rust |
| `metacanon-installer` | Desktop installer and guided bootstrap UI for local setup, provider configuration, communication setup, and genesis rite | Tauri + React |
| `sphere-engine-server` | Canonical Sphere Thread / conductor backend, governance APIs, thread ledger, replay, and streaming | Node.js / TypeScript |
| `sphere-bridge` | Local bridge layer for live thread replay/streaming and Prism round triggering for dashboard clients | Node.js / TypeScript |
| `sphere-viz` | Live visualization and inspection dashboard for Prism rounds and lane activity | React + Vite |
| `sphere-skin-council-nebula` | Existing SphereThread frontend surface retained as-is in this branch | React + Vite |
| `sphere-tma-app` | Existing Telegram Mini App surface retained as-is in this branch | React + Vite + TailwindCSS |

## Current Runtime Model

The runtime model on `max` is:

- `Prism` is the user-facing orchestrator.
- `Watcher`, `Synthesis`, and `Auditor` are internal torus lanes.
- `Torus` is the round coordinator / convergence layer.
- `Genesis` is an artifact/rite, not a long-running user-facing agent.
- `sphere-engine-server` is the canonical ledger and replay/stream source.
- `sphere-viz` is a live observer of Prism/Torus activity.
- `sphere-tma-app` and `sphere-skin-council-nebula` were intentionally not modified as part of this refactor.

In the current implementation, the most important path is:

1. A user message reaches `Prism` through the installer, Telegram path, or `sphere-viz`.
2. `Prism` opens a torus round when deliberation is required.
3. `Watcher`, `Synthesis`, and `Auditor` each run a real provider-backed lane prompt.
4. `Prism` performs a final synthesis call over those lane outputs.
5. The runtime emits round events into `sphere-engine-server`.
6. `sphere-viz` observes and renders the live round.

## What Changed On `max` Compared To `main`

The branch delta from `main` to `max` is primarily the Rust/runtime implementation plus the local stack needed to run it.

### 1. Rust Runtime Refactor

Implemented in `metacanon-core`:

- added Hopf-inspired runtime boundaries:
  - `src/action_validator.rs`
  - `src/prism.rs`
  - `src/torus_runtime.rs`
  - `src/sphere_client.rs`
  - `src/local_store.rs`
  - `src/lanes/watcher.rs`
  - `src/lanes/synthesis.rs`
  - `src/lanes/auditor.rs`
- added a real `prism-round` flow that:
  - accepts a user query
  - opens a torus round
  - executes `Watcher`, `Synthesis`, and `Auditor`
  - performs a final Prism synthesis
  - publishes round events into Sphere Engine
- removed app-facing simulated provider behavior in favor of `Live` vs `Unavailable`
- kept the existing real provider integrations instead of replacing them with placeholder routing

### 2. Installer / Desktop Flow

Implemented in `metacanon-installer`:

- converted the installer to a more guided, stepwise setup flow
- cleaned up misleading or non-functional UI controls
- merged constitution selection into the actual genesis flow
- wired the installer/Tauri backend into the real `Prism` round path
- added real Telegram/Prism testing paths and real provider availability handling

### 3. New Live Runtime Surfaces

Added:

- `sphere-bridge`
  - thread replay
  - live streaming
  - provider/runtime status endpoint
  - Prism round trigger endpoint for `sphere-viz`
- `sphere-viz`
  - live event timeline
  - lane activity visualization
  - provider status
  - `Send To Prism` panel
  - final response and per-lane output display

### 4. Local Full-Stack Bring-Up

Added:

- `docker-compose.fullstack.yml`
- `scripts/dev/up.sh`
- `scripts/dev/down.sh`
- `scripts/dev/status.sh`
- `docs/SPHERE_RUNTIME_REFACTOR_SPEC.md`

These provide a local path to run the new stack with the engine, bridge, viz, and supporting services.

## Current Feature Status

This is the current implementation status for the key runtime features.

| Feature | Status | What Exists Now | What Is Missing |
|---|---|---|---|
| Conversational Prism context and memory | Partial | Prism can receive messages through installer, Telegram wiring, and `sphere-viz`; rounds execute end to end | Prism is still mostly per-request; there is no real conversation-memory retrieval or durable contextual recall in the prompt path |
| Prism synthesis of internal lane outputs | Working, but simplified | `Watcher`, `Synthesis`, and `Auditor` each perform a real provider-backed lane call; Prism then performs a final synthesis call over those outputs | This is not yet a richer iterative debate or multi-pass torus protocol |
| Constitution usage across modules | Partial and fragmented | Constitution source/version/path are recorded into genesis metadata; Watcher reasons about constitutional alignment; some runtime validation exists in core | There is no single authoritative constitution enforcement layer shared across `metacanon-core`, `sphere-engine-server`, and all clients |
| Genesis crystal / soul file validation role | Partial | Guided genesis creates a soul/genesis artifact, hashes it, signs it, and stores it in runtime state | The genesis artifact currently acts more as an integrity/identity anchor than as a live validation oracle; runtime decisions are not yet fully gated by it |
| Hashing implementation | Partial | Genesis artifact integrity is hashed and signed | Current hashing is still `stable_hash_hex`, not BLAKE3 |
| Multi-agent / perspective CL flow | Scaffolded | The triad lanes exist; specialist lens/sub-sphere structures exist; multi-perspective outputs can be generated | The lanes are still prompt modules, not long-lived autonomous processes with durable memory |
| Tool calling inside perspective CLs / sub-spheres | Scaffolded, not fully live | Tool registry / allowlist and schema structures exist | Perspective CL flows do not yet execute real tool calls end to end |
| Sphere Engine event publishing | Working | Prism rounds emit live thread events into `sphere-engine-server`; `sphere-viz` can observe them | The engine and governance model still need deeper unification with the constitution / soul artifact model |
| SphereViz live round visualization | Working | `sphere-viz` shows recent events, lane activity, provider status, and can initiate Prism rounds | It is still an observer/debug surface, not yet the final polished user dashboard |

## Current Technical Reality

The `max` branch is a meaningful runtime step forward, but it is not the final architecture yet.

What is already real:

- real provider-backed Prism rounds
- real Watcher / Synthesis / Auditor lane outputs
- real final Prism synthesis over those outputs
- real event emission into Sphere Engine
- real live observation in `sphere-viz`
- real installer wiring to the Rust runtime

What is still incomplete:

- true conversational memory for Prism
- a single constitution/governance model across all modules
- genesis artifact as an always-on validation oracle
- full tool-calling execution in sub-spheres / perspective CLs
- long-lived autonomous lane runtimes with durable memory

## Local Development

The current local dev stack for the `max` branch is:

```bash
./scripts/dev/up.sh
./scripts/dev/status.sh
```

Primary local services:

- Sphere Engine health: `http://localhost:3101/health`
- Sphere Bridge health: `http://localhost:3013/health`
- SphereViz: `http://localhost:3020`

## Key Docs

- `docs/SPHERE_RUNTIME_REFACTOR_SPEC.md`
- `CODEX_TEAM_BRIEF_2026-03-05.md`
- `SUBJECT_METACANON_DEVELOPER_EVALUATION_NEXT_STEPS_2026-03-05.md`
- `docs/BRIEF_INTEGRATION_STATUS.md`
- `docs/TEAM_WORKSTREAMS.md`
- `docs/WEBSITE_DUAL_MODE_BACKEND_RESPONSE.md`
- `docs/WEBSITE_DUAL_MODE_IMPLEMENTATION_PLAN.md`

Validation script:

```bash
./scripts/verify_brief_integration.sh
```
