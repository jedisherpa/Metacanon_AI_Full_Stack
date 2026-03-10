# Developer Handover Report: LensForge Telegram Mini App

**Project:** LensForge — The Ring (Stage 3) on Telegram
**Document Version:** 1.0
**Date:** February 23, 2026
**Prepared By:** Manus AI
**Classification:** Internal — Engineering Team

---

## 1. Purpose of This Document

This report is a complete technical handover for the incoming development team. It synthesizes a full audit of the existing `council-engine-master-v2` codebase, a strategic overview of the Telegram Mini App platform, and a prescriptive 7-day sprint plan to launch the first player-facing feature: the asynchronous 1v1 "Ring" challenge.

The team should read this document in full before touching any code. The most important thing to understand upfront is that **approximately 75% of the required backend work is already done.** The existing `council-engine` is a production-grade deliberation engine. The sprint described here is not a greenfield build — it is the integration of a new, mobile-first frontend with a mature, existing backend.

---

## 2. Product Vision: What We Are Building

LensForge is a gamified platform for developing and refining perspective frameworks, called "Lenses." The core thesis is that **perspectives are currency** — the game rewards players not with points or tokens, but with increasingly refined, structured, and portable epistemic frameworks encoded as JSON objects.

The product is designed as a seven-stage architecture, from individual lens creation to distributed AI training. The Telegram Mini App is the entry point into this system, targeting Stages 1 through 3 for the initial launch.

**The three stages in scope for this sprint:**

| Stage | Name | Description |
| :--- | :--- | :--- |
| **Stage 1** | The Seeker's Journey | Players are onboarded via the Telegram bot. They receive cryptic prompts and are assigned one of 12 PAAPE archetype lenses. |
| **Stage 2** | The Forge | Players view and interact with their lens in the Mini App. They understand their epistemic identity. |
| **Stage 3** | The Ring | Players challenge each other to asynchronous 1v1 debates. Each challenge produces a synthesis artifact. **This is the primary target of the 7-day sprint.** |

The long-term vision — Stages 4 through 7, including the Council, community governance, and distributed AI training — is served by the existing `council-engine` backend, which is already architected to support these features.

---

## 3. Platform Context: Telegram Mini Apps

The team should understand the platform they are building for. Telegram is not a niche platform.

Telegram has **1 billion monthly active users** and **450 million daily active users**, with an average session length of 41 minutes. The 18–34 age demographic accounts for 53.5% of the user base. The platform recorded $13.6 million in in-app purchase revenue in January 2025 alone.

Telegram Mini Apps (TMAs) are standard web applications (HTML, CSS, JavaScript) running inside Telegram's WebView container. They are launched via a bot and require no App Store or Google Play submission. The key technical capabilities relevant to this project are:

- **Authentication:** Seamless, cryptographically verifiable user identity via `window.Telegram.WebApp.initData`. No separate login flow is required.
- **Notifications:** The bot can send push notifications to any user who has interacted with it, making asynchronous game loops (e.g., "You have been challenged") trivially easy to implement.
- **Payments:** Telegram Stars, the platform's native currency, can be used for premium features. The platform charges 0% commission, compared to 30% on the App Store.
- **Social Sharing:** `shareMessage()` and `shareToStory()` enable viral sharing of game results.
- **Group Context:** `chat_type` and `chat_instance` parameters allow the app to be aware of the social context in which it is running.

**The critical market insight:** All successful Telegram games to date are crypto-linked clickers (Notcoin: 35M users, Hamster Kombat: 300M users). The platform is technically capable of far richer experiences, but this design space is almost entirely unexplored. LensForge occupies an uncontested position.

---

## 4. System Architecture

The architecture is a clean separation of concerns between the backend game engine and the frontend player experience.

