# Council / LensForge / Sphere Decomposition

Last updated: 2026-03-22

## Purpose

This appendix decomposes the overlapping Council / LensForge / Sphere family into stable ownership units and canonical seats.

This is a cleanup map, not a merge plan.

## Roots examined

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app`
- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

## High-confidence conclusions

- `sphere-thread-engine` is the only active member with its own git history, so it is the current git-backed anchor for the shared engine line.
- `lensforge-app/tma` is the clearest canonical active LensForge seat because its package identity is explicitly `lensforge-tma`.
- `council-engine` remains an unmanaged active root that preserves the Council Engine core, skin, config, and governance line, but it is not the current git-backed anchor.
- `sphere-thread-engine/tma` is real, but it is inherited overlap, not the canonical LensForge TMA seat.
- `council-engine-code-copy` and `council-engine-master-v2` are archive copies, not active product roots.

## Stable decomposition

### 1. Shared Council Engine line

Common recurring units across the family:

- `engine/`
- `skins/council-nebula/`
- `governance/`
- `lens-packs/`

These units represent the shared Council Engine lineage.

Current canonical active seat:

- engine: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine/engine`
- skin: `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine/skins/council-nebula`

Reason:

- only git-backed active root in the family
- contains the most active operational and bridge-contract additions

### 2. LensForge line

Distinct LensForge surface:

- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app/tma`

Supporting evidence:

- `tma/package.json` names `lensforge-tma`
- this naming does not appear at the root package level

Current canonical active seat:

- `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app/tma`

Inherited overlap that should not be mistaken for the canonical seat:

- `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine/tma`

### 3. Council root line

Root:

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine`

Role:

- unmanaged active root preserving the Council Engine core/skin/config/governance line

What it is:

- a real active root with runnable packages and strong lineage evidence

What it is not:

- not the current git-backed anchor
- not an archive
- not the canonical LensForge seat

### 4. Archive line

Archive roots:

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy`
- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2`

Archive-only stable units:

- archived engine copies
- archived Council Nebula skin copies
- archived conductor layer in `council-engine-master-v2`

Important delta:

- `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2/council-engine-master/engine/src/conductor`
  - this is the clearest evolved archive-only subsystem and should stay visible in provenance

## Root-by-root decisions

### council-engine

Current intended role:

- unmanaged active Council Engine root

Keep visible for:

- original Council Engine core/skin/config/governance line
- documentation and provenance comparison

Do not treat as:

- archive
- LensForge root
- current git-backed canonical engine anchor

### lensforge-app

Current intended role:

- hybrid root carrying shared Council Engine lineage plus the canonical active LensForge TMA seat

Keep visible for:

- `tma/` as the active LensForge seat
- comparison against the shared Council Engine line

Do not treat as:

- a pure Council Engine root
- archive

### sphere-thread-engine

Current intended role:

- current git-backed anchor for the shared engine line

Keep visible for:

- active engine seat
- active skin seat
- contracts and bridge layers

Cleanup caveat:

- remote wiring still points at the umbrella repo and should be corrected later

### council-engine-code-copy

Current intended role:

- archive-only copy

### council-engine-master-v2

Current intended role:

- archive-only copy with an evolved conductor/queue layer

## Cleanup decision

Use this boundary going forward:

- active Council Engine canonical seat: `sphere-thread-engine/engine`
- active Council Nebula skin canonical seat: `sphere-thread-engine/skins/council-nebula`
- active LensForge canonical seat: `lensforge-app/tma`
- `council-engine` remains a live unmanaged comparison root
- archive copies stay archive-only

## Operational consequence

- do not collapse these roots into one family root
- do not delete `council-engine`
- do not treat `sphere-thread-engine/tma` as the canonical LensForge product seat
- fix remote/worktree hygiene later, after provenance review is accepted
