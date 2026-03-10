# Sphere Thread Engine Installer Handoff README

## Purpose
This document is for the agent responsible for installing and running the current Sphere Thread stack from a fresh machine/session.

## Repo + Current State
- Repository: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- Latest working branch at handoff: `codex/packet-d-replay-ack-trace-parity`
- Core surfaces implemented and validated:
  - Canonical Sphere API: `/api/v1/sphere/*`
  - BFF adapter for Telegram Mini App: `/api/v1/bff/sphere/*`
  - Legacy alias (optional): `/api/v1/c2/*`
- End-to-end loop validated:
  - seat -> perspective -> synthesis -> lens upgrade -> replay -> ack

## Latest Validation Snapshot
- Engine tests: `144/144` passing
- Engine build: passing
- TMA build: passing
- Playwright E2E: `22/22` passing

## Prerequisites
- Node.js `20.x`
- npm `10.x`
- Docker Desktop (recommended for Postgres)
- PostgreSQL (if not using Docker)

## Fresh Install Steps
### 1) Install dependencies
```bash
cd "/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine"
npm install
npm --prefix tma install
```

### 2) Configure environment
```bash
cp engine/.env.example engine/.env
```

Minimum required `engine/.env` values to boot locally:
- `DATABASE_URL=postgresql://council:council@localhost:5432/council`
- `PORT=3001`
- `CORS_ORIGINS=http://localhost:5173`
- `ADMIN_PANEL_PASSWORD=<8+ chars>`
- `KIMI_API_KEY=<non-empty>`
- `TELEGRAM_BOT_TOKEN=<non-empty>`
- `WS_TOKEN_SECRET=<32+ chars>`

Notes:
- `KIMI_API_KEY` is schema-required. For local-only development, a placeholder string is accepted.
- For browser testing without Telegram signature flow:
  - `TELEGRAM_AUTH_DEV_BYPASS_ENABLED=true`

### 3) Start database
```bash
docker compose up -d db
```

### 4) Run migrations
```bash
npm run db:migrate -w engine
```

### 5) Start services (local dev)
Terminal A:
```bash
npm run dev -w engine
```

Terminal B:
```bash
npm --prefix tma run dev
```

## Full Docker Option (Engine + Worker + DB)
```bash
docker compose up -d --build
npm run db:migrate -w engine
```

Default compose ports:
- Engine API: `8080`
- Postgres: `5432`

## Quick Health Checks
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/health
curl http://localhost:3001/api/v1/sphere/capabilities
```

If running via compose on `8080`, replace port accordingly.

## Contract + Behavior Notes
- Canonical API rejects direct TMA auth (`Authorization: tma ...`) by design.
- BFF API accepts TMA auth and proxies to canonical service-token auth.
- Write routes can enforce agent API key using:
  - `SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES=true`
  - `SPHERE_BFF_AGENT_API_KEYS=principal=token`
- Error envelope is standardized with traceability fields:
  - `{ code, message, retryable, details, traceId }`
- Trace precedence hardened and tested:
  - `x-trace-id` header overrides body `traceId` on mission + ack + replay error paths.

## Test Commands (Required)
```bash
npm --prefix engine run test
npm --prefix engine run build
npm --prefix tma run build
npm run test:e2e
```

## If Something Fails
1. Ensure Docker DB is running:
```bash
docker compose ps
```
2. Verify env values in `engine/.env` (especially token/key fields and URL/ports).
3. Re-run migrations:
```bash
npm run db:migrate -w engine
```
4. Re-run full validation commands above.

## Coordination + Handoff Discipline
- Shared ledger (append-only): `AGENT_COORDINATION_APPEND_ONLY.md`
- Do not edit/delete previous entries.
- Add `in_progress` and `done` entries with:
  - timestamp
  - actor
  - scope
  - changed files
  - tests + results

## Recommended Next Work (if continuing)
1. Extend trace-precedence assertions to stream failure paths.
2. Keep BFF/canonical parity tests synchronized whenever adding new write endpoints.
3. Keep E2E suite green before any packaging/handoff.