```
┌─────────────────────────────────────────────────────────────────┐
│                         TELEGRAM PLATFORM                       │
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────────────────┐  │
│  │   Telegram Bot   │         │     Telegram Mini App        │  │
│  │   (grammy.js)    │         │   (React + TMA SDK)          │  │
│  │                  │         │                              │  │
│  │  - Notifications │         │  - Lens Mirror (Stage 2)     │  │
│  │  - Deep Links    │         │  - Ring Feed (Stage 3)       │  │
│  │  - Onboarding    │         │  - Challenge & Vote UI       │  │
│  └────────┬─────────┘         └──────────────┬───────────────┘  │
│           │                                  │                  │
└───────────┼──────────────────────────────────┼──────────────────┘
            │ Telegram Bot API                 │ HTTPS REST API
            │                                  │
┌───────────▼──────────────────────────────────▼──────────────────┐
│                       COUNCIL ENGINE                            │
│                  (council-engine-master-v2)                     │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  State Machine  │  │    REST API       │  │  WebSocket    │  │
│  │ stateMachine.ts │  │  /api/v2/...      │  │  hub.ts       │  │
│  │ orchestration   │  │  (20+ endpoints)  │  │  (3 channels) │  │
│  │    Service.ts   │  │                  │  │               │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                   │                     │           │
│  ┌────────▼───────────────────▼─────────────────────▼────────┐  │
│  │                   PostgreSQL Database                      │  │
│  │   games | players | lenses | synthesis_artifacts | ...    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   pg-boss Queue  │  │  LLM Service     │                    │
│  │  (Durable Jobs)  │  │  (OpenAI + FB)   │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

**The key architectural principle:** The Council Engine is the single source of truth. It is entirely agnostic of its clients. The Telegram Mini App is a new, mobile-first client that communicates with the engine via a dedicated API adapter. It contains no game logic.

---

## 5. Codebase Audit: The Council Engine (`council-engine-master-v2`)

The following is a complete map of the existing codebase. The incoming team should treat this as the primary reference.

### 5.1 Top-Level Structure

```
council-engine-master/
├── engine/          # The backend Node.js server (THE BRAIN)
├── skins/
│   └── council-nebula/  # The existing admin-facing React UI (REFERENCE SKIN)
├── lens-packs/      # JSON content files defining the lenses
├── e2e/             # Playwright end-to-end tests
├── FACILITATOR_RUNBOOK.md  # The human protocol for running games
└── README.md
```

### 5.2 Engine Source (`engine/src/`)

| Path | Description | Status |
| :--- | :--- | :--- |
| `game/stateMachine.ts` | Defines all valid game states and transitions. The authoritative source of game flow logic. | ✅ Complete |
| `game/orchestrationService.ts` | Executes game commands (e.g., `deliberation_next`, `deliberation_pause`). Calls the LLM synthesis pipeline. | ✅ Complete |
| `api/v2/adminRoutes.ts` | All admin-facing endpoints (create game, force-advance state, view all games). | ✅ Complete |
| `api/v2/playerRoutes.ts` | All player-facing endpoints (join game, submit input, cast vote). | ✅ Complete |
| `api/v2/commandRoutes.ts` | Secure command endpoint for issuing state machine commands. | ✅ Complete |
| `ws/hub.ts` | WebSocket hub managing three channels: `admin`, `player`, and `deliberation`. | ✅ Complete |
| `db/schema.ts` | Full Drizzle ORM schema for all database tables. | ✅ Complete |
| `llm/service.ts` | LLM synthesis service with provider abstraction and fallback logic. | ✅ Complete |
| `queue/boss.ts` | `pg-boss` queue setup for durable, retriable command processing. | ✅ Complete |
| `queue/worker.ts` | Queue worker that processes game commands asynchronously. | ✅ Complete |

### 5.3 Lens Pack (`lens-packs/hands-of-the-void.json`)

This is the content layer of the game. It defines **12 PAAPE archetypes**, each with:

- `avatar_name` and `epistemology` (e.g., "The Logician", "Formal Deduction")
- `signature_color` (name and hex code for UI rendering)
- `philosophy` block: `core_quote`, `worldview`, `closing_quote`
- `prompt_template` block: `system`, `hint_instruction`, `followup_instruction` — these are the prompts fed directly to the LLM during deliberations

The team does not need to modify this file for the sprint. It is the content that the Mini App will display.

### 5.4 Admin Skin (`skins/council-nebula/`)

This is the existing React-based facilitator interface. It is **not** the player-facing UI, but it is the primary reference for how to interact with the engine's API and WebSocket layer. The incoming team should study `AdminGameConsole.tsx` to understand the control flow before building the new player skin.

### 5.5 Facilitator Runbook (`FACILITATOR_RUNBOOK.md`)

This document describes the manual, step-by-step protocol for running a Council game. It is the specification for the future AI Orchestrator (Stage 6). The incoming team should read it to understand the intended game flow.

### 5.6 Database Schema (Key Tables)

| Table | Description |
| :--- | :--- |
| `games` | One record per game (Council or Ring challenge). Has a `type` field and a `state` field. |
| `game_players` | Junction table linking players to games, including their assigned `lens_id`. |
| `lenses` | Stores all lens definitions, linked to the `hands-of-the-void` pack. |
| `deliberation_turns` | Records each turn of a deliberation (player input, LLM response). |
| `synthesis_artifacts` | Stores the final LLM-generated synthesis for a completed deliberation. |
| `votes` | Records player votes on deliberation outcomes. |

---

## 6. The Delta: Net-New Work Required

The entire scope of new development is confined to three components. **No modifications to the core engine logic, database schema, or existing API routes are required.**

### 6.1 Component 1: The Telegram Bot (`/bot`)

A new workspace in the monorepo. This is a lightweight `grammy.js` application responsible for:

- Handling the `/start` command and sending the initial onboarding message with a Mini App deep link.
- Sending push notifications when a player is challenged (triggered by the engine via an internal event or webhook).
- Sending push notifications when a challenge result is ready.

**This component has no game logic.** It is a notification relay.

### 6.2 Component 2: The Mini App Skin (`/skins/lensforge-tma`)

A new workspace in the monorepo. This is a mobile-first React application built with Vite and TypeScript, using the `@twa-dev/sdk` package for Telegram integration. It is the player's primary interface.

The skin will consist of three views for the sprint:

1. **The Lens Mirror:** Displays the player's assigned PAAPE lens (avatar name, color, philosophy, epistemology). Read-only.
2. **The Ring Feed:** Displays a list of other players' lenses as potential opponents. Each entry has a "Challenge" button.
3. **The Challenge View:** Displays an active challenge (the opponent's lens, the challenge prompt, and a voting interface).

**Reference:** Study `skins/council-nebula/` to understand the component patterns and API call conventions before building the new skin.

### 6.3 Component 3: The API Adapter (`engine/src/api/v2/telegramRoutes.ts`)

A single new file in the existing engine. This file registers six new Express routes that handle the specific needs of the Telegram Mini App. It is the only modification to the engine codebase.

---

## 7. API Specification: `telegramRoutes.ts`

The following six endpoints constitute the complete backend scope of the sprint.

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v2/telegram/auth` | Validates the Telegram `initData` HMAC signature and issues a player JWT. Creates a new player record if the Telegram user is new. | Telegram `initData` |
| `GET` | `/api/v2/telegram/me/lens` | Returns the authenticated player's assigned lens object from the `hands-of-the-void` pack. | Player JWT |
| `GET` | `/api/v2/telegram/ring/candidates` | Returns a paginated list of other players' lenses, excluding the requesting player. | Player JWT |
| `POST` | `/api/v2/telegram/ring/challenges` | Creates a new `game` record with `type: 'ring_challenge'`. Accepts `challengerId`, `challengedId`, and `challengeText`. Queues a bot notification to the challenged player. | Player JWT |
| `GET` | `/api/v2/telegram/ring/challenges/:id` | Returns the full state of a specific challenge, including both players' lenses, the challenge text, votes, and the synthesis artifact if available. | Player JWT |
| `POST` | `/api/v2/telegram/ring/challenges/:id/vote` | Records a player's vote on a challenge. If both players have voted, triggers the existing `deliberation_next` command on the engine, which generates the synthesis artifact. | Player JWT |

