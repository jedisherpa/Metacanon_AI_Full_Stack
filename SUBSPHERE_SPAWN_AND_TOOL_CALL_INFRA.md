# Sub-Sphere Spawn And Tool Call Infrastructure

## Purpose
This document defines the target architecture for persistent sub-spheres, derived genesis, bounded tool execution, local torus governance inside each sub-sphere, and live visibility across the existing Metacanon full stack.

This spec is written against the current `max` branch runtime and service topology. It is not a greenfield design. It assumes the following current realities:
- `PrismRuntime` is the user-facing orchestrator in `metacanon-core`.
- `Watcher`, `Synthesis`, and `Auditor` are internal lanes in the main torus flow.
- `sphere-engine-server` is the canonical event ledger and governance gate.
- `sphere-bridge` and `sphere-viz` already provide live observation of the main runtime.
- engine skills are real and executable.
- the installer is intentionally out of scope for immediate merge work.

## Hard Decisions Preserved
These decisions are fixed by this spec.

1. `Prism` never executes tools.
2. `Prism` remains the only user-facing conversational interface.
3. All real tool or workflow execution happens inside sub-spheres.
4. Sub-spheres are persistent bounded workers, not one-off prompt fans.
5. Every persistent sub-sphere has a derived genesis rite and a derived soul artifact rooted in the parent sphere.
6. Every sub-sphere runs its own scoped torus loop with `Watcher`, `Synthesis`, and `Auditor`.
7. Sub-sphere lenses communicate through `sphere-thread-engine`, not through hidden local-only side channels.
8. SphereViz must render sub-spheres, their internal torus traffic, and their workflow/tool state.
9. The user can spawn sub-spheres from SphereViz through a guarded derived-genesis flow.
10. Tool authority is always narrower than the parent sphere. A sub-sphere can narrow permissions, never broaden them.
11. Constitution and will-vector guardrails apply at the parent sphere and inside each sub-sphere.
12. The canonical event ledger remains `sphere-engine-server` backed by Postgres.
13. Genesis artifacts remain canonical file artifacts, not just rows in a local database.

## Current Baseline
The current codebase already contains useful pieces, but they stop short of the required behavior.

### `metacanon-core`
Current relevant files:
- `metacanon-core/src/prism.rs`
- `metacanon-core/src/ui.rs`
- `metacanon-core/src/genesis.rs`
- `metacanon-core/src/action_validator.rs`
- `metacanon-core/src/sub_sphere_manager.rs`
- `metacanon-core/src/task_sub_sphere.rs`
- `metacanon-core/src/sub_sphere_torus.rs`
- `metacanon-core/src/specialist_lens.rs`
- `metacanon-core/src/tool_registry.rs`
- `metacanon-core/src/sphere_client.rs`
- `metacanon-core/src/skill_client.rs`
- `metacanon-core/src/local_store.rs`
- `metacanon-core/src/storage.rs`

What exists now:
- `PrismRuntime` decides direct vs deliberate routing.
- the main torus opens rounds across `Watcher`, `Synthesis`, and `Auditor`.
- `TaskSubSphere` exists in `SoulFile` and supports specialist lenses, workflows, and tool allowlists at a basic level.
- `SubSphereManager` exists and manages spawn, pause, dissolve, and query operations.
- `SubSphereTorus` exists, but it is still a local summary builder with deliverables and HITL approval records, not a true Sphere Thread-backed runtime.
- `SpecialistLensDefinition` and `ActiveSpecialistLens` exist, but they are too thin. They only capture objective, tags, allowlist, and approval state.
- `WillVectorActionValidator` exists and can validate LLM requests, tool invocations, and outbound messages, but its matching is still shallow.
- `SkillClient` can call the engine skill runtime.

What is missing now:
- no persistent Prism conversational memory.
- no first-class derived genesis artifact for sub-spheres.
- no persistent sub-sphere memory model.
- no dynamic signer and contact-lens issuance for sub-sphere lenses.
- no Sphere Thread-backed message flow for sub-sphere lens-to-lens communication.
- no local torus inside each sub-sphere that continuously revalidates against drift.
- no LLM-assisted lens recommendation step during sub-sphere creation.
- no full output handoff contract from sub-sphere deliverable back into main Prism/Torus.

### `sphere-engine-server`
Current relevant files:
- `sphere-engine-server/engine/src/sphere/conductor.ts`
- `sphere-engine-server/engine/src/governance/contactLensValidator.ts`
- `sphere-engine-server/engine/src/agents/skillRuntime.ts`
- `sphere-engine-server/engine/src/agents/agentConfig.ts`
- `sphere-engine-server/engine/src/api/v1/engineRoomRoutes.ts`
- `sphere-engine-server/engine/src/index.ts`

