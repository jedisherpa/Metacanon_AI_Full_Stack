# MetaCanon AI Installer UI Integration Map

This maps the handover package screens to runtime command contracts in the Rust crate.

## Source of truth

- Visual handover: `/Users/paulcooper/Documents/Codex Master Folder/installer-ui/handover`
- Runtime command surface: `/Users/paulcooper/Documents/Codex Master Folder/src/ui.rs`
- CLI bridge: `/Users/paulcooper/Documents/Codex Master Folder/src/main.rs`

## Screen-to-command mapping

1. `s01_welcome`
- Quick setup: `finalize_setup_compute_selection(runtime, None)`
- Advanced setup: navigate to System Check screen

2. `s02_system_check`
- Run checks: `run_system_check(runtime)`
- Gate: `has_blocking_failures == false` to continue

3. `s03_compute`
- Provider list + selection: `get_compute_options(runtime)`
- Global provider: `set_global_compute_provider(runtime, provider_id)`
- Cloud order: `set_provider_priority(runtime, cloud_priority)`

4. `s04_provider_cfg`
- Update config: `update_provider_config(runtime, provider_id, patch_json)`
- Health refresh: `get_provider_health(runtime)`

5. `s05_security`
- Read settings: `get_security_persistence_settings(runtime)`
- Update settings:
  - `update_security_persistence_settings(runtime, snapshot_path, encryption_enabled, passphrase, auto_save_enabled, secret_backend_mode)`
- Snapshot controls:
  - `save_runtime_snapshot(runtime, path)`
  - `load_runtime_snapshot(runtime, path)`
  - `enable_runtime_auto_snapshot(runtime, path, load_existing)`
  - `disable_runtime_auto_snapshot(runtime)`
  - `flush_runtime_auto_snapshot(runtime)`

6. `s06_observability`
- Read: `get_observability_status(runtime)`
- Update: `update_observability_settings(runtime, retention_days, log_level)`

7. `s07_review`
- Build review model: `get_install_review_summary(runtime)`
- Submit smoke deliberation/install verification:
  - `submit_deliberation(runtime, query, provider_override)`

8. `s08_done`
- Persist final snapshot: `flush_runtime_auto_snapshot(runtime)`
- Optionally export explicit snapshot: `save_runtime_snapshot(runtime, path)`

## CLI equivalents

- Setup: `cargo run --quiet -- setup ...`
- System check: `cargo run --quiet -- system-check`
- Review: `cargo run --quiet -- review`
- Health: `cargo run --quiet -- health`
- Snapshot save/load/flush:
  - `cargo run --quiet -- snapshot-save`
  - `cargo run --quiet -- snapshot-load`
  - `cargo run --quiet -- snapshot-flush`

## New setup flags for UI parity

- Security
  - `--snapshot-encryption | --no-snapshot-encryption`
  - `--snapshot-passphrase <value>`
  - `--auto-save | --no-auto-save`
  - `--secret-backend keychain_only|encrypted_file_only|dual_write`
- Observability
  - `--retention-days <n>`
  - `--log-level error|warn|info|debug|trace`

## Notes

- Global fallback order remains invariant:
  - active provider -> local (`qwen_local`, `ollama`) -> cloud priority
- Default local profile remains:
  - `Qwen 3.5 32B Instruct GGUF Q8_0` with downgrade `Q5_K_M`
- Default observability remains dual-tier and 90-day retention (unless changed).

## Webapp Migration Note

The legacy LensForge/TMA webapp (`deliverables/webapp_full_dump.md`) was built around `/api/v1/*` HTTP endpoints and a different interaction model. To use it as a MetaCanon AI control surface, implement an HTTP BFF adapter that maps webapp routes to `src/ui.rs` command contracts, then update the webapp `src/lib/api.ts` client bindings.

Detailed migration and Values Prism bypass design:

- `/Users/paulcooper/Documents/Codex Master Folder/deliverables/metacanon-ai-webapp-control-and-values-prism-plan.md`
