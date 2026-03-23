# Workspace Orphan And Straggler Matrix

Date: 2026-03-22  
Workspace root: `/Users/paulcooper/Documents/Codex Master Folder`

Purpose:

- keep small programs from disappearing into larger family discussions
- separate active unmanaged roots from archives and from pure workspace residue
- identify which roots need dedicated repo promotion later versus explicit archival

## A. Active unmanaged code roots

These are real code roots in the workspace but do not currently have their own git repo at the root.

| Root | Type | Current role | Provenance status | Action after approval |
|---|---|---|---|---|
| `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana` | app root | Diana member site | umbrella-tracked contaminated descendant | extract to its own repo/worktree |
| `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana` | app root | Liana member site | umbrella-tracked contaminated descendant | extract to its own repo/worktree |
| `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next` | Next app root | Sovereign Jewel public shell plus viewer labs | unmanaged active root | promote or keep explicitly unmanaged until split |
| `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos` | Next app root | DDOS declaration and constitution site | unmanaged active root with jewel fork lineage | promote or keep explicitly unmanaged until normalized |
| `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web` | static microsite | Igloo-inspired Sovereign Jewel concept site | unmanaged small program | keep visible; promote only if revived |
| `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer` | Node plus static app | image catalog tool | unmanaged small program | promote if still operationally useful |
| `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api` | service root | snippet and runtime control API | unmanaged service root | promote if retained |
| `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer` | Next app root | 3D cosmology viewer | unmanaged small program | promote if retained |
| `/Users/paulcooper/Documents/Codex Master Folder/ffi-node` | bridge root | native addon Node bridge | unmanaged service root | promote if retained |
| `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp` | bridge root | Houdini MCP bridge | unmanaged service root | promote if retained |
| `/Users/paulcooper/Documents/Codex Master Folder/installer-ui` | handover workspace | installer design and desktop shell | unmanaged root linked to umbrella runtime | keep under umbrella family unless intentionally split |
| `/Users/paulcooper/Documents/Codex Master Folder/council-engine` | monorepo root | council engine active root | unmanaged active root | decide canonical seat before promotion |
| `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app` | monorepo root | LensForge active root | unmanaged active root | decide canonical seat before promotion |

## B. Small programs that were easy to lose

These are the roots most likely to be forgotten if the workspace is discussed only at family or repo level.

| Root | Why it matters | Evidence anchor |
|---|---|---|
| `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-web` | Separate static cinematic site; not just a note inside the jewel family | `index.html` metadata says Igloo-inspired Sovereign Jewel landing concept |
| `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer` | Standalone utility app with rebuildable catalog flow | `server.mjs` serves `/api/catalog` and `/api/rebuild` |
| `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer` | Standalone WebGL viewer with its own focus model and asset pipeline | `components/planes-of-existence-viewer.tsx` |
| `/Users/paulcooper/Documents/Codex Master Folder/ffi-node` | Dedicated native bridge layer; not just a helper script | `index.js` loads `metacanon_ai.node` |
| `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp` | Dedicated bridge product between Codex and Houdini | `README.md` and `server.cjs` |
| `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api` | Separate runtime and snippet API | `README.md` and `src/server.ts` |

## C. Archive and copy roots

These roots contain code but should not be treated as live source-of-truth products.

| Root | Type | Why it exists now | Current disposition |
|---|---|---|---|
| `/Users/paulcooper/Documents/Codex Master Folder/council-engine-code-copy` | archive copy root | local snapshot copy of council-engine line | keep visible as archive only |
| `/Users/paulcooper/Documents/Codex Master Folder/council-engine-master-v2` | archive copy root | more evolved council-engine master snapshot with conductor and queue layers | keep visible as archive only |
| `/Users/paulcooper/Documents/Codex Master Folder/deliverables` | export archive | generated and delivered materials | archive only |
| `/Users/paulcooper/Documents/Codex Master Folder/About Paul` | research archive | supporting reference materials | archive only |
| `/Users/paulcooper/Documents/Codex Master Folder/Council Shared Folder` | operational archive | shared logs and append-only material | archive only |
| `/Users/paulcooper/Documents/Codex Master Folder/decomposition` | planning pack | planning documents not source code | archive or docs only |

## D. Adjacent workspace scaffolds that are not product roots

These are visible at the top level but should not be mistaken for product code roots.

| Path | Classification | Notes |
|---|---|---|
| `/Users/paulcooper/Documents/Codex Master Folder/worktrees` | workspace scaffold | dedicated worktree home; not product code |
| `/Users/paulcooper/Documents/Codex Master Folder/target` | generated artifact | Rust build output |
| `/Users/paulcooper/Documents/Codex Master Folder/.pnpm-store` | generated artifact | dependency cache |
| `/Users/paulcooper/Documents/Codex Master Folder/tests` | umbrella-owned test suite | belongs to umbrella runtime root, not a separate product |
| `/Users/paulcooper/Documents/Codex Master Folder/scripts` | umbrella-owned scripts | belongs to umbrella runtime root, not a separate product |
| `/Users/paulcooper/Documents/Codex Master Folder/src` | umbrella-owned runtime source | belongs to umbrella runtime root, not a separate product |

## E. High-risk confusion points

These are the cases most likely to create incorrect ownership assumptions.

| Confusion point | Actual status |
|---|---|
| `castle-member-diana` looks like its own site | true, but it is still tracked in umbrella git history and still contains Anna carryover |
| `castle-member-liana` looks isolated because only `features/liana` exists | false; source content still points at `source/anna` |
| `metacanon-ddos` looks like a distinct product root | true at the shell layer, but it is still a jewel fork at engine, docs, scripts, and Blender layers |
| `prism-feralpharaoh` looks fully separate from AnythingLLM | product-wise yes; file-lineage-wise no |
| `sphere-thread-engine`, `council-engine`, and `lensforge-app` look like three clean peers | false; they still share package identity and overlapping structure |
| `sovereign-jewel-web` looks too small to inventory | false; it is a real microsite root |

## Operational rule

Anything listed in sections A through C stays visible in cleanup planning until there is an explicit approved action:

- promote to repo
- extract to standalone repo
- merge into canonical root by deliberate migration
- archive explicitly

Nothing in this matrix should be silently dropped from future cleanup documents.
