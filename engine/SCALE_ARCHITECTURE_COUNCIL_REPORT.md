# Scale Architecture Council — Deliberation Report
## OpenClaw /commands for Telegram: Constitutional Review & Revision Proposals

**Convened under the Metacanon Constitution v3.0**
**Date:** February 25, 2026
**Mandate:** Read the Metacanon Constitution and MasterSpecDoc-Core-v1 with the intention of skillfully interpreting them into /commands for OpenClaw agents to be used in Telegram to make the constitution accessible. Propose revisions to the existing 25-skill set.

---

## COUNCIL MEMBERS

| Role | Lens |
|---|---|
| **Project Manager — The Constitutional Cartographer** | Completeness, coverage, structural integrity |
| **Member 1 — The Governance Engineer** | Article IV & VI fidelity, Human-in-the-Loop, Authority Drift prevention |
| **Member 2 — The Spec Interpreter** | MasterSpecDoc interaction flows, model references, Queuing Matrix |
| **Member 3 — The Telegram/OpenClaw Architect** | Technical deployability, SKILL.md structure, Telegram UX constraints |
| **Member 4 — The Sphere Experience Designer** | First-time user experience, constitutional accessibility, onboarding coherence |
| **Member 5 — The Systems Scaler** | Scale architecture, DB schema, governance reporting, bottleneck prevention |

---

## PART I: COUNCIL FINDINGS

### 1.1 Cross-Council Consensus: Critical Gaps

All six agents identified the following as the highest-priority missing elements, with unanimous agreement:

**Missing Governance-Critical Skills (all agents flagged):**

| Missing Skill | Constitutional Basis | Priority |
|---|---|---|
| `/advice-process` | Article V, Section 2 | CRITICAL |
| `/vote` | Article V, Section 3 | CRITICAL |
| `/ai-governance-review` | Article VI, Section 6.3 | CRITICAL |
| `/governance-meeting` | Article IV | HIGH |
| `/emergency-shutdown` | Article III, Section 3 | CRITICAL |
| `/constitution` | Preamble + Article VI | HIGH |
| `/glossary` | Preamble (accessibility) | HIGH |
| `/what-is-a-sphere` | Article I | HIGH |
| `/my-lens` | Article II | HIGH |

**Missing Infrastructure:**

| Missing Element | Flagged By | Impact |
|---|---|---|
| `constitutional.events` DB schema | Systems Scaler | CRITICAL — no schema = no audit |
| `constitutional-event-logger` (internal utility) | Governance Engineer | HIGH — logging inconsistency |
| `human-in-the-loop-confirmation` (internal utility) | Governance Engineer | HIGH — HITL not standardized |
| `advice-process-enforcer` (internal utility) | Governance Engineer | HIGH — Material Impact unguarded |
| String Dictionary standard | Spec Interpreter | MEDIUM — localization risk |
| Queuing Matrix integration patterns | Spec Interpreter | MEDIUM — event-driven gaps |
| Error handling + timeout fields | Telegram Architect | HIGH — deployment stability |
| Rate limiting / throttling | Systems Scaler | HIGH — scaling risk |

---

### 1.2 Constitutional Violations in Existing Skills

The **Governance Engineer** (Member 1) identified the following constitutional violations across the existing 25 skills. Each violation is cited against the Metacanon Constitution:

| Skill | Violation | Article/Section |
|---|---|---|
| `create-sphere` | No explicit Human-in-the-Loop trigger; no constitutional citation in log | Art. VI §6.1, §6.2 |
| `join-sphere` | No explicit Human-in-the-Loop trigger; no constitutional citation in log | Art. VI §6.1, §6.2 |
| `leave-sphere` | No explicit Human-in-the-Loop trigger; no constitutional citation in log | Art. VI §6.1, §6.2 |
| `invite-member` | No explicit Human-in-the-Loop trigger; no constitutional citation in log | Art. VI §6.1, §6.2 |
| `remove-member` | No HITL; no Prism Holder unilateral authority clause; no constitutional citation | Art. VI §6.1, §6.2; Art. III §3 |
| `build-perspective-lens` | No HITL before finalization; no constitutional citation in log | Art. VI §6.1, §6.2 |
| `meritocratic-review` | No HITL; no link to Annual AI Governance Review data structure | Art. VI §6.1, §6.3 |
| `lens` (edit mode) | No HITL for edits; no constitutional citation | Art. VI §6.1, §6.2 |
| `connect-social` | No HITL for final connection; no constitutional citation | Art. VI §6.1, §6.2 |
| **All 25 skills** | No standardized `constitutional_reference` field in event logs | Art. VI §6.2 |

**Root Cause:** The original Grok-generated skills state "logs to constitutional.events" but do not enforce the constitutional citation field, do not standardize the HITL confirmation step as a reusable internal skill, and do not distinguish between events with Material Impact and those without.

---

### 1.3 Spec Mismatches (MasterSpecDoc)

The **Spec Interpreter** (Member 2) identified the following mismatches against the MasterSpecDoc-Core-v1:

