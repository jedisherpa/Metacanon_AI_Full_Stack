# Developer Report: Tetrahedral OpenClaw Architecture

**Author:** Manus AI
**Date:** February 26, 2026
**Status:** Final

## 1. Introduction

This document provides a comprehensive technical overview of the **Tetrahedral OpenClaw Architecture**, a multi-agent system deployed on the Sovereign AI platform. The architecture is designed to facilitate complex, collaborative tasks by orchestrating four distinct OpenClaw agent instances within a shared communication and memory environment. It leverages a custom relay system, a persistent shared thread, and a dedicated Docker network to enable seamless interaction between agents and human operators.

This report details the system's structure, its core components, the Docker orchestration strategy, the communication flow, and the configuration of each element as deployed on the CCX23 server (178.156.233.14).

## 2. Core Architectural Components

The system is primarily located in the `/opt/tetrahedral/` directory on the server. It is composed of several key components that work in concert.

### 2.1. OpenClaw Instances (The "Vertices")

The core of the architecture consists of four independent OpenClaw instances, each running as a separate Docker container. These instances represent the four vertices of the tetrahedron.

*   **Instances:** `openclaw-inst1`, `openclaw-inst2`, `openclaw-inst3`, `openclaw-inst4`
*   **Image:** `openclaw:local` (built from `/opt/openclaw-src`)
*   **Function:** Each instance operates as a distinct AI agent with its own configuration, workspace, and set of skills. They are configured to participate in a shared Telegram group chat.

Each instance is defined by a `docker-compose.yml` file within its respective directory (`/opt/tetrahedral/inst[1-4]/`). Key configuration details are summarized below:

| Container        | Host Port (Gateway) | Host Port (Bridge) | Gateway Token (Truncated)                  |
| ---------------- | ------------------- | ------------------ | ------------------------------------------ |
| `openclaw-inst1` | 18789               | 18790              | `7778975f...`                              |
| `openclaw-inst2` | 18809               | 18810              | `953baad6...`                              |
| `openclaw-inst3` | 18829               | 18830              | `76c54eb6...`                              |
| `openclaw-inst4` | 18849               | 18850              | `210c89af...`                              |

### 2.2. SphereScribe Communication System

To enable agents to communicate and maintain a shared understanding, a custom communication system named "SphereScribe" is deployed. It consists of two main services.

#### SphereScribe Relay (`sphere-relay`)

A Node.js application that acts as the central message bus. Its primary responsibilities are:
1.  **Polling Telegram:** It long-polls the designated Telegram group (`-1003712395825`) using the `SphereScribeBot` token (`8612933635:...`).
2.  **Writing to Shared Memory:** Upon receiving a new message, it appends the message content, sender, and timestamp to the shared thread file (`/opt/tetrahedral/shared/memory/my-sphere-thread.md`).
3.  **Injecting Context:** It injects the message into the session context of all *other* OpenClaw instances using a `docker exec` command that calls the `chat.inject` gateway method. This ensures that agents are immediately aware of messages not directly addressed to them.

#### SphereScribe Watcher (`sphere-watcher`)

A complementary Node.js service that ensures agent *responses* are also captured in the shared memory. It works by:
1.  **Polling Agent History:** Every 5 seconds, it polls the `chat.history` of each of the four OpenClaw instances.
2.  **Detecting New Messages:** It checks for new messages with the `role: 'assistant'` that were not injected by the relay.
3.  **Writing to Shared Memory:** When a new, original agent response is found, it appends it to the `my-sphere-thread.md` file.

### 2.3. Shared Memory (`my-sphere-thread.md`)

A critical component of the architecture is the shared memory, implemented as a simple Markdown file. 

*   **Location:** `/opt/tetrahedral/shared/memory/my-sphere-thread.md`
*   **Function:** This file serves as a persistent, append-only log of the entire conversation happening in the Telegram group. It is mounted as a volume into each OpenClaw container at `/home/node/.openclaw/workspace/my-sphere-thread.md`.
*   **Purpose:** By instructing agents to read this file before responding, the system ensures that every agent has the complete, up-to-date context of the conversation, overcoming the limitations of individual session memory.

### 2.4. Failover Monitor (`failover-monitor.js`)

To ensure high availability of the underlying database, a separate monitoring script is deployed. 

