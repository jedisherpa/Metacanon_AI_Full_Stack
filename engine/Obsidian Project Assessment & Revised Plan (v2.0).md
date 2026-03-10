# Obsidian Project Assessment & Revised Plan (v2.0)

**Prepared for**: Project Stakeholder
**Prepared by**: Manus AI (as Team Lead)
**Date**: March 04, 2026

## 1. Introduction & Purpose

This document provides a revised assessment of the **Obsidian Sovereign AI Governance System** project. It incorporates the critical clarifications provided on March 4, 2026, resolving the open questions from the initial v1 assessment. The primary purpose of this document is to serve as the new source of truth for the project, providing clear, distinct guidance for both a human development team and an autonomous AI coding agent.

Your feedback has been instrumental in clarifying the project's strategic intent and key architectural decisions. This document reflects that clarity.

## 2. Executive Summary & Core Decisions

The initial review identified Obsidian as an exceptionally well-documented but highly ambitious project to create a standalone, sovereign AI governance application. The primary open questions revolved around technical feasibility (local LLMs), team structure (human vs. AI), and strategic goals. Your clarifications have resolved these ambiguities, leading to the following core architectural and strategic decisions:

| Area | Initial Question | Resolution / Decision |
| :--- | :--- | :--- |
| **AI/LLM Strategy** | How to handle the dependency on local LLMs? | The system will be architected for flexible AI compute. It must support: (1) API access to cloud models, (2) API access to a self-hosted model (e.g., on a local server), and (3) local installation of an Ollama instance (7B, 13B, or 70B). This removes the hard dependency on a single, embedded local model. |
| **Development Team** | Are humans or AI agents building this? | Both. The project handoff will be formally split into two distinct paths: one for a human development team and one for an autonomous AI agent (e.g., Codex), with the latter intended as the primary build path under human supervision. |
| **System Visibility** | How can we monitor the system's emergent behavior? | All inter-agent and component-to-component communications must be logged in a structured, human-readable format. This ensures full transparency and provides the necessary data to build a future monitoring dashboard. |
| **3D Visualization** | Is the `ObsidianGraph.tsx` component part of the core UI? | No. The 3D visualization is a peripheral concept to be considered for a post-MVP (Minimum Viable Product) release. It is not part of the initial build. |
| **Project Goal** | What is the long-term vision? | The initial goal is to create a private, working version for personal testing and validation. The ultimate long-term goal is to release it as an open-source project. |
| **Success Metric** | What is the ultimate measure of success? | The project's North Star is to create the most capable personal agent ecosystem available, where agents can perform tasks, learn from each other, and grow in capability and consistency. |

---

## 3. Handoff for Human Development Team

This section outlines the project for a traditional software development team. It focuses on the high-level architecture, sprint goals, and key technical challenges, abstracting away the granular, step-by-step instructions intended for the AI agent.

### 3.1. Project Overview

Obsidian is a Rust-based, offline-first Tauri desktop application for sovereign AI governance. The user, or "Perspective Lens," defines their core principles in a "SoulFile," which then governs the behavior of all subordinate AI "Contact Lenses." The system is built on a foundation of cryptographic integrity and constitutional principles, ensuring the user retains absolute control.

### 3.2. Core Architecture

- **Frontend:** Tauri (Rust backend, webview frontend with HTML/CSS/JS).
- **Backend:** Rust (Edition 2021).
- **Database:** Local SQLite via `rusqlite` for the governance ledger.
- **Cryptography:** `blake3` for hashing, `ed25519-dalek` for signatures.
- **AI Compute Abstraction:** A new module (`src/compute.rs`) must be created to handle interactions with LLMs. This module will have a unified interface but multiple implementations:
    - `CloudApiProvider`: Interacts with a standard OpenAI-compatible API endpoint.
    - `LocalApiProvider`: Interacts with a local server endpoint (e.g., a separate machine running a model).
    - `OllamaProvider`: Manages a local Ollama instance.
    The application configuration must allow the user to select and configure their desired provider.

### 3.3. Sprint Goals (High-Level)

