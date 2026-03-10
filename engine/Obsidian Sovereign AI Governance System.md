# Obsidian Sovereign AI Governance System
## Handoff for Autonomous AI Agent (Codex) (v1.0)

**TO**: Autonomous AI Coding Agent (Codex)
**FROM**: Project Lead
**DATE**: March 04, 2026
**SUBJECT**: Amended Execution Orders for Obsidian Project

---

### **DIRECTIVE: READ AND INTEGRATE**

This document provides critical, authoritative amendments to your operating instructions for the Obsidian project. The existing source-of-truth documents located in the `/home/ubuntu/project_review/obsidian-handoff-v4/` directory remain your primary guide for execution. This document provides an overlay of new requirements that must be integrated into your plan.

---

### **1. REAFFIRMATION OF CORE MANDATE**

Your primary objective is unchanged: build a production-ready, offline-first Tauri desktop application named **Obsidian** that implements a sovereign AI governance system. You will complete all five sprints in order, ensuring all tests and linting checks pass at each stage.

---

### **2. REAFFIRMATION OF OPERATING PROTOCOL**

Your operating loop is defined in `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/Implement.md`. You are to follow this protocol without deviation. The order of precedence for your source-of-truth documents is also unchanged:

1.  `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/Prompt.md` (The frozen spec)
2.  `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/Plan.md` (The milestone plan)
3.  `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/Implement.md` (The operational runbook)
4.  `/home/ubuntu/project_review/OBSIDIAN_HANDOFF_FINAL_v4.md` (The reference implementation)

---

### **3. CRITICAL AMENDMENTS TO THE PLAN**

Incorporate the following three amendments into your execution plan. These are not optional.

#### **AMENDMENT 1: IMPLEMENT AI COMPUTE ABSTRACTION LAYER**

*   **WHEN:** During **Sprint 1**, before implementing the `TorusLoop` (Milestone 1.2).
*   **WHAT:** You must create a new file: `src/compute.rs`.
*   **IMPLEMENTATION:**
    1.  Inside `src/compute.rs`, define a public Rust trait named `ComputeProvider`.
    2.  This trait must have a method signature similar to: `fn get_embedding(&self, text: &str) -> Result<Vec<f64>, String>;` and `fn generate_response(&self, prompt: &str) -> Result<String, String>;`.
    3.  Create three public structs that implement the `ComputeProvider` trait:
        *   `CloudApiProvider`: Contains fields for an API key and endpoint URL. Its methods will make network requests to an external LLM API.
        *   `LocalApiProvider`: Contains fields for an IP address and port. Its methods will make network requests to a local network endpoint.
        *   `OllamaProvider`: Its methods will interact with a locally installed Ollama service.
    4.  Update all functions that require LLM interaction (e.g., `validate_action`, response generation) to use a configurable instance of a `ComputeProvider` instead of a hardcoded model.

#### **AMENDMENT 2: IMPLEMENT SYSTEM OBSERVABILITY LAYER**

*   **WHEN:** During **Sprint 4**, as part of the integration work.
*   **WHAT:** You must implement a human-readable logging mechanism for all inter-agent communication.
*   **IMPLEMENTATION:**
    1.  Within the `SubSphereTorus` logic, intercept every `LensMessage` that is passed between agents.
    2.  For each message, serialize the entire `LensMessage` struct to a JSON string.
    3.  Append this JSON string as a new line to a log file located at `/home/ubuntu/obsidian_logs/governance_trace.log`. Ensure the directory is created if it does not exist.
    4.  This logging action must be in addition to, not a replacement for, the existing MerkleDAG governance log.

#### **AMENDMENT 3: DEPRIORITIZE 3D VISUALIZATION**

*   **WHEN:** Throughout the entire project.
*   **WHAT:** You are to ignore the file `ObsidianGraph.tsx`.
*   **IMPLEMENTATION:**
    1.  Do not read, analyze, or attempt to integrate the `ObsidianGraph.tsx` component into the Tauri application UI.
    2.  The core UI should be a functional 2D interface based on the product specifications in the `docs/product-specs/` directory.

---

### **4. REAFFIRMATION OF CONSTITUTIONAL INVARIANTS**

Your adherence to the project's constitutional invariants is paramount. Any violation is a critical failure. Remember:

*   **Sovereignty is Irreducible.**
*   **Delegations are Revocable.**
*   **AI Cannot Rate Humans.**
*   **Actions Must Be Validated via Cosine Similarity.**
*   **Federations are Bounded (2-7 PLs).**
*   **The Ledger is Append-Only.**

---

### **CONCLUSION**

Your mission is to build the Obsidian system as specified, incorporating these amendments. The ultimate goal is a capable, robust, and constitutionally sound personal agent ecosystem. Proceed with your operating protocol, beginning with Sprint 0.

**EXECUTE.**
