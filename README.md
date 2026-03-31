# MetaCanon AI Runtime

A Rust-based multi-provider AI orchestration runtime with multi-agent deliberation, encrypted agent-to-agent communication, and MCP integration.

## What It Does

- Routes prompts across 7 LLM providers (OpenAI, Anthropic, Grok, Moonshot/Kimi, Ollama, Qwen local, Morpheus) with health checks and fallback chains
- Manages autonomous sub-spheres (task agents) with human-in-the-loop approval gates
- Synthesizes multi-lens outputs through Prism
- Persists runtime state via JSON snapshots
- Stores secrets via macOS Keychain + encrypted file (dual-write)
- Logs events with encrypted observability (dual-tier: full + redacted)

## Prerequisites

- Rust toolchain (`cargo`, `rustc`)

## Quick Start

```bash
scripts/install_metacanon.sh
```

This will build the release binary, run tests, and run installer setup. The runtime snapshot is persisted to `~/.metacanon_ai/runtime_snapshot.json`.

Pass additional flags:

```bash
scripts/install_metacanon.sh --grok-live --smoke-query "Reply with installer ready"
```

## CLI Commands

```bash
# Setup and configuration
cargo run -- setup --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json" --load-existing
cargo run -- health --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- system-check --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- review --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"

# Deliberation
cargo run -- deliberate "Summarize setup status" --provider grok

# Sub-sphere management
cargo run -- sub-sphere-create --name "policy" --objective "Evaluate policy" --snapshot ...
cargo run -- sub-sphere-list --snapshot ...

# Workflow training
cargo run -- workflow-start --sub-sphere <id> --snapshot ...
cargo run -- workflow-message --session <id> --message "..." --snapshot ...
cargo run -- workflow-save --session <id> --name "..." --snapshot ...
cargo run -- workflow-list --sub-sphere <id> --snapshot ...
cargo run -- workflow-delete --sub-sphere <id> --workflow <id> --snapshot ...

# Snapshot persistence
cargo run -- snapshot-save --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- snapshot-load --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"
cargo run -- snapshot-flush --snapshot "$HOME/.metacanon_ai/runtime_snapshot.json"

# Help
cargo run -- help
```

## Live API Demo

To test with a real LLM provider (Grok):

```bash
export GROK_API_KEY="xai-your-key"
cargo run -- setup --grok-live --smoke-query "Reply with: MetaCanon live." --snapshot /tmp/test.json
cargo run -- deliberate "What is the capital of France?" --provider grok --snapshot /tmp/test.json
```

## API Key Environment Variables

If key flags are omitted, setup reads from environment:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `MOONSHOT_KIMI_API_KEY` (or `MOONSHOT_API_KEY`)
- `GROK_API_KEY` (or `XAI_API_KEY`)

## Setup Flags

`setup` supports:

- `--snapshot-encryption | --no-snapshot-encryption`
- `--snapshot-passphrase <value>`
- `--auto-save | --no-auto-save`
- `--secret-backend keychain_only|encrypted_file_only|dual_write`
- `--retention-days <n>`
- `--log-level error|warn|info|debug|trace`

## Development

```bash
cargo build              # Build
cargo test --all-targets # Run all tests
cargo clippy             # Lint
cargo fmt                # Format
```

## Architecture

| Module | Purpose |
|--------|---------|
| `compute.rs` | Provider-agnostic compute router |
| `providers/` | 7 LLM backends with live/simulated toggle |
| `torus.rs` | Deliberation routing with fallback chains |
| `prism.rs` | Multi-lens synthesis |
| `genesis.rs` | SoulFile, WillVector, governance layer |
| `sub_sphere_manager.rs` | Agent lifecycle (spawn/pause/dissolve) |
| `task_sub_sphere.rs` | HITL-gated task execution |
| `communications.rs` | Agent messaging, Discord/Telegram hooks |
| `fhe.rs` | Homomorphic encryption primitives |
| `secrets.rs` | Dual-write secret storage |
| `observability.rs` | Encrypted structured logging |
| `ffi_bridge.rs` | N-API + Tauri FFI bridge |
| `workflow.rs` | Workflow training and replay |
| `tool_registry.rs` | Pluggable tool registry with guardrails |
| `ui.rs` | Central command runtime |
