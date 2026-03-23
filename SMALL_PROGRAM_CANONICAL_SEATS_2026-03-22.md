# Small Program Canonical Seats

Last updated: 2026-03-22

## Purpose

This appendix keeps the small programs, viewers, and bridge roots visible as first-class units and records the canonical seat for each.

## Scope

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`
- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`
- `/Users/paulcooper/Documents/Codex Master Folder/installer-ui`

## Canonical seats

### sovereign-jewel-web

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`

Canonical seat:

- static shell: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web/index.html`

Supporting units:

- motion layer: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web/script.js`
- style layer: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web/styles.css`
- asset pack: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web/assets`

Status:

- standalone repo pushed to standalone remote; `mainline` worktree materialized

### image-catalog-viewer

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`

Canonical seat:

- server entrypoint: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer/server.mjs`

Supporting units:

- browser client: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer/public`

Dependency note:

- depends on umbrella script line through `build_image_catalog.py`

Status:

- standalone repo pushed to standalone remote; `mainline` worktree materialized

### metacanon-code-api

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`

Canonical seat:

- API server: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api/src/server.ts`

Supporting units:

- code map layer: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api/src/codeMap.ts`
- runtime bridge layer: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api/src/runtimeControl.ts`

Dependency note:

- depends on `ffi-node`
- indirectly depends on the umbrella runtime line

Status:

- standalone repo pushed to standalone remote; `mainline` worktree materialized

### planes-of-existence-viewer

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`

Canonical seat:

- viewer lab: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/components/planes-of-existence-viewer.tsx`

Supporting units:

- Next shell: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/app/page.tsx`
- asset pipeline: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/scripts`
- Blender sources: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/blender`

Dependency hygiene note:

- local `node_modules` is symlinked to `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/node_modules`
- that is an install shortcut, not an ownership signal

Status:

- standalone repo pushed to standalone remote; `mainline` worktree materialized

### ffi-node

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`

Canonical seat:

- native bridge entrypoint: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/index.js`

Supporting units:

- command shim: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/commands.js`
- client shim: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/client.js`
- native build: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/scripts/build-native.sh`

Dependency note:

- tied directly to the umbrella Rust runtime and native addon line

Status:

- standalone repo pushed to standalone remote; `mainline` worktree materialized

### houdini-codex-mcp

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`

Canonical seat:

- server bridge: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp/server.cjs`

Supporting units:

- Houdini bootstrap: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp/plugin/pythonrc.py`

Dependency note:

- depends on MCP SDK resolution from `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/server`

Status:

- standalone repo pushed to standalone remote; `mainline` worktree materialized

### installer-ui

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/installer-ui`

Canonical seat:

- desktop app: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/desktop`

Supporting units:

- static prototype: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/prototype`
- handover pack: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/handover`
- fractal handover pack: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/metacanon-fractal-handover`

Dependency note:

- maps directly back to umbrella runtime commands in `/Users/paulcooper/Documents/Codex Master Folder/src/ui.rs`

Status:

- PrismAI installer surface with an explicit umbrella runtime dependency

- umbrella-linked implementation workspace, not an independent product family root
