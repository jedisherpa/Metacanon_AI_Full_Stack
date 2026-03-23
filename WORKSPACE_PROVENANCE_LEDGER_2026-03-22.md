# Workspace Provenance Ledger

Date: 2026-03-22  
Workspace root: `/Users/paulcooper/Documents/Codex Master Folder`

This ledger is the second-generation audit. It is provenance-first, not family-first.

Supporting artifacts:

- Root census: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_ROOT_CENSUS_2026-03-22.csv`
- Unit census: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_UNIT_CENSUS_2026-03-22.csv`
- First-pass audit: `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_AUDIT_2026-03-22.md`

## Evidence Ladder

Every provenance claim below is ranked from strongest to weakest evidence:

1. Local git history
2. Local git remote or upstream
3. Package name and build system
4. README or planning docs
5. Duplicate-file lineage
6. Archive or code-copy evidence
7. Structural inference only when nothing stronger exists

## Locked Provenance Decisions

- The umbrella repo at `/Users/paulcooper/Documents/Codex Master Folder` is a real runtime and installer line.
- The umbrella repo is not the correct default cwd for product work.
- The concrete castle-member implementation baseline is Anna Phoenix V1 in `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`.
- Diana and Liana are categorized as peer realms to Anna, all referring back to the same shared implementation root.
- The metaverse repo provides the castle-member contract in docs, not the concrete template code.
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh` remains an independent product even though it carries duplicated Prism and Metacanon frontend lineage from `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`.
- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm` and `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh` are separate products for ownership, worktree, and cleanup purposes.
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web` is a separate static microsite root and not just a forgotten branch of the larger jewel projects.
- The umbrella Rust torus and sub-sphere runtime is its own real code line and must remain visible.

## Root-by-Root Provenance

### 1. Umbrella runtime and installer

Root: `/Users/paulcooper/Documents/Codex Master Folder`

- Strongest evidence:
  - local git repo with remote `git@github.com:jedisherpa/Metacanon_AI_Full_Stack.git`
  - `Cargo.toml`
  - `README.md` naming the product `MetaCanon AI Runtime + Installer`
- First local evidence in this checkout:
  - `2026-03-20 | 9b8eeac | chore: fix Diana Vercel deploy install`
- What it started as in this checkout:
  - a Rust runtime and installer anchor
- What it became:
  - a mixed workspace container that also holds many unrelated or semi-related products beside it
- What it should be now:
  - runtime and installer anchor only

Important owned units:

- `src/lib.rs` and the runtime crate
- `src/main.rs` installer CLI
- `src/ui.rs` installer command surface
- `src/providers/*` provider adapter line
- `src/torus.rs`, `src/sub_sphere_torus.rs`, `src/sub_sphere_manager.rs`, `src/task_sub_sphere.rs`
- `src/ffi_bridge.rs`
- `scripts/install_metacanon.sh`

Important boundary:

- `installer-ui/` is provenance-linked to this root, but is treated as a separate top-level root in the new census because it has its own implementation surface and handover packs.

### 2. AnythingLLM / PrismAI core

Root: `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`

- Strongest evidence:
  - local git repo
  - remote `https://github.com/Mintplex-Labs/anything-llm.git`
  - upstream README is still clearly the AnythingLLM README
- First local evidence in this checkout:
  - `2026-03-15 | 8ca77ecb | Add PrismAI desktop and product snapshot`
- What it started as:
  - a local fork snapshot of Mintplex AnythingLLM
- What it became:
  - the PrismAI core product fork with desktop, mobile, data, and Metacanon / Prism overlay work embedded inside it
- What it should be now:
  - the canonical PrismAI repo, with the overlay lineage documented explicitly

Most important internal units:

- `frontend/`
- `frontend/src` overlay cluster
- `server/`
- `collector/`
- `desktop-tauri/`
- `browser-extension/`
- `embed/`
- `mobile-ios/PrismAI`
- `data/metacanon`
- `cloud-deployments`

Cross-root lineage:

- The Prism and Metacanon overlay inside `frontend/src` is the upstream local seat for many files that also appear in `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src`.
- Verified identical file pairs include:
  - `pages/MetacanonAI/index.jsx`
  - `pages/MetacanonAILab/index.jsx`
  - `pages/PrismHero/index.jsx`
  - `pages/PrismHero/createPrismHeroScene.js`
  - `pages/PrismDodecahedron/musicMotion.js`
  - `components/Metacanon/Ambient.jsx`
  - `components/PrismHoverTarget/index.jsx`
  - `components/PrismPresence/index.jsx`
  - `PrismContext.jsx`
- `pages/PrismDodecahedron/index.jsx` still shares lineage but is no longer byte-identical.

### 3. Castle-member shared implementation root and peer realms

#### Anna Phoenix V1

Root: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`

- Strongest evidence:
  - local git repo
  - remote `https://github.com/jedisherpa/so-ive-been-busy.git`
  - package name `castle-member-anna`
- First local evidence in this checkout:
  - `2026-03-20 | 0f613b8 | Configure npm install for Vercel`
- What it started as:
  - the concrete Anna member site implementation
- What it became:
  - the effective local baseline for the castle-member line
- What it should be now:
  - canonical concrete implementation seed for extraction work

Clean baseline units:

- `client/src/features/anna`
- `client/src/components/sections`
- `server/`
- `shared/`
- `source/anna`

#### Diana peer realm

Root: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`

- Strongest evidence:
  - umbrella git history plus local standalone repo init
  - package name `castle-member-diana`
- First local evidence in umbrella history:
  - `2026-03-19 | 61ea0c4 | feat: add Diana realm with dev hero crop lab`
- What it started as:
  - a peer realm spun out from the same shared implementation root as Anna
- What it became:
  - a Diana-specific peer realm with local Anna carryover during the umbrella phase
- What it should be now:
  - standalone Diana repo / worktree

Extraction status:

- local git repo initialized on 2026-03-22
- `client/src/features/anna` removed on 2026-03-22
- `client/public/anna` removed on 2026-03-22
- `source/anna` removed on 2026-03-22

#### Liana peer realm

Root: `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

- Strongest evidence:
  - umbrella git history plus local standalone repo init
  - package name `castle-member-liana`
- First local evidence in umbrella history:
  - `2026-03-20 | fe8b945 | Add castle-member-liana realm site`
- What it started as:
  - a peer realm spun out from the same shared implementation root as Anna
- What it became:
  - a Liana-specific peer realm that carried Anna source content during the umbrella phase
- What it should be now:
  - standalone Liana repo / worktree

Extraction status:

- local git repo initialized on 2026-03-22
- `source/anna` removed on 2026-03-22
- `client/src/features/liana` remains the active peer realm feature root
- there is still no `source/liana` pack in the current tree

#### Contract seat vs implementation seat

Contract seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md`

What it proves:

- the metaverse plan intends a future castle-member template and family

What it does not prove:

- it does not provide the concrete template implementation code locally

Classification rule for this family:

- Anna, Diana, and Liana are peer realms in the same castle-member family.
- Anna is the current shared implementation root.
- Diana and Liana are not categorized as subordinate products; the current contamination only describes the local code state.

### 4. Sovereign Jewel, DDOS, and related WebGL roots

#### sovereign-jewel-next

Root: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`

- Strongest evidence:
  - `package.json`
  - `docs/sovereign-journey-master-plan.md`
  - `app/`, `components/`, `lib/`, `scripts/`, `blender/`
- First local evidence:
  - no local git history; provenance is inferred from docs and structure
- What it started as:
  - a Next app prototype for the Sovereign Jewel public shell and viewer work
- What it became:
  - a mixed public shell + platonic geometry viewer + breakup engine + asset pipeline root
- What it should be now:
  - its own repo or managed app root

Most important unit:

- `components/geometry-viewer.tsx`

Why that matters:

- this is the clearest local seat for the platonic solid viewer the user called out
- it enumerates Platonic solids, spheres, and tori explicitly

Other important units:

- `components/sovereign-jewel-app.tsx`
- `components/object-breakup.tsx`
- `components/dodecahedron-breakup.tsx`
- `lib/*`
- `scripts/*`
- `blender/generate_platonic_solids.py`

#### metacanon-ddos

Root: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`

- Strongest evidence:
  - package name still equals `sovereign-jewel-next`
  - docs still describe the `sovereign-jewel-next` hero pipeline
  - file and folder structure mirrors the jewel root
- First local evidence:
  - no local git history; provenance is inferred from package and duplicate-lineage evidence
- What it started as:
  - a local fork or copy of the jewel root
- What it became:
  - a DDOS declaration experience with constitution, verification, API, and Prisma additions
- What it should be now:
  - a standalone root that explicitly records the fork point instead of hiding it

High-confidence duplicate lineage:

- `components/object-breakup.tsx`
- `components/dodecahedron-breakup.tsx`
- `components/geometry-viewer.tsx`
- `lib/*`
- `scripts/*`
- `blender/*`
- `docs/sovereign-journey-master-plan.md`

#### sovereign-jewel-web

Root: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`

- Strongest evidence:
  - static root with `index.html`, `script.js`, `styles.css`
  - `index.html` metadata says it is an Igloo-inspired cinematic landing page concept themed from the Sovereign Jewel deck
- What it started as:
  - a static microsite experiment
- What it became:
  - a separate small program that was easy to lose in the broader jewel discussion
- What it should be now:
  - a first-class small root in the census

### 5. prism-feralpharaoh

Root: `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh`

- Strongest evidence:
  - local git repo
  - dedicated remote `https://github.com/jedisherpa/prism-feralpharaoh.git`
  - package name still equals `anything-llm-frontend`
  - duplicate-file lineage back to AnythingLLM overlay files
- First local evidence:
  - `2026-03-15 | c5ce4ef | Make Prism body read larger in the frame`
- What it started as in local provenance:
  - a dedicated repo created after or alongside the overlay extraction from AnythingLLM
- What it became:
  - an independent product shell that still carries large chunks of Prism and Metacanon frontend lineage
- What it should be now:
  - independent product root with explicit lineage documentation

Management rule:

- `prism-feralpharaoh` is completely separate from `anything-llm` for current ownership, worktree planning, and cleanup sequencing.
- Historical duplicate files remain documented as provenance only.

Important units:

- `src/pages/Main`
- `src/pages/MetacanonAI`
- `src/pages/MetacanonAILab`
- `src/pages/PrismHero`
- `src/pages/PrismDodecahedron`
- `src/components/Metacanon`
- `src/PrismContext.jsx`

### 6. sovereign-metaverse monorepo

Root: `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse`

- Strongest evidence:
  - local git repo
  - remote `git@github.com:jedisherpa/sovereign-metaverse.git`
  - `pnpm-workspace.yaml`
  - README with explicit app and package map
- First local evidence in this checkout:
  - `2026-03-21 | 71d1ef5 | Trigger Vercel production rollout`
- What it started as in local provenance:
  - a monorepo built from the implementation plan and reusable castle-member patterns
- What it became:
  - the canonical metaverse root with multiple realm apps and shared `@sovmeta/*` packages
- What it should be now:
  - the canonical metaverse repo anchor

Important app units:

- `apps/command-center`
- `apps/feralpharaoh`
- `apps/godsminddreaming`
- `apps/iampaulcooper`
- `apps/jedisherpa`
- `apps/metacanonai`

Important package units:

- `packages/@sovmeta/session-utils`
- `packages/@sovmeta/supabase-client`
- `packages/@sovmeta/animation-utils`
- `packages/@sovmeta/ui`
- `packages/@sovmeta/portal-system`
- `packages/@sovmeta/shard-collector`
- `packages/@sovmeta/three-utils`
- `packages/@sovmeta/entrance-engine`
- `packages/@sovmeta/tailwind-config`

Important internal Metacanon seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

Important Metacanon sub-units:

- public fortress shell
- subworld runtime
- workbench routes
- citadel runtime and tuning layer
- API layer

Filesystem anomaly worth keeping visible:

- the populated workbench route lives at `apps/metacanonai/app/%5F%5Fworkbench`
- an empty sibling directory `apps/metacanonai/app/__workbench` also exists
- this is not a top-level root problem, but it is real clutter inside the canonical app

### 7. Small standalone tools and viewers

#### image-catalog-viewer

Root: `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`

- Strongest evidence:
  - package name `image-catalog-viewer`
  - `server.mjs`
  - static client in `public/`
- Key provenance fact:
  - `server.mjs` calls `/Users/paulcooper/Documents/Codex Master Folder/scripts/build_image_catalog.py`
- Conclusion:
  - separate small tool root with an explicit dependency back to the umbrella runtime workspace

#### planes-of-existence-viewer

Root: `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`

- Strongest evidence:
  - package name `planes-of-existence-viewer`
  - Next app with `app/page.tsx`, `app/viewer/page.tsx`
  - main component `components/planes-of-existence-viewer.tsx`
- Key provenance fact:
  - this is a separate cosmology viewer with its own GLB runtime and asset pipeline
- Conclusion:
  - first-class small product root, not a hidden sub-feature of the jewel or metacanon apps

#### metacanon-code-api

Root: `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`

- Strongest evidence:
  - package name `metacanon-code-api`
  - README
  - `src/server.ts`
- Key provenance fact:
  - the README explicitly says it serves live snippets and runtime control endpoints backed by `ffi-node`
- Conclusion:
  - separate service root with a direct bridge dependency

#### ffi-node

Root: `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`

- Strongest evidence:
  - package name `metacanon-ffi-node`
  - `index.js`
  - `scripts/build-native.sh`
- Key provenance fact:
  - `index.js` expects `metacanon_ai.node` and exports Rust-style compatibility aliases
- Conclusion:
  - separate Node bridge root with direct lineage back to the umbrella Rust runtime

#### houdini-codex-mcp

Root: `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`

- Strongest evidence:
  - README
  - `server.cjs`
  - `plugin/pythonrc.py`
- Key provenance fact:
  - the README says the MCP SDK is resolved from `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/server`
- Conclusion:
  - separate bridge root with an explicit dependency on the AnythingLLM server tree

#### installer-ui

Root: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui`

- Strongest evidence:
  - README
  - `desktop/package.json`
  - `prototype/index.html`
- Key provenance fact:
  - the README maps UI screens to `/Users/paulcooper/Documents/Codex Master Folder/src/ui.rs`
- Conclusion:
  - separate implementation and handover workspace inside the umbrella product family

### 8. Council, LensForge, Sphere, and archive copies

#### council-engine

Root: `/Users/paulcooper/Documents/Codex Master Folder/council-engine`

- Strongest evidence:
  - package name `council-engine`
  - README
  - workspaces `engine` and `skins/council-nebula`
- Conclusion:
  - unmanaged active root in the council-engine lineage

#### lensforge-app

Root: `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`

- Strongest evidence:
  - README
  - root package name still `council-engine`
  - `tma/package.json` names `lensforge-tma`
- Conclusion:
  - hybrid overlapping root: shared council engine lineage plus a distinct LensForge TMA surface

#### sphere-thread-engine

Root: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`

- Strongest evidence:
  - local git repo
  - README
  - root package name `council-engine`
  - `tma/package.json` names `lensforge-tma`
- Key ambiguity:
  - the repo remote points back to `git@github.com:jedisherpa/Metacanon_AI_Full_Stack.git`
- Conclusion:
  - active repo anchor for the overlapping family, but not cleanly isolated in lineage terms

#### Archive copies

Roots:

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

What they are:

- nested archive copies containing real engine and skin code

What they are not:

- active product roots

Important distinction:

- `council-engine-master-v2` contains a more evolved conductor / queue layer than the simpler `council-engine-code-copy`

## Provenance Conclusions

### Canonical seats

- Umbrella runtime / installer:
  - `/Users/paulcooper/Documents/Codex Master Folder`
- PrismAI core:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`
- Castle-member concrete baseline:
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- Metaverse monorepo:
  - `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse`
- Current canonical Metacanon app:
  - `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

### Roots with local contamination or local-copy status

- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`
- duplicated overlay units between:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`
  - `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src`

Interpretation note:

- Diana and Liana remain peer realms and are now standalone local repos.
- AnythingLLM and prism-feralpharaoh remain separate products even though some overlay units still share historical duplicate lineage.

### Small roots that must stay visible in planning

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`
- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`

### Freeze condition

No moves, extractions, repo promotions, or worktree normalization should happen from this ledger alone. The next step is review of the provenance-reset artifact set, then extraction planning against the approved source of truth.
