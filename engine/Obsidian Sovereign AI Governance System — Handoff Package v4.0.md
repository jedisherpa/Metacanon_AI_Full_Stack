# Obsidian Sovereign AI Governance System — Handoff Package v4.0

## How to Use This Package

### For the Coding Team

Start with `OBSIDIAN_HANDOFF_FINAL_v4.md` — this is the complete technical specification. It contains all Rust code, test suites, constitutional grounding, and implementation order for all 4 sprints.

### For Codex (Autonomous AI Coding)

1. Read `scaffold/AGENTS.md` first — it is the entry point map
2. Then read `scaffold/Prompt.md`, `scaffold/Plan.md`, `scaffold/Implement.md` in order
3. Use `scaffold/Documentation.md` as your live status log throughout the build
4. Reference `docs/` for design decisions, constitutional invariants, and tech guides
5. Start with Sprint 0, Milestone 0.1. Follow the operating loop in `Implement.md` exactly.

---

## Key Terminology (v4.0)

| Term | Meaning |
|---|---|
| **Perspective Lens (PL)** | Human sovereign — initiates Genesis Rite, holds SoulFile |
| **Contact Lens (CL)** | AI agent serving PL directly (Synthesis, Monitoring, Auditor) |
| **Perspective Contact Lens (PCL)** | AI specialist in a Contact Sub-Sphere team |
| **Contact Sub-Sphere** | One-PL structure staffed by PCLs for task execution |
| **SoulFacet** | Internal perspective facet of the human PL (was: `PerspectiveLens` struct in v3) |

---

## What Changed in v4.0 vs v3.0

The following targeted changes were applied by Grok-4-0709 to each section:

1. `PerspectiveLens` struct renamed to `SoulFacet` — eliminates collision with PL terminology
2. `TensegrityTetrahedron` generalized from 3 fixed stubs to `spawned_lens_hashes: Vec<SpawnedLensRecord>`
3. `LensKind` enum added: `ContactLens | PerspectiveContactLens`
4. `PerspectiveDefinition` struct added — required for PCL spawn signatures
5. `ContactLensType::Specialist { role_name }` variant added to enum
6. `perspective_definition: Option<PerspectiveDefinition>` added to ContactLens struct
7. FractalSeed `pl_ids` clarified as human-PL-only throughout all sections
8. Contact Sub-Sphere vs FractalSeed federation distinction clarified throughout
9. Two new Runtime Invariants added (Invariants 6 and 7)
10. Two new "What NOT to Change" rules added

All other content — constitutional governance machinery, WillVector, Ratchet, Oath-Echo, MeritMetrics, cryptographic chain, sprint structure, file structure, Cargo.toml — is unchanged from v3.0.

---

## File Structure

```
obsidian-handoff-v4/
├── README.md                              ← This file
├── OBSIDIAN_HANDOFF_FINAL_v4.md           ← Complete technical specification (1,885 lines)
├── scaffold/
│   ├── AGENTS.md                          ← Codex entry point (read first)
│   ├── Prompt.md                          ← Frozen spec for Codex
│   ├── Plan.md                            ← 18 milestones with acceptance criteria
│   ├── Implement.md                       ← Operational runbook for Codex
│   └── Documentation.md                   ← Live status log template
└── docs/
    ├── design-docs/
    │   ├── index.md                       ← Architecture overview and domain map
    │   ├── core-beliefs.md                ← 7 constitutional beliefs with code examples
    │   └── constitutional-invariants.md   ← 7 runtime invariants with Rust verification
    ├── product-specs/
    │   ├── genesis-rite-ux.md             ← UX spec for the Genesis Rite
    │   ├── user-interaction-spec.md       ← How users talk to Contact Lenses
    │   └── task-sub-sphere-spec.md        ← Contact Sub-Sphere / PCL full spec
    ├── references/
    │   ├── rust-crypto-guide.md           ← Rust crypto patterns (blake3, ed25519, etc.)
    │   ├── wasmtime-guide.md              ← Wasmtime sandboxing patterns
    │   └── tauri-guide.md                 ← Tauri desktop app patterns
    └── exec-plans/
        └── active/
            └── sprint0-execution-plan.md  ← Step-by-step Sprint 0 execution plan
```

---

## Projected Codex Sufficiency Score

With this package, the projected autonomous Codex success rate is **9/10** (up from 4/10 with the original handoff alone). The remaining 1/10 is custom Rust linters and CI config — not blockers for Sprints 0-1.
