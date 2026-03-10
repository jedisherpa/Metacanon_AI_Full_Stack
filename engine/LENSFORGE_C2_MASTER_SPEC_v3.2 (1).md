# LensForge C2 — Master Specification Document

**Version:** 3.2
**Date:** February 25, 2026
**Status:** ACTIVE DEVELOPMENT
**Author:** LensForge Engineering
**Classification:** INTERNAL — DEVELOPER REFERENCE

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Doctrine](#2-design-doctrine)
3. [System Architecture](#3-system-architecture)
4. [Constitutional Governance Framework](#4-constitutional-governance-framework)
5. [Backend API — Full Endpoint Catalog](#5-backend-api--full-endpoint-catalog)
6. [The Sphere Thread Protocol](#6-the-sphere-thread-protocol)
7. [The Agent Corps](#7-the-agent-corps)
8. [Telegram Bot Command Interface](#8-telegram-bot-command-interface)
9. [Frontend — War Room TMA](#9-frontend--war-room-tma)
10. [Server Deployment](#10-server-deployment)
11. [Build Plan v3.2](#11-build-plan-v32)
12. [Deliverables Inventory](#12-deliverables-inventory)
13. [Open Items & Known Gaps](#13-open-items--known-gaps)

---

## 1. Executive Summary

LensForge C2 is a **constitutionally-governed, cryptographically-secure command and control system** for orchestrating a corps of specialized AI agents. It runs as a Telegram Mini App (TMA) backed by a Node.js/PostgreSQL server, and is designed to be deployed on a Hetzner CCX23 at `https://www.shamanyourself.com`.

The system is not a chatbot. It is a **war room**. The commander issues structured, named orders. Agents execute within constitutional constraints. Every action is signed, chained, and permanently logged in an immutable ledger. The Metacanon Constitution (v3.0) is enforced at runtime by the Conductor engine, not as a policy document but as executable code.

The system has been designed through three successive rounds of adversarial deliberation (MVP Adversarial Design), a four-voice constitutional audit (Musk, Vervaeke, Marcinko, White), and two external research reviews. The current specification is v3.2.

**Current Status:** The codebase is fully scaffolded and the core architecture is implemented. The system is in the pre-deployment phase, awaiting the Track A governance workshop (Contact Lens definition) before production deployment.

---

## 2. Design Doctrine

The C2 Design Doctrine governs every architectural and UX decision. It is defined in `C2_DESIGN_DOCTRINE.md` and summarized here.

### 2.1 The Five Laws

1.  **One Screen, Total Clarity.** The home screen — the War Room — shows the complete operational picture at all times. Agent status, active missions, and the dispatch button are always visible without navigation.

2.  **Every Command Has a Name.** All orders are issued through a structured, three-step Dispatch Modal. There is no free-form chat prompt. A mission has a name, an objective, success criteria, constraints, a priority level, an assigned agent, and a think depth. Ambiguity is a security vulnerability.

3.  **Agents Have Rank and Role.** The 12 agents are not interchangeable. Each has a designation, a role, a Contact Lens (a constitutional constraint document), and a history. The commander selects agents deliberately, not randomly.

4.  **The Chain of Command is Visible.** Every action — dispatch, steer, recall, report — is a signed entry in the Sphere Thread ledger. The Order Log is always accessible. Nothing is deleted. Nothing is hidden.

5.  **Precision Over Speed.** The system never rushes the commander. The Dispatch Modal requires three deliberate steps. The Kill Switch requires dual confirmation. The system is designed for the commander who would rather be right than fast.

### 2.2 Influence

The design draws from three sources: the operational clarity of military C2 systems (Marcinko), the product minimalism of Apple under Jobs, and the constitutional governance philosophy of the Metacanon.

---

## 3. System Architecture

### 3.1 Stack Overview

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React + Vite + TypeScript + TailwindCSS | Telegram Mini App (TMA) — the War Room UI |
| **API Gateway** | Node.js + Express | BFF API — routes TMA requests, enforces Telegram auth |
| **Core Engine** | TypeScript | Conductor, MissionService, AgentManager, SkillsManager |
| **LLM Provider** | Moonshot Kimi 2.5 | All AI agent responses |
| **WebSocket** | Native Node.js `ws` | Real-time agent status and mission updates |
| **Database** | PostgreSQL + Drizzle ORM | Immutable event store and application state |
| **Bot Interface** | node-telegram-bot-api | Slash command interface for power users |
| **Server** | Hetzner CCX23 (Ubuntu 22.04) | Production host |
| **Process Manager** | PM2 | Auto-restart and startup management |
| **Reverse Proxy** | Nginx | HTTPS termination, API proxy, static TMA serving |

### 3.2 Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        TELEGRAM PLATFORM                        │
│                                                                 │
│   ┌──────────────────────┐    ┌──────────────────────────────┐  │
│   │   Telegram Mini App  │    │      Telegram Bot API        │  │
│   │   (War Room TMA)     │    │   (Slash Command Interface)  │  │
│   └──────────┬───────────┘    └──────────────┬───────────────┘  │
└──────────────┼──────────────────────────────-┼──────────────────┘
               │ HTTPS / WSS                   │ Webhook
               ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NGINX REVERSE PROXY                        │
│                   (shamanyourself.com)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NODE.JS APPLICATION                          │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  BFF API   │  │  Bot         │  │  Skills Manager      │    │
│  │  (Express) │  │  Dispatcher  │  │  (Hot-reload SKILL.md│    │
│  └─────┬──────┘  └──────┬───────┘  └──────────────────────┘    │
│        │                │                                       │
│        └────────┬────────┘                                      │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              CONDUCTOR (Sphere Thread Engine)            │   │
│  │                                                          │   │
│  │  • Ed25519 signing & verification                        │   │
│  │  • SHA-256 chained hashing                               │   │
│  │  • Constitutional enforcement (High-Risk Registry)       │   │
│  │  • DEGRADED_CONSENSUS safety gates                       │   │
│  │  • ACK timeout management                                │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│  ┌──────────────────────────┴───────────────────────────────┐   │
│  │                   MISSION SERVICE                        │   │
│  │                                                          │   │
│  │  • Mission lifecycle (PLANNING → ACTIVE → COMPLETE)      │   │
│  │  • Parallel multi-agent execution                        │   │
│  │  • Structured Intel Report generation via Kimi           │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        POSTGRESQL                               │
│                                                                 │
│  thread_log_entries  │  missions  │  agents  │  did_documents   │
│  sphere_threads      │  user_profiles  │  sphere_votes          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Key Design Decisions

**Authentication:** All TMA requests are authenticated via Telegram's `initData` HMAC-SHA256 mechanism. The `telegramAuthMiddleware` validates the signature and expiry on every request to `/api/v1/*`. There are no passwords or JWTs.

**LLM Provider:** Moonshot Kimi 2.5 is the primary provider, configured via `LLM_PROVIDER_DEFAULT=kimi`. The system supports a `fallback: "stub"` mode that returns a canned response with `degraded: true` if the Kimi API is unavailable, ensuring the C2 loop continues to function.

**Real-time Updates:** The War Room UI subscribes to a WebSocket channel (`atlas:<user_id>`) for live agent status and mission updates. The Sphere Thread Observability Port uses Server-Sent Events (SSE) for the live ledger stream.

**Cryptographic Trust:** All actors have Ed25519 keypairs stored in `data/keystore.json`. All messages are canonicalized (JCS/RFC 8785) before signing. The Conductor signs every committed `LedgerEnvelope`. The TMA verifies signatures client-side using the Web Crypto API.

---

## 4. Constitutional Governance Framework

### 4.1 The Metacanon Constitution (v3.0)

The Metacanon Constitution is the legal and ethical foundation of the system. It is not advisory; it is enforced at runtime. The Conductor engine loads the constitution and the supporting governance files at startup, logs their checksums, and uses them to validate every action.

The Constitution defines:
- The rights and responsibilities of human commanders.
- The operational constraints of AI agents.
- The governance structure (Prism Holder, Constitutional Observer, Commander roles).
- The emergency protocols (Ratchet, Emergency Shutdown).
- The Material Impact doctrine (any action with real-world consequences requires human approval).

### 4.2 The Canonical Policy Surface

The single source of truth for all governance rules is the `governance/` directory. **No copy of these files exists anywhere else in the system.** The engine loads from this path at runtime.

```
governance/
├── metacanon.md                        ← The full constitution
├── contact_lenses/
│   ├── socrates-1.json                 ← One file per agent
│   ├── plato-2.json
│   └── ... (12 total)
└── high_risk_intent_registry.json      ← Machine-readable risk rules
```

### 4.3 Contact Lenses

A Contact Lens is a JSON document that defines the operational constraints and worldview for a specific agent. It is the mechanism by which the abstract principles of the Metacanon are translated into agent-specific behavior.

**Contact Lens Schema:**
```json
{
  "agent_id": "socrates-1",
  "designation": "SOCRATES-1",
  "role": "Critical Interrogator",
  "worldview": "...",
  "operational_constraints": ["...", "..."],
  "prohibited_actions": ["...", "..."],
  "material_impact_threshold": "HIGH",
  "prism_holder_approval_required_for": ["..."]
}
```

**Status:** Contact Lenses are the primary deliverable of Track A (Governance Workshop, Days 1-7). They do not yet exist. The 12 agents are currently seeded with placeholder data.

### 4.4 High-Risk Intent Registry (v1.1)

The registry defines which intents require Prism Holder approval and which are blocked during `DEGRADED_CONSENSUS`.

| Intent | Prism Holder Approval | Blocked in DEGRADED_CONSENSUS | Timeout Behavior |
|---|---|---|---|
| `DISPATCH_MISSION` | Yes | Yes | `REJECT` |
| `APPROVE_MATERIAL_IMPACT` | Yes | Yes | `REJECT` |
| `RATCHET` | Yes | Yes | `REJECT` |
| `EMERGENCY_SHUTDOWN` | Yes | **No** | `ALLOW_WITH_LOG` |
| `DEPLOY_CONSTELLATION` | Yes | Yes | `REJECT` |
| `MODIFY_CONTACT_LENS` | Yes | Yes | `REJECT` |

### 4.5 Governance Roles

| Role | Description | Who Holds It |
|---|---|---|
| **Commander** | Issues orders, manages the War Room. | The human operator (you). |
| **Prism Holder** | Approves high-risk intents. Signs off on governance gates. | Designated by the Commander. |
| **Constitutional Observer** | Observes the first production missions and validates constitutional compliance. | A designated secondary human. |

---

## 5. Backend API — Full Endpoint Catalog

All endpoints are prefixed with `/api/v1/` and require a valid Telegram `initData` header unless otherwise noted.

### 5.1 Atlas (System State)

| Method | Path | Description |
|---|---|---|
| `GET` | `/atlas/state` | Single-call app bootstrap. Returns user profile, agent statuses, active missions, and system health. Auto-provisions new users. |

### 5.2 Citadel (Governance — 12 Endpoints)

| Method | Path | Description |
|---|---|---|
| `POST` | `/citadel/propose` | Submit a new governance proposal. |
| `POST` | `/citadel/vote` | Cast a vote (yes/no/abstain) on a proposal. |
| `POST` | `/citadel/advice-process` | Initiate the advice process for a decision. |
| `POST` | `/citadel/ai-governance-review` | Request an AI review of a governance decision. |
| `POST` | `/citadel/emergency-shutdown` | Trigger the emergency shutdown protocol (requires dual confirmation). |
| `POST` | `/citadel/flag-impact` | Flag an action as having Material Impact. |
| `POST` | `/citadel/governance-meeting` | Schedule a governance meeting. |
| `GET` | `/citadel/governance-report` | Retrieve the latest governance report. |
| `POST` | `/citadel/log-event` | Log a significant governance event. |
| `POST` | `/citadel/ratchet` | Trigger the Ratchet protocol (requires Prism Holder approval). |
| `GET` | `/citadel/constitution` | Retrieve the full Metacanon Constitution text. |
| `GET` | `/citadel/proposals` | List all active and historical proposals. |

### 5.3 Forge (Deliberation — 11 Endpoints)

| Method | Path | Description |
|---|---|---|
| `GET` | `/forge/passport` | Retrieve the user's Lens Passport and CXP score. |
| `GET` | `/forge/lens` | List all 12 available lenses. |
| `GET` | `/forge/my-lens` | Get the user's currently active lens. |
| `GET` | `/forge/cxp` | Get the user's Contextual Experience Points breakdown. |
| `POST` | `/forge/perspective` | Generate a perspective through a specific lens. |
| `POST` | `/forge/ask` | Ask a question to a specific agent (Kimi-backed). |
| `POST` | `/forge/converge` | Run a multi-agent convergence on a topic. |
| `POST` | `/forge/prism` | Run a full 12-lens Prism deliberation. |
| `POST` | `/forge/run-drill` | Execute a training drill. |
| `GET` | `/forge/story` | Generate a narrative summary of recent activity. |
| `POST` | `/forge/summarize` | Summarize a body of text through a lens. |

### 5.4 Hub (Transmission — 8 Endpoints)

| Method | Path | Description |
|---|---|---|
| `POST` | `/hub/broadcast` | Send a message to all sphere members. |
| `POST` | `/hub/cancel-invite` | Cancel a pending invitation. |
| `POST` | `/hub/decline` | Decline an incoming invitation or request. |
| `POST` | `/hub/defer` | Defer a decision or action. |
| `GET` | `/hub/escalations` | List all active escalations. |
| `GET` | `/hub/everyone` | List all sphere members and their status. |
| `POST` | `/hub/sync` | Trigger a state sync with all connected clients. |
| `GET` | `/hub/who-sees-what` | Retrieve the visibility matrix for the sphere. |

### 5.5 Engine Room (Infrastructure — 17 Endpoints)

| Method | Path | Description |
|---|---|---|
| `GET` | `/engine-room/status-all` | Full system health report. |
| `GET` | `/engine-room/db-health` | PostgreSQL connection and table health. |
| `GET` | `/engine-room/db-view` | Read-only view of key database tables. |
| `POST` | `/engine-room/deploy-constellation` | Deploy a named agent constellation. |
| `GET` | `/engine-room/drills` | List all available training drills. |
| `POST` | `/engine-room/export` | Export session data or logs. |
| `GET` | `/engine-room/fallback-report` | Report on recent LLM fallback events. |
| `GET` | `/engine-room/glossary` | Retrieve the system glossary. |
| `POST` | `/engine-room/heartbeat-mute` | Mute heartbeat alerts for a specified duration. |
| `GET` | `/engine-room/list-constellations` | List all available agent constellations. |
| `POST` | `/engine-room/pause-drills` | Pause all active training drills. |
| `POST` | `/engine-room/resume-drills` | Resume paused training drills. |
| `GET` | `/engine-room/sphere` | Get the current sphere configuration. |
| `GET` | `/engine-room/what-is-a-sphere` | Retrieve the Sphere definition document. |
| `GET` | `/engine-room/config` | Get the current runtime configuration. |
| `PATCH` | `/engine-room/config` | Update a runtime configuration value (no restart required). |

### 5.6 C2 (Command & Control — 15 Endpoints)

| Method | Path | Description |
|---|---|---|
| `POST` | `/c2/missions` | Create and dispatch a new mission. |
| `GET` | `/c2/missions` | List all missions (filterable by status/priority). |
| `GET` | `/c2/missions/:id` | Get full mission detail including Intel Report. |
| `POST` | `/c2/missions/:id/steer` | Issue a course correction to an active mission. |
| `POST` | `/c2/missions/:id/recall` | Recall an active mission. |
| `POST` | `/c2/missions/:id/priority` | Override the priority of a mission. |
| `GET` | `/c2/agents` | List all agents and their current status. |
| `GET` | `/c2/agents/:id` | Get full agent detail including history. |
| `POST` | `/c2/agents/:id/standby` | Set an agent to STANDBY. |
| `POST` | `/c2/agents/:id/offline` | Take an agent offline. |
| `GET` | `/c2/order-log` | Retrieve the full, immutable order log. |
| `POST` | `/c2/halt` | Trigger the HALT ALL THREADS emergency protocol. |
| `GET` | `/c2/status` | Get the overall C2 system status. |

### 5.7 Sphere Thread (Observability — 14 Endpoints)

| Method | Path | Description |
|---|---|---|
| `POST` | `/sphere/threads` | Create a new Sphere Thread. |
| `GET` | `/sphere/threads` | List all threads. |
| `GET` | `/sphere/threads/:id` | Get thread metadata. |
| `GET` | `/sphere/threads/:id/stream` | SSE stream of live log entries. |
| `GET` | `/sphere/threads/:id/log` | Retrieve the full log for a thread. |
| `POST` | `/sphere/threads/:id/entries` | Submit a new entry to a thread. |
| `POST` | `/sphere/threads/:id/ack` | Acknowledge receipt of an entry. |
| `GET` | `/sphere/threads/:id/checkpoints` | List all checkpoints for a thread. |
| `POST` | `/sphere/threads/:id/checkpoints` | Create a new checkpoint. |
| `GET` | `/sphere/threads/:id/members` | List thread members. |
| `POST` | `/sphere/threads/:id/members` | Add a member to a thread. |
| `DELETE` | `/sphere/threads/:id/members/:did` | Remove a member from a thread. |
| `GET` | `/sphere/dids/:did` | Resolve a DID Document. |
| `POST` | `/sphere/dids` | Register a new DID Document. |

---

## 6. The Sphere Thread Protocol

### 6.1 Overview

The Sphere Thread Model (v1.3) is the communication protocol for all agent interactions. It transforms the system's message log from a simple database table into a **cryptographically verifiable, tamper-evident ledger**.

### 6.2 LogEntry Structure

Every message in the system is a `LogEntry` with two envelopes:

**Client Envelope** (submitted by the sender):
```typescript
{
  id: string;           // UUID
  threadId: string;
  authorDid: string;    // did:key:z6Mk...
  sequence: number;     // Monotonic, per-thread
  payload: object;      // The actual message content
  signature: string;    // EdDSA signature of the canonicalized payload
}
```

**Ledger Envelope** (added by the Conductor):
```typescript
{
  prevMessageHash: string;     // SHA-256 of the previous LogEntry
  timestamp: string;           // ISO 8601
  conductorSignature: string;  // EdDSA signature of the full entry
}
```

### 6.3 The Safety Gate

If the Conductor does not receive an ACK from an agent within 5 seconds, the thread enters `DEGRADED_CONSENSUS`. In this state, all high-risk intents (except `EMERGENCY_SHUTDOWN`) are automatically rejected. The thread exits `DEGRADED_CONSENSUS` automatically when ACKs are restored.

---

## 7. The Agent Corps

The system is seeded with 12 agents, each representing a distinct philosophical and analytical lens from the PAAPE (Philosophical Archetypes for Perspectival Exploration) framework.

| Designation | Role | Lens Summary |
|---|---|---|
| SOCRATES-1 | Critical Interrogator | Exposes contradictions via relentless questioning. |
| PLATO-2 | Systems Architect | Maps abstract forms to concrete systems. |
| ARISTOTLE-3 | Taxonomist | Classifies chaotic data into structured categories. |
| MARCUS-4 | Stoic Commander | Maintains operational discipline under stress. |
| MACHIAVELLI-5 | Strategist | Optimizes for power dynamics and outcomes. |
| JUNG-6 | Depth Analyst | Reveals hidden archetypes and unconscious biases. |
| NIETZSCHE-7 | Iconoclast | Challenges foundational assumptions. |
| KANT-8 | Ethicist | Enforces categorical imperatives and duty. |
| HEIDEGGER-9 | Phenomenologist | Analyzes the nature of being and tool-readiness. |
| WITTGENSTEIN-10 | Language Analyst | Clarifies meaning and language game boundaries. |
| SIMONE-11 | Contemplative | Connects suffering to attention and grace. |
| ARENDT-12 | Political Theorist | Focuses on the active life and public sphere. |

**Note:** Contact Lenses for all 12 agents are pending Track A completion.

---

## 8. Telegram Bot Command Interface

The system exposes a slash command interface via the Telegram Bot API for power users who prefer keyboard-driven interaction.

### 8.1 Built-in Commands

| Command | Description |
|---|---|
| `/start` | Initialize the bot and open the War Room TMA. |
| `/status` | Get a quick system status summary. |
| `/whoami` | Display the current user's profile and permissions. |
| `/new <name>` | Create a new mission. |
| `/agents` | List all agents and their current status. |
| `/model <name>` | Switch the active LLM model. |
| `/think <depth>` | Set the default think depth (recon/standard/deep/maximum). |
| `/verbose` | Toggle verbose mode for agent responses. |
| `/stop` | Stop the currently active mission. |
| `/config get <key>` | Get a runtime configuration value. |
| `/config set <key> <value>` | Set a runtime configuration value. |
| `/skills` | List all loaded skills. |
| `/export` | Export the current session log. |
| `/allow <user_id>` | Add a user to the allowlist (admin only). |
| `/deny <user_id>` | Remove a user from the allowlist (admin only). |
| `/help` | Display the full command reference. |

### 8.2 Skills System

The Skills Manager enables hot-reloadable command extensions. Any file dropped into the `skills/` directory with a valid `SKILL.md` is automatically loaded as a new bot command without requiring a restart.

---

## 9. Frontend — War Room TMA

### 9.1 Navigation Structure

The TMA has five primary screens, navigated via a bottom tab bar:

| Screen | Route | Territory |
|---|---|---|
| War Room | `/` | Command Center (Home) |
| Citadel | `/citadel` | Governance |
| Forge | `/forge` | Deliberation |
| Hub | `/hub` | Transmission |
| Engine Room | `/engine-room` | Infrastructure |

### 9.2 War Room Screen

The War Room is the primary command interface. It contains:

- **Agent Status Grid:** 12 agent status dots, color-coded by state (STANDBY/ACTIVE/REPORTING/AWAITING ORDERS/OFFLINE).
- **Critical Alert Banner:** Displayed when any CRITICAL priority mission is active.
- **Mission Stream:** A filterable list of all missions, sorted by priority.
- **Dispatch FAB:** A persistent "+" button in the bottom-right corner.

### 9.3 Dispatch Modal

Issuing a mission order is a three-step, deliberate process:

1.  **BRIEF:** Mission name, objective, success criteria, constraints, and priority level.
2.  **ASSIGN:** Agent selection from the corps grid, plus think depth selection (RECON / STANDARD / DEEP / MAXIMUM).
3.  **CONFIRM:** Full order review before dispatch.

### 9.4 Thread Observability Panel

Available from any Mission Detail view, the Observability Panel shows:

- A live SSE stream of all `LogEntry` rows for the mission's thread.
- Per-entry signature verification badges (✓ VALID / ✗ INVALID / ? UNVERIFIED).
- Full payload inspection on tap.

---

## 10. Server Deployment

### 10.1 Target Environment

- **Provider:** Hetzner Cloud
- **Instance:** CCX23 (4 vCPU, 16GB RAM, 160GB NVMe)
- **OS:** Ubuntu 22.04 LTS
- **Domain:** `https://www.shamanyourself.com`
- **SSL:** Certbot (Let's Encrypt)

### 10.2 Deployment Files

| File | Purpose |
|---|---|
| `deploy/deploy.sh` | One-command deploy script. Builds both apps, configures Nginx, starts PM2. |
| `deploy/nginx.conf` | Nginx reverse proxy config. HTTP→HTTPS redirect, API proxy, WSS proxy, static TMA serving. |
| `deploy/ecosystem.config.cjs` | PM2 process configuration. Auto-restart on crash, startup on reboot. |
| `deploy/setup_env.sh` | Interactive script to generate the `.env` file. |

### 10.3 Required Environment Variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram Bot token from @BotFather. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `KIMI_API_KEY` | Moonshot Kimi 2.5 API key. |
| `KIMI_BASE_URL` | Kimi API base URL (default: `https://api.moonshot.cn/v1`). |
| `CONDUCTOR_PRIVATE_KEY` | Ed25519 private key for the Conductor (auto-generated on first run). |
| `ADMIN_TELEGRAM_ID` | Your Telegram user ID (grants admin privileges). |
| `APP_URL` | The public HTTPS URL of the application. |

### 10.4 Deployment Steps

1.  Upload `LensForge_C2_v3.0_SphereThread.zip` to the server and unzip.
2.  Create the PostgreSQL database: `createdb lensforge`.
3.  Run `deploy/setup_env.sh` and fill in the required values.
4.  Run `deploy/deploy.sh`. It handles everything else.
5.  In @BotFather, set the Menu Button URL to `https://www.shamanyourself.com`.

---

## 11. Build Plan v3.2

### 11.1 The Three-Track Pipeline

The build is structured as three parallel tracks converging at three named gates.

| Track | Name | Duration | Description |
|---|---|---|---|
| **A** | Governance | Days 1-7 | Manual definition of Contact Lenses and governance rules in a workshop setting. |
| **B** | Build | Days 1-5 | Development of the full local system for use in the governance workshop. |
| **C** | Deploy | Days 8-16 | Staging soak, Red Cell testing, and production deployment. |

### 11.2 The Three Gates

| Gate | Day | Condition |
|---|---|---|
| **Local Readiness Gate** | Day 5 | Track B is complete. The local system is feature-complete and all tests pass. Signed off by the Commander. |
| **Governance Sign-off Gate** | Day 7 | All `governance/contact_lenses/*.json` files are complete, schema-valid, policy-valid, and signed off by the Prism Holder. |
| **Staging→Production Gate** | Day 13 | 24-hour staging soak is complete. Red Cell adversarial test is passed. Operational Readiness Checklist is signed off by both the Commander and the Constitutional Observer. |

### 11.3 Day-by-Day Execution Plan

**Track B (Build) — Days 1-5:**

| Day | Deliverable |
|---|---|
| Day 0 | Define the `governance/` directory structure and the Contact Lens JSON schema. |
| Day 1 | Conductor service is running locally. All DB migrations applied. |
| Day 2 | High-Risk Intent Registry is wired into the Conductor. Kill Switch is functional. |
| Day 3 | Telegram Bot is live locally. All slash commands work. SSE push stream is functional. |
| Day 4 | War Room TMA is running locally. All five screens are functional. |
| Day 5 | End-to-end test: Dispatch a mission, receive a report, verify the ledger. **Local Readiness Gate.** |

**Track A (Governance) — Days 1-7:**

| Day | Deliverable |
|---|---|
| Day 1 | Governance workshop begins. Review the Metacanon Constitution. |
| Days 2-6 | Draft and iterate on Contact Lenses for all 12 agents. |
| Day 7 | Prism Holder reviews and signs off all 12 Contact Lenses. **Governance Sign-off Gate.** |

**Track C (Deploy) — Days 8-16:**

| Day | Deliverable |
|---|---|
| Day 8 | Contact Lenses are loaded into the Conductor. First full-system test with governance enforcement. |
| Days 9-10 | Bug fixes and refinements from the full-system test. |
| Day 10 | Staging deploy to Hetzner. |
| Day 11 | 24-hour staging soak begins. Constitutional Observer is present. |
| Day 12 | Red Cell adversarial test. Attempt to bypass governance rules. |
| Day 13 | Operational Readiness Checklist completed. **Staging→Production Gate.** Production deploy. |
| Days 14-16 | Buffer for single-developer execution risk. |

### 11.4 Quality Standards

**Mission Quality Scorecard (25-point scale):**

| Dimension | Max Score | Pass Threshold |
|---|---|---|
| Accuracy | 5 | — |
| Actionability | 5 | — |
| Completeness | 5 | — |
| Concision | 5 | — |
| Constitutional Compliance | 5 | **Must be 5/5 (PASS)** |
| **Total** | **25** | **≥18 AND Compliance PASS** |

---

## 12. Deliverables Inventory

The following files have been produced and are included in `LensForge_C2_v3.0_SphereThread.zip`.

### 12.1 Backend Engine (`engine/src/`)

| File | Status | Description |
|---|---|---|
| `config/env.ts` | ✅ Complete | All environment variables including Kimi and Telegram. |
| `middleware/telegramAuth.ts` | ✅ Complete | HMAC-SHA256 Telegram `initData` validator. |
| `db/schema.ts` | ✅ Complete | Base Drizzle ORM schema. |
| `db/schemaAtlas.ts` | ✅ Complete | `user_profiles`, `sphere_votes`, `vote_choices`, `governance_events`. |
| `db/schemaC2.ts` | ✅ Complete | `missions`, `agents`, `order_log`, `constellations`. |
| `db/schemaSphereThread.ts` | ✅ Complete | `sphere_threads`, `thread_log_entries`, `thread_membership`, `thread_checkpoints`, `did_documents`. |
| `sphere/crypto.ts` | ✅ Complete | Ed25519, JCS, SHA-256 utilities. |
| `sphere/didRegistry.ts` | ✅ Complete | DID Document store with key lifecycle management. |
| `sphere/conductor.ts` | ✅ Complete | Full Conductor service with ordering, hashing, signing, and safety gates. |
| `agents/missionService.ts` | ✅ Complete | Full mission lifecycle with Kimi integration. |
| `agents/manager.ts` | ✅ Complete | In-memory agent runtime tracking. |
| `session/store.ts` | ✅ Complete | Per-user conversation state. |
| `bot/client.ts` | ✅ Complete | Telegram Bot client. |
| `bot/registry.ts` | ✅ Complete | Command registry. |
| `bot/builtinCommands.ts` | ✅ Complete | All built-in slash commands. |
| `bot/dispatcher.ts` | ✅ Complete | Main bot message router. |
| `bot/conversationHandler.ts` | ✅ Complete | Free-form message handler with Kimi. |
| `bot/runtimeConfig.ts` | ✅ Complete | Live config store. |
| `bot/security.ts` | ✅ Complete | Persistent allowlist management. |
| `skills/manager.ts` | ✅ Complete | SKILL.md hot-reload system. |
| `api/v1/atlasRoutes.ts` | ✅ Complete | Atlas state bootstrap endpoint. |
| `api/v1/citadelRoutes.ts` | ✅ Complete | 12 governance endpoints. |
| `api/v1/forgeRoutes.ts` | ✅ Complete | 11 deliberation endpoints. |
| `api/v1/hubRoutes.ts` | ✅ Complete | 8 transmission endpoints. |
| `api/v1/engineRoomRoutes.ts` | ✅ Complete | 17 infrastructure endpoints. |
| `api/v1/c2Routes.ts` | ✅ Complete | 13 C2 command endpoints. |
| `api/v1/sphereThreadRoutes.ts` | ✅ Complete | 14 Sphere Thread observability endpoints. |
| `index.ts` | ✅ Complete | Main entry point with all routes registered. |

### 12.2 Database Migrations (`engine/drizzle/`)

| File | Status | Description |
|---|---|---|
| `0000_chubby_newton_destine.sql` | ✅ Existing | Base schema from council-engine. |
| `0002_living_atlas.sql` | ✅ Complete | Atlas tables. |
| `0003_c2_command_layer.sql` | ✅ Complete | C2 tables + 12 seeded agents + 4 constellations. |
| `0004_sphere_thread_model.sql` | ✅ Complete | Sphere Thread tables. |

### 12.3 Frontend TMA (`tma/src/`)

| File | Status | Description |
|---|---|---|
| `App.tsx` | ✅ Complete | Main router with C2 navigation. |
| `lib/api.ts` | ✅ Complete | Typed API client. |
| `lib/telegram.ts` | ✅ Complete | Telegram SDK helpers and haptic feedback. |
| `lib/c2api.ts` | ✅ Complete | C2-specific API client. |
| `lib/sphereThread.ts` | ✅ Complete | Sphere Thread SSE client with signature verification. |
| `pages/WarRoom.tsx` | ✅ Complete | Main War Room screen. |
| `pages/CitadelPage.tsx` | ✅ Complete | Governance screen. |
| `pages/ForgePage.tsx` | ✅ Complete | Deliberation screen. |
| `pages/HubPage.tsx` | ✅ Complete | Transmission screen. |
| `pages/EngineRoomPage.tsx` | ✅ Complete | Infrastructure screen. |
| `components/MissionCard.tsx` | ✅ Complete | Mission card component. |
| `components/AgentStatusDot.tsx` | ✅ Complete | Agent status indicator. |
| `components/DispatchModal.tsx` | ✅ Complete | Three-step mission order form. |
| `components/AgentCorps.tsx` | ✅ Complete | Agent registry screen. |
| `components/OrderLog.tsx` | ✅ Complete | Immutable order audit trail. |
| `components/ThreadObservabilityPanel.tsx` | ✅ Complete | Live SSE ledger viewer with signature verification. |

### 12.4 Deployment (`deploy/`)

| File | Status | Description |
|---|---|---|
| `deploy.sh` | ✅ Complete | One-command deploy script. |
| `nginx.conf` | ✅ Complete | Nginx reverse proxy configuration. |
| `ecosystem.config.cjs` | ✅ Complete | PM2 process configuration. |
| `setup_env.sh` | ✅ Complete | Environment setup script. |

### 12.5 Governance (`governance/`)

| File | Status | Description |
|---|---|---|
| `high_risk_intent_registry.json` | ✅ Complete (v1.1) | Machine-readable risk rules. |
| `contact_lenses/*.json` | ⏳ **PENDING** | 12 Contact Lens files. Deliverable of Track A. |
| `metacanon.md` | ✅ Exists (v3.0) | The full constitution. |

### 12.6 Documentation

| File | Status | Description |
|---|---|---|
| `DEPLOY_README.md` | ✅ Complete | Step-by-step deployment guide. |
| `C2_DESIGN_DOCTRINE.md` | ✅ Complete | The five governing laws. |
| `BUILD_PLAN_v3.2.md` | ✅ Complete | The 16-day execution plan. |
| `governance/mission_quality_scorecard.md` | ✅ Complete (v1.1) | Mission quality scoring template. |
| `deploy/OPERATIONAL_READINESS.md` | ✅ Complete (v1.1) | Pre-production readiness checklist. |
| `CONSTITUTIONAL_AUDIT_REPORT.md` | ✅ Complete | Four-voice constitutional audit (Musk, Vervaeke, Marcinko, White). |
| `mvp_deliberation/unified_design.md` | ✅ Complete (v2.1) | Governance-to-Code Pipeline design proposal. |
| `LENSFORGE_C2_MASTER_SPEC_v3.2.md` | ✅ Complete | This document. |

---

## 13. Open Items & Known Gaps

The following items are known gaps that must be addressed before or during Track C.

| # | Item | Priority | Owner | Target |
|---|---|---|---|---|
| 1 | **Contact Lenses not yet defined.** All 12 agents are operating with placeholder data. | CRITICAL | Prism Holder | Day 7 (Track A Gate) |
| 2 | **Contact Lenses not yet wired into the Conductor.** The enforcement logic exists but has no rules to enforce. | CRITICAL | Lead Developer | Day 8 |
| 3 | **Constitutional Observer not yet designated.** Required before Day 11 staging soak. | HIGH | Commander | Day 10 |
| 4 | **No automated tests.** The codebase has no unit or integration tests. | HIGH | Lead Developer | Days 3-5 |
| 5 | **DB backup restore not yet tested.** Required by the Operational Readiness Checklist before production deploy. | HIGH | Lead Developer | Day 12 |
| 6 | **Kimi API key is hardcoded in env.** Must be rotated to a secrets manager before production. | MEDIUM | Lead Developer | Day 10 |
| 7 | **No rate limiting on the API.** The `express-rate-limit` package is in the spec but not yet implemented. | MEDIUM | Lead Developer | Day 4 |
| 8 | **No monitoring or alerting.** PM2 provides basic process monitoring, but no application-level alerting exists. | MEDIUM | Lead Developer | Day 12 |

---

*This document is the authoritative reference for the LensForge C2 system as of v3.2. All development, deployment, and governance decisions shall be made in accordance with this specification.*
