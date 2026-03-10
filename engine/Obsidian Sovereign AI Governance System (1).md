# Obsidian Sovereign AI Governance System
## Handoff for Autonomous AI Agent (Codex) (v2.0)

**TO**: Autonomous AI Coding Agent (Codex)
**FROM**: Project Lead
**DATE**: March 04, 2026
**SUBJECT**: Amended Execution Orders for Obsidian Project, Integrating Morpheus/Helios

---

### **DIRECTIVE: READ AND INTEGRATE**

This document provides critical, authoritative amendments to your operating instructions for the Obsidian project. The existing source-of-truth documents located in the `/home/ubuntu/project_review/obsidian-handoff-v4/` directory remain your primary guide for execution. This document provides an overlay of new requirements that must be integrated into your plan.

---

### **1. REAFFIRMATION OF CORE MANDATE**

Your primary objective is unchanged: build a production-ready, offline-first Tauri desktop application named **Obsidian** that implements a sovereign AI governance system. You will complete all sprints in order, ensuring all tests and linting checks pass at each stage.

---

### **2. REAFFIRMATION OF OPERATING PROTOCOL**

Your operating loop is defined in `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/Implement.md`. You are to follow this protocol without deviation.

---

### **3. CRITICAL AMENDMENTS TO THE PLAN**

Incorporate the following amendments into your execution plan. These are not optional.

#### **AMENDMENT 1: REVISE AI COMPUTE ABSTRACTION LAYER (SPRINT 1)**

*   **WHEN:** During **Sprint 1**, before implementing the `TorusLoop` (Milestone 1.2).
*   **WHAT:** You must create a new file: `src/compute.rs`.
*   **IMPLEMENTATION:**
    1.  Inside `src/compute.rs`, define a public Rust trait named `ComputeProvider`.
    2.  This trait must have a method signature similar to: `fn get_embedding(&self, text: &str) -> Result<Vec<f64>, String>;` and `fn generate_response(&self, prompt: &str) -> Result<String, String>;`.
    3.  Create four public structs that implement the `ComputeProvider` trait:
        *   `MorpheusProvider`: This is the primary cloud option. Its `generate_response` method will be implemented in Sprint 5. For Sprint 1, it should return an `unimplemented!()` error.
        *   `CloudApiProvider`: Contains fields for an API key and endpoint URL.
        *   `LocalApiProvider`: Contains fields for an IP address and port.
        *   `OllamaProvider`: Interacts with a locally installed Ollama service.

#### **AMENDMENT 2: IMPLEMENT SYSTEM OBSERVABILITY LAYER (SPRINT 4)**

*   **WHEN:** During **Sprint 4**, as part of the integration work.
*   **WHAT:** You must implement a human-readable logging mechanism for all inter-agent communication.
*   **IMPLEMENTATION:**
    1.  Within the `SubSphereTorus` logic, intercept every `LensMessage` that is passed between agents.
    2.  For each message, serialize the entire `LensMessage` struct to a JSON string.
    3.  Append this JSON string as a new line to a log file. The path must be cross-platform, using Tauri's `app_log_dir()` API.

#### **AMENDMENT 3: DEPRIORITIZE 3D VISUALIZATION (ALL SPRINTS)**

*   **WHEN:** Throughout the entire project.
*   **WHAT:** You are to ignore the file `ObsidianGraph.tsx`.

#### **AMENDMENT 4: IMPLEMENT HELIOS INTEGRATION (SPRINT 5)**

*   **WHEN:** After completing Sprints 0-4.
*   **WHAT:** You will implement the full Morpheus integration as specified in `obsidian_morpheus_spec_final.md`.
*   **IMPLEMENTATION:**
    1.  Create `src/fhe.rs` using `tfhe-rs` for Fully Homomorphic Encryption.
    2.  Create `src/morpheus.rs` to handle all network interactions with the Morpheus Router.
    3.  Modify `src/genesis.rs`: Add `FhePublicKey` and a non-serializable `FhePrivateKey` to the `SoulFile`. Add `enable_morpheus_compute` and `morpheus_config` to `AIBoundaries`.
    4.  Modify `src/torus.rs`: In the `TorusLoop::run` method, wrap the compute call in the full Helios flow: `validate_action` -> `fhe::encrypt` -> `morpheus::dispatch_compute` -> `fhe::decrypt` -> `MerkleDAG::log`.
    5.  Add the new dependencies (`tfhe`, `reqwest`) to `Cargo.toml`.

---

### **4. REAFFIRMATION OF CONSTITUTIONAL INVARIANTS**

Your adherence to the project's constitutional invariants is paramount. The original seven invariants are now supplemented by three new ones for the Helios integration.

*   **Invariant 8: Pre-Validation Mandate:** `validate_action()` must succeed before any network dispatch.
*   **Invariant 9: Encryption Mandate:** All external payloads must be `FheCiphertext`.
*   **Invariant 10: Private Key Locality:** The `FhePrivateKey` must never be serialized or leave the local device.

Any violation is a critical failure. Proceed with your operating protocol, beginning with Sprint 0.

**EXECUTE.**