What exists now:
- the conductor enforces canonical append-only thread writes.
- contact-lens governance exists per signer DID.
- skill runtime exists and can execute real skills.
- runtime skill routes exist behind service auth.

What is missing now:
- no first-class sub-sphere or lens runtime event taxonomy.
- no read models for sub-sphere state, lens state, drift status, or deliverable status.
- no thread provisioning helpers for sub-sphere runtime creation.
- no dynamic contact-lens issuance flow for spawned sub-sphere lens identities.

### `sphere-bridge`
Current relevant file:
- `sphere-bridge/index.ts`

What exists now:
- live thread replay and fanout for the main runtime.
- provider-state endpoint.
- Prism round HTTP bridge.

What is missing now:
- no sub-sphere registry endpoint.
- no sub-sphere spawn endpoint.
- no dynamic subscription awareness for sub-sphere and lens threads.
- no sub-sphere workflow or deliverable streaming helpers.

### `sphere-viz`
Current relevant files:
- `sphere-viz/src/pages/Home.tsx`
- `sphere-viz/src/lib/sphere-client.ts`

What exists now:
- visualization of main nodes: `Prism`, `Torus`, `Watcher`, `Synthesis`, `Auditor`, and infrastructure nodes.
- Prism panel that can send a message and observe a live round.

What is missing now:
- no sub-sphere graph.
- no spawn or derived genesis UI.
- no visualization of sub-sphere internal torus loops.
- no workflow/tool execution panel per sub-sphere.
- no drift or guardrail status for sub-spheres.

### `metacanon-code-api`
Current relevant files:
- `metacanon-code-api/src/runtimeControl.ts`
- `ffi-node/*`

What exists now:
- runtime-control bridge into Rust.
- owner/operator control surface foundations.

What is missing now:
- no sub-sphere-specific runtime-control commands beyond the current older sub-sphere operations.
- no spawn flow with lens recommendations and derived genesis review.

### `sphere-tma-app`
Current relevant files:
- `sphere-tma-app/src/pages/EngineRoomPage.tsx`
- `sphere-tma-app/src/lib/api.ts`
- `sphere-tma-app/src/lib/commands.ts`
- `sphere-tma-app/src/lib/controlApiKey.ts`

What exists now:
- owner-authenticated control surface direction.

What is missing now:
- no sub-sphere spawn wizard.
- no view of active sub-spheres, drift, or deliverables.
- no approved path for Prism chat to delegate into sub-sphere creation.

### `metacanon-installer`
Current position:
- intentionally not changed for this spec.
- installer should not become the runtime management console.
- it may later expose high-level capability summaries or launch the runtime surfaces, but sub-sphere lifecycle belongs in the live runtime surfaces, not in the installer.

## Terminology
This spec uses the following terms consistently.

### Parent Sphere
The main sphere created by the original genesis rite. This contains the canonical root soul file and the main `Prism` entrypoint.

### Sub-Sphere
A bounded persistent worker sphere derived from the parent sphere. It has:
- a derived genesis artifact
- a derived soul file
- a constrained objective
- a constrained will-vector
- constrained tools
- constrained workflows
- one or more internal lenses
- its own local torus governance loop

### Lens
A specialized AI contact lens assigned to a sub-sphere. A lens is a first-class runtime definition with:
- a role
- a prompt contract
- a tool policy
- a memory scope
- workflow responsibilities
- escalation rules
- a unique identity in Sphere Thread

### Derived Genesis
A sub-sphere genesis rite rooted in the parent sphere’s soul/genesis artifact. It cannot broaden constitutional or tool authority.

### Local Torus
The scoped `Watcher` / `Synthesis` / `Auditor` governance loop that exists inside a sub-sphere. This loop governs that sub-sphere’s internal work and drift.

## Required Invariants
These invariants are mandatory.

1. A sub-sphere can only inherit and narrow parent authority.
2. A sub-sphere cannot widen tool access, constitutional scope, or will-vector scope beyond the parent sphere.
3. No tool execution occurs outside a sub-sphere runtime.
4. No sub-sphere or lens may publish to Sphere Thread without a valid signer DID and corresponding contact-lens governance policy.
5. Every tool execution must be traceable to:
   - parent sphere
   - sub-sphere
   - lens
   - workflow step
   - trace id
   - requested-by identity
6. Every sub-sphere deliverable must be attributable to a local torus round.
7. Every high-risk action must be eligible for HITL gating.
8. Every sub-sphere must remain revocable.
9. Every sub-sphere must emit drift and governance telemetry.
10. Prism may request, inspect, and summarize sub-sphere work, but Prism itself does not gain tool authority from the sub-sphere.

## Target Runtime Model

### Top-Level Flow
1. User sends a message to `Prism`.
2. `Prism` retrieves local conversational context and active sub-sphere state.
3. `Prism` opens a main torus round when direct response is insufficient.
4. Main torus decides one of three paths:
   - answer directly
   - delegate to an existing sub-sphere
   - create and then delegate to a new sub-sphere