**Systemic Issues (all 25 skills):**
- No explicit model references (Simple Card, Input, Inform, Text Editor) declared in any SKILL.md
- No String Dictionary integration for user-facing strings
- No Queuing Matrix trigger declarations for event-driven skills

**Missing Interactions from the Spec:**

| Missing Interaction | Spec Reference |
|---|---|
| `cancel-invite` | MasterSpecDoc: Cancel Invite interaction |
| `decline` (sphere invite) | MasterSpecDoc: Decline interaction |
| `forgot-password` | MasterSpecDoc: Login flows |
| `sign-up` (12-step flow) | MasterSpecDoc: Sign Up interaction |
| `sphere-invite` (accept/decline slider) | MasterSpecDoc: Sphere Invite interaction |

**Model Reference Annotation Standard (proposed):**
All SKILL.md files should annotate each user-facing step with its model type:
- `(Inform Model)` — presenting information to the user
- `(Input Model)` — collecting user text input
- `(Simple Card Model)` — displaying a card with image/name/actions
- `(Text Editor Model)` — multi-line content creation
- `(Confirmation Model)` — yes/no decision point
- `(Web Viewer Model)` — loading external URL

---

### 1.4 Technical Issues (Telegram/OpenClaw Architect)

The **Telegram Architect** (Member 3) identified the following structural gaps in all 25 skills:

- **Missing `error-handling` field**: No skill defines what happens on failure (timeout, DB error, API error)
- **Missing `timeout` field**: No skill defines maximum execution time
- **Missing `db-schema` references**: Skills reference `constitutional.events` but do not point to the schema
- **Missing `triggers` declarations**: Skills that trigger other skills (e.g., `create-sphere` → `sphere-onboarding`) do not formally declare this
- **`command-dispatch: internal` missing**: Internal utility skills (`simple-card`, `input-prompt`, `confirmation`) are not explicitly marked as non-user-invocable in a machine-readable way

**Recommended Standard SKILL.md Header Fields:**
```yaml
name: <skill-name>
description: <user-facing description for Telegram slash menu>
user-invocable: true | false
command-dispatch: auto | internal
commands:
  nativeSkills: "auto"
triggers:
  - on: <event>
    skill: <triggered-skill>
error-handling:
  on-timeout: <message>
  on-db-error: <message>
  on-validation-error: <message>
timeout: 30s
db-schema:
  - table: constitutional_events
    reference: constitutional.events
human-in-the-loop: true | false
constitutional-reference: "<Article, Section>"
```

---

### 1.5 UX Failures (Sphere Experience Designer)

The **Experience Designer** (Member 4) identified the following user experience failures:

**Jargon Overload in Slash Menu Descriptions:**
Current descriptions like *"Logs 'sphere-created'. Triggers sphere-onboarding."* are internal-facing, not user-facing. A first-time Telegram user will not understand what a "constitutional event" is.

**Missing Constitutional Education Layer:**
The Constitution introduces concepts (Perspective Lens, Heterarchy, Advice Process, Vision, Territories, Duties) that are central to every interaction — but no skill introduces them. A user who types `/build-perspective-lens` without knowing what a Perspective Lens is will be confused and disengaged.

**Onboarding Sequence Gap:**
`sphere-onboarding` immediately presents the Perspective Lens builder without first explaining what a Perspective Lens is. The revised onboarding should include constitutional education steps *before* requiring the user to act on constitutional concepts.

---

### 1.6 Scaling Risks (Systems Scaler)

The **Systems Scaler** (Member 5) identified the following risks at scale (100 Spheres / 1,000 members / 10,000+ events):

- **No `constitutional.events` schema**: Without a defined schema, the Annual AI Governance Review (Art. VI §6.3) cannot be efficiently executed
- **`manage-members` and `invite-member` are single-operation skills**: No bulk operations = administrative bottleneck at scale
- **`search` has no scaling specification**: Full-text search across 10,000+ events without indexing will degrade
- **No rate limiting**: Any skill can be spammed; no throttling mechanism defined
- **No archival/pruning skills**: `constitutional.events` will grow indefinitely without a pruning strategy
- **No governance reporting skills**: The Annual AI Governance Review requires queryable reports, not just raw event logs

---

## PART II: REVISED SKILL SET

### 2.1 Revised Existing Skills

The following revisions apply to all 25 existing skills. Each revision adds: (1) constitutional HITL trigger, (2) constitutional citation in event log, (3) user-facing description, (4) model annotations, (5) standard header fields.

---

#### `/create-sphere` — REVISED

