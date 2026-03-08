# FullStack Max Review

## Scope

This document compares the repository at:

- initial commit: `b2fe690` (`feat: initial commit — MetaCanon AI full stack`)
- current review target: branch `max` at `f15e6d7`

The goal is to explain, across the full stack:

1. what the initial codebase already contained
2. what worked versus what was mostly scaffolding or not wired end to end
3. what was added or fixed on `max`
4. what is still not fully implemented

This is not just a diff summary. It is a runtime/architecture review.

## Executive Summary

The initial commit was not a toy repo. It already contained a large amount of real code across six repositories:

- `metacanon-core`
- `metacanon-installer`
- `sphere-engine-server`
- `sphere-skin-council-nebula`
- `sphere-tma-app`
- `metacanon-code-api`

The initial codebase already had:

- a substantial Rust runtime with provider integrations, genesis artifact handling, communications, observability, storage, and sub-sphere logic
- a substantial Node/TypeScript engine server with conductor logic, governance, WebSocket streaming, Telegram middleware, and many tests
- two real frontend surfaces (`sphere-skin-council-nebula` and `sphere-tma-app`)
- a Tauri installer desktop app with a large guided UI and many assets
- a small but real code-snippet proxy service (`metacanon-code-api`)

The main problem in the initial codebase was not “lack of code.” The problem was that the codebase was split across multiple partially overlapping runtime models:

- `metacanon-core` had a local sovereign runtime and provider routing model
- `sphere-engine-server` had its own governance and ledger model
- the installer UI implied a multi-agent sovereign flow that was only partially true in the underlying runtime
- the TMA and council UI surfaces were real, but they were not the installed local sphere dashboard the installer suggested

The `max` branch materially improved that situation by adding a first real runtime path that links:

- installer / UI / Telegram entrypoints
- Prism/Torus lane execution in Rust
- live publishing into Sphere Engine
- live observation in `sphere-viz`

However, `max` is still an intermediate state, not the final architecture. It now has a real working Prism round flow, but it still lacks:

- persistent conversational memory
- a single authoritative constitution model across all modules
- a live genesis/soul artifact validation role in the round loop
- real end-to-end tool calling in the multi-perspective / sub-sphere flows
- long-lived autonomous lane runtimes
- actual Hopf/topological math in the runtime

## Commit Progression From Initial Commit To `max`

Relevant progression:

1. `b2fe690` `feat: initial commit — MetaCanon AI full stack`
2. `d0c1d6b` `chore: normalize executable script permissions in split repos`
3. `6914608` `docs: integrate codex team brief into split full-stack workspace`
4. `10ea361` `docs: integrate developer evaluation follow-up and dual-mode website backend response`
5. `af2a357` `Improve installer UX flow, communication onboarding, and live local compute wiring`
6. `09959ee` `Add Telegram /deliberate command flow with step-by-step progress updates`
7. `0487f92` `chore(devstack): add runtime spec and local full-stack launcher`
8. `bd95412` `feat(core): add Prism/Torus runtime lanes and live sphere publishing`
9. `b581cbe` `feat(installer): streamline guided setup and wire real Prism rounds`
10. `4bbbd18` `feat(sphereviz): add live bridge service and runtime dashboard`
11. `f15e6d7` `docs(readme): document max runtime status and branch delta`

Important note:

- `max` includes both the later main-branch installer improvements and the additional runtime/bridge/viz work done after branching.
- The major runtime delta from the initial commit is concentrated in `metacanon-core`, `metacanon-installer`, new root orchestration/scripts, `sphere-bridge`, and `sphere-viz`.

## Initial Commit Review

### Top-Level Repository State At `b2fe690`

The initial tree contained exactly six split repositories and a small root README:

- `metacanon-code-api`
- `metacanon-core`
- `metacanon-installer`
- `sphere-engine-server`
- `sphere-skin-council-nebula`
- `sphere-tma-app`

What was already good:

- The split was structurally clean.
- Each module had its own package/build setup.
- The initial commit already had a meaningful amount of implementation, not just stubs.

