# Sphere Commands Technical Reference

**Version:** 1.2 (Fabric-Aligned)
**Date:** 2026-02-25

This document provides a comprehensive technical summary of the 49 `sphere-commands` skills. It is intended for developers building frontends, integrations, or other components that interact with the Deliberative Intelligence Fabric (DIF).

## I. Architectural Overview

The 49 skills are organized into four layers, as defined by the Deliberative Intelligence Fabric architecture. This structure dictates how commands relate to the overall system.

| Layer | Purpose | Skill Count |
|---|---|---|
| **Governance** | Constitutional enforcement, voting, oversight, and HITL (Human-in-the-Loop) processes. | 13 |
| **Generation** | Deliberation, perspective creation, content synthesis, and user identity management. | 11 |
| **Transmission** | Inter-agent communication, broadcasting, and information synchronization. | 8 |
| **Infrastructure** | Operational health, configuration, monitoring, and system-level tasks. | 17 |

Every action with significant consequences (`material_impact: true`) is routed through a **Temporal workflow** that enforces a mandatory HITL confirmation step. This is the core of the Governance Layer.

## II. Command Reference

### Governance Layer (13 Skills)

These skills form the constitutional backbone of the system.

| Command | Description | Material Impact | HITL Trigger |
|---|---|---|---|
| `/advice-process` | Initiate a formal Advice Process per Article V §2. | **Yes** | Manual |
| `/ai-governance-review` | Flag an agent action for formal AI Governance Review. | **Yes** | Manual |
| `/constitution` | View the full text of the Metacanon Constitution. | No | Manual |
| `/emergency-shutdown` | Initiate an emergency shutdown of a sphere or agent. | **Yes** | Manual |
| `/flag-impact` | Manually flag a past event for having material impact. | **Yes** | Manual |
| `/governance-meeting` | Schedule or start a formal governance meeting. | **Yes** | Manual |
| `/governance-report` | Generate a report on governance activities. | No | Manual |
| `/log-event` | Manually log a new event to the constitutional record. | **Yes** | Manual |
| `/propose` | Propose a new action or change to the sphere. | **Yes** | Manual |
| `/ratchet` | Ratchet a proposal to a higher level of scrutiny. | **Yes** | Manual |
| `/vote` | Call a formal vote on any sphere matter. | **Yes** | Manual |
| `advice-process-enforcer` | (Internal) Enforces the Advice Process workflow. | **Yes** | Auto |
| `constitutional-event-logger` | (Internal) Logs all events to the constitutional record. | No | Auto |
| `human-in-the-loop-confirmation` | (Internal) Manages the HITL confirmation workflow. | **Yes** | Auto |

### Generation Layer (11 Skills)

These skills are focused on creating, synthesizing, and managing content and identity.

| Command | Description | Material Impact | HITL Trigger |
|---|---|---|---|
| `/ask` | Ask a question to a specific agent or the entire sphere. | No | Manual |
| `/converge` | Converge multiple perspectives into a unified summary. | **Yes** | Manual |
| `/cxp` | Check your Contextual Experience Points (CXP) balance. | No | Manual |
| `/lens` | View or change your assigned deliberative lens. | No | Manual |
| `/my-lens` | View your currently assigned deliberative lens. | No | Manual |
| `/passport` | View your Sovereign Passport (lens, CXP, badges). | No | Manual |
| `/perspective` | Query, submit, or inspect perspective artifacts. | **Yes** | Manual |
| `/prism` | Run a PRISM deliberation process on a topic. | **Yes** | Manual |
| `/run-drill` | Run a specific deliberative drill. | **Yes** | Manual |
| `/story` | Create a narrative story from a series of events. | **Yes** | Manual |
| `/summarize` | Summarize a long text or a series of events. | No | Manual |

### Transmission Layer (8 Skills)

These skills handle communication and data flow between agents and users.

| Command | Description | Material Impact | HITL Trigger |
|---|---|---|---|
| `/broadcast` | Send a message to all members of the sphere. | **Yes** | Manual |
| `/cancel-invite` | Cancel a pending invitation to join the sphere. | No | Manual |
| `/decline` | Decline an invitation to join the sphere. | No | Manual |
| `/defer` | Defer a decision or action to a later time. | No | Manual |
| `/escalations` | View or manage the current escalation path. | No | Manual |
| `/everyone` | Mention everyone in the current sphere. | No | Manual |
| `/sync` | Synchronize the state of an agent or constellation. | **Yes** | Manual |
| `/who-sees-what` | See who has access to what information. | No | Manual |

### Infrastructure Layer (17 Skills)