```markdown
---
name: create-sphere
description: Start your own Sphere — define your vision, invite members, and set up your collaborative foundation.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article I; Article VI §6.1, §6.2"
triggers:
  - on: completion
    skill: sphere-onboarding
error-handling:
  on-timeout: "Sphere creation timed out. Your progress has been saved. Type /create-sphere to resume."
  on-db-error: "Unable to save Sphere. Please try again."
timeout: 60s
db-schema:
  - table: constitutional_events
    event_type: sphere-created
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Welcome message: "Let's build your Sphere." (Inform Model)
2. Sphere Name input (Input Model)
3. Sphere Type selection: Business / Church / Non-Profit / LLC / Other (Input Model)
4. Logo upload (Upload Image Model)
5. Vision statement input: "What is the shared goal your Sphere exists to achieve?" (Text Editor Model)
6. Core Values input (Add Item Model)
7. HUMAN-IN-THE-LOOP: Review summary of Sphere details. "Does this look right?" (Confirmation Model — YES proceeds, NO returns to step 2)
8. On YES: Log `sphere-created` to `constitutional.events` with `constitutional_reference: "Article I; Article VI §6.2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
9. Trigger `sphere-onboarding`
10. Congratulations (Congrats Model)
```

---

#### `/join-sphere` — REVISED

```markdown
---
name: join-sphere
description: Join an existing Sphere using an invite code. Welcome to the community!
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article III; Article VI §6.1, §6.2"
triggers:
  - on: completion
    skill: sphere-onboarding
error-handling:
  on-invalid-code: "That invite code wasn't recognized. Please check with your Sphere admin."
  on-timeout: "Join request timed out. Please try again."
timeout: 30s
db-schema:
  - table: constitutional_events
    event_type: sphere-joined
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Invite code input (Input Model)
2. Validate invite code against `constitutional.invites`
3. Display Sphere summary: Name, Vision, Member Count (Simple Card Model)
4. HUMAN-IN-THE-LOOP: "Do you want to join [Sphere Name]?" (Confirmation Model — YES proceeds, NO cancels)
5. On YES: Log `sphere-joined` to `constitutional.events` with `constitutional_reference: "Article III; Article VI §6.2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
6. Trigger `sphere-onboarding`
```

---

#### `/leave-sphere` — REVISED

```markdown
---
name: leave-sphere
description: Leave a Sphere you are currently a part of. Your reason helps the community improve.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article III; Article VI §6.1, §6.2"
error-handling:
  on-timeout: "Leave request timed out. You are still a member."
timeout: 30s
db-schema:
  - table: constitutional_events
    event_type: sphere-left
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. HUMAN-IN-THE-LOOP: "Are you sure you want to leave [Sphere Name]?" (Confirmation Model — YES proceeds, NO cancels)
2. Reason input (Input Model — optional but encouraged)
3. On YES: Log `sphere-left` to `constitutional.events` with reason, `constitutional_reference: "Article III; Article VI §6.2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
4. Inform: "You have left [Sphere Name]. Your contributions remain part of the record." (Inform Model)
```

---

#### `/invite-member` — REVISED

```markdown
---
name: invite-member
description: Invite new members to your Sphere by generating a unique invite code.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article III; Article VI §6.1, §6.2"
error-handling:
  on-timeout: "Invite generation timed out. Please try again."
timeout: 30s
db-schema:
  - table: constitutional_events
    event_type: member-invited
    material_impact: true
    human_in_the_loop_confirmed: true
  - table: constitutional.invites
---

## Flow
1. Email input for invitee (Input Model)
2. HUMAN-IN-THE-LOOP: "Send invite to [email]?" (Confirmation Model)
3. Generate unique invite code
4. Create `constitutional.invites` record
5. Send Sphere Invite model to invitee
6. Log `member-invited` to `constitutional.events` with `constitutional_reference: "Article III; Article VI §6.2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
7. Confirm: "Invite sent to [email]." (Inform Model)
```

---

#### `/remove-member` — REVISED

```markdown
---
name: remove-member
description: Remove a member from your Sphere. This action is recorded as a constitutional event.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article III §3; Article VI §6.1, §6.2"
error-handling:
  on-timeout: "Removal timed out. Member is still active."
timeout: 30s
db-schema:
  - table: constitutional_events
    event_type: member-removed
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Display member profile summary (Simple Card Model)
2. Reason input (Input Model — required for constitutional record)
3. HUMAN-IN-THE-LOOP: "Permanently remove [Member Name] from [Sphere Name]? This cannot be undone." (Confirmation Model)
4. On YES: Log `member-removed` to `constitutional.events` with reason, `constitutional_reference: "Article III §3; Article VI §6.2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
5. Note: Prism Holder has unilateral authority to remove AI Contact Lenses (Art. III §3). Any Participating Member may trigger emergency shutdown of an AI agent.
6. Inform: "[Member Name] has been removed. The record is sealed." (Inform Model)
```

---

#### `/build-perspective-lens` — REVISED

```markdown
---
name: build-perspective-lens
description: Create your Perspective Lens — your constitutional role document defining your vision, territories, and duties within the Sphere.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article II; Appendix A; Article VI §6.1, §6.2"
error-handling:
  on-timeout: "Lens builder timed out. Your draft has been saved."
