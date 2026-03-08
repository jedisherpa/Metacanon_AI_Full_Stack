# Sphere Runtime Refactor Spec

## Scope

This spec defines the runtime refactor for `Metacanon_AI_Full_Stack`.

In scope:
- `metacanon-core`
- `sphere-engine-server`
- `metacanon-installer`
- new `sphere-viz` app
- root-level startup/orchestration scripts

Out of scope:
- `sphere-tma-app`
- `sphere-skin-council-nebula`

## Canonical Runtime Roles

- `Genesis`: setup rite and artifact generation, not a persistent runtime lane.
- `Prism`: sole user-facing orchestrator.
- `Watcher`: constitutional and risk review lane.
- `Synthesis`: constructive reasoning and task synthesis lane.
- `Auditor`: trace, record, and integrity lane.
- `Torus`: the round coordinator and convergence protocol across Watcher, Synthesis, and Auditor.

## Architectural Decisions

1. `sphere-engine-server` is the live backbone for runtime events.
2. PostgreSQL behind `sphere-engine-server` is the canonical write path.
3. `metacanon-core` remains the local sovereign runtime and local compute integration layer.
4. Local sovereign state may be cached in SQLite, but Genesis remains a canonical file artifact on disk.
5. `runtime_snapshot.json` is export/recovery, not the primary active store.
6. `sphere-viz` is a live read surface over bridge/engine events, not a control-plane replacement.
7. `sphere-tma-app` and `sphere-skin-council-nebula` are unchanged by this refactor.

## Current Problems

1. `metacanon-core/src/torus.rs` is a provider fallback pipeline, not a deliberation torus.
2. `bootstrap_three_agents()` binds routes but does not instantiate real background runtime lanes.
3. Installer copy currently implies a live torus/agent runtime that does not exist in the current implementation.
4. There is no root-level launcher that reliably brings up the services required for a live sphere.
5. Dashboard/visualization surfaces are not aligned to the same live runtime contract.

## Target Runtime Flow

1. A user message arrives from Telegram, Discord, in-app, or another approved channel.
2. `PrismRuntime` receives the message.
3. `PrismRuntime` loads local context/memory and validates the action against constitutional/will constraints.
4. If a direct answer is safe, Prism can answer directly.
5. If deliberation is needed, Prism opens a Torus round in `sphere-engine-server`.
6. Torus emits lane requests to Watcher, Synthesis, and Auditor.
7. Each lane produces a result and writes it back as a Sphere Thread event.
8. Torus evaluates convergence/completion and produces a round result.
9. Prism synthesizes the user-facing reply.
10. Prism emits the final reply through the configured channel.
11. Memory summaries/audit events are committed to the engine and mirrored into local runtime state as needed.

## Event Contract

### Logical Threads

- `prism-inbound`
- `torus-rounds`
- `lane-watcher`
- `lane-synthesis`
- `lane-auditor`
- `prism-outbound`
- `task-events`
- `memory-events`
- `constitution-events`
- `audit-events`
- existing external transport threads may remain as adapters

### Intents

- `USER_MESSAGE_RECEIVED`
- `PRISM_MESSAGE_ACCEPTED`
- `TORUS_ROUND_OPENED`
- `LANE_REQUESTED`
- `LANE_RESPONSE_RECORDED`
- `ROUND_REVIEWED`
- `ROUND_CONVERGED`
- `PRISM_RESPONSE_READY`
- `TASK_STARTED`
- `TASK_PROGRESS_UPDATED`
- `TASK_COMPLETED`
- `MEMORY_SUMMARY_WRITTEN`
- `CONSTITUTION_VERIFIED`
- `AUDIT_RECORD_COMMITTED`

## Persistence Model

### Canonical

Canonical, append-only system state lives in PostgreSQL via `sphere-engine-server`:
- inbound/outbound messages
- torus rounds
- lane outputs
- audit records
- task state transitions
- constitution verification events

### Local

