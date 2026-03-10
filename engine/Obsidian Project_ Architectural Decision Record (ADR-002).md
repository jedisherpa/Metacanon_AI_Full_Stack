# Obsidian Project: Architectural Decision Record (ADR-002)

**Date**: March 04, 2026
**Status**: Superseded by ADR-003

## 1. Context

Following a thorough review of all project artifacts (`Yo.zip`) and two rounds of stakeholder clarification, a set of 17 critical, low-level architectural questions were identified. These questions represent conflicts, ambiguities, or missing details in the existing documentation. This Architectural Decision Record (ADR) provides the single, authoritative answer to each question. All development, whether by a human team or an autonomous agent, must adhere to these decisions.

## 2. Decisions

### 2.1. Governance & Document Precedence

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | **Document Precedence:** Which document wins in a conflict: `Prompt.md`, `Plan.md`, product specs, or the amendment memo? | The order of precedence is: **1. This ADR (ADR-002)** > **2. The Amendment Memo (`AI_AGENT_HANDOFF.md`)** > **3. `Prompt.md`** > **4. All other documents**. This ADR is the final word. The amendment memo provides the strategic overlay. `Prompt.md` is the frozen technical spec. All other documents are for context and reference. |
| 2 | **Stale References:** Should all references to `OBSIDIAN_HANDOFF_FINAL_v3.md` be treated as stale? | **Yes.** All `v3` references are stale. The canonical reference implementation is `OBSIDIAN_HANDOFF_FINAL_v4.md`. |

### 2.2. Core Types & Scope

| # | Question | Decision |
| :--- | :--- | :--- |
| 3 | **Canonical Core Type:** Is the core type `PerspectiveLens` or `SoulFacet`? | The canonical user-facing term is **`PerspectiveLens` (PL)**. The internal Rust struct that holds the user's vision, territories, and duties is **`SoulFacet`**. A `SoulFile` contains a `Vec<SoulFacet>`. This distinction, introduced in `v4`, is now considered canonical. |
| 4 | **Sub-Sphere Scope:** Is the Task Sub-Sphere (SpecialistLens, tool registry, etc.) in scope for the first build? | **No.** The entire Task Sub-Sphere, SpecialistLens (PCL), tool registry, and lens library are **out of scope for the initial MVP (Sprints 0-4)**. The focus is on the core PL -> CL relationship. Sub-spheres are a Phase 2 feature. |
| 5 | **Active Silence Override:** Should Active Silence be overridable by the user? | **Yes.** The `user-interaction-spec.md` explicitly defines an override flow: `[Override — I understand the risk]`. This is a critical feature for user sovereignty. The override must be logged to the MerkleDAG as a distinct `ACTIVE_SILENCE_OVERRIDE` event. The veto is not absolute; it is a strong, default safeguard. |

### 2.3. Network & Inference

| # | Question | Decision |
| :--- | :--- | :--- |
| 6 | **Cloud Support:** `Prompt.md` forbids external LLM calls, but the amendment requires a `CloudApiProvider`. How to resolve? | The amendment supersedes `Prompt.md`. The system **must** support cloud providers via the `ComputeProvider` abstraction. However, to honor the project's offline-first principle, this feature **must be disabled by default**. The user must explicitly enable it and provide an API key in the application's configuration. |
| 7 | **Localhost Network Calls:** Are localhost HTTP calls (for local API/Ollama) allowed under the “no network” rule? | **Yes.** The “no network” rule in `Prompt.md` is clarified to mean **no external, internet-facing network calls by default**. Localhost and local network (e.g., 192.168.x.x) communication for the `LocalApiProvider` and `OllamaProvider` is explicitly permitted and is essential for the flexible compute strategy. |
| 8 | **Primary Inference Path:** What is the primary inference path for v1? | The primary and only inference path is the new **`ComputeProvider` abstraction layer**. The previous concepts of direct Llama.cpp integration or Python FFI for sentence-transformers are now deprecated. All embedding and generation calls must go through this unified interface. |

### 2.4. Genesis & Data Structures