timeout: 120s
db-schema:
  - table: constitutional_events
    event_type: perspective-lens-created
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Introduction: "Your Perspective Lens is your constitutional role document. It defines what you're responsible for and how you contribute to the Sphere's Vision." (Inform Model)
2. Vision input: "What is your personal vision within this Sphere?" (Text Editor Model)
3. Territories input: "What domains are you responsible for?" (Add Item Model)
4. Duties input: "What ongoing duties do you perform for the Sphere?" (Add Item Model)
5. Support Structure input: "Who supports you in this role?" (Input Model)
6. Policies/Guidelines input (optional) (Text Editor Model)
7. HUMAN-IN-THE-LOOP: Review full Lens summary. "Is this your Perspective Lens?" (Review Model → Confirmation Model)
8. On YES: Log `perspective-lens-created` to `constitutional.events` with `constitutional_reference: "Article II; Appendix A; Article VI §6.2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
9. Congratulations (Congrats Model)
```

---

#### `/meritocratic-review` — REVISED

```markdown
---
name: meritocratic-review
description: Participate in the meritocratic review process — assess contributions and strengthen the Sphere's governance record.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article IV; Article VI §6.1, §6.2, §6.3"
error-handling:
  on-timeout: "Review timed out. Your ratings have been saved as a draft."
timeout: 60s
db-schema:
  - table: constitutional_events
    event_type: meritocratic-review-completed
    material_impact: true
    human_in_the_loop_confirmed: true
    ai_governance_review_relevant: true
---

## Flow
1. Introduction: "This review contributes to the Annual AI Governance Review record." (Inform Model)
2. Select member or AI Agent to review (Input Model)
3. Rating input (1–5 scale per dimension) (Input Model)
4. Comments input (Text Editor Model)
5. HUMAN-IN-THE-LOOP: Review summary. "Submit this review?" (Confirmation Model)
6. On YES: Log `meritocratic-review-completed` to `constitutional.events` with `constitutional_reference: "Article IV; Article VI §6.3"`, `material_impact: true`, `human_in_the_loop_confirmed: true`, `ai_governance_review_relevant: true`
```

---

#### `/sphere-onboarding` — REVISED (Enhanced Flow)

```markdown
---
name: sphere-onboarding
description: Your guided introduction to the Sphere — learn the Constitution, define your role, and get ready to contribute.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: false
constitutional-reference: "Article I; Article II; Preamble"
---

## Revised Flow (8 steps — constitutional education added)
1. Sphere Introduction: Name, Vision, Core Values (Simple Card Model)
2. Vision deep-dive: "Here is what your Sphere is working to achieve." (Inform Model)
3. Core Values display (Inform Model)
4. **[NEW] What is a Sphere?** — Brief introduction to the Sphere model, Heterarchy, and the Metacanon Constitution. "Intelligence is capacity, not command." (Inform Model — draws from `/what-is-a-sphere` content)
5. **[NEW] What is a Perspective Lens?** — "Your Perspective Lens is your constitutional role document. It defines your Vision, Territories, and Duties." (Inform Model — draws from `/my-lens` content)
6. Perspective Lens Builder (triggers `/build-perspective-lens`)
7. Mastermind Tools introduction (Inform Model)
8. Notifications setup (Input Model)
9. Congratulations (Congrats Model)
```

---

### 2.2 Revised Internal/Utility Skills

#### `simple-card` — REVISED HEADER

```markdown
---
name: simple-card
description: Internal reusable Simple Card model renderer.
user-invocable: false
command-dispatch: internal
---
```

#### `input-prompt` — REVISED HEADER

```markdown
---
name: input-prompt
description: Internal reusable Input model for collecting user text.
user-invocable: false
command-dispatch: internal
---
```

#### `confirmation` — REVISED HEADER

```markdown
---
name: confirmation
description: Internal reusable Confirmation dialog (yes/no decision point).
user-invocable: false
command-dispatch: internal
---
```

---

## PART III: NEW SKILLS

### 3.1 Governance-Critical New Skills

---

#### `/advice-process` — NEW

```markdown
---
name: advice-process
description: Initiate the Advice Process before any decision with Material Impact. Ensures proper consultation and prevents Authority Drift.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article V §2; Article VI §6.1"
db-schema:
  - table: constitutional_events
    event_type: advice-process-initiated
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Decision description input: "Describe the decision you are about to make." (Text Editor Model)
2. Impact assessment: "Who else in the Sphere might be affected by this decision?" (Add Item Model — select affected PLs)
3. System sends advice request to identified stakeholders (Inform Model to each)
4. Advice collection period (configurable: 24h default)
5. Advice summary presented to decision-maker (Inform Model)
6. HUMAN-IN-THE-LOOP: "Having reviewed all advice, confirm your final decision." (Text Editor Model + Confirmation Model)
7. Log `advice-process-completed` to `constitutional.events` with full advice record, `constitutional_reference: "Article V §2"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
```

---

#### `/vote` — NEW

```markdown
---
name: vote
description: Call a vote on any Sphere matter. Any Participating Member can initiate a vote at any time.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article V §3; Article VI §6.1, §6.2"
db-schema:
  - table: constitutional_events
    event_type: vote-initiated
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Vote subject input: "What is this vote about?" (Text Editor Model)
2. Vote options input (Add Item Model — minimum: Yes/No; custom options allowed)
3. Vote duration input (Input Model — default: 48h)
4. HUMAN-IN-THE-LOOP: "Publish this vote to all Sphere members?" (Confirmation Model)
5. On YES: Broadcast vote to all members (Inform Model to each)
6. Log `vote-initiated` to `constitutional.events` with `constitutional_reference: "Article V §3"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
7. On vote close: Tally results, log `vote-completed` with outcome, notify all members (Inform Model)
```

