# LensForge C2 — The Unified Build Plan v3.2

**Authored by:** Manus AI (Synthesized from v3.0 + Commander Feedback + v3.2 Delta)

**Version:** 3.2 (Safety and Operability Hardened)

**Date:** February 25, 2026

---

## 1. Executive Summary: From Plan to Playbook

This v3.2 document hardens the v3.1 build plan into a developer-ready playbook with normative safety and operability controls. The 14-day, three-track pipeline remains, but gates, fallback behavior, governance policy surfaces, and rollback constraints are now explicit and enforceable.

## 2. The Governance-to-Code Pipeline v3.2

### Track A: The Governance Track (Days 1-7)

**Objective:** Define the rules of engagement before automating them.

| Day | Task | Deliverable & Gate Criteria |
|---|---|---|
| **0** | **Define Contact Lens JSON Schema** | `governance/contact_lens_schema.json` created and committed. |
| 1-3 | **Contact Lens Workshop** | 12 `governance/contact_lenses/{agent_did}.json` files created. **Gate:** All 12 files validate against schema. |
| 4-6 | **Manual Mission Runs (x3)** | 3 `governance/incident_reports/mission_{n}.md` files created, each with completed Mission Quality Scorecard. |
| 7 | **Synthesis & Sign-off Session** | `governance/synthesis_report.md` created. **Governance Sign-off Gate:** Prism Holder signs off. |

### Track B: The Build Track (Days 1-5, parallel)

**Objective:** Build a fully functional local system for use in the manual mission runs.

| Day | Task | File Targets |
|---|---|---|
| 1 | Core Backend & Kill Switch | `engine/package.json`, `engine/src/sphere/didRegistry.ts`, `engine/src/sphere/conductor.ts` (with `haltAllThreads`), `engine/src/api/v1/c2Routes.ts`, `engine/src/agents/missionService.ts`, `drizzle/0004_sphere_thread_model.sql` |
| 2 | Telegram Bot & High-Risk Registry | `engine/src/bot/client.ts`, `engine/src/bot/builtinCommands.ts`, `governance/high_risk_intent_registry.json` |
| 3 | War Room TMA | `tma/src/pages/WarRoom.tsx`, `tma/src/components/ThreadObservabilityPanel.tsx`, `tma/src/components/DispatchModal.tsx` |
| 4 | Contact Lens Enforcement Engine | `engine/src/governance/contactLensValidator.ts`, `engine/src/sphere/conductor.ts` (loads lenses from canonical source) |
| 5 | Full Local System Test | All of the above running locally. **Local Readiness Gate:** Commander signs off on local readiness. |

### Track C: The Deploy Track (Days 8-16, gated)

**Entry Condition:** Governance Sign-off Gate and Local Readiness Gate both passed.

| Day | Task | Deliverable & Gate Criteria |
|---|---|---|
| 8-9 | **Encode & Integrate Contact Lenses** | `engine/src/sphere/conductor.ts` updated with final validation logic. **Gate:** Validator unit tests pass. |
| 10 | **Deploy to Staging** | Staging environment live. |
| 11 | **Staging Soak & Validation** | Run 3 staging missions with Constitutional Observer. **Gate:** Zero constitutional violations. |
| 12 | **Production Readiness Review** | `deploy/OPERATIONAL_READINESS.md` completed and signed. **Staging->Production Gate:** Prism Holder + Commander sign-off. |
| 13 | **Deploy to Production** | Production live. **Gate:** Rollback plan documented, tested, and ready. |
| 14 | **Production Validation** | Run 3 production missions with Constitutional Observer. **Gate:** Zero constitutional violations. |
| 15-16 | **Schedule Buffer** | Reserved for unforeseen issues. |

## 3. Hardened Governance & Operational Gates

### Canonical Source of Truth

- The single source of truth for Contact Lenses is `governance/contact_lenses/`.
- Governance policy files MUST live under `governance/` as canonical sources, including `governance/high_risk_intent_registry.json`.
- Runtime code in `engine/src/governance/*` MUST load policy from `governance/` and MUST NOT maintain duplicated policy copies.
- On startup, the engine MUST log loaded policy versions/checksums for auditability.

