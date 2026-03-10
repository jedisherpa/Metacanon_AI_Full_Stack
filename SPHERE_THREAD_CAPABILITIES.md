# Sphere Thread Capabilities (v1)

Date: 2026-02-27

## 1. Purpose

This document describes the current Sphere Thread implementation, its runtime capabilities, and the stable public contract surface exposed by the engine.

## 2. High-Level Summary

Sphere Thread is an append-only, signed event ledger for multi-agent threads with governance gates, replay + stream semantics, and ACK confirmation. It is implemented as a Postgres-backed conductor and exposed via canonical APIs under `/api/v1/sphere/*` (with a temporary `/api/v1/c2/*` alias). A Telegram Mini App (TMA) client consumes the BFF adapter `/api/v1/bff/sphere/*`.

## 3. Core Capabilities

1. **Thread creation and append-only dispatch**
   - Create or fetch threads on first write.
   - Append signed client envelopes with deterministic idempotency.

2. **Governance enforcement**
   - Intent validation with thread state (ACTIVE, HALTED, DEGRADED_NO_LLM).
   - Quorum/attestation enforcement on material-impact intents.
   - Break-glass support for emergency halt flows.

3. **Replay + SSE + ACK**
   - Cursor-based replay for complete history.
   - SSE stream with readiness, log entry, ACK entry, and heartbeat events.
   - ACK endpoint with signature validation and idempotent updates.

4. **Signature verification and DID registry**
   - Signature verification modes: `off`, `did_key`, `strict`.
   - DID registry for public key distribution.

5. **Cycle event taxonomy**
   - Seat-taking, perspective submission, synthesis return, lens upgrade.
   - Payload schema validation per event type.

6. **Mission dispatch + hybrid runtime**
   - Dispatch mission intent and execute via hybrid router.
   - Internal LLM and external adapter with timeout/fallback.
   - Usage metering includes latency, attempts, and attempted route order.

7. **Degraded mode behavior**
   - `DEGRADED_NO_LLM` blocks mission execution and marks threads.
   - Stub fallback allowed only outside production.

## 4. Canonical Endpoint Surface (v1)

| Method | Canonical Path | Behavior |
|---|---|---|
| GET | `/api/v1/sphere/capabilities` | Runtime capability map for feature gating |
| GET | `/api/v1/sphere/status` | System state + thread counts |
| POST | `/api/v1/sphere/missions` | Dispatch mission and generate report |
| POST | `/api/v1/sphere/messages` | Append general intent message |
| POST | `/api/v1/sphere/cycle-events` | Append cycle event (seat/perspective/synthesis/lens) |
| GET | `/api/v1/sphere/threads/:threadId` | Thread record and entries |
| GET | `/api/v1/sphere/threads/:threadId/replay` | Cursor-based replay |
| GET | `/api/v1/sphere/threads/:threadId/stream` | SSE stream |
| POST | `/api/v1/sphere/threads/:threadId/ack` | Persist ACK |
| GET | `/api/v1/sphere/threads/:threadId/acks` | ACK replay |
| GET | `/api/v1/sphere/dids` | DID registry listing |
| GET | `/api/v1/sphere/dids/:did` | DID lookup |
| POST | `/api/v1/sphere/dids` | DID upsert |
| POST | `/api/v1/sphere/halt-all` | Emergency halt |

Temporary alias: `/api/v1/c2/*` maps to canonical `/api/v1/sphere/*` and emits deprecation headers.

## 5. Required Write Envelope Fields

Mission dispatch (`POST /missions`):
- `messageId`
- `traceId`
- `intent`
- `attestation[]`
- `schemaVersion`
- `agentSignature`
- `threadId|missionId`

Message append (`POST /messages`):
- `threadId`
- `messageId`
- `traceId`
- `intent`
- `attestation[]`
- `schemaVersion`
- `agentSignature`

Cycle event (`POST /cycle-events`):
- `threadId`
- `messageId`
- `traceId`
- `eventType`
- `attestation[]`
- `schemaVersion`
- `agentSignature`

ACK write (`POST /threads/:threadId/ack`):
- `traceId`
- `intent`
- `schemaVersion`
- `attestation[]`
- `agentSignature`
- `targetSequence|targetMessageId`

## 6. Error Contract

All errors follow:

```json
{
  "code": "SPHERE_ERR_*",
  "message": "human-readable text",
  "retryable": false,
  "details": {},
  "traceId": "uuid"
}
```

Common status mappings:
- `400` invalid schema
- `401` auth missing/invalid
- `403` forbidden or governance gate
- `404` not found
- `409` idempotency conflict
- `412` governance precondition failure
- `503` degraded or dependency unavailable
- `500` internal error

## 7. Auth Boundary

1. Telegram TMA auth is accepted only by the BFF adapter.
2. Canonical Sphere routes require service token auth.
3. Direct `Authorization: tma ...` is rejected on `/api/v1/sphere/*`.

## 8. Runtime Capability Flags

`GET /api/v1/sphere/capabilities` provides feature gates that must be honored by clients:

- `features.missions`
- `features.messages`
- `features.cycleEvents`
- `features.replay`
- `features.stream`
- `features.ack`
- `features.threadAcks`
- `features.haltAll`

## 9. Implementation References

- Conductor + ledger: `engine/src/sphere/conductor.ts`
- Governance validation: `engine/src/governance/contactLensValidator.ts`
- API surface: `engine/src/api/v1/c2Routes.ts`
- BFF adapter: `engine/src/api/v1/sphereBffRoutes.ts`
- Hybrid runtime: `engine/src/runtime/hybridExecutionRouter.ts`
- TMA client: `tma/src/pages/ForgePage.tsx`
