# MetaCanon — Technical Brief for the Codex Team

**Date:** 2026-03-05
**Prepared by:** Manus AI (Independent Developer Evaluation)
**Subject:** Full Codebase Review, Project Decomposition Instructions, GitHub Migration Plan, and Website Live Code Backend Specification

---

## Section 1: What We Found — Full Developer Evaluation

This section is a complete account of what was discovered during a thorough review of the MetaCanon codebase. It is intended to give the codex team full situational awareness of the system's current state before any decomposition work begins.

### 1.1. Overall Architecture

The MetaCanon system is a sovereign AI platform built across three independent but interconnected sub-projects, all of which currently live in a single code bundle. The system is designed around the principle that a human user (the "Perspective Lens") maintains sovereign control over a set of AI agents (each a "Contact Lens"), governed by a constitutional document called the `SoulFile`. Every major design decision in the codebase flows from this foundational principle.

The three sub-projects are:

| Sub-Project | Technology Stack | Role in the System |
| :--- | :--- | :--- |
| `core` | Rust (library + CLI) | The constitutional engine. Defines all data structures, rules, and the Genesis Rite. |
| `sphere-thread-engine` | Node.js, TypeScript, React | The communication and orchestration layer for multi-agent threads. |
| `installer-ui/desktop` | React, TypeScript, Tauri | The local desktop installer that bootstraps the entire system for a new user. |

The three projects are designed to work together in a specific way. The `core` Rust library is compiled into a binary that the `installer-ui/desktop` Tauri backend calls directly via `#[tauri::command]` functions. The `sphere-thread-engine` is a separate server process that runs alongside the core, providing the real-time WebSocket and HTTP API layer for agent communication. The `installer-ui` is the user's entry point, which sets up the `core` and configures the `sphere-thread-engine` during the initial installation process.

### 1.2. The `core` Rust Library — Detailed Findings

The `core` is the most important component. It is an 18,105-line Rust codebase containing 25 source files across 16 modules. It is both a library (`lib.rs`) and a binary (`main.rs`), meaning it can be used as a dependency by other Rust projects (like the Tauri backend) and also run directly as a CLI tool.

The 16 modules can be grouped into six logical layers, which are described in detail in Section 2.2.1. The most critical modules are:

**`genesis.rs` (556 lines):** This is the constitutional heart of the system. It defines the `SoulFile` struct, which is the user's sovereign operating document. The `SoulFile` contains the user's `vision_core` (a statement of purpose), `core_values`, `will_directives` (rules the AI must follow), and a `genesis_hash` that is computed over all of this content to ensure its integrity. The Genesis Rite is the process of creating this file. It is a seven-step process visualized on the website.

**`torus.rs` (559 lines):** Implements the `DeliberationTorus`, the AI provider routing and fallback mechanism. When the system needs to call an AI model, it goes through the Torus, which tries providers in a defined priority order. If the primary provider fails, it falls back to the next one, and so on. This ensures the system is resilient to individual provider outages.

**`compute.rs` (726 lines):** Defines the `ComputeRouter` and the `ProviderHealth` struct. It manages a registry of all configured AI providers (OpenAI, Anthropic, Grok, Moonshot Kimi, Ollama, and a local Qwen model) and routes requests to them. It defines the `ProviderKind` enum (`Local`, `Cloud`, `Decentralized`), which is central to the system's local-first philosophy.

**`fhe.rs` (334 lines):** Implements a simulated Fully Homomorphic Encryption (FHE) scheme called "helios-sim-fhe-v1". The `FhePrivateKey` struct is intentionally designed to be non-serializable and non-cloneable at the type level, which enforces the rule that private keys can never leave the user's local machine. This is a critical security invariant.

**`secrets.rs` (630 lines):** Manages the storage of API keys and other secrets. It supports three backend modes: `KeychainOnly` (using the OS keychain), `EncryptedFileOnly` (using an AES-encrypted file), and `DualWrite` (writing to both simultaneously for redundancy).

**`observability.rs` (683 lines):** Implements a dual-tier logging system. It writes a fully detailed, encrypted event log (`full-events.log.enc`) and a redacted, public-safe graph feed (`redacted-graph.ndjson`). The default retention policy is 90 days.

**`communications.rs` (2,516 lines — the largest module):** Manages all external communication integrations. It supports Telegram (with full bot API, webhook, and polling support), Discord (with a full Gateway lifecycle state machine including reconnection logic), and an in-app communication channel. This module is the most complex in the codebase.

