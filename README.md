# MetaCanon AI Full Stack

This repository contains the complete full-stack source code for the MetaCanon AI ecosystem.

## Repositories

| Directory | Description | Stack |
|---|---|---|
| `metacanon-code-api` | Proxy service serving live source snippets from `metacanon-core` for the 3D website code panel | Node.js / TypeScript |
| `metacanon-core` | Constitutional runtime for MetaCanon AI — compute abstraction, security primitives, agent logic, sub-sphere communication | Rust |
| `metacanon-installer` | Desktop installer for MetaCanon AI with guided setup UI and Tauri backend bridge | Tauri + React |
| `sphere-engine-server` | Backend orchestration server for SphereThread — API, governance enforcement, WebSocket hub, Telegram bridge | Node.js |
| `sphere-skin-council-nebula` | React frontend skin for the SphereThread deliberation UX | React + Vite |
| `sphere-tma-app` | Telegram Mini App frontend for SphereThread | React + Vite + TailwindCSS |

## Architecture Overview

The MetaCanon AI stack is a constitutionally-governed, sovereign AI platform. The `metacanon-core` Rust library provides the foundational runtime, which is consumed by the `metacanon-installer` desktop app. The `sphere-engine-server` orchestrates multi-agent deliberations (SphereThread), with `sphere-skin-council-nebula` and `sphere-tma-app` providing web and Telegram frontend interfaces respectively. The `metacanon-code-api` serves as a proxy for live code display on the MetaCanon website.

## Brief Integration

The technical brief is integrated into this repository with explicit status and workstream docs:

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