These skills manage the operational health and configuration of the system.

| Command | Description | Material Impact | HITL Trigger |
|---|---|---|---|
| `/config` | View or change the configuration of an agent. | **Yes** | Manual |
| `/db-health` | Check the health of the PostgreSQL database. | No | Manual |
| `/db-view` | View a specific table in the database. | No | Manual |
| `/deploy-constellation` | Deploy a new agent constellation. | **Yes** | Manual |
| `/drills` | List all available deliberative drills. | No | Manual |
| `/export` | Export data from the sphere. | No | Manual |
| `/fallback-report` | Generate a report on fallback events. | No | Manual |
| `/glossary` | View the glossary of terms for the Fabric. | No | Manual |
| `/heartbeat-mute` | Mute heartbeat notifications for an agent. | No | Manual |
| `/list-constellations` | List all active agent constellations. | No | Manual |
| `/pause-drills` | Pause all running deliberative drills. | **Yes** | Manual |
| `/resume-drills` | Resume all paused deliberative drills. | **Yes** | Manual |
| `/sphere` | Display information about the current sphere. | No | Manual |
| `/status-all` | Get the status of all agents and constellations. | No | Manual |
| `/what-is-a-sphere` | Learn what a Sphere is and how it works. | No | Manual |

## III. Telegram Mini App Frontend Design

A coder building a Telegram Mini App frontend for these commands should focus on providing a user-friendly interface for the most common and complex interactions. The backend for the Mini App will be the existing Telegram bot, which translates user actions into the slash commands listed above.

### Key Architectural Components

1.  **Authentication**: The Mini App must securely receive the user's Telegram ID to personalize data (e.g., for `/passport` and `/cxp`). Use Telegram's [WebAppInitData](https://core.telegram.org/bots/webapps#webappinitdata) for this.

2.  **State Management**: The app should maintain its own state, fetching data from the backend (via the bot) as needed. For example, it should cache the user's passport data rather than calling `/passport` on every view.

3.  **Command Abstraction**: The user should not see raw slash commands. The UI should present buttons, forms, and views that map to these commands. For example, a "Propose Change" button would open a form that, when submitted, triggers the `/propose` command.

### Recommended UI Views

A robust Mini App frontend would include the following views:

**1. Dashboard / Home View**
   - **Purpose**: At-a-glance overview of the user's status and sphere activity.
   - **Components**:
     - **Passport Summary**: A small card showing current Lens, CXP, and Level. Tapping it navigates to the full Passport View.
     - **Pending Actions**: A list of items requiring the user's attention (e.g., open votes, pending proposals for review).
     - **Recent Activity Feed**: A stream of recent, relevant events from the `constitutional.events` table.

**2. Passport View (`/passport`, `/cxp`, `/my-lens`)**
   - **Purpose**: A detailed view of the user's identity and progression within the Fabric.
   - **Components**:
     - Full Sovereign Passport display.
     - Tabbed interface for:
       - **Badges**: A gallery of earned badges.
       - **CXP History**: A list of recent CXP transactions (from `/cxp history`).
       - **Level Curve**: A visualization of the CXP-to-Level progression (from `/cxp curve`).

**3. Deliberation View (`/perspective`, `/prism`, `/ask`)**
   - **Purpose**: The main interface for interacting with the Generation Layer.
   - **Components**:
     - A search bar that triggers `/perspective query`.
     - A list of recent or featured perspective artifacts.
     - A "Submit Perspective" form that triggers `/perspective submit`.
     - A view for a single artifact, showing its content, clashes, and related items.

**4. Governance View (`/propose`, `/vote`, `/advice-process`)**
   - **Purpose**: The interface for all constitutional actions.
   - **Components**:
     - A list of active proposals and votes.
     - A "New Proposal" form that walks the user through the `/propose` flow.
     - A detailed view for a single proposal, showing its status, discussion, and voting results.

### Backend Interaction Model

The Mini App should communicate with the bot using the `web_app_data` field in messages. The flow is as follows:

1.  User performs an action in the Mini App (e.g., submits a form).
2.  The Mini App sends a JSON payload to the bot via `Telegram.WebApp.sendData()`.
3.  The bot receives this data, parses it, and constructs the appropriate slash command.
4.  The bot executes the command and sends the result back to the user in the main chat thread.
5.  For actions that require a direct response in the Mini App (e.g., fetching data to populate a view), the bot can send a message with a `reply_markup` containing an `inline_keyboard` button that opens the Mini App with specific start parameters.

This architecture keeps the Mini App a pure frontend, with all logic and state changes handled by the robust, constitutionally-governed `sphere-commands` backend.