**Critical Implementation Note on `POST /api/v2/telegram/ring/challenges`:** Every Ring challenge is simply a new `game` record in the existing `games` table with `type: 'ring_challenge'`. This is the key architectural decision that allows the entire existing `deliberation` and `synthesis_artifacts` machinery to be reused without modification. The `game.type` field distinguishes Ring challenges from full Council games.

**Authentication Implementation Note:** Telegram `initData` validation requires computing an HMAC-SHA256 hash of the data string using the bot token as the key. The official algorithm is documented at [core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). This validation must be performed server-side on every authenticated request.

---

## 8. The 7-Day Sprint Plan

The following plan is prescriptive. Each day has a single clear deliverable and a definition of "done."

### Day 1: Telegram Authentication

**Objective:** A user can open the Mini App from a bot message and the app can successfully identify them.

**Tasks:**
1. Create the `/bot` workspace. Install `grammy`. Configure the bot token from environment variables.
2. Implement the `/start` command handler. It should send a message with an inline keyboard button that opens the Mini App via a `t.me/` deep link.
3. Create `engine/src/api/v2/telegramRoutes.ts`. Implement `POST /api/v2/telegram/auth`.
4. The endpoint must: (a) validate the `initData` HMAC, (b) extract the `user.id`, (c) look up or create a player record in the `game_players` table, (d) return a signed JWT.
5. In the Mini App skin, call `window.Telegram.WebApp.initData` on load and send it to the auth endpoint. Store the returned JWT in `localStorage`.

