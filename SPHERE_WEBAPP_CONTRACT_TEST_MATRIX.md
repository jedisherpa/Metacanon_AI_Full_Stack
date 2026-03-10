# Sphere-Webapp Interface Handoff + Contract Test Matrix

Date: 2026-02-25  
Scope: `/api/v1/sphere/*` public surface and temporary `/api/v1/c2/*` alias

## 1. Goal

Keep webapp delivery unblocked while Sphere Thread internals evolve, by freezing a stable API contract and validating it through shared tests.

## 2. Frozen Decisions (Execution Baseline)

1. Canonical public surface is `/api/v1/sphere/*`.
2. `/api/v1/c2/*` remains temporary alias compatibility.
3. Alias responses emit migration metadata (`Deprecation`, `Link`, canonical base header).
4. Auth boundary is `Telegram Mini App -> Webapp BFF -> Sphere`.
5. Required write-envelope fields are enforced at API boundary.
6. Stream contract is `replay + SSE + ack` with cursor semantics.
7. Error envelope is `{ code, message, retryable, details, traceId }`.

## 3. Canonical Endpoint Surface (v1)

| Method | Canonical Path | Alias Path | Behavior |
|---|---|---|---|
| GET | `/api/v1/sphere/capabilities` | `/api/v1/c2/capabilities` | Runtime capability map for feature gating |
| GET | `/api/v1/sphere/status` | `/api/v1/c2/status` | System and thread state |
| GET | `/api/v1/sphere/dids` | `/api/v1/c2/dids` | DID/public key listing |
| GET | `/api/v1/sphere/dids/:did` | `/api/v1/c2/dids/:did` | DID/public key lookup |
| POST | `/api/v1/sphere/dids` | `/api/v1/c2/dids` | DID/public key upsert |
| POST | `/api/v1/sphere/missions` | `/api/v1/c2/missions` | Dispatch mission (alias responses include deprecation headers) |
| POST | `/api/v1/sphere/messages` | `/api/v1/c2/messages` | Append message envelope |
| GET | `/api/v1/sphere/threads/:threadId` | `/api/v1/c2/threads/:threadId` | Get thread |
| GET | `/api/v1/sphere/threads/:threadId/replay` | `/api/v1/c2/threads/:threadId/replay` | Replay entries |
| GET | `/api/v1/sphere/threads/:threadId/stream` | `/api/v1/c2/threads/:threadId/stream` | SSE stream |
| POST | `/api/v1/sphere/threads/:threadId/ack` | `/api/v1/c2/threads/:threadId/ack` | Persist ack |
| POST | `/api/v1/sphere/halt-all` | `/api/v1/c2/halt-all` | Emergency halt |
| POST | `/api/v1/threads/halt-all` | n/a | Temporary legacy alias path |

## 4. Capabilities Endpoint Contract

Path: `GET /api/v1/sphere/capabilities`

Required top-level fields:

1. `apiVersion`
2. `surface` (`canonicalBase`, `legacyAliasBase`)
3. `sphereThreadEnabled`
4. `auth`
5. `features`
6. `protocol`
7. `signatures`
8. `errors`
9. `traceId`

Alias metadata fields (inside `surface`):

1. `legacyAliasDeprecated`
2. `legacyAliasSuccessorBase`

Feature flags the webapp/BFF should consume first:

1. `features.missions`
2. `features.messages`
3. `features.dids`
4. `features.threadRead`
5. `features.replay`
6. `features.stream`
7. `features.ack`
8. `features.haltAll`

Mode expectations:

| Runtime Mode | `sphereThreadEnabled` | Mission Dispatch | Thread/Replay/Stream/Ack | Message Append | Halt-All |
|---|---:|---|---|---|---|
| `SPHERE_THREAD_ENABLED=true` | `true` | enabled | enabled | enabled | enabled |
| `SPHERE_THREAD_ENABLED=false` | `false` | enabled | disabled (`503 SPHERE_THREAD_DISABLED`) | disabled (`503 SPHERE_THREAD_DISABLED`) | disabled (`503 SPHERE_THREAD_DISABLED`) |

## 5. Required Write Envelope Fields

`POST /missions` required:

1. `messageId`
2. `traceId`
3. `intent`
4. `attestation[]`
5. `schemaVersion`
6. `agentSignature`
7. `threadId|missionId` (server can create when omitted)

`POST /messages` required:

1. `threadId`
2. `messageId`
3. `traceId`
4. `intent`
5. `attestation[]`
6. `schemaVersion`
7. `agentSignature`

`POST /threads/:threadId/ack` required:

1. `traceId`
2. `intent`
3. `schemaVersion`
4. `attestation[]`
5. `agentSignature`
6. `targetSequence|targetMessageId`

## 6. Error Contract + Retry Mapping

Envelope:

```json
{
  "code": "SPHERE_ERR_*",
  "message": "human-readable text",
  "retryable": false,
  "details": {},
  "traceId": "uuid"
}
```

Status/retry policy baseline:

