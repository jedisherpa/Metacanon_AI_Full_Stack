# Obsidian Implementation Specification (v1)

Date: March 4, 2026
Status: Draft for execution

## 1) Purpose

Define an executable implementation spec for Obsidian that:

- Keeps `SoulFile` / `SoulFacet` as constitutional core artifacts.
- Is forward-compatible with future Task Sub-Sphere and Lens Library features.
- Ships a pluggable compute stack with runtime switching:
  - Local `Qwen 3.5 32B` (primary local)
  - Local `Ollama`
  - `Morpheus`
  - `OpenAI`
  - `Anthropic`
  - `Moonshot Kimi`
  - `Grok (xAI)`
- Supports cross-platform observability with a dual-tier model:
  - Full encrypted local event stream
  - Redacted graph feed for future 3D live monitor

## 2) Decisions Locked

- Canonical root artifact: `SoulFile`.
- Canonical internal perspective struct: `SoulFacet`.
- Task Sub-Sphere / Specialist Lens / Lens Library runtime features are not implemented in initial core flow, but schema hooks must exist now.
- Compute provider options are selectable at setup.
- If user skips selection, install/configure local `Qwen 3.5 32B` by default.
- Local priority order: `Qwen` then `Ollama`.
- Runtime switching supports:
  - Global default provider
  - Per-deliberation provider override
- Sensitive-content handling is explicit user choice (not forced auto-routing).
- Secrets backend must support both:
  - OS keychain
  - Encrypted local config
- Provider failure policy:
  - Auto-fallback to local (`Qwen` then `Ollama`) with notification
  - If local unavailable, fallback to configured cloud provider(s)
- Observability retention: 90 days.

## 3) High-Level Architecture

### 3.1 Core Modules

- `src/genesis.rs`: `SoulFile`, `SoulFacet`, Genesis Crystal creation, signing, hashing.
- `src/compute.rs`: `ComputeProvider` abstraction and provider router.
- `src/providers/`:
  - `qwen_local.rs`
  - `ollama.rs`
  - `morpheus.rs`
  - `openai.rs`
  - `anthropic.rs`
  - `moonshot_kimi.rs`
  - `grok.rs`
- `src/torus.rs`: Deliberation loop, validate action, provider execution and fallback.
- `src/observability.rs`: event capture, redaction, secure/full logs, retention.
- `src/secrets.rs`: keychain + encrypted-file secret store.
- `src/storage.rs`: SQLite persistence and retention jobs.
- `src/ui.rs`: Tauri commands for setup, compute config, and deliberation routing.

### 3.2 Directory Contracts

- App data root from Tauri platform API:
  - `app_data_dir()/obsidian/`
- Logs:
  - `app_log_dir()/obsidian/full-events.log.enc`
  - `app_log_dir()/obsidian/redacted-graph.ndjson`
- Config:
  - `app_data_dir()/obsidian/config.json.enc` (optional if keychain-only mode disabled)

## 4) Data Model Specification

### 4.1 `SoulFile` (current + forward-compatible)

Required now:

- `vision_core: String`
- `core_values: Vec<String>`
- `soul_facets: Vec<SoulFacet>`
- `ai_boundaries: AIBoundaries`
- `ratchet: Ratchet`
- `will_vector: WillVector`
- `genesis_hash: String` (hex)
- `signature: String` (hex)
- `created_at: i64`
- `schema_version: u32`

Forward-compatible reserved fields (present now, default empty/none):

- `future_sub_sphere_registry: Option<FutureSubSphereRegistryRef>`
- `future_lens_library_manifest: Option<FutureLensLibraryManifestRef>`
- `extensions: serde_json::Value`

### 4.2 `SoulFacet`

- `vision: String`
- `territories: Vec<String>`
- `duties: Vec<String>`
- `expansion_thresholds: Vec<Threshold>`
- `emotional_thresholds: Vec<Threshold>`

### 4.3 `AIBoundaries`

- `human_in_loop: bool`
- `interpretive_boundaries: Vec<String>`
- `drift_prevention: String`
- `enable_morpheus_compute: bool`
- `morpheus_config: Option<MorpheusConfig>`
- `sensitive_compute_policy: SensitiveComputePolicy` (`UserChoice`)

### 4.4 IDs

All IDs are `String` (hash-as-hex, UUID, or deterministic namespaced IDs), including `pl_id`, `contact_id`, `event_id`, `trace_id`, `parent_id`.

## 5) Compute Abstraction Specification

### 5.1 Trait

`ComputeProvider` must expose:

- `provider_id() -> &'static str`
- `kind() -> ProviderKind` (`Local`, `Cloud`, `Decentralized`)
- `health_check() -> Result<ProviderHealth, ComputeError>`
- `get_embedding(text: &str) -> Result<Vec<f64>, ComputeError>`
- `generate_response(req: GenerateRequest) -> Result<GenerateResponse, ComputeError>`

### 5.2 Provider Implementations

- `QwenLocalProvider`
  - Default local target: `Qwen 3.5 32B Instruct GGUF Q8_0`
  - Local downgrade profile: `Q5_K_M`
