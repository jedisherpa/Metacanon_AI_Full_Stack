# Brief Integration Status

Source brief: `CODEX_TEAM_BRIEF_2026-03-05.md`

This document tracks what is already integrated from the brief and what remains.

## 1) Repository Decomposition

Status: `Integrated`

- `metacanon-core/` extracted as independent Rust runtime repository.
- `sphere-engine-server/` extracted as independent backend repository.
- `sphere-skin-council-nebula/` extracted as independent frontend skin repository.
- `sphere-tma-app/` extracted as independent Telegram Mini App repository.
- `metacanon-installer/` extracted as independent installer repository.
- `metacanon-code-api/` created as separate live code API service repository.

## 2) Internal Core Layering (6 Layers)

Status: `Integrated`

Layer definitions and module mappings are documented in:

- `metacanon-core/README.md`

The command shell layer remains in:

- `metacanon-core/src/ui.rs`
- `metacanon-core/src/main.rs`

## 3) Installer Boundary

Status: `Integrated`

Installer is separated with clear internal parts:

- `metacanon-installer/desktop/src/` (frontend UI)
- `metacanon-installer/desktop/src-tauri/src/` (backend bridge)
- `metacanon-installer/desktop/src-tauri/tauri.conf.json` (app config)

Dependency wiring is ready for external core repo in:

- `metacanon-installer/desktop/src-tauri/Cargo.toml`

## 4) Website Live Code API

Status: `Integrated (MVP scaffold)`

Implemented in:

- `metacanon-code-api/src/server.ts`
- `metacanon-code-api/src/githubClient.ts`
- `metacanon-code-api/src/codeMap.ts`
- `metacanon-code-api/code-map.yaml`

Exposed endpoints:

- `GET /api/v1/manifest`
- `GET /api/v1/snippet/:id`

## 5) Remaining Work To Complete Brief End-State

Status: `Pending`

1. Add production auth model for code API (GitHub App token rotation).
2. Add CI for code-map line-range validation against `metacanon-core`.
3. Integrate website frontend to consume live snippet endpoints.
4. Add independent CI/CD pipelines per repository and release promotion flow.
