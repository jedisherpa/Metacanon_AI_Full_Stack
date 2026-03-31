# Workspace Extraction Backlog

> Superseded by [`WORKSPACE_SOURCE_OF_TRUTH.md`](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_SOURCE_OF_TRUTH.md).
> Still useful as historical first-pass material.
> Not authoritative for new cleanup decisions.

Date: 2026-03-22
Root: `/Users/paulcooper/Documents/Codex Master Folder`

## Phase 0: Freeze The Root

- Stop using `/Users/paulcooper/Documents/Codex Master Folder` as the default cwd for product work.
- Keep umbrella repo scope to runtime / installer / workspace-management artifacts.
- Keep local excludes in place so sibling project noise does not flood umbrella git status.

Exit criteria:

- Active product work happens from repo anchors or worktrees only.

## Phase 1: Publish The Inventory

- Maintain the master inventory CSV as the local-unit source of truth.
- Maintain the lineage map as the duplication source of truth.
- Maintain the contamination matrix as the extraction risk register.
- Maintain the target matrix as the migration source of truth.

Exit criteria:

- Every active root has one family and one target destination.

## Phase 2: Extract Castle Members

- Lock Anna Phoenix V1 as the concrete seed.
- Create future standalone repo targets for Diana and Liana.
- Remove Anna carryover from Diana and Liana during extraction.
- Retire umbrella-tracked Diana/Liana only after clean standalone roots exist.

Exit criteria:

- Diana and Liana no longer live as peer realms with local contamination inside the umbrella repo.

## Phase 3: Normalize The WebGL Family

- Keep `sovereign-jewel-next`, `metacanon-ddos`, `prism-feralpharaoh`, and `metacanonai` as separate product roots.
- Promote non-repo roots:
  - `sovereign-jewel-next`
  - `metacanon-ddos`
- Keep duplicated engine lineage visible instead of pretending it does not exist.
- Do not merge separate products purely because they share code.

Exit criteria:

- Every WebGL product root is either a real repo or explicitly marked legacy/unmanaged.

## Phase 4: Normalize PrismAI

- Keep `anything-llm` as the PrismAI core product fork.
- Keep `prism-feralpharaoh` as an independent product.
- Track duplicated overlay files between the two explicitly.
- Separate core product ownership from overlay ownership inside `anything-llm`.

Exit criteria:

- PrismAI core and Prism overlay responsibilities are visible and assignable.

## Phase 5: Resolve Council / LensForge / Sphere

- Deep-pass `sphere-thread-engine`, `council-engine`, and `lensforge-app`.
- Choose canonical ownership for the shared `council-engine` lineage.
- Separate active roots from archived copies:
  - `council-engine-code-copy`
  - `council-engine-master-v2`

Exit criteria:

- Shared package identity no longer obscures repo boundaries.

## Phase 6: Promote Standalone Tooling Roots

- Decide repo fate for:
  - `metacanon-code-api`
  - `planes-of-existence-viewer`
  - `ffi-node`
  - `image-catalog-viewer`
  - `houdini-codex-mcp`
  - `sovereign-jewel-web`

Exit criteria:

- No active code-like root remains unclassified.

## Phase 7: Worktree Rollout

- Create stable worktree homes under `/Users/paulcooper/Documents/Codex Master Folder/worktrees`.
- Create one worktree per active concern.
- Assign one agent per worktree.

Exit criteria:

- Multi-agent work can proceed without shared-checkout collisions.
