# Implementation Plan

**Workstreams** (dependency ordered):
1. Stabilization: Run and record baseline builds/tests per component. Dependencies: none. Likely files: package.json scripts, Cargo.toml. Interface locks: none. Tests: cargo test, npm run check. Completion evidence: observed output logs. Human approval: required before proceeding.
2. Packaging verification: Fix Sphere engine Dockerfile path mismatches and nested CI layout. Dependencies: stabilization. Likely files: `sphere-engine-server/Dockerfile:00005-00008`, `.github/workflows/ci.yml`. Tests: Docker build attempt. Rollback: revert to current files.
3. Canonical layout decision: Document monorepo vs split-repo status and Migration to independent repositories. Dependencies: packaging. Likely files: `docs/BRIEF_INTEGRATION_STATUS.md`. Interface lock: required. Human approval: owner signature.
4. Security hardening: Replace XOR scaffolds. Dependencies: layout decision. Likely files: `metacanon-core/src/secrets.rs`, `metacanon-core/src/fhe.rs`. Tests: unit tests. Completion: production crypto review.

**Milestones**:
- Milestone 1: Baseline verification complete (evidence: test logs).
- Milestone 2: Layout decision recorded (evidence: signed HD).
- Milestone 3: Hardening merged (evidence: updated modules).

**Rollback**: Disable scheduler or revert commit. No production traffic.

**Human Approval Points**: Layout decision, crypto replacement, any contract activation.
