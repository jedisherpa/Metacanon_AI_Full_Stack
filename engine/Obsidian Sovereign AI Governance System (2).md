# Obsidian Sovereign AI Governance System
## Handoff for Human Development Team (v2.0)

**Document Purpose**: This document provides a comprehensive technical and strategic handoff for a human software development team tasked with building the Obsidian application. It synthesizes the original project specification with key stakeholder clarifications to provide a clear and actionable plan.

**Date**: March 04, 2026

---

## 1. Executive Vision & Project Goal

Obsidian is a **sovereign AI governance system**. The project's North Star is to create the **most capable personal agent ecosystem available**, where a user can deploy and govern a team of AI agents that perform tasks, learn from each other, and grow in capability over time.

The system is designed to be **offline-first, private, and constitutionally grounded**. The user, termed a **Perspective Lens (PL)**, retains absolute sovereignty over their AI agents, termed **Contact Lenses (CLs)**. This relationship is not merely a design pattern; it is a set of hard, architectural constraints enforced by cryptographic and constitutional logic.

The initial development goal is to produce a private, functional MVP for personal testing. The long-term goal is to release Obsidian as a flagship open-source project.

---

## 2. Core Architectural Decisions

Based on stakeholder feedback, the following architectural decisions are now considered canonical for the project:

### 2.1. Flexible AI Compute Abstraction with Morpheus as Primary Cloud Option

The system must not have a hard dependency on a single type of LLM. A dedicated **AI Compute Abstraction Layer** must be implemented in `src/compute.rs`. This layer will define a `ComputeProvider` trait and offer multiple concrete implementations. The **Morpheus AI network is the primary, preferred cloud compute option**, integrated via the "Helios" architecture.

| Provider | Implementation Details |
| :--- | :--- |
| `MorpheusProvider` | **(Primary Cloud Option)** Interacts with the Morpheus decentralized compute network. Requires Fully Homomorphic Encryption (FHE) for all transmissions. The user provides a wallet address and sets a max price in MOR tokens. |
| `CloudApiProvider` | (Legacy/Alternative) Interacts with any standard OpenAI-compatible API endpoint. Requires configuration for an API key and endpoint URL. |
| `LocalApiProvider` | Interacts with a self-hosted model on the local network. Requires configuration for an IP address and port. |
| `OllamaProvider` | Manages a locally installed Ollama instance. The system should be able to detect the Ollama installation and allow the user to select from available models. |

This module is a **Sprint 1 priority** and must be implemented before the core deliberation loop.

### 2.2. Comprehensive Observability

To enable monitoring and future dashboard development, the system must implement **human-readable logging for all inter-agent communications**. While the MerkleDAG ensures cryptographic integrity, it is not suitable for debugging or behavioral analysis.

A new logging mechanism must be introduced in **Sprint 4** to capture every `LensMessage` passed within the `SubSphereTorus`. Each message should be serialized to a structured format (e.g., JSON) and appended to a dedicated log file (e.g., `governance_trace.log`). This log must be easily parsable and provide a clear audit trail of agent-to-agent interactions.

### 2.3. Deprioritization of 3D Visualization

The `ObsidianGraph.tsx` component, while visually compelling, is **not part of the initial MVP**. It is a peripheral feature to be considered for a future release. The core UI will be a functional, 2D interface built with standard web technologies within the Tauri webview.

---

## 3. Technology Stack

| Component | Technology | Version |
| :--- | :--- | :--- |
| Core Language | Rust | 2021 Edition |
| Desktop UI | Tauri | 1.5.4 |
| FHE (Sprint 5) | tfhe-rs | 0.6 |
| WASM Runtime | Wasmtime | 18.0 |
| Local Database | rusqlite | 0.30.0 |
| Hashing | blake3 | 1.5.0 |
| Signatures | ed25519-dalek | 2.1.0 |
| Serialization | serde / serde_json | 1.0.196 / 1.0.113 |
| gRPC (Sprint 4) | tonic | 0.11 |

---

## 4. High-Level Sprint Plan

This plan outlines the primary goals for each sprint. The full, detailed Rust implementation and data structures are specified in the `OBSIDIAN_HANDOFF_FINAL_v4.md` reference document.

### Sprints 0-4 (Core MVP)

*   **Sprint 0: Genesis:** Build the standalone Tauri app and the one-time "Genesis Rite" UI.
*   **Sprint 1: Core Runtime & Compute Abstraction:** Implement the AI Compute Abstraction Layer and the core deliberation loop.
*   **Sprint 2: Delegation and Merit Layer:** Build the infrastructure for managing teams of agents and enabling them to learn.
*   **Sprint 3: Federation:** Implement the logic for multi-user collaboration and scheduled governance rituals.
*   **Sprint 4: Integration & Observability:** Integrate all systems and implement the crucial observability layer.

### Sprint 5: Helios (Morpheus Integration)
*   **Goal:** Integrate the Morpheus AI network as a secure, decentralized compute provider.
*   **Deliverables:**
    *   A new `src/fhe.rs` module for Fully Homomorphic Encryption using `tfhe-rs`.
    *   A new `src/morpheus.rs` module to handle all interactions with the Morpheus network.
    *   Updates to `src/genesis.rs` to include FHE key generation during the Genesis Rite and a `MorpheusConfig` struct in `AIBoundaries`.
    *   Integration into `src/torus.rs` to wrap the compute step in the strict "Local-Validate, Remote-Compute" data flow.

---

## 5. Constitutional Invariants (Non-Negotiable)

This project is as much about philosophy as it is about code. The following invariants, derived from the project's constitution, are **hard requirements**. Any code that violates them is considered broken, even if it compiles and passes tests.

1.  **Sovereignty is Irreducible:** The user (PL) is always the ultimate authority.
2.  **Delegations are Revocable:** Every agent delegation must be tied to a `revocation_token`.
3.  **AI Cannot Rate Humans:** The `MeritMetrics` system is strictly for agent-to-agent peer review.
4.  **Actions Must Be Validated:** All agent actions must be validated against the user's `WillVector` using cosine similarity.
5.  **Federations are Bounded:** A `FractalSeed` federation must contain between 2 and 7 users.
6.  **The Ledger is Append-Only:** The `MerkleDAG` is immutable.
7.  **No Self-Rating:** An agent cannot rate itself in the `MeritMetrics` system.

### Helios-Specific Invariants (from the Morpheus Spec)

8.  **Pre-Validation Mandate:** A network request to an external compute provider must not be initiated until `validate_action()` has returned `Ok(())` for the current query.
9.  **Encryption Mandate:** Any data payload sent to an external compute provider must be an `FheCiphertext` object. Plaintext transmission is a constitutional violation.
10. **Private Key Locality:** The `FhePrivateKey` must never be serialized, cloned outside of `SoulFile`'s internal scope, or transmitted over any network interface.

This project represents a unique opportunity to build a truly novel agentic ecosystem. Success requires not only technical excellence but also a deep appreciation for the constitutional principles that underpin the entire architecture.
