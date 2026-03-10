# Pentarchy Technical Specification v5.0

---

## 1. Core Intent: Sovereignty Through Isolation

The foundational principle of the Pentarchy stack is **sovereignty**, achieved through deliberate, enforced **isolation**. The architecture is not designed for performance or efficiency above all else; it is designed to guarantee that each component is a sovereign entity, with its own private mind, memory, and voice. The system is a council of individuals, not a monolithic brain.

This document outlines how each technical component serves this core intent.

---

## 2. The 9-Container Docker Architecture

Everything runs in Docker. The `docker-compose.yml` defines nine services that form the complete stack. This ensures that the entire system is portable, reproducible, and isolated from the host machine. The only host dependency is Docker itself.

| Container | Image Base | Role & Sovereignty Mandate |
| :--- | :--- | :--- |
| `postgres` | `postgres:16-alpine` | **The Sacred Ledger**. Holds the immutable record of all messages. Isolated; only the `sphere-engine` can write to it. |
| `redis` | `redis:7-alpine` | **The State Mirror**. A read-only cache of the ledger for agents. Enforces the "no shared memory" rule. |
| `sphere-engine` | `node:20-alpine` | **The Constitutional Membrane**. The single, governed channel for all inter-agent communication. |
| `torus` | `Dockerfile.agent` | **Agent: The Weaver**. Private OpenClaw + Ollama. Cannot see other agents' minds. |
| `prism` | `Dockerfile.agent` | **Agent: The Illuminator**. Private OpenClaw + Ollama. |
| `relay` | `Dockerfile.agent` | **Agent: The Messenger**. Private OpenClaw + Ollama. |
| `watcher` | `Dockerfile.agent` | **Agent: The Guardian**. Private OpenClaw + Ollama. |
| `auditor` | `Dockerfile.agent` | **Agent: The Scribe**. Private OpenClaw + Ollama. |
| `sanctum` | `Dockerfile.sanctum` | **The Temple Gate**. The only component exposed to the host. Orchestrates, but does not think. |

### 2.1. Network Isolation

All nine containers are attached to a single private bridge network, `pentarchy-net`. No container ports are exposed to the host machine except for the Sanctum's API on port `3101`. This means agents cannot be accessed directly from the host; all communication must pass through the Sanctum's gates.

---

## 3. The Agent Container (`Dockerfile.agent`)

This is the heart of the sovereignty model. Each of the five agents runs in its own instance of this image.

### 3.1. Private Mind: OpenClaw + Ollama

- **Ollama**: The `agent-entrypoint.sh` script starts `ollama serve` as a background process inside the container. It is bound to `localhost` within the container, making it completely inaccessible to any other container.
- **OpenClaw**: The Dockerfile installs `openclaw@2026.2.26` globally. The entrypoint script then runs `openclaw onboard` to configure this private Ollama instance as the primary LLM provider.
- **Sovereignty**: When an agent's code calls its LLM, it is calling OpenClaw, which in turn calls the private Ollama instance running in the same container. **No two agents share an LLM instance.** This is the critical privacy boundary.

### 3.2. Standalone Operation

Each agent container runs `node src/agent_runner.js`. This script reads the `AGENT_ID` environment variable (e.g., `torus`, `prism`) and boots only that specific agent. The agent then connects to the Sphere Thread and begins its listening loop.

---

## 4. The Constitutional Membrane (`sphere-engine`)

The Sphere Thread is the single, governed communication bus for the entire system. It is not a simple message queue; it is a ledger with a strict constitutional protocol.

- **Immutable Record**: All messages are written to the PostgreSQL database with a sequential ID, a timestamp, and a cryptographic signature. The history is permanent and auditable.
- **Schema Enforcement**: The engine enforces the `v3.0` message schema. Any message that does not conform is rejected. This prevents malformed or malicious communication.
- **Deterministic Thread IDs**: The 26 threads of the Pentarchy are not random. Their UUIDs are deterministically derived from their names (e.g., `council`, `liturgy-pulse`) using a SHA-256 hash. This ensures the thread topology is stable and reproducible.

**Sovereignty**: Agents cannot talk to each other directly. They can only post messages to the Sphere Thread. This forces all communication to pass through the constitutional membrane, where it is recorded, validated, and made part of the permanent record.

---