**`ui.rs` (4,611 lines — the single largest file):** This is the command surface layer that exposes all core functionality to the Tauri frontend. It defines the `UiCommandRuntime` struct and all the functions that the `#[tauri::command]` handlers in `main.rs` call. It is the bridge between the Rust world and the React UI world.

### 1.3. The `sphere-thread-engine` — Detailed Findings

This is an 18,566-line TypeScript/Node.js project. It is a monorepo within the main monorepo, containing three distinct sub-projects: the backend `engine`, the `skins/council-nebula` frontend, and the `tma` (Telegram Mini App) frontend.

**`engine/src/sphere/conductor.ts` (1,323 lines):** The `SphereConductor` is the central orchestrator of the entire engine. It manages the lifecycle of communication "threads," validates agent "intents" against governance rules, and maintains the integrity of each thread's immutable event ledger. Every action taken by an agent in a thread must pass through the `SphereConductor`.

**`engine/src/governance/contactLensValidator.ts`:** This is the governance enforcement point. It implements the `createIntentValidator` function, which checks if an agent's intended action is permitted given its "Contact Lens" (its permission set), the current state of the thread (`ACTIVE`, `HALTED`, or `DEGRADED_NO_LLM`), and system-wide high-risk policies. It supports a "Break Glass" emergency override mechanism for critical situations.

**`engine/src/api/v1/c2Routes.ts` (1,564 lines — the largest file):** The Command & Control (C2) API routes. This is the primary API surface for managing agents, threads, and the overall system state.

**`engine/src/api/v1/sphereBffRoutes.ts` (578 lines):** The Backend-for-Frontend (BFF) routes, providing a tailored API for the React frontend skins.

**`engine/src/telegram/messageBridge.ts` (816 lines):** The Telegram message bridge, which handles the translation of Telegram messages into sphere thread events and vice versa.

**`engine/src/ws/hub.ts`:** The WebSocket hub, which manages real-time connections to all connected clients (agents and UI frontends).

**`skins/council-nebula/`:** A full React application providing the "Council Nebula" UI for participating in deliberations. It has pages for Admin, Player, and various game stages.

**`tma/`:** A Telegram Mini App (TMA) built with React. It provides a mobile-first interface for interacting with the sphere engine directly within Telegram.

### 1.4. The `installer-ui/desktop` — Detailed Findings

This is a Tauri application combining a React frontend with a Rust backend. It is the user's entry point into the entire MetaCanon ecosystem.

**`desktop/src/App.tsx`:** The main React component implementing an 8-step installation wizard. The steps are: (1) Welcome, (2) System Check, (3) Compute Selection, (4) Provider Config, (5) Security & Persistence, (6) Observability, (7) Review & Install, (8) Done. Each step calls the Tauri backend to perform the corresponding system action.

**`desktop/src/lib/api.ts`:** The TypeScript API client. It defines the `installerApi` object, which wraps all `invoke()` calls to the Tauri backend. This file is the complete API contract between the React UI and the Rust backend.

**`desktop/src-tauri/src/main.rs`:** The Tauri backend. It defines the `InstallerState` struct (which holds the `UiCommandRuntime` from the `core` library) and all `#[tauri::command]` functions. It is a thin bridge layer — every command simply calls the corresponding function in the `core` library's `ui.rs` module.

### 1.5. Test Results

The codebase includes a suite of JavaScript-based "contract tests" in `core/tests/`. These tests verify architectural and constitutional invariants without requiring the Rust code to be compiled. All tests passed.

| Test Suite | Result | What It Verifies |
| :--- | :--- | :--- |
| `constitutional-invariants.contract.test.js` | **PASSED** | FHE private key non-serializability, `will_vector` primacy, `genesis_hash` integrity. |
| `provider-routing.contract.test.js` | **PASSED** | `ComputeRouter` provider selection, Torus fallback logic, default configurations. |
| `observability-retention.contract.test.js` | **PASSED** | 90-day log retention policy, dual-tier logging, encrypted log format. |
| `installer-desktop-flow.contract.test.js` | **PASSED** | 8-step installer flow, all Tauri command names, API contract between UI and backend. |

---

## Section 2: Project Decomposition & GitHub Migration Instructions

This section provides step-by-step instructions for breaking the monorepo into independent GitHub repositories.

### 2.1. The Three Main Repositories

Create the following three private repositories on GitHub. Each should be initialized from the corresponding directory in the monorepo.