- `OllamaProvider`
  - Model selection from local Ollama registry
- `MorpheusProvider`
  - Helios flow: Local Validate -> FHE Encrypt -> Remote Compute -> Local Decrypt -> Local Log
- `OpenAIProvider`
- `AnthropicProvider`
- `MoonshotKimiProvider`
- `GrokProvider`

### 5.3 Runtime Provider Selection

Two layers:

- Global default provider in user settings.
- Per-deliberation override in request payload.

If override is absent, use global provider.

## 6) Setup Flow Specification

### 6.1 Genesis + Compute Setup

Setup wizard must include compute selection step:

- `Qwen Local`
- `Ollama Local`
- `Morpheus`
- `OpenAI`
- `Anthropic`
- `Moonshot Kimi`
- `Grok (xAI)`

If user skips:

- Auto-install/configure `Qwen 3.5 32B` local profile.

### 6.2 Provider Credential Collection

Cloud/decentralized providers collect credentials/config at setup but can be edited later.

- OpenAI API key
- Anthropic API key
- Moonshot key + endpoint
- Grok API key
- Morpheus wallet/router config

Secrets persist via configured secret backend (`keychain`, `encrypted_file`, or both enabled).

## 7) Fallback and Reliability Policy

When active provider fails during deliberation:

1. Emit notification event to UI.
2. Attempt local fallback:
   - First `Qwen`
   - Then `Ollama`
3. If local unavailable:
   - Attempt configured cloud fallback list (in user-defined priority).
4. If all fail:
   - Return explicit deliberation failure with provider error chain.

All fallback transitions are logged to both observability tiers.

## 8) Observability Specification (Cross-Platform)

### 8.1 Dual-Tier Logging

Tier A: Full encrypted local event stream

- File: `full-events.log.enc`
- Contains full payloads, prompts, routing, scores, provider failures, overrides.
- Local-only, encrypted at rest.

Tier B: Redacted graph monitor feed

- File: `redacted-graph.ndjson`
- No plaintext sensitive content.
- Includes topology/timing/state for future live 3D graph.

### 8.2 Graph Event Schema (Tier B)

Each NDJSON event includes:

- `event_id`
- `trace_id`
- `parent_id`
- `timestamp`
- `node_id`
- `node_type`
- `edge_type`
- `action`
- `provider_selected`
- `provider_fallback_from`
- `provider_fallback_to`
- `status`
- `latency_ms`
- `similarity_score`
- `redaction_level`

### 8.3 Retention

- Both tiers retained for 90 days.
- Daily cleanup job deletes/compacts aged entries.

## 9) Security and Secrets

### 9.1 Secret Backends

Support both:

- OS keychain backend (preferred default when available).
- Encrypted local config backend (`config.json.enc`).

Application setting controls backend mode:

- `KeychainOnly`
- `EncryptedFileOnly`
- `DualWrite`

### 9.2 Encryption at Rest

- Full observability tier and encrypted config use authenticated encryption.
- Decryption keys loaded in-memory only during active session.

## 10) Tauri Command Contracts

Must exist:

- `invoke_genesis_rite(...)`
- `get_compute_options()`
- `set_global_compute_provider(provider_id)`
- `set_provider_priority(list)`
- `set_sensitive_compute_policy(UserChoice)`
- `submit_deliberation(query, provider_override?)`
- `get_provider_health()`
- `update_provider_config(provider_id, config)`
- `set_secrets_backend(mode)`
- `get_observability_status()`

## 11) Sprint Execution Plan

### Sprint 0

- Implement `SoulFile`/`SoulFacet` + forward-compatible extension fields.
- Genesis Crystal generation/signing.
- Base config and storage.

### Sprint 1

- Build `ComputeProvider` abstraction.
- Implement `QwenLocalProvider` and `OllamaProvider`.
- Wire `TorusLoop` to abstraction.

### Sprint 2

- Add OpenAI/Anthropic/Moonshot/Grok providers.
- Add global + per-deliberation provider switching.
- Implement user-choice sensitive routing UI.

### Sprint 3

- Add `MorpheusProvider` scaffolding and configuration path.
- Integrate provider priority and automatic fallback policy.

### Sprint 4

- Implement cross-platform dual-tier observability.
- Implement redacted graph schema and retention.
- Add failure notifications and routing telemetry.

### Sprint 5

- Complete Helios flow (FHE, Morpheus dispatch, local decrypt).
- Add invariants and integration tests for Helios path.

## 12) Acceptance Criteria

- User can complete setup with any configured provider option.
- If setup selection is skipped, Qwen 3.5 32B local profile is installed/configured.
- Deliberations can run using global provider or per-request override.
- Provider failure triggers automatic fallback according policy and surfaces notification.
- Logs are written cross-platform in dual tiers.
- 90-day retention works automatically.
- Full tier encrypted at rest, redacted tier graph-ready.
- Core constitutional invariants remain passing.

## 13) Non-Goals (for this implementation phase)

- Full Task Sub-Sphere runtime behavior.
- Specialist Lens tool registry execution.
- Lens Library UI/runtime synchronization.
- 3D visualization rendering itself (only telemetry compatibility is required now).
