# Workspace Family Assignment V2

Date: 2026-03-22  
Workspace root: `/Users/paulcooper/Documents/Codex Master Folder`

This family map is downstream of the provenance census. It does not replace the provenance ledger; it summarizes the current family assignments after origin and lineage were checked.

Authoritative inputs:

- `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_ROOT_CENSUS_2026-03-22.csv`
- `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_UNIT_CENSUS_2026-03-22.csv`
- `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_PROVENANCE_LEDGER_2026-03-22.md`

## Assignment Rules

- Every local root belongs to exactly one family in the local-unit view.
- A unit can participate in multiple lineage relationships without changing its local family.
- Small programs keep their own root identity even when they share themes with larger families.
- Archives and code copies stay visible as archive family members until explicitly retired.

## Family Map

### 1. Umbrella runtime and installer

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder`

Included roots:

- `/Users/paulcooper/Documents/Codex Master Folder`
- `/Users/paulcooper/Documents/Codex Master Folder/installer-ui`

Core units:

- umbrella runtime crate
- umbrella installer CLI
- umbrella installer command surface
- umbrella provider adapters
- umbrella torus and sub-sphere runtime
- umbrella FFI bridge
- installer-ui desktop app
- installer-ui prototype
- installer-ui handover packs

Boundary note:

- This family owns the runtime and installer line only. It does not own the other product roots just because they live in the same parent folder.

### 2. Castle members

Canonical implementation baseline:

- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`

Contract seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md`

Included roots:

- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`
- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

Status by root:

- `castle-member-anna`
  - peer realm and current shared implementation root
- `castle-member-diana`
  - peer realm; umbrella-tracked; current local tree still carries shared-root contamination
- `castle-member-liana`
  - peer realm; umbrella-tracked; current local tree still carries shared-root contamination

Key rule:

- The metaverse plan provides the contract.
- Anna Phoenix V1 provides the current shared implementation root.
- Diana and Liana are categorized as peers to Anna, not subordinate products.
- The contamination language describes current code state, not family rank.

### 3. WebGL family

Canonical active Metacanon seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

Included roots:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse`

Important local-unit seats inside this family:

- jewel public shell
- jewel geometry viewer lab
- jewel breakup engine
- DDOS declaration shell
- DDOS constitution and verification pipeline
- Prism Hero lab
- Prism Dodecahedron music lab
- Prism control-center surfaces
- metacanonai public fortress shell
- metacanonai workbench and citadel runtime

Important lineage note:

- `metacanon-ddos` stays in the WebGL family as its own local root even though it carries fork lineage from `sovereign-jewel-next`.
- `prism-feralpharaoh` stays in the WebGL family as an independent product and is managed completely separately from `anything-llm`.
- `sovereign-jewel-web` stays visible as a separate static microsite root.

### 4. PrismAI / AnythingLLM

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`

Included roots:

- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`

Core units:

- frontend
- server
- collector
- desktop-tauri
- browser-extension
- embed
- mobile PrismAI app
- Metacanon data pack
- cloud deployments

Critical lineage note:

- Historical file overlap with `prism-feralpharaoh` remains recorded in the provenance ledger.
- That overlap does not change current product ownership, worktrees, or cleanup lanes.

### 5. Council / LensForge / Sphere

Current active roots:

- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`

Archive members:

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

Current state:

- `sphere-thread-engine`
  - only member with a standalone git repo
- `council-engine`
  - active unmanaged root
- `lensforge-app`
  - active unmanaged root with distinct `tma` surface
- code-copy roots
  - archive only

Critical lineage note:

- shared package identities still show this family is not fully normalized

### 6. Standalone tools and services

Included roots:

- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`

Why this is a separate family:

- These roots are small but real.
- They have their own entrypoints.
- They are easy to lose if the workspace is discussed only as major product families.

### 7. Archives and legacy copies

Included non-source roots:

- `/Users/paulcooper/Documents/Codex Master Folder/About Paul`
- `/Users/paulcooper/Documents/Codex Master Folder/Council Shared Folder`
- `/Users/paulcooper/Documents/Codex Master Folder/decomposition`
- `/Users/paulcooper/Documents/Codex Master Folder/deliverables`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

Rule:

- These stay in the workspace map, but they are not active product roots.

## Cross-Family Lineage That Must Stay Explicit

### A. Castle-member lineage

- implementation baseline:
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- contract source:
  - `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md`

### B. Prism overlay lineage

- local upstream seat:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`
- independent product copy:
  - `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src`

Current management rule:

- treat these as completely separate products
- keep separate worktrees
- keep separate extraction and cleanup backlogs

### C. Jewel to DDOS lineage

- local parent line:
  - `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`
- local forked root:
  - `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`

### D. Runtime bridge lineage

- umbrella Rust runtime:
  - `/Users/paulcooper/Documents/Codex Master Folder/src`
- Node bridge:
  - `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- API bridge:
  - `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`

### E. Houdini bridge dependency

- bridge root:
  - `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`
- dependency source:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/server`

## Immediate Operating Use

Use this family map only after checking the provenance ledger.

Practical rule set:

- choose worktrees by family and product concern
- do not treat the umbrella root as a product family catch-all
- do not merge roots just because they share code
- do not archive small roots silently
- do not extract peer realms with unresolved local contamination until their provenance story is approved