5. If a new sub-sphere is needed, the system runs a derived genesis flow.
6. The sub-sphere’s local torus governs the internal task and any tool or workflow execution.
7. Sub-sphere returns a bounded deliverable to the parent sphere.
8. Main torus and `Prism` synthesize the user-facing response.
9. All steps publish to Sphere Thread.
10. SphereViz and TMA can inspect the live state.

### Sub-Sphere Flow
1. Parent sphere chooses or spawns a sub-sphere.
2. Sub-sphere local `Watcher` validates the incoming objective.
3. Sub-sphere local `Synthesis` plans the work and proposes workflow/tool usage.
4. Sub-sphere local `Auditor` verifies traceability and execution constraints.
5. If tool execution is needed, the sub-sphere invokes engine skills through a skill-runtime boundary.
6. Tool results return to the sub-sphere.
7. Local torus reconvenes if necessary.
8. Sub-sphere emits a deliverable.
9. Parent sphere consumes that deliverable.

## Derived Genesis Rite For Sub-Spheres

### Why It Exists
A sub-sphere is not just a task row. It is a bounded derivative of the parent sphere and needs its own identity, policy scope, and persistence.

### Inputs
The derived genesis rite takes:
- `parent_soul_file_ref`
- `parent_genesis_hash`
- `parent_signature`
- `parent_constitution_ref`
- `parent_will_vector`
- `sub_sphere_name`
- `sub_sphere_objective`
- `persistent: bool`
- `hitl_policy`
- `allowed_tool_ids`
- `workflow_templates`
- `lens_plan`
- `requested_by`
- `spawn_reason`

### Outputs
The derived genesis rite produces:
- `sub_sphere_id`
- `derived_genesis_hash`
- `derived_signature`
- `derived_soul_file`
- `lens_definitions`
- `workflow_registry`
- `thread_registry`
- `memory_namespace`
- `contact_lens_manifest`
- `tool_policy_manifest`
- `drift_policy`

### Inheritance Rules
The derived soul file must include:
- parent genesis hash reference
- parent constitution hash/version reference
- inherited core values
- inherited AI boundaries
- inherited will-vector directives
- narrowed sub-sphere objective and duties
- narrowed tool permissions
- narrowed workflow permissions

The derived soul file may add:
- specialized role metadata
- delivery schema
- workflow templates
- sub-sphere-specific drift rules

The derived soul file may not add:
- broader permitted activities than the parent
- broader tool permissions than the parent
- weaker HITL requirements than the parent for the same class of action

### Canonical Artifact Model
Genesis artifacts remain file artifacts on disk.

Parent sphere:
- existing root genesis artifact remains canonical.

Sub-sphere:
- each sub-sphere gets a derived artifact file on disk.
- local runtime state stores only references and indexes.

Recommended artifact path pattern:
- `~/.metacanon_ai/subspheres/<sub_sphere_id>/derived_soul.json`
- `~/.metacanon_ai/subspheres/<sub_sphere_id>/lens_manifest.json`
- `~/.metacanon_ai/subspheres/<sub_sphere_id>/workflow_manifest.json`

## Lens Recommendation During Spawn

### Goal
Use an LLM to propose the minimum viable lens set required for the sub-sphere to operate.

### Constraint
The LLM proposes. It does not grant authority.

### New Runtime Component
Add a `LensPlanner` stage in `metacanon-core`.

Suggested new file:
- `metacanon-core/src/sub_sphere_lens_planner.rs`

### Lens Planner Inputs
- parent sphere constitution reference
- parent will-vector directives
- parent AI boundaries
- sub-sphere objective
- available tool catalog from `ToolRegistry`
- available workflow templates from `WorkflowRegistry`
- existing lens template library
- user-specified preferences or exclusions

### Lens Planner Output Schema
The planner must emit strict structured JSON.

Suggested schema:
```json
{
  "mode": "minimal|recommended|advanced",
  "summary": "why these lenses are needed",
  "lenses": [
    {
      "name": "Research Lens",
      "role": "research",
      "objective": "Gather source material and validate coverage.",
      "prompt": "System prompt template here.",
      "toolAllowlist": ["local_search", "api_integration"],
      "toolDenylist": ["code_writing"],
      "memoryScope": "task_only",
      "workflowResponsibilities": ["collect_inputs", "validate_sources"],
      "requiresHitlApproval": false,
      "escalationRules": ["external side effects require approval"],
      "reason": "Needed to gather and normalize inputs before execution."
    }
  ]
}
```