---

#### `/ai-governance-review` — NEW

```markdown
---
name: ai-governance-review
description: Conduct the Annual AI Governance Review — audit active AI Agents, review logs, assess Authority Drift, and propose amendments.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article IV; Article VI §6.3"
db-schema:
  - table: constitutional_events
    event_type: ai-governance-review-completed
    material_impact: true
    human_in_the_loop_confirmed: true
    ai_governance_review_relevant: true
---

## Flow
1. Introduction: "This is the Annual AI Governance Review mandated by Article VI, Section 6.3 of the Metacanon Constitution." (Inform Model)
2. List all active AI Contact Lenses in the Sphere (Simple Card Model for each)
3. For each AI Agent: display event log summary, Material Impact actions, HITL confirmation rate (Inform Model)
4. Authority Drift assessment: flag any AI Agent actions taken without HITL confirmation (Inform Model)
5. Amendment proposals input: "Based on this review, do you propose any changes to AI Agent governance?" (Text Editor Model)
6. HUMAN-IN-THE-LOOP: Review and confirm the full audit report (Review Model + Confirmation Model)
7. Log `ai-governance-review-completed` to `constitutional.events` with full audit record, `constitutional_reference: "Article VI §6.3"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
```

---

#### `/emergency-shutdown` — NEW

```markdown
---
name: emergency-shutdown
description: Immediately suspend an AI Agent's operations. Any Participating Member may invoke this. No appeal.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article III §3; Article VI §6.1"
db-schema:
  - table: constitutional_events
    event_type: emergency-shutdown-invoked
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Select AI Agent to suspend (Input Model — list of active AI Contact Lenses)
2. Reason input (Input Model — required for constitutional record)
3. HUMAN-IN-THE-LOOP: "EMERGENCY SHUTDOWN: Suspend [Agent Name] immediately? This action is immediate and final pending Prism Holder review." (Confirmation Model — high-urgency styling)
4. On YES: Immediately suspend AI Agent operations
5. Log `emergency-shutdown-invoked` to `constitutional.events` with reason, invoking member, `constitutional_reference: "Article III §3"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
6. Notify Prism Holder immediately (Inform Model)
7. Inform invoking member: "Shutdown complete. The Prism Holder has been notified." (Inform Model)
```

---

#### `/governance-meeting` — NEW

```markdown
---
name: governance-meeting
description: Schedule and document an official Governance Meeting, including the mandatory Annual AI Governance Review.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article IV; Article VI §6.3"
db-schema:
  - table: constitutional_events
    event_type: governance-meeting-held
    material_impact: true
    human_in_the_loop_confirmed: true
---

## Flow
1. Meeting date/time input (Input Model)
2. Agenda builder (Add Item Model — mandatory item: AI Governance Review)
3. Attendee list (drawn from Sphere members — AI Agents may NOT attend unless majority vote invites them, per Art. IV)
4. Meeting notes input (Text Editor Model)
5. AI Governance Review: trigger `/ai-governance-review` within meeting context
6. HUMAN-IN-THE-LOOP: Confirm and seal meeting record (Confirmation Model)
7. Log `governance-meeting-held` to `constitutional.events` with full agenda and notes, `constitutional_reference: "Article IV; Article VI §6.3"`, `material_impact: true`, `human_in_the_loop_confirmed: true`
```

---

### 3.2 Constitutional Accessibility New Skills

---

#### `/constitution` — NEW

```markdown
---
name: constitution
description: Access and navigate the full Metacanon Constitution — your Sphere's governing document.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: false
constitutional-reference: "Preamble; Article VI §6.2"
---

## Flow
1. Display Constitution table of contents: Preamble, Articles I–VI, Appendix A (Simple Card Model)
2. Section selection (Input Model)
3. Display selected section text (Inform Model — Web Viewer Model for full PDF)
4. Search within Constitution (Input Model → filtered display)
5. Note: "AI Agents may NOT interpret this Constitution. All interpretations require human judgment." (Inform Model — persistent footer)
```

---

#### `/glossary` — NEW

```markdown
---
name: glossary
description: Look up definitions for key Sphere and constitutional terms — your quick reference guide.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: false
constitutional-reference: "Preamble (Glossary)"
---

## Flow
1. Term search input (Input Model)
2. Display definition from Constitution Glossary (Inform Model)
3. Related terms and skills suggested (Inform Model)

## Key Terms Covered
Sphere, Perspective Lens, Contact Lens, AI Contact Lens, Advice Process, Material Impact, Human-in-the-Loop, Authority Drift, Heterarchy, Prism Holder, Cluster, Governance Meeting, Meritocratic Review, Fractaling Addendum, Vision, Territories, Duties
```

