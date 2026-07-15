# Risks and Open Questions

**Technical Risks**:
- Layout mismatch in `sphere-engine-server/Dockerfile` and nested CI may cause build failure.
- Omitted Tauri bridge files prevent full verification of installer-Rust contract.
- Simulated provider modes (`live_api: false`) can mask production readiness.

**Product Risks**:
- Constitution upload step in installer not validated against governance model.
- TMA overflow hidden may clip content on devices.

**Security Risks**:
- XOR-based FHE and secrets are scaffolding, not production cryptography.
- Tauri CSP disabled; localStorage token storage in Council Nebula.
- No auth on code API endpoints.

**Governance Risks**:
- Default action validator minimal (`metacanon-core/src/torus.rs:00032-00050`).
- Audit continuity evidenced only by schema, not full route handlers.
- Unresolved monorepo vs split-repo authority.

**Operational Risks**:
- No observed build/test output or deployment success.
- Absolute paths and placeholder defaults (`GITHUB_OWNER='YOUR_ORG'`).

**Ownership Risks**:
- Historical predecessor status means no active owner for runtime changes.

**Unresolved Architecture**:
- Monorepo decomposition status contradictory in docs vs code layout.
- CDISS readiness and Telegram identity ownership unresolved.

**Required Human Decisions**:
- Canonical repository layout decision.
- Crypto replacement approval.
- Any interface lock for contracts.