### Governance Review After Recommendation
The planner output must be reviewed by a scoped spawn-review torus:
- `Watcher`: are the lens objectives constitutional and within scope?
- `Synthesis`: is the proposed lens set coherent and minimal?
- `Auditor`: are tool scopes and inheritance rules properly narrowed?

### User Approval
No sub-sphere is spawned from planner output without explicit user approval.

## Lens Model

### Expand `SpecialistLensDefinition`
Current `SpecialistLensDefinition` is too thin. Expand it to include:
- `role`
- `system_prompt_template`
- `handoff_contract`
- `tool_allowlist`
- `tool_denylist`
- `allowed_event_intents`
- `memory_scope`
- `workflow_responsibilities`
- `input_schema`
- `output_schema`
- `requires_hitl_approval`
- `drift_checks`
- `escalation_rules`
- `contact_lens_template`
- `delivery_priority`

Suggested file to extend:
- `metacanon-core/src/specialist_lens.rs`

### Expand `ActiveSpecialistLens`
Each active lens needs runtime identity and governance state:
- `lens_agent_id`
- `signer_did`
- `contact_lens_id`
- `thread_ids`
- `last_guardrail_check_at`
- `last_drift_score`
- `last_workflow_step`
- `memory_namespace`
- `current_status`

### Lens State Machine
Suggested states:
- `pending_planning_review`
- `pending_contact_lens_approval`
- `active`
- `suspended`
- `drift_flagged`
- `revoked`

## Sub-Sphere Local Torus

### Why It Must Exist
A sub-sphere should never become an unchecked executor. It needs its own scoped torus loop.

### Internal Roles
Every sub-sphere has:
- `Watcher`
- `Synthesis`
- `Auditor`

These are not user-facing bots. They are internal role lanes.

### Responsibilities
#### Local Watcher
- validate incoming task against derived constitution and will-vector
- validate tool permissions
- detect role drift
- detect workflow drift
- mark high-risk or out-of-scope transitions

#### Local Synthesis
- decompose task into workflow steps
- choose which lens or workflow segment acts next
- propose tool or skill execution plans
- synthesize intermediate and final deliverables

#### Local Auditor
- record all lane proposals and outcomes
- verify traceability and evidence requirements
- attest tool execution metadata
- enforce handoff completeness back to parent sphere

### Drift Checks
The sub-sphere local torus must run drift checks:
- before tool execution
- after any side-effecting tool execution
- after workflow changes
- after memory-summary writes
- before returning a final deliverable
- on parent constitution or will-vector revision

### Drift Signals
Minimum drift signals:
- tool scope mismatch
- workflow branch outside declared objective
- lens output inconsistent with derived will-vector
- repeated attempts to bypass approval or prohibited tools
- lens prompt divergence from approved contact lens
- missing audit evidence for side effects

## Persistence Model

### Canonical Storage
Canonical ledger remains in `sphere-engine-server` Postgres.

It stores:
- thread entries
- lens events
- workflow events
- tool execution events
- deliverable events
- drift events
- approval events

### Local Persistent State
Add explicit local persistence for:
- sub-sphere registry
- derived artifact references
- per-sub-sphere memory namespace
- workflow runtime state
- last known lens state
- deliverable cache
- drift snapshots

Recommended additions in `metacanon-core`:
- extend `local_store.rs` for runtime pointers
- use real structured local persistence for sub-sphere state
- continue using canonical genesis artifacts as files

### Suggested New Local Tables
Extend `metacanon-core/src/storage.rs` schema bootstrap with:
- `sub_sphere_genesis_artifacts`
- `sub_sphere_runtime_state`
- `sub_sphere_lenses`
- `sub_sphere_memory_entries`
- `sub_sphere_workflow_runs`
- `sub_sphere_deliverables`
- `sub_sphere_drift_events`

Suggested fields:
- `sub_sphere_genesis_artifacts`
  - `sub_sphere_id`
  - `parent_genesis_hash`
  - `derived_genesis_hash`
  - `artifact_path`
  - `signature`
  - `created_at`
- `sub_sphere_runtime_state`
  - `sub_sphere_id`
  - `status`
  - `memory_namespace`
  - `current_workflow_run_id`
  - `last_guardrail_check_at`
  - `last_drift_score`
  - `updated_at`
- `sub_sphere_lenses`
  - `lens_id`
  - `sub_sphere_id`
  - `role`
  - `signer_did`
  - `status`
  - `definition_json`
  - `updated_at`
- `sub_sphere_memory_entries`
  - `memory_id`
  - `sub_sphere_id`
  - `lens_id`
  - `memory_type`
  - `payload_json`
  - `created_at`
- `sub_sphere_workflow_runs`
  - `run_id`
  - `sub_sphere_id`
  - `workflow_id`
  - `status`
  - `step_index`
  - `trace_id`
  - `created_at`
  - `updated_at`
