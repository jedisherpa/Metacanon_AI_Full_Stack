# Council Engine Codebase Overview (LLM Handoff)

This document is a practical overview of the `council-engine` codebase so another person (or another LLM) can quickly understand what the system does, how the major pieces fit together, and where to look for specific behavior.

It is not a line-by-line reference. It is a map of the system.

## 1. What This Project Is

`council-engine` is a synchronous deliberation application with:

- A host/admin panel unlocked by a single admin password (no host account system)
- A participant flow with lobby -> round 1 -> round 2 -> live deliberation -> results
- Queue-backed command execution (`pg-boss`) for reliable stage transitions and orchestration
- Postgres persistence (Drizzle ORM)
- WebSocket realtime updates for host, participant, and deliberation views
- LLM-assisted hinting and synthesis (Morpheus / Groq / `auto` routing)

The current implementation is focused on the synchronous method (host-controlled progression).

## 2. Monorepo Structure

Repo root: `/Users/maxnachamkin/src/council-engine/council-engine`

### Top-level folders

- `/Users/maxnachamkin/src/council-engine/council-engine/engine`
  - Node/Express API, queue worker, DB schema/queries, game state machine, LLM orchestration, WebSocket server
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula`
  - React/Vite frontend for admin + participant experiences
- `/Users/maxnachamkin/src/council-engine/council-engine/lens-packs`
  - Lens definitions and orchestrator prompts (avatar lenses, epistemology, prompt templates)
- `/Users/maxnachamkin/src/council-engine/council-engine/config`
  - Additional config files (lens pack references)
- `/Users/maxnachamkin/src/council-engine/council-engine/e2e`
  - End-to-end tests (Playwright)

### Key package manifests

- `/Users/maxnachamkin/src/council-engine/council-engine/package.json`
  - Workspace root (`engine`, `skins/council-nebula`)
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/package.json`
  - API/worker scripts, Drizzle migrations, Vitest tests
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/package.json`
  - Vite dev/build/preview frontend scripts

## 3. Product Flow (What the App Does)

### 3.1 Host/Admin flow (high level)

1. Admin opens the Nebula skin and goes to `/admin/unlock`
2. Admin enters the admin panel password
3. Admin creates a game with:
   - question
   - group size
   - provider (`morpheus`, `groq`, `auto`)
   - entry mode (`self_join` or `pre_registered`)
4. Admin shares a join link (or pre-registers roster and sends per-player access links)
5. Admin opens/closes lobby and advances stages with command buttons
6. Admin monitors player progress (round completion, eligibility)
7. Admin runs deliberation step-by-step using `Start`, `Pause`, `Resume`, `Next`
8. Admin can export the final game artifacts and archive the game

### 3.2 Participant flow (high level)

1. Participant opens invite link or personal access link
2. Participant claims a seat / receives assigned lens (avatar + epistemology)
3. Participant waits in lobby (question hidden until Round 1 opens)
4. Round 1 opens -> question becomes visible -> participant submits first response
5. Round 2 assignments are generated (2 or 3 targets depending on group size)
6. Participant responds to assigned perspectives while keeping their own lens
7. Once eligible, participant can watch the live deliberation feed
8. After completion/archive, participant can review final results artifacts

### 3.3 Deliberation phases (host-controlled)

The deliberation is not a single long streaming call. It is stepped by the host using repeated `deliberation_next` commands.

Typical sequence:

1. `positions`
   - emits position cards (each avatar’s round 1 response + short summary)
2. `clash`
   - generates structured clash analysis artifact
3. `consensus`
   - generates structured consensus artifact
4. `options`
   - generates structured options artifact
5. `paradox`
   - generates structured paradox artifact
6. `minority`
   - generates structured minority report artifact
7. `complete`
   - game moves to `deliberation_complete`

Artifacts are persisted and also broadcast to deliberation viewers over WebSocket.

## 4. Backend Architecture (`engine/`)

### 4.1 Runtime entrypoints

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/index.ts`
  - Starts Express API server + WebSocket upgrade handler
  - Loads lens pack
  - Initializes `pg-boss`
  - Optionally starts inline workers (`INLINE_WORKER_ENABLED=true`)
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/index.worker.ts`
  - Dedicated worker process for queue jobs (production-friendly split)

### 4.2 Core backend stack

- Express (HTTP API)
- `ws` (WebSocket server)
- PostgreSQL + Drizzle ORM
- `pg-boss` (job queue on Postgres)
- Zod (request/env validation)
- pino (logging)
- Sentry (optional)

### 4.3 Environment validation

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/config/env.ts`