---

#### `/what-is-a-sphere` — NEW

```markdown
---
name: what-is-a-sphere
description: Learn what a Sphere is, how it works, and why it's different from a traditional organization.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: false
constitutional-reference: "Preamble; Article I"
---

## Flow
1. Introduction: "A Sphere is an entity — a business, church, non-profit, or community — formed to empower a group of people to collaborate in pursuit of a shared goal." (Inform Model)
2. The Heterarchy principle: "Unlike traditional hierarchies, a Sphere is unranked. Every member brings a unique Perspective Lens. Intelligence is capacity, not command." (Inform Model)
3. The Vision: "Every Sphere has a Vision — the shared goal it exists to achieve. Everything flows from the Vision." (Inform Model)
4. Next step suggestion: "Ready to explore your role? Try /my-lens or /glossary." (Inform Model)
```

---

#### `/my-lens` — NEW

```markdown
---
name: my-lens
description: View your Perspective Lens — your constitutional role document showing your vision, territories, and duties.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: false
constitutional-reference: "Article II"
---

## Flow
1. Retrieve current user's Perspective Lens from DB
2. Display: Vision, Territories, Duties, Support Structure, Policies (Simple Card + Inform Model)
3. If no Lens exists: "You haven't built your Perspective Lens yet. Try /build-perspective-lens." (Inform Model)
4. Edit option: "Want to update your Lens? Type /lens [your name] edit" (Inform Model)
```

---

### 3.3 Missing Spec Interactions

---

#### `/cancel-invite` — NEW

```markdown
---
name: cancel-invite
description: Cancel a pending membership invitation before it is accepted.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article III; Article VI §6.2"
db-schema:
  - table: constitutional_events
    event_type: invite-cancelled
  - table: constitutional.invites
    action: invalidate
---

## Flow
1. List pending invites (Inform Model)
2. Select invite to cancel (Input Model)
3. HUMAN-IN-THE-LOOP: "Cancel invite to [email]?" (Confirmation Model)
4. On YES: Invalidate invite code in `constitutional.invites`; log `invite-cancelled` to `constitutional.events`
```

---

#### `/decline` — NEW

```markdown
---
name: decline
description: Decline an invitation to join a Sphere, with an optional reason.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: false
constitutional-reference: "Article III"
db-schema:
  - table: constitutional_events
    event_type: invite-declined
---

## Flow
1. Display Sphere invitation details (Simple Card Model)
2. Reason input (Input Model — optional)
3. Log `invite-declined` to `constitutional.events` with reason
4. Inform: "You have declined the invitation to [Sphere Name]." (Inform Model)
```

---

### 3.4 System/Infrastructure New Skills

---

#### `/governance-report` — NEW

```markdown
---
name: governance-report
description: Generate a governance report for your Sphere — AI Agent activity, constitutional compliance, and Authority Drift assessment.
user-invocable: true
command-dispatch: auto
commands:
  nativeSkills: "auto"
human-in-the-loop: true
constitutional-reference: "Article VI §6.3"
---

## Flow
1. Scope selection: This Sphere / All Spheres / Specific time range (Input Model)
2. Query `constitutional_events` for: AI Agent actions, Material Impact events, HITL confirmation rate, Authority Drift flags
3. Generate report summary (Inform Model)
4. Export option: Download as PDF/CSV (Web Viewer Model)
5. Log `governance-report-generated` to `constitutional.events`
```

---

#### `constitutional-event-logger` — NEW (Internal Utility)

```markdown
---
name: constitutional-event-logger
description: Internal utility for standardized constitutional event logging. Ensures all events include actor, timestamp, constitutional reference, material impact flag, and HITL confirmation status.
user-invocable: false
command-dispatch: internal
constitutional-reference: "Article VI §6.2; Preamble"
---

## Standard Log Payload
{
  event_id: UUID,
  timestamp: TIMESTAMPTZ,
  actor_id: UUID,
  actor_type: "human" | "ai_agent",
  sphere_id: UUID,
  event_type: string,
  constitutional_reference: string,
  material_impact: boolean,
  human_in_the_loop_confirmed: boolean,
  event_details: JSONB,
  audit_trail: JSONB
}
```

---

#### `human-in-the-loop-confirmation` — NEW (Internal Utility)

```markdown
---
name: human-in-the-loop-confirmation
description: Internal utility for standardized Human-in-the-Loop confirmation steps. All Material Impact actions must route through this skill before execution.
user-invocable: false
command-dispatch: internal
constitutional-reference: "Article VI §6.1"
---

## Behavior
- Presents a Confirmation Model with the action summary
- Blocks execution until explicit human YES/NO
- On YES: returns confirmation token to calling skill
- On NO: cancels action, logs `action-cancelled` to constitutional.events
- Timeout (default 5 min): cancels action, logs `action-timed-out`
```

---

#### `advice-process-enforcer` — NEW (Internal Utility)

