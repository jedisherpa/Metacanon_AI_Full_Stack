# MetaCanon North Star MVP Build Plan

Date locked: February 26, 2026
Execution start: February 27, 2026
Last integrated update: March 7, 2026 (deep-research-report (16))

## North Star

Build a sovereign learning marketplace where gameplay continuously upgrades human lenses and agent lenses, with Sphere Thread as the trust protocol and a hybrid compute model:

- Core sovereign services on our stack
- External agent API execution
- Selective player-side compute

## MVP Target

Ship a usable Telegram Mini App MVP that proves the learning loop and trust loop end-to-end.

## 1) MVP Scope (Must Ship)

1. Telegram launch and auth flow works in production.
2. User can enter app, see profile, lens state, and current cycle.
3. User can take a seat in a cycle.
4. User can submit a perspective and receive agent synthesis.
5. Every cycle action is recorded in Sphere Thread with replay.
6. Basic lens progression works (versioned lens updates visible to user).
7. Basic governance guardrails work (high-risk actions blocked/gated).
8. Admin/operator controls exist for cycle start/stop and incident halt.

## 2) Out of Scope for MVP

1. Full marketplace economics and final micropayment rails.
2. Full multi-sphere federation/toroidal interactions.
3. Advanced narrative expansions beyond initial Joe Schmoes loop.
4. Deep autonomous agent self-modification.

## 3) Build Tracks

1. Track A: Protocol/Core
- Stable Sphere API contract
- Ledger integrity and replay/ack
- DID/signature verification
- Governance gates

2. Track B: Telegram Webapp
- Telegram UX for seat-taking, cycle play, synthesis viewing, progression

3. Track C: Agent Execution
- Hybrid execution router (internal plus external agent APIs)
- Skill invocation contracts
- Reliability and fallback behavior

4. Track D: Learning/Progression
- Lens versioning
- Upgrade rules
- Audit trail
- Evaluation scoring pipeline

## 4) Milestones and Dates

1. Milestone 0 (February 27 to March 1, 2026): Contract Freeze
- Freeze endpoints, envelopes, error contract, auth boundary
- Freeze event taxonomy:
  - seat_taken
  - perspective_submitted
  - synthesis_returned
  - lens_upgraded

2. Milestone 1 (March 2 to March 8, 2026): Telegram MVP Skeleton
- Telegram launch/auth
- Atlas/home
- Seat-taking UI
- Cycle state UI
- Basic operator controls

3. Milestone 2 (March 9 to March 16, 2026): Play Loop v1
- Perspective submission
- Agent synthesis
- Sphere Thread write/replay
- Initial lens upgrade flow

4. Milestone 3 (March 17 to March 23, 2026): Hybrid Agent Runtime
- External agent API integration
- Skill routing
- Retries/fallback
- Usage metering fields

5. Milestone 4 (March 24 to March 30, 2026): Hardening and Release Candidate
- Reliability pass
- Security pass
- Telemetry pass
- Launch checklist
- Production rollout

## 5) MVP Gates (Go/No-Go)

1. A new Telegram user can complete one full cycle in under 5 minutes.
2. Cycle actions are replayable and traceable from Sphere Thread.
3. Signature/auth checks pass for all protected write paths.
4. Lens progression updates are deterministic and auditable.
5. No critical-severity auth, data-loss, or integrity bugs remain open.

## 6) Immediate Next 7 Days (March 7 to March 14, 2026)

1. Bind governance checksums into `ledger_envelope` and cover with `entry_hash`.
2. Define canonicalization semantics for set-like arrays (attestation/approval refs) and add invariance tests.
3. Add DB-level bypass controls for `sphere_events` writes (restricted role or write path hardening).
4. Add structured governance metrics and alerts (`lens_missing_total`, `audit_failure_total`, `break_glass_failed_total`).
5. Add integration tests for material-impact ACK quorum in routed API flows.

## 7) Current Baseline Snapshot (February 26, 2026)