**Definition of Done:** An internal tester can open the bot, tap the button, and the Mini App loads and successfully authenticates them. The player record is visible in the database.

---

### Day 2: The Lens Mirror

**Objective:** A player can view their assigned PAAPE lens in the Mini App.

**Tasks:**
1. Implement `GET /api/v2/telegram/me/lens` in `telegramRoutes.ts`. This endpoint reads the player's `lens_id` from `game_players` and returns the corresponding lens object from the database (seeded from `hands-of-the-void.json`).
2. If the player has no assigned lens, assign one randomly from the 12 available archetypes.
3. Build the `LensMirror` React component in the Mini App. It should display: the avatar name, the epistemology, the `signature_color` as a prominent visual accent, and the `core_quote` from the philosophy block.
4. This is the first screen a player sees after authentication.

**Definition of Done:** An authenticated player sees their lens displayed with the correct name, color, and philosophy quote.

---

### Day 3: The Ring Feed

**Objective:** A player can browse other players' lenses and see who they can challenge.

**Tasks:**
1. Implement `GET /api/v2/telegram/ring/candidates` in `telegramRoutes.ts`. This endpoint returns a list of 10 other players with their assigned lenses, ordered by most recently active. Exclude the requesting player.
2. Build the `RingFeed` React component in the Mini App. Each item in the feed should display the opponent's avatar name, epistemology, and signature color. Include a "Challenge" button on each item.

**Definition of Done:** A player can scroll through a list of other players' lenses and see a "Challenge" button on each one.

---

### Day 4: The Challenge Flow

**Objective:** A player can issue a challenge to another player.

**Tasks:**
1. Implement `POST /api/v2/telegram/ring/challenges` in `telegramRoutes.ts`. This endpoint: (a) creates a new `game` record with `type: 'ring_challenge'` and `state: 'AWAITING_RESPONSE'`, (b) creates two `game_players` records linking both players to the game, (c) enqueues a `pg-boss` job to send a bot notification to the challenged player.
2. Build the `ChallengeCompose` React component. When a player taps "Challenge," they see a text input to write their challenge argument and a "Send Challenge" button.
3. Implement the bot notification job: when the job fires, the bot sends a message to the challenged player's Telegram ID saying "You have been challenged by [name]. Tap to respond." with a deep link to the challenge view.

**Definition of Done:** Player A can challenge Player B. Player B receives a Telegram notification with a link to the challenge.

---

### Day 5: The Voting Flow

**Objective:** Both players can view the challenge and cast their votes.

**Tasks:**
1. Implement `GET /api/v2/telegram/ring/challenges/:id` in `telegramRoutes.ts`. Returns the full challenge state: both players' lenses, the challenge text, and the current vote count.
2. Implement `POST /api/v2/telegram/ring/challenges/:id/vote` in `telegramRoutes.ts`. Records the vote in the `votes` table. Does not yet trigger synthesis.
3. Build the `ChallengeView` React component. It displays the challenger's argument, both lenses side by side, and a voting interface ("Whose lens holds up better?").
4. After a player votes, the UI should update to show "Waiting for opponent's vote."

**Definition of Done:** Both players can open the challenge, read the argument, and cast a vote. The vote is recorded in the database.

---

### Day 6: Synthesis and Results

**Objective:** After both players vote, the engine generates a synthesis artifact and both players are notified.

**Tasks:**
1. Modify `POST /api/v2/telegram/ring/challenges/:id/vote` to check if both players have voted. If so, issue a `deliberation_next` command to the engine's command queue for the challenge's `game_id`. This triggers the existing `orchestrationService.ts` logic, which calls the LLM and writes a `synthesis_artifact` to the database.
2. Implement a webhook or polling mechanism in the bot to detect when a synthesis artifact is created for a Ring challenge. When detected, send a notification to both players: "Your challenge has been synthesized. Tap to see the result."
3. Update `GET /api/v2/telegram/ring/challenges/:id` to include the `synthesis_artifact` in its response when available.
4. Update the `ChallengeView` component to display the synthesis artifact (the LLM-generated analysis of the clash) when it is available.

