# WebGL Basis Map: prism-feralpharaoh to metacanonai.com

Last updated: 2026-03-22

## Purpose

This appendix narrows one specific provenance question:

- what basic WebGL code and vocabulary from `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh` served as a basis for `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`
- what was rebuilt separately and should not be treated as shared ownership or broad repo lineage

This is a basis map, not a merger map.

## Scope

Roots examined:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine`

Primary evidence seats:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero/createPrismHeroScene.js`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero/prismShapeState.js`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismDodecahedron/musicMotion.js`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/lib/workbench/audioMotion.ts`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/types.ts`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/citadelPreset.ts`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/EntrancePage.tsx`

## High-confidence conclusion

`prism-feralpharaoh` was used as a basis for the early WebGL language of `metacanonai.com`, but the current `metacanonai` runtime is not a direct code transplant of the Prism product.

The strongest inherited basis is:

- audio analysis and audio-reactivity vocabulary
- breakup and transformation tuning vocabulary
- ceremonial dodecahedron / glow / motion design intent

The strongest rebuilt layers are:

- the actual `metacanonai` app shell
- the React Three Fiber entrance runtime
- the citadel preset and part-tuning system
- the workbench, cockpit, API, and persistence layers

## Direct basis links

### 1. Audio analyzer pipeline

Hard evidence:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismDodecahedron/musicMotion.js`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/lib/workbench/audioMotion.ts`

Observed relationship:

- `audioMotion.ts` is a direct structural descendant of `musicMotion.js`
- analyzer settings match:
  - `fftSize = 2048`
  - `smoothingTimeConstant = 0.76`
- the same band split logic is preserved:
  - bass `28-180 Hz`
  - mids `180-2200 Hz`
  - treble `2200-12000 Hz`
- the same normalized frame shape is preserved:
  - `active`
  - `playing`
  - `level`
  - `bass`
  - `mids`
  - `treble`
  - `transient`
  - `pulse`
  - `progress`
  - `currentTime`
  - `duration`
- helper structure is materially the same:
  - `averageBand`
  - `getFrequencyRangeIndices`
  - `computeRms`
  - `normalizePeak`
  - `smooth`
  - `formatAudioTime`
  - `createAudioMotionController`

Interpretation:

- this is not just conceptual similarity
- this is the clearest code-level basis relationship in the current boundary

### 2. Audio-reactivity vocabulary

Hard evidence:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismDodecahedron/musicMotion.js`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/types.ts`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/citadelPreset.ts`

Observed relationship:

- Prism uses:
  - `musicMix`
  - `musicPulse`
  - `musicMotion`
  - `musicShimmer`
  - `musicBreakup`
- `metacanonai` uses the same control family with renamed field ids:
  - `mix`
  - `pulse`
  - `motion`
  - `shimmer`
  - `breakupDrive`

The default values also line up materially:

- Prism groove preset:
  - `musicMix: 0.9`
  - `musicPulse: 0.94`
  - `musicMotion: 0.78`
  - `musicShimmer: 0.72`
  - `musicBreakup: 0.44`
- `metacanonai` citadel preset:
  - `mix: 0.88`
  - `pulse: 0.94`
  - `motion: 0.78`
  - `shimmer: 0.72`
  - `breakupDrive: 0.44`

Interpretation:

- the naming was normalized for the citadel preset model
- the underlying reactivity language clearly came forward from the Prism Dodecahedron music lab

### 3. Breakup and transformation tuning vocabulary

Hard evidence:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero/createPrismHeroScene.js`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero/prismShapeState.js`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/types.ts`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/citadelPreset.ts`

Observed relationship:

- Prism hero config exposes:
  - `breakup`
  - `breakupPulse`
  - `transformSpeed`
  - `transformForce`
- Prism expression presets tune the same fields per expression
- `metacanonai` choreography preset preserves the same field family:
  - `breakup`
  - `breakupPulse`
  - `transformSpeed`
  - `transformForce`

Interpretation:

- these are not generic words accidentally reused
- they are part of the same design vocabulary carried into the citadel runtime

## Rebuilt layers

### 1. Scene architecture was rebuilt

Prism scene seat:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero/createPrismHeroScene.js`

Current `metacanonai` scene seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/packages/@sovmeta/entrance-engine/src/EntrancePage.tsx`

Observed difference:

- Prism Hero is an imperative raw Three.js scene builder using:
  - `Scene`
  - `PerspectiveCamera`
  - `WebGLRenderer`
  - `EffectComposer`
  - `UnrealBloomPass`
  - `RoomEnvironment`
- `metacanonai` now runs through a React Three Fiber / Drei entrance system using:
  - `Canvas`
  - `ContactShadows`
  - `Float`
  - `Sparkles`
  - `OrbitControls`
  - internal citadel rendering providers

Interpretation:

- the runtime architecture changed substantially
- this is a rebuild around monorepo packages and a different rendering model
- it should not be documented as a copied scene runtime

### 2. Product shell was rebuilt

Prism seats:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/Main`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/MetacanonAI`

Current `metacanonai` seats:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/page.tsx`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/components/MetacanonAiHeroScene.tsx`

Observed difference:

- the public page shell and hero composition are now Next app routes with portal, declaration, and fortress framing
- this is not the Prism page tree transplanted intact

### 3. Workbench and cockpit are new application-specific layers

Current seats:

- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/%5F%5Fworkbench`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/lib/workbench`
- `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/api`

Observed difference:

- shared state client
- draft/approved persistence
- promote/reset routes
- cockpit UI
- part-level audio routing

Interpretation:

- these are `metacanonai`-specific systems
- they are not inherited from Prism product structure

## Explicit non-findings

This pass did not find direct duplicate-file overlap between the current `metacanonai` app/component trees and these Prism page trees:

- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/MetacanonAI`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero`
- `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismDodecahedron`

This pass also did not find evidence that the rest of the sovereign-metaverse monorepo depends on `prism-feralpharaoh`.

## Cleanup decision

Use this boundary going forward:

- `prism-feralpharaoh` is a separate product repo
- `sovereign-metaverse` is a separate monorepo
- any relation between them is limited to basic WebGL basis work used for `metacanonai.com`
- do not describe the rest of sovereign-metaverse as Prism-derived
- do not describe current `metacanonai` runtime architecture as a direct Prism transplant

## Operational consequence

For cleanup and extraction:

- keep both roots separate
- do not perform source moves between them in the current lane
- treat audio analysis and reactivity vocabulary as provenance
- treat the current `metacanonai` runtime, workbench, and API layers as sovereign-metaverse-native implementation
