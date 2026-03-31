# How To Open The Right Codex Thread

## Use The Launcher Folder

Launcher folder:

- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/`

Applications install:

- `/Applications/Codex Project Picker.app`

Fastest entrypoints:

- `/Applications/Codex Project Picker.app`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/Open Codex Project.app`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-codex-project.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-umbrella-orchestrator.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-sovereign-metaverse.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-main.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-public.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-cockpit.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-subworlds.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-prismai-core.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-installer-ui.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-prism-feralpharaoh.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-castle-member-anna.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-castle-member-diana.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-castle-member-liana.command`

## When To Open The Umbrella Root

Open `/Users/paulcooper/Documents/Codex Master Folder` when the task is:

- workspace inventory
- provenance cleanup
- launcher maintenance
- Codex operating-system files
- routing a request to the correct worktree

Do not use the umbrella root for direct product coding by default.

## When To Open A Repo Or Worktree Root

Open a worktree root when the task changes product code.

Use:

- `metacanonai-main` for broad `metacanonai` integration work
- `metacanonai-public` for `3002` public website work
- `metacanonai-cockpit` for `3011`, `3013`, `3014`, workbench, cockpit, or audio runtime work
- `metacanonai-subworlds` for scene runtime or subworld experiments
- `prismai-core` for PrismAI / AnythingLLM product changes
- `installer-ui/mainline` for PrismAI installer work
- `prism-feralpharaoh/mainline` for Prism product work
- `castle-member-anna/mainline` for the Anna site
- `castle-member-diana/mainline` for the Diana site
- `castle-member-liana/mainline` for the Liana site

If the task is unclear, check:

- `/Users/paulcooper/Documents/Codex Master Folder/WORKTREE_THREAD_MAP.md`

## How To Use The Project Picker

Double-click:

- `/Applications/Codex Project Picker.app`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/Open Codex Project.app`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-codex-project.command`

Or run in Terminal:

```bash
/Users/paulcooper/Documents/Codex\ Master\ Folder/tools/codex-launchers/open-codex-project.sh
```

The picker shows numbered active lanes. Select a number and it launches the Codex app scoped to that directory.

The picker now has three menus:

- `Active Worktrees`
- `Linked Domains`
- `Local-Only / Non-Vercel Projects`

Use `Linked Domains` when you are thinking in terms of a live domain rather than a repo name.

Important behavior:

- if the exact domain code seat exists locally, the launcher lands on that code path
- if the exact live repo is external/private and not cloned here, the launcher lands on the nearest local implementation or reference seat instead

Domain routing reference:

- `/Users/paulcooper/Documents/Codex Master Folder/DOMAIN_THREAD_MAP.md`

## Terminal Launchers vs .command Launchers

- `.sh` launchers are for Terminal use
- `.command` launchers are for Finder double-click use
- `Codex Project Picker.app` is the preferred GUI picker and should not open Terminal
- `Open Codex Project.app` is the older picker bundle and should be treated as legacy
- the `.command` launchers are still available when you explicitly want the Terminal-driven route

## Global Skills vs Local Workflow Rules

Global skills live under the machine-level Codex home and are available everywhere.

They are for reusable behavior:

- workflow orchestration
- cleanup sequencing
- workspace mapping

Local workflow rules live in selected coding worktree roots.

They are mandatory only in those coding roots and define:

- PM planning
- Agent 1 implementation
- Agent 2 architecture refinement
- Agent 3 performance and simplicity refinement
- PM validation
- final reporting into `plans/` and `reports/`

## Practical Rule

- umbrella root = orchestrate
- worktree root = code
- linked domain menu = route a live domain to its best local seat
