# Sphere Thread — Handoff Summary

Date: 2026-02-27
Repo: /Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine

## 1) What This Is
Sphere Thread is a ledgered, signed, replayable thread protocol for mission execution and deliberation cycles. It provides:
- Canonical API surface under `/api/v1/sphere/*` with a temporary `/api/v1/c2/*` alias.
- A Telegram-safe BFF surface under `/api/v1/bff/sphere/*`.
- Replay + SSE streaming + acknowledgements (ack) for verifiable event consumption.
- Cycle event taxonomy (seat, perspective, synthesis, lens upgrade) with governance-bound validation.
- Hybrid runtime for mission execution (internal LLM + external adapter) with deterministic usage metering.

Primary implementation: `engine/src`.
Primary UI consumer: `tma/src` (Telegram Mini App).

## 2) Architecture Overview
- **Engine** (`engine/`): Express API, worker, Postgres persistence, governance validation, Sphere Conductor, hybrid runtime.
- **BFF** (`engine/src/api/v1/sphereBffRoutes.ts`): Telegram auth boundary + access-control + service token forwarding.
- **TMA** (`tma/`): Telegram Mini App consuming BFF + Sphere capabilities, implementing seat-to-synthesis flow.

## 3) Canonical API Surface (Sphere)
Base: `/api/v1/sphere/*` (alias `/api/v1/c2/*` when enabled)

Key endpoints:
- Capabilities: `GET /api/v1/sphere/capabilities`
- Status: `GET /api/v1/sphere/status`
- DIDs: `GET/POST /api/v1/sphere/dids`, `GET /api/v1/sphere/dids/:did`
- Missions: `POST /api/v1/sphere/missions`
- Messages: `POST /api/v1/sphere/messages`
- Cycle events: `POST /api/v1/sphere/cycle-events`
- Thread read: `GET /api/v1/sphere/threads/:threadId`
- Replay: `GET /api/v1/sphere/threads/:threadId/replay`
- Stream (SSE): `GET /api/v1/sphere/threads/:threadId/stream`
- Acks: `GET /api/v1/sphere/threads/:threadId/acks`, `POST /api/v1/sphere/threads/:threadId/ack`
- Lens progression: `GET /api/v1/sphere/threads/:threadId/lens-progression`
- Lens upgrade rules: `GET /api/v1/sphere/lens-upgrade-rules`
- Halt all: `POST /api/v1/sphere/halt-all`

Alias behavior:
- `/api/v1/c2/*` mirrors canonical routes and emits deprecation headers.

## 4) BFF Surface (Telegram Boundary)
Base: `/api/v1/bff/sphere/*`.

Responsibilities:
- Validates Telegram initData (`Authorization: tma <initData>`).
- Enforces agent API keys for writes (`x-agent-api-key`) and maps to principals.
- Enforces membership-based thread write access.
- Forwards to canonical Sphere routes using service token auth.

Thread access endpoints:
- `POST /api/v1/bff/sphere/threads/:threadId/invites`
- `GET /api/v1/bff/sphere/threads/:threadId/invites`
- `POST /api/v1/bff/sphere/threads/:threadId/invites/:inviteCode/revoke`
- `POST /api/v1/bff/sphere/invites/:inviteCode/accept`
- `GET /api/v1/bff/sphere/threads/:threadId/members`
- `DELETE /api/v1/bff/sphere/threads/:threadId/members/:memberPrincipal`

## 5) Auth Boundary
- Sphere routes accept only service-token auth (`Authorization: Bearer ...` or `x-sphere-service-token`).
- Direct `Authorization: tma ...` is rejected on Sphere routes.
- Telegram auth is only accepted in BFF routes.

Key code:
- `engine/src/middleware/sphereServiceAuth.ts`
- `engine/src/middleware/telegramAuth.ts`
- `engine/src/api/v1/c2Routes.ts`
- `engine/src/api/v1/sphereBffRoutes.ts`

## 6) Core Protocol and Ledger
Envelope fields (write validation enforced):
- Missions: `messageId`, `traceId`, `intent`, `attestation[]`, `schemaVersion`, `agentSignature`, `threadId|missionId`
- Messages: `threadId`, `messageId`, `traceId`, `intent`, `attestation[]`, `schemaVersion`, `agentSignature`
- Cycle events: `threadId`, `messageId`, `traceId`, `eventType`, `attestation[]`, `schemaVersion`, `agentSignature`
- Acks: `traceId`, `intent`, `schemaVersion`, `attestation[]`, `agentSignature`, `targetSequence|targetMessageId`

Ledger:
- Each entry has a client envelope + ledger envelope (sequence + hashes + conductor signature).
- Stored in Postgres with replay and SSE streaming support.