| New Repository Name | Source Directory | Primary Language |
| :--- | :--- | :--- |
| `metacanon-core` | `core/` | Rust |
| `metacanon-sphere-engine` | `sphere-thread-engine/` | TypeScript / Node.js |
| `metacanon-installer` | `installer-ui/` | TypeScript / Rust (Tauri) |

**Step-by-step migration process for each repository:**

```bash
# 1. Create a new local directory for the repository
mkdir metacanon-core && cd metacanon-core

# 2. Copy the source files from the monorepo
cp -r /path/to/monorepo/core/. .

# 3. Initialize a new Git repository
git init

# 4. Create the repository on GitHub (private by default)
gh repo create metacanon-core --private

# 5. Add the remote and push
git remote add origin https://github.com/YOUR_ORG/metacanon-core.git
git add .
git commit -m "Initial commit: metacanon-core extracted from monorepo"
git push -u origin main
```

Repeat this process for `metacanon-sphere-engine` and `metacanon-installer`.

> **Important:** Each repository MUST have a comprehensive `README.md` that explains its purpose, how it fits into the larger MetaCanon system, its dependencies, and how to build and run it. The `metacanon-core` README should also explain the six internal layers described below.

### 2.2. Internal Decomposition: `metacanon-core` (6 Layers)

The `metacanon-core` repository will remain a single Rust project, but its 16 modules must be clearly organized into six logical layers. The team should refactor the module structure to reflect this layering, and each layer should be documented in the README.

The dependency direction between layers is strictly **downward**: upper layers may depend on lower layers, but lower layers must never depend on upper layers.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: Platform Services (observability, storage, comms) │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Sub-Sphere Communication (sub_sphere, task_sub)   │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Agent Abstraction (lenses, workflows)             │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Security & Encryption (secrets, fhe)              │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Compute Abstraction (torus, compute, providers)   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Constitutional Layer (genesis, SoulFile)          │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Name | Purpose | Key Source Files | Lines of Code |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Constitutional Layer | Defines the `SoulFile`, the Genesis Rite, and the foundational constitutional logic that governs the entire system. | `genesis.rs` | 556 |
| **2** | Compute Abstraction | Manages all AI provider interactions, including the `DeliberationTorus` routing and fallback mechanism, and all individual provider implementations. | `torus.rs`, `compute.rs`, `providers/` (6 files) | ~3,500 |
| **3** | Security & Encryption | Handles all secrets management (keychain, encrypted file) and the Helios FHE scheme for protecting data in transit. | `secrets.rs`, `fhe.rs` | ~964 |
| **4** | Agent Abstraction | Defines the `SpecialistLens` (agent persona), the `LensLibrary` (reusable agent store), and the `WorkflowRegistry` (agent training). | `specialist_lens.rs`, `lens_library.rs`, `workflow.rs` | ~717 |
| **5** | Sub-Sphere Communication | Manages internal agent deliberations, the `Deliverable` approval workflow, Human-in-the-Loop (HITL) actions, and the `TaskSubSphere` management. | `sub_sphere_torus.rs`, `task_sub_sphere.rs` | ~1,148 |
| **6** | Platform Services | Provides foundational cross-cutting services: encrypted observability logging, local file storage, and external communications (Telegram, Discord, In-App). | `observability.rs`, `storage.rs`, `communications.rs` | ~3,432 |

**Note on `ui.rs` and `main.rs`:** These two files (`ui.rs` at 4,611 lines and `main.rs` at 1,135 lines) form the command surface layer and the CLI entry point. They sit above all six layers and depend on all of them. They should be treated as the "application shell" of the `metacanon-core` binary and are not part of the layered library architecture.

### 2.3. Internal Decomposition: `metacanon-sphere-engine` (3 Parts)

The `sphere-thread-engine` directory contains three distinct sub-projects that should be separated into their own repositories. This decouples the backend from the frontend skins, allowing each to be developed and deployed independently.

| New Repository Name | Source Directory | Purpose | Key Technologies |
| :--- | :--- | :--- | :--- |
| `sphere-engine-server` | `engine/`, `governance/`, `lens-packs/`, `scripts/`, `config/`, `deploy/` | The core backend server. Manages threads, governance, the WebSocket hub, the LLM service, the job queue, and all API routes. | Node.js, TypeScript, Express, PostgreSQL (Drizzle ORM), pg-boss |
| `sphere-skin-council-nebula` | `skins/council-nebula/` | The "Council Nebula" web UI for participating in multi-agent deliberations. Consumes the `sphere-engine-server` API. | React, TypeScript, Vite |
| `sphere-tma-app` | `tma/` | The Telegram Mini App (TMA) providing a mobile-first interface to the sphere engine, directly within Telegram. | React, TypeScript, Vite |

