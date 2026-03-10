# MetaCanon AI Runtime + Installer

This workspace includes:

- A tested Rust runtime library (`src/lib.rs`)
- A runnable installer/runtime CLI binary (`src/main.rs`)
- A one-command install script (`scripts/install_metacanon.sh`)
- Installer UI handover assets and integration map (`installer-ui/`)
- A Tauri + React desktop installer shell (`installer-ui/desktop/`)

## Rebrand Note

The runtime and installer are fully branded as **MetaCanon AI**. Defaults target `~/.metacanon_ai/...`.

## Prerequisites

- Rust toolchain (`cargo`, `rustc`)

## Quick Start

```bash
cd "/Users/paulcooper/Documents/Codex Master Folder"
scripts/install_metacanon.sh --grok-live --smoke-query "Reply with installer ready"
```

This will:

1. Build release binary
2. Run tests
3. Run installer setup
4. Persist runtime snapshot to `~/.metacanon_ai/runtime_snapshot.json`

## Installer CLI

Build/run directly:

```bash
cargo run -- setup --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json" --load-existing
```

Other commands:

```bash
cargo run -- health --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- system-check --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- review --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- deliberate "Summarize setup status" --provider grok
cargo run -- snapshot-save --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- snapshot-load --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- snapshot-flush --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
```

Help:

```bash
cargo run -- help
```

## API Key Env Vars

If key flags are omitted, setup reads:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `MOONSHOT_KIMI_API_KEY` (or `MOONSHOT_API_KEY`)
- `GROK_API_KEY` (or `XAI_API_KEY`)

## Snapshot Auto-Persistence

Runtime state can auto-load/save through snapshot commands in `src/ui.rs`:

- `enable_runtime_auto_snapshot`
- `load_runtime_snapshot`
- `save_runtime_snapshot`
- `flush_runtime_auto_snapshot`

The CLI uses these commands under the hood.

## Setup Flags for Security + Observability

`setup` supports:

- `--snapshot-encryption | --no-snapshot-encryption`
- `--snapshot-passphrase <value>`
- `--auto-save | --no-auto-save`
- `--secret-backend keychain_only|encrypted_file_only|dual_write`
- `--retention-days <n>`
- `--log-level error|warn|info|debug|trace`

## Installer UI Integration

Design handover package and step mapping:

- `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/handover`
- `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/IMPLEMENTATION_MAP.md`

Desktop app entrypoint:

- `/Users/paulcooper/Documents/Codex Master Folder/scripts/run_installer_desktop.sh`

## Planning Docs

- Runtime implementation spec: `/Users/paulcooper/Documents/Codex Master Folder/deliverables/metacanon-ai-implementation-spec-v1.md`
- Webapp control migration + Values Prism bypass plan: `/Users/paulcooper/Documents/Codex Master Folder/deliverables/metacanon-ai-webapp-control-and-values-prism-plan.md`

## Repository Decomposition

Use this to split the monorepo into independent repositories:

```bash
/Users/paulcooper/Documents/Codex Master Folder/scripts/split_metacanon_repos.sh
```

Decomposition docs and templates:

- `/Users/paulcooper/Documents/Codex Master Folder/decomposition/README.md`
- `/Users/paulcooper/Documents/Codex Master Folder/decomposition/repo-split-manifest.yaml`
- `/Users/paulcooper/Documents/Codex Master Folder/decomposition/GITHUB_MIGRATION.md`
