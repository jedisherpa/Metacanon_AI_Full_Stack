# Workspace Source Of Truth

Last updated: 2026-03-22  
Workspace root: `/Users/paulcooper/Documents/Codex Master Folder`

This is the authoritative workspace document.

If this file conflicts with older workspace cleanup documents, this file wins.

## 1. Authority

### Purpose

This document is the canonical starting point for understanding, cleaning up, and eventually restructuring the entire `Codex Master Folder` workspace.

It is intended to answer four questions in one place:

1. What code roots exist here right now?
2. Where did each root come from?
3. How should each root be grouped and managed now?
4. What documentation and planning steps still need to happen before any source movement begins?

### Precedence Rules

Document precedence is:

1. `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_SOURCE_OF_TRUTH.md`
2. Provenance-reset appendices:
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_ROOT_CENSUS_2026-03-22.csv`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_UNIT_CENSUS_2026-03-22.csv`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_PROVENANCE_LEDGER_2026-03-22.md`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_ORPHAN_AND_STRAGGLER_MATRIX_2026-03-22.md`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_FAMILY_ASSIGNMENT_V2_2026-03-22.md`
3. Historical first-pass artifacts:
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_AUDIT_2026-03-22.md`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_MASTER_INVENTORY_2026-03-22.csv`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_LINEAGE_MAP_2026-03-22.md`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_CONTAMINATION_MATRIX_2026-03-22.md`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_TARGET_MATRIX_2026-03-22.md`
   - `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_EXTRACTION_BACKLOG_2026-03-22.md`

### What “authoritative” means

This document is authoritative for:

- root and family naming
- cleanup terminology
- current canonical ownership decisions
- what is considered active source versus archive material
- which appendices are evidence-bearing and current

This document is not a source-movement plan by itself. It does not authorize repo rewrites, extractions, or promotions.

### Frozen Decisions

- `Codex Master Folder` is a workspace container, not a single product.
- The umbrella repo at `/Users/paulcooper/Documents/Codex Master Folder` is a real runtime and installer repo.
- The umbrella repo must not be the default cwd for product work.
- Anna, Diana, and Liana are peer castle-member realms.
- Anna Phoenix V1 is the current shared implementation root for the castle-member peer realm family.
- The metaverse repo supplies the castle-member contract in docs, not the concrete implementation template.
- `anything-llm` and `prism-feralpharaoh` are separate products.
- Historical overlap between `anything-llm` and `prism-feralpharaoh` is provenance only and does not change current product ownership.
- `sovereign-jewel-web` is its own static microsite root.
- The umbrella Rust torus and sub-sphere runtime is its own real code line.

### Operating Guardrails

- Do not move source roots during this documentation phase.
- Do not promote non-repo roots into repos during this documentation phase.
- Do not extract Diana or Liana during this documentation phase.
- Do not merge product roots just because they share code.
- Keep small programs visible.
- Keep archive copies visible, but marked as non-source.

## 2. Workspace Model

### Workspace container vs product roots

`/Users/paulcooper/Documents/Codex Master Folder` is the container. Inside it live multiple product roots, tools, viewers, archives, and handover packs.

The container itself is also a real code root because it owns:

- the umbrella Rust runtime
- the installer CLI
- the installer command surface
- the FFI bridge line
- installer-oriented scripts

### What counts as a root

A top-level directory is treated as a root candidate if it has any of:

- `.git`
- `package.json`
- `Cargo.toml`
- `README.md` plus code entrypoints
- static web entrypoints like `index.html`, `script.js`, and `styles.css`

### What counts as a unit

A smallest stable unit is any ownership boundary that can be planned or moved independently, including:

- user-facing shell
- WebGL lab
- engine or library
- asset pipeline
- API or service layer
- bridge layer
- data or docs pack if independently maintainable
- archive copy if it contains code worth preserving

### Evidence ladder for provenance

Provenance is derived in this order:

1. local git history
2. local git remote or upstream
3. package name and build system
4. README or planning docs
5. duplicate-file lineage
6. archive or code-copy evidence
7. structural inference only when nothing stronger exists

## 3. Canonical Decisions

### Castle members

- Anna, Diana, and Liana are peer castle-member realms.
- Anna Phoenix V1 is the current shared implementation root.
- Diana and Liana are not subordinate products.
- Current contamination in Diana and Liana describes local code state, not family rank.