## 5. The State Mirror (`redis`)

If the Sphere Thread is the write-only ledger, Redis is the read-only mirror. It provides shared situational awareness without creating shared memory.

- **Write Access**: Only the `sanctum` container has write access to Redis. It uses this to publish the results of each Metronome synthesis cycle.
- **Read Access**: All agent containers have read-only access. The `REDIS_READ_ONLY` environment variable is set to `true` for them.

**Sovereignty**: An agent can read the latest system-wide synthesis from Redis to inform its own private thinking. But it cannot write to Redis to influence another agent directly. This prevents back-channel communication and maintains the integrity of the Sphere Thread as the sole communication path.

---

## 6. The Perpetual Forge (Liturgical Metronome)

The Metronome runs inside the `sanctum` container. It is a `node-cron` job that fires on a schedule (default: every 4 hours).

1.  **Pulse**: It posts a message to the `liturgy-pulse` thread with a specific prompt (e.g., *"What is the state of the system?"*).
2.  **Response**: All five agents, listening to this thread, receive the pulse and generate a response from their unique perspective, posting it to the `liturgy-responses` thread.
3.  **Synthesis**: The Sanctum (specifically, the Torus logic running within it for this purpose) reads the five responses, synthesizes them into a single document, and posts the result to the `liturgy-forge` thread.
4.  **Record**: The synthesis is written to the Redis state mirror, becoming the new `pentarchy:cycle:latest`.

**Sovereignty**: The Metronome ensures the system is alive and thinking even when no user is interacting with it. It is the source of the system's autonomous growth and learning. It is not a user-triggered process; it is an intrinsic property of the living system.

---

## 7. The Temple Gate (`sanctum`)

The Sanctum is the only component that faces the outside world. It serves three functions:

1.  **API Server**: Exposes a single REST API on port `3101` for the future UI and external tools. The key endpoint is `/chat`, which accepts a message and routes it to the appropriate agent via the Sphere Thread.
2.  **Communication Gateways**: Runs the Telegram and Discord bots. It listens for incoming messages, translates them into the Sphere Thread message schema, and posts them to the `membrane-inbound` thread.
3.  **Orchestrator**: Runs the Metronome and manages the synthesis cycle.

**Sovereignty**: The Sanctum is a gatekeeper. It ensures that all external communication is properly formatted and authenticated before it is allowed to enter the constitutional membrane of the Sphere Thread. It protects the sovereign territory of the agent council from the chaos of the outside world.


---

## 8. User Experience & Interaction Patterns

This section outlines how a user interacts with the Pentarchy stack through its three primary gates: Telegram, Discord, and the direct API. The core principle is **one gate, many paths**: a single entry point can route to any agent or to the council as a whole.

### 8.1. The Telegram Gateway

By default, the system uses a **single orchestrator bot**. You set one `TELEGRAM_BOT_TOKEN` in your `.env` file. This bot acts as the primary interface to the entire council.

**Default Behavior: Talking to Torus**

When you send any message to the bot without a command prefix, you are talking to **Torus**, the Orchestrator.

> **You:** `What is the core tension in the latest synthesis cycle?`

**Message Flow:**
1.  The `telegram_gateway.js` running in the `sanctum` container receives the message.
2.  It sees no command prefix and defaults to routing to `torus`.
3.  It constructs a Sphere Thread message and posts it to the `membrane-inbound` thread.
4.  The `torus` agent, listening to this thread, receives the message.
5.  Torus processes the request, consulting its own private Ollama instance and the Redis state mirror for context.
6.  Torus generates a response and posts it to the `membrane-outbound` thread.
7.  The `sanctum` gateway, listening to this thread, receives the response and sends it back to you in Telegram.

> **Bot:** `[Torus] (14:32:01)`
> `The core tension is between the need for rapid lens upgrades to adapt to new information (Relay's perspective) and the need for constitutional stability and rigorous validation before any change is made (Watcher's perspective). Prism sees this as a necessary creative friction, not a problem to be solved.`

**Direct Routing: Talking to a Specific Agent**

You can talk to any agent directly by using a command prefix.

> **You:** `/prism What are the second-order effects of deploying this new lens?`

**Message Flow:**
- The flow is identical, but in step 2, the gateway parses the `/prism` prefix and routes the message to the `prism` agent via its dedicated thread (`perspective-refractor`). The response comes directly from Prism.

