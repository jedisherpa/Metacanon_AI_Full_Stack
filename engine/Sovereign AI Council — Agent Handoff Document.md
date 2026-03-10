# Sovereign AI Council — Agent Handoff Document

**Date:** February 9, 2026
**Project:** council-web (Manus managed web app)
**Project Path:** `/home/ubuntu/council-web`
**Latest Checkpoint:** `7337a608`

---

## 1. PROJECT OVERVIEW

The **Sovereign AI Council** is a news de-spinning tool. Users paste a news article (text or URL), and 12 AI "perspectives" (Strategist, Ethicist, Engineer, Artist, Historian, Skeptic, Mystic, Economist, Psychologist, Futurist, Guardian, Sovereign) analyze it simultaneously. A final synthesis distills all perspectives into a comprehensive, bias-aware verdict.

The app has a "Dark Parliament" visual theme — deep obsidian (#0D0D12) background, warm gold (#C9A84C) accents, DM Serif Display for titles, DM Sans for body text.

---

## 2. ARCHITECTURE

```
┌─────────────────────┐     SSE Stream      ┌──────────────────────────┐
│  Frontend (React)   │ ◄──────────────────► │  Web App Backend         │
│  - Home.tsx         │                      │  (Express + tRPC)        │
│  - useCouncil.ts    │                      │  server/_core/index.ts   │
│  - PerspectiveCard  │                      └──────────┬───────────────┘
│  - SynthesisPanel   │                                 │ Proxy POST
│  - CouncilProgress  │                                 ▼
└─────────────────────┘                      ┌──────────────────────────┐
                                             │  Hetzner Server          │
                                             │  178.156.193.28:8080     │
                                             │  Docker: core-engine     │
                                             │  /deliberate/stream (NEW)│
                                             │  /deliberate (OLD)       │
                                             │  /health                 │
                                             └──────────┬───────────────┘
                                                        │ 6 parallel API calls
                                                        ▼
                                             ┌──────────────────────────┐
                                             │  Morpheus AI Network     │
                                             │  https://api.mor.org/    │
                                             │  api/v1                  │
                                             │  6 API keys, 2 waves     │
                                             └──────────────────────────┘
```

### Key Components:
- **Frontend:** React 19 + Tailwind 4 + Framer Motion, dark theme
- **Backend:** Express 4 + tRPC 11, Manus OAuth, TiDB database
- **Hetzner Server:** Fastify-based Node.js app in Docker, orchestrates the 12-perspective deliberation
- **Morpheus AI:** Decentralized AI compute network (OpenAI-compatible API)

---

## 3. CREDENTIALS & ACCESS

### Hetzner Server (Sovereign AI Platform)
- **IP:** `178.156.193.28`
- **SSH User:** `root`
- **SSH Password:** `Ow5d1Z5ITe5sMU`
- **Docker Container:** `sovereign-ai-platform-core-engine-1`
- **Service Port:** `8080`
- **SSH Command:** `sshpass -p 'Ow5d1Z5ITe5sMU' ssh -o StrictHostKeyChecking=no root@178.156.193.28`

### Morpheus API
- **Base URL:** `https://api.mor.org/api/v1` (OpenAI-compatible)
- **6 API Keys** are stored as Manus secrets: `MORPHEUS_API_KEY_1` through `MORPHEUS_API_KEY_6`
- Also `MORPHEUS_API_KEY` as a fallback single key

### Morpheus Models Used
| Wave | Perspectives | Model |
|------|-------------|-------|
| Wave 1 (slots 1-6) | Strategist, Ethicist, Engineer, Artist, Historian, Skeptic | `llama-3.3-70b:web` |
| Wave 2 (slots 1-6) | Mystic, Economist, Psychologist, Futurist, Guardian, Sovereign | `qwen3-next-80b:web` |
| Synthesis | Final synthesis | `venice-uncensored:web` |

### Manus Web App
- **Project Name:** `council-web`
- **Features:** db, server, user (Manus OAuth + TiDB database)
- **Dev URL:** `https://3000-i8sm2x3abgkd2vljllv3o-629180d9.us2.manus.computer`

---

## 4. THE CORE PROBLEM (What I Was Trying to Fix)

### Original Issue
The original `/deliberate` endpoint on the Hetzner server returns a single JSON blob after ALL 12 perspectives + synthesis complete (~90-120 seconds). During this time, the Manus gateway times out the connection because there's no data flowing.

### What Was Already Done (Working)
1. **Added SSE streaming to the web app backend** — sends keepalive pings every 8 seconds to prevent gateway timeout ✅
2. **Added `/deliberate/stream` endpoint to the Hetzner server** — this new endpoint streams each perspective as an SSE event as it completes ✅ (verified working with direct curl)
3. **Frontend already handles streaming** — `useCouncil.ts` hook processes SSE events and updates UI in real-time ✅

### The Remaining Problem: Proxy from Web App → Hetzner

The web app backend needs to proxy the SSE stream from the Hetzner server's `/deliberate/stream` endpoint to the browser. **This is where I got stuck.**

The Manus managed dev server environment has network restrictions that prevent outgoing POST requests from the server process:

| Method | GET requests | POST requests |
|--------|-------------|---------------|
| `fetch()` | ✅ Works (health endpoint) | ❌ Hangs forever (never reaches Hetzner) |
| `http.request()` | ❌ ECONNRESET (instant, 2-3ms) | ❌ ECONNRESET (instant, 2-3ms) |
| `child_process.spawn('curl')` | ✅ Works standalone | ⚠️ Spawns but output not captured in server |
| Direct `curl` from shell | ✅ Works perfectly | ✅ Works perfectly |

**Key findings:**
- `fetch()` GET to `http://178.156.193.28:8080/health` works fine from inside the server
- `fetch()` POST to `http://178.156.193.28:8080/deliberate/stream` hangs — the request never reaches the Hetzner server (confirmed via Docker logs)
- `http.request()` with any configuration (agent:false, family:4, keepAlive:false) fails instantly with ECONNRESET
- `spawn('curl', [...])` runs from standalone tsx scripts but when run inside the managed dev server (tsx watch), the curl process appears to spawn (PID is assigned, log message appears) but no child curl process shows in `pstree` and no output is captured
- A `socat` TCP proxy on localhost:29876 → 178.156.193.28:8080 was tried; curl to the socat proxy works from shell but fetch() POST to localhost:29876 from inside the server also hangs

---

## 5. APPROACHES TO TRY NEXT

### Approach A: Use the Built-in LLM Helper (Recommended)
The Manus web app template provides `invokeLLM()` from `server/_core/llm.ts` which works from inside the server. Instead of proxying to the Hetzner server, implement the council orchestration directly in the web app backend using `invokeLLM()`. The Hetzner server source code is at `/home/ubuntu/hetzner_server_source.js` (678 lines) — the perspective prompts and synthesis logic can be extracted from there.

**Pros:** No network restriction issues, uses Manus's built-in API
**Cons:** May not use the Morpheus decentralized network (uses Manus's LLM instead), need to reimplement the 12-perspective orchestration

### Approach B: Write a Standalone Proxy Process
Since `spawn('curl')` works from standalone tsx scripts but not from inside the managed dev server, create a separate Node.js process that acts as a local proxy:
1. Create a standalone script (e.g., `server/council-proxy-worker.ts`) that listens on a local port (e.g., 19999)
2. When it receives a POST, it spawns curl to the Hetzner server and pipes the output back
3. The managed dev server's Express handler calls `fetch('http://localhost:19999/deliberate', ...)` — since this is localhost GET/POST to a local process, it might work
4. Start this worker process alongside the dev server

### Approach C: WebSocket Instead of SSE
Instead of SSE streaming, modify the Hetzner server to accept WebSocket connections. The managed dev server might not restrict WebSocket connections the same way it restricts HTTP POST.

### Approach D: Modify the Hetzner Server to Push Results
Instead of the web app pulling from Hetzner, have the Hetzner server push results to the web app:
1. Web app creates a unique session ID and returns it to the browser
2. Web app sends the article + session ID to Hetzner via a GET request with query params (GETs work!)
3. Hetzner processes and stores results, then calls back to the web app with each perspective
4. Web app stores results in the database, browser polls for updates

### Approach E: Use the Hetzner Server as the SSE Source Directly
Skip the proxy entirely. Have the frontend connect directly to `http://178.156.193.28:8080/deliberate/stream` via SSE. This requires:
1. Adding CORS headers to the Hetzner server's streaming endpoint
2. The browser making the SSE connection directly (no proxy needed)
3. The web app backend only handles the counter increment after completion

**This is probably the simplest approach** — the only reason we had a proxy was for CORS, and adding CORS headers to the Hetzner Fastify server is trivial.

---

## 6. CURRENT FILE STATE

### Key Files Modified (from template):
| File | Purpose | Status |
|------|---------|--------|
| `server/_core/index.ts` | Express server with council proxy endpoints | Has spawn('curl') approach (not working) |
| `server/_core/env.ts` | Environment variables | Added MORPHEUS_API_KEY_1-6 |
| `server/council.ts` | Direct Morpheus API orchestrator | Written but unused (Morpheus API too slow from sandbox) |
| `server/db.ts` | Database helpers | Has counter increment function |
| `server/routers.ts` | tRPC procedures | Has counter.get procedure |
| `client/src/hooks/useCouncil.ts` | Frontend SSE hook | Handles streaming perspectives |
| `client/src/pages/Home.tsx` | Main UI | Dark parliament theme, all components |
| `client/src/components/ArticleInput.tsx` | Article input form | Working |
| `client/src/components/CouncilProgress.tsx` | Progress tracker | Working |
| `client/src/components/PerspectiveCard.tsx` | Perspective display | Working |
| `client/src/components/SynthesisPanel.tsx` | Synthesis display | Working |
| `shared/const.ts` | Shared constants | Has perspective colors, COUNCIL_API_URL |
| `drizzle/schema.ts` | Database schema | Has counters table |

### Files on Disk (Not in Project):
| File | Purpose |
|------|---------|
| `/home/ubuntu/hetzner_server_source.js` | Full source of the Hetzner server (678 lines) |
| `/home/ubuntu/streaming_endpoint.ts` | The streaming endpoint code injected into Hetzner |

---

## 7. HETZNER SERVER STREAMING ENDPOINT

The `/deliberate/stream` endpoint was successfully added to the Hetzner Docker container. It sends these SSE events:

```
event: status
data: {"type":"status","message":"Deliberation started","phase":"submitting"}

event: status  
data: {"type":"status","message":"Wave 1: Processing The Strategist, ...","phase":"deliberating"}

event: perspective
data: {"type":"perspective","perspectiveId":"strategist","perspectiveName":"The Strategist","content":"...","model":"llama-3.3-70b:web","wave":1}

... (more perspectives as they complete) ...

event: status
data: {"type":"status","message":"Synthesizing...","phase":"synthesizing"}

event: synthesis
data: {"type":"synthesis","content":"...","model":"venice-uncensored:web"}

event: complete
data: {"type":"complete","totalPerspectives":12,"totalTime":95.2}
```

To verify it's still working:
```bash
sshpass -p 'Ow5d1Z5ITe5sMU' ssh -o StrictHostKeyChecking=no root@178.156.193.28 \
  "curl -s -N --max-time 120 -X POST http://localhost:8080/deliberate/stream \
   -H 'Content-Type: application/json' \
   -d '{\"query\": \"test\"}' | head -20"
```

---

## 8. FRONTEND SSE EVENT FORMAT EXPECTED

The `useCouncil.ts` hook expects these SSE event types:

| Event Type | Data Fields | Action |
|-----------|-------------|--------|
| `status` | `message`, `phase` | Updates status display |
| `perspective` | `perspectiveId`, `perspectiveName`, `content`, `model`, `wave` | Adds to perspectives list |
| `synthesis` | `content`, `model` | Shows synthesis panel |
| `complete` | `totalPerspectives`, `totalTime` | Marks deliberation complete |
| `error` | `message`, `detail` | Shows error state |
| `ping` | `elapsed` | Keepalive (ignored by UI) |
| `counter` | `councilsConvened` | Updates counter display |

---

## 9. DATABASE

- **Provider:** TiDB (MySQL-compatible)
- **Tables:** `users` (from template), `counters` (custom)
- **Counters table:** Stores `councils_convened` count, incremented on each successful deliberation
- **Migration:** Already pushed via `pnpm db:push`

---

## 10. WHAT'S WORKING RIGHT NOW

1. ✅ Frontend UI loads correctly (dark parliament theme)
2. ✅ Health check endpoint works (`/api/council/health`)
3. ✅ Hetzner streaming endpoint works (tested via direct curl)
4. ✅ Frontend SSE handling works (useCouncil hook)
5. ✅ Database counter works
6. ✅ All vitest tests pass (10 tests across 5 files)
7. ❌ **The proxy from web app backend → Hetzner streaming endpoint does NOT work** (the core issue)

---

## 11. QUICK START FOR NEXT AGENT

```bash
# 1. Check project status
cd /home/ubuntu/council-web

# 2. Verify Hetzner server is up
curl -s http://178.156.193.28:8080/health | python3 -m json.tool

# 3. Verify Hetzner streaming works (from shell, not from server)
timeout 30 curl -s -N -X POST http://178.156.193.28:8080/deliberate/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}' | head -10

# 4. Check dev server
curl -s http://localhost:3000/api/council/health

# 5. The problem to solve: make this work from inside the Express server
# Currently the POST to Hetzner hangs/fails from inside the managed dev server process

# 6. Read the Hetzner server source for reference
cat /home/ubuntu/hetzner_server_source.js

# 7. SSH to Hetzner if needed
sshpass -p 'Ow5d1Z5ITe5sMU' ssh -o StrictHostKeyChecking=no root@178.156.193.28
```

---

## 12. USER'S ORIGINAL REQUEST

> "Can you just populate the responses to the website one at a time as they finish?"

The user wants perspectives to appear on the page individually as each one completes, rather than waiting for all 12 + synthesis to finish before showing anything. The frontend already supports this — the blocking issue is purely the backend proxy.