### Metaverse contract

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md` is the castle-member contract seat.
- It is not the concrete castle-member implementation template in the current local workspace.

### PrismAI and prism-feralpharaoh

- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm` is the PrismAI core product fork.
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh` is a separate product.
- Historical duplicate files between them remain documented as provenance only.

### Small programs

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web` is its own static microsite root.
- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer` is its own small tool root.
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer` is its own viewer root.
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api` is its own service root.
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node` is its own bridge root.
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp` is its own bridge root.

### Umbrella runtime line

- `/Users/paulcooper/Documents/Codex Master Folder/src/torus.rs`
- `/Users/paulcooper/Documents/Codex Master Folder/src/sub_sphere_torus.rs`
- `/Users/paulcooper/Documents/Codex Master Folder/src/sub_sphere_manager.rs`
- `/Users/paulcooper/Documents/Codex Master Folder/src/task_sub_sphere.rs`

These belong to the umbrella runtime line and are not workspace residue.

## 4. Root Registry Summary

| Root Name | Absolute Path | Root Type | Current Role | Current Status | Family | Target Repo / Worktree | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex-master-folder | `/Users/paulcooper/Documents/Codex Master Folder` | git repo + runtime root | umbrella runtime and installer anchor | active canonical umbrella root | umbrella runtime / installer | `Codex Master Folder` / `root-anchor` | 0.98 |
| anything-llm | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm` | git repo | PrismAI core product fork | active canonical product root | PrismAI / AnythingLLM | `anything-llm` / `prismai-core` | 0.97 |
| castle-member-anna | `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna` | git repo | Anna peer realm and shared implementation root | active canonical castle-member root | castle members | `castle-member-anna` / `mainline` | 0.94 |
| castle-member-diana | `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana` | git repo | Diana peer realm sharing Anna-root lineage | active standalone local repo; umbrella detachment staged | castle members | `castle-member-diana` / `mainline` | 0.97 |
| castle-member-liana | `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana` | git repo | Liana peer realm sharing Anna-root lineage | active standalone local repo; umbrella detachment staged | castle members | `castle-member-liana` / `mainline` | 0.97 |
| prism-feralpharaoh | `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh` | git repo | independent Prism product | active separate product root | WebGL family | `prism-feralpharaoh` / `mainline` | 0.91 |
| sovereign-metaverse | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse` | git monorepo | canonical metaverse monorepo | active canonical product root | WebGL family | `sovereign-metaverse` / `metaverse-anchor` | 0.98 |
| sphere-thread-engine | `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine` | git repo | sphere-thread or council-engine family repo | active overlapping family member with corrected standalone remote | Council / LensForge / Sphere | `sphere-thread-engine` / `mainline` | 0.84 |
| sovereign-jewel-next | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next` | git repo | Sovereign Jewel shell and viewer labs | active standalone local repo; umbrella detach pending | WebGL family | `sovereign-jewel-next` / `mainline` | 0.96 |
| metacanon-ddos | `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos` | git repo | DDOS-related auxiliary declaration and verification line | active standalone local auxiliary repo; canonical live site remains remote `main` | WebGL family | `metacanon-ddos` / `auxiliary` | 0.98 |
| sovereign-jewel-web | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web` | git repo | Sovereign Jewel cinematic microsite | standalone repo pushed to standalone remote; `mainline` worktree materialized | WebGL family | `sovereign-jewel-web` / `mainline` | 0.96 |
| image-catalog-viewer | `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer` | git repo | image catalog viewer | standalone repo pushed to standalone remote; `mainline` worktree materialized | standalone tools / services | `image-catalog-viewer` / `mainline` | 0.97 |
| metacanon-code-api | `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api` | git repo | code snippet and runtime API | standalone repo pushed to standalone remote; `mainline` worktree materialized | standalone tools / services | `metacanon-code-api` / `mainline` | 0.97 |
| planes-of-existence-viewer | `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer` | git repo | 3D planes viewer | standalone repo pushed to standalone remote; `mainline` worktree materialized | standalone tools / services | `planes-of-existence-viewer` / `mainline` | 0.95 |
| ffi-node | `/Users/paulcooper/Documents/Codex Master Folder/ffi-node` | git repo | Node bridge for native runtime | standalone repo pushed to standalone remote; `mainline` worktree materialized | standalone tools / services | `ffi-node` / `mainline` | 0.96 |
| houdini-codex-mcp | `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp` | git repo | Houdini MCP bridge | standalone repo pushed to standalone remote; `mainline` worktree materialized | standalone tools / services | `houdini-codex-mcp` / `mainline` | 0.95 |
| installer-ui | `/Users/paulcooper/Documents/Codex Master Folder/installer-ui` | handover workspace | installer desktop shell and handover packs | active umbrella-linked root | umbrella runtime / installer | `Codex Master Folder` / `umbrella-installer-ui` | 0.95 |
| council-engine | `/Users/paulcooper/Documents/Codex Master Folder/council-engine` | monorepo root | council engine active root | active unmanaged root | Council / LensForge / Sphere | future `council-engine` / `council-engine` | 0.84 |
| lensforge-app | `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app` | monorepo root | LensForge active root | active unmanaged root | Council / LensForge / Sphere | future `lensforge-app` / `lensforge-app` | 0.87 |
| council-engine-code-copy | `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy` | archive copy root | archived council-engine copy | archive only | archives and legacy copies | archive only | 0.90 |
| council-engine-master-v2 | `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2` | archive copy root | archived council-engine master v2 copy | archive only | archives and legacy copies | archive only | 0.91 |

## 5. Family Assignment

### Umbrella runtime / installer

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder`