```markdown
---
name: advice-process-enforcer
description: Internal utility that enforces the Advice Process before any Material Impact decision. Invoked automatically by skills with material_impact: true.
user-invocable: false
command-dispatch: internal
constitutional-reference: "Article V §2; Article VI §6.1"
---

## Behavior
- Checks if the action has material_impact: true
- If yes: triggers `/advice-process` flow before allowing execution
- Logs `advice-process-enforced` to constitutional.events
```

---

## PART IV: PROPOSED `constitutional.events` SCHEMA

The following PostgreSQL schema is proposed by the **Systems Scaler** to support the Annual AI Governance Review (Art. VI §6.3) and all constitutional logging requirements:

```sql
CREATE TABLE constitutional_events (
    event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id          UUID NOT NULL,
    actor_type        TEXT NOT NULL CHECK (actor_type IN ('human', 'ai_agent')),
    sphere_id         UUID NOT NULL,
    event_type        TEXT NOT NULL,
    constitutional_reference TEXT,
    material_impact   BOOLEAN NOT NULL DEFAULT FALSE,
    human_in_the_loop_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    ai_governance_review_relevant BOOLEAN NOT NULL DEFAULT FALSE,
    event_details     JSONB,
    audit_trail       JSONB
);

CREATE INDEX idx_ce_timestamp    ON constitutional_events (timestamp);
CREATE INDEX idx_ce_actor_id     ON constitutional_events (actor_id);
CREATE INDEX idx_ce_sphere_id    ON constitutional_events (sphere_id);
CREATE INDEX idx_ce_event_type   ON constitutional_events (event_type);
CREATE INDEX idx_ce_material     ON constitutional_events (material_impact) WHERE material_impact = TRUE;
CREATE INDEX idx_ce_ai_review    ON constitutional_events (ai_governance_review_relevant) WHERE ai_governance_review_relevant = TRUE;
```

**Key design decisions:**
- `actor_type` distinguishes human vs. AI Agent actions for Authority Drift auditing
- `material_impact` + `human_in_the_loop_confirmed` enable compliance checking
- `ai_governance_review_relevant` flags events for the Annual Review query
- Partial indexes on `material_impact` and `ai_governance_review_relevant` optimize governance report queries
- `JSONB` fields allow flexible event-specific data without schema migrations

---

## PART V: DEPLOYMENT GUIDE

### Phase 1 — Foundation (Deploy First)

These must exist before any other skills can function correctly:

1. Deploy `constitutional.events` schema (SQL above)
2. Deploy `constitutional-event-logger` (internal utility)
3. Deploy `human-in-the-loop-confirmation` (internal utility)
4. Deploy `advice-process-enforcer` (internal utility)

### Phase 2 — Core Governance Skills

5. Deploy `/advice-process`
6. Deploy `/vote`
7. Deploy `/emergency-shutdown`
8. Deploy `/ai-governance-review`
9. Deploy `/governance-meeting`

### Phase 3 — Constitutional Accessibility Skills

10. Deploy `/constitution`
11. Deploy `/glossary`
12. Deploy `/what-is-a-sphere`
13. Deploy `/my-lens`

### Phase 4 — Revised Core Sphere Skills

14. Deploy revised `/create-sphere`
15. Deploy revised `/join-sphere`
16. Deploy revised `/sphere-onboarding` (enhanced flow)
17. Deploy revised `/leave-sphere`
18. Deploy revised `/invite-member`
19. Deploy revised `/remove-member`
20. Deploy revised `/build-perspective-lens`
21. Deploy revised `/meritocratic-review`
22. Deploy revised `/lens`

### Phase 5 — Missing Spec Interactions

23. Deploy `/cancel-invite`
24. Deploy `/decline`

### Phase 6 — System/Reporting Skills

25. Deploy `/governance-report`

### Phase 7 — Remaining Existing Skills (Revised Headers)

26–37. Deploy all remaining existing skills with revised headers (model annotations, error-handling, timeout, db-schema references)

---

### Testing Checklist

- [ ] All Material Impact skills trigger `human-in-the-loop-confirmation` before execution
- [ ] All events logged to `constitutional_events` include `constitutional_reference` field
- [ ] `/ai-governance-review` successfully queries `ai_governance_review_relevant = TRUE` events
- [ ] `/advice-process` blocks Material Impact actions until advice period completes
- [ ] `/emergency-shutdown` immediately suspends target AI Agent and notifies Prism Holder
- [ ] `/vote` broadcasts to all Sphere members and tallies results on close
- [ ] `/constitution` displays all Articles and Appendix A; includes interpretive boundary notice
- [ ] `/sphere-onboarding` includes constitutional education steps before Perspective Lens builder
- [ ] `constitutional-event-logger` is invoked by all Material Impact skills
- [ ] Internal skills (`simple-card`, `input-prompt`, `confirmation`, `constitutional-event-logger`, `human-in-the-loop-confirmation`, `advice-process-enforcer`) are NOT visible in the Telegram slash menu

---

## PART VI: CONSTITUTIONAL COMPLIANCE STATEMENT

