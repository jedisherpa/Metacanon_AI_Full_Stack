# Council Engine Build Report
Date: 2026-02-13

**Summary**
- Built a monorepo containing the backend engine, a skin UI, infrastructure (Docker/CI), and lens pack configuration.
- Local development runs the engine on port 3101 with Postgres via Docker.

**Code Written / Modified**
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/Dockerfile
  - Container build for the engine. Uses Node 20 Alpine, installs workspace deps, builds, and starts the engine.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/docker-compose.yml
  - Postgres service plus app service. App uses `/engine/.env` and mounts lens packs.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/.github/workflows/ci.yml
  - CI pipeline to install, build, and test the repo.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/lens-packs/hands-of-the-void.json
  - Lens pack used by the engine (copied from config).
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/config/hands-of-the-void.json
  - Source lens pack JSON.

Backend engine (Node/Express + Drizzle):
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/index.ts
  - Express app setup, Sentry v8 integrations, CORS, lens pack loading, routes, WebSocket hub, and weekly cron registration.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/api/routes.ts
  - REST API routes for game actions and config.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/api/routes.test.ts
  - Health check test and test env setup.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/config/env.ts
  - Env schema for DB, LLMs, GHL, server, and defaults.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/config/lensPack.ts
  - Resolves lens pack by ID or path and loads JSON.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/db/schema.ts
  - Drizzle schema for core tables.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/db/client.ts
  - DB connection setup.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/db/migrate.ts
  - DB migration helper.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/db/queries.ts
  - DB query helpers.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/llm/*
  - Provider wrappers (OpenAI-compatible), fallback logic, and orchestration services.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/email/*
  - GoHighLevel Conversations API integration.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/ws/hub.ts
  - WebSocket hub.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/src/cron/weekly.ts
  - Weekly automation.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/vitest.config.ts
  - Vitest configuration.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/drizzle.config.ts
  - Drizzle Kit config (Postgres dialect + DATABASE_URL).
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/drizzle/*
  - Generated SQL migrations.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/.env
  - Local runtime env (PORT=3101 and placeholders).
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/engine/.env.example
  - Example env (PORT=3101 and placeholders).

Skin UI (Vite/React):
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/skins/council-nebula/src/App.tsx
  - UI layout for the skin.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/skins/council-nebula/src/main.tsx
  - React bootstrap and Sentry.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/skins/council-nebula/src/index.css
  - Theme and layout styles.
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/skins/council-nebula/package.json
  - Vite + React config and scripts.

Other repo files:
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/package.json
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/package-lock.json
- /Users/paulcooper/Documents/Codex Master Folder/council-engine/README.md

**Tests Run**
- `npm install` (repo root)
- `docker compose up -d db`
- `npm run db:generate` (engine) -> generated `/engine/drizzle/0000_chubby_newton_destine.sql`
- `npm run db:migrate` (engine) -> applied schema to Postgres
- `npm test` (engine) -> 1 test passed (health check)
- Smoke test: `npm run dev` (engine on PORT=3101) + `curl http://localhost:3101/api/health` -> `{ "ok": true }`

**How An External Coder Can Run / Test**
- Prereqs: Node 20 (nvm), npm, Docker, and Docker Compose.
- Unzip repo and `cd council-engine`.
- Install deps: `npm install`.
- Start DB: `docker compose up -d db`.
- Create env: `cp engine/.env.example engine/.env` and fill required values.
  - For local smoke testing without real providers, you can set placeholder LLM keys and set `EMAIL_PROVIDER=none`.
- Generate + migrate:
  - `cd engine`
  - `export DATABASE_URL=postgresql://council:council@localhost:5432/council`
  - `npm run db:generate`
  - `npm run db:migrate`
- Run tests: `npm test`.
- Run engine locally: `npm run dev` (uses PORT=3101 from .env).
- Validate: `curl http://localhost:3101/api/health`.
- Optional skin dev server:
  - `cd ../skins/council-nebula`
  - `npm install`
  - `npm run dev`