| Status | Meaning | Retry Policy |
|---|---|---|
| 400 | Invalid schema / request | do not retry automatically |
| 401 | Missing or invalid auth | do not retry until token refreshed/fixed |
| 403 | Forbidden boundary use | do not retry until request path/identity fixed |
| 404 | Resource not found | do not retry automatically |
| 409 | Idempotency conflict | do not retry with same identifiers |
| 412 | Governance precondition failure | retry only after approval/state change |
| 503 | Degraded or unavailable dependency | retry with backoff |
| 500 | Internal failure | retry with backoff and alerting |

## 6.1 Required Headers (API Boundary)

Client -> BFF:

1. `Authorization: tma <initData>`
2. Optional: `x-agent-api-key` (for direct agent relay path)

BFF -> Sphere:

1. `Authorization: Bearer <service-token>`
2. `x-sphere-agent-principal` (when proxying a DID context)

Alias metadata headers (for `/api/v1/c2/*` responses):

1. `Deprecation: true`
2. `Link: <.../api/v1/sphere/...>; rel=\"successor-version\"`

## 7. Auth Boundary (Handoff)

1. Telegram `initData` terminates in web layer/BFF only.
2. BFF exchanges/derives service token for Sphere.
3. Sphere API accepts only service token on `/api/v1/sphere/*`.
4. Direct `Authorization: tma ...` on Sphere routes is rejected.

## 8. Shared Contract Test Matrix

| ID | Layer | Scenario | Request | Expected Result | Owner |
|---|---|---|---|---|---|
| CAP-001 | API | Capabilities in sphere-enabled mode | `GET /api/v1/sphere/capabilities` | `200`, `sphereThreadEnabled=true`, stream/ack features true | Sphere |
| CAP-002 | API | Capabilities in standalone mode | `GET /api/v1/sphere/capabilities` | `200`, `sphereThreadEnabled=false`, stream/ack features false | Sphere |
| CAP-003 | Webapp | Runtime feature gating | consume capabilities payload | UI disables stream/ack widgets when flags false | Webapp |
| CAP-004 | API | Alias migration metadata in capabilities | `GET /api/v1/sphere/capabilities` | `surface.legacyAliasDeprecated=true`, successor base set | Sphere |
| AUTH-001 | API | Reject direct TMA auth | `Authorization: tma ...` on sphere route | `403 SPHERE_ERR_TMA_DIRECT_FORBIDDEN` | Sphere |
| AUTH-002 | API | Missing service token | no auth header | `401 SPHERE_ERR_AUTH_REQUIRED` | Sphere |
| AUTH-003 | API | Invalid service token | bad token | `401 SPHERE_ERR_AUTH_INVALID` | Sphere |
| WR-001 | API | Mission write with full envelope | `POST /missions` valid body | `201` + `threadId` + `traceId` | Sphere |
| WR-002 | API | Mission write missing required fields | `POST /missions` invalid body | `400 SPHERE_ERR_INVALID_SCHEMA` | Sphere |
| MSG-001 | API | Message append enabled mode | `POST /messages` valid body | `201` response includes sequence/timestamp | Sphere |
| MSG-002 | API | Message append standalone mode | `POST /messages` | `503 SPHERE_THREAD_DISABLED` | Sphere |
| DID-001 | API | DID endpoints in enabled mode | `GET/POST /dids` | `200/201` with DID payloads | Sphere |
| DID-002 | API | DID endpoints in standalone mode | `GET/POST /dids` | `503 SPHERE_THREAD_DISABLED` | Sphere |
| STR-001 | API | Replay works with cursor | `GET /threads/:id/replay?cursor=N` | `200` + `cursor/nextCursor` | Sphere |
| STR-002 | API | SSE ready event + replay | `GET /threads/:id/stream` | first event `ready`, replay entries streamed | Sphere + Webapp |
| ACK-001 | API | Ack by sequence | `POST /threads/:id/ack` valid body | `201` + persisted ack payload | Sphere |
| ACK-002 | API | Ack invalid target | missing `targetSequence|targetMessageId` | `400 SPHERE_ERR_INVALID_SCHEMA` | Sphere |
| HALT-001 | API | Halt in enabled mode | `POST /halt-all` valid body | `202` + `haltedCount` | Sphere |
| HALT-002 | API | Halt in standalone mode | `POST /halt-all` | `503 SPHERE_THREAD_DISABLED` | Sphere |
| ERR-001 | Webapp | Global error handling | inject any structured error | UI uses `code/message/retryable/traceId` path | Webapp |
| VER-001 | API | Alias deprecation headers | call any `/api/v1/c2/*` route | response includes `Deprecation: true` + successor `Link` | Sphere |

## 9. Parallel Ownership Split

Sphere team:

1. Keep endpoint/schema compatibility stable under `/api/v1/sphere/*`.
2. Evolve conductor internals without changing this boundary.
3. Publish capability truth through `/capabilities`.

Webapp team:

1. Integrate against `/api/v1/sphere/*` only.
2. Gate UX strictly from `/capabilities`.
3. Implement replay/SSE/ack loop only when features permit.

BFF team:

1. Convert TMA auth to service token.
2. Never forward raw TMA auth to Sphere routes.
3. Normalize retries based on `retryable` and status mapping.

## 10. Change Control Rule

1. Any breaking boundary change requires a version bump.
2. Until then, preserve backward compatibility for this v1 surface.
3. Keep `/api/v1/c2/*` alias for one release window, then remove by planned deprecation.
