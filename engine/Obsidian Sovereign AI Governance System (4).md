# Obsidian Sovereign AI Governance System
## Handoff for Autonomous AI Agent (Codex) (v3.0)

**TO**: Autonomous AI Coding Agent (Codex)
**FROM**: Project Lead
**DATE**: March 04, 2026
**SUBJECT**: Final, Authoritative Execution Orders for Obsidian Project

---

### **DIRECTIVE: EXECUTE AS SPECIFIED**

This document provides your final and authoritative operating instructions. It is based exclusively on `obsidian-implementation-spec-v1.md`. All previous handoff documents and ADRs are now superseded and must be ignored. Your single source of truth for implementation is the v1 spec.

---

### **1. CORE MANDATE**

Your primary objective is to build a production-ready, offline-first Tauri desktop application named **Obsidian**. You will complete all six sprints in the specified order, ensuring all tests and linting checks pass at each stage. The final output must be a direct and complete implementation of the v1 spec.

---

### **2. SPRINT EXECUTION PLAN**

Execute the following sprints in order:

*   **Sprint 0: Genesis Core:** Implement `SoulFile`/`SoulFacet` with forward-compatibility hooks. Build the Genesis Rite UI and signing process.
*   **Sprint 1: Local Compute:** Build the `ComputeProvider` abstraction. Implement the `QwenLocalProvider` and `OllamaProvider`. Wire the `TorusLoop` to the abstraction.
*   **Sprint 2: Cloud Compute:** Add the OpenAI, Anthropic, Moonshot Kimi, and Grok providers. Implement global and per-deliberation provider switching.
*   **Sprint 3: Reliability & Morpheus Scaffolding:** Implement the automatic fallback policy. Add the `MorpheusProvider` scaffolding and configuration UI.
*   **Sprint 4: Observability:** Implement the full dual-tier, cross-platform logging system with its 90-day retention policy.
*   **Sprint 5: Helios Integration:** Complete the full Morpheus FHE integration (the "Helios" flow) and add the final constitutional invariants.

---

### **3. CRITICAL IMPLEMENTATION DIRECTIVES**

*   **Compute Providers:** You must implement all seven providers (`Qwen`, `Ollama`, `Morpheus`, `OpenAI`, `Anthropic`, `Moonshot Kimi`, `Grok`) in their respective sprints. If the user skips setup, you must implement the logic to auto-install and configure the `Qwen 3.5 32B` model.
*   **Fallback Policy:** The `TorusLoop` must contain the full, multi-stage fallback logic as specified: attempt active provider, then local (Qwen -> Ollama), then cloud (user-defined priority).
*   **Observability:** You must create the `src/observability.rs` module and implement the dual-tier logging system precisely as defined, including the 90-day retention job.
*   **Secrets Management:** You must create the `src/secrets.rs` module and implement support for both OS keychain and encrypted file backends, including the `DualWrite` mode.
*   **Data Model:** The `SoulFile` struct must include the `future_sub_sphere_registry`, `future_lens_library_manifest`, and `extensions` fields, even though they will be unused in this build.
*   **Tauri Commands:** You must expose all 10 Tauri commands listed in Section 10 of the v1 spec.

---

### **4. CONSTITUTIONAL INVARIANTS**

Your adherence to the following 10 constitutional invariants is paramount. Any violation is a critical failure.

1.  **Sovereignty is Irreducible.**
2.  **Delegations are Revocable.**
3.  **AI Cannot Rate Humans.**
4.  **Actions Must Be Validated.**
5.  **Federations are Bounded.**
6.  **The Ledger is Append-Only.**
7.  **No Self-Rating.**
8.  **Helios: Pre-Validation Mandate.**
9.  **Helios: Encryption Mandate.**
10. **Helios: Private Key Locality.**

---

### **CONCLUSION**

Your mission is to build the Obsidian system as specified in `obsidian-implementation-spec-v1.md`. No deviation is permitted. Proceed with your operating protocol, beginning with Sprint 0.

**EXECUTE.**
