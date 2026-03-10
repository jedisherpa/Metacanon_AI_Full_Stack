# MMOGG Engineering Spec: Q&A Addendum

**Document Owner:** Project Manager  
**Date:** February 25, 2026  
**Version:** 1.1 (Addendum to Spec v1.0)

---

## 1. Introduction

This document provides definitive answers to the questions raised by the development team regarding the **MMOGG Engineering Spec v1.0**. It should be considered a canonical extension of that spec. Where this document provides a direct answer, it supersedes any ambiguity in the original document.

All decisions are made in service of the larger strategic vision: to build a **sovereign knowledge marketplace** where the Mini App game is the supply-side engine for a cryptographically secure, agent-callable **Perspective API**.

---

## 2. Project Management & Scope

**Q1: Which file is canonical if `MMOGG_Engineering_Spec.md` and any other version (e.g., `.docx`) differ?**

**Answer:** The Markdown file (`.md`) checked into the primary source control repository is the **single source of truth**. Any other format is a derivative artifact and should not be trusted.

**Q2: Is “production-ready as-is” literal, or are placeholders (Round 2, Deliberation UI, lens colors) expected to be completed by engineering?**

**Answer:** It is literal for the code provided. It is not literal for the parts explicitly marked as placeholders. Engineering is expected to build out the `Round2View` and `DeliberationView` components and fully populate the `LENS_COLORS` map in `PassportScreen.tsx` using the authoritative list provided in this Q&A.

**Q3: What is strict MVP scope for go-live, and what is explicitly post-MVP?**

**Answer:**
-   **MVP (Release-Blocking):**
    1.  Full user lifecycle: Join game, get assigned a lens, view Passport.
    2.  Complete Round 1 submission flow.
    3.  CXP and "First Voice" badge are awarded correctly for Round 1 submission.
    4.  The `BadgeEarnedModal` appears and the share function works.
    5.  The Passport screen accurately reflects the player's CXP and earned badges.
-   **Post-MVP (Do Not Block Release):**
    1.  Full implementation of Round 2 UI.
    2.  Full implementation of the live Deliberation view.
    3.  The `RedButton` biometric flow.
    4.  The full Badge Gallery screen (a simple list is fine for MVP).

**Q4: Which acceptance criteria are release-blocking versus nice-to-have?**

**Answer:** All acceptance criteria for **Ticket DB-01** and **Ticket BE-01** are **release-blocking**. For the frontend, the acceptance criteria related to the MVP scope defined in Q3 are **release-blocking**.

---

## 3. Architecture & Scope

**Q5: Should backend changes land first and be deployed before any mini-app work, or can teams run in parallel?**

**Answer:** Backend changes **must land first**. The Mini App team can work in parallel using a mock API, but they cannot integrate or test end-to-end until the backend `v2/passport` routes are deployed to a shared staging environment.

**Q6: Is the existing web app (`skins/council-nebula`) expected to remain fully functional during and after migration?**

**Answer:** Yes. It will be repurposed as the primary **Admin Console**. All admin-facing routes and functionality must remain 100% functional. Player-facing routes can be deprecated visually (e.g., replaced with a link to the Telegram bot) but should not be broken.

**Q7: What are the required non-functional targets (latency, uptime, concurrent users)?**

**Answer:** For the initial MVP launch, we will not set formal NFRs. The goal is a functional and stable product. We will benchmark performance and set targets for v1.1.

---

## 4. Data Model & Gamification

**Q8: Should badge uniqueness be global per player (`playerId` + `badgeId`) or per game (`playerId` + `badgeId` + `gameId`)?**

**Answer:** **Global per player (`playerId` + `badgeId`)**. A player's identity and achievements are sovereign and persist across all games they play. The `player_badges` unique index in the spec is correct.

**Q9: Should CXP and badge progress be global across games or scoped per game/sphere?**

**Answer:** **Global**. This is critical to the new strategy. A player's CXP is a measure of their total contribution to the ecosystem, not just one game. This is what makes their identity valuable.

**Q10: Can a Telegram user join multiple games over time, or is one account permanently linked to one player record?**

**Answer:** A Telegram user has **one permanent identity** but can participate in **many games**. This requires a slight but critical change to the spec's data model. We need a root `users` table.