What was missing at the repo level:

- no top-level full-stack launcher
- no unified local startup contract across modules
- no explicit repo-level documentation of what was truly wired end to end versus what merely existed inside separate services
- no live dashboard surface specifically for the installed local sphere

### `metacanon-core` At Initial Commit

#### What existed

The initial `metacanon-core` already contained a large runtime surface:

- provider abstraction and routing
- provider clients for:
  - OpenAI
  - Anthropic
  - Grok
  - Moonshot Kimi
  - Morpheus
  - Ollama
  - Qwen local
- genesis artifact generation and integrity logic
- communications adapters
- observability
- storage
- sub-sphere runtime
- specialist lens definitions
- tool registry
- secrets and FHE scaffolding
- UI command surface in `ui.rs`
- CLI in `main.rs`

It also already had tests, including:

- provider routing contract tests
- constitutional invariant contract tests
- observability retention contract tests
- sub-sphere runtime integration tests

#### What worked in the initial core

The initial core already had real value in these areas:

- real provider integration code existed
- provider fallback and routing logic existed
- genesis/soul artifact creation and signing existed
- communications/storage/observability all existed as concrete modules
- specialist lens and sub-sphere structures existed
- the runtime was not just a UI shell; it had substantial backend logic

#### What did not work or was incomplete in the initial core

The main architectural gap was that the term `Torus` did not mean what the product language implied.

What `Torus` actually was at initial commit:

- `DeliberationTorus` in `src/torus.rs` was a provider routing/fallback engine
- it used an `ActionValidator`, but the validator was lightweight and lived in the same module
- it was not a true multi-agent discussion loop between persistent internal agents

What was present but not fully realized:

- `bootstrap_three_agents` existed later in `ui.rs`, but the underlying pattern was still mostly runtime route/config binding rather than long-lived agent processes
- sub-sphere and specialist-lens flows existed, but these were closer to structured multi-perspective prompt execution than a deeply stateful agent ecology
- tool registry structures existed, but tool calling was not the same thing as end-to-end executed tool-use inside a multi-agent round
- constitutional enforcement existed in parts, but not as one authoritative runtime-wide policy layer

Constitution/genesis reality at initial commit:

- a genesis/soul artifact existed and could be hashed/signed
- constitution-related ideas existed in the runtime
- but the constitution was not the single authoritative policy source across core, engine, and frontends
- the genesis artifact acted more as an integrity artifact than as a live runtime validation oracle

Hashing reality at initial commit:

- hashing/signing existed
- but it was not BLAKE3-based runtime hashing; it used the existing `stable_hash_hex` path

Bottom line for initial `metacanon-core`:

- strong amount of real code
- real provider/runtime capability
- meaningful tests
- incomplete agent/runtime semantics
- incomplete end-to-end constitutional integration

### `metacanon-installer` At Initial Commit

#### What existed

The initial installer was already a large Tauri + React application with:

- a multi-step flow
- a Tauri backend bridge
- a substantial visual asset pack
- screens for compute, communications, constitution, genesis, provider setup, and related bootstrap tasks

It already looked like an ambitious installer rather than a toy form.

#### What worked in the initial installer

- the desktop app existed and ran as a real Tauri frontend/backend pair
- there was a substantial amount of setup UI already in place
- the app knew about providers, channels, constitution, genesis, and agent concepts
- the app had enough UI to demonstrate the intended product narrative

#### What did not work or was incomplete in the initial installer

The initial installer suffered from a gap between presentation and runtime truth.

Key issues:

- too many fields and too much debug-ish surface area were shown directly to the user
- several options were UI-only or not fully persisted/used
- the installer implied a polished one-step-per-screen sovereign setup flow, but much of the experience still felt like a broad config editor
- multiple controls exposed backend mechanics that were not meaningful to the user

Specific architectural/runtime gaps:

- the initial desktop Tauri Cargo config pointed to a placeholder git dependency for `metacanon-core` (`YOUR_ORG/metacanon-core.git`), so the split installer was not self-contained without patching
- communication toggles such as live API flags exposed transport implementation details directly in the UI
- the installer suggested internal agent orchestration, but the runtime beneath it did not yet have the explicit Prism/Torus/Watcher/Synthesis/Auditor separation now present on `max`
- constitution and genesis UI existed, but their downstream effect on runtime validation was limited

Bottom line for initial installer:

- substantial UI work existed
- real Tauri bridge existed
- but UX clarity, runtime truthfulness, and end-to-end wiring were incomplete

### `sphere-engine-server` At Initial Commit

#### What existed

The initial engine server was already a large Node/TypeScript backend with:

- API routes
- governance configuration and validators
- conductor logic
- signature verification
- thread access registry
- BFF routes
- Telegram bridge/middleware
- queue/worker support
- hybrid execution router
- database schema/migrations
- WebSocket hub

It also already had a meaningful test footprint, including:

- governance validator tests
- conductor/signature tests
- BFF tests
- middleware tests
- queue tests
- router tests
- game/state machine tests

#### What worked in the initial engine

- the engine was already a real service, not just scaffolding
- the conductor and signature logic were real
- the governance subsystem was real
- thread/BFF/Telegram structures were real
- the service already had stronger operational rigor than the installer implied

#### What did not work or was incomplete in the initial engine

The issue was not lack of implementation. The issue was model mismatch.

The engine was enforcing its own governance/contact-lens world, while the installer/core story was about a sovereign constitution/genesis artifact and a local Prism-led sphere.

In other words:

- the engine was real
- but it was not yet unified with the installer/core sovereign model

Specific gaps:

- the engine governance layer was not driven by the user’s genesis/soul constitution artifact from the installer
- the engine’s thread model and the installer’s sovereign-genesis story were not yet the same runtime
- there was no bridge/dashboard dedicated to observing the installer-driven Prism/Torus flow

Bottom line for initial engine:

- highly functional backend subsystem
- already stronger and more real than many other parts of the stack
- not yet unified with the Rust sovereign runtime model

### `sphere-skin-council-nebula` At Initial Commit

#### What existed

A real React frontend with pages for:

- admin dashboards
- player rounds
- player lobby/results
- deliberation join and stage transitions

#### What worked

- it was a real UI surface tied to `sphere-engine-server`
- it appeared appropriate for the engine’s deliberation/game runtime

#### What did not work in the context of the sovereign installer vision

- it was not the installed local sphere dashboard
- it did not represent the installer’s promised Prism/Torus sovereign bootstrap experience
- it was part of the separate SphereThread frontend world, not the local MetaCanon installer runtime

Bottom line:

- valid frontend
- wrong product surface for the installer-driven local sphere story

### `sphere-tma-app` At Initial Commit

#### What existed

A real React Telegram Mini App with pages like:

- Forge
- Engine Room
- Citadel
- Hub
- AtlasHome

#### What worked

- it was a real TMA surface
- it was already wired to engine/BFF concepts
- it represented a functioning product surface in its own right

#### What did not work in the context of the sovereign installer vision

- it was not yet the installed local sphere’s Prism surface
- it did not represent “talk to your local Prism about your own sphere”
- it was part of the broader engine ecosystem, not the local installer runtime

Bottom line:

- real frontend
- not yet the same product mental model as the installer narrative

### `metacanon-code-api` At Initial Commit

#### What existed

A small Node/TypeScript proxy service that exposed source snippets from `metacanon-core`.

#### What worked

- it was focused and concrete
- its role was clear
- it was already operationally simple compared to the rest of the stack

#### What did not work or was incomplete

- nothing critical from a runtime perspective; it was simply peripheral to the main sovereign runtime flow

Bottom line:

- useful ancillary service
- not a core architectural blocker either initially or on `max`

## What The Initial Codebase Already Had Versus What Was Mostly Scaffolding

### Real / operational in the initial codebase

