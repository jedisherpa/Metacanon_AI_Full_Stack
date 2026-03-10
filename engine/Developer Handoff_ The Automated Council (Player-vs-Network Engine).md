# Developer Handoff: The Automated Council (Player-vs-Network Engine)

**Version:** 3.0
**Authored By:** Manus AI

---

## 1. Executive Summary & Goal

This document supersedes all previous development plans. The new objective is to adapt the existing, production-grade `council-engine` to support a fully automated, infinitely scalable **Player-vs-Network (PvN)** game loop. The human facilitator is removed entirely from the core loop.

The goal of this sprint is to enable a player to:
1.  Challenge an automated AI Council of four hardened lenses.
2.  Receive a synthesized, "upgraded" lens upon successful deliberation.
3.  Download this upgraded lens as a portable skill file for their local AI agent.

## 2. Core Architectural Shift: From Concierge to Auto-Mode

The `council-engine` is currently designed for a "Concierge" model, where a human facilitator manually advances the game state via API calls. We will introduce an **"Auto-Mode"** that automates this process.

| Old Model (Concierge) | New Model (Auto-Mode) |
| :--- | :--- |
| Human facilitator starts game | Player starts game via API |
| Player submits move | Player submits move |
| **Human triggers AI response** | **System instantly triggers AI response** |
| **Human triggers synthesis** | **System instantly triggers synthesis** |
| Game ends | Game ends, lens becomes downloadable |

This shift is achieved primarily by modifying the `orchestrationService.ts` to remove human-in-the-loop dependencies when a game is flagged as `auto`.

## 3. Required Codebase Modifications

This is a targeted update, not a rewrite. The work is confined to the following tasks.

### Task 3.1: Implement "Auto-Mode" Flag

1.  **Modify DB Schema:** In `engine/src/db/schema.ts`, add a new field to the `games` table:
    ```typescript
    // ... existing fields
    game_mode: text("game_mode").notNull().default("manual"), // "manual" or "auto"
    ```
2.  **Update Game Creation:** Modify the game creation endpoint (`POST /api/v2/games`) to accept a `game_mode` parameter. The PvN client will always set this to `auto`.
3.  **Modify Orchestration Service:** In `engine/src/game/orchestrationService.ts`, wrap all state-advancement logic that currently waits for an admin trigger in a conditional check:
    ```typescript
    // Example for advancing from REVEALING to CLASHING
    if (game.game_mode === "auto") {
      // Immediately enqueue the next job (e.g., generate AI clashes)
      await this.queue.add("generate-clashes", { gameId: game.id });
    } else {
      // Keep existing logic: wait for facilitator API call
    }
    ```
    This pattern must be applied to all transitions that were previously human-gated.

### Task 3.2: Create the AI Council Lens Pack

1.  **Create New Lens Pack:** Create a new file `lens-packs/ai-council-v1.json`. This file will contain the four hardened lenses that serve as the AI opponents.
2.  **Structure:** Use the same JSON structure as `hands-of-the-void.json`. The content should be authoritative, challenging, and represent four distinct, institutional perspectives (e.g., The Logician, The Ethicist, The Pragmatist, The Visionary).

### Task 3.3: Build the "Lens Download" Endpoint

1.  **Create New Endpoint:** In a new file, `engine/src/api/v2/telegramRoutes.ts` (or similar), define a new public-facing endpoint:
    `GET /api/v2/game/:id/upgraded-lens`
2.  **Logic:**
    *   The endpoint should first verify that the game (`:id`) is complete (`status === "DONE"`).
    *   It then queries the `synthesis_artifacts` table for the final synthesized lens associated with that `game_id`.
    *   It returns the `artifact_data` (the JSON lens) directly to the client.
    *   Set the `Content-Disposition` header to `attachment; filename="upgraded_lens_${game.id}.json"` to trigger a file download.

### Task 3.4: Set Up the GitHub Skill Repository

1.  **Create Public Repo:** Create a new, public GitHub repository named `open-claw-skills`.
2.  **Structure:** The repository will house the downloaded lens files. A simple structure like `/lenses/` is sufficient initially.
3.  **Instructions:** The `README.md` of this repository should provide clear, simple instructions for a user to add a new lens file to their local "Open Claw" AI agent setup.

## 4. 7-Day Sprint Plan

-   **Day 1:** Implement the `game_mode` flag in the database schema and game creation endpoint. Create the `ai-council-v1.json` lens pack.
-   **Day 2-3:** Modify the `orchestrationService.ts` to respect the `auto` flag for all state transitions.
-   **Day 4:** Build and test the `GET /api/v2/game/:id/upgraded-lens` endpoint.
-   **Day 5:** Set up the `open-claw-skills` GitHub repository with a clear `README.md`.
-   **Day 6:** Frontend work: Implement the client-side logic to call the game creation endpoint in `auto` mode and the button to download the lens.
-   **Day 7:** End-to-end testing and deployment.

## 5. Definition of Done

The sprint is complete when a developer can, via API calls or a test client:
1.  Start a new game in `auto` mode.
2.  Submit a player move.
3.  Observe the game automatically progress through all states to `DONE`.
4.  Successfully call the `upgraded-lens` endpoint and receive a valid JSON lens file.
