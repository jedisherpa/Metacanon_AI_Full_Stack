# Codex Operating System Setup Report

Date: 2026-03-23

Workspace root:

- `/Users/paulcooper/Documents/Codex Master Folder`

## Summary

This setup installs a three-layer Codex operating model:

1. global machine-wide defaults under `~/.codex`
2. umbrella-root orchestration rules in the workspace root
3. strict local coding workflow rules in selected active worktree roots

The current git and worktree structure was preserved.

## Global Layer

Backups created:

- `/Users/paulcooper/.codex/backups/2026-03-23-codex-os/AGENTS.md.bak`
- `/Users/paulcooper/.codex/backups/2026-03-23-codex-os/config.toml.bak`

Created or updated:

- `/Users/paulcooper/.codex/AGENTS.md`
- `/Users/paulcooper/.codex/config.toml`
- `/Users/paulcooper/.codex/skills/run-workflow/SKILL.md`
- `/Users/paulcooper/.codex/skills/cleanup-repo/SKILL.md`
- `/Users/paulcooper/.codex/skills/workspace-map/SKILL.md`

Global behavior now:

- lightweight machine-wide defaults only
- `approval_policy = "on-request"` at the global level
- trusted project entries for the umbrella root and the major active worktrees
- reusable global skills for workflow, cleanup, and workspace routing

## Umbrella Layer

Created:

- `/Users/paulcooper/Documents/Codex Master Folder/AGENTS.md`
- `/Users/paulcooper/Documents/Codex Master Folder/.codex/config.toml`
- `/Users/paulcooper/Documents/Codex Master Folder/WORKTREE_THREAD_MAP.md`
- `/Users/paulcooper/Documents/Codex Master Folder/HOW_TO_OPEN_THE_RIGHT_CODEX_THREAD.md`
- `/Users/paulcooper/Documents/Codex Master Folder/docs/agent_pm.md`
- `/Users/paulcooper/Documents/Codex Master Folder/docs/agent_1.md`
- `/Users/paulcooper/Documents/Codex Master Folder/docs/agent_2.md`
- `/Users/paulcooper/Documents/Codex Master Folder/docs/agent_3.md`
- `/Users/paulcooper/Documents/Codex Master Folder/plans/.gitkeep`
- `/Users/paulcooper/Documents/Codex Master Folder/reports/.gitkeep`

Umbrella behavior now:

- orchestration by default
- no direct product coding by default
- required routing to the correct repo or worktree before implementation

## Launcher System

Created under:

- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/`

Shared launcher assets:

- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/targets.tsv`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/launch-codex.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-codex-project.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-codex-project.command`

Dedicated major launchers:

- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-umbrella-orchestrator.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-umbrella-orchestrator.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-main.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-main.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-public.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-public.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-cockpit.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-metacanonai-cockpit.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-prismai-core.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-prismai-core.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-installer-ui.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-installer-ui.command`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-prism-feralpharaoh.sh`
- `/Users/paulcooper/Documents/Codex Master Folder/tools/codex-launchers/open-prism-feralpharaoh.command`

## Selected Worktree Local Workflow Installs

Installed local workflow files in these worktree roots:

- `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-main`
- `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-public`
- `/Users/paulcooper/Documents/Codex Master Folder/worktrees/sovereign-metaverse/metacanonai-cockpit`
- `/Users/paulcooper/Documents/Codex Master Folder/worktrees/anything-llm/prismai-core`
- `/Users/paulcooper/Documents/Codex Master Folder/worktrees/installer-ui/mainline`
- `/Users/paulcooper/Documents/Codex Master Folder/worktrees/prism-feralpharaoh/mainline`

Each received:

- `AGENTS.md`
- `.codex/config.toml`
- `plans/.gitkeep`
- `reports/.gitkeep`

Local workflow rules now enforce:

- Prism intake
- PM planning
- Agent 1 implementation
- Agent 2 architecture refinement
- Agent 3 performance and simplicity refinement
- PM validation
- final reporting into `plans/` and `reports/`

## Verification

Verified:

- all launcher scripts and `.command` files pass `zsh -n`
- launcher targets were generated from the real worktree map
- global backups exist
- global skills exist
- umbrella orchestration files exist
- selected worktree local workflow files exist

## Git Status Impact

Umbrella root now has new untracked setup files:

- `.codex/`
- `AGENTS.md`
- `HOW_TO_OPEN_THE_RIGHT_CODEX_THREAD.md`
- `WORKTREE_THREAD_MAP.md`
- `docs/`
- `plans/`
- `reports/`
- `tools/`

The umbrella root still also has the pre-existing untracked contract tests:

- `/Users/paulcooper/Documents/Codex Master Folder/tests/constitutional-invariants.contract.test.js`
- `/Users/paulcooper/Documents/Codex Master Folder/tests/contractTestUtils.js`
- `/Users/paulcooper/Documents/Codex Master Folder/tests/installer-desktop-flow.contract.test.js`
- `/Users/paulcooper/Documents/Codex Master Folder/tests/observability-retention.contract.test.js`
- `/Users/paulcooper/Documents/Codex Master Folder/tests/provider-routing.contract.test.js`

Selected worktree status after install:

- `metacanonai-main` already had preexisting source changes; new local workflow files are added on top of that dirty lane
- `metacanonai-public` had no preexisting source edits; only local workflow setup files are new
- `metacanonai-cockpit` had no preexisting source edits; only local workflow setup files are new
- `prismai-core` already had preexisting source changes; new local workflow files are added on top of that dirty lane
- `installer-ui/mainline` had no preexisting source edits; only local workflow setup files are new
- `prism-feralpharaoh/mainline` already had preexisting scene changes; new local workflow files are added on top of that dirty lane

## Operating Result

Use the umbrella root to route work.

Use worktree roots to code.

Use the picker or dedicated launchers to open Codex in the right place instead of manually working from the umbrella root.