Implemented and useful now:

1. Canonical Sphere surface (`/api/v1/sphere/*`) with c2 alias compatibility
2. Replay, SSE stream, ACK writes, ACK observability endpoint
3. BFF auth boundary path (`/api/v1/bff/sphere/*`) with TMA auth mediation
4. DID registry and signature verification modes (`off`, `did_key`, `strict`)
5. Governance policy loading and degraded-mode guardrails

Known MVP gaps:

1. Seat mechanics are not yet formalized as cycle protocol entities
2. Cycle event taxonomy is not yet frozen or enforced end-to-end
3. Lens progression exists conceptually but not as a deterministic versioned pipeline
4. Hybrid external agent runtime/router is not yet implemented
5. Joe Schmoes loop is not yet mapped into explicit gameplay flow states

## 8) Enterprise Hardening Overlay (Integrated March 7, 2026)

This overlay is now a first-class track and gates release readiness. Feature work continues only if it does not weaken governance boundaries.

### 8.1 P0/P1 Priorities

1. P0: Fail-closed governance boundaries.
2. P0: Production secret/signature strictness.
3. P1: Non-forgeable material-impact approvals.
4. P1: Governance provenance in ledger envelope.
5. P1: Canonicalization determinism for audit hashes.

### 8.2 Status Checkpoint