This file is strict and validates all required runtime configuration at startup. Important categories:

- Database / queue: `DATABASE_URL`, `PG_BOSS_SCHEMA`, `COMMAND_MAX_RETRIES`
- Networking: `PORT`, `CORS_ORIGINS`
- LLM providers: Morpheus + Groq URLs/keys/models
- Admin auth: `ADMIN_PANEL_PASSWORD`, session cookie settings
- Runtime behavior: `INLINE_WORKER_ENABLED`, `DEFAULT_GROUP_SIZE`, `POSITION_REVEAL_SECONDS`

## 5. Data Model (Postgres + Drizzle)

Main schema file:
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/db/schema.ts`

### Core tables and what they store

- `games`
  - one row per deliberation session/game
  - question, status, provider, entry mode, invite code, deliberation phase, state version
- `game_players`
  - players in a game (seat number, access token, lens/avatar identity, round completion flags)
- `round1_responses`
  - each player’s initial response to the question
- `round2_assignments`
  - generated target assignments for round 2 (who responds to whom)
- `round2_responses`
  - responses to each assignment target
- `synthesis_artifacts`
  - persisted deliberation outputs (clash/consensus/options/paradox/minority)
- `commands`
  - queueable host actions (`round1_open`, `round2_assign`, `deliberation_next`, etc.) with status/audit fields
- `audit_events`
  - event trail of key system/admin actions
- `admin_sessions`
  - hashed admin session tokens with expiry

### Why the `commands` table matters

The host UI does not directly mutate game state for major stage actions. It creates a command record and enqueues it. This gives:

- retries
- visibility into pending/running/failed/completed commands
- safer state transitions
- easier debugging/auditing

## 6. Game State Machine and Command Processing

### 6.1 State machine

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/stateMachine.ts`

Defines valid status transitions, including:

- `draft`
- `lobby_open`
- `lobby_locked`
- `round1_open`
- `round1_closed`
- `round2_open`
- `round2_closed`
- `deliberation_running`
- `deliberation_paused`
- `deliberation_complete`
- `archived`

It also defines valid command types (e.g. `round2_assign`, `deliberation_next`, `archive`).

### 6.2 Queue and worker

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/queue/boss.ts`
  - initializes `pg-boss`, creates the `game.command` queue, enqueues command jobs
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/queue/worker.ts`
  - registers worker consumers for queued jobs
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/queue/jobs/gameCommandJob.ts`
  - pulls `commandId`, marks command status, runs orchestration, emits WS updates
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/queue/jobs/deliberationJob.ts`
  - helper to enqueue `deliberation_next` command

### 6.3 Orchestration service (business logic)

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/orchestrationService.ts`

This is the core workflow executor for host commands. It handles:

- stage transitions (`lobby_open`, `round1_open`, etc.)
- round 2 assignment generation
- deliberation phase progression (`positions` -> `clash` -> `consensus` -> `options` -> `paradox` -> `minority`)
- artifact persistence
- realtime broadcasts to host/player/deliberation channels

This file is the best place to understand “what happens when the host clicks a button.”

## 7. API Surface (Express v2)

### 7.1 Admin auth (password panel)

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/adminAuthRoutes.ts`

