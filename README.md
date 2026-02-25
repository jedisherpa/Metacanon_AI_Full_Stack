# Council Engine (Synchronous v2)

This monorepo contains a queue-backed synchronous deliberation engine with:

- Admin password panel (no host account login)
- Two-round participant workflow
- Live host-controlled deliberation (`start`, `pause`, `resume`, `next`)
- Postgres persistence + `pg-boss` orchestration queue
- WebSocket realtime updates

## Structure

- `engine/` — API + worker + DB models + LLM orchestration
- `skins/council-nebula/` — React UI for admin and participant flows
- `config/` + `lens-packs/` — Lens pack configuration

## Local setup

1. Copy env file:
   - `cp engine/.env.example engine/.env`
2. Fill required values (`ADMIN_PANEL_PASSWORD`, LLM keys, DB URL).
3. Install deps:
   - `npm install`
4. Start Postgres:
   - `docker compose up -d db`
5. Run migrations:
   - `npm run db:migrate -w engine`

## Run locally

API (with inline worker enabled):
- `npm run dev -w engine`

Optional dedicated worker process:
- set `INLINE_WORKER_ENABLED=false`
- run `npm run dev -w engine` and `npm run dev:worker -w engine`

Frontend:
- `npm run dev -w skins/council-nebula`

## Core v2 APIs

Admin auth:
- `POST /api/v2/admin/unlock`
- `GET /api/v2/admin/session`
- `POST /api/v2/admin/lock`

Admin game control:
- `POST /api/v2/admin/games`
- `GET /api/v2/admin/games`
- `GET /api/v2/admin/games/:id`
- `POST /api/v2/admin/games/:id/roster`
- `GET /api/v2/admin/games/:id/roster/links`
- `POST /api/v2/admin/games/:id/lobby/open`
- `POST /api/v2/admin/games/:id/lobby/lock`
- `POST /api/v2/admin/games/:id/round1/open`
- `POST /api/v2/admin/games/:id/round1/close`
- `POST /api/v2/admin/games/:id/round2/assign`
- `POST /api/v2/admin/games/:id/round2/open`
- `POST /api/v2/admin/games/:id/round2/close`
- `POST /api/v2/admin/games/:id/deliberation/start`
- `POST /api/v2/admin/games/:id/deliberation/pause`
- `POST /api/v2/admin/games/:id/deliberation/resume`
- `POST /api/v2/admin/games/:id/deliberation/next`
- `POST /api/v2/admin/games/:id/archive`
- `GET /api/v2/admin/games/:id/export`

Participant:
- `POST /api/v2/games/:id/join`
- `POST /api/v2/games/:id/access/:playerAccessToken`
- `GET /api/v2/games/:id/me`
- `POST /api/v2/games/:id/round1/submit`
- `GET /api/v2/games/:id/round2/assignments/me`
- `POST /api/v2/games/:id/round2/submit`
- `GET /api/v2/games/:id/deliberation/feed`
