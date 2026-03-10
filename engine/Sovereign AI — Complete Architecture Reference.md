# Sovereign AI — Complete Architecture Reference

**Author:** Manus AI
**Date:** February 26, 2026

---

## 1. System Overview

The Sovereign AI platform is a dual-server, multi-agent architecture. The two servers work together to host a total of **5 AI agents** that communicate through a shared Telegram group, a shared memory file, and a replicated PostgreSQL database.

```
┌──────────────────────────────────────────────────────────────────┐
│                     SERVER PRIMARY (CCX23)                        │
│                     178.156.233.14                                │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                  Docker Network: tetrahedral-net             │ │
│  │                  172.18.0.0/16                               │ │
│  │                                                              │ │
│  │  [openclaw-inst1]  [openclaw-inst2]  [openclaw-inst3]  [openclaw-inst4] │
│  │  JediSherpa        WizardJoe         FeralPharaoh       RoyalOracle     │
│  │  Port 18789        Port 18809        Port 18829         Port 18849      │
│  │                                                              │ │
│  │  [sphere-relay]  [sphere-watcher]                           │ │
│  │  (polls Telegram, injects messages)                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [PostgreSQL Primary :5432]  [Sphere Thread Engine :8080]        │
│  [Caddy Reverse Proxy]       [Web Frontend :8088]                │
└──────────────────────────────────────────────────────────────────┘
                              │
                    Streaming Replication (WAL)
                    SSH (omni-sync)
                              │
┌──────────────────────────────────────────────────────────────────┐
│                     SERVER REPLICA (CRX31)                        │
│                     178.156.193.28                                │
│                                                                   │
│  [Omni Agent] (host process, openclaw-gateway)                   │
│  Port 18789                                                       │
│                                                                   │
│  [omni-sync] (Node.js, syncs shared thread via SSH)              │
│  [PostgreSQL Replica :5432]                                       │
│  [node-exporter :9100]  [postgres-exporter :9187]                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Roster

| Agent | Server | Container / Process | Telegram Bot ID | Gateway Port | Model |
|---|---|---|---|---|---|
| JediSherpa | Primary | `openclaw-inst1` | 8344056451 | 18789 | moonshot/kimi-k2.5 |
| WizardJoe | Primary | `openclaw-inst2` | 8777785057 | 18809 | moonshot/kimi-k2.5 |
| FeralPharaoh | Primary | `openclaw-inst3` | 8674346966 | 18829 | moonshot/kimi-k2.5 |
| RoyalOracle | Primary | `openclaw-inst4` | 8721066700 | 18849 | moonshot/kimi-k2.5 |
| Omni | Replica | `openclaw-gateway` (host) | 7861830455 | 18789 | moonshot/kimi-k2.5 |

---

## 3. Communication Flow

### 3.1 Human → Agents (Inbound)

1. A human sends a message to the **My Sphere Telegram group** (`-1003712395825`).
2. The **SphereScribe Relay** (`sphere-relay` container) long-polls the Telegram API every 25 seconds.
3. Upon receiving a message, the Relay does two things simultaneously:
   a. **Appends** the message to `/opt/tetrahedral/shared/memory/my-sphere-thread.md`.
   b. **Injects** the message into the OpenClaw session of every other agent via `docker exec openclaw-instN node openclaw.mjs gateway call chat.inject`.
4. On the Replica server, the **omni-sync** daemon polls every 5 seconds and **pulls** the updated `my-sphere-thread.md` from the primary server via SCP, placing it in Omni's workspace.

### 3.2 Agents → Shared Memory (Outbound)

1. When an agent on the **Primary** server responds, the **SphereScribe Watcher** (`sphere-watcher` container) detects the new `assistant` message by polling `chat.history` every 5 seconds.
2. The Watcher **appends** the agent's reply to the shared thread file.
3. When **Omni** (on the Replica) responds, the **omni-sync** daemon detects the new reply and **pushes** it to the primary server's shared thread file via SSH.

### 3.3 Shared Memory File

The file `/opt/tetrahedral/shared/memory/my-sphere-thread.md` is the single source of truth for the entire conversation. It is:
- **Mounted** into all 4 Primary agent containers at `/home/node/.openclaw/workspace/my-sphere-thread.md`.
- **Pulled** to Omni's workspace at `/home/oc/.openclaw/workspace/my-sphere-thread.md` every 5 seconds.

---

## 4. Database Architecture

### 4.1 Primary Database (CCX23)

- **Type:** PostgreSQL 16
- **Listener:** `0.0.0.0:5432`
- **Database:** `sovereign_constellation`
- **User:** `constellation` / `C0nst3ll4t10n_S3cur3!`
- **WAL Level:** `replica`
- **Replication User:** `replicator` / `R3pl1c4t0r_S3cur3!`

### 4.2 Replica Database (CRX31)

- **Type:** PostgreSQL 16 (Hot Standby)
- **Listener:** `localhost,178.156.193.28:5432`
- **Mode:** `hot_standby = on` (read-only queries allowed)
- **Replication:** Streaming from primary via `primary_conninfo`
- **Lag Monitoring:** `failover-monitor.js` on the primary server checks WAL lag every 60 seconds and alerts via Telegram if lag exceeds 50MB or primary becomes unreachable.

### 4.3 Sphere Thread Engine Database (separate)

The Sphere Thread Engine (web app) uses a **separate, isolated PostgreSQL** instance running in Docker (`docker-web-1` stack). This is **not** the same as the `sovereign_constellation` database.
- **Database:** `council`
- **User:** `council` / `council`
- **Scope:** Stores game state, proposals, votes, user profiles for the web app.

---

## 5. Service Inventory

### Primary Server (CCX23)

| Service | Type | Port | Config File |
|---|---|---|---|
| `openclaw-inst1` | Docker | 18789, 18790 | `tetrahedral/inst1/docker-compose.yml` |
| `openclaw-inst2` | Docker | 18809, 18810 | `tetrahedral/inst2/docker-compose.yml` |
| `openclaw-inst3` | Docker | 18829, 18830 | `tetrahedral/inst3/docker-compose.yml` |
| `openclaw-inst4` | Docker | 18849, 18850 | `tetrahedral/inst4/docker-compose.yml` |
| `sphere-relay` | Docker | (none) | `tetrahedral/relay/relay.js` |
| `sphere-watcher` | Docker | (none) | `tetrahedral/relay/watcher.js` |
| `docker-web-1` | Docker | 8088 | `sphere-thread-engine/deploy/docker/docker-compose.live.yml` |
| `docker-engine-1` | Docker | 8080 | `sphere-thread-engine/deploy/docker/docker-compose.live.yml` |
| `docker-db-1` | Docker | (internal) | `sphere-thread-engine/deploy/docker/docker-compose.live.yml` |
| `caddy` | Docker | 80, 443 | `caddy/Caddyfile` |
| `postgresql` | Host | 5432 | `/etc/postgresql/16/main/` |
| `sas-temporal-worker` | systemd | (none) | `/opt/sas-swarm/` |
| `sas-telegram-bot` | systemd | (none) | `/opt/sas-swarm/` |
| `failover-monitor` | Node.js process | (none) | `tetrahedral/failover-monitor.js` |

### Replica Server (CRX31)

| Service | Type | Port | Config File |
|---|---|---|---|
| `openclaw-gateway` (Omni) | Host process | 18789 | `omni-openclaw.json` |
| `omni-sync` | Node.js process | (none) | `omni-sync/omni_sync.js` |
| `postgresql` | Host | 5432 | `/etc/postgresql/16/main/` |
| `node-exporter` | Docker | 9100 | `monitoring/docker-compose.yml` |
| `postgres-exporter` | Docker | 9187 | `monitoring/docker-compose.yml` |
| `sovereign-ai-platform-core-engine-1` | Docker | 8080 | (V1 engine) |
| `sovereign-ai-platform-v2-core-engine-v2-1` | Docker | 8081 | (V2 engine) |

---

## 6. API Keys & Credentials Reference

> ⚠️ **SECURITY WARNING:** The following keys are from the production environment. For a local setup, you should create new API keys and bot tokens. Never commit these to a public repository.

### LLM Providers (All Agents)

| Provider | Key Variable | Notes |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | Claude models |
| OpenAI | `OPENAI_API_KEY` | GPT models |
| xAI | `XAI_API_KEY` | Grok models |
| Groq | `GROQ_API_KEY` | Llama models (fast) |
| Moonshot | `MOONSHOT_API_KEY` | Kimi K2.5 (primary model) |
| ElevenLabs | `ELEVENLABS_API_KEY` | Voice synthesis |

### Telegram Bots

| Bot | Variable | Telegram ID |
|---|---|---|
| JediSherpa | `JEDI_SHERPA_BOT_TOKEN` | 8344056451 |
| WizardJoe | `WIZARD_JOE_BOT_TOKEN` | 8777785057 |
| FeralPharaoh | `FERAL_PHARAOH_BOT_TOKEN` | 8674346966 |
| RoyalOracle | `ROYAL_ORACLE_BOT_TOKEN` | 8721066700 |
| Omni | (in `omni-openclaw.json`) | 7861830455 |
| SphereScribeBot | `SCRIBE_TOKEN` in relay.js | 8612933635 |

---

## 7. SSH Key Setup (for omni-sync)

The `omni-sync` daemon on the replica server uses an SSH key to pull/push the shared thread file to the primary server. The key is located at `/root/.ssh/sphere_sync_key` on the replica.

To replicate this:
1. On the replica server: `ssh-keygen -t ed25519 -f /root/.ssh/sphere_sync_key -N ""`
2. Copy the public key to the primary server: `ssh-copy-id -i /root/.ssh/sphere_sync_key.pub root@[PRIMARY_IP]`
3. Update the `SSH_KEY` constant in `omni-sync/omni_sync.js` if the path changes.

---

## 8. Skills System

Each agent has a `skills/sphere-commands/` directory containing 50 Markdown skill files. These files define the commands and behaviors available to each agent. The skills are identical across all 5 agents and cover:

- **Governance:** `propose.md`, `vote.md`, `ratchet.md`, `emergency-shutdown.md`, `constitution.md`
- **Deliberation:** `converge.md`, `perspective.md`, `prism.md`, `ask.md`, `drills.md`
- **Hub Operations:** `broadcast.md`, `escalations.md`, `everyone.md`, `sync.md`
- **Infrastructure:** `db-health.md`, `deploy-constellation.md`, `status-all.md`
- **Identity:** `passport.md`, `lens.md`, `cxp.md`

To replicate the skills, copy the contents of any agent's `skills/sphere-commands/` directory to the same path in each new agent's config directory.