This family owns the MetaCanon runtime and installer line. It does not own the product roots around it just because they sit in the same parent folder.

### Castle members

Canonical shared implementation root:

- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`
- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

These are peer realms. Diana and Liana are now standalone local repos, and they are not subordinate products.

### WebGL family

Canonical active Metacanon seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse`

This family is theme-related and lineage-related, but still contains distinct product roots and small programs.

### PrismAI / AnythingLLM

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`

This is a separate product family from `prism-feralpharaoh`, even where historical file overlap remains.

### Council / LensForge / Sphere

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`

These remain overlapping and not fully normalized.

### Standalone tools / services

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`

These stay visible as first-class roots.

### Archives and legacy copies

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/About Paul`
- `/Users/paulcooper/Documents/Codex Master Folder/Council Shared Folder`
- `/Users/paulcooper/Documents/Codex Master Folder/decomposition`
- `/Users/paulcooper/Documents/Codex Master Folder/deliverables`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

## 6. Per-Family Breakdown

### Umbrella runtime / installer

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder`

Major stable units:

- runtime crate: `/Users/paulcooper/Documents/Codex Master Folder/src/lib.rs`
- installer CLI: `/Users/paulcooper/Documents/Codex Master Folder/src/main.rs`
- installer command surface: `/Users/paulcooper/Documents/Codex Master Folder/src/ui.rs`
- provider adapters: `/Users/paulcooper/Documents/Codex Master Folder/src/providers`
- torus and sub-sphere runtime: `/Users/paulcooper/Documents/Codex Master Folder/src/torus.rs`, `/Users/paulcooper/Documents/Codex Master Folder/src/sub_sphere_torus.rs`
- FFI bridge: `/Users/paulcooper/Documents/Codex Master Folder/src/ffi_bridge.rs`
- installer script: `/Users/paulcooper/Documents/Codex Master Folder/scripts/install_metacanon.sh`
- installer UI root: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui`

Contamination or duplication notes:

- none at the code-lineage level
- the umbrella repo became overloaded as a workspace container and must not be used as the default product cwd

Current intended destination:

- stay as umbrella runtime / installer anchor

### Castle members

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`

Member roots:

- Anna: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- Diana: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`
- Liana: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

Major stable units:

- Anna world feature: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna/client/src/features/anna`
- Anna sections shell: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna/client/src/components/sections`
- Anna server runtime: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna/server`
- Anna shared runtime: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna/shared`
- Anna source pack: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna/source/anna`
- Diana world feature: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana/client/src/features/diana`
- Liana world feature: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana/client/src/features/liana`

Contamination or duplication notes:

- Diana Anna carryover was removed on 2026-03-22
- Liana Anna source carryover was removed on 2026-03-22
- the contract seat is `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md`

Current intended destination:

- Anna stays canonical shared implementation root
- Diana stays its own repo / worktree
- Liana stays its own repo / worktree

### WebGL family

Canonical active root:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

#### sovereign-jewel-next

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`