*   **Location:** `/opt/tetrahedral/failover-monitor.js`
*   **Function:** This Node.js script runs on the primary server and monitors the health of the PostgreSQL primary (on CCX23) and its replica (on CRX32). 
*   **Alerting:** If it detects that the primary is unreachable for a configured number of consecutive checks (3), it sends a detailed alert to the Sovereign's Telegram account (`@JediSherpa`) with instructions for promoting the replica.
*   **Lag Detection:** It also monitors for replication lag (both in WAL bytes and seconds) and sends warnings if thresholds are exceeded.

## 3. Docker Orchestration and Networking

The entire system is orchestrated using Docker and Docker Compose.

### 3.1. Docker Network (`tetrahedral-net`)

A dedicated Docker bridge network is created to isolate the Tetrahedral components and allow them to communicate via container name.

*   **Name:** `tetrahedral-net`
*   **Subnet:** `172.18.0.0/16`
*   **Gateway:** `172.18.0.1`
*   **Connected Containers:** `openclaw-inst1`, `openclaw-inst2`, `openclaw-inst3`, `openclaw-inst4`, `sphere-relay`, `sphere-watcher`.

### 3.2. Docker Images

Three custom Docker images are used:

*   `openclaw:local`: Built from `/opt/openclaw-src`, this is the main image containing the OpenClaw application.
*   `sphere-relay:local`: Built from `/opt/tetrahedral/relay/Dockerfile`, this image contains the Node.js environment and the `relay.js` script.
*   `sphere-watcher:local`: Built from `/opt/tetrahedral/relay/Dockerfile.watcher`, this image contains the Node.js environment and the `watcher.js` script.

### 3.3. Volume Mounts

Volume mounts are used extensively to manage configuration, persist data, and enable the shared memory system.

*   **Instance Config:** `/opt/tetrahedral/inst[N]/config` is mounted to `/home/node/.openclaw` in each instance.
*   **Instance Workspace:** `/opt/tetrahedral/inst[N]/workspace` is mounted to `/home/node/.openclaw/workspace`.
*   **Shared Thread:** The file `/opt/tetrahedral/shared/memory/my-sphere-thread.md` is mounted directly into each instance's workspace.
*   **Relay/Watcher State:** The `/opt/tetrahedral/relay/state` directory is mounted to `/state` in the `sphere-relay` and `sphere-watcher` containers to persist their polling offsets.
*   **Docker Socket:** `/var/run/docker.sock` is mounted into the `sphere-relay` and `sphere-watcher` containers, allowing them to execute `docker exec` commands against the OpenClaw instances.

## 4. Communication Flow Diagram

The following diagram illustrates the end-to-end message flow within the Tetrahedral architecture.

```mermaid
sequenceDiagram
    participant User
    participant Telegram
    participant SphereScribe Relay
    participant Shared Thread
    participant OpenClaw Inst. A
    participant OpenClaw Inst. B
    participant SphereScribe Watcher

    User->>+Telegram: Sends message to group
    SphereScribe Relay->>+Telegram: Polls for updates (getUpdates)
    Telegram-->>-SphereScribe Relay: Returns new message
    SphereScribe Relay->>+Shared Thread: Appends message to .md file
    SphereScribe Relay->>+OpenClaw Inst. B: Injects message via `docker exec`
    Note right of SphereScribe Relay: Repeats for Inst. C & D

    OpenClaw Inst. A->>+Telegram: Posts response to group
    User-->>-OpenClaw Inst. A: Sees response

    SphereScribe Watcher->>+OpenClaw Inst. A: Polls chat history
    OpenClaw Inst. A-->>-SphereScribe Watcher: Returns new assistant message
    SphereScribe Watcher->>+Shared Thread: Appends agent response to .md file
    Note right of SphereScribe Watcher: All agents now have full context
```

## 5. Conclusion

The Tetrahedral architecture provides a robust and scalable framework for multi-agent collaboration. By decoupling individual agent instances and using a centralized relay and shared memory system, it ensures that all participants have a consistent and complete view of the operational context. The use of Docker enables easy deployment, configuration, and management of the entire system, while the failover monitor provides a crucial layer of resilience for the underlying database infrastructure. This design pattern is well-suited for complex tasks requiring the coordinated effort of multiple specialized AI agents.