Endpoints:

- `POST /api/v2/admin/unlock`
  - verifies admin password
  - starts admin session
  - sets secure cookie and returns `wsToken`
- `GET /api/v2/admin/session`
  - validates session (cookie or bearer token)
- `POST /api/v2/admin/lock`
  - ends session and clears cookie

Related files:

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/admin/passwordGate.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/admin/sessionService.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/admin/middleware.ts`

Important implementation detail:
- Admin auth supports **cookie OR bearer token**. This was added to improve reliability on mobile and cross-site browser environments.

### 7.2 Admin game control

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/adminGameRoutes.ts`

Responsibilities:

- create/list/get games
- preload roster for `pre_registered` mode
- generate per-player rejoin links
- enqueue stage commands (lobby/round1/round2/deliberation/archive)
- export game data (JSON)

The route layer mainly validates requests and enqueues commands; the actual stage mutations happen in the worker/orchestration path.

### 7.3 Player routes

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/playerGameRoutes.ts`

Responsibilities:

- invite code lookup
- self-join seat claim
- access via pre-registered token link
- `me` endpoint (current player + game status snapshot)
- lobby state
- round 1 submit
- round 2 assignments + submit
- deliberation feed (gated by deliberation eligibility)

Key behavior notes:

- Question is hidden before Round 1 opens (status-based visibility check)
- Self-join only works while `lobby_open`
- Hint generation is async/non-blocking after join (seat claim returns immediately)
- Deliberation feed access is blocked until the player is marked eligible

### 7.4 Command status route

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/commandRoutes.ts`

Used by the admin UI to poll a specific command state if needed.

## 8. Lens Assignment and Round 2 Assignment

### 8.1 Lens assignment

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/lensAssignment.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/config/lensPack.ts`

The lens pack defines the persona/lens metadata (avatar name, epistemology, prompts, visual metadata). The backend assigns these to seats/players.

### 8.2 Round 2 assignment algorithm

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/round2Assignment.ts`

Round 2 target assignment is **balanced random assignment**, not LLM-ranked contrast.

Rules implemented:

- if player count `> 6`: assign 3 targets per player
- otherwise: assign 2 targets per player
- no self-targeting
- tries to balance target load across players
- prompt text includes target avatar/lens info + target’s round 1 response

## 9. LLM Layer (Hints + Deliberation Synthesis)

### 9.1 Provider routing

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/llm/providers.ts`

Provider choices:

- `morpheus`
- `groq`
- `auto`

`auto` mode currently routes:

- generation tasks (e.g. hints) -> Morpheus
- orchestrator/synthesis tasks -> Groq

### 9.2 Retry / fallback behavior

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/llm/fallback.ts`

This layer handles fallback behavior across:

- primary API key/model
- fallback API key (same model)
- fallback model (if configured)

It uses `Promise.any` to prefer the first successful response when both primary and fallback-key attempts are racing.

### 9.3 LLM service functions

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/llm/service.ts`

Main responsibilities:

- `generateHint(...)`
  - per-player optional hint based on lens + question
- `generatePositionSummary(...)`
  - short summary per round 1 position during deliberation phase `positions`
- `generateStructuredClashes(...)`
- `generateStructuredSynthesis(...)`
  - creates structured JSON artifacts for `consensus`, `options`, `paradox`, `minority`

### 9.4 Structured deliberation artifacts (important for UI)

Deliberation outputs are normalized to a `structured_v1` JSON format (cards, bullets, questions, raw text fallback). This is what allows the frontend to render styled cards instead of raw markdown/prose.

Artifacts are stored in DB as JSON strings and sent to clients over WebSocket.

## 10. WebSocket Realtime Architecture

### 10.1 Hub and channels

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/ws/hub.ts`

Channels/rooms are namespaced by game:

- `admin:<gameId>`
- `player:<gameId>`
- `deliberation:<gameId>`

