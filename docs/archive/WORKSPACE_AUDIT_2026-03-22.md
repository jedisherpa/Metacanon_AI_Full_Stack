# Codex Master Folder Workspace Audit

> Superseded by [`WORKSPACE_SOURCE_OF_TRUTH.md`](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_SOURCE_OF_TRUTH.md).
> Still useful as historical first-pass material.
> Not authoritative for new cleanup decisions.

Date: 2026-03-22
Root: `/Users/paulcooper/Documents/Codex Master Folder`

## Executive Summary

`Codex Master Folder` is a workspace container holding multiple product families, not a single product repo.

Locked decisions:

- The umbrella repo at `/Users/paulcooper/Documents/Codex Master Folder` is a real runtime/installer repo.
- That umbrella repo must stop being the default cwd for product work.
- The castle-member implementation baseline is Anna Phoenix V1 in `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`.
- The metaverse repo provides the castle-member contract in docs, not the concrete template implementation.
- The WebGL family must be inventoried below repo level.
- The master inventory uses both views:
  - local unit view
  - lineage view
- `prism-feralpharaoh` is treated as an independent product even though it shares duplicated Prism/Metacanon overlay files with `anything-llm`.

## Authoritative Cleanup Artifacts

- Master inventory: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_MASTER_INVENTORY_2026-03-22.csv`
- Lineage map: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_LINEAGE_MAP_2026-03-22.md`
- Contamination matrix: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_CONTAMINATION_MATRIX_2026-03-22.md`
- Target repo/worktree matrix: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_TARGET_MATRIX_2026-03-22.md`
- Extraction backlog: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_EXTRACTION_BACKLOG_2026-03-22.md`
- Worktree operating rules: `/Users/paulcooper/Documents/Codex Master Folder/worktrees/README.md`

## Confirmed Family Boundaries

### Umbrella Runtime / Installer

- Root repo: `/Users/paulcooper/Documents/Codex Master Folder`
- Remote: `git@github.com:jedisherpa/Metacanon_AI_Full_Stack.git`
- Current branch at audit time: `codex/diana-website-publish`
- Intended long-term contents:
  - runtime / installer code
  - intentional umbrella-level scripts
  - workspace-management docs

### Castle Members

- Concrete baseline: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- Baseline remote: `https://github.com/jedisherpa/so-ive-been-busy.git`
- Metaverse contract source:
  - `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md`
- Important correction:
  - the current local `sovereign-metaverse` checkout does not contain a concrete `castle-member-template` codebase
  - it contains only the planning contract for one
- Peer realms with local contamination:
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

### WebGL Family

Separate product roots:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

Important corrections:

- `sovereign-jewel-next` and `metacanon-ddos` are separate local app roots with duplicated jewel/breakup/asset-pipeline lineage.
- `metacanon-ddos` currently carries the same package identity as `sovereign-jewel-next`.
- `prism-feralpharaoh` is not just a WebGL lab. It includes:
  - product shell
  - Metacanon control-center surfaces
  - Prism Hero lab
  - Prism Dodecahedron lab
- `metacanonai` is the current canonical Metacanon app in the metaverse monorepo.

### PrismAI / AnythingLLM

- Core product fork:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`
- Internal sub-products:
  - frontend
  - server
  - collector
  - desktop-tauri
  - mobile PrismAI app
  - Metacanon / Prism overlay
  - Metacanon data / docs / scripts

Important correction:

- The Prism/Metacanon overlay files duplicated in `prism-feralpharaoh` are also present inside:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`

### Council / LensForge / Sphere

Overlapping family members:

- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`

Important correction:

- All three currently present themselves as `council-engine` at the package level.
- `sphere-thread-engine` is the only one of the three that is a standalone git repo today.

## Immediate Operating Rules

- Do not use `/Users/paulcooper/Documents/Codex Master Folder` as the default coding cwd for product work.
- Use one repo anchor per product family.
- Use one worktree per agent.
- Do not move or delete source roots until the inventory and target matrix are approved.
- Treat non-repo app roots as unmanaged until they are either promoted to repos or explicitly archived.

## Status Of This Pass

- No source code was moved.
- No product runtime APIs were changed.
- This pass adds workspace-management artifacts only.