- `sub_sphere_deliverables`
  - `deliverable_id`
  - `sub_sphere_id`
  - `parent_round_id`
  - `status`
  - `content_json`
  - `created_at`
- `sub_sphere_drift_events`
  - `event_id`
  - `sub_sphere_id`
  - `lens_id`
  - `severity`
  - `code`
  - `details_json`
  - `created_at`

## Memory Model

### Prism Memory
Prism needs persistent memory, but no tool authority.

Prism memory should contain:
- session turns
- user preferences
- active objectives
- active sub-sphere registry summary
- recent deliverables
- summaries

### Sub-Sphere Memory
Each sub-sphere gets separate scoped memory:
- task memory
- workflow memory
- evidence/source memory
- audit memory
- deliverable history

### Lens Memory
Each lens only sees what its `memory_scope` permits.

Possible memory scopes:
- `task_only`
- `sub_sphere_shared`
- `auditor_only`
- `watcher_governance_only`
- `read_parent_summary_only`

### Retrieval Rule
Sub-sphere memory retrieval may inform internal planning, but may not override derived constitution or will-vector constraints.

## Sphere Thread Topology

### Core Requirement
All sub-sphere and lens communication must go through `sphere-thread-engine`.

### Thread Provisioning
Each sub-sphere gets a deterministic registry of threads.

Suggested thread set per sub-sphere:
- `subsphere:<id>:control`
- `subsphere:<id>:torus`
- `subsphere:<id>:watcher`
- `subsphere:<id>:synthesis`
- `subsphere:<id>:auditor`
- `subsphere:<id>:workflow`
- `subsphere:<id>:memory`
- `subsphere:<id>:audit`
- `subsphere:<id>:deliverables`
- `subsphere:<id>:drift`

### Event Intents
Add explicit event intents for sub-spheres.

Spawn and lifecycle:
- `SUBSPHERE_SPAWN_REQUESTED`
- `SUBSPHERE_LENS_PLAN_PROPOSED`
- `SUBSPHERE_LENS_PLAN_REVIEWED`
- `SUBSPHERE_GENESIS_DERIVED`
- `SUBSPHERE_SPAWNED`
- `SUBSPHERE_PAUSED`
- `SUBSPHERE_RESUMED`
- `SUBSPHERE_DISSOLVED`

Local torus:
- `SUBSPHERE_ROUND_OPENED`
- `SUBSPHERE_LANE_REQUESTED`
- `SUBSPHERE_LANE_RESPONSE_RECORDED`
- `SUBSPHERE_ROUND_CONVERGED`
- `SUBSPHERE_DRIFT_FLAGGED`
- `SUBSPHERE_DRIFT_CLEARED`

Workflow and tools:
- `SUBSPHERE_WORKFLOW_STARTED`
- `SUBSPHERE_WORKFLOW_STEP_STARTED`
- `SUBSPHERE_WORKFLOW_STEP_COMPLETED`
- `SUBSPHERE_SKILL_REQUESTED`
- `SUBSPHERE_SKILL_COMPLETED`
- `SUBSPHERE_SKILL_FAILED`

Deliverables and approvals:
- `SUBSPHERE_DELIVERABLE_READY`
- `SUBSPHERE_DELIVERABLE_APPROVED`
- `SUBSPHERE_DELIVERABLE_REJECTED`
- `SUBSPHERE_RESULT_HANDED_TO_PARENT`

Memory and governance:
- `SUBSPHERE_MEMORY_SUMMARY_WRITTEN`
- `SUBSPHERE_WILLVECTOR_VALIDATED`
- `SUBSPHERE_CONSTITUTION_VALIDATED`

## Dynamic Identity And Governance

### Problem
Current `SphereClient` only knows fixed signer roles:
- `prism`
- `torus`
- `watcher`
- `synthesis`
- `auditor`

This is insufficient for persistent sub-sphere lenses.

### Required Change
Extend `SphereClient` to support dynamic runtime identities.

Suggested new capability:
- `ensure_runtime_signer(agent_id: &str) -> did:key`
- `publish_runtime_event_as(agent_id: &str, thread_name: &str, intent: &str, payload: Value)`

### Signer Model
Each persistent sub-sphere lens receives:
- `agent_id`, for example `subsphere:<id>:lens:<lens_id>`
- a signer DID
- a corresponding governance contact-lens definition

### Governance Sync
Extend `scripts/dev/sync-runtime-contact-lenses.mjs` to:
- read current sub-sphere registry
- emit dynamic governance files for active sub-sphere lenses
- include permitted activities, prohibited activities, and HITL requirements derived from the lens definition

### Contact-Lens Generation
Each active sub-sphere lens should have a generated contact-lens record with:
- `did`
- `subSphereId`
- `lensId`
- `role`
- `permittedActivities`
- `prohibitedActions`
- `humanInTheLoopRequirements`
- `toolConstraints`
- `workflowScope`
- `expiresAt` or revocation support

