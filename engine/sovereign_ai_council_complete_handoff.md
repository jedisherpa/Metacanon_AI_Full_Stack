# Sovereign AI Council — Complete Engineering Handoff

**Date:** February 9, 2026
**Run ID:** 20260209_042020
**Protocol:** Multi-Pass Deliberation (5 Phases, 10 Advisors)

---

## Table of Contents

1. [Situation Report](#1-situation-report)
2. [What Was Done (Phase A — CORS Fix)](#2-what-was-done-phase-a--cors-fix)
3. [Outstanding Bug Fix: Strategist Active State](#3-outstanding-bug-fix-strategist-active-state)
4. [The Board's Full Deliberation](#4-the-boards-full-deliberation)
5. [Consensus Core](#5-consensus-core)
6. [Decision Options](#6-decision-options)
7. [Crux & Paradox Map](#7-crux--paradox-map)
8. [Minority Reports](#8-minority-reports)
9. [Appendix: Credentials & Access](#9-appendix-credentials--access)
10. [Appendix: Codebase Architecture](#10-appendix-codebase-architecture)

---

## 1. Situation Report

### Where We Were

The Sovereign AI Platform v2.0 was successfully deployed to a Hetzner CPX31 server on February 9, 2026. The system achieved a significant milestone: a fully operational, self-hosted deliberation engine running on sovereign infrastructure, powered by the decentralized Morpheus AI network at zero cost. The 12-Perspective Council was seated, both lenses (default-12 and news-bias) were loaded, and the API was open for business. The deployment report declared "Sovereignty Achieved" — the platform was alive, the code was owned, and the intelligence was self-directed.

However, the path from "alive on the server" to "working in the browser" revealed a critical friction point. The Manus-managed web application at fisheye.news, which provides the frontend and user authentication layer, could not make outbound POST requests to the Hetzner server due to network restrictions in the managed environment. GET requests worked; POST requests hung forever. This proxy failure was the immediate blocking issue.

### Where We Are Now

**The app is working end-to-end.** A CORS fix was applied directly to the Hetzner Fastify server, allowing the browser at fisheye.news to connect directly to `http://178.156.193.28:8080/deliberate/stream` via SSE. The proxy is bypassed entirely. A full deliberation was tested and completed successfully: 12/12 perspectives returned, synthesis generated, total time 1 minute 35 seconds.

One cosmetic bug remains: the Strategist perspective does not show the "active" (spinning) animation during deliberation, while all other 11 perspectives do. Instructions for fixing this are included below.

### What Remains (Phase B — Not Yet Done)

The board's top recommendation is to follow up with a deeper simplification of the core engine:

- Collapse the monorepo into a single service
- Remove the multi-provider abstraction (only Morpheus is used)
- Simplify the fallback chain
- Target: ~400–500 lines of clean, single-purpose code

---

## 2. What Was Done (Phase A — CORS Fix)

### Changes Applied to the Hetzner Server

Two files were modified in the Docker container at `/home/ubuntu/Sovereign-AI-Platform/`:

**File 1: `packages/core-engine/package.json`**

Added `@fastify/cors` as a dependency:

```json
{
  "dependencies": {
    "@fastify/cors": "^10.0.0"
  }
}
```

**File 2: `packages/core-engine/src/index.ts`**

Two patches were applied:

**Patch 1 — Import and register CORS plugin (near the top of the file, after Fastify instantiation):**

```typescript
import cors from "@fastify/cors";

// ... after const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: true,  // reflects the requesting origin
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
```

**Patch 2 — Add CORS headers to the SSE `writeHead` in `/deliberate/stream`:**

The SSE endpoint uses `reply.raw.writeHead()` which bypasses Fastify middleware. Explicit CORS headers were added to the `writeHead` call:

```typescript
reply.raw.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});
```

### How It Was Deployed

```bash
# SSH into Hetzner
sshpass -p 'Ow5d1Z5ITe5sMU' ssh -o StrictHostKeyChecking=no root@178.156.193.28

# Navigate to the project
cd /home/ubuntu/Sovereign-AI-Platform

# Rebuild and restart the Docker container
docker compose down
docker compose up -d --build

# Verify
curl -s http://178.156.193.28:8080/health | python3 -m json.tool
```

### Verification Results

| Test | Result |
|------|--------|
| CORS preflight (`OPTIONS`) on `/health` | `access-control-allow-origin` header present |
| CORS preflight (`OPTIONS`) on `/deliberate/stream` | `access-control-allow-origin` header present |
| POST `/deliberate/stream` with `Origin` header | SSE events stream with `Access-Control-Allow-Origin: *` |
| Full deliberation from fisheye.news browser | 12/12 perspectives returned, synthesis generated, 1m35s |

---

## 3. Outstanding Bug Fix: Strategist Active State

### The Bug

During deliberation, all 12 perspective seats show a spinning loader animation when "active" (being processed). The Strategist (index 0) never shows this animation — it stays in the "pending" (dimmed) state and then jumps directly to "complete" when its result arrives. All other 11 perspectives correctly show the spinning animation.

### Root Cause

The frontend has a staggered animation that sets each perspective to "active" one at a time every 800ms. The code uses a mutable counter variable `currentIndex` (minified as `y`) that is captured **by reference** in a React `setState` callback:

```tsx
let currentIndex = 0;
const staggerInterval = setInterval(() => {
  if (currentIndex < PERSPECTIVE_NAMES.length) {
    setState(prev => {
      // BUG: currentIndex is read here, but by the time React
      // executes this callback, currentIndex may already be
      // incremented to 1 (due to React 18 automatic batching
      // deferring the setState execution)
      const updated = [...prev.perspectives];
      if (updated[currentIndex] && updated[currentIndex].status === "pending") {
        updated[currentIndex] = { ...updated[currentIndex], status: "active" };
      }
      return { ...prev, perspectives: updated, status: "deliberating" };
    });
    currentIndex++;
  } else {
    clearInterval(staggerInterval);
  }
}, 800);
```

On the first interval tick (800ms), `currentIndex` is 0. The `setState` callback is queued. Then `currentIndex++` runs synchronously, making it 1. In React 18, `setState` callbacks inside `setInterval` may be deferred due to automatic batching. By the time React actually executes the callback, `currentIndex` has already been incremented to 1, so `updated[0]` (the Strategist) is never set to "active". The Ethicist at index 1 gets set instead, and then index 2, 3, etc. — resulting in 11 active perspectives instead of 12.

### The Fix

In `client/src/pages/Home.tsx` (or wherever the deliberation handler lives), find the `setInterval` block that stagger-activates perspectives. It will look similar to the code above.

**Find this pattern:**

```tsx
setInterval(() => {
  if (currentIndex < PERSPECTIVE_NAMES.length) {
    setState(prev => {
      if (prev.status === "complete" || prev.status === "error") {
        clearInterval(staggerInterval);
        return prev;
      }
      const updated = [...prev.perspectives];
      if (updated[currentIndex] && updated[currentIndex].status === "pending") {
        updated[currentIndex] = { ...updated[currentIndex], status: "active" };
      }
      return { ...prev, perspectives: updated, status: "deliberating" };
    });
    currentIndex++;
  } else {
    clearInterval(staggerInterval);
  }
}, 800);
```

**Replace with:**

```tsx
setInterval(() => {
  if (currentIndex < PERSPECTIVE_NAMES.length) {
    const idx = currentIndex;  // capture by value before async setState
    setState(prev => {
      if (prev.status === "complete" || prev.status === "error") {
        clearInterval(staggerInterval);
        return prev;
      }
      const updated = [...prev.perspectives];
      if (updated[idx] && updated[idx].status === "pending") {
        updated[idx] = { ...updated[idx], status: "active" };
      }
      return { ...prev, perspectives: updated, status: "deliberating" };
    });
    currentIndex++;
  } else {
    clearInterval(staggerInterval);
  }
}, 800);
```

**The change is one line:** Add `const idx = currentIndex;` at the top of the interval body, then use `idx` instead of `currentIndex` inside the `setState` callback. This ensures the value is captured before `currentIndex++` runs, so React's deferred execution reads the correct index.

---

## 4. The Board's Full Deliberation

### The Advisory Board

Ten advisors analyzed the codebase through five deliberation phases: Blind Initial Responses, Cross-Examination, Revision Pass, Multi-Axis Ranking, and Synthesis.

| Rank | Advisor | Lens | Score (out of 50) | Revision Delta |
|:----:|:--------|:-----|:-----------------:|:---------------|
| 1 | **Rich Hickey** | Simplicity, data-oriented design, immutability | 44.6 | No change |
| 2 | **Linus Torvalds** | Systems correctness, relentless pragmatism | 41.1 | Minor change |
| 3 | **Martin Fowler** | Architecture, refactoring, evolutionary design | 39.4 | Minor change |
| 4 | **Jez Humble** | Continuous delivery, deployment pipelines | 39.2 | Minor change |
| 5 | **Jeff Dean** | Systems at scale, infrastructure engineering | 38.6 | Minor change |
| 6 | **Lara Hogan** | People, teams, cognitive load | 36.3 | Minor change |
| 7 | **Margaret Hamilton** | Formal rigor, error prevention, fail-safe design | 35.9 | Minor change |
| 8 | **Marty Cagan** | Product discovery, user validation | 35.1 | Minor change |
| 9 | **Kent Beck** | Test-driven development, incremental delivery | 33.7 | Minor change |
| 10 | **Atul Gawande** | Checklists, process discipline, systemic safety | 30.2 | Minor change |

### Aggregated Multi-Axis Scores

| Advisor | Validity | Feasibility | Novelty | Risk Awareness | Alignment | **Total** |
|:--------|:--------:|:-----------:|:-------:|:--------------:|:---------:|:---------:|
| Rich Hickey | 9.4 | 9.1 | 9.0 | 7.8 | 9.3 | **44.6** |
| Linus Torvalds | 8.9 | 9.4 | 6.2 | 7.4 | 9.2 | **41.1** |
| Martin Fowler | 8.5 | 8.0 | 6.5 | 7.8 | 8.6 | **39.4** |
| Jez Humble | 8.2 | 8.3 | 6.7 | 7.8 | 8.2 | **39.2** |
| Jeff Dean | 8.0 | 7.3 | 6.9 | 8.3 | 8.1 | **38.6** |
| Lara Hogan | 7.3 | 8.1 | 6.2 | 7.4 | 7.3 | **36.3** |
| Margaret Hamilton | 7.4 | 5.4 | 6.8 | 9.5 | 6.8 | **35.9** |
| Marty Cagan | 7.2 | 7.2 | 6.3 | 7.1 | 7.3 | **35.1** |
| Kent Beck | 6.8 | 8.5 | 5.6 | 5.6 | 7.2 | **33.7** |
| Atul Gawande | 6.0 | 6.5 | 5.3 | 6.3 | 6.1 | **30.2** |

### Key Quotes from the Board

> **Rich Hickey (Ranked #1):** "The system is drowning in incidental complexity. The monorepo, the multi-provider abstraction, the unused SDK — these are solutions in search of a problem. The goal is to run one service well. The architecture should reflect that."

> **Linus Torvalds (Ranked #2):** "Stop chasing cleverness and get back to basics. The current architecture is a bloated, over-engineered mess of unnecessary abstractions. Rip out the multi-provider support, the convoluted parallel execution logic, and the monorepo. Replace it with a single, simple, self-contained service that does one thing well: deliberate."

> **Martin Fowler (Ranked #3):** "This creates a clearer architectural boundary. The 'Sovereign AI Council' becomes a single, deployable component. The split between Manus and Hetzner feels like a temporary solution that will cause long-term pain."

---

## 5. Consensus Core

The board achieved strong consensus on four immediate actions.

### Action 1: Fix the Proxy with the Simplest Possible Solution

**Confidence Level:** Very High — **STATUS: DONE**

Add CORS headers to the Hetzner Fastify server and have the browser connect directly to `http://178.156.193.28:8080/deliberate/stream`. This bypasses the Manus proxy entirely. Every advisor endorsed this as the obvious first move. This was implemented and verified working on February 9, 2026.

### Action 2: Collapse the Monorepo into a Single Service

**Confidence Level:** High — STATUS: NOT YET DONE

The turborepo structure with three packages (`core-engine`, `types`, `lens-sdk`) is architectural overhead for a single service. Merge them into one flat Node.js project with a single `package.json`. The `types` become a `types.ts` file. The `lens-sdk` is unused at runtime and its validation logic can be a simple utility script if needed at all.

### Action 3: Eliminate the Multi-Provider Abstraction

**Confidence Level:** High — STATUS: NOT YET DONE

The "Universal Adapter" supporting six LLM providers is speculative generality. Only Morpheus is used. Hardcode the Morpheus client and remove the dead code for Groq, OpenAI, Ollama, Gemini, and Anthropic. Remove the `getProviderConfigs` function and all related environment variables. This alone would cut hundreds of lines from the 1,052-line `index.ts`.

### Action 4: Simplify the Fallback Chain

**Confidence Level:** Medium-High — STATUS: NOT YET DONE

The 8-model fallback pool is over-engineered. Replace it with a single fallback model or a simple retry mechanism. The model map can be simplified to a configuration file (`lens.json`) rather than being hardcoded in `index.ts`.

---

## 6. Decision Options

### Option 1: The Pragmatist's Refactor (Recommended — High Consensus)

Execute the four consensus actions and stop there. The core engine stays on Hetzner, the frontend stays on Manus, and the connection is direct SSE. This is the fastest, simplest path.

**Key Actions:**
1. Fix the Proxy — **DONE**
2. Collapse the Monorepo — merge `core-engine`, `types`, and `lens-sdk` into a single, flat Node.js project
3. Remove Abstractions — eliminate the multi-provider "Universal Adapter" and hardcode the Morpheus AI client
4. Keep Hetzner + Manus — the architecture remains decoupled

**Endorsed By:** Rich Hickey, Linus Torvalds, Jez Humble

**Risks:** Vendor lock-in to Morpheus; maintains the split-brain architecture between Manus and Hetzner

### Option 2: The Sovereign Stack (Medium Consensus)

Move the frontend off Manus and onto the Hetzner server, creating a single, fully self-contained application. This eliminates the entire class of cross-domain problems but increases the DevOps burden.

**Key Actions:**
1. Move the Frontend — re-platform the React frontend from the Manus environment to the Hetzner server
2. Eliminate the Proxy Problem — frontend and backend on the same host means no cross-domain issues
3. Simplify the Core Engine — still perform the refactoring from Option 1

**Endorsed By:** Martin Fowler, Jeff Dean

**Risks:** Increased DevOps overhead; loses Manus features (integrated DB, auth, CI/CD); more upfront work

### Option 3: The Process Purist (Low Consensus)

Harden the existing architecture with formal error handling, validation, and process discipline rather than simplification.

**Endorsed By:** Margaret Hamilton, Atul Gawande

**Risks:** Directly contradicts the user's request for simplicity; the codebase would grow, not shrink

---

## 7. Crux & Paradox Map

### Core Crux Disagreements

**Crux #1: Where does the root problem lie?**

- **The Pragmatists** say incidental complexity (the monorepo, the abstractions, the unused features)
- **The Structuralists** say architectural coupling to the Manus platform
- **The Formalists** say lack of formal process and error handling

Your choice of option is an implicit bet on which of these positions is correct.

**Crux #2: What is the primary role of the core engine?**

- **Engine as a Library:** A minimal, single-purpose component that does one thing perfectly
- **Engine as a Product:** A self-contained, deployable unit that includes its own frontend

This separates Option 1 (Library) from Option 2 (Product).

### Irreducible Tensions

| Tension | Pole A | Pole B | Board Preference |
|:--------|:-------|:-------|:-----------------|
| **Simplicity vs. Flexibility** | Strip abstractions, hardcode provider (Hickey, Torvalds) | Keep abstractions for future change (Fowler, Hamilton) | **Simplicity** |
| **Velocity vs. Rigor** | Fastest fix wins, iterate later (Beck, Cagan) | Build it right the first time (Hamilton, Gawande) | **Velocity** |
| **Sovereignty vs. Convenience** | Self-host everything (Fowler, Dean) | Leverage managed platforms (Humble, Hogan) | **Pragmatic middle** |

---

## 8. Minority Reports

### Minority Report 1: The Case for Formal Rigor — Margaret Hamilton

> "We are choosing to patch a leaky pipe with duct tape. Yes, it will stop the leak for today. But it does not fix the pipe. The interface between the web application and the deliberation engine is a critical system boundary. It should be treated with the same rigor as the Apollo guidance computer software. It needs a formal specification, a robust implementation that anticipates every failure mode — network drops, malformed data, downstream service timeouts — and a set of verification procedures to prove its correctness."

**If this dissent is correct, what would fail in the consensus?** The simple CORS-based fix will work initially but will prove brittle and unreliable in the long run. The system will be plagued by difficult-to-debug race conditions, intermittent connection failures, and unhandled errors from the Morpheus API that crash the frontend.

### Minority Report 2: The Case for Product-Led Discovery — Marty Cagan

> "We are deep in the weeds of monorepos, provider abstractions, and SSE proxying. Has anyone talked to a user? Have we run a single experiment to see if people find value in a 12-perspective analysis of a news article? The most important simplification is not in the code, but in the process. Before we refactor the engine, we should be using the existing, working engine to test the core value proposition with users."

**If this dissent is correct, what would fail in the consensus?** The team will spend weeks refactoring the codebase into a simple, elegant engine, only to find that users are not interested in the output it produces.

### Minority Report 3: The Case for People-Centric Systems — Lara Hogan

> "Option 2, the 'Sovereign Stack,' is presented as a technically clean solution. But what does that mean for the developer? It means they are now responsible for the React build pipeline, Nginx configuration, TLS certificate renewal, and frontend security. The simplicity we should be solving for is not just in the lines of code, but in the developer's brain."

**If this dissent is correct, what would fail in the consensus?** Pursuing the Sovereign Stack (Option 2) would lead to developer burnout and reduced product velocity. The perceived architectural simplicity would be paid for with the very real cost of human stress and distraction.

---

## 9. Appendix: Credentials & Access

### Hetzner Server (Core Engine)

| Field | Value |
|-------|-------|
| **IP** | `178.156.193.28` |
| **SSH User** | `root` |
| **SSH Password** | `Ow5d1Z5ITe5sMU` |
| **Docker Container** | `sovereign-ai-platform-core-engine-1` |
| **Service Port** | `8080` |
| **SSH Command** | `sshpass -p 'Ow5d1Z5ITe5sMU' ssh -o StrictHostKeyChecking=no root@178.156.193.28` |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check and system status |
| `/deliberate` | POST | Batch deliberation (returns all at once) |
| `/deliberate/stream` | POST | SSE streaming deliberation (recommended) |
| `/lenses` | GET | List available lenses |
| `/lenses/:id` | GET | Get lens details |
| `/models` | GET | List available models |

### Morpheus API

| Field | Value |
|-------|-------|
| **Base URL** | `https://api.mor.org/api/v1` |
| **Keys** | `MORPHEUS_API_KEY_1` through `MORPHEUS_API_KEY_6` (stored as Manus secrets) |
| **Wave 1 Model** | `llama-3.3-70b:web` (Strategist, Ethicist, Engineer, Artist, Historian, Skeptic) |
| **Wave 2 Model** | `qwen3-next-80b:web` (Mystic, Economist, Psychologist, Futurist, Guardian, Sovereign) |
| **Synthesis Model** | `venice-uncensored:web` |

### Frontend (Manus-Hosted)

| Field | Value |
|-------|-------|
| **Live URL** | `https://fisheye.news` |
| **Project Name** | `council-web` |
| **Stack** | React 19 + Tailwind 4 + Framer Motion + Express + tRPC + TiDB |

---

## 10. Appendix: Codebase Architecture

### Current Architecture

```
┌─────────────────────┐     Direct SSE      ┌──────────────────────────┐
│  Frontend (React)   │ ◄──────────────────► │  Hetzner Server          │
│  fisheye.news       │   (CORS enabled)     │  178.156.193.28:8080     │
│  - Home.tsx         │                      │  Docker: core-engine     │
│  - CouncilProgress  │                      │  /deliberate/stream      │
│  - PerspectiveCard  │                      └──────────┬───────────────┘
│  - SynthesisPanel   │                                 │ 6 parallel calls
└─────────────────────┘                                 │ per wave (2 waves)
                                                        ▼
┌─────────────────────┐                      ┌──────────────────────────┐
│  Manus Backend      │                      │  Morpheus AI Network     │
│  (Express + tRPC)   │                      │  https://api.mor.org/    │
│  - Auth (OAuth)     │                      │  api/v1                  │
│  - Counter (TiDB)   │                      │  6 API keys, 2 waves     │
│  - Health proxy     │                      └──────────────────────────┘
└─────────────────────┘
```

### Core Engine Source (Hetzner)

The entire engine is a single TypeScript file (`packages/core-engine/src/index.ts`, 1,052 lines) deployed in a Docker container via a monorepo with turborepo. The file contains:

- **Lines 1–35:** Header comments and environment variable documentation
- **Lines 36–130:** Provider configuration (6 providers, only Morpheus used)
- **Lines 131–200:** Client pool creation (6 OpenAI clients with 6 API keys)
- **Lines 201–300:** Model map and fallback chain (8 fallback models)
- **Lines 301–400:** Lens loading from JSON files
- **Lines 401–550:** `callLLM` function with timeout and fallback logic
- **Lines 551–700:** Batch `/deliberate` endpoint
- **Lines 701–900:** Streaming `/deliberate/stream` endpoint (SSE)
- **Lines 901–1052:** Info endpoints (`/health`, `/lenses`, `/models`, etc.)

### Frontend Source (Manus)

| File | Purpose |
|------|---------|
| `client/src/pages/Home.tsx` | Main page with deliberation handler and state management |
| `client/src/components/CouncilProgress.tsx` | Progress tracker with 12 perspective seats |
| `client/src/components/PerspectiveCard.tsx` | Individual perspective result display |
| `client/src/components/SynthesisPanel.tsx` | Final synthesis verdict display |
| `client/src/components/ArticleInput.tsx` | Article text/URL input form |
| `server/_core/index.ts` | Express server with proxy endpoints |
| `server/db.ts` | Database helpers (counter increment) |
| `shared/const.ts` | Shared constants (perspective colors, API URL) |

### SSE Event Format

The `/deliberate/stream` endpoint sends these SSE events:

```
event: status
data: {"type":"status","message":"Deliberation started","phase":"submitting"}

event: status
data: {"type":"status","message":"Wave 1: Processing The Strategist, ...","phase":"deliberating"}

event: perspective
data: {"type":"perspective","perspectiveId":"strategist","perspectiveName":"The Strategist",
       "content":"...","model":"llama-3.3-70b:web","responseTime":12.3,"wave":1,"status":"success"}

... (more perspectives as they complete) ...

event: synthesis
data: {"type":"synthesis","content":"...","model":"venice-uncensored:web"}

event: complete
data: {"type":"complete","totalPerspectives":12,"totalTime":95.2,
       "perspectives":[...],"synthesis":"..."}
```

### The 12 Perspectives

| Wave | Seat | Model |
|:----:|:-----|:------|
| 1 | The Strategist | `llama-3.3-70b:web` |
| 1 | The Ethicist | `llama-3.3-70b:web` |
| 1 | The Engineer | `llama-3.3-70b:web` |
| 1 | The Artist | `llama-3.3-70b:web` |
| 1 | The Historian | `llama-3.3-70b:web` |
| 1 | The Skeptic | `llama-3.3-70b:web` |
| 2 | The Mystic | `qwen3-next-80b:web` |
| 2 | The Economist | `qwen3-next-80b:web` |
| 2 | The Psychologist | `qwen3-next-80b:web` |
| 2 | The Futurist | `qwen3-next-80b:web` |
| 2 | The Guardian | `qwen3-next-80b:web` |
| 2 | The Sovereign | `qwen3-next-80b:web` |

---

## Deliberation Run Artifacts

All deliberation artifacts are stored immutably at `/home/ubuntu/runs/20260209_042020/`:

| Path | Contents |
|:-----|:---------|
| `input.md` | Raw user input and codebase analysis |
| `decision_brief.md` | Phase 0 — Canonical decision brief |
| `phase1_initial/*.md` | Phase 1 — 10 blind initial responses |
| `phase2_cross_exam/*.md` | Phase 2 — 10 cross-examination outputs |
| `phase3_revisions/*.md` | Phase 3 — 10 revision passes |
| `phase4_rankings/*.json` | Phase 4 — 10 multi-axis ranking sets |
| `phase4_rankings/aggregated.json` | Phase 4 — Aggregated scores and rankings |
| `phase5_synthesis/consensus_core.md` | Phase 5.1 — Consensus Core |
| `phase5_synthesis/decision_options.md` | Phase 5.2 — Decision Options (3 forks) |
| `phase5_synthesis/paradox_map.md` | Phase 5.3 — Crux & Paradox Map |
| `phase5_synthesis/minority_reports.md` | Phase 5.4 — Minority Reports (3 dissents) |