The server upgrades `/ws/v2/:channel/:gameId` requests and broadcasts JSON events to the relevant room.

### 10.2 WebSocket auth

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/ws/auth.ts`

Authorization logic supports either:

- valid admin session token (full access)
- valid player access token (player-scoped access)

For `deliberation` channel, player must also be `deliberationEligible=true`.

### 10.3 Common event patterns

The worker and orchestration layers emit events like:

- `command.accepted`, `command.running`, `command.completed`, `command.failed`
- `state.refresh`
- `round1.opened`, `round1.closed`
- `round2.assigned`, `round2.opened`, `round2.closed`
- `deliberation.phase_started`, `deliberation.phase_stream`, `deliberation.paused`, `deliberation.resumed`, `deliberation.completed`

The frontend listens to these and either refreshes snapshots or updates live UI directly.

## 11. Frontend Architecture (`skins/council-nebula/`)

### 11.1 Frontend stack

- React 19
- TypeScript
- Vite
- `wouter` (routing)
- `framer-motion` (animations)

### 11.2 Route map

Main route file:
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/App.tsx`

Admin routes:

- `/admin/unlock` -> admin password entry
- `/admin` -> dashboard (game list + create game)
- `/admin/game/:id` -> host game console
- `/admin/game/:id/join-view` -> screenshare join page with QR code and live seat fill status

Player routes:

- `/play/:id/join` -> self-join entry page
- `/play/:id/access/:token` -> direct player access link page
- `/play/:id/lobby`
- `/play/:id/round1`
- `/play/:id/round2`
- `/play/:id/transition` -> stage transition interstitial screen (5s game-like transition)
- `/play/:id/deliberation`
- `/play/:id/results`

### 11.3 Shared frontend API and session utilities

- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/lib/api.ts`
  - fetch wrapper + typed API calls for admin/player routes
  - sends cookies and auto-attaches admin bearer token for `/api/v2/admin/*`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/lib/session.ts`
  - localStorage for admin WS token and player session state
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/lib/ws.ts`
  - WebSocket client with reconnect/backoff
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/lib/playerFlow.ts`
  - route resolver based on game/player status
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/lib/stageTransition.ts`
  - queues and consumes stage transition messages/interstitials

### 11.4 Key admin pages

- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/AdminUnlock.tsx`
  - unlocks admin tools via password
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/AdminDashboard.tsx`
  - create/list games
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/AdminGameConsole.tsx`
  - main host control center
  - shows question, current phase/status, progress, recommended next action, command status, links, deliberation controls
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/AdminDeliberationJoinView.tsx`
  - large QR code + join link + seat occupancy board for screensharing before session starts

### 11.5 Key participant pages

- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerEntry.tsx`
  - join or re-enter via access token
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerLobby.tsx`
  - waiting room + roster/progress view; reacts to host stage changes
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerRound1.tsx`
  - first response submission
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerRound2.tsx`
  - assigned perspective responses submission
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerStageTransition.tsx`
  - animated stage-change interstitial (e.g. “Round 1 complete…”) before redirect
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerDeliberation.tsx`
  - live deliberation viewer; renders position cards and structured synthesis artifacts
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerResults.tsx`
  - final artifact review

### 11.6 Deliberation output rendering

- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/components/DeliberationText.tsx`

This component renders structured artifacts (cards/bullets/questions) and falls back gracefully if older/plain text artifacts are encountered.

## 12. Realtime + UI Sync Model (Practical)

The UI uses a hybrid pattern:

- **WebSocket events** for fast, live updates and stage signals
- **HTTP snapshot reloads** (`state.refresh`) to guarantee consistency after commands complete

This is why some views both listen to WebSocket and re-fetch current game state. It avoids stale client assumptions after multi-step backend changes.

## 13. Export / Archive

- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/export/jsonExport.ts`

Admin can export a game as JSON (game, players, responses, assignments, artifacts, commands/audit context depending on implementation path). Archived games are transitioned to `archived` status and results remain readable.

## 14. Testing and Validation

### Backend tests

- Vitest unit/integration tests in `engine/src/**.test.ts`
  - examples include queue worker, state machine, round 2 assignment

### Frontend / e2e

- Playwright config at `/Users/maxnachamkin/src/council-engine/council-engine/playwright.config.ts`
- E2E flow tests in `/Users/maxnachamkin/src/council-engine/council-engine/e2e`

## 15. Deployment Notes (What Matters for Operators)

### 15.1 API vs Worker

The API can run in two modes:

- **Inline worker mode** (`INLINE_WORKER_ENABLED=true`)
  - easiest for local/dev
- **Split API + Worker mode** (`INLINE_WORKER_ENABLED=false` on API + separate worker service)
  - preferred for production reliability

### 15.2 Frontend env vars are build-time

`VITE_*` variables (e.g. API/WS URL) are baked in during frontend build. If they change, the skin must be rebuilt/redeployed.

### 15.3 CORS and admin auth on hosted domains

CORS must allow the **frontend origin** (not the API origin).

Admin auth is cookie-based but also supports bearer token fallback (important for mobile / cross-site cookie inconsistencies).

## 16. “Where Do I Change X?” Quick Map

### Game lifecycle / stage transitions
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/stateMachine.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/orchestrationService.ts`

### Host button behavior / admin API actions
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/adminGameRoutes.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/AdminGameConsole.tsx`

### Player join / lobby / round submissions
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/playerGameRoutes.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerEntry.tsx`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerLobby.tsx`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerRound1.tsx`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerRound2.tsx`

### Round 2 assignment logic
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/round2Assignment.ts`

### LLM prompts / synthesis structure / provider routing
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/llm/service.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/llm/providers.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/lens-packs/hands-of-the-void.json`

### Realtime events and WS auth
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/ws/hub.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/ws/auth.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/lib/ws.ts`

### Structured deliberation rendering UI
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerDeliberation.tsx`
- `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/components/DeliberationText.tsx`

### Admin auth / password / sessions
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/adminAuthRoutes.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/admin/sessionService.ts`
- `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/admin/middleware.ts`

## 17. Suggested Prompt for Another LLM Reviewing This Repo

Use something like this when handing the repo to another LLM:

> You are reviewing a synchronous deliberation app monorepo with a Node/Express backend (`engine`) and React/Vite frontend (`skins/council-nebula`). Please map the host and participant flows end-to-end, then inspect queue-backed command execution (`pg-boss`), game state transitions, WebSocket realtime updates, and LLM deliberation artifact generation. Focus on race conditions, invalid transitions, auth/session edge cases (admin password + mobile), realtime consistency gaps, and deployment/config risks. Use `/engine/src/game/orchestrationService.ts`, `/engine/src/api/v2/*`, `/engine/src/ws/*`, `/engine/src/llm/*`, and `/skins/council-nebula/src/pages/*` as primary entry points.

## 18. Fast Start Reading Order (for a new engineer)

If someone has 30 minutes, read in this order:

1. `/Users/maxnachamkin/src/council-engine/council-engine/README.md`
2. `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/index.ts`
3. `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/game/orchestrationService.ts`
4. `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/adminGameRoutes.ts`
5. `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/api/v2/playerGameRoutes.ts`
6. `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/db/schema.ts`
7. `/Users/maxnachamkin/src/council-engine/council-engine/engine/src/llm/service.ts`
8. `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/App.tsx`
9. `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/AdminGameConsole.tsx`
10. `/Users/maxnachamkin/src/council-engine/council-engine/skins/council-nebula/src/pages/PlayerDeliberation.tsx`

---

If this document is used for implementation planning, pair it with the lens pack file and the DB schema/migrations to avoid making assumptions about prompt formats or persisted artifact structure.