- **Sprint 0: Genesis:** Build the core application shell and the "Genesis Rite" UI. Implement the data structures for the SoulFile and the local SQLite database.
- **Sprint 1: Core Runtime:** Implement the Contact Lens spawning logic and the main "Torus Loop" for deliberation. Integrate the AI Compute Abstraction layer for action validation.
- **Sprint 2: Delegation & Merit:** Implement the "SphereEngine" for managing teams of lenses and the `MeritMetrics` system for peer-to-peer AI rating.
- **Sprint 3: Federation:** Build the local simulation for multi-user federation (`FractalSeed`) and the `OathEcho` ritual for maintaining AI alignment.
- **Sprint 4: Integration & Observability:** Integrate all components. Implement the `LiturgicalEngine` for scheduled tasks. Crucially, ensure all inter-agent messages (e.g., within the `SubSphereTorus`) are logged to a human-readable log file or dedicated database table.

### 3.4. Key Technical Challenges

1.  **AI Compute Abstraction Layer:** Designing a clean, robust interface that can gracefully handle the different configurations (API keys for cloud, local IP addresses, Ollama management) will be critical.
2.  **Observability Hooks:** Implementing the logging for all inter-agent communication requires careful integration with the core logic (e.g., `TorusLoop`, `SubSphereTorus`) without adding significant performance overhead.
3.  **Constitutional Integrity:** The development team must deeply understand and respect the project's constitutional invariants (e.g., no self-rating, revocable delegations). This requires more than just coding; it requires a commitment to the project's philosophy.

---

## 4. Handoff for Autonomous AI Agent (Codex)

This section is intended for a sophisticated autonomous AI coding agent. It preserves the original, highly-detailed, step-by-step instructions provided in the `scaffold/` directory.

### 4.1. Entry Point & Operating Loop

The AI agent's entry point is `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/AGENTS.md`. The agent must follow the operating loop defined in `/home/ubuntu/project_review/obsidian-handoff-v4/scaffold/Implement.md` precisely:

> 1.  READ the milestone in `Plan.md`
> 2.  READ the relevant section of `Prompt.md` (spec)
> 3.  READ the relevant section of `OBSIDIAN_HANDOFF_FINAL_v4.md` (reference implementation)
> 4.  WRITE tests first (TDD)
> 5.  WRITE implementation code to pass the tests
> 6.  RUN validation commands
> 7.  FIX any failures immediately
> 8.  UPDATE `Documentation.md`
> 9.  MOVE to next milestone

### 4.2. Critical Modifications to the Plan

The AI agent must incorporate the following high-level directives, which modify the original plan:

1.  **Implement AI Compute Abstraction:** During Sprint 1, before implementing the `TorusLoop`, the agent must first create a new module `src/compute.rs`. This module will define a `ComputeProvider` trait and several structs implementing it, as described in Section 3.2. The `validate_action` function will then use this abstraction layer instead of a hardcoded local model.
2.  **Implement Observability Logging:** During Sprint 4, when implementing the `LiturgicalEngine` and integrating the `SubSphereTorus`, the agent must ensure that every message passed between lenses (e.g., `LensMessage`) is serialized to a human-readable format (e.g., JSON) and appended to a log file (`/home/ubuntu/obsidian_logs/governance_trace.log`).
3.  **Deprioritize 3D Visualization:** The agent must ignore the `ObsidianGraph.tsx` file. It is not to be integrated into the Tauri UI.

### 4.3. Source of Truth

For the AI agent, the sources of truth remain as specified in the original handoff, in order of precedence:

1.  `Prompt.md` (The frozen spec)
2.  `Plan.md` (The milestone plan)
3.  `Implement.md` (The operational runbook)
4.  `OBSIDIAN_HANDOFF_FINAL_v4.md` (The reference implementation)

This revised assessment provides the strategic overlay, but the detailed execution must still follow these foundational documents, amended by the critical modifications listed above.

## 5. Conclusion

With these clarifications, the Obsidian project is now well-defined and actionable. The path is clear for a dual-track development process, leveraging an autonomous AI agent for the primary build while maintaining a clear, high-level specification for human oversight and potential intervention. The project remains ambitious, but the risks are now better understood and the strategic goals are clear. My team is ready to proceed based on this revised plan.
