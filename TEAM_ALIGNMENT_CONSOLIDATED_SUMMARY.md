# Team Alignment Consolidated Summary

Date: 2026-02-25
Repository: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
Purpose: unify the Sphere boundary-hardening pass and the independent webapp shipping requirement into one execution contract for both teams.

## 1. Shared Position

Both summaries are directionally aligned.

1. Canonical Sphere public surface should be `/api/v1/sphere/*`.
2. `/api/v1/c2/*` exists as an alias/compatibility layer, not the long-term public contract.
3. Boundary request envelopes should be strict on the Sphere path.
4. Replay + SSE + ACK is the target stream protocol.
5. Error responses should be normalized.
6. DID/public-key distribution and Ed25519 verification remain open implementation gaps.

## 2. What Is Now Settled

The following can be treated as frozen:

1. Webapp delivery is not blocked by Sphere readiness.
2. Sphere integration is upgradeable/feature-flagged.
3. Runtime can run with Sphere enabled or disabled.
4. `SPHERE_THREAD_ENABLED` controls the runtime mode.
5. `SPHERE_C2_ALIAS_ENABLED` controls whether `/api/v1/c2/*` alias is published when Sphere is enabled.

## 3. Reconciliation of “Boundary Hardening” vs “Independent Shipping”

No conflict exists if interpreted as two modes of one system:

1. `SPHERE_THREAD_ENABLED=true`
   - Sphere boundary-hardening rules apply.
   - `/api/v1/sphere/*` is canonical.
   - strict envelope expectations apply on Sphere routes.
   - service-token auth applies on Sphere routes.
2. `SPHERE_THREAD_ENABLED=false`
   - webapp mission path remains operational without conductor startup dependency.
   - thread/replay/stream/ack/halt operations return explicit `SPHERE_THREAD_DISABLED`.
   - this mode is for shipping continuity and parallel delivery.

## 4. Practical Contract for Teams

### 4.1 Sphere stack team

1. Continue hardening on the canonical Sphere contract.
2. Treat standalone mode as compatibility mode, not the long-term protocol target.
3. Complete:
   - Ed25519 signature verification path as canonical.
   - persistent DID/public-key distribution surface.
   - integration tests for auth, envelope validation, replay/SSE resume, ACK behavior.

### 4.2 Webapp/BFF team

1. Ship against independent mode now to unblock release.
2. Keep integration layer shaped for eventual Sphere canonical fields.
3. Build BFF adapter for:
   - service-token auth to Sphere when enabled.
   - replay cursor handling and ACK loop.
   - normalized error handling (`code`, `message`, `retryable`, `details`, `traceId`).

## 5. Current Risk Register (Must Be Explicit)

1. Crypto path is not yet fully converged to a single public-signature verification model in all paths.
2. DID registry is not yet a complete persistent distribution service.
3. Alias removal timing is not yet scheduled.
4. Full build/test verification is currently blocked in this sandbox by dependency/network constraints and must be run in a network-enabled dev environment.

## 6. Execution Sequence (Both Teams)

1. Lock this two-mode contract as immediate source of truth.
2. Webapp team continues delivery in `SPHERE_THREAD_ENABLED=false`.
3. Sphere team finalizes Phase 2 hardening on canonical mode.
4. Run integration test cycle with `SPHERE_THREAD_ENABLED=true` once Phase 2 items land.
5. Plan alias deprecation (`/api/v1/c2/*`) after one stable release window.

## 7. Go/No-Go Criteria

### Webapp independent release (Go when all true)

1. Mission flows succeed in standalone mode.
2. Sphere-disabled endpoints fail explicitly and predictably.
3. No startup dependency on conductor/governance initialization.

### Sphere-enabled integration release (Go when all true)

1. canonical `/api/v1/sphere/*` contract is stable.
2. auth boundary is enforced (`TMA -> BFF -> Sphere`).
3. replay/SSE/ack passes end-to-end recovery tests.
4. signature and DID model is production-approved.

## 8. Final Alignment Statement

The teams are aligned if this statement is accepted:

1. We ship the webapp independently now.
2. We harden Sphere in parallel against the canonical boundary.
3. We integrate by feature flag, not by blocking either delivery stream.
