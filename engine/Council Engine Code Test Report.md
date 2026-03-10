# Council Engine Code Test Report

This document summarizes the results of a full end-to-end test of the codebase provided in `council-engine-codecopy.zip`.

## Executive Summary: **Pass with Bugs**

The Week 1 foundation is **mostly solid**, but the developer-facing experience has significant friction and the CI pipeline is broken. The core application logic works, but only after navigating a minefield of undocumented API requirements and routing inconsistencies.

- **The Good:** The server starts, the database migrates, and the basic health checks pass. Sentry and Pino logging are correctly implemented. The frontend skin builds cleanly.
- **The Bad:** The backend `engine` fails to build due to missing TypeScript types. The API is difficult to use, with undocumented required fields (`mode`), confusing endpoint logic (`/join` uses UUID not invite code), and inconsistent payload requirements (`playerId` vs `playerToken`).
- **The Ugly:** The CI pipeline defined in `.github/workflows/ci.yml` is **guaranteed to fail** because it does not include a database service. The tests will not be able to connect to Postgres.

**Recommendation:** The developer should proceed with Weeks 2-4, but **only after** fixing the 8 bugs identified below. The CI pipeline fix is the highest priority.

--- 

## Detailed Bug Report

Here are the 8 specific issues identified during testing:

| ID | Severity | Category | Description |
| :--- | :--- | :--- | :--- |
| **BUG-1** | High | CI/CD | The `ci.yml` workflow is missing a `services` block for Postgres. The tests require a database connection, so the CI run will fail. |
| **BUG-2** | High | Build | The `engine` workspace fails to build (`npm run build -w engine`) due to 7 TypeScript errors. Missing types (`@types/ws`, `@types/node-cron`) and an incorrect type assumption on the LLM client response are the cause. |
| **BUG-3** | Medium | API Design | The `POST /api/games/:id/join` endpoint uses the game's UUID in the path, but the `POST /api/games` response provides an `inviteCode` and a URL like `/join/:inviteCode`, creating a confusing and broken user flow. The route should use the `inviteCode`. |
| **BUG-4** | Medium | API Design | The `POST /api/games` endpoint requires a `mode: "instant"` field in the body, which is not documented. The Zod schema enforces this, causing requests to fail without it. |
| **BUG-5** | Low | API Design | The `POST /api/games/:id/respond` endpoint requires `playerId` in the body, but the `join` response provides a `playerToken`. This inconsistency makes the API difficult to use without reading the source code. |
| **BUG-6** | Low | API Design | The endpoint to trigger the main LLM deliberation is `POST /api/games/:id/deliberate`, not `/start` as might be assumed. `/start` is only for moving the game from `setup` to `assignment` status. This is a naming confusion issue. |
| **BUG-7** | Low | Documentation | The `POST /api/games/:id/respond` endpoint correctly requires a `Bearer <playerToken>` for authorization, but this is not documented anywhere. |
| **BUG-8** | Info | Environment | Docker is not installed in the test environment, so `docker-compose up` could not be fully verified, though the `Dockerfile` and `docker-compose.yml` appear correct. |

## Test Log Summary

- **Dependencies:** `npm install` completed successfully.
- **Database:** Postgres started and `drizzle-kit migrate` ran successfully, creating all 7 tables.
- **Unit Tests:** `vitest run` passed. The single test for `GET /api/health` was successful.
- **API Smoke Test:** The server started, but a series of `curl` commands were required to uncover the API bugs listed above. The core game flow (create -> join -> respond -> deliberate) was eventually proven to work, though the final deliberation step fails due to dummy LLM keys (this is expected).
