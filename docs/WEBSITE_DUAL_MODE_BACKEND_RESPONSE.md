# Website Backend Response (Dual-Mode)

Source request:

- `SUBJECT_METACANON_DEVELOPER_EVALUATION_NEXT_STEPS_2026-03-05.md`

## Decision Summary

The dual-mode architecture is feasible and should be implemented with a shared snippet contract used by:

1. Local mode: a Tauri command in `metacanon-installer`.
2. Cloud mode: a standalone Node.js/Express service (`metacanon-code-api`).

## Answers To The Five Questions

### 1) Tauri Backend (`get_code_snippet`) feasibility

No major blockers.

Risks to manage:

1. Directory traversal and arbitrary file read.
2. Base path drift across developer machines.
3. Line-range mismatch when source files change.

Required controls:

1. Canonicalize and enforce a trusted `base_path` root.
2. Resolve snippets only through `code-map.yaml` IDs, not direct file paths from UI.
3. Return explicit structured errors (`snippet_not_found`, `file_not_found`, `invalid_range`).

### 2) Recommended stack for standalone cloud server

Recommended: Node.js + Express + TypeScript (continue current `metacanon-code-api` direction).

Reason:

1. Already scaffolded and aligned with current ecosystem.
2. Fastest path to production with low migration risk.
3. Easier onboarding for teams already working in TypeScript on sphere services.

### 3) Configuration for `base_path` in local vs cloud

Use explicit mode + path configuration:

1. `CODE_SNIPPET_MODE=local|github`
2. `METACANON_CORE_BASE_PATH=/abs/path/to/metacanon-core`
3. `CODE_MAP_PATH=/abs/path/to/code-map.yaml`

Local mode (Tauri):

1. Prefer user-selected base path stored in installer settings.
2. Allow env override for advanced users.

Cloud mode (server):

1. Prefer `GITHUB_OWNER/GITHUB_REPO/GITHUB_REF` for remote fetch.
2. Optional local checkout mode for staging environments with `METACANON_CORE_BASE_PATH`.

### 4) `code-map.yaml` maintenance ownership and automation

Ownership:

1. Primary: `metacanon-core` maintainers.
2. Enforcement: `metacanon-code-api` CI gate.

Automation:

1. Add CI validator that asserts:
   - each `file` exists
   - `start_line <= end_line`
   - line ranges are within file bounds
2. Add PR checklist item requiring code-map update when mapped files change.

### 5) Revised effort estimate (dual-mode)

Estimated total: `4-6 engineering days`.

Breakdown:

1. Tauri `get_code_snippet` command + contract + tests: `1-1.5 days`
2. Cloud mode hardening in `metacanon-code-api` + validation: `1-1.5 days`
3. Frontend dual-mode wiring + loading/error states: `1-1.5 days`
4. CI, docs, rollout, integration verification: `1-1.5 days`

## Recommended Next Action

Implement a shared snippet response schema in both backends first, then wire frontend mode switching on top of that stable contract.