### High-Risk Intent Registry

- `governance/high_risk_intent_registry.json` explicitly lists all Material Impact intents.
- The Conductor requires Prism Holder approval for intents listed in `prismHolderApprovalRequired`.
- `EMERGENCY_SHUTDOWN` is break-glass and MUST remain executable during degraded consensus with strict audit controls.

### Gate Approvers & Criteria

- **Governance Sign-off Gate:** Prism Holder signs `governance/synthesis_report.md`.
- **Local Readiness Gate:** Commander signs local system readiness at Day 5.
- **Staging->Production Gate:** Prism Holder and Commander sign `deploy/OPERATIONAL_READINESS.md`.
- Track B runs in parallel from Day 1 and is not blocked by Track A start.
- Track C cannot begin until Governance Sign-off Gate and Local Readiness Gate both pass.

### Fallback & Rollback

- **Constitutional Observer Fallback:** If primary observer is unavailable, designated secondary observer must be present. If neither is available, production validation is postponed.
- **Kimi Outage Policy:** `fallback: "stub"` is allowed in `local` and `staging` only, and MUST be disabled in `production`.
- **Production LLM Outage Behavior:** If LLM is unavailable in production, Conductor enters `DEGRADED_NO_LLM`; model-dependent mission execution intents are rejected, observability/status/halt remain available, and affected missions are marked `degraded: true` with explicit outage reason.
- **Rollback Trigger:** Rollback is triggered within 24 hours of deployment for any of: P0 bug, constitutional violation, or downtime > 15 minutes. Lead Developer can execute rollback.

## 4. New Artifacts in v3.2

1. `governance/contact_lens_schema.json`: JSON schema for all Contact Lenses.
2. `governance/high_risk_intent_registry.json`: Explicit list of Material Impact intents.
3. `governance/mission_quality_scorecard.md`: Template for mission quality and compliance evaluation.
4. `deploy/OPERATIONAL_READINESS.md`: Checklist for monitoring, alerting, backup, rollback, and secrets rotation.

## 5. v3.2 Delta: Safety and Operability Hardening (Normative)

### 5.1 Break-Glass Kill Switch Semantics

- `EMERGENCY_SHUTDOWN` MUST remain executable during degraded consensus.
- `EMERGENCY_SHUTDOWN` MUST NOT appear in `degradedConsensusBlockedIntents`.
- In degraded consensus, `EMERGENCY_SHUTDOWN` MUST require break-glass controls:
  - Authorized role (`Prism Holder` or `Commander`).
  - Dual-control confirmation OR pre-approved emergency credential.
  - Mandatory audit log entry with reason, actor DID, confirmer DID (if dual-control), and timestamp.
- If break-glass authorization fails, command MUST be rejected.

### 5.2 Kimi/LLM Outage Policy

- `fallback: "stub"` mode is permitted in `local` and `staging` only.
- `fallback: "stub"` MUST be disabled in `production`.
- If LLM is unavailable in `production`, Conductor MUST enter `DEGRADED_NO_LLM` behavior.
- Production mission outputs MUST never be synthesized from canned stub content.

### 5.3 Mission Success Criteria

Mission success requires both:
- Score >= 18/25
- Constitutional Compliance Result = `PASS`

Hard-fail rules:
- Any unchecked/failed compliance checklist item => `FAIL`
- Any material-impact mission without required Prism Holder approval => `FAIL`

### 5.4 Database Deployment and Rollback Safety

- Deployments MUST use expand/contract migration strategy for schema changes.
- Before production deploy: fresh DB backup + successful restore test to non-production.
- Rollback runbook MUST include application rollback and DB compatibility decision path.
- No production deploy without verified restore timestamp within last 24 hours.

---

This v3.2 plan is implementation-ready with explicit safety constraints and operational guardrails.
