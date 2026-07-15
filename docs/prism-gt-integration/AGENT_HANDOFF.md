# Agent Handoff

**Goal**: Stabilize historical predecessor baseline for governance and community lineage reuse. Preserve current working architecture.

**Canonical Sources**: Frozen repository report at commit `09959ee4eab15539b8e3c7ca615be4c8391f21f6` on `main`. `discovery/repository-registry.yml`, `discovery/production-sources.yml`, `discovery/authority-hierarchy.md`.

**Production Branch**: `main`.

**Repository state Requirements**: Evidence-first claims only. Cite concrete files/symbols/tests. Separate current/partial/planned. No inference from shared names.

**Architecture Summary**: Monorepo with Rust core, installer, Sphere engine, two frontends, code API. Internal state ownership per component. No shared runtime.

**Implementation Boundaries**: No new contracts without interface lock and human approval. No bypass of governance, CDISS, or identity boundaries. No Telegram/persona/broadcast layers.

**Required Discovery**: Inspect omitted Tauri bridge and Sphere route handlers. Run baseline commands. Verify Docker builds.

**Verification**: Observed test output, build success, rollback drill.

**Human Approvals**: Layout decision, crypto hardening, contract activations.

**Prohibitions**: Do not describe planned work as complete. Do not invent schemas. Do not override canonical governance.

**Done Conditions**: All stabilization workstreams complete with evidence logs. Signed HD for layout. Acceptance tests passed.
