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
   - optional local guardrails: `npm run hooks:install` (enables parity checks on each commit)
4. Start Postgres:
   - `docker compose up -d db`
   - optional (with skill adapter): `docker compose up -d db email-adapter`
5. Run migrations:
   - `npm run db:migrate -w engine`

## Run locally

API (with inline worker enabled):
- `npm run dev -w engine`
- local browser testing without Telegram auth: set `TELEGRAM_AUTH_DEV_BYPASS_ENABLED=true`
- optional per-session override headers while bypass is enabled:
  - `x-dev-telegram-user-id`
  - `x-dev-telegram-first-name`
  - `x-dev-telegram-username`

Optional dedicated worker process:
- set `INLINE_WORKER_ENABLED=false`
- run `npm run dev -w engine` and `npm run dev:worker -w engine`

Run without Sphere Thread dependency:
- set `SPHERE_THREAD_ENABLED=false`
- optional: set `SPHERE_C2_ALIAS_ENABLED=false` to expose only `/api/v1/sphere/*` (no `/api/v1/c2/*` alias)
- when alias is enabled, `/api/v1/c2/*` responses include deprecation headers pointing to `/api/v1/sphere/*`
- mission execution stays available; Sphere thread/replay/stream/ack endpoints return `SPHERE_THREAD_DISABLED`
- Sphere boundary stays enforced: service token required, direct `Authorization: tma ...` rejected
- BFF adapter path is available at `/api/v1/bff/sphere/*` (accepts Telegram `Authorization: tma ...` and forwards to canonical `/api/v1/sphere/*` using service-token auth)
- use `GET /api/v1/sphere/capabilities` (and `/api/v1/c2/capabilities` when alias is enabled) to feature-gate clients by runtime mode

Signature verification mode (Sphere-enabled runtime):
- `SPHERE_SIGNATURE_VERIFICATION=did_key` (default)
- options: `off`, `did_key`, `strict`
- verification sources: `did:key` signer DIDs and registered DID public keys (`POST /api/v1/sphere/dids`)

Frontend:
- `npm run dev -w skins/council-nebula`

Telegram Mini App (tma):
- `npm --prefix tma run dev`
- optional deep-link invite support: set `VITE_TMA_BOT_USERNAME=<your_bot_username>` before build/dev

Parity checks:
- `npm run check:command-parity` (TMA command catalog vs backend route mapping)
- `npm run check:bridge-parity` (runtime bridge contract vs `ffi-node` command surface)

Email adapter (for `email_checking` skill):
- in one terminal: `./scripts/run-email-adapter-local.sh`
- in `engine/.env` set:
  - `EMAIL_SKILL_ADAPTER_URL=http://127.0.0.1:3310`
  - `EMAIL_SKILL_ADAPTER_TOKEN=local-email-adapter-token`
  - optional: `EMAIL_ADAPTER_HOST=127.0.0.1` (adapter listens localhost by default)
  - `EMAIL_SKILL_SECRET_MAP_JSON={"secret://mail/main":"imap://user:pass@imap.example.com:993"}`
- optional override instead of JSON map:
  - `METACANON_SECRET_MAIL_MAIN=imap://user:pass@imap.example.com:993`
- adapter provider modes:
  - `EMAIL_ADAPTER_PROVIDER=stub` (default local fixtures)
  - `EMAIL_ADAPTER_PROVIDER=proxy` (forwards to `EMAIL_ADAPTER_PROXY_URL`)
  - `EMAIL_ADAPTER_PROVIDER=imap` (direct IMAP via credential passed from skill resolver)
- IMAP credential formats supported by adapter:
  - URL: `imaps://user:pass@mail.example.com:993/INBOX`
  - JSON: `{"host":"mail.example.com","port":993,"secure":true,"user":"user","pass":"pass","mailbox":"INBOX"}`

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