Major stable units:

- public shell: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/components/sovereign-jewel-app.tsx`
- platonic geometry viewer lab: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/components/geometry-viewer.tsx`
- scene shell: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/components/jewel-scene.tsx`
- breakup engine: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/components/object-breakup.tsx`
- dodecahedron breakup: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/components/dodecahedron-breakup.tsx`
- geometry and shard libs: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/lib`
- Blender and script pipeline: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/blender`, `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/scripts`
- master plan docs: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/docs/sovereign-journey-master-plan.md`

Notes:

- this is the clearest local seat for the platonic solid viewer line
- standalone local repo initialized on 2026-03-22

#### metacanon-ddos

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`

Major stable units:

- declaration shell: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/declaration-experience.tsx`
- constitution / verification layer: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/constitution-renderer.tsx`, `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/verify-panel.tsx`
- API / Prisma layer: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/app/api`, `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/prisma`
- duplicated jewel engine: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/object-breakup.tsx`
- duplicated geometry viewer: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/geometry-viewer.tsx`
- duplicated library line: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/lib`
- duplicated Blender and script pipeline: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/blender`, `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/scripts`

Notes:

- package identity has been corrected to `metacanon-ddos`
- docs still copy the jewel plan line
- standalone local repo initialized on 2026-03-22
- remote `origin/main` remains the canonical live DDOS site
- local extraction is auxiliary only and is currently pushed to `origin/codex/standalone-repo-extraction`

#### prism-feralpharaoh

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh`

Major stable units:

- product shell: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/Main`
- Metacanon control-center surface: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/MetacanonAI`
- Metacanon lab surface: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/MetacanonAILab`
- Prism Hero lab: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero`
- Prism Dodecahedron music lab: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismDodecahedron`
- overlay components: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/components/Metacanon`
- shared interaction layer: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/PrismContext.jsx`

Notes:

- separate product from `anything-llm`
- historical duplicate lineage remains documented only as provenance
- separate repo and runtime from `sovereign-metaverse/apps/metacanonai`
- any relation to `sovereign-metaverse/apps/metacanonai` is limited to basic WebGL code used as a basis for `metacanonai.com`
- this pass found no direct duplicate-file overlap between the Prism Hero, Prism Dodecahedron, or MetacanonAI page trees and the current `metacanonai` app/component trees
- current repo state is dirty, so no source extraction or movement should be attempted from this root in the current lane

#### sovereign-metaverse / metacanonai

Monorepo root:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse`

Canonical Metacanon app:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

Major stable units:

- public fortress shell: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/page.tsx`
- workbench family: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/%5F%5Fworkbench`
- subworld runtime: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/components/subworlds`
- citadel runtime layer: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/lib/workbench`
- API layer: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/api`

Important note:

- populated workbench routes currently live under encoded path `app/%5F%5Fworkbench`
- empty sibling `app/__workbench` also exists and is clutter
- separate repo and runtime from `prism-feralpharaoh`
- this pass found no direct duplicate-file overlap between the current `metacanonai` app/component trees and the Prism Hero, Prism Dodecahedron, or MetacanonAI page trees
- current repo state is dirty, so no source extraction or movement should be attempted from this root in the current lane
- any relationship to `prism-feralpharaoh` should be treated as limited to basic WebGL code used as a basis for `metacanonai.com`
- no broader relationship should be inferred between `prism-feralpharaoh` and the rest of the `sovereign-metaverse` monorepo or the rest of the `metacanonai` implementation beyond that basis
- detailed evidence is recorded in `WEBGL_BASIS_MAP_METACANONAI_2026-03-22.md`

#### Additional small WebGL roots

- `sovereign-jewel-web`: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`

Current intended destination:

- keep product roots separate
- normalize provenance before any source movement

### PrismAI / AnythingLLM

Canonical root:

- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`

Major stable units:

- frontend: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend`
- server: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/server`
- collector: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/collector`
- desktop-tauri: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/desktop-tauri`
- browser extension: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/browser-extension`
- embed surface: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/embed`
- mobile PrismAI app: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/mobile-ios/PrismAI`
- Metacanon data pack: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/data/metacanon`
- overlay cluster: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`

Contamination or duplication notes:

- historical overlap with `prism-feralpharaoh` stays documented in appendices only

Current intended destination:

- keep as separate product family and canonical PrismAI fork

### Council / LensForge / Sphere

Canonical root:

- no single family root is locked

Canonical active seats:

- active engine seat: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine/engine`
- active Council Nebula skin seat: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine/skins/council-nebula`
- active LensForge seat: `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app/tma`

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`

Major stable units:

- core engine lines: each root’s `engine/`
- council nebula skin lines: each root’s `skins/council-nebula`
- LensForge TMA surfaces: `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app/tma`, `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine/tma`
- governance and lens packs: each root’s `governance/` and `lens-packs/`

Contamination or duplication notes:

- shared package identity still says `council-engine`
- only `sphere-thread-engine` is currently a real repo root
- `sphere-thread-engine/tma` is inherited overlap, not the canonical LensForge seat
- `council-engine` remains a live unmanaged comparison root, not an archive
- `sphere-thread-engine` now has a standalone remote and a materialized `mainline` worktree
- detailed evidence is recorded in `COUNCIL_LENSFORGE_SPHERE_DECOMPOSITION_2026-03-22.md`

Current intended destination:

- keep roots separate
- use the canonical active seats above for planning
- no repo movement until the remaining remote/worktree hygiene is approved

### Standalone tools / services

Detailed evidence is recorded in `SMALL_PROGRAM_CANONICAL_SEATS_2026-03-22.md`.

#### image-catalog-viewer

- root: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- canonical seat: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer/server.mjs`
- server: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer/server.mjs`
- client: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer/public`
- status: standalone repo pushed to standalone remote; `mainline` worktree materialized

#### planes-of-existence-viewer

- root: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- canonical seat: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/components/planes-of-existence-viewer.tsx`
- viewer lab: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/components/planes-of-existence-viewer.tsx`
- asset pipeline: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer/scripts`
- status: standalone repo pushed to standalone remote; `mainline` worktree materialized

#### metacanon-code-api

- root: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- canonical seat: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api/src/server.ts`
- server: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api/src/server.ts`
- runtime bridge layer: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api/src/runtimeControl.ts`
- status: standalone repo pushed to standalone remote; `mainline` worktree materialized

#### ffi-node

- root: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- canonical seat: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/index.js`
- native bridge: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/index.js`
- build script: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node/scripts/build-native.sh`
- status: standalone repo pushed to standalone remote; `mainline` worktree materialized

#### houdini-codex-mcp

- root: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`
- canonical seat: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp/server.cjs`
- server: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp/server.cjs`
- plugin bootstrap: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp/plugin/pythonrc.py`
- status: standalone repo pushed to standalone remote; `mainline` worktree materialized

Current intended destination:

- retain as separate small program or bridge roots, with standalone remotes and materialized `mainline` worktrees now in place
- treat `installer-ui` as umbrella-linked rather than a standalone product family

### Archives and legacy copies

Canonical root:

- none

Member roots:

- `/Users/paulcooper/Documents/Codex Master Folder/About Paul`
- `/Users/paulcooper/Documents/Codex Master Folder/Council Shared Folder`
- `/Users/paulcooper/Documents/Codex Master Folder/decomposition`
- `/Users/paulcooper/Documents/Codex Master Folder/deliverables`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

Major stable units:

- archived council-engine engine and skin copy
- archived council-engine master-v2 engine, skin, and conductor layer

Current intended destination:

- archive only until explicitly retired or mined for provenance

## 7. Lineage and Duplication

### Castle-member shared implementation root

- shared implementation root: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- peer realms using that root line:
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

### Jewel to DDOS auxiliary lineage

- local parent line: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`
- local auxiliary related root: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`
- duplicated units:
  - breakup engine
  - geometry viewer
  - geometry and shard libs
  - Blender pipeline
  - script pipeline
  - jewel planning docs

### AnythingLLM to prism historical overlay overlap

- local upstream overlay seat: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`
- separate product copy: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src`
- management rule:
  - treat as separate products
  - separate worktrees
  - separate cleanup lanes

### Umbrella runtime to ffi-node to metacanon-code-api