1. `DONE`: Fail-closed missing lens enforcement (`LENS_NOT_FOUND`) in validator.
2. `DONE`: Deny-by-default behavior for empty `permittedActivities` (schema plus validator behavior).
3. `DONE`: Production boot guards for default conductor secret and strict signature verification mode.
4. `DONE`: Material-impact quorum now enforced using signed ACK approvals from `sphere_acks` instead of caller DID list attestations.
5. `DONE`: Governance hash snapshot (`highRiskRegistryHash`, `contactLensPackHash`, `governanceConfigHash`) is bound into `ledger_envelope` and therefore included in conductor signature + `entry_hash`.
6. `DONE`: Canonicalization rule formalized for set-like string arrays used in governance hashing/signing paths (`attestation`, approval refs): trim + dedupe + lexical sort.
7. `DONE`: DB bypass prevention baseline added via `sphere_events` trigger guard + transaction-local conductor write authorization flag, with guard-focused tests.
8. `DONE`: Rust `metacanon-core` mechanical build integrity verified in current workspace (`cargo check --all-targets --all-features`, `cargo test --all -- --nocapture`).
9. `DONE`: Governance telemetry baseline added for every dispatch attempt (`governance_outcome` event emission, outcome counters, latency summary, threshold alerts, `/api/v1/sphere/status` snapshot field).
10. `DONE`: DB write path hardened to security-definer append function (`metacanon_append_sphere_event`) with transaction token guard table (`sphere_event_write_tokens`) and public privilege revocation on direct event writes.
11. `DONE`: Postgres-backed integration test harness added for both conductor and routed API flows (`/sphere/messages`, `/threads/:id/ack`, `/threads/:id/replay`, `/halt-all`), including replay/hash-chain, counselor ACK quorum enforcement, direct-write rejection, break-glass abuse rejection, strict-signature tamper rejection, and synthetic fault-injection alert sink validation via `/status` governance metrics (`RUN_PG_INTEGRATION=1` gated).
12. `DONE`: Cycle event runtime now enforces explicit phase transitions (`seat_taken -> perspective_submitted -> synthesis_returned -> lens_upgraded`) with controlled restart paths, plus boundary tests and taxonomy-unit coverage.
13. `DONE`: Canonical cycle-state snapshot route (`/api/v1/sphere/threads/:threadId/cycle-state`) is wired and consumed by Forge UI for expected-next-event guidance, phase display, and phase-aware action gating.
14. `DONE`: Ledger verification route and integrity report (`/api/v1/sphere/threads/:threadId/verify-ledger`) now validates chain linkage (`prevMessageHash`), per-entry hash integrity (`entry_hash`), governance-hash presence, and thread tail-hash consistency; covered by boundary and Postgres integration tests.
15. `DONE`: Conductor dual-sign migration baseline is live. `ledger_envelope` now keeps legacy `conductorSignature` (HMAC-SHA256) and can optionally emit `conductorSignatureV2` (Ed25519 + `keyId`) when configured; capabilities now publish signing mode/algorithms/keyId metadata for clients and auditors.
16. `DONE`: Ledger verifier now validates `conductorSignatureV2` cryptographically and emits explicit issue codes (`MISSING_CONDUCTOR_SIGNATURE_V2`, `INVALID_CONDUCTOR_SIGNATURE_V2`, `MALFORMED_CONDUCTOR_SIGNATURE_V2`, `UNKNOWN_CONDUCTOR_SIGNATURE_V2_KEY`, `EXPIRED_CONDUCTOR_SIGNATURE_V2_KEY`). Strict rollout policy is configurable (`SPHERE_LEDGER_REQUIRE_V2_SIGNATURE`, activation timestamp, grace days) and covered by boundary + Postgres integration tests.
17. `DONE`: DB-backed conductor key registry and rotation path are now live. `conductor_keys` persists key history + status + grace metadata + encrypted private material for active signing key reload, API routes expose registry (`GET /api/v1/sphere/conductor-keys`) and rotation (`POST /api/v1/sphere/rotate-conductor-key`), and mixed old/new signature verification behavior is enforced across grace windows.
18. `DONE`: Conductor key retirement path is now explicit. API routes expose retirement (`POST /api/v1/sphere/retire-conductor-key`) with guardrails that prevent retiring the active signing key, while allowing grace-window updates for retired keys; covered by boundary + Postgres integration tests and standalone disabled-surface parity.
19. `DONE`: Conductor key audit visibility is expanded. API routes now expose per-key lookup (`GET /api/v1/sphere/conductor-keys/:keyId`) and stricter key-state metadata in registry payloads (verification state, grace-period end, private-material presence, expiration flags) plus aggregate audit counters.
20. `DONE`: Runtime bridge interface parity gate is now enforced in automation. `check:bridge-parity` validates runtime bridge method and arity parity between `runtimeRoutes` and `ffi-node` command surface (or CI contract mirror fallback), runs in CI, and is available in local pre-commit hooks.
21. `DONE`: Conductor key material persistence now uses binary storage (`BYTEA`) for `public_key`, `private_key_ciphertext`, `private_key_iv`, and `private_key_tag`, with migration guards that convert legacy text/base64 rows in-place and runtime decoding that remains backward compatible during roll-forward.
22. `DONE`: Rotation concurrency hardening added in conductor runtime. `rotateConductorKey` now executes on a single DB client transaction and takes a transaction-scoped advisory lock (`metacanon_conductor_keys_rotation`) so concurrent rotations cannot leave multiple `ACTIVE` keys.
23. `DONE`: New Postgres integration coverage for key custody resilience: legacy `TEXT/base64 -> BYTEA` migration integrity checks, concurrent-rotation single-active invariant checks, and corrupted encrypted-private-key row tolerance checks (loader remains fail-safe and dispatch/verifier stay operational).
24. `DONE`: Material-impact quorum now supports strict verified counselor ACK mode with rollout controls. New env gates (`SPHERE_ACK_REQUIRE_VERIFIED_SIGNATURES`, activation timestamp, grace days) enforce that quorum counts only counselor ACKs with verifiable Ed25519 signatures (did:key or registered key), surfaced via capabilities metadata and covered by unit + Postgres integration tests.
25. `DONE`: Bypass elimination expanded to ACK writes. `sphere_acks` now uses a security-definer append function (`metacanon_append_sphere_ack`) plus transaction-token trigger guards that block direct `INSERT/UPDATE` paths, with app-role grants tightened to function execution + read-only table access and adversarial integration tests proving direct DB writes are rejected.

