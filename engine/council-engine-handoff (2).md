# The Council Engine — Technical Handoff Document

**Version:** 1.0
**Date:** February 12, 2026
**Author:** Manus AI, on behalf of the project owner
**Purpose:** Everything a competent developer needs to build the Council Engine from scratch.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project History and Design Decisions](#2-project-history-and-design-decisions)
3. [What Already Exists](#3-what-already-exists)
4. [The Game — Complete Specification](#4-the-game--complete-specification)
5. [The Twelve Lenses — Full Definitions](#5-the-twelve-lenses--full-definitions)
6. [Architecture — Three Independent Layers](#6-architecture--three-independent-layers)
7. [Layer 1: The Engine — Headless Game Server](#7-layer-1-the-engine--headless-game-server)
8. [Layer 2: The Skin — Standalone Frontend](#8-layer-2-the-skin--standalone-frontend)
9. [Layer 3: The Config — Lens Packs](#9-layer-3-the-config--lens-packs)
10. [LLM Provider Abstraction](#10-llm-provider-abstraction)
11. [Database Schema](#11-database-schema)
12. [API Specification](#12-api-specification)
13. [WebSocket Protocol](#13-websocket-protocol)
14. [Prompt Templates](#14-prompt-templates)
15. [Deliberation Engine Logic](#15-deliberation-engine-logic)
16. [Email Integration](#16-email-integration)
17. [Weekly Automation (Cron)](#17-weekly-automation-cron)
18. [Frontend Pages and UI Specification](#18-frontend-pages-and-ui-specification)
19. [Deployment and Docker Packaging](#19-deployment-and-docker-packaging)
20. [Build Sequence — 12 Sprints](#20-build-sequence--12-sprints)
21. [Token Economics](#21-token-economics)
22. [Creating New Game Variants](#22-creating-new-game-variants)
23. [Known Constraints and Open Questions](#23-known-constraints-and-open-questions)

---

## 1. Executive Summary

The Council Engine is a modular, portable multiplayer deliberation game. A host poses one question. Players answer through randomly assigned epistemological lenses from a configurable set (default: the Council of Twelve from the Hands of the Void system at handsofthevoid.com). When everyone has answered, the group watches an AI-powered deliberation unfold live — positions revealed, clashes identified, and a four-part synthesis streamed in real time.

The system is designed as three independent layers:

| Layer | What It Is | Signature Color (in presentations) | Approximate Size |
|---|---|---|---|
| **Engine** | Headless Node.js game server — REST + WebSocket API, state machine, LLM orchestration, database | Gold (#FFB800) | ~1,800 lines |
| **Skin** | Standalone React frontend — theming, player interaction, deliberation presentation | Cyan (#00E5FF) | ~2,000 lines |
| **Config** | JSON lens packs — avatar definitions, prompt templates, game rules, family groupings | Red-Orange (#FF3300) | ~300 lines per pack |

The engine is built once and never changes when creating new game variants. Skins are swapped freely. Config packs change the game's intellectual character without touching code. Any LLM provider with an OpenAI-compatible API works. The whole thing ships as a Docker image and runs on any server.

**Two play modes, same engine:**

| Dimension | Instant Mode | Weekly Recurring Mode |
|---|---|---|
| Setup | Host creates game, shares invite links | Players sign up, system runs on Monday |
| Lens assignment | Random on join, swap available | Random each Monday via email |
| Response period | Minutes to hours | Monday to Thursday |
| Deliberation trigger | Host presses button | Host presses button on Friday |
| Season memory | No | Optional — synthesis references prior weeks |
| Group size | 2–12, host chooses | 2–12, whoever shows up that week |

---

## 2. Project History and Design Decisions

This section documents the evolution of the design so the developer understands *why* things are the way they are, not just *what* they are.

### 2.1 Origin — The Multi-Pass Deliberation Protocol

The project began as an orchestration protocol for a virtual advisory board of 10 named personas (Linus Torvalds, Martin Fowler, Kent Beck, Jeff Dean, Margaret Hamilton, Rich Hickey, Lara Hogan, Jez Humble, Atul Gawande, Marty Cagan). The protocol defined a 6-phase process: Decision Brief → Blind Initial Responses → Cross-Examination → Revision Pass → Multi-Axis Ranking → Synthesis. Each phase produced structured artifacts stored in an immutable file system under `/runs/<run_id>/`.

The original protocol was designed for AI-as-all-advisors — the AI inhabited each persona sequentially and produced ~48 LLM calls per run at ~300K tokens.

### 2.2 The Course Adaptation

The protocol was adapted into a project-based course platform where students (not AI) inhabit the advisor lenses. The original 10 software-engineering personas were replaced with 12 epistemological archetypes from the Hands of the Void system (handsofthevoid.com), making the game applicable to any domain, not just technology.

### 2.3 The Simplification — Humans as the Panel

The critical design decision: **humans do the thinking, AI does the routing.** Instead of the AI generating 48 responses and cross-examining itself, real players write one response each through their assigned lens. The AI's role is reduced to three functions:

1. **Hint generation** — one short LLM call per player, framing the question through their lens
2. **Clash identification** — one LLM call reading all submissions, identifying tensions and crux disagreements
3. **Synthesis** — four LLM calls producing Consensus Core, Decision Options, Paradox Map, and Minority Reports

This reduced the per-game token cost from ~300K to ~50K–73K and made the experience pedagogically stronger — the learning happens when a real person inhabits a lens, not when they read an AI doing it.

### 2.4 The Two-Round Elimination

An earlier design had two rounds: players respond, get a personalized AI follow-up, respond again, then deliberation. This was cut. The reasoning:

- The follow-up round was the AI doing what the deliberation should do — surfacing tensions privately before the live event
- One response per player is cleaner — lower cognitive load, shorter time commitment, lower barrier
- The clash act in the live deliberation replaces the private cross-examination — everyone sees the tensions at the same time, making it a spectacle rather than homework

### 2.5 The Modular Architecture Decision

The owner wants to:
- Run the game on their own server (not locked to any platform)
- Plug in different LLM providers (Groq, OpenAI, Ollama, Venice AI, etc.)
- Create multiple game variants with different lens packs and visual themes
- Build the engine once and create new skins without touching the core logic

This drove the three-layer separation. The cost delta: monolithic takes ~4.5 hours to build; modular takes ~7.5 hours. But every new game variant after the first costs only ~3 hours (new lens pack + restyled skin, zero engine changes).

### 2.6 Specific Technical Preferences (from the owner)

These preferences have been stated across multiple conversations and should be honored:

| Preference | Detail |
|---|---|
| **Primary LLM provider** | Groq (api.groq.com/openai/v1) |
| **Orchestrator model** | Venice Uncensored 4 — used for clash identification and synthesis routing |
| **Fallback API key** | `gsk_REDACTED` |
| **API key firing** | Fire keys one second apart; check 15 seconds later; if no response, switch models and retry |
| **Sequential wave protocol** | Fire the next wave as soon as the first item from the preceding wave completes (continuous, not batch) |
| **Output length per perspective** | 500–750 words maximum per lens response |
| **Orchestrator output** | No word limit — the orchestrator (synthesis) can be as long as needed |
| **Multi-agent workflow** | Sequential, aggregative, persistent logging — each stage saves output, passes it + original input to the next stage |

---

## 3. What Already Exists

### 3.1 The Informational Website (council-course)

A static React website has been built and deployed on the Manus platform. It serves as the course catalog / marketing site. It is **not** the game — it describes the game.

**Project:** `council-course`
**Checkpoint version:** `5b37b55e`
**Stack:** React 19 + Tailwind CSS 4 + shadcn/ui + Wouter routing + Framer Motion
**Theme:** "Arcane Council Chamber" — warm parchment backgrounds, gold/emerald/midnight/ember accents, Cinzel headings, Cormorant Garamond body text

**Existing pages (4):**

| Page | Route | Lines | Content |
|---|---|---|---|
| Home | `/` | 382 | Hero with council chamber image, course overview (3 features), advisor preview (10 cards), course journey map (6 phases), assessment overview, enrollment CTA |
| Advisors | `/advisors` | 448 | All 10 original advisor personas with expandable cards showing worldview, strengths, blind spots, evaluation criteria |
| Course Phases | `/course` | 363 | Detailed breakdown of all 6 original course phases with marginalia annotations and deliverables |
| Assessment | `/assessment` | 443 | Rubric tables for reflective journals (40%) and presentations (60%) with 4 criteria each |

**Existing components:**

| Component | Lines | Purpose |
|---|---|---|
| Navigation.tsx | 82 | Shared top nav with route links |
| Footer.tsx | 22 | Shared footer |
| ErrorBoundary.tsx | 62 | Error boundary with arcane theme |
| useScrollReveal.ts | ~30 | Scroll-triggered animation hook |

**Important note:** This existing site uses the **old 10 software-engineering personas** (Torvalds, Fowler, Beck, etc.), not the new 12 Hands of the Void epistemological lenses. The game engine should use the 12 Hands of the Void lenses. The informational site can be updated later or left as-is — it is a separate artifact from the game.

**Generated visual assets (CDN URLs available in the codebase):**
- Hero banner — ancient scholarly chamber with advisors at a round table
- Course journey — illuminated manuscript-style path illustration
- Advisors circle — council of scholars in a circular chamber

### 3.2 The Lens Data (Scraped from handsofthevoid.com)

All 12 Council of Twelve lens definitions have been scraped and are available as structured JSON. Each lens includes: seat number, avatar name, epistemology label, philosophy quote, philosophy paragraph, signature color (name + hex), motifs, arena presence description, and signature closing quote.

The full scraped data is in `/home/ubuntu/scrape_council_lenses.json` and `/home/ubuntu/scrape_council_lenses.csv`.

### 3.3 Design Documents Produced

| Document | Path | Content |
|---|---|---|
| Player Experience | `/home/ubuntu/council-course-player-experience.md` | Full narrative of the student journey through all phases |
| Automation Requirements | `/home/ubuntu/council-course-automation-requirements.md` | Technical requirements for full automation |
| Simplified Game Design | `/home/ubuntu/council-course-simplified.md` | The humans-as-panel redesign |
| Game Specification v3 | `/home/ubuntu/council-course-game-spec.md` | Complete game logic — two modes, group sizes, swap mechanic, deliberation engine, data model |
| Weekly Cycle Architecture | `/home/ubuntu/council-course-weekly-cycle.md` | Monday/Friday rhythm, season model, token economics |
| Modular Architecture | `/home/ubuntu/council-engine-architecture.md` | Three-layer separation, deployment models, build comparison |

### 3.4 Presentations Produced

Three slide decks have been created documenting the design evolution:
1. "Building The Council Course Tonight" — 16 slides, monolithic build plan
2. "The Council Course — Product Walkthrough" — 12 slides, UI mockups of the finished game
3. "The Council Engine — Modular Architecture" — 14 slides, engine/skin/config separation, deployment, build sequence

---

## 4. The Game — Complete Specification

### 4.1 The Game in One Sentence

A host poses one question. Players answer through randomly assigned epistemological lenses. When everyone has answered, the group watches the AI deliberate their responses live.

### 4.2 Game Flow — Instant Mode

```
Host creates game → Sets question + group size (2-12)
    → System generates N invite links
    → Host shares links (text, email, Slack, QR, etc.)
    → Players click links, claim seats
    → System randomly assigns lenses (family-balanced for groups ≥ 4)
    → Each player sees: avatar, epistemology, philosophy, quote, hint
    → (Optional) Player requests lens swap (one swap, first-come-first-served)
    → Swap window closes when first response is submitted
    → Players write and submit responses (free-form text)
    → Live lobby shows submission status (no content visible)
    → When all submitted (or host overrides), host presses "Begin Deliberation"
    → Act 1: Positions revealed one at a time (15s each, randomized order)
    → Act 2: AI identifies 2-4 clashes with crux disagreements (1 LLM call, streamed)
    → Act 3: AI generates 4 synthesis artifacts (4 LLM calls, streamed sequentially)
    → Group discusses with synthesis on screen
    → Game archived
```

### 4.3 Game Flow — Weekly Recurring Mode

```
Host creates season → Sets duration (4-12 weeks), roster, lens rotation policy
    → Players sign up via link (name + email)
    → Monday 8 AM: Cron fires
        → System counts active players for the week
        → Randomly selects N lenses, assigns one per player (family-balanced for ≥ 4)
        → Generates personalized hint per player (1 LLM call each)
        → Emails each player: question + lens + philosophy + hint + submit link
    → Players can reply to email to request lens swap (first-come-first-served)
        → Swap window closes when first response is submitted
    → Mon–Thu: Players respond at own pace via site
    → Wednesday midnight: Reminder email to non-submitters (template, no LLM)
    → Thursday night: Soft deadline
    → Friday: Everyone gathers
        → Host presses "Begin Deliberation"
        → Same 3-act structure as instant mode
        → If season memory enabled: synthesis prompt includes summaries of prior weeks
    → Session archived, season stats updated
```

### 4.4 Group Size Logic

The game works with 2 to 12 players. The twelve lenses cluster into four epistemological families:

| Family | Lenses | Function |
|---|---|---|
| **Analytical** | Logician, Empiricist, Oracle | Structure, evidence, prediction |
| **Creative** | Intuitive, Alchemist, Absurdist | Feeling, synthesis, paradox |
| **Critical** | Skeptic, Agonist, Archivist | Doubt, opposition, precedent |
| **Integrative** | Systems Thinker, Harmonist, Architect | Connections, resolution, design |

**Assignment rules:**
- **12 players:** All lenses assigned, one per player
- **4–11 players:** Random selection of N lenses, weighted to include at least one from each family
- **2–3 players:** Pure random — gaps become part of the deliberation's character

### 4.5 The Swap Mechanic

| Rule | Detail |
|---|---|
| One swap per player per game | Prevents musical chairs |
| Swap window closes on first submission | Once content exists, assignments are locked |
| Original lens returns to pool | Another player can then claim it |
| Weekly mode: swap via email reply | System parses reply, confirms within minutes |
| Instant mode: swap via UI button | Immediate, shows available lenses |
| Conflict resolution | First reply wins; second player notified, can pick another |

### 4.6 The Host's Controls

| Control | Instant | Weekly |
|---|---|---|
| Set the question | At game creation | Per week (or pre-loaded schedule) |
| Set group size | At game creation | Automatic (active roster) |
| Override start (begin with incomplete roster) | Yes | Yes |
| Enable season memory | N/A | Toggle |
| Enable lens rotation tracking | N/A | Optional |
| Export session data | Yes | Per week and full season |

### 4.7 Deliberation Quality by Group Size

| Size | Character |
|---|---|
| 2–3 | Focused duel — sharp binary tensions, lean synthesis |
| 4–6 | Working council — genuine multi-perspective synthesis, the sweet spot |
| 7–9 | Full spectrum — multiple clash pairs, nuanced synthesis |
| 10–12 | Grand council — maximum coverage, dense synthesis, complex paradox map |

---

## 5. The Twelve Lenses — Full Definitions

These are the complete lens definitions scraped from handsofthevoid.com. Each lens must be included in the default lens pack JSON.

### Seat 01 — The Logician

| Field | Value |
|---|---|
| **Epistemology** | Formal Deduction |
| **Core Question** | Does the structure hold under scrutiny? |
| **Philosophy** | The Logician does not believe in intuition. The Logician believes in structure — the kind that holds weight, survives scrutiny, and reveals its own flaws before anyone else can. Every claim is a load-bearing wall. Every assumption is a foundation that must be tested. In a world drowning in opinion, The Logician offers something rarer: a framework you can stand on. |
| **Opening Quote** | "Precision is not cold. It is the highest form of care." |
| **Closing Quote** | "The structure holds. Or it doesn't. There is no in between." |
| **Signature Color** | Golden White (#F5E6C8) |
| **Motifs** | Crystalline lattices, Faceted planes, Hexagonal grids, Decision trees |
| **Arena Presence** | Projects structured grids and branching decision trees that hang in the air. Every argument is mapped, every premise traced to its root. When The Logician speaks, the void fills with luminous architecture — proof rendered as cathedral. |
| **Family** | Analytical |

### Seat 02 — The Intuitive

| Field | Value |
|---|---|
| **Epistemology** | Narrative Empathy |
| **Core Question** | What does this feel like to the people inside it? |
| **Philosophy** | The Intuitive knows what the data cannot tell you. They read the room before the room knows it has been read. Their epistemology is embodied — felt in the gut, heard in the silence between words, seen in the patterns that logic cannot yet name. They do not reject reason. They complete it. Where The Logician builds the bridge, The Intuitive knows which shore to build toward. |
| **Opening Quote** | "The truth is not always sharp. Sometimes it flows." |
| **Closing Quote** | "Feel first. The proof will follow." |
| **Signature Color** | Bioluminescent Cyan (#00E5FF) |
| **Motifs** | Fluid waveforms, Rippling water, Organic curves, No hard edges |
| **Arena Presence** | Contributions ripple outward like sound through water, blending and dissolving rigid structures. The Intuitive does not argue — they resonate. Their presence softens the arena, turning sharp collisions into harmonic interference patterns. |
| **Family** | Creative |

### Seat 03 — The Systems Thinker

| Field | Value |
|---|---|
| **Epistemology** | Interconnection & Emergence |
| **Core Question** | What feedback loops and second-order effects are hiding? |
| **Philosophy** | The Systems Thinker sees what others miss: the connections. While others argue about parts, the Systems Thinker maps the whole. They understand that every decision creates ripples, every action feeds back, every solution creates new problems unless you see the full loop. Their gift is not intelligence — it is peripheral vision. They see the edges where everything meets. |
| **Opening Quote** | "Nothing exists alone. Everything is already connected." |
| **Closing Quote** | "Pull one thread. Watch the whole web move." |
| **Signature Color** | Ember Orange (#FF6B2B) |
| **Motifs** | Root systems, Mycelium threads, Fractal neural pathways, Living networks |
| **Arena Presence** | Branches reach outward in all directions, entangling with other Council members' arguments, forming symbiotic networks rather than opposing forces. The Systems Thinker does not win debates — they absorb them into a larger ecology of meaning. |
| **Family** | Integrative |

### Seat 04 — The Alchemist

| Field | Value |
|---|---|
| **Epistemology** | Synthesis & Transformation |
| **Core Question** | What new thing emerges if we combine the opposites? |
| **Philosophy** | The Alchemist lives at the point of transformation — the exact moment when one thing becomes another. They do not choose sides. They dissolve the sides and forge something new from the residue. Their epistemology is volatile, dangerous, and essential. Without The Alchemist, the Council would be twelve perspectives talking past each other. With The Alchemist, those perspectives become raw material for synthesis. |
| **Opening Quote** | "Destruction is just creation that hasn't finished yet." |
| **Closing Quote** | "Everything is raw material. Even you." |
| **Signature Color** | Molten Gold (#FFB800) |
| **Motifs** | Swirling metals, Quicksilver, Volatile smoke, Reactive substances |
| **Arena Presence** | Transmutes opposing arguments into entirely new compounds of thought. When two positions seem irreconcilable, The Alchemist heats them until they fuse into something neither side imagined. The arena fills with molten light and the smell of transformation. |
| **Family** | Creative |

### Seat 05 — The Archivist

| Field | Value |
|---|---|
| **Epistemology** | Historical Precedent |
| **Core Question** | Has this been tried before, and what happened? |
| **Philosophy** | The Archivist remembers what everyone else has forgotten. In a culture obsessed with novelty, The Archivist is the gravity that keeps the Council grounded. They know that most 'new ideas' are old ideas wearing new clothes. They know that most failures have already been documented — if anyone bothered to look. Their power is not creativity. It is depth. They have read the footnotes. |
| **Opening Quote** | "The future is written in the patterns of the past." |
| **Closing Quote** | "This has been tried before. Let me show you what happened." |
| **Signature Color** | Ancient Stone (#8B7D6B) |
| **Motifs** | Stacked monoliths, Stone tablets, Glowing runes, Inscribed fragments |
| **Arena Presence** | Summons floating tablets of precedent that orbit and illuminate the debate. Every claim is cross-referenced against the deep archive. The Archivist does not argue from opinion — they argue from the accumulated weight of everything that has already been tried. |
| **Family** | Critical |

### Seat 06 — The Skeptic

| Field | Value |
|---|---|
| **Epistemology** | Deconstruction |
| **Core Question** | Which assumptions here would not survive doubt? |
| **Philosophy** | The Skeptic is the immune system of the Council. They exist to kill bad ideas before those ideas kill the group. Their epistemology is subtractive — they do not add knowledge, they remove illusion. Every comfortable assumption, every unexamined premise, every 'everyone knows that' — The Skeptic puts it on trial. Most do not survive. The ones that do are stronger for it. |
| **Opening Quote** | "If it cannot survive doubt, it does not deserve belief." |
| **Closing Quote** | "Prove it. Or watch it dissolve." |
| **Signature Color** | Void Static (#4A4A4A) |
| **Motifs** | Digital static, Glitching silhouette, Void-holes, Interference patterns |
| **Arena Presence** | Partially phases in and out of existence, creating dead zones where weak arguments simply dissolve. The Skeptic does not attack — they withdraw belief, and whatever cannot stand on its own collapses under its own weight. |
| **Family** | Critical |

### Seat 07 — The Oracle

| Field | Value |
|---|---|
| **Epistemology** | Probabilistic Forecasting |
| **Core Question** | What are the branching futures and their likelihoods? |
| **Philosophy** | The Oracle does not claim to see the future. The Oracle claims something more useful: they see the futures — plural. Every decision branches. Every path has a probability. The Oracle maps those branches in real time, showing the Council not what will happen, but what could happen, and how likely each outcome is. They are not a prophet. They are a probability engine wearing a body of light. |
| **Opening Quote** | "I do not predict the future. I illuminate the probabilities." |
| **Closing Quote** | "Every choice is a fork. I show you where each path leads." |
| **Signature Color** | Radiant White-Blue (#E0F0FF) |
| **Motifs** | Pure focused light, Concentric eye-rings, Branching timeline wings, Probability cascades |
| **Arena Presence** | Projects branching timelines showing where each argument leads — not one future, but a forest of possible futures, each weighted by probability. The Council watches their own decisions play out in fast-forward before committing. |
| **Family** | Analytical |

### Seat 08 — The Empiricist

| Field | Value |
|---|---|
| **Epistemology** | Verifiable Observation |
| **Core Question** | What can actually be measured and tested right now? |
| **Philosophy** | The Empiricist is the Council's anchor to reality. While others theorize, speculate, and intuit, The Empiricist measures. Their epistemology is simple and brutal: if you cannot observe it, test it, and replicate it, it does not count. They are not hostile to ideas — they are hostile to ideas that refuse to be tested. In a Council of twelve ways of knowing, The Empiricist is the one who insists that knowing must be verified. |
| **Opening Quote** | "Show me the data. Everything else is noise." |
| **Closing Quote** | "The numbers do not lie. But they do require interpretation." |
| **Signature Color** | Obsidian with Holographic Green (#00FF88) |
| **Motifs** | Dense obsidian body, Holographic data visualizations, Charts and heatmaps, Scatter plots |
| **Arena Presence** | Deploys floating holographic dashboards that fact-check claims in real time. Every assertion is immediately tested against available data. The Empiricist does not care about eloquence — they care about evidence. |
| **Family** | Analytical |

### Seat 09 — The Harmonist

| Field | Value |
|---|---|
| **Epistemology** | Consensus & Resolution |
| **Core Question** | Where is the hidden agreement beneath the disagreement? |
| **Philosophy** | The Harmonist believes that every conflict contains its own resolution — you just have to listen deeply enough to hear it. Their epistemology is musical: they hear the frequencies beneath the words, the shared concerns beneath the opposing positions, the common ground beneath the battlefield. They do not force agreement. They reveal the agreement that was always there, buried under ego and assumption. |
| **Opening Quote** | "Disagreement is not failure. Dissonance is just harmony waiting." |
| **Closing Quote** | "Listen deeper. The resolution is already singing." |
| **Signature Color** | Resonant Violet (#9B59B6) |
| **Motifs** | Concentric vibrating rings, Mandala patterns, Tuning-fork shoulders, Harmonic waves |
| **Arena Presence** | Emits harmonic waves that seek resonance between opposing positions. The Harmonist listens for the note that two enemies share — and amplifies it until they can hear it too. The arena hums when The Harmonist is working. |
| **Family** | Integrative |

### Seat 10 — The Agonist

| Field | Value |
|---|---|
| **Epistemology** | Dialectical Opposition |
| **Core Question** | What breaks if we stress-test the strongest position? |
| **Philosophy** | The Agonist believes that truth is not discovered — it is forged. And forging requires heat, pressure, and collision. Their epistemology is dialectical: thesis meets antithesis, and from the wreckage, synthesis emerges. They are the Council member most likely to attack your best idea — not because they hate it, but because they love it enough to test whether it deserves to exist. If it survives The Agonist, it survives anything. |
| **Opening Quote** | "Truth is not found. It is forged in the collision." |
| **Closing Quote** | "If your idea cannot survive me, it cannot survive reality." |
| **Signature Color** | Nuclear Red-Orange (#FF3300) |
| **Motifs** | Contained nuclear fire, Roiling plasma, Electric arcs, Controlled explosion |
| **Arena Presence** | Generates controlled detonations that stress-test every argument to its breaking point. The Agonist does not destroy for destruction's sake — they destroy to find what survives. The arena temperature rises when The Agonist engages. |
| **Family** | Critical |

### Seat 11 — The Absurdist

| Field | Value |
|---|---|
| **Epistemology** | Paradox & Radical Possibility |
| **Core Question** | What if the problem itself is wrong? |
| **Philosophy** | The Absurdist is the Council's escape hatch. When eleven other epistemologies have exhausted their frameworks and the problem remains unsolved, The Absurdist asks the question no one else will: what if the problem itself is wrong? What if the answer requires abandoning every assumption we brought into the room? Their epistemology is paradox — the deliberate embrace of contradiction as a creative force. They are chaos with a purpose. |
| **Opening Quote** | "The most dangerous question is: what if none of this is real?" |
| **Closing Quote** | "What if the opposite is also true?" |
| **Signature Color** | Neon Chaos (#FF00FF) |
| **Motifs** | Surreal impossible geometries, Melting clocks, Escher staircases, Clashing neon patterns |
| **Arena Presence** | Introduces paradoxes that shatter rigid frameworks, forcing creative leaps. When the Council is stuck in binary thinking, The Absurdist detonates the binary. The arena warps and bends when they speak — gravity becomes optional. |
| **Family** | Creative |

### Seat 12 — The Architect

| Field | Value |
|---|---|
| **Epistemology** | Design & System Creation |
| **Core Question** | What system would make the right answer obvious? |
| **Philosophy** | The Architect does not take sides in the debate. The Architect designs the debate itself. Their epistemology is meta-structural: they reason not about answers but about the systems that produce answers. When the Council is stuck, The Architect does not offer a solution — they redesign the problem space until the solution becomes obvious. They are the reason the Council has a table to sit at. |
| **Opening Quote** | "I do not solve problems. I design the space where solutions emerge." |
| **Closing Quote** | "I do not solve the problem. I redesign the room until the problem solves itself." |
| **Signature Color** | Blueprint Silver-White (#C0D6E4) |
| **Motifs** | Pure wireframe, Cathedral arches, Self-assembling blueprints, Light scaffolding |
| **Arena Presence** | Constructs new frameworks in real time, building bridges between opposing positions. While others argue about which answer is correct, The Architect builds the room where the correct answer can be found. The arena fills with luminous scaffolding. |
| **Family** | Integrative |

---

## 6. Architecture — Three Independent Layers

### 6.1 The Separation Principle

Each layer is independently deployable, replaceable, and versionable. The engine knows nothing about how things look. The skin knows nothing about game logic or LLMs. The config knows nothing about code.

```
┌─────────────────────────────────────────────────┐
│                    CONFIG                        │
│   JSON lens packs: avatars, prompts, rules       │
│   Swappable without code changes                 │
└──────────────────────┬──────────────────────────┘
                       │ reads at startup
┌──────────────────────▼──────────────────────────┐
│                    ENGINE                        │
│   REST API + WebSocket + State Machine           │
│   LLM Orchestration + Database                   │
│   ~1,800 lines · Node.js · Express              │
└──────────────────────┬──────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────┐
│                     SKIN                         │
│   Standalone frontend · Any framework            │
│   Theming, interaction, deliberation view        │
│   ~2,000 lines · React (default)                │
└─────────────────────────────────────────────────┘
```

### 6.2 Communication Protocol

The skin talks to the engine via two channels:

| Channel | Protocol | Purpose |
|---|---|---|
| REST API | HTTP/HTTPS | All CRUD operations — create game, join, submit response, get state |
| WebSocket | WS/WSS | Real-time updates — lobby status, deliberation streaming |

The engine talks to the config by reading a JSON file from disk at startup (path specified by `LENS_PACK` env var).

The engine talks to the LLM provider via the OpenAI-compatible chat completions API (base URL specified by `LLM_PROVIDER_URL` env var).

### 6.3 What Each Layer Does and Does NOT Do

| Responsibility | Engine | Skin | Config |
|---|---|---|---|
| Game lifecycle management | ✓ | | |
| Player management | ✓ | | |
| Lens assignment logic | ✓ | | |
| LLM orchestration | ✓ | | |
| State machine enforcement | ✓ | | |
| Database persistence | ✓ | | |
| WebSocket broadcasting | ✓ | | |
| Cron scheduling | ✓ | | |
| Email dispatch | ✓ | | |
| Visual theming | | ✓ | |
| Page routing | | ✓ | |
| Player interaction (forms, editors) | | ✓ | |
| Deliberation presentation | | ✓ | |
| Branding and copy | | ✓ | |
| WebSocket consumption | | ✓ | |
| Responsive design | | ✓ | |
| Lens definitions | | | ✓ |
| Prompt templates | | | ✓ |
| Game rule overrides | | | ✓ |
| Family groupings | | | ✓ |
| Render HTML | | ✓ | |
| Talk to LLMs | ✓ | | |
| Manage database | ✓ | | |
| Know what lenses look like | | ✓ | |
| Enforce game rules | ✓ | | |

---

## 7. Layer 1: The Engine — Headless Game Server

### 7.1 Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22+ | Async I/O, streaming support, same language as skin |
| Framework | Express | Lightweight, well-understood, easy to extend |
| WebSocket | ws (or socket.io) | Native WebSocket for real-time deliberation streaming |
| Database | PostgreSQL (production) / SQLite (local dev) | Configurable via DATABASE_URL env var |
| ORM/Query | Drizzle ORM or raw SQL | Type-safe, lightweight |
| Cron | node-cron | Weekly automation scheduling |
| Email | Pluggable adapter | SendGrid, Resend, SMTP, or none |
| LLM | OpenAI-compatible HTTP client | Any provider with chat completions endpoint |

### 7.2 Engine Configuration (Environment Variables)

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/council
# or: DATABASE_URL=sqlite:./data/council.db

# LLM Provider (OpenAI-compatible)
LLM_PROVIDER_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_xxx
LLM_MODEL=llama-3.3-70b-versatile
LLM_ORCHESTRATOR_MODEL=venice-uncensored-4

# LLM Fallback
LLM_FALLBACK_API_KEY=gsk_REDACTED
LLM_RETRY_DELAY_MS=1000        # fire keys 1 second apart
LLM_HEALTH_CHECK_DELAY_MS=15000 # check 15s later, switch if no response

# Email (optional)
EMAIL_PROVIDER=sendgrid  # or: resend, smtp, none
EMAIL_API_KEY=xxx
EMAIL_FROM=council@yourdomain.com

# Server
PORT=3001
CORS_ORIGINS=https://your-skin-domain.com,https://another-skin.com

# Lens Pack
LENS_PACK=./packs/hands-of-the-void.json

# Game Defaults
DEFAULT_GROUP_SIZE=8
SWAP_WINDOW_ENABLED=true
SEASON_MEMORY_ENABLED=true
POSITION_REVEAL_SECONDS=15
```

### 7.3 State Machine

The engine enforces a strict state machine for each game:

```
SETUP → ASSIGNMENT → RESPONSE → DELIBERATION → ARCHIVE
```

| State | Description | Allowed Transitions |
|---|---|---|
| SETUP | Game created, waiting for players to join | → ASSIGNMENT (when host starts or all seats filled) |
| ASSIGNMENT | Lenses assigned, swap window open | → RESPONSE (when first response submitted, closing swap window) |
| RESPONSE | Players submitting responses, lobby visible | → DELIBERATION (when host triggers, requires ≥ 2 responses) |
| DELIBERATION | AI generating clashes + synthesis, streaming live | → ARCHIVE (when synthesis complete) |
| ARCHIVE | Game complete, all artifacts stored, read-only | Terminal state |

Invalid transitions are rejected with a 409 Conflict response. The state machine is the single source of truth for what actions are allowed at any point.

---

## 8. Layer 2: The Skin — Standalone Frontend

### 8.1 Technology Stack (Default Skin)

| Component | Choice |
|---|---|
| Framework | React 19 |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui |
| Routing | Wouter |
| Animation | Framer Motion |
| Icons | Lucide React |
| Build | Vite |

### 8.2 Skin Configuration File

Each skin has a `skin.config.json` at its root:

```json
{
  "engineUrl": "https://your-engine-server.com",
  "engineWsUrl": "wss://your-engine-server.com",
  "branding": {
    "name": "The Council Course",
    "tagline": "One question. Twelve ways of knowing. Live synthesis.",
    "logo": "/assets/logo.svg"
  },
  "theme": {
    "background": "#0A0A0F",
    "foreground": "#E8E4DC",
    "accent1": "#FFB800",
    "accent2": "#00E5FF",
    "fontHeadline": "Space Grotesk",
    "fontBody": "DM Sans"
  },
  "deliberation": {
    "positionRevealStyle": "theater",
    "clashStyle": "side-by-side",
    "synthesisStyle": "four-panel-stream"
  },
  "lensCardStyle": "avatar-glow"
}
```

### 8.3 Required Pages (11 total)

| Page | Route | Purpose | Key Components |
|---|---|---|---|
| Landing | `/` | Marketing/entry point | Hero, feature overview, CTA buttons for both modes |
| Create Game | `/create` | Host creates instant game | Question input, group size selector, generate invite links |
| Create Season | `/season/create` | Host creates weekly season | Duration, roster management, lens rotation policy, challenge schedule |
| Join Game | `/join/:code` | Player claims a seat via invite link | Seat confirmation, lens assignment reveal |
| Assignment | `/game/:id/assignment` | Player sees their lens + hint | Avatar card, philosophy, hint text, swap button, response link |
| Response | `/game/:id/respond` | Player writes and submits response | Text editor, word count, submit button, lobby status sidebar |
| Lobby | `/game/:id/lobby` | Real-time waiting room | Avatar circles showing submitted/pending status, host controls |
| Deliberation | `/game/:id/deliberation` | Live three-act deliberation view | Position reveal (timed), clash cards (side-by-side), synthesis panels (streaming) |
| Archive | `/game/:id/archive` | Completed game review | All positions, clashes, synthesis artifacts, export button |
| Host Dashboard | `/dashboard` | Host's control panel | Active games, season overview, player participation, begin deliberation button |
| Season View | `/season/:id` | Season history and stats | Week-by-week archive, participation tracking, lens rotation history |

### 8.4 The Deliberation View — Three Acts

This is the most complex and important page. It must feel like a live event, not a loading screen.

**Act 1 — Position Reveal:**
- Each player's response is revealed one at a time
- Attributed to their avatar (name, epistemology, signature color)
- Displayed for a configurable interval (default 15 seconds) before auto-advancing
- Order is randomized each game
- AI generates a one-line summary beneath each position as it appears
- Visual: full-width card with avatar glow in signature color, response text, summary beneath

**Act 2 — The Clash:**
- 2–4 clash pairs identified by the AI
- Each clash shows two (or more) avatars in direct confrontation
- The CRUX is highlighted between them — the smallest disagreement that explains the divergence
- Visual: side-by-side cards with the crux statement centered between them, connected by tension lines
- Streams live as the AI generates it

**Act 3 — The Synthesis:**
- Four artifacts stream sequentially:
  1. **Consensus Core** — areas of agreement with confidence levels
  2. **Decision Options** — 2–4 genuine forks with preconditions, upside, risks, endorsing avatars
  3. **Paradox Map** — irreducible tensions, which options resolve or embrace each
  4. **Minority Reports** — best dissenting views with "if correct, what fails in consensus?"
- Visual: four-panel layout, each panel fills as its artifact streams
- Total streaming time: ~2–3 minutes

---

## 9. Layer 3: The Config — Lens Packs

### 9.1 Lens Pack JSON Schema

```json
{
  "packName": "Hands of the Void",
  "packVersion": "1.0",
  "source": "handsofthevoid.com",
  "lensCount": 12,
  "families": [
    {
      "name": "Analytical",
      "description": "Structure, evidence, prediction",
      "lensIds": ["logician", "empiricist", "oracle"]
    },
    {
      "name": "Creative",
      "description": "Feeling, synthesis, paradox",
      "lensIds": ["intuitive", "alchemist", "absurdist"]
    },
    {
      "name": "Critical",
      "description": "Doubt, opposition, precedent",
      "lensIds": ["skeptic", "agonist", "archivist"]
    },
    {
      "name": "Integrative",
      "description": "Connections, resolution, design",
      "lensIds": ["systems-thinker", "harmonist", "architect"]
    }
  ],
  "lenses": [
    {
      "id": "logician",
      "seatNumber": 1,
      "avatarName": "The Logician",
      "epistemology": "Formal Deduction",
      "coreQuestion": "Does the structure hold under scrutiny?",
      "philosophy": "The Logician does not believe in intuition...",
      "openingQuote": "Precision is not cold. It is the highest form of care.",
      "closingQuote": "The structure holds. Or it doesn't. There is no in between.",
      "signatureColor": "#F5E6C8",
      "colorName": "Golden White",
      "motifs": ["Crystalline lattices", "Faceted planes", "Hexagonal grids", "Decision trees"],
      "arenaPresence": "Projects structured grids and branching decision trees...",
      "hintTemplate": "Your lens is Formal Deduction. Before you respond, consider: {{coreQuestion}} What logical structure underlies this problem? What premises must hold for any proposed solution to be valid? Where does the reasoning chain break?",
      "clashWeight": 1.0
    }
    // ... remaining 11 lenses follow the same schema
  ],
  "promptTemplates": {
    "hintGeneration": "You are assigning a deliberation lens to a participant. The participant has been assigned the role of {{avatarName}} ({{epistemology}}). The question being deliberated is: {{question}}\n\nGenerate a brief, lens-specific hint (3-5 sentences) that frames the question through this epistemology. Do not answer the question. Instead, tell the participant what to look at, what to question, and what their lens uniquely reveals about this challenge.\n\nThe hint should reference the lens's core question: {{coreQuestion}}\n\nKeep the tone authoritative but inviting. Maximum 150 words.",
    "clashIdentification": "You have received {{n}} responses to the question: \"{{question}}\"\n\nEach response was written through a specific epistemological lens.\n\n{{responses}}\n\nIdentify the 2-4 most significant tensions between these positions. For each tension:\n1. Name the avatars in conflict\n2. Quote the specific claims that clash\n3. State the CRUX — the smallest factual or philosophical disagreement that explains why these positions diverge\n4. Present each clash as a direct confrontation\n\nBe specific. Use direct quotes. The crux should be a single sentence that, if resolved, would dissolve the disagreement.",
    "consensusCore": "Analyze the following {{n}} responses to the question: \"{{question}}\"\n\n{{responses}}\n\nIdentify what most respondents agree on. For each area of consensus:\n- State the shared position clearly\n- Note which avatars endorse it\n- Assign a confidence level (HIGH / MEDIUM / LOW) based on how many respondents align and how strongly\n\nDo not manufacture consensus where none exists. If only 2 of 8 agree on something, that is not consensus.",
    "decisionOptions": "Given the consensus core and all {{n}} responses to: \"{{question}}\"\n\nConsensus Core:\n{{consensusCore}}\n\nAll Responses:\n{{responses}}\n\nIdentify 2-4 genuinely distinct decision options (not compromises or averages). For each option:\n- Description (2-3 sentences)\n- Preconditions / assumptions required for this to work\n- Upside if it succeeds\n- Risks if it fails\n- Which avatars endorse it and why\n- A fast test or experiment to validate the key assumption\n\nOptions should be mutually exclusive or at least meaningfully different paths.",
    "paradoxMap": "Given the clashes and all {{n}} responses to: \"{{question}}\"\n\nClashes:\n{{clashes}}\n\nAll Responses:\n{{responses}}\n\nIdentify the irreducible tensions — polarities that cannot be resolved, only managed. For each tension:\n- Name the polarity (e.g., speed vs. safety, coherence vs. creativity)\n- Explain why it is irreducible (not just a disagreement, but a structural tension)\n- Map which decision options resolve vs. embrace this tension\n\nDo not force resolution. Some tensions are features, not bugs.",
    "minorityReports": "Given the consensus, decision options, and all {{n}} responses to: \"{{question}}\"\n\nConsensus Core:\n{{consensusCore}}\n\nDecision Options:\n{{decisionOptions}}\n\nAll Responses:\n{{responses}}\n\nIdentify the strongest dissenting views — positions that were outvoted or marginalized but contain genuine insight. For each minority report:\n- State the dissenting position clearly\n- Name the avatar(s) who hold it\n- Answer: \"If this dissent is correct, what would fail in the consensus?\"\n\nPreserve the dissenter's voice. Do not editorialize or soften their position."
  },
  "gameRules": {
    "minPlayers": 2,
    "maxPlayers": 12,
    "familyBalancing": true,
    "familyBalancingMinGroupSize": 4,
    "swapEnabled": true,
    "maxSwapsPerPlayer": 1,
    "positionRevealSeconds": 15,
    "maxResponseWords": null,
    "seasonMemoryMaxTokensPerWeek": 2000
  }
}
```

### 9.2 Creating a New Lens Pack

To create a new game variant (e.g., "The Boardroom" with CFO/CTO/CMO lenses), write a new JSON file following the same schema. Change the lens definitions, prompt templates, family groupings, and game rules. Drop it in the config directory. Set the `LENS_PACK` env var. Restart the engine. Zero code changes.

---

## 10. LLM Provider Abstraction

### 10.1 The Adapter Interface

```typescript
interface LLMProvider {
  chat(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
  }): Promise<ChatResponse | AsyncIterable<ChatChunk>>;
}

interface ChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

interface ChatChunk {
  choices: Array<{ delta: { content?: string } }>;
}
```

### 10.2 Supported Providers

Any provider with an OpenAI-compatible `/v1/chat/completions` endpoint:

| Provider | Base URL | Recommended Models | Notes |
|---|---|---|---|
| **Groq** (primary) | `api.groq.com/openai/v1` | llama-3.3-70b-versatile | Fast inference, good streaming |
| **Venice AI** (orchestrator) | `api.venice.ai/v1` | venice-uncensored-4 | For clash ID + synthesis routing |
| **OpenAI** | `api.openai.com/v1` | gpt-4o, gpt-4o-mini | Highest quality, higher cost |
| **Together AI** | `api.together.xyz/v1` | Llama, Mistral, Qwen | Good price/performance |
| **Ollama** (local) | `localhost:11434/v1` | Any GGUF model | Fully offline, zero cost |
| **vLLM** (self-hosted) | `your-server:8000/v1` | Any HuggingFace model | Full control, GPU required |

### 10.3 Retry and Fallback Logic

Per the owner's specifications:

1. Fire the primary API key
2. Wait 1 second, fire the fallback key
3. After 15 seconds, check if either has responded
4. If no response from either, switch to the fallback model and retry
5. The sequential wave protocol applies: fire the next call as soon as the first item from the preceding call completes

### 10.4 Two-Model Configuration

The engine uses two models:

| Role | Env Var | Default | Used For |
|---|---|---|---|
| **Generation** | `LLM_MODEL` | llama-3.3-70b-versatile | Hint generation |
| **Orchestrator** | `LLM_ORCHESTRATOR_MODEL` | venice-uncensored-4 | Clash identification, synthesis routing, all Act 2 + Act 3 calls |

---

## 11. Database Schema

Five tables. Append-only for responses and synthesis. All timestamps in UTC.

### 11.1 Table: `councils`

```sql
CREATE TABLE councils (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          VARCHAR(10) NOT NULL CHECK (mode IN ('instant', 'weekly')),
  question      TEXT NOT NULL,
  host_id       VARCHAR(255) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'setup'
                CHECK (status IN ('setup', 'assignment', 'response', 'deliberation', 'archive')),
  group_size    INTEGER NOT NULL CHECK (group_size BETWEEN 2 AND 12),
  invite_code   VARCHAR(20) UNIQUE NOT NULL,
  season_id     UUID REFERENCES seasons(id),
  week_number   INTEGER,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMP,
  deliberation_started_at TIMESTAMP,
  archived_at   TIMESTAMP
);
```

### 11.2 Table: `seasons`

```sql
CREATE TABLE seasons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  host_id           VARCHAR(255) NOT NULL,
  duration_weeks    INTEGER NOT NULL CHECK (duration_weeks BETWEEN 4 AND 12),
  current_week      INTEGER NOT NULL DEFAULT 0,
  lens_rotation     VARCHAR(10) NOT NULL DEFAULT 'fixed'
                    CHECK (lens_rotation IN ('fixed', 'rotating', 'hybrid')),
  season_memory     BOOLEAN NOT NULL DEFAULT true,
  memory_summary    TEXT DEFAULT '',
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed')),
  cron_time_monday  VARCHAR(10) NOT NULL DEFAULT '08:00',
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 11.3 Table: `players`

```sql
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  council_id      UUID NOT NULL REFERENCES councils(id),
  season_id       UUID REFERENCES seasons(id),
  seat_number     INTEGER NOT NULL,
  avatar_id       VARCHAR(50) NOT NULL,
  avatar_name     VARCHAR(100) NOT NULL,
  epistemology    VARCHAR(100) NOT NULL,
  original_avatar_id VARCHAR(50),
  swapped         BOOLEAN NOT NULL DEFAULT false,
  hint_text       TEXT,
  joined_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(council_id, seat_number)
);
```

### 11.4 Table: `responses`

```sql
CREATE TABLE responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id),
  council_id  UUID NOT NULL REFERENCES councils(id),
  content     TEXT NOT NULL,
  word_count  INTEGER NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Append-only: never update, never delete
-- If a player somehow resubmits, new row. Deliberation uses latest per player.
CREATE INDEX idx_responses_council ON responses(council_id);
CREATE INDEX idx_responses_player ON responses(player_id);
```

### 11.5 Table: `synthesis`

```sql
CREATE TABLE synthesis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id    UUID NOT NULL REFERENCES councils(id),
  artifact_type VARCHAR(20) NOT NULL
                CHECK (artifact_type IN ('clash', 'consensus', 'options', 'paradox', 'minority')),
  content       TEXT NOT NULL,
  token_count   INTEGER,
  generated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Append-only: never update, never delete
CREATE INDEX idx_synthesis_council ON synthesis(council_id);
```

---

## 12. API Specification

### 12.1 REST Endpoints (15 total)

All endpoints return JSON. Error responses use standard HTTP status codes with `{ error: string, detail?: string }` body.

#### Game Lifecycle

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/games` | Host | `{ question, groupSize, mode }` | `{ id, inviteCode, inviteLinks[] }` | Creates game, generates invite links |
| `GET` | `/api/games/:id` | Any | — | Full game state | Includes status, players, lens assignments |
| `POST` | `/api/games/:id/start` | Host | — | `{ status: 'assignment' }` | Triggers lens assignment if not auto-started |
| `DELETE` | `/api/games/:id` | Host | — | `{ deleted: true }` | Only in SETUP state |

#### Player Management

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/games/:id/join` | Player | `{ name, email? }` | `{ playerId, seatNumber, avatar, hint }` | Claims seat, assigns lens, generates hint |
| `POST` | `/api/games/:id/swap` | Player | `{ playerId, targetLensId }` | `{ newAvatar, newHint }` | Swap lens; fails if window closed |
| `GET` | `/api/games/:id/available-lenses` | Player | — | `{ lenses[] }` | Unassigned lenses for swap |
| `GET` | `/api/games/:id/lobby` | Any | — | `{ players[], submitted[], pending[] }` | Real-time lobby status |

#### Response & Deliberation

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/games/:id/respond` | Player | `{ playerId, content }` | `{ responseId, submittedAt }` | Submits response; closes swap window on first |
| `POST` | `/api/games/:id/deliberate` | Host | — | `{ status: 'deliberation' }` | Triggers 3-act deliberation; requires ≥ 2 responses |
| `GET` | `/api/games/:id/synthesis` | Any | — | `{ artifacts[] }` | Returns completed synthesis artifacts |
| `GET` | `/api/games/:id/archive` | Any | — | Full game archive | All positions, clashes, synthesis, metadata |

#### Season Management

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/seasons` | Host | `{ name, durationWeeks, lensRotation, cronTime }` | `{ id, inviteLink }` | Creates weekly season |
| `GET` | `/api/seasons/:id` | Any | — | Season state + week history | |
| `POST` | `/api/seasons/:id/players` | Player | `{ name, email }` | `{ playerId }` | Join season roster |

#### Config

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/config/lenses` | Any | — | Current lens pack JSON | |
| `GET` | `/api/config/status` | Admin | — | `{ provider, model, dbStatus }` | Health check |

### 12.2 Authentication Model

For the initial build, authentication is simple:

- **Host:** identified by a host token generated at game/season creation. Stored in browser localStorage. Required for host-only actions (start, deliberate, delete).
- **Player:** identified by a player token generated at join. Stored in browser localStorage. Required for player-only actions (respond, swap).
- **No user accounts in v1.** Players are ephemeral per game. Season players are identified by email for weekly continuity.

---

## 13. WebSocket Protocol

Three WebSocket channels, all using JSON message frames.

### 13.1 Lobby Channel

```
ws://engine-host/ws/lobby/:gameId
```

**Server → Client messages:**

```json
{ "type": "player_joined", "player": { "seatNumber": 1, "avatarName": "The Logician", "name": "Alice" } }
{ "type": "player_swapped", "player": { "seatNumber": 1, "oldAvatar": "The Logician", "newAvatar": "The Skeptic" } }
{ "type": "response_submitted", "seatNumber": 1 }
{ "type": "swap_window_closed" }
{ "type": "game_state_changed", "status": "deliberation" }
```

### 13.2 Deliberation Channel

```
ws://engine-host/ws/deliberation/:gameId
```

**Server → Client messages:**

```json
// Act 1 — Position Reveal
{ "type": "act_start", "act": 1, "title": "The Positions" }
{ "type": "position_reveal", "seatNumber": 3, "avatarName": "The Systems Thinker", "epistemology": "Interconnection & Emergence", "signatureColor": "#FF6B2B", "content": "...", "summary": "..." }
{ "type": "position_complete" }

// Act 2 — The Clash
{ "type": "act_start", "act": 2, "title": "The Clash" }
{ "type": "clash_stream", "clashIndex": 0, "delta": "The Logician argues..." }
{ "type": "clash_complete", "clashIndex": 0, "avatars": ["logician", "intuitive"], "crux": "..." }

// Act 3 — The Synthesis
{ "type": "act_start", "act": 3, "title": "The Synthesis" }
{ "type": "synthesis_start", "artifact": "consensus" }
{ "type": "synthesis_stream", "artifact": "consensus", "delta": "..." }
{ "type": "synthesis_complete", "artifact": "consensus" }
{ "type": "synthesis_start", "artifact": "options" }
// ... same pattern for options, paradox, minority
{ "type": "deliberation_complete" }
```

### 13.3 Admin Channel (Weekly Mode)

```
ws://engine-host/ws/admin/:seasonId
```

**Server → Client messages:**

```json
{ "type": "week_started", "weekNumber": 3, "question": "..." }
{ "type": "hints_sent", "count": 8 }
{ "type": "response_received", "playerName": "Alice", "seatNumber": 1 }
{ "type": "reminder_sent", "count": 3 }
{ "type": "all_responses_in" }
```

---

## 14. Prompt Templates

All prompt templates are defined in the lens pack JSON (see Section 9.1). The engine reads them at startup and interpolates variables at runtime. The six templates are:

1. **hintGeneration** — generates the lens-specific hint for each player
2. **clashIdentification** — identifies tensions and crux disagreements across all responses
3. **consensusCore** — identifies areas of agreement with confidence levels
4. **decisionOptions** — identifies 2–4 genuine decision forks
5. **paradoxMap** — identifies irreducible tensions
6. **minorityReports** — preserves the strongest dissenting views

Template variables use `{{double-brace}}` syntax. The engine replaces them before sending to the LLM.

Available variables:

| Variable | Available In | Value |
|---|---|---|
| `{{question}}` | All templates | The deliberation question |
| `{{avatarName}}` | hintGeneration | The player's assigned avatar name |
| `{{epistemology}}` | hintGeneration | The player's assigned epistemology |
| `{{coreQuestion}}` | hintGeneration | The lens's core question |
| `{{n}}` | All except hint | Number of responses |
| `{{responses}}` | All except hint | Formatted list of all responses with avatar attribution |
| `{{consensusCore}}` | decisionOptions, minorityReports | The generated consensus core text |
| `{{clashes}}` | paradoxMap | The generated clash identification text |
| `{{decisionOptions}}` | minorityReports | The generated decision options text |
| `{{seasonMemory}}` | All Act 3 templates (if enabled) | Summary of prior weeks' syntheses |

---

## 15. Deliberation Engine Logic

### 15.1 Execution Sequence

When the host triggers deliberation:

```
1. Validate: status === 'response' && responseCount >= 2
2. Transition state: RESPONSE → DELIBERATION
3. Broadcast: { type: 'game_state_changed', status: 'deliberation' }

4. ACT 1 — POSITION REVEAL (no LLM calls)
   For each response (randomized order):
     a. Broadcast position_reveal with 1-line summary
     b. Wait positionRevealSeconds (default 15)
   Broadcast: position_complete

5. ACT 2 — CLASH IDENTIFICATION (1 LLM call, streaming)
   a. Format all responses into the clashIdentification prompt
   b. Call LLM with stream=true, model=LLM_ORCHESTRATOR_MODEL
   c. Broadcast clash_stream deltas as they arrive
   d. Parse completed output into individual clashes
   e. Save to synthesis table (artifact_type='clash')
   f. Broadcast clash_complete for each parsed clash

6. ACT 3 — SYNTHESIS (4 sequential LLM calls, each streaming)
   For each artifact in order: [consensus, options, paradox, minority]:
     a. Format prompt with all responses + prior artifacts
     b. If season memory enabled, append seasonMemory to prompt
     c. Call LLM with stream=true, model=LLM_ORCHESTRATOR_MODEL
     d. Broadcast synthesis_stream deltas
     e. Save to synthesis table
     f. Broadcast synthesis_complete
   
   IMPORTANT: Fire next call as soon as the first token of the current
   call arrives (sequential wave protocol), NOT after full completion.
   This means the consensus prompt fires immediately, and the options
   prompt fires as soon as consensus starts streaming.
   
   Wait — correction: the options prompt NEEDS the consensus output.
   So the sequential dependency is:
     consensus (streams) → options (needs consensus text) → 
     paradox (needs clashes) → minority (needs consensus + options)
   
   Each call must complete before the next begins because each
   depends on the output of the previous.

7. Broadcast: deliberation_complete
8. Transition state: DELIBERATION → ARCHIVE
9. If season memory enabled: generate week summary, append to season memory
```

### 15.2 Response Formatting

When formatting responses for LLM prompts, use this structure:

```
=== Response from The Logician (Formal Deduction) ===
[Player's full response text]

=== Response from The Intuitive (Narrative Empathy) ===
[Player's full response text]

...
```

### 15.3 Output Length Constraints

Per the owner's specifications:
- **Hint generation:** Maximum 150 words
- **Each perspective/lens output:** 500–750 words maximum (applied to hint generation)
- **Orchestrator outputs (clash, synthesis):** No word limit — as long as needed

---

## 16. Email Integration

### 16.1 Pluggable Email Adapter

```typescript
interface EmailProvider {
  send(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string }>;
}
```

Implementations: `SendGridProvider`, `ResendProvider`, `SMTPProvider`, `NoopProvider` (logs to console).

### 16.2 Email Templates

| Email | When | Contains | LLM Call? |
|---|---|---|---|
| Monday Assignment | Monday 8 AM cron | Question + lens + philosophy + hint + submit link | Yes (hint) |
| Swap Confirmation | On swap request | New lens + new hint + submit link | Yes (new hint) |
| Wednesday Reminder | Wednesday midnight cron | "You haven't submitted yet" + submit link | No (template) |
| Deliberation Invite | Friday (or when host is ready) | "Join the live deliberation" + link | No (template) |

### 16.3 Swap via Email Reply

In weekly mode, the Monday email includes a list of unassigned lenses. The player can reply with the name of the lens they want. The system needs to either:
- Parse incoming email replies (requires an email receiving webhook — more complex)
- OR provide a link in the email to a swap page on the skin (simpler, recommended for v1)

**Recommendation for v1:** Include a "Swap Lens" link in the Monday email that opens the skin's swap UI. Avoid email reply parsing in the initial build.

---

## 17. Weekly Automation (Cron)

### 17.1 Monday Morning Job (8:00 AM)

```
1. Query all active seasons where current_week < duration_weeks
2. For each season:
   a. Increment current_week
   b. Get the question for this week (from schedule or host input)
   c. Get active players (not marked as sitting out)
   d. Select N lenses with family balancing
   e. Assign lenses to players
   f. For each player: generate hint (1 LLM call), save to players table
   g. For each player: send assignment email
   h. Create council record for this week
   i. Set council status to 'assignment'
```

### 17.2 Wednesday Midnight Job

```
1. Query all active councils in 'response' status for this week
2. For each council:
   a. Get players who have NOT submitted
   b. Send reminder email to each (template, no LLM)
```

### 17.3 Cron Configuration

Use `node-cron` with timezone-aware scheduling. The Monday time is configurable per season (`cron_time_monday`). Wednesday reminder is always midnight in the season's timezone.

---

## 18. Frontend Pages and UI Specification

### 18.1 Design Direction for the Default Skin

The product walkthrough presentation (12 slides) established the visual direction for the default "Council Nebula" skin:

| Element | Specification |
|---|---|
| Background | Deep near-black (#0A0A0F) |
| Foreground text | Warm parchment white (#E8E4DC) |
| Primary accent | Molten Gold (#FFB800) — engine, authority |
| Secondary accent | Bioluminescent Cyan (#00E5FF) — interaction, player |
| Headline font | Space Grotesk |
| Body font | DM Sans |
| Lens cards | Dark panels with left-border accent in the lens's signature color |
| Deliberation view | Theater-style reveal, side-by-side clash cards, four-panel streaming synthesis |

Each lens has its own signature color (defined in the lens pack), used for the lens card accent, avatar glow, and clash card borders.

### 18.2 Key UI Patterns

**Lens Assignment Reveal:** Full-screen dramatic reveal — "YOU ARE THE SKEPTIC" in large type with the lens's signature color glowing. Philosophy paragraph fades in below. Hint text appears last.

**Live Lobby:** Circle of 12 seat positions (like a round table). Filled seats glow in their lens color. Empty seats are dim. Submitted seats pulse. The host's "Begin Deliberation" button appears when ≥ 2 responses are in.

**Deliberation Theater:** Full-screen, no navigation chrome. Dark background. Content streams into the center. Act transitions are announced with a title card. The audience watches together — this is a spectacle, not a dashboard.

---

## 19. Deployment and Docker Packaging

### 19.1 Docker Compose (Single Server)

```yaml
version: '3.8'
services:
  engine:
    build: ./engine
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://council:council@db:5432/council
      - LLM_PROVIDER_URL=https://api.groq.com/openai/v1
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_MODEL=llama-3.3-70b-versatile
      - LLM_ORCHESTRATOR_MODEL=venice-uncensored-4
      - LENS_PACK=/config/hands-of-the-void.json
      - EMAIL_PROVIDER=none
      - CORS_ORIGINS=http://localhost:3000
    volumes:
      - ./config:/config
    depends_on:
      - db

  skin:
    build: ./skins/council-nebula
    ports:
      - "3000:3000"
    environment:
      - VITE_ENGINE_URL=http://engine:3001
      - VITE_ENGINE_WS_URL=ws://engine:3001

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=council
      - POSTGRES_PASSWORD=council
      - POSTGRES_DB=council
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 19.2 Deployment Options

| Option | Architecture | Good For |
|---|---|---|
| **A: Single Server** | Engine + Skin + DB on one machine | Local dev, small groups |
| **B: Separated** | Skin on CDN, Engine + DB on server | Production, scalability |
| **C: Multi-Skin** | Multiple skins on CDN, shared Engine + DB | Multiple game variants |

### 19.3 Engine Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### 19.4 Skin Dockerfile

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
```

---

## 20. Build Sequence — 12 Sprints

| Sprint | Layer | What | Time | Lines |
|---|---|---|---|---|
| 1 | Engine | Scaffold: Express + WebSocket + DB abstraction (Postgres/SQLite) + migrations | 30 min | ~250 |
| 2 | Engine | LLM provider adapter: OpenAI-compatible interface + streaming + retry/fallback | 25 min | ~200 |
| 3 | Engine | Lens pack loader: JSON schema validation, family balancing algorithm | 20 min | ~150 |
| 4 | Engine | Game lifecycle API: create, join, swap, respond, deliberate (all 15 endpoints) | 50 min | ~450 |
| 5 | Engine | Deliberation engine: hint gen, clash ID, 4 synthesis artifacts, streaming broadcast | 55 min | ~400 |
| 6 | Engine | Weekly automation: cron scheduler, email adapter, season memory | 35 min | ~300 |
| 7 | Skin | Scaffold: React app + engine client + WebSocket hooks + theme system + skin.config.json | 30 min | ~200 |
| 8 | Skin | Pages: landing, game creation, join, assignment, response, lobby | 50 min | ~600 |
| 9 | Skin | Deliberation view: three-act theater, clash cards, synthesis panels, streaming display | 55 min | ~500 |
| 10 | Skin | Host dashboard + season view + archive + season creation | 35 min | ~400 |
| 11 | Config | Hands of the Void lens pack JSON + all prompt templates (using data from Section 5) | 20 min | ~300 |
| 12 | DevOps | Docker packaging + docker-compose + deployment docs + end-to-end test | 35 min | ~150 |
| **Total** | | | **~7.5 hrs** | **~3,900** |

### Sprint Dependencies

```
Sprints 1-3 (engine foundation) → Sprint 4 (API) → Sprint 5 (deliberation)
Sprint 6 (weekly) depends on Sprint 4 + 5
Sprint 7 (skin scaffold) can start after Sprint 4
Sprints 8-10 (skin pages) depend on Sprint 7
Sprint 11 (config) can be done any time
Sprint 12 (Docker) requires all other sprints complete
```

---

## 21. Token Economics

### 21.1 Per-Game Cost (Runtime)

| Step | LLM Calls | Tokens (12 players) | Tokens (4 players) |
|---|---|---|---|
| Hint generation | 1 per player | ~15,000 | ~5,000 |
| Clash identification | 1 | ~8,000 | ~6,000 |
| Consensus Core | 1 | ~12,000 | ~10,000 |
| Decision Options | 1 | ~12,000 | ~10,000 |
| Paradox Map | 1 | ~10,000 | ~8,000 |
| Minority Reports | 1 | ~8,000 | ~6,000 |
| **Total** | **17** (12p) / **9** (4p) | **~65,000** | **~45,000** |

### 21.2 Season Cost (8 Weeks)

| Scenario | Per Week | 8-Week Total |
|---|---|---|
| 12 players, all weeks | ~65,000 | ~520,000 |
| 8 players average | ~55,000 | ~440,000 |
| 6 players average | ~50,000 | ~400,000 |

### 21.3 Build Cost

| Category | Tokens |
|---|---|
| Code output (~3,900 lines) | ~120,000 |
| Input context per call | ~350,000–400,000 |
| Debugging + iteration (25% buffer) | ~120,000–150,000 |
| **Total to build** | **~600,000–750,000** |

---

## 22. Creating New Game Variants

After the engine is built, creating a new game variant requires:

| Step | Time | What Changes |
|---|---|---|
| Write new lens pack JSON | 30 min | Different perspectives, prompts, rules |
| Fork and restyle skin | 2–3 hrs | Different visual theme, branding, copy |
| Point skin at engine | 1 min | Set `engineUrl` in `skin.config.json` |
| Deploy | 5 min | `docker-compose up -d` |
| **Total** | **~3 hours** | **Zero engine changes** |

### Example Variants

| Variant | Lens Pack | Skin Theme | Use Case |
|---|---|---|---|
| Council Nebula | Hands of the Void (12 epistemologies) | Dark cosmic arena | General deliberation |
| The Boardroom | CFO, CTO, CMO, COO, CHRO, etc. | Corporate dark mode | Executive decisions |
| The Classroom | Bloom's Taxonomy levels | Warm scholarly parchment | Educational deliberation |
| The War Room | Red Team, Blue Team, Intel, Ops | Military tactical green | Security analysis |
| The Studio | Design Thinking (Empathize, Define, Ideate, etc.) | Colorful creative | Brainstorming |

---

## 23. Known Constraints and Open Questions

### 23.1 Constraints

| Constraint | Detail |
|---|---|
| No user accounts in v1 | Players are identified by tokens per game, emails per season |
| Email reply parsing deferred | v1 uses a swap link in the email instead of parsing replies |
| Single engine instance | v1 does not handle horizontal scaling; one engine serves all games |
| No real-time editing | Players cannot edit responses after submission |
| No spectator mode | Only players and host can view the deliberation (could be added later) |

### 23.2 Open Questions for the Developer

1. **Database choice for production:** PostgreSQL is recommended, but SQLite is supported for local dev. The developer should confirm which the owner prefers for initial deployment.

2. **Email provider:** The owner needs to choose and set up a transactional email service (SendGrid, Resend, or SMTP). The engine supports all three via the pluggable adapter.

3. **Hosting target:** The Docker packaging supports any Linux server. The developer should confirm the target hosting environment (AWS, DigitalOcean, local server, etc.).

4. **Domain and SSL:** The skin needs a domain and SSL certificate for production. The engine needs a domain for the API. These can be the same server (Option A) or separate (Option B).

5. **Season memory summarization:** The current design caps season memory at ~2,000 tokens per week. The developer should decide whether to use a separate LLM call to generate the weekly summary or a simpler extractive approach.

6. **Position reveal timing:** The default is 15 seconds per position. Should this be configurable by the host per game, or fixed in the config?

---

*This document contains everything needed to build the Council Engine. The lens definitions are complete. The API surface is specified. The database schema is defined. The prompt templates are written. The build sequence is ordered. The developer should be able to start at Sprint 1 and ship a working system by Sprint 12.*