**Important:** When creating `sphere-engine-server`, include the `governance/` directory. This directory contains the `governance.yaml` file and the `contact_lenses/` directory, which define the system's governance policies. These are runtime configuration files that the server loads on startup and must travel with the server code.

### 2.4. Internal Decomposition: `metacanon-installer` (3 Parts)

The `installer-ui/desktop` project is a Tauri application and cannot be split into separate repositories without significant refactoring. Instead, the team should clearly document and maintain the separation of its three internal parts within the single `metacanon-installer` repository.

| Part | Name | Purpose | Source Path |
| :--- | :--- | :--- | :--- |
| **1** | Frontend UI | The 8-step React installation wizard. All user-facing components, pages, and state management. | `desktop/src/` |
| **2** | Backend Bridge | The Rust Tauri backend. Exposes all `metacanon-core` functionality to the React UI via `#[tauri::command]` functions. This is a thin bridge — it should contain no business logic. | `desktop/src-tauri/src/` |
| **3** | App Configuration | The Tauri configuration file, application icons, and bundle settings. This controls the app's identity, window behavior, and build targets. | `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/icons/` |

**Important dependency note:** The `metacanon-installer` repository has a hard dependency on `metacanon-core`. The `desktop/src-tauri/Cargo.toml` must reference `metacanon-core` as a dependency. Once the repositories are separated, this reference must be updated to point to the new `metacanon-core` GitHub repository (e.g., via a Git dependency in `Cargo.toml`).

---

## Section 3: Website Backend Specification — Live Code Visualization

### 3.1. Current State of the Website

The live website at `obsidian3d-mgvafqrq.manus.space` is a static React application that renders a 3D force-directed graph of the MetaCanon system's conceptual architecture. It currently has two views:

**Main View:** A 3D graph showing all system nodes (Genesis Rite, Torus Deliberation, Lens Library, Liturgical Engine, Contact Sub-Sphere & Federation, PL Dashboard) with filter buttons for each category.

**Genesis Rite Code Map View:** Accessible via the "ISOLATE GENESIS RITE — VIEW RUST CODE" button, this view shows a 7-step flow of the Genesis Rite with a code panel for each step. Each step displays a title, a "Constitutional Basis" (which Article of the Constitution it corresponds to), a "Rust Implementation" (the source file name and code snippet), and a "How It Works" explanation.

The code displayed in these panels is currently **hardcoded** into the React application's source code. It is not fetched from the actual `metacanon-core` repository. This means the visualization will become stale as the code evolves.

### 3.2. The Goal: Live Code Visualization

The objective is to replace the hardcoded code snippets with a dynamic system that fetches the actual, current source code from the `metacanon-core` GitHub repository. This will create a "living documentation" system that is always in sync with the codebase.

The user's specific requirement is: **"I want to be able to see the actual code that the different things are running on."**

### 3.3. Proposed Backend Architecture

The team is asked to evaluate and implement the following proposed architecture. Feedback on feasibility, effort, and alternatives is requested.

**Option A: Lightweight Node.js/Express Proxy Service (Recommended)**

A small, stateless Node.js service (`metacanon-code-api`) that acts as a secure proxy between the website frontend and the GitHub API.

```
Website Frontend  →  metacanon-code-api  →  GitHub API  →  metacanon-core repo
```

This service would:
1.  Accept requests from the website frontend for specific code snippets by ID.
2.  Look up the requested snippet ID in a local mapping file (`code-map.yaml`).
3.  Fetch the corresponding file from the `metacanon-core` GitHub repository using the GitHub REST API.
4.  Extract the specified line range from the file.
5.  Return the code snippet as JSON to the frontend.

**Option B: Direct GitHub API from Frontend (Simpler, Less Secure)**

The website frontend could call the GitHub API directly using a read-only PAT stored as an environment variable in the build. This is simpler but exposes the PAT in the browser and is not recommended for private repositories.

**Recommended Option: Option A.**

### 3.4. Backend API Specification

The `metacanon-code-api` service should expose the following endpoints:

**`GET /api/v1/snippet/:id`**

Returns a specific code snippet by its visualization ID.

