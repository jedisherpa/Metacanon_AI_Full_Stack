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

- `mainline`

### castle-member family

- `castle-member-anna/mainline`
- `castle-member-diana/mainline`
- `castle-member-liana/mainline`

### sphere-thread-engine

- `mainline`
- `engine`
- `tma`

## Blocked Future Roots

These remain outside the materialized scaffold until they are real repos:

- `council-engine`
- `lensforge-app`
- `metacanon-code-api`
- `planes-of-existence-viewer`
- `ffi-node`
- `image-catalog-viewer`
- `houdini-codex-mcp`
- `sovereign-jewel-web`

## Important Constraint

The following local roots are not yet repos and must remain unmanaged until repo promotion is approved:

- `council-engine`
- `lensforge-app`
- `metacanon-code-api`
- `planes-of-existence-viewer`
- `ffi-node`
- `image-catalog-viewer`
- `houdini-codex-mcp`

See:

- [/Users/paulcooper/Documents/Codex Master Folder/WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv)