**Definition of Done:** After both players vote, both receive a notification. Tapping the notification opens the challenge view, which now displays the synthesis artifact.

---

### Day 7: Internal Playtest and Polish

**Objective:** Validate the full end-to-end loop with real users.

**Tasks:**
1. Conduct a full end-to-end playtest with at least two internal team members on real Telegram accounts.
2. Verify that the entire flow — authentication → lens view → challenge → vote → synthesis → notification — works without errors.
3. Verify that the challenge and synthesis artifact are visible in the `council-nebula` admin panel.
4. Fix any UI/UX issues identified during the playtest.
5. Update `FACILITATOR_RUNBOOK.md` with a new section: "Monitoring Ring Challenges from the Admin Panel."

**Definition of Done:** Two internal users can complete a full Ring challenge loop on Telegram without any manual intervention. The admin panel shows the challenge state correctly.

---

## 9. Environment Setup

### Prerequisites

- Node.js 22+
- `pnpm` package manager
- PostgreSQL 15+
- A Telegram bot token (create via `@BotFather` on Telegram)
- An OpenAI API key (for LLM synthesis)

### Setup Steps

1. Unzip `council-engine-master-v2.zip` to your local machine.
2. Run `pnpm install` at the monorepo root.
3. Copy `.env.example` to `.env` and fill in the required values:
   - `DATABASE_URL` — PostgreSQL connection string
   - `OPENAI_API_KEY` — OpenAI API key
   - `ADMIN_TOKEN` — A secure random string for the admin API
   - `TELEGRAM_BOT_TOKEN` — Your bot token from BotFather (new, for this sprint)
   - `JWT_SECRET` — A secure random string for signing player JWTs (new, for this sprint)
4. Run `pnpm db:migrate` to apply the database schema.
5. Run `pnpm db:seed` to seed the lens packs from `lens-packs/hands-of-the-void.json`.
6. Run `pnpm dev` to start the engine in development mode.
7. Open `http://localhost:3000` to verify the engine is running.
8. Open the `council-nebula` skin at `http://localhost:5173` to verify the admin panel loads.

---

## 10. Out of Scope for This Sprint

The following features are explicitly out of scope for the 7-day sprint. They are part of the long-term roadmap but must not be allowed to expand the current scope.

- **Stage 4 (The Council):** Full multi-player, facilitator-led deliberation sessions. The engine already supports this; the Mini App UI for it is a future sprint.
- **Stage 5 (Governance):** Lens ratification voting and TON NFT minting.
- **Stage 6 (The Orchestrator):** AI automation of the facilitator role.
- **Stage 7 (Distributed AI):** Specialized perspective LLMs.
- **Telegram Stars Payments:** Monetization features.
- **Leaderboards and Social Sharing:** Viral mechanics beyond the basic challenge notification.
- **The Forge UI:** The full `LensForge.tsx` lens creation interface. For this sprint, lenses are assigned from the existing pack.

---

## 11. Definition of Done for the Sprint

The sprint is complete when the following conditions are all true:

1. Two internal users can complete a full Ring challenge loop on Telegram (challenge → vote → synthesis → notification) without any manual intervention or errors.
2. The synthesis artifact is correctly generated by the existing LLM synthesis pipeline and displayed in the Mini App.
3. The challenge state is visible and correctly represented in the `council-nebula` admin panel.
4. The `FACILITATOR_RUNBOOK.md` has been updated with Ring challenge monitoring instructions.
5. All six new API endpoints have basic input validation and return appropriate error codes.

---

## 12. Key Contacts and References

| Resource | Location |
| :--- | :--- |
| Telegram Mini App SDK Documentation | [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps) |
| `initData` Validation Algorithm | [core.telegram.org/bots/webapps#validating-data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) |
| `grammy.js` Documentation | [grammy.dev](https://grammy.dev) |
| `@twa-dev/sdk` Package | [github.com/twa-dev/sdk](https://github.com/twa-dev/sdk) |
| `pg-boss` Documentation | [github.com/timgit/pg-boss](https://github.com/timgit/pg-boss) |
| Facilitator Runbook | `council-engine-master/FACILITATOR_RUNBOOK.md` |
| LensForge Vision Document | *The Lens-Forging Game: A Vision for Distributed Perspective Intelligence* |
| Original Field Report | `LensForge_Telegram_Field_Report.md` |
| Original Developer Proposal | `LensForge_Developer_Proposal.md` |