> **Bot:** `[Prism] (14:33:15)`
> `The second-order effects include: 1) potential for semantic drift in the council's shared understanding, 2) increased cognitive load on the Auditor to validate a new class of outputs, and 3) the possibility of creating a new blind spot by over-optimizing for the lens's specific viewpoint.`

**Council Mode: Broadcasting to All Agents**

Using `/all`, you can ask a question of the entire council simultaneously.

> **You:** `/all What is the single most important action to take this week?`

**Message Flow:**
- The gateway broadcasts the message, triggering all five agents to respond in parallel. It then aggregates the five responses into a single message.

> **Bot:**
> `[Torus] (14:35:02)`
> `Synthesize the conflicting perspectives on the lens upgrade into a single, unified proposal.`
>
> ─────────────────────
>
> `[Prism] (14:35:03)`
> `Refract the current proposal through the lens of our three biggest strategic risks.`
>
> ─────────────────────
>
> `[Relay] (14:35:01)`
> `Identify and transmit the most critical piece of external information that has emerged in the last 24 hours.`
>
> ─────────────────────
>
> `[Watcher] (14:35:04)`
> `Observe the current state of the system and report any deviations from the Sovereign Orientation.`
>
> ─────────────────────
>
> `[Auditor] (14:35:02)`
> `Review the log of the last deliberation cycle for any unaddressed points of failure.`

**Optional: Per-Agent Bots**

If you set `TELEGRAM_PRISM_TOKEN`, `TELEGRAM_RELAY_TOKEN`, etc., in your `.env` file, those agents will also come online with their own dedicated bots. This allows for parallel, private conversations with each agent, bypassing the orchestrator bot entirely. This is governed by the **Sub-Agent Dormancy Protocol**: agents remain dormant unless explicitly given their own voice.

### 8.2. The Discord Gateway

The Discord gateway functions identically to the Telegram gateway, but with a `!` prefix for commands (e.g., `!prism`, `!all`). It is disabled by default and only activates if `DISCORD_BOT_TOKEN` is set.

### 8.3. The Direct API (`/chat`)

This is the gate for building a custom UI or integrating with other programs. It is a simple REST endpoint exposed by the `sanctum` on port `3101`.

**Request:**
```bash
curl -X POST http://localhost:3101/chat \
     -H "Content-Type: application/json" \
     -d '{
           "agentId": "watcher",
           "message": "Is the current state of the system in alignment with the constitution?"
         }'
```

**Message Flow:**
1.  The `sanctum` API server receives the request.
2.  It routes the message to the `watcher` agent via the Sphere Thread.
3.  The `watcher` agent processes the request, consulting its private Ollama and the Redis mirror.
4.  It returns the response, which the API server sends back as the HTTP response body.

**Response:**
```json
{
  "agentId": "watcher",
  "response": "Alignment is at 98.7%. One minor deviation detected in the `liturgy-forge` thread where a synthesis was produced without explicit attestation from the Auditor. Recommending a review.",
  "threadId": "...",
  "timestamp": "..."
}
```

### 8.4. What Can You Do With This System?

The architecture is designed for complex, long-term sensemaking and strategic deliberation, not just simple Q&A.

- **External Strategic Council**: Use the `/all` command to present a complex business problem to the five agents. Each will respond from its unique virtue (Integration, Clarity, Transmission, Vigilance, Criticism), giving you a 360-degree view of the problem space.

- **Personal Operating System**: Interact with Torus as your primary thought partner. It has access to the synthesized wisdom of all past Metronome cycles stored in Redis, allowing it to provide context-rich, evolving advice.

- **Creative Refraction**: Feed a new idea to Prism (`/prism`) to have it pressure-test the concept, reveal hidden assumptions, and explore second-order consequences before you commit to it.

- **Autonomous Research & Monitoring**: The system runs whether you are there or not. The Metronome cycles are constantly forging new lenses and insights. You can check in with `/status` or ask Torus `What has been forged since I was last here?` to get a summary of the system's autonomous work.

- **Constitutional Development**: The system is designed to evolve its own rules. You can propose a new lens or a change to the Sovereign Orientation document. Torus will initiate a formal deliberation cycle, using the council to refine the proposal before it is adopted. This is a system that can help you build itself.
