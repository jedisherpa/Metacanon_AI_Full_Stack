# Obsidian Sovereign AI Governance System
## Handoff for Human Development Team (v3.0)

**Document Purpose**: This document provides the complete, final technical and strategic handoff for a human software development team. It is based exclusively on the `obsidian-implementation-spec-v1.md` and supersedes all previous handoff documents.

**Date**: March 04, 2026

---

## 1. Executive Vision & Project Goal

Obsidian is a **sovereign AI governance system**. The project's North Star is to create the **most capable personal agent ecosystem available**, where a user can deploy and govern a team of AI agents that perform tasks, learn from each other, and grow in capability over time.

The system is designed to be **offline-first, private, and constitutionally grounded**. The initial development goal is to produce a private, functional MVP for personal testing. The long-term goal is to release Obsidian as a flagship open-source project.

---

## 2. Core Architecture

### 2.1. Pluggable AI Compute Stack

The system will feature a pluggable compute stack with runtime switching, managed by the `src/compute.rs` module. The architecture supports a global default provider and per-deliberation overrides.

| Provider | Type | Default Local? |
| :--- | :--- | :--- |
| **Qwen 3.5 32B** | Local | **Yes** |
| Ollama | Local | No |
| Morpheus | Decentralized | No |
| OpenAI | Cloud | No |
| Anthropic | Cloud | No |
| Moonshot Kimi | Cloud | No |
| Grok (xAI) | Cloud | No |

If the user skips compute selection during setup, the system will automatically install and configure the `Qwen 3.5 32B` model.

### 2.2. Automatic Fallback Policy

A critical reliability feature is the automatic provider fallback policy. If the active provider fails, the system will:

1.  Emit a notification to the UI.
2.  Attempt to fall back to a local provider, trying **Qwen first**, then **Ollama**.
3.  If local providers fail, attempt to fall back to a user-configured priority list of cloud providers.
4.  If all fallbacks fail, the deliberation fails gracefully with a detailed error.

### 2.3. Dual-Tier Observability

The system will implement a cross-platform, dual-tier logging system with a 90-day retention policy, managed by `src/observability.rs`.

*   **Tier A: Full Encrypted Log (`full-events.log.enc`)**: Contains complete, unredacted payloads for local-only debugging. Encrypted at rest.
*   **Tier B: Redacted Graph Feed (`redacted-graph.ndjson`)**: Contains a stream of structured, plaintext-safe events (topology, timing, status) designed to feed a future 3D monitoring UI.

### 2.4. Hybrid Secrets Management

The `src/secrets.rs` module will support two backends for storing provider credentials, configurable by the user:

*   **OS Keychain (Preferred Default)**
*   **Encrypted Local Config File (`config.json.enc`)**

---

## 3. High-Level Sprint Plan

| Sprint | Primary Goal |
| :--- | :--- |
| **0** | **Genesis Core:** Implement `SoulFile`/`SoulFacet` with forward-compatibility hooks. Build the Genesis Rite UI and signing process. |
| **1** | **Local Compute:** Build the `ComputeProvider` abstraction. Implement the `QwenLocalProvider` and `OllamaProvider`. Wire the `TorusLoop` to the abstraction. |
| **2** | **Cloud Compute:** Add the OpenAI, Anthropic, Moonshot Kimi, and Grok providers. Implement global and per-deliberation provider switching. |
| **3** | **Reliability & Morpheus Scaffolding:** Implement the automatic fallback policy. Add the `MorpheusProvider` scaffolding and configuration UI. |
| **4** | **Observability:** Implement the full dual-tier, cross-platform logging system with its 90-day retention policy. |
| **5** | **Helios Integration:** Complete the full Morpheus FHE integration (the "Helios" flow) and add the final constitutional invariants. |

---

## 4. Constitutional Invariants

The following 10 invariants are non-negotiable. Any code that violates them is considered broken.

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

This document provides the definitive guide for the human development team. All work should align with this specification.
