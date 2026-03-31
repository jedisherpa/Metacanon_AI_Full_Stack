# Workspace Target Repo / Worktree Matrix

> Superseded by [`WORKSPACE_SOURCE_OF_TRUTH.md`](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_SOURCE_OF_TRUTH.md).
> Still useful as historical first-pass material.
> Not authoritative for new cleanup decisions.

Date: 2026-03-22
Root: `/Users/paulcooper/Documents/Codex Master Folder`

| Current Unit | Current Path | Target Repo | Target Worktree Lane | Status |
| --- | --- | --- | --- | --- |
| Umbrella runtime repo | `/Users/paulcooper/Documents/Codex Master Folder` | `Codex Master Folder` umbrella repo | `root-anchor` | Keep as non-product anchor |
| Installer UI | `/Users/paulcooper/Documents/Codex Master Folder/installer-ui` | `Codex Master Folder` umbrella repo | `umbrella-installer-ui` | Keep under umbrella until explicit split |
| Castle Member Anna | `/Users/paulcooper/Documents/Codex Master Folder/castle-member-anna` | `castle-member-anna` | `mainline` | Keep as baseline |
| Castle Member Diana | `/Users/paulcooper/Documents/Codex Master Folder/castle-member-diana` | future `castle-member-diana` repo | `mainline` | Extract from umbrella repo |
| Castle Member Liana | `/Users/paulcooper/Documents/Codex Master Folder/castle-member-liana` | future `castle-member-liana` repo | `mainline` | Extract from umbrella repo |
| Sovereign Metaverse MetacanonAI | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai` | `sovereign-metaverse` | `metacanonai-main` | Active canonical app |
| MetacanonAI public site | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/page.tsx` | `sovereign-metaverse` | `metacanonai-public` | Split lane for public site work |
| MetacanonAI cockpit/workbench | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/app/%5F%5Fworkbench` | `sovereign-metaverse` | `metacanonai-cockpit` | Split lane for cockpit work |
| MetacanonAI subworld runtime | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-metaverse/apps/metacanonai/components/subworlds` | `sovereign-metaverse` | `metacanonai-subworlds` | Split lane for runtime work |
| AnythingLLM PrismAI core | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm` | `anything-llm` | `prismai-core` | Active core fork |
| AnythingLLM frontend core | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend` | `anything-llm` | `prismai-frontend` | Active |
| AnythingLLM server | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/server` | `anything-llm` | `prismai-server` | Active |
| AnythingLLM collector | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/collector` | `anything-llm` | `prismai-collector` | Active |
| AnythingLLM desktop | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/desktop-tauri` | `anything-llm` | `prismai-desktop` | Active |
| AnythingLLM mobile PrismAI | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/mobile-ios/PrismAI` | `anything-llm` | `prismai-mobile` | Active |
| AnythingLLM Prism overlay | `/Users/paulcooper/Documents/Codex Master Folder/anything-llm/frontend/src` | `anything-llm` | `prismai-overlay` | Keep as internal unit with explicit lineage |
| Prism Feral Pharaoh | `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh` | `prism-feralpharaoh` | `mainline` | Independent product |
| Prism Feral product shell | `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/Main` | `prism-feralpharaoh` | `product` | Active |
| Prism Hero lab | `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismHero` | `prism-feralpharaoh` | `prism-hero` | Active |
| Prism Dodecahedron lab | `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/pages/PrismDodecahedron` | `prism-feralpharaoh` | `prism-dodeca` | Active |
| Prism overlay components | `/Users/paulcooper/Documents/Codex Master Folder/prism-feralpharaoh/src/components/Metacanon` | `prism-feralpharaoh` | `overlay` | Active with duplicated lineage annotation |
| Sovereign Jewel Next | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next` | future `sovereign-jewel-next` repo | `mainline` | Promote to repo first |
| Sovereign Jewel viewer lab | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/components/geometry-viewer.tsx` | future `sovereign-jewel-next` repo | `geometry-lab` | Promote to repo first |
| Sovereign Jewel breakup engine | `/Users/paulcooper/Documents/Codex Master Folder/sovereign-jewel-next/lib` | future `sovereign-jewel-next` repo | `geometry-core` | Promote to repo first |
| Metacanon DDOS | `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos` | future `metacanon-ddos` repo | `mainline` | Promote to repo first |
| Metacanon DDOS declaration shell | `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/declaration-experience.tsx` | future `metacanon-ddos` repo | `public` | Promote to repo first |
| Metacanon DDOS duplicated engine | `/Users/paulcooper/Documents/Codex Master Folder/metacanon-ddos/components/object-breakup.tsx` | future `metacanon-ddos` repo | `engine-review` | Promote to repo first |
| Sphere Thread Engine | `/Users/paulcooper/Documents/Codex Master Folder/sphere-thread-engine` | `sphere-thread-engine` | `mainline` | Active repo |
| Council Engine | `/Users/paulcooper/Documents/Codex Master Folder/council-engine` | future `council-engine` repo | `mainline` | Promote to repo first |
| LensForge App | `/Users/paulcooper/Documents/Codex Master Folder/lensforge-app` | future `lensforge-app` repo | `mainline` | Promote to repo first |
| Metacanon Code API | `/Users/paulcooper/Documents/Codex Master Folder/metacanon-code-api` | future `metacanon-code-api` repo | `mainline` | Promote to repo first |
| Planes of Existence Viewer | `/Users/paulcooper/Documents/Codex Master Folder/planes-of-existence-viewer` | future `planes-of-existence-viewer` repo | `mainline` | Promote to repo first |
| FFI Node | `/Users/paulcooper/Documents/Codex Master Folder/ffi-node` | future `ffi-node` repo | `mainline` | Promote to repo first |
| Image Catalog Viewer | `/Users/paulcooper/Documents/Codex Master Folder/image-catalog-viewer` | future `image-catalog-viewer` repo | `mainline` | Promote to repo first |
| Houdini Codex MCP | `/Users/paulcooper/Documents/Codex Master Folder/houdini-codex-mcp` | future `houdini-codex-mcp` repo | `mainline` | Promote to repo first |

## Worktree Rules

- One agent per worktree.
- One concern per worktree.
- No multi-agent editing in a dirty main checkout.
- No worktree should be created for non-repo roots until the target repo exists.