Local SQLite is for:
- installer/runtime settings
- active genesis artifact reference and metadata
- paired communication settings
- local Prism session cache
- local task scratch state
- local memory summaries and read-through cache

### Genesis

Genesis remains a canonical file artifact on disk:
- constitution reference/content
- values
- will vector
- identity metadata
- hash/signature/version metadata

SQLite stores only references and local metadata for the active artifact.

## Module Refactor: `metacanon-core`

### New Modules

- `src/action_validator.rs`
- `src/prism.rs`
- `src/torus_runtime.rs`
- `src/lanes/watcher.rs`
- `src/lanes/synthesis.rs`
- `src/lanes/auditor.rs`
- `src/sphere_client.rs`
- `src/local_store.rs`

### Responsibilities

- `action_validator.rs`: authoritative action validation boundary for constitution/will/risk policy.
- `prism.rs`: user-facing orchestration, task framing, memory retrieval, round initiation, final synthesis.
- `torus_runtime.rs`: deliberation round lifecycle and convergence handling.
- `lanes/*`: lane-specific prompting, validation, and response shaping.
- `sphere_client.rs`: event publishing/reading to/from `sphere-engine-server`.
- `local_store.rs`: SQLite access layer for local settings/runtime cache.

### Existing Logic to Rename/Retain

- Existing provider-fallback logic in `src/torus.rs` should be renamed or moved under compute routing.
- Existing compute providers and router wiring should be retained as the real execution layer.
- Existing snapshot support should remain as export/recovery.

## Engine Refactor: `sphere-engine-server`

### Required Additions

- Runtime event schemas for Prism/Torus/lane flow.
- Read/projection endpoints for current sphere, active rounds, lane outputs, tasks, audit summaries, and constitution metadata.
- `sphere-bridge` service for WebSocket fanout to `sphere-viz` and future clients.

### Read Model Strategy

Phase 1:
- Postgres-backed projections and query endpoints.

Phase 2:
- optional Redis mirror for hot read paths if needed.

## `sphere-viz` App

### Source

Base the new app on:
- `pentarchy-5-base/stack-viz`
- `pentarchy-5-base/app-integration/sphere-client.ts`

### Role

` sphere-viz ` is a dedicated live visualization/dashboard for this stack.

### Visual Entities

- Prism
- Torus
- Watcher
- Synthesis
- Auditor
- Sphere Engine
- Postgres
- Bridge
- optional local store

### Core Views

- live sphere status
- active round view
- per-lane outputs
- running task status
- constitution/hash metadata
- audit stream
- raw event stream/debug panel

## Installer Role

Installer responsibilities after refactor:
- bootstrap local compute
- bootstrap constitution/will/genesis artifact
- configure communication channels
- verify service readiness
- run one real end-to-end Prism/Torus/channel test
- open or link to `sphere-viz`

Installer should not pretend runtime processes exist when they do not.

## Startup/Operations

Add root-level orchestration:
- `docker-compose.fullstack.yml`
- `scripts/dev/up.sh`
- `scripts/dev/down.sh`
- `scripts/dev/status.sh`

The default startup path should bring up the services needed for a live local sphere.

## Acceptance Criteria

### Milestone 1

- root launcher starts engine + bridge + sphere-viz
- installer can verify readiness
- a test message enters Prism
- a Torus round opens
- Watcher, Synthesis, and Auditor each emit real lane events
- Prism returns a final response
- sphere-viz shows the round live

### Milestone 2

- constitution and will validation operate through the new validator boundary
- Genesis artifact is canonical and hash/signature-aware
- local SQLite stores only runtime/cache state around the canonical artifact

### Milestone 3

- task execution and memory summaries are visible in sphere-viz
- communication channels surface live task/round status

## Non-Goals

- replacing `sphere-tma-app`
- replacing `sphere-skin-council-nebula`
- porting Hopf mock compute/router code directly
- porting Pentarchy agent topology directly