*Request:*
```
GET /api/v1/snippet/genesis-step-1-launch
```

*Response (200 OK):*
```json
{
  "id": "genesis-step-1-launch",
  "title": "User Launches App",
  "subtitle": "Tauri Runtime Bootstrap",
  "constitutional_basis": "Article VII — Adoption & Amendments",
  "file": "src/main.rs",
  "start_line": 1,
  "end_line": 42,
  "code": "use clap::Parser;\nuse tauri::{Builder, Manager};\n...",
  "how_it_works": "The Tauri Builder bootstraps the full-screen WebView window...",
  "repo": "metacanon-core",
  "branch": "main",
  "commit_sha": "a1b2c3d4"
}
```

**`GET /api/v1/manifest`**

Returns the full list of all available snippet IDs and their metadata (without the code content). Used by the frontend to know which nodes have live code available.

### 3.5. The Code Mapping File (`code-map.yaml`)

This file is the critical link between the website's visual nodes and the actual source code. It must be maintained alongside the codebase. The team should create and maintain this file in the `metacanon-code-api` repository.

**Example `code-map.yaml` structure:**

```yaml
# MetaCanon Code Visualization Mapping
# Maps website node IDs to source code locations in metacanon-core

snippets:
  - id: "genesis-step-1-launch"
    title: "User Launches App"
    subtitle: "Tauri Runtime Bootstrap"
    constitutional_basis: "Article VII — Adoption & Amendments"
    file: "src/main.rs"
    start_line: 1
    end_line: 42
    how_it_works: "The Tauri Builder bootstraps the full-screen WebView window. The CLI flag provides an alternative terminal path — both routes lead to the same Genesis Rite."

  - id: "genesis-step-2-shaman"
    title: "Shaman Guides Setup"
    subtitle: "Guided Genesis Rite UI"
    constitutional_basis: "Article I — Sovereignty & Will"
    file: "src/genesis.rs"
    start_line: 1
    end_line: 60
    how_it_works: "The Shaman UI collects the user's vision_core, core_values, and will_directives. These become the constitutional content of the SoulFile."

  - id: "torus-deliberation-routing"
    title: "Torus Provider Routing"
    subtitle: "DeliberationTorus Fallback Logic"
    constitutional_basis: "Article IV — Compute Sovereignty"
    file: "src/torus.rs"
    start_line: 1
    end_line: 80
    how_it_works: "The Torus attempts providers in priority order. On failure, it falls back to the next provider, ensuring resilience."

  # ... additional mappings for all 7 Genesis steps and all other nodes
```

### 3.6. Frontend Changes Required

Once the backend is built, the website's React code must be updated to:
1.  On page load, call `GET /api/v1/manifest` to fetch the list of available snippets.
2.  When a user clicks a node or step button, call `GET /api/v1/snippet/:id` to fetch the live code.
3.  Display a loading state while the code is being fetched.
4.  Display the fetched code in the existing code panel UI.

### 3.7. Questions for the Codex Team

Please review the above specification and provide answers to the following questions so the work can proceed:

1.  **Architecture:** Do you agree with Option A (Node.js proxy service)? If not, what alternative do you propose and why?
2.  **Hosting:** Where should the `metacanon-code-api` service be hosted? (e.g., same server as the website, a separate cloud function, etc.)
3.  **Mapping File Maintenance:** Who will be responsible for keeping the `code-map.yaml` file up to date as the source code evolves? Can this be automated (e.g., via a script that reads code comments to generate the mapping)?
4.  **Authentication:** What is the preferred method for authenticating the backend service to GitHub? (PAT, GitHub App, or other)
5.  **Effort Estimate:** What is the estimated effort to build and deploy this service?

---

## Appendix: File Count & Complexity Summary

| Repository | Files | Lines of Code | Primary Language |
| :--- | :--- | :--- | :--- |
| `metacanon-core` | ~25 source files | ~18,105 | Rust |
| `sphere-engine-server` | ~35 source files | ~12,000 (est.) | TypeScript |
| `sphere-skin-council-nebula` | ~20 source files | ~3,000 (est.) | TypeScript/React |
| `sphere-tma-app` | ~15 source files | ~2,000 (est.) | TypeScript/React |
| `metacanon-installer` | ~30 source files | ~6,000 (est.) | TypeScript/Rust |
| `metacanon-code-api` (new) | ~5 source files | ~500 (est.) | TypeScript/Node.js |
