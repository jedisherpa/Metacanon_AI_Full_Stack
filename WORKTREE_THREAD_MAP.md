# Worktree Thread Map

Use this file to decide which Codex thread should own a given task.

If the task starts from a live domain name instead of a repo or app name, check:

- `/Users/paulcooper/Documents/Codex Master Folder/DOMAIN_THREAD_MAP.md`

Rules:

- open the umbrella root only for orchestration, inventory, launchers, and workspace policy
- open a worktree root for real product coding
- keep one active coding concern per thread
- if a task crosses lane boundaries, route it through PM planning first

## Umbrella Orchestrator

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `root-anchor` | `/Users/paulcooper/Documents/Codex Master Folder` | Workspace inventory, provenance, launchers, Codex operating system files, cleanup planning |

## sovereign-metaverse

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `metacanonai-main` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-main` | Broad `metacanonai` integration work across app, packages, and runtime |
| `metacanonai-public` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-public` | `3002` public fortress shell, page composition, copy surfaces, and website-facing polish |
| `metacanonai-cockpit` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-cockpit` | `3011` / `3013` / `3014` workbench, cockpit, audio runtime, and scene tooling |
| `metacanonai-subworlds` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-subworlds` | Subworld runtime, scene experiments, and runtime-only changes |

## anything-llm / PrismAI

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `prismai-core` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-core` | Repo-wide PrismAI integration work |
| `prismai-frontend` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-frontend` | Frontend and embed UI changes only |
| `prismai-server` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-server` | Server, collector, and backend integration work |
| `prismai-desktop` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-desktop` | Desktop-tauri surface only |
| `prismai-mobile` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-mobile` | Mobile PrismAI app only |
| `prismai-overlay` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-overlay` | PrismAI overlay cluster only |

## installer-ui

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/installer-ui/mainline` | PrismAI installer desktop shell, handover packs, and installer-specific UX |

## prism-feralpharaoh

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/prism-feralpharaoh/mainline` | Repo-wide Prism product work |
| `product` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/prism-feralpharaoh/product` | Main product shell and routes |
| `prism-hero` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/prism-feralpharaoh/prism-hero` | PrismHero lab only |
| `prism-dodeca` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/prism-feralpharaoh/prism-dodeca` | PrismDodecahedron music lab only |
| `overlay` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/prism-feralpharaoh/overlay` | Metacanon overlay components only |

## castle members

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `anna/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/castle-member-anna/mainline` | Anna Phoenix V1 shared implementation root |
| `diana/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/castle-member-diana/mainline` | Diana peer realm app |
| `liana/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/castle-member-liana/mainline` | Liana peer realm app |

## sphere-thread-engine / council / lensforge

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `sphere-thread-engine/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sphere-thread-engine/mainline` | Repo-wide engine family work |
| `sphere-thread-engine/engine` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sphere-thread-engine/engine` | Engine-only changes |
| `sphere-thread-engine/tma` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sphere-thread-engine/tma` | TMA surfaces only |
| `council-engine/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/council-engine/mainline` | Council comparison root and archived lineage work |
| `lensforge-app/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/lensforge-app/mainline` | LensForge active root |

## WebGL auxiliaries

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `sovereign-jewel-next/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-jewel-next/mainline` | Public jewel shell, viewer, and engine work |
| `metacanon-ddos/auxiliary` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/metacanon-ddos/auxiliary` | Auxiliary DDOS declaration, verification, and duplicate-lineage work |
| `sovereign-jewel-web/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-jewel-web/mainline` | Static microsite work |

## Small Programs And Bridges

| Lane | Path | Recommended Thread Purpose |
| --- | --- | --- |
| `image-catalog-viewer/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/image-catalog-viewer/mainline` | Image catalog viewer only |
| `metacanon-code-api/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/metacanon-code-api/mainline` | Code API service only |
| `planes-of-existence-viewer/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/planes-of-existence-viewer/mainline` | Planes viewer only |
| `ffi-node/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/ffi-node/mainline` | Native bridge only |
| `houdini-codex-mcp/mainline` | `/Users/paulcooper/Documents/Codex Master Folder/worktrees/houdini-codex-mcp/mainline` | Houdini MCP bridge only |

## Default Threading Guidance

- Use the umbrella root for planning, routing, cleanup, and launcher maintenance.
- Use a product worktree for actual code changes.
- If a request mentions `3002`, default to `metacanonai-public`.
- If a request mentions `3011`, `3013`, `3014`, audio routing, cockpit, or workbench, default to `metacanonai-cockpit`.
- If a request mentions PrismAI core product behavior, default to `prismai-core`.
- If a request mentions the PrismAI installer, default to `installer-ui/mainline`.
- If a request mentions PrismHero or Prism Dodecahedron, route to the dedicated Prism lab worktree instead of `mainline`.