The revised skill set, as specified in this report, meets the following requirements of the Metacanon Constitution v3.0:

| Requirement | Article/Section | Status |
|---|---|---|
| Non-Sovereignty of AI Agents | Art. VI | Met — all skills are instruments, not decision-makers |
| Instrumental Role | Art. VI | Met — skills provide data, options, and flows; humans decide |
| Human-in-the-Loop for Material Impact | Art. VI §6.1 | Met — standardized via `human-in-the-loop-confirmation` utility |
| Transparency / Constitutional Logging | Art. VI §6.2 | Met — standardized via `constitutional-event-logger` utility |
| Annual AI Governance Review | Art. VI §6.3 | Met — `/ai-governance-review` + schema `ai_governance_review_relevant` field |
| Interpretive Boundaries | Preamble + Art. VI | Met — `/constitution` includes explicit interpretive boundary notice |
| Advice Process for Material Impact | Art. V §2 | Met — `/advice-process` + `advice-process-enforcer` utility |
| Vote mechanism | Art. V §3 | Met — `/vote` skill |
| Governance Meetings (annual minimum) | Art. IV | Met — `/governance-meeting` skill |
| Emergency Shutdown | Art. III §3 | Met — `/emergency-shutdown` skill |
| AI Contact Lens requirements | Appendix A | Met — `/build-perspective-lens` enforces Appendix A template |
| Prism Holder unilateral AI firing authority | Art. III §3 | Met — noted in `/remove-member` and `/emergency-shutdown` |
| Authority Drift prevention | Art. VI | Met — `actor_type` field + `/ai-governance-review` audit |

---

## PART VII: COMPLETE REVISED SKILL INVENTORY

### Existing Skills (25) — Status After Revision

| Skill | Status | Key Change |
|---|---|---|
| `create-sphere` | Revised | HITL + constitutional citation + model annotations |
| `join-sphere` | Revised | HITL + constitutional citation + model annotations |
| `sphere-onboarding` | Revised | Added constitutional education steps (steps 4–5) |
| `leave-sphere` | Revised | HITL + constitutional citation |
| `invite-member` | Revised | HITL + constitutional citation |
| `manage-members` | Revised header | Model annotations + error-handling + timeout |
| `member-profile` | Revised header | Model annotations + error-handling |
| `remove-member` | Revised | HITL + Prism Holder authority clause + constitutional citation |
| `simple-card` | Revised header | `user-invocable: false`, `command-dispatch: internal` |
| `input-prompt` | Revised header | `user-invocable: false`, `command-dispatch: internal` |
| `confirmation` | Revised header | `user-invocable: false`, `command-dispatch: internal` |
| `upload-image` | Revised header | Model annotations + error-handling + timeout |
| `text-edit` | Revised header | Model annotations + error-handling |
| `review` | Revised header | HITL + constitutional citation + model annotations |
| `web-view` | Revised header | Error-handling + timeout |
| `search` | Revised header | Scaling note + error-handling |
| `help-topic` | Revised header | Model annotations |
| `congrats` | Revised header | Model annotations |
| `build-perspective-lens` | Revised | HITL + Appendix A enforcement + constitutional citation |
| `meritocratic-review` | Revised | HITL + `ai_governance_review_relevant` flag + constitutional citation |
| `lens` | Revised | HITL for edit mode + constitutional citation |
| `dashboard` | Revised header | Model annotations |
| `newsfeed` | Revised header | Model annotations |
| `connect-social` | Revised | HITL + constitutional citation |
| `add-item` | Revised header | Model annotations |

### New Skills (14) — Added by Council

| Skill | Type | Constitutional Basis |
|---|---|---|
| `/advice-process` | User-invocable | Art. V §2 |
| `/vote` | User-invocable | Art. V §3 |
| `/ai-governance-review` | User-invocable | Art. VI §6.3 |
| `/emergency-shutdown` | User-invocable | Art. III §3 |
| `/governance-meeting` | User-invocable | Art. IV |
| `/constitution` | User-invocable | Preamble + Art. VI §6.2 |
| `/glossary` | User-invocable | Preamble (Glossary) |
| `/what-is-a-sphere` | User-invocable | Art. I |
| `/my-lens` | User-invocable | Art. II |
| `/cancel-invite` | User-invocable | Art. III; MasterSpecDoc |
| `/decline` | User-invocable | Art. III; MasterSpecDoc |
| `/governance-report` | User-invocable | Art. VI §6.3 |
| `constitutional-event-logger` | Internal utility | Art. VI §6.2 |
| `human-in-the-loop-confirmation` | Internal utility | Art. VI §6.1 |
| `advice-process-enforcer` | Internal utility | Art. V §2 |

**Total Revised Skill Set: 25 existing (revised) + 15 new = 40 skills**

---

*This report was produced by the Scale Architecture Council under the Metacanon Constitution v3.0. All findings are advisory and non-sovereign. All final decisions regarding implementation rest with the human Prism Holder. This document does not constitute an interpretation of the Constitution; it is a set of implementation proposals for human review and approval.*
