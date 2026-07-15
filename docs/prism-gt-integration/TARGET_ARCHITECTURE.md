# Target Architecture

**Justification**: Target internal architecture is preserved from current working monorepo structure at baseline commit `09959ee4eab15539b8e3c7ca615be4c8391f21f6`. Synthesis requires no rewrite or shared runtime. Migration to split repositories remains planned per documentation only.

**Components**:
- `metacanon-core`: Rust library and CLI for constitutional state, compute routing, deliberation torus, lenses, workflows, and observability.
- `metacanon-installer`: Tauri + React desktop wizard invoking Rust commands.
- `sphere-engine-server`: Node/Express backend owning PostgreSQL schemas for games, sphere_threads, Atlas, and optional conductor.
- `sphere-skin-council-nebula`: React web skin for admin/player routes.
- `sphere-tma-app`: Telegram Mini App with skin provider.
- `metacanon-code-api`: Express proxy for GitHub-backed snippets.

**State Ownership**: Rust core owns `SoulFile` genesis state (`metacanon-core/src/genesis.rs:00012-00036`), `UiState` (`metacanon-core/src/ui.rs:00307-00334`), and snapshot JSON (`metacanon-core/src/storage.rs:00029-00047`). Sphere engine owns Drizzle schemas (`sphere-engine-server/engine/src/db/schema.ts:00016-00249`). No shared state.

**Interfaces**: CLI dispatch (`metacanon-core/src/main.rs:00129-00152`), Tauri invoke (path dependency only), HTTP routes (`sphere-engine-server/engine/src/index.ts:00143-00157`), WebSocket hub, and snippet endpoints. All remain repository-local.

**Data Flows**: Local SQLite/JSON in core; PostgreSQL in server. No cross-component flows at baseline. Communication hub dispatches to agents or Prism routes (`metacanon-core/src/communications.rs:00663-00738`).

**Governance Boundaries**: SoulFile boundaries and action validator (`metacanon-core/src/torus.rs:00032-00050`). Sphere engine policy loader (`sphere-engine-server/engine/src/index.ts:00068-00104`). Audit tables present but continuity unverified.

**Migration**: Planned decomposition to independent repositories per `docs/BRIEF_INTEGRATION_STATUS.md:00010-00020`. No current change justified.

**Explicit Non-Goals**: No new event schemas, no shared identity, no active broadcast or animation contracts, no Joeville persistence, no bypass of local ownership.
