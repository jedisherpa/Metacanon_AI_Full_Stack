# Website Dual-Mode Implementation Plan

## Objective

Support both:

1. Local snippet reads from user machine via installer Tauri backend.
2. Remote snippet reads via standalone cloud server (`metacanon-code-api`).

Both modes must expose the same API shape to frontend components.

## Shared Contract

Snippet lookup is ID-based (from `code-map.yaml`), never raw file path input from UI.

Response fields:

1. `id`
2. `title`
3. `subtitle`
4. `constitutional_basis`
5. `file`
6. `start_line`
7. `end_line`
8. `code`
9. `how_it_works`
10. `repo`
11. `branch`
12. `commit_sha` (optional in local mode)

## Phase 1: Local Mode (Tauri)

Repository: `metacanon-installer`

Tasks:

1. Add `get_code_snippet` Tauri command.
2. Load `code-map.yaml`, resolve snippet ID, read file from configured base path.
3. Enforce canonical root checks to prevent traversal.
4. Expose command via TypeScript API client in `desktop/src/lib/api.ts`.
5. Add Tauri unit tests for path and range validation.

## Phase 2: Cloud Mode (Server)

Repository: `metacanon-code-api`

Tasks:

1. Keep `GET /api/v1/manifest` and `GET /api/v1/snippet/:id` as canonical endpoints.
2. Add mode-aware config (`local|github`) while preserving current GitHub flow.
3. Add cache headers and timeout guards.
4. Add validation script for `code-map.yaml` in CI.

## Phase 3: Frontend Integration

Repository: website frontend (separate)

Tasks:

1. Add mode selector (`local` or `cloud`) in environment/runtime config.
2. Route snippet requests to Tauri invoke in local mode.
3. Route snippet requests to HTTP API in cloud mode.
4. Add loading/error/empty states in code panel.

## Phase 4: Delivery Controls

1. Add contract tests for response schema parity across local/cloud modes.
2. Add smoke checks for 3-5 critical snippet IDs.
3. Document environment setup in each repository README.