| # | Question | Decision |
| :--- | :--- | :--- |
| 9 | **Canonical Genesis API:** `run_genesis_rite(vision, territories, duties)` or `invoke_genesis_rite([...6 fields...])`? | The canonical API is the simpler one implied by the `genesis-rite-ux.md` spec. The Tauri command should be `invoke_genesis_rite(vision: String, territories: String, duties: String)`. The backend will construct the `SoulFile` from these core inputs. The more complex 6-field version is stale. |
| 10 | **Required SoulFile Fields:** Which fields are required at Genesis in Sprint 0? | For Sprint 0, the `SoulFile` must be populated with: `vision_core`, `core_values` (derived from territories/duties), a default `ai_boundaries` struct, an empty `ratchet`, and a stubbed `will_vector`. `fractal_seed` must be `None`. The goal is to create a valid, signed `SoulFile` with the minimal required data. |
| 11 | **ID Standardization:** Should IDs be `String` or `[u8; 32]`? | All IDs (`pl_id`, `contact_id`, etc.) will be **`String`**. While `[u8; 32]` is more efficient for hashes, using `String` (specifically, the hex-encoded representation of the hash) is vastly simpler for serialization, UI integration, and debugging. The performance difference is negligible for this application. |
| 12 | **Delegation UX Mapping:** How do “temporary/permanent/none” delegation options map to the “always revocable” invariant? | This is a critical distinction between UX and architecture. **Architecturally**, all delegations are revocable via their `revocation_token`. **In the UX**, the terms map as follows: **`None`** = No delegation. **`Temporary`** = A delegation with a scheduled `RevocationRite` logged in the `LiturgicalEngine`. **`Permanent`** = A delegation with no scheduled revocation. The user can still manually trigger the `RevocationRite` for a "permanent" delegation at any time. |
| 13 | **PCL/Specialist Support:** Is PCL support required in Sprint 0 data structures? | **No.** Since Task Sub-Spheres are out of scope for the MVP, all related data structures (`SpecialistLens`, `PCL`, `LensKind::PerspectiveContactLens`) should be removed from the Sprint 0-4 build to reduce complexity. The focus is solely on `ContactLens`. |

### 2.5. Implementation Details

| # | Question | Decision |
| :--- | :--- | :--- |
| 14 | **Observability Path:** The amendment's log path is Ubuntu-specific. Should this be cross-platform? | **Yes.** The path must be made cross-platform and configurable. The default log location should be within the user's standard application data directory, retrievable via Tauri's `path` API (e.g., `app_log_dir()`). |
| 15 | **Transactional Logging:** Require strict transactional coupling between MerkleDAG writes and JSONL observability logging? | **No.** Strict transactional coupling would add significant complexity. The two logs serve different purposes: the MerkleDAG is for constitutional integrity, and the JSONL is for human-readable debugging. They should be written sequentially. If the JSONL write fails, it should be logged as a system error, but it should not roll back the MerkleDAG write. |
| 16 | **Tool Scope Enforcement:** What is the exact policy for tool scope enforcement? | This is deferred, as the tool registry is part of the out-of-scope Task Sub-Sphere. However, for future reference, the policy will be: **Canonical absolute path prefix checks**. Glob patterns are too ambiguous. The system will resolve all paths to their canonical, absolute form and check if they are a child of the allowed directory. Symlinks will be followed and their final target resolved before checking. |
| 17 | **Secrets Management:** Where should provider secrets/config live? | Secrets (e.g., `CloudApiProvider` API key) and configuration (e.g., which provider to use) will be stored in a **user-editable, encrypted local configuration file** (e.g., `config.json.enc`) within the application's data directory. The application will hold the decryption key in memory at runtime. Environment variables are not suitable for a desktop application. |

## 3. Consequences

These decisions provide the clarity needed to begin development. They simplify the initial MVP by deferring the complex Task Sub-Sphere, resolve critical conflicts in the documentation, and establish a clear technical path forward for networking, inference, and data modeling. The project is now in a state where a development team can proceed with a high degree of confidence and a low degree of ambiguity.
