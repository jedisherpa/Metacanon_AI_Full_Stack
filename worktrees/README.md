# Worktrees

This directory is reserved for clean per-repo worktrees.

Current state:

- repo-backed lane scaffold has been materialized for active repo roots
- some formerly non-repo roots have now been promoted to standalone local repos
- reserved family homes may exist before a root becomes a repo, but they are not active worktrees

## Global Rules

- one agent per worktree
- one concern per worktree
- never share a dirty main checkout between multiple active agent tasks
- keep the main repo checkout as the clean anchor whenever possible
- do not create worktrees for non-repo roots until those roots are promoted to real repos

## Reserved Worktree Homes

- `worktrees/sovereign-metaverse/`
- `worktrees/anything-llm/`
- `worktrees/prism-feralpharaoh/`
- `worktrees/sovereign-jewel-next/`
- `worktrees/metacanon-ddos/`
- `worktrees/castle-member-anna/`
- `worktrees/castle-member-diana/`
- `worktrees/castle-member-liana/`
- `worktrees/sphere-thread-engine/`
- `worktrees/council-engine/`
- `worktrees/lensforge-app/`
- `worktrees/sovereign-jewel-web/`
- `worktrees/image-catalog-viewer/`
- `worktrees/metacanon-code-api/`
- `worktrees/planes-of-existence-viewer/`
- `worktrees/ffi-node/`
- `worktrees/houdini-codex-mcp/`

## Materialized Lane Scaffold

### sovereign-metaverse

- `metacanonai-main`
- `metacanonai-public`
- `metacanonai-cockpit`
- `metacanonai-subworlds`

### anything-llm

- `prismai-core`
- `prismai-frontend`
- `prismai-server`
- `prismai-desktop`
- `prismai-mobile`
- `prismai-overlay`

### prism-feralpharaoh

- `mainline`
- `product`
- `prism-hero`
- `prism-dodeca`
- `overlay`

### sovereign-jewel-next

- `mainline`

### metacanon-ddos

- `auxiliary`

### castle-member family

- `castle-member-anna/mainline`
- `castle-member-diana/mainline`
- `castle-member-liana/mainline`

### sphere-thread-engine

- `mainline`
- `engine`
- `tma`

### council and lensforge repos

- `council-engine/mainline`
- `lensforge-app/mainline`

### small-program repos

- `sovereign-jewel-web/mainline`
- `image-catalog-viewer/mainline`
- `metacanon-code-api/mainline`
- `planes-of-existence-viewer/mainline`
- `ffi-node/mainline`
- `houdini-codex-mcp/mainline`

Current state:

- `mainline` is now a real materialized worktree at `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sphere-thread-engine/mainline`
- the repo remote has been corrected to `git@github.com:jedisherpa/sphere-thread-engine.git`
- the former umbrella remote is retained as `umbrella-origin`
- `council-engine/mainline` is now a real materialized worktree at `/Users/paulcooper/Documents/Codex Master Folder/worktrees/council-engine/mainline`
- `lensforge-app/mainline` is now a real materialized worktree at `/Users/paulcooper/Documents/Codex Master Folder/worktrees/lensforge-app/mainline`
- the small-program repos above now have real `mainline` worktrees and should be treated as standalone worktree lanes

## Blocked Future Roots

These remain outside the materialized scaffold until they are real repos:

- `installer-ui` PrismAI installer surface with umbrella runtime dependency

## Important Constraint

The following local roots are not yet repos and must remain unmanaged until repo promotion is approved:

- `installer-ui` PrismAI installer surface with umbrella runtime dependency

See:

- [/Users/paulcooper/Documents/Codex Master Folder/WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv)