- umbrella runtime root: `/Users/paulcooper/Documents/Codex Master Folder/src`
- Node bridge: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- API service: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`

### houdini-codex-mcp dependency on anything-llm/server

- bridge root: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`
- declared dependency seat: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/server`

### Council / LensForge / Sphere shared lineage

- active roots:
  - `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
  - `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
  - `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`
- archive copies:
  - `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
  - `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`
- family issue:
  - shared package identity and overlapping structure still obscure canonical ownership

## 8. Orphans, Stragglers, and Archives

### Small programs and easy-to-lose roots

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`
- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`

### Archive and non-source roots

- `/Users/paulcooper/Documents/Codex Master Folder/deliverables`
- `/Users/paulcooper/Documents/Codex Master Folder/About Paul`
- `/Users/paulcooper/Documents/Codex Master Folder/Council Shared Folder`
- `/Users/paulcooper/Documents/Codex Master Folder/decomposition`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

## 9. Current Cleanup Backlog

Documentation and planning only:

- castle-member extraction follow-through
  - Anna remains the shared implementation root
  - Diana and Liana are now standalone peer-realm repos
  - remaining work is remote/worktree hygiene and any future product-specific divergence
- jewel / DDOS normalization follow-through
  - sovereign-jewel-next is now a standalone repo
  - remote DDOS `main` remains the live canonical site
  - the extracted local DDOS line remains auxiliary only
- PrismAI / prism separation confirmation
  - keep separate products and keep the overlap documented only as provenance
- metacanonai WebGL basis map
  - keep the Prism relationship narrowed to basic WebGL basis only
  - treat current `metacanonai` runtime and workbench as sovereign-metaverse-native implementation
- Council / LensForge / Sphere follow-through
  - canonical active seats are now documented
  - remaining work is remote/worktree hygiene and any future root promotion
- small-program canonical seats follow-through
  - canonical seats are now documented
  - remaining work is repo promotion only where approved
- worktree rollout
  - repo-backed lane scaffold has started
  - blocked future roots remain blocked until repo promotion is approved

## 10. Appendix Index

### Current appendices

- [WORKSPACE_ROOT_CENSUS_2026-03-22.csv](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_ROOT_CENSUS_2026-03-22.csv)
- [WORKSPACE_UNIT_CENSUS_2026-03-22.csv](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_UNIT_CENSUS_2026-03-22.csv)
- [WORKSPACE_PROVENANCE_LEDGER_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_PROVENANCE_LEDGER_2026-03-22.md)
- [WORKSPACE_ORPHAN_AND_STRAGGLER_MATRIX_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_ORPHAN_AND_STRAGGLER_MATRIX_2026-03-22.md)
- [WORKSPACE_FAMILY_ASSIGNMENT_V2_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_FAMILY_ASSIGNMENT_V2_2026-03-22.md)
- [WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv)
- [WEBGL_BASIS_MAP_METACANONAI_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WEBGL_BASIS_MAP_METACANONAI_2026-03-22.md)
- [COUNCIL_LENSFORGE_SPHERE_DECOMPOSITION_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/COUNCIL_LENSFORGE_SPHERE_DECOMPOSITION_2026-03-22.md)
- [SMALL_PROGRAM_CANONICAL_SEATS_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/SMALL_PROGRAM_CANONICAL_SEATS_2026-03-22.md)

### Historical first-pass artifacts

- [WORKSPACE_AUDIT_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_AUDIT_2026-03-22.md)
- [WORKSPACE_MASTER_INVENTORY_2026-03-22.csv](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_MASTER_INVENTORY_2026-03-22.csv)
- [WORKSPACE_LINEAGE_MAP_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_LINEAGE_MAP_2026-03-22.md)
- [WORKSPACE_CONTAMINATION_MATRIX_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_CONTAMINATION_MATRIX_2026-03-22.md)
- [WORKSPACE_TARGET_MATRIX_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_TARGET_MATRIX_2026-03-22.md)
- [WORKSPACE_EXTRACTION_BACKLOG_2026-03-22.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_EXTRACTION_BACKLOG_2026-03-22.md)

### Active operating document

- [worktrees/README.md](/Users/paulcooper/Documents/Codex%20Master%20Folder/worktrees/README.md)
