# Umbrella Workspace Orchestrator

This root exists for orchestration, inventory, routing, launcher management, and workspace documentation.

Default behavior in this root:

- do not perform direct product coding here
- do not assume the umbrella repo owns nested repos just because they live under the same parent folder
- identify the correct repo or worktree before proposing or making code changes

Primary references:

- `/Users/paulcooper/Documents/Codex Master Folder/WORKSPACE_SOURCE_OF_TRUTH.md`
- `/Users/paulcooper/Documents/Codex Master Folder/WORKTREE_OWNERSHIP_MATRIX_2026-03-22.csv`
- `/Users/paulcooper/Documents/Codex Master Folder/WORKTREE_THREAD_MAP.md`
- `/Users/paulcooper/Documents/Codex Master Folder/HOW_TO_OPEN_THE_RIGHT_CODEX_THREAD.md`

Allowed direct edits from this root:

- workspace inventory and provenance docs
- launcher scripts under `tools/codex-launchers/`
- umbrella-only `AGENTS.md` and `.codex/config.toml`
- planning and reporting files under `plans/` and `reports/`

Required routing protocol before coding:

1. Confirm whether the request is orchestration work or product work.
2. If it is product work, identify the repo and worktree lane first.
3. State the chosen worktree and why it matches the task.
4. Only code in the selected worktree root unless the user explicitly asks for umbrella-layer changes.

Do not:

- run `git init` in this root
- treat this root as the default coding workspace
- change nested repo boundaries from this root without explicit approval
- make product changes in nested repos while staying anchored in the umbrella root

If the correct worktree is unclear, inspect the matrix and thread map before proceeding.