Key code:
- `engine/src/sphere/conductor.ts`
- `engine/src/api/v1/c2Routes.ts`

## 7) Replay, SSE, and Ack
- Replay uses cursor semantics and supports `from_sequence` fallback.
- SSE stream supports replay-before-live and heartbeat events.
- Ack endpoint persists acknowledgements, supports idempotence, and exposes `/acks` replay.

Key code:
- `engine/src/api/v1/c2Routes.ts`
- `engine/src/sphere/conductor.ts`

## 8) Cycle Events and Lens Progression
Cycle event taxonomy:
- `seat_taken`, `perspective_submitted`, `synthesis_returned`, `lens_upgraded`.

Payload contracts are enforced at API boundary.
Lens upgrade rules are governed and exposed via `/lens-upgrade-rules`.

Key files:
- `engine/src/sphere/cycleEventTaxonomy.ts`
- `engine/src/api/v1/c2Routes.ts`
- `governance/lens_upgrade_rules.json`

## 9) Signature Verification
Modes (env `SPHERE_SIGNATURE_VERIFICATION`):
- `off`, `did_key` (default), `strict`.

Verification supports `did:key` Ed25519 and registered DID public keys.

Key code:
- `engine/src/sphere/signatureVerification.ts`
- `engine/src/api/v1/c2Routes.ts`

## 10) Governance, Degraded Mode, Halt All
- Governance validation includes quorum and intent checks.
- Degraded mode (`DEGRADED_NO_LLM`) is enforced for mission writes.
- Halt all allows emergency shutdown with audit trail.

Key code:
- `engine/src/governance/contactLensValidator.ts`
- `engine/src/sphere/conductor.ts`
- `engine/src/api/v1/c2Routes.ts`

## 11) Hybrid Mission Runtime (Execution Router)
- Supports internal LLM providers and external adapter.
- Timeout, retry, fallback with deterministic metering.
- Usage metering includes `route`, `adapter`, tokens, `attemptedRoutes`, and `failedRoutes`.
- Degraded errors propagate runtime telemetry via `details.runtime`.

Key code:
- `engine/src/runtime/hybridExecutionRouter.ts`
- `engine/src/agents/missionService.ts`

## 12) Thread Access (Invites/Members)
- Membership + invite tables in Postgres:
  - `sphere_thread_memberships`
  - `sphere_thread_invites`
  - `sphere_thread_invite_acceptances`
- Role-based enforcement (`owner`/`member`) with invite workflows.

Key code:
- `engine/src/sphere/threadAccessRegistry.ts`
- `engine/src/api/v1/sphereBffRoutes.ts`

## 13) Telegram Mini App Capabilities
- Territory navigation: Atlas, Citadel, Forge, Hub, Engine Room.
- Forge cycle UI:
  - Seat -> perspective -> synthesis -> lens upgrade.
  - Replay + ack + SSE stream support.
  - Degraded/halted/quorum notices with write gating.
  - Invite and membership management.

Key UI files:
- `tma/src/App.tsx`
- `tma/src/pages/ForgePage.tsx`
- `tma/src/pages/AtlasHome.tsx`

## 14) Runtime Modes
- `SPHERE_THREAD_ENABLED=false`: mission flow stays available, thread/replay/stream/ack return `SPHERE_THREAD_DISABLED`.
- `SPHERE_C2_ALIAS_ENABLED`: controls `/api/v1/c2/*` alias exposure.

Key code:
- `engine/src/api/v1/c2StandaloneRoutes.ts`
- `engine/src/api/v1/c2Routes.ts`

## 15) Error Contract
Uniform error envelope:
```
{ "code", "message", "retryable", "details", "traceId" }
```

Key code:
- `engine/src/api/v1/sphereApi.ts`
- `engine/src/lib/apiError.ts`

## 16) Tests and Contracts
- Unit/integration: `npm --prefix engine run test`
- E2E: `npm --prefix . run test:e2e`
- Contract matrix: `SPHERE_WEBAPP_CONTRACT_TEST_MATRIX.md`

Key test files:
- `engine/src/api/v1/c2Routes.boundary.test.ts`
- `engine/src/api/v1/sphereBffRoutes.production.boundary.test.ts`
- `engine/src/runtime/hybridExecutionRouter.test.ts`
- `engine/src/agents/missionService.test.ts`
- `e2e/forge-cycle.test.ts`

## 17) Operational Notes
- Docker Compose and Dockerfile are included.
- Standalone mode and feature gating described in `README.md`.

---

If you want a shorter executive one‑pager or a developer‑only API contract appendix, say the word and I will generate it.