## Tool Calling Model

### Hard Rule
Prism never performs tool calls.

### Who Can Execute Tools
Only sub-spheres can execute tools, and only through a governed path.

### Execution Path
1. local sub-sphere `Synthesis` proposes a skill or workflow action.
2. local `Watcher` checks objective, constitution, will-vector, and tool policy.
3. local `Auditor` verifies traceability and side-effect requirements.
4. sub-sphere invokes engine skill runtime through a bounded skill client.
5. engine skill runtime executes.
6. result returns to the sub-sphere.
7. sub-sphere local torus updates deliverable state.
8. final deliverable returns to parent sphere.

### Engine Skill Integration
Do not duplicate tool execution in core.

Use existing engine skill runtime as the actual executor:
- `sphere-engine-server/engine/src/agents/skillRuntime.ts`
- `sphere-engine-server/engine/src/api/v1/engineRoomRoutes.ts`

### Suggested Skill Invocation Envelope
```json
{
  "subSphereId": "ss-123",
  "lensId": "lens-research-1",
  "workflowRunId": "wf-456",
  "stepId": "step-2",
  "skillId": "api_integration",
  "input": { "objective": "Fetch records" },
  "traceId": "trace-789",
  "requestedBy": "subsphere:ss-123:lens:lens-research-1"
}
```

### Validation Order Before Skill Execution
1. main-sphere will-vector narrowing still valid.
2. sub-sphere derived will-vector still valid.
3. lens tool allowlist includes requested skill.
4. lens tool denylist does not exclude requested skill.
5. workflow step allows the skill.
6. HITL requirements are satisfied for the risk class.

## Module-by-Module Change Specification

## `metacanon-core`

### `genesis.rs`
Add:
- `DerivedSubSphereGenesis`
- `DerivedSubSphereGenesisRequest`
- `DerivedSubSphereGenesisResult`
- sub-sphere artifact reference types

Extend `TaskSubSphere` with:
- `parent_genesis_hash`
- `derived_genesis_hash`
- `artifact_path`
- `persistent`
- `memory_namespace`
- `thread_registry`
- `local_torus_config`
- `drift_policy`
- `workflow_ids`
- `deliverable_schema`

### `specialist_lens.rs`
Expand definitions and active runtime state as described above.

### New file: `sub_sphere_lens_planner.rs`
Responsibilities:
- generate recommended lens sets using an LLM
- enforce structured output schema
- support `minimal`, `recommended`, and `advanced` modes
- inject parent constitution and will-vector context

### `task_sub_sphere.rs`
Refactor from list-based local runtime to persistent sub-sphere runtime state manager.

Add responsibilities:
- create derived genesis artifacts
- create thread registries
- register and hydrate persistent lens state
- attach workflow runs
- read/write local memory namespaces
- issue deliverables and handoff state

### `sub_sphere_torus.rs`
Replace summary-only behavior with a real local torus round model.

Add:
- per-round lane requests
- per-round lane outputs
- drift check outputs
- tool proposal outputs
- deliverable convergence state
- Sphere Thread publishing for sub-sphere rounds

### `sub_sphere_manager.rs`
Keep as the lifecycle entrypoint, but extend it to orchestrate:
- lens recommendation
- derived genesis review
- sub-sphere thread provisioning
- signer provisioning
- governance contact-lens generation

### `action_validator.rs`
Extend validator support for:
- derived will-vector narrowing
- sub-sphere-specific objective checks
- lens-level tool validation
- workflow-step validation

### `sphere_client.rs`
Extend to support dynamic signer identities and dynamic thread naming.

Required additions:
- dynamic signer issuance
- signer lookup by arbitrary runtime agent id
- helper to publish events for sub-sphere identities
- helper to compute deterministic sub-sphere thread ids

### `skill_client.rs`
Extend request envelope to include:
- `subSphereId`
- `lensId`
- `workflowRunId`
- `stepId`
- `taskIntent`

### `local_store.rs` and `storage.rs`
Add persistent sub-sphere and memory tables described earlier.

### `ui.rs`
Add new runtime commands:
- `plan_sub_sphere_lenses`
- `spawn_sub_sphere`
- `list_sub_spheres`
- `get_sub_sphere`
- `dispatch_sub_sphere_task`
- `approve_sub_sphere_deliverable`
- `reject_sub_sphere_deliverable`
- `pause_sub_sphere`
- `resume_sub_sphere`
- `dissolve_sub_sphere`
- `get_sub_sphere_memory_summary`
- `get_sub_sphere_drift_status`

Update `run_prism_round`:
- Prism can recommend using or creating a sub-sphere.
- Prism must not call skills directly.
- direct `/skill ...` from Prism should be deprecated or re-routed to a sub-sphere execution path.