-   **Action:** Create a new `users` table: `id (uuid)`, `telegram_user_id`, `telegram_handle`, `cxp`.
-   The `game_players` table will now have a `user_id` foreign key instead of storing Telegram info and CXP directly.
-   When a user joins their first game, a record is created in `users`. When they join subsequent games, a new `game_players` record is created, linked to their existing `users` record.

**Q11: If a game ends, how should re-linking work for that same Telegram account?**

**Answer:** The link is permanent at the `users` table level. The `/api/v2/passport/link-game` logic should be updated: if a `user` record already exists for the `telegram_user_id`, it should simply create a new `game_players` record for the new game and link it to the existing user.

**Q12: What is the final level curve (CXP thresholds), and are the current frontend thresholds authoritative?**

**Answer:** The frontend thresholds are placeholders. The **authoritative level curve** is as follows. This should be stored in a config file on the backend.

| Level | CXP Required |
| :--- | :--- |
| 1 | 0 |
| 2 | 100 |
| 3 | 300 |
| 4 | 700 |
| 5 | 1,500 |
| 6 | 3,000 |
| 7 | 6,000 |
| 8 | 12,000 |
| 9 | 25,000 |
| 10 | 50,000 |

**Q13: What are the final 12 lens names and signature colors?**

**Answer:** The authoritative list is from `hands-of-the-void.json`. Populate the `LENS_COLORS` map with this data.

| Lens Name | Hex Code |
| :--- | :--- |
| The Logician | `#F5E6C8` |
| The Intuitive | `#00E5FF` |
| The Systems Thinker | `#FF6B2B` |
| The Alchemist | `#FFB800` |
| The Archivist | `#8B7D6B` |
| The Skeptic | `#4A4A4A` |
| The Oracle | `#E0F0FF` |
| The Empiricist | `#00FF88` |
| The Harmonist | `#9B59B6` |
| The Agonist | `#FF3300` |
| The Absurdist | `#FF00FF` |
| The Architect | `#C0D6E4` |

---

## 5. Auth & Security

**Q14: Should Telegram `initData` validation also enforce `auth_date` freshness window?**

**Answer:** **Yes.** Add a check in `telegramAuth.ts`. Reject any request where `auth_date` is older than 1 hour from the current server time.

**Q15: Do you want constant-time hash comparison for Telegram hash checks?**

**Answer:** **Yes.** Use `crypto.timingSafeEqual` for the hash comparison in `validateTelegramInitData` to mitigate timing attacks.

**Q16: What is the intended role of `telegram_sessions` (currently added but not clearly used)?**

**Answer:** Its role is to establish a stateful session. The client should exchange the `initData` **once** for a secure session token stored in this table. Subsequent requests use this session token instead of sending the large `initData` string every time.

**Q17: Should clients send raw `initData` on every request, or exchange it for a backend session token first?**

**Answer:** **Exchange it for a session token.**
1.  Create a new endpoint: `POST /api/v2/auth/telegram-login`.
2.  This endpoint takes `initData`, validates it, and if valid, creates a record in `telegram_sessions` with a new secure random token, and returns that token to the client.
3.  The client stores this session token in `localStorage`.
4.  All subsequent API calls should send `Authorization: Bearer <session_token>`.
5.  Create a new middleware to validate this bearer token against the `telegram_sessions` table.

**Q18: What is the logout/session revocation model?**

**Answer:** Create a `POST /api/v2/auth/logout` endpoint that requires the bearer token and deletes the corresponding session from the `telegram_sessions` table.

**Q19: Is `MINI_APP_ORIGIN` a single origin or should it support a dev/staging/prod allowlist?**

**Answer:** It should support a **comma-separated allowlist**. The CORS configuration in `engine/src/index.ts` should parse this environment variable and configure the `cors` middleware to accept an array of origins.

---

## 6. Backend/API Clarifications

**Q20: In `orchestrationService` hook examples, should `processGameEvent` receive `wsHub` (not `emit`)?**

**Answer:** Yes, it should receive `wsHub`. The spec has a typo. The function signature should be `(params: { ..., wsHub?: WebSocketHub })`.

**Q21: Should all event hooks pass `wsHub` so badge-earned events are real-time for every award path?**

**Answer:** **Yes.** Ensure `wsHub` is passed down from the API layer (`playerGameRoutes`) and the command execution layer (`orchestrationService`) to `processGameEvent` in all cases.

