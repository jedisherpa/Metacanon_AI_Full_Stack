# Test and Acceptance Plan

**Unit Tests**: Execute `cargo test` in `metacanon-core` (existing tests in `compute.rs:00567-00725`, `torus.rs:00358-00558`, `genesis.rs:00408-00556`). Execute `npm run test` in `sphere-engine-server`.

**Contract Tests**: Verify CLI dispatch, snippet endpoint responses, Tauri invoke contracts (inspect omitted `metacanon-installer/desktop/src/lib/api.ts`).

**Integration Tests**: Backend + Council Nebula route consumption. Backend + TMA BFF calls. Installer + Rust core path dependency.

**End-to-End Tests**: Full installer wizard flow to genesis and snapshot. Sphere engine game round with WebSocket.

**Failure Tests**: Validator denial on blocked prompts. Missing provider fallback. Invalid admin session.

**Security Tests**: Redaction coverage, secret encryption, CSP in Tauri config.

**Governance Tests**: SoulFile integrity, HITL deliverable approval, audit event creation.

**Accessibility Tests**: Keyboard navigation on installer and TMA; color contrast.

**Release Tests**: Docker build, Tauri bundle, npm build for all frontends.

**Real-Runtime Acceptance Evidence**: Observed digest or game round completion with explicit denial on gated actions. Rollback target reachable within 60 seconds.

All gates require human approval before activation.
