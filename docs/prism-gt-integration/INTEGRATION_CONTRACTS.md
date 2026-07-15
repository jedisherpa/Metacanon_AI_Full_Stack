# Integration Contracts

**Applicable APIs**:
- Rust CLI commands: `metacanon-core/src/main.rs:00099-00117`.
- Sphere engine v2 admin/player routes: `sphere-engine-server/engine/src/index.ts:00143-00157`.
- Snippet endpoints: `metacanon-code-api/src/server.ts:00014-00029` with Zod schemas (`metacanon-code-api/src/types.ts:00003-00029`).

**Events**: None versioned or shared. Internal observability events only (`metacanon-core/src/observability.rs:00127-00219`).

**Schemas**: Drizzle game/session tables (`sphere-engine-server/engine/src/db/schema.ts:00016-00184`). SoulFile struct (`metacanon-core/src/genesis.rs:00012-00036`). Proposed — interface lock required for any cross-surface schema.

**IPC**: Tauri invoke (unverified bridge files omitted). WebSocket hub in server. No shared IPC contract.

**Media**: None implemented.

**Identity and Authentication**: Admin session middleware (`sphere-engine-server/engine/src/admin/middleware.ts:00001-00016`). Telegram/Discord config in communication hub. No verified shared identity authority.

**Versioning**: Package versions present (`metacanon-core/Cargo.toml:00001-00013`). No semantic versioning across components.

**Errors**: TorusError, explicit denial semantics in validator. Raw GitHub errors returned in code API.

**Retry**: None evidenced.

**Privacy**: Redaction of sensitive keys (`metacanon-core/src/observability.rs:00477-00492`). Local-first stores. Proposed — interface lock required for any cross-surface privacy contract.

**Governance**: SoulFile AIBoundaries and HITL (`metacanon-core/src/genesis.rs:00054-00063`). Sphere engine conductor when `SPHERE_THREAD_ENABLED=true`. Proposed — interface lock required for any CDISS dispatch or Telegram identity token schema.

All unsupported details marked Proposed — interface lock required. No bypass of governance or identity boundaries.