## `sphere-engine-server`

### `skillRuntime.ts`
Keep as the executor.

Extend records to include:
- `subSphereId`
- `lensId`
- `workflowRunId`
- `stepId`
- `parentRoundId`
- `driftGateVersion`

### `engineRoomRoutes.ts`
Add owner-authenticated routes for:
- sub-sphere registry listing
- sub-sphere status
- sub-sphere deliverables
- sub-sphere workflow state
- lens plan proposal submission
- sub-sphere spawn approval

Add internal service routes for:
- posting sub-sphere task events
- reading sub-sphere projections
- retrieving sub-sphere thread maps

### `contactLensValidator.ts`
Extend governance validation to support:
- dynamic lens contact-lens files
- sub-sphere-specific permitted activities
- derived sub-sphere role scopes
- tool-specific prohibited actions and HITL requirements

### `conductor.ts`
No architectural replacement is needed. Extend it with:
- sub-sphere event intents
- sub-sphere read model projections
- helper queries by `subSphereId` and `workflowRunId`

### Suggested Engine Read Models
Add projection endpoints for:
- `GET /api/v1/runtime/sub-spheres`
- `GET /api/v1/runtime/sub-spheres/:id`
- `GET /api/v1/runtime/sub-spheres/:id/lenses`
- `GET /api/v1/runtime/sub-spheres/:id/workflows`
- `GET /api/v1/runtime/sub-spheres/:id/deliverables`
- `GET /api/v1/runtime/sub-spheres/:id/drift`

## `sphere-bridge`

### Required New Responsibilities
- expose sub-sphere registry and detail endpoints for SphereViz
- stream dynamic sub-sphere and lens thread events
- expose spawn and dispatch HTTP helpers for SphereViz

### Suggested Endpoints
- `GET /api/subspheres`
- `GET /api/subspheres/:id`
- `POST /api/subspheres/plan`
- `POST /api/subspheres/spawn`
- `POST /api/subspheres/:id/tasks`
- `POST /api/subspheres/:id/approve`
- `POST /api/subspheres/:id/reject`

### WebSocket Behavior
Bridge should emit:
- sub-sphere registry changes
- dynamic thread registry updates for each sub-sphere
- sub-sphere lane events
- workflow/tool events
- deliverable events
- drift events

## `sphere-viz`

### New Primary Views
1. Main sphere graph
2. Sub-sphere registry panel
3. Sub-sphere detail graph
4. Spawn sub-sphere wizard
5. Active workflows panel
6. Drift/guardrail panel
7. Deliverables panel

### Graph Model
The current static main-node view must expand to support:
- main sphere nodes
- sub-sphere nodes
- per-sub-sphere internal torus nodes
- lens nodes within each sub-sphere
- workflow/tool nodes when executing

### Spawn Flow In SphereViz
1. User clicks `Spawn Sub-Sphere`.
2. User enters:
   - name
   - objective
   - persistence mode
   - tool constraints
   - workflow preferences
3. SphereViz calls lens-planning endpoint.
4. UI displays recommended lens set and rationale.
5. UI displays watcher/synthesis/auditor review summary for the proposal.
6. User approves or edits.
7. UI calls spawn endpoint.
8. New sub-sphere appears in graph with live thread traffic.

### Deliverable Flow In SphereViz
For each sub-sphere:
- show latest objective
- show local torus status
- show active lens statuses
- show running workflow step
- show tool execution status
- show drift status
- show latest deliverable and whether it has been handed back to Prism

## `metacanon-code-api`

### Role In This Design
This remains the owner-authenticated runtime control plane.

### New Control Surfaces
Add runtime-control support for:
- lens planning
- derived genesis spawn
- sub-sphere lifecycle
- workflow trigger
- deliverable approval or rejection
- drift inspection

### Security Model
These are owner-authenticated actions.
They do not replace normal user interaction through Prism.
They are explicit control actions.

## `sphere-tma-app`

### Role In This Design
TMA is the owner-authenticated mobile control surface.

### Additions
- sub-sphere list and health
- spawn sub-sphere wizard
- review recommended lens packs
- approve or reject spawn proposals
- inspect drift flags
- approve or reject deliverables
- inspect workflow and tool progress

### Important Constraint
Normal user conversational interaction still flows through Prism.
Direct control in TMA should only expose explicit control actions.

## `metacanon-installer`
No direct merge work is required for this spec.

Later optional additions:
- show that sub-sphere infrastructure is installed and available
- open SphereViz or TMA runtime surfaces
- show whether skill runtime and governance sync are healthy

The installer should not own sub-sphere lifecycle UX.

## API And Runtime Contracts

### New Rust Command Contracts
Suggested request types:
- `PlanSubSphereLensesRequest`
- `SpawnSubSphereRequest`
- `DispatchSubSphereTaskRequest`
- `ApproveSubSphereDeliverableRequest`
- `RejectSubSphereDeliverableRequest`