### 8.3 Enterprise Readiness Work Packages

1. Package A: Governance Boundary Hardening
- Ensure no non-breakglass intent can execute without lens.
- Ensure empty lens activity sets never allow implicit permit-all.
- Acceptance: dedicated validator + loader tests pass in CI.

2. Package B: Quorum and Approval Integrity
- Material-impact intents require signed counselor ACK quorum (unique active counselors).
- Acceptance: no-ACK and insufficient-ACK paths fail with `STM_ERR_MISSING_ATTESTATION`.

3. Package C: Audit Provenance
- Add `governance` hash fields to ledger envelope:
- `highRiskRegistryHash`
- `contactLensPackHash`
- `governanceConfigHash`
- Acceptance: hash fields stored per entry; policy changes alter resulting `entry_hash`.

4. Package D: Hash Canonicalization Semantics
- Treat approved set-like arrays as deterministic sets for hashing.
- Keep ordered arrays as ordered where order is semantically meaningful.
- Acceptance: property tests prove invariance under set permutation.

5. Package E: Bypass and Red-Team Controls
- Restrict direct write channels to `sphere_events`.
- Add tests for direct write attempts, break-glass abuse attempts, and signature tamper detection.
- Acceptance: attacks are blocked or detected in automated integration tests.

6. Package F: Observability and Alerting
- Emit governance outcome fields on every intent validation/commit.
- Add counters/histograms and alert thresholds for governance failures.
- Acceptance: telemetry appears in runtime snapshots/status output with deterministic tests; staging alert rule validation remains follow-on.

7. Package G: Rust Core Build Integrity
- Add missing dependencies/modules/symbols in `metacanon-core`.
- Replace missing-file contract tests with behavioral tests.
- Acceptance: `cargo fmt`, `cargo clippy -D warnings`, `cargo test`, `cargo build --release` all pass.

### 8.4 Must-Answer Questions (Tracking)

1. Are all governance artifacts loaded and non-empty in deployed environments?
- Status: `YES` for initial build (fail-closed loader behavior in place and accepted). Follow-on: add configurable data retention windows and storage limits for loaded governance data.
2. Are all material-impact approvals attributable to signed ACK records?
- Status: `YES` by policy direction. Signed ACK records are required; follow-on is to finalize ACK record definition/contracts across API and docs.
3. Can any actor write directly to `sphere_events` outside validated conductor path?
- Status: `NO` by implementation baseline. Direct inserts are blocked by trigger + transaction token guard and writes are routed through `metacanon_append_sphere_event`; deployment role separation remains a production hardening follow-on.
4. Are production env constraints enforced in all runtime start paths?
- Status: `YES` required for initial build across all start paths. Env parser guards are in place; deployment pipeline enforcement checks remain pending.
5. Is ledger hash semantics deterministic under intended set semantics?
- Status: `YES` by policy direction. For set-like governance arrays, canonicalization is trim + dedupe + lexical sort before hashing/signing.
6. Is Rust core mechanically buildable and testable in CI?
- Status: `YES` for current workspace runtime (`cargo check --all-targets --all-features` and `cargo test --all` pass). CI pipeline integration and branch protection enforcement remain pending.

### 8.5 CI Gates (Now Required)

1. TypeScript compile and lint pass.
2. TypeScript test suite pass, including governance/production boundary tests.
3. Integration tests against Postgres for `dispatchIntent`, ACK quorum, and replay (`npm run test:integration:pg -w engine`).
4. Secret and production-config policy checks.
5. Rust compile/lint/test gates for `metacanon-core`.

### 8.6 Exit Criteria for Enterprise Pilot

1. No fail-open governance paths.
2. No forgeable material-impact approval path.
3. Reproducible ledger verification with governance provenance fields.
4. Production boot impossible with insecure defaults.
5. Full CI gate green for 5 consecutive days.
