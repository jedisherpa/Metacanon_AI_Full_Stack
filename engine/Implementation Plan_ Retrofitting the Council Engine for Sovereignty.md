# Implementation Plan: Retrofitting the Council Engine for Sovereignty

**Date:** February 27, 2026
**To:** Council Engine Development Team
**From:** Manus AI
**Status:** **Actionable Engineering Plan**

---

### **Objective**

This document provides a detailed, step-by-step engineering plan to execute the three-phase retrofit of the Council Engine. The goal is to transform the existing monolithic web application into a decentralized, event-sourced, and cryptographically verifiable system aligned with the Sovereign Cognitive Architecture.

This plan is based on the analysis of the following documents:
*   `TheGrandUnifiedSummaryv2_FromPhilosophytoRetrofit.md`
*   `CouncilEngine—Five-PersonaAnalysis.md`
*   `pasted_file_8omCEV_SPHERE_THREAD_HANDOFF.md`
*   `pasted_file_luLGzC_SPHERE_THREAD_CAPABILITIES.md`
*   The `pentarchy-installer` and `tetra-lite-kit` codebases.

### **Phase 1: Stabilize the Sphere Thread Conductor (Priority: P0)**

**Goal:** Solidify the foundational trust layer. The Sphere Thread engine must be a reliable, production-grade service *before* we migrate any core logic to depend on it.

| Task ID | Description | Key Files & Actions | Verification | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **1.1** | **Resolve Blocking Build Error** | **File:** `db/queries.ts`. **Action:** The five-persona analysis identified a blocking TypeScript error here. This must be fixed first. | The command `pnpm build` (or equivalent) completes successfully with zero errors. | None |
| **1.2** | **Implement gRPC Transport** | **Files:** `engine/src/sphere/conductor.ts`, create `protos/sphere.proto`. **Action:** Define a protobuf service for event submission. Implement the gRPC server in the Sphere Thread conductor. Deprecate the use of internal REST calls for event writes. | A test client can successfully send a signed event envelope to the conductor via a gRPC call. | Task 1.1 |
| **1.3** | **Enforce Canonicalization** | **File:** `engine/src/sphere/conductor.ts`. **Action:** Integrate a library like `canonicalize` to enforce RFC8785 JSON Canonicalization. The signature must be generated from the canonicalized string representation of the event payload, not `JSON.stringify`. | A unit test proves that two event objects with identical data but different key order produce the exact same signature hash. | Task 1.2 |

**Success Criterion for Phase 1:**
> A dedicated integration test suite can perform the following cycle without failure: (1) A gRPC client sends a structured event to the Sphere Thread conductor. (2) The conductor validates the signature, canonicalizes the payload, generates its own signature, and persists the event to the `sphere_events` table in Postgres. (3) The test can query the database and verify the integrity and format of the stored event.

---

### **Phase 2: Extract the Deliberation Engine (Priority: P1)**

**Goal:** Decouple the core deliberation state machine from all web server, real-time, and database-specific concerns. This creates a portable, sovereign "brain".

| Task ID | Description | Key Files & Actions | Verification | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **2.1** | **Isolate the Engine Logic** | **Action:** Create a new, self-contained package (e.g., `packages/deliberation-engine`). Move the core state transition logic from the existing Express routes and services into this new package. | The new package has zero direct dependencies on `express`, `ws` (WebSockets), or any user authentication middleware. | Phase 1 Complete |
| **2.2** | **Define Event-Sourced API** | **File:** `packages/deliberation-engine/index.js` (or `.ts`). **Action:** The primary export of this package must be a pure function, e.g., `processThread(currentState, events)`. It takes the last known state and an array of new events, and returns the new state. | A unit test can call `processThread` with a mock state and a mock event, and assert that the returned state is correct, all without needing a database or web server. | Task 2.1 |
| **2.3** | **Create a Replay Function** | **File:** `packages/deliberation-engine/replay.js` (or `.ts`). **Action:** Create a function `replayFromGenesis(events)` that takes an ordered array of all events in a thread and reduces them using `processThread` to calculate the final, authoritative state. | A unit test with a sequence of 10 events, when passed to `replayFromGenesis`, produces the identical final state as applying the events one by one. | Task 2.2 |

**Success Criterion for Phase 2:**
> We have a portable `deliberation-engine` library. A new test suite can fetch all events for a given `thread_id` from the Sphere Thread ledger, pass them to the `replayFromGenesis` function, and receive a final state object that is 100% correct and consistent, proving the logic is fully decoupled and deterministic.

---

### **Phase 3: Kill the Mutable State & Rewire the API (Priority: P2)**

**Goal:** Make the Sphere Thread the one and only source of truth for deliberation state, completing the transition to an event-sourced architecture.

| Task ID | Description | Key Files & Actions | Verification | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **3.1** | **Deprecate Direct DB Writes** | **Action:** Systematically search the codebase for all `UPDATE` or `INSERT` statements that modify deliberation state tables (e.g., `deliberations`, `player_positions`). Replace them with calls that generate a new event and submit it to the Sphere Thread engine (via the new gRPC interface). | A code audit confirms that no application logic outside of the Sphere Thread conductor itself writes to the core deliberation state tables. | Phase 2 Complete |
| **3.2** | **Refactor State Loading** | **Files:** All API routes that currently read from deliberation tables (e.g., `GET /api/v1/deliberations/:id`). **Action:** These routes must be rewritten. To get the current state, they must now: (1) Fetch the full event history for the thread from Sphere Thread. (2) Use the `replayFromGenesis` function from the new library to calculate the current state in memory. | An API call to get the state of a deliberation returns a state object that is identical to the one produced by the offline replay test in Phase 2. | Task 2.3, 3.1 |
| **3.3** | **Adapt API for Telegram App** | **Files:** The Express API routes that will serve the new Telegram Mini App. **Action:** Simplify these routes. They are no longer state managers. They are simple clients that either (a) submit new events from the user to the Sphere Thread engine or (b) fetch and replay a thread to provide a read-only view of the current state. | The Telegram Mini App can successfully send a user action, have it ledgered in Sphere Thread, and then refresh to show the updated state calculated from the event log. | Task 3.2 |

**Success Criterion for Phase 3:**
> The old deliberation state tables in Postgres are marked as deprecated and are no longer written to. The entire application—from user interaction in the Telegram app to the final state display—operates exclusively on the event stream from the Sphere Thread ledger. The system is now verifiably sovereign.