### `PlanSubSphereLensesRequest`
```json
{
  "objective": "Organize project artifacts and maintain a weekly digest.",
  "name": "Ops Support Sphere",
  "persistent": true,
  "preferredTools": ["file_organization", "memory_population"],
  "excludedTools": ["code_writing"],
  "mode": "recommended"
}
```

### `SpawnSubSphereRequest`
```json
{
  "name": "Ops Support Sphere",
  "objective": "Organize project artifacts and maintain a weekly digest.",
  "persistent": true,
  "lensPlanId": "plan-123",
  "approvedLenses": ["research", "executor", "auditor"],
  "allowedTools": ["file_organization", "memory_population"],
  "workflowTemplateIds": ["weekly_digest"],
  "hitlRequired": true
}
```

### `DispatchSubSphereTaskRequest`
```json
{
  "subSphereId": "ss-123",
  "objective": "Generate this week's digest from the project folder.",
  "requestedBy": "prism",
  "parentRoundId": "round-456"
}
```

## Migration Plan

### Phase 1: Data Model And Persistence
- extend `TaskSubSphere` and `SpecialistLensDefinition`
- add derived genesis artifact references
- add local persistence tables
- add runtime thread registry model

Acceptance:
- can persist and reload a sub-sphere with lens definitions and workflow references

### Phase 2: Lens Planner And Derived Genesis
- add `LensPlanner`
- add spawn-review torus
- add derived genesis artifact generation
- add spawn APIs

Acceptance:
- can plan, review, approve, and spawn a sub-sphere without tool execution yet

### Phase 3: Dynamic Identity And Governance
- extend `SphereClient` with dynamic signers
- generate dynamic contact-lens files
- extend governance sync script
- publish sub-sphere and lens events through Sphere Thread

Acceptance:
- a spawned lens can publish and be accepted by the conductor with its own DID

### Phase 4: Local Torus And Tool Execution
- upgrade `sub_sphere_torus.rs`
- route tool execution through engine skill runtime
- add deliverable handoff
- add drift checks

Acceptance:
- a sub-sphere can receive a task, run local torus, invoke a skill, and emit a vetted deliverable

### Phase 5: SphereViz And TMA Surfaces
- add sub-sphere registry and detail views
- add spawn UI
- add live workflow and drift panels
- add TMA owner-control surfaces

Acceptance:
- user can spawn a sub-sphere from SphereViz and watch it execute live

## Acceptance Criteria
The implementation is complete when all of the following are true.

1. Prism can route work to a persistent sub-sphere without gaining tool authority.
2. A new sub-sphere can be created from a derived genesis rite.
3. The sub-sphere can use LLM planning to suggest a minimum viable lens set.
4. That lens set is reviewed by a guardrailed spawn-review flow.
5. The spawned sub-sphere persists across restarts.
6. The sub-sphere’s lenses have explicit roles, prompts, tool scopes, and workflow responsibilities.
7. Each active lens can publish through Sphere Thread with a valid DID and contact-lens policy.
8. Tool execution occurs only through a sub-sphere and only through the engine skill runtime.
9. A sub-sphere runs a local torus loop with `Watcher`, `Synthesis`, and `Auditor` before and after tool execution.
10. Drift checks can flag and halt a sub-sphere.
11. SphereViz can show:
    - sub-sphere registry
    - local torus activity
    - workflow and tool activity
    - deliverable handoff to Prism
12. TMA can inspect and control sub-spheres through owner-authenticated actions.
13. All important transitions are auditable in `sphere-engine-server`.

## Non-Goals
The following are explicitly not goals for the first implementation.

1. Do not make every lens a separate OS daemon or container.
2. Do not let Prism call tools directly.
3. Do not create a second canonical ledger outside Sphere Engine.
4. Do not let sub-spheres broaden permissions relative to the parent sphere.
5. Do not collapse sub-sphere lifecycle management into the installer.
6. Do not create a giant general-purpose agent mesh before the bounded sub-sphere model is working.

## Final Architectural Summary
The target architecture after this spec is implemented is:
- `Prism` is the persistent user-facing conversational interface.
- `Prism` never performs tools.
- `Torus` orchestrates top-level reasoning and delegation.
- `Sub-spheres` are persistent bounded worker spheres.
- each sub-sphere has a derived genesis artifact, derived soul file, local torus, scoped memory, scoped workflows, and scoped tools.
- each sub-sphere lens is a real governed contact-lens identity with its own Sphere Thread participation.
- engine skills remain the actual execution layer.
- `sphere-engine-server` remains the canonical governance and ledger backbone.
- `sphere-viz` becomes the live operational map of the whole system, including sub-spheres.