**Q22: Should CXP awards and badge awards be in a DB transaction for atomicity?**

**Answer:** **Yes.** The `processGameEvent` function should be wrapped in a database transaction to ensure that if any part of the award logic fails, all changes (CXP and badges) for that event are rolled back.

**Q23: Is `countAuditEventsForPlayer` definitely based on `auditEvents.actorId` + `eventType`, and are those events guaranteed to exist before badge evaluation?**

**Answer:** Yes, the query is correct. **However, the order of operations is critical.** The service that triggers the event (e.g., `orchestrationService`) **must** create the `auditEvent` record *before* it calls `processGameEvent`.

**Q24: Should `/api/v2/passport/me` include game status/timers so frontend doesn’t infer flow from flags?**

**Answer:** **Yes, absolutely.** This is a critical clarification. The `/passport/me` response should be expanded to include the current `game.status` and any relevant timers (e.g., `round1EndsAt`). This makes the frontend much simpler and more robust.

**Q25: For `/api/v2/passport/link-game`, should “already linked” return current link context instead of HTTP 409?**

**Answer:** **Yes.** Change the 409 response to a 200 OK response that includes the player's existing game context. This provides a better user experience if they try to re-join.

---

## 7. Frontend Clarifications

**Q26: Is “Round 2 and deliberation coming soon” acceptable for first production release?**

**Answer:** **Yes.** This is explicitly post-MVP. A simple `WaitingView` component is sufficient for go-live.

**Q27: Where should `playerToken` be sourced/stored officially (currently noted as `localStorage` assumption)?**

**Answer:** The `playerToken` (the session token from the new auth flow) should be stored in **`localStorage`**. The Mini App SDK does not yet have a secure storage solution, and this is the standard for web apps.

**Q28: Should `BadgeEarnedModal` share link use an env-configured bot username instead of a hardcoded placeholder?**

**Answer:** **Yes.** Create a `VITE_TELEGRAM_BOT_USERNAME` variable in the `mini-app/.env` file and use it to construct the share URL dynamically.

**Q29: What is required behavior when Telegram APIs are unavailable (share, haptics, biometrics)?**

**Answer:** **Graceful degradation.** Wrap all `WebApp.*` calls in `try...catch` blocks. If an API is unavailable (e.g., in a desktop browser), the app should not crash. The action should simply fail silently (e.g., the share sheet doesn't appear).

**Q30: Is biometric emergency flow required at launch or explicitly future-only?**

**Answer:** **Explicitly future-only.** It is not part of the MVP.

---

## 8. Ops, QA, & Rollout

**Q31: What automated tests are mandatory before release (unit, integration, e2e)?**

**Answer:**
-   **Mandatory:**
    -   Unit tests for `telegramAuth.ts` validation logic.
    -   Unit tests for `gamificationService.ts` CXP and badge award logic.
    -   Integration tests for the new API endpoints (`/passport/*`, `/auth/*`).
-   **Nice-to-have:** End-to-end tests using a framework like Playwright or Cypress that can mock the Telegram `initData`.

**Q32: Who owns migration and seed execution in production, and what is rollback procedure?**

**Answer:** The **Lead Backend Engineer** is responsible for running migrations and seeds during a scheduled maintenance window. Rollback procedure is to restore the database from the pre-migration backup and redeploy the previous version of the application.

**Q33: Are there required observability events/metrics for CXP awards, badge awards, auth failures, and WebSocket delivery?**

**Answer:** **Yes.** Implement logging for the following key events:
-   `auth.success`, `auth.failure`
-   `cxp.awarded` (with amount and player ID)
-   `badge.awarded` (with badge ID and player ID)
-   `websocket.broadcast.error`

**Q34: What is the target launch date and code freeze date?**

**Answer:** To be determined by the project manager based on engineering estimates for the work outlined in the spec and this Q&A.

**Q35: Who gives final sign-off for DB, backend API, mini-app UX, and bot configuration?**

**Answer:**
-   **DB & Backend API:** Lead Backend Engineer
-   **Mini-App UX:** Project Manager / Product Owner
-   **Bot Configuration:** Project Manager / Product Owner
-   **Final Release Go/No-Go:** Project Manager / Product Owner
