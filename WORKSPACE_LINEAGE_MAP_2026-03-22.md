# Workspace Lineage Map

> Superseded by [`WORKSPACE_SOURCE_OF_TRUTH.md`](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_SOURCE_OF_TRUTH.md).
> Still useful as historical first-pass material.
> Not authoritative for new cleanup decisions.

Date: 2026-03-22
Root: `/Users/paulcooper/Documents/Codex Master Folder`

## Purpose

This file records shared code lineage separately from the local-unit inventory. A local unit can be independent as a product and still participate in a duplicated or forked lineage.

## 1. Umbrella Runtime Lineage

- Canonical runtime/installer root:
  - `/Users/paulcooper/Documents/Codex Master Folder`
- This repo is not the upstream for the product families below.
- It is the workspace umbrella and runtime/installer anchor only.

## 2. Castle-Member Lineage

### Contract lineage

- Contract source:
  - `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/docs/reference/SOVEREIGN_METAVERSE_PROJECT_PLAN_FULL.md`
- The metaverse repo describes the intended castle-member contract.
- The current local metaverse checkout does not contain a concrete `castle-member-template` implementation.

### Concrete implementation lineage

- Concrete baseline:
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna`
- Baseline seat:
  - Anna Phoenix V1
- Peer realm lines:
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana`
  - `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana`

### Lineage conclusion

- Anna Phoenix V1 is the concrete castle-member implementation source of truth.
- Diana and Liana are peer realms with local contamination and must be extracted as clean standalone peers.

## 3. WebGL Lineage

### 3.1 Jewel / DDOS shared engine lineage

Shared lineage pair:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next`
- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos`

Shared code families:

- breakup engine
  - `components/object-breakup.tsx`
  - `components/dodecahedron-breakup.tsx`
- geometry viewer / scene shell
  - `components/geometry-viewer.tsx`
  - `components/jewel-scene.tsx`
  - `components/sovereign-jewel-app.tsx`
- geometry/math libs
  - `lib/dodecahedron-shards.ts`
  - `lib/object-breakup-shards.ts`
  - `lib/geometry-surface.ts`
  - `lib/triangle-subdivision.ts`
- asset pipeline
  - `blender/*`
  - `scripts/*`

Lineage conclusion:

- `metacanon-ddos` contains a forked copy of the jewel engine line.
- No canonical engine owner is being forced in this cleanup pass.
- Both roots stay separate as products.

### 3.2 Prism overlay duplication lineage

Shared lineage pair:

- `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src`

Confirmed duplicated files:

- `pages/MetacanonAI/index.jsx`
- `pages/MetacanonAILab/index.jsx`
- `pages/PrismHero/index.jsx`
- `pages/PrismHero/createPrismHeroScene.js`
- `pages/PrismDodecahedron/index.jsx`
- `pages/PrismDodecahedron/musicMotion.js`
- `components/Metacanon/Ambient.jsx`
- `components/PrismHoverTarget/index.jsx`
- `components/PrismPresence/index.jsx`
- `PrismContext.jsx`

Lineage conclusion:

- `prism-feralpharaoh` is an independent product by policy.
- The Prism/Metacanon overlay lineage is duplicated across both codebases and must be tracked explicitly.

### 3.3 Canonical Metacanon app lineage

Canonical current Metacanon app:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`

Distinct subsystems:

- public fortress site
- subworld runtime
- workbench / cockpit family
- citadel tuning runtime
- local workbench API

Lineage conclusion:

- `metacanonai` is not the same product as `sovereign-jewel-next`, `metacanon-ddos`, or `prism-feralpharaoh`.
- It is the current canonical Metacanon app in the metaverse line.

## 4. PrismAI / AnythingLLM Lineage

### Core product lineage

- Base fork:
  - `/Users/paulcooper/Documents/Codex Master Folder/anything-llm`
- Upstream:
  - `Mintplex-Labs/anything-llm`
- Fork remote:
  - `jedisherpa/anything-llm`

### Internal lineage branches inside the fork

- core web frontend
- server
- collector
- desktop-tauri
- mobile PrismAI app
- Prism / Metacanon overlay
- Metacanon governance data and docs

Lineage conclusion:

- The PrismAI fork is a real product family with multiple internal branches.
- The overlay branch must be separated conceptually from the core AnythingLLM base.

## 5. Council / LensForge / Sphere Lineage

Local family members:

- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`

Evidence of shared lineage:

- package identity overlap:
  - all present as `council-engine`
- similar internal shape:
  - `engine/`
  - `tma/` in two of the three

Archive copies:

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

Lineage conclusion:

- This family shares a common engine lineage.
- Canonical ownership is still unresolved.
- `sphere-thread-engine` is the only current standalone repo and is the safest current anchor.

## 6. Standalone Tool / Service Lineage

Standalone candidates with no confirmed shared lineage decision yet:

- `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api`
- `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/ffi-node`
- `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer`
- `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web`

These remain standalone candidates pending their own deep pass.