- provider integrations in `metacanon-core`
- genesis/soul artifact generation and hashing/signing
- communications, observability, storage, and CLI/runtime shell in Rust
- substantial engine backend with governance, conductor, signature verification, queueing, BFF, and Telegram middleware
- real frontend apps for council and TMA
- real test coverage in core and engine

### Present but only partially realized or not unified end to end

- torus as a true multi-agent deliberation loop
- constitution as a single authoritative policy layer across modules
- genesis artifact as a live runtime validation anchor
- multi-agent long-lived background processes
- tool-calling execution in sub-spheres / perspective CL flows
- installer as a truthful reflection of actual runtime state rather than partly aspirational UI
- unified full-stack launcher and live dashboard for the installed sphere

## What `max` Added Or Fixed

From `b2fe690..max`, the branch introduced the main runtime bridge between the local Rust runtime and the live engine/dashboard flow.

High-level changes:

- added top-level docs and runtime spec
- added a local full-stack launcher (`docker-compose.fullstack.yml`, `scripts/dev/*`)
- refactored `metacanon-core` around explicit Prism/Torus/lane boundaries
- wired the installer into the real Rust runtime path
- added `sphere-bridge`
- added `sphere-viz`
- removed app-facing simulated provider behavior in favor of `Live` vs `Unavailable`
- improved local provider setup and communication onboarding

### `metacanon-core` On `max`

What was added:

- `src/action_validator.rs`
- `src/prism.rs`
- `src/torus_runtime.rs`
- `src/sphere_client.rs`
- `src/local_store.rs`
- `src/lanes/mod.rs`
- `src/lanes/watcher.rs`
- `src/lanes/synthesis.rs`
- `src/lanes/auditor.rs`

What changed behaviorally:

- there is now a real `run_prism_round` path
- Prism can accept a message, open a round, run Watcher/Synthesis/Auditor lane calls, synthesize a final answer, and publish round events into Sphere Engine
- provider behavior was cleaned up so the app-facing runtime is `Live` or `Unavailable`, not “simulated”
- a local store abstraction now exists for runtime-local metadata/state handling
- a sphere client path now exists for publishing live events into the engine

What this fixed versus the initial core:

- introduced explicit runtime boundaries that were previously muddled inside `torus.rs` and `ui.rs`
- made the internal triad concept real enough to execute and observe
- connected the Rust runtime to the engine event stream
- created a real path for Prism-led deliberation rather than only provider fallback semantics

What this still does not fix fully:

- the old provider-routing torus model still exists in `src/torus.rs`
- the runtime still is not a long-lived autonomous multi-agent system with independent memory loops
- the lanes are still prompt modules invoked during a request, not daemon-like background actors
- there is still no real conversational memory retrieval path for Prism
- constitution/genesis are still not the authoritative runtime-wide policy state

### `metacanon-installer` On `max`

What changed:

- the Tauri dependency on `metacanon-core` now uses the local workspace path instead of the placeholder git dependency
- the UI flow was significantly simplified and made more user-facing
- misleading settings and internal transport toggles were removed or hidden
- communication onboarding and pairing were improved
- constitution/genesis steps were consolidated and made more coherent
- starter tasks and testing paths now use the real Prism round flow
- Telegram `/deliberate` support was added with progress updates

What this fixed versus the initial installer:

- reduced the “misc fields / config editor” feel
- made the installer closer to a guided setup flow
- aligned more screens with actual runtime capabilities
- connected installer actions to the real Rust runtime instead of leaving them as mostly local UI state
- improved local compute onboarding for Ollama/Qwen

What still remains:

- some screens still describe a more complete sovereign runtime than currently exists
- the installer is still a bootstrap surface, not a full runtime control center
- final runtime validation still depends on the incomplete constitution/genesis integration beneath it

### `sphere-engine-server` On `max`

What changed in this branch:

- comparatively little direct application-code change versus core/installer
- Docker/deploy contract adjustments to fit the new local stack
- the engine is now actively used by the new Rust Prism round flow through live publishing

What this fixed in practice:

- the engine is no longer only adjacent to the local runtime; it now receives and streams real Prism round events from the Rust runtime

What still remains:

- the engine’s governance system is still not unified with the soul/genesis constitution model
- the engine is still not the complete constitutional oracle for the local sphere runtime
- deeper schema/event unification is still needed

### New `sphere-bridge`

This did not exist at initial commit.

What it adds:

- local bridge endpoint between Sphere Engine and a runtime-focused dashboard
- replay and live stream handling
- provider/runtime status surface
- Prism round trigger path for dashboard use

What it fixed:

- made it possible to observe and interact with the live Rust runtime from a dedicated dashboard
- removed the need to treat the old frontends as the only UI windows into the engine

What still remains:

- bridge publishing and runtime command semantics are still part of an evolving architecture
- it is currently a practical dev/runtime bridge, not the final universal control plane

### New `sphere-viz`

This also did not exist at initial commit.

What it adds:

- live event timeline for Prism rounds
- lane activity display for Watcher/Synthesis/Auditor
- provider status display
- `Send To Prism` panel
- final response and per-lane response visibility

What it fixed:

- provided the first live dashboard that actually corresponds to the new Rust Prism/Torus runtime
- made the hidden runtime visible during development and testing

What still remains:

- it is still primarily a runtime observer/debug dashboard
- it is not yet the final polished sovereign dashboard product
- it still reflects the current simplified round model rather than a deeper mathematical/runtime manifold

### Modules Intentionally Unchanged On `max`

These modules were not materially changed in the `b2fe690..max` diff:

- `metacanon-code-api`
- `sphere-skin-council-nebula`
- `sphere-tma-app`

This is important because it means:

- the new runtime path was built without rewriting the older engine-centric surfaces
- the branch deliberately avoided conflating the new local runtime work with a full rewrite of all existing frontends

## Module-by-Module Comparison Matrix

| Module | Initial State | What Worked Initially | What Did Not / Was Scaffolding Initially | `max` Improvements | Remaining Gaps |
|---|---|---|---|---|---|
| Root repo | six split repos, minimal root docs | structure was clean | no unified launcher, no local runtime dashboard | added runtime spec, README status docs, local stack scripts, full-stack compose | still not a fully automatic turnkey runtime for every environment |
| `metacanon-core` | large Rust runtime with providers, genesis, sub-spheres, storage, comms | providers, genesis, storage, comms, tests were real | torus meant provider fallback, not internal deliberation; constitution/genesis not authoritative across stack | added Prism/Torus/lane modules, live sphere publishing, real Prism round path, live/unavailable provider semantics | no deep memory, no true autonomous lanes, no BLAKE3, no full constitutional unification |
| `metacanon-installer` | large Tauri UI with many setup concepts | real desktop app and bridge existed | crowded UI, misleading toggles, placeholder core dependency, weak runtime truthfulness | streamlined flow, local path dependency, real runtime wiring, better comms/provider onboarding, Telegram deliberate path | still bootstrap-focused; some product promises exceed current runtime depth |
| `sphere-engine-server` | large real backend with governance, conductor, BFF, WS, Telegram, tests | engine already strong and operational | separate governance model from installer/core constitution story | now receives/publishes real Rust Prism round events | still not unified with soul/genesis constitution model |
| `sphere-bridge` | did not exist | n/a | n/a | added live bridge and runtime trigger path | still evolving as control-plane/runtime bridge |
| `sphere-viz` | did not exist | n/a | n/a | added live round dashboard and `Send To Prism` panel | still more of a runtime inspection surface than a final end-user dashboard |
| `sphere-skin-council-nebula` | existing engine-centric UI | valid frontend for SphereThread flow | not the installed local sphere dashboard | unchanged on `max` | still separate from the new local runtime story |
| `sphere-tma-app` | existing engine-centric TMA | valid frontend for engine/BFF flows | not the installed local Prism surface | unchanged on `max` | still separate from the new local runtime story |
| `metacanon-code-api` | focused source proxy | already operationally fine | peripheral to core runtime | unchanged on `max` | remains ancillary |

## What Is Actually Better On `max`

Concrete improvements now available that did not exist in the initial integrated state:

1. the installer can now trigger real Prism rounds through the Rust runtime
2. Telegram can now drive `/deliberate`-style Prism flows with progress reporting
3. Watcher, Synthesis, and Auditor lane outputs are now visible and used in a real final synthesis path
4. the Rust runtime can publish live round events into Sphere Engine
5. there is now a dedicated live runtime dashboard (`sphere-viz`)
6. local full-stack bring-up is documented and scripted
7. the branch removed the user-facing “simulated” runtime concept from providers/channels
8. the installer now uses the local workspace Rust dependency instead of a placeholder git dependency

## What Is Still Not Finished On `max`

### 1. Conversational memory

Prism can receive messages and run rounds, but it is still mostly per-request.

Missing:

- durable conversation memory retrieval
- session-aware context assembly
- meaningful long-horizon memory recall into the prompt path

### 2. Constitution as the single source of runtime truth

There is still no single authoritative constitution/governance layer used consistently by:

- `metacanon-core`
- `sphere-engine-server`
- installer/runtime surfaces

Current state:

- genesis records constitution metadata
- Watcher reasons about constitutional alignment
- some block/validation logic exists in core
- engine has its own governance/contact-lens system

This is still fragmented.

### 3. Genesis crystal as a live validator

The soul/genesis artifact is real and hashed/signed, but it still behaves more like:

- an identity/integrity anchor

than like:

- a live runtime validator that constrains every important transition

### 4. Actual tool calling in multi-perspective flows

The structures are present:

- tool registry
- specialist lenses
- sub-sphere orchestration

But the current behavior is still primarily:

- structured LLM execution

rather than:

- perspective-specific reasoning plus real tool execution plus audited result integration

### 5. Long-lived autonomous internal lanes

`Watcher`, `Synthesis`, and `Auditor` currently exist as explicit runtime lanes, which is a real improvement.

But they are still not:

- fully persistent agents/processes with their own ongoing memory loops
- independently evolving lane runtimes

They are still invoked during a round as structured prompt modules.

### 6. Hopf/topological math

The branch adopted Hopf-style architecture and naming discipline, not actual Hopf math.

What exists:

- Prism/Torus/lane decomposition
- more explicit runtime boundaries
- real multi-lane round flow

What does not yet exist:

- a true topological state model
- actual Hopf-fibration or toroidal convergence mathematics embedded in the round semantics
- geometric or invariant-based convergence metrics

### 7. Hashing roadmap

Genesis hashing/signing is real, but the current runtime still uses the existing stable hash implementation rather than BLAKE3.

## Overall Assessment

### Initial codebase assessment

The initial commit was strong in breadth and stronger than average in backend depth.

Its biggest weakness was architectural coherence, not implementation effort.

It already had:

- real providers
- real engine
- real frontends
- real tests
- real installer

But too many of those pieces were parallel realities rather than one unified product/runtime.

### `max` branch assessment

`max` is the first branch where the following loop is materially real:

- user message
- Prism
- Torus round
- Watcher / Synthesis / Auditor
- final Prism synthesis
- Sphere Engine publication
- live dashboard observation

That is a real milestone.

At the same time, `max` should still be understood as:

- a major runtime integration step
- not the final sovereign architecture

The biggest remaining work is not “add more UI.” It is:

- deepen memory
- unify constitution/governance/genesis
- make tool use real in multi-perspective flows
- decide whether internal lanes remain invoked runtime modules or become long-lived processes
- decide how much genuine Hopf/topological semantics should move from concept into code

## Practical Bottom Line

If the question is “what changed from the initial commit to `max`?”, the concise answer is:

- the initial repo already had a lot of real code, but it was split across partially separate runtime models
- `max` is where the local Rust runtime, installer, engine, bridge, and live visualization were finally linked into one observable Prism/Torus flow
- the branch significantly improved runtime honesty, provider handling, local startup, and live inspection
- the branch did not yet finish the deeper constitutional, memory, tool-use, or mathematical/runtime model work

That is the current state of the full stack.
