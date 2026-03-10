# Obsidian Project: Architectural Decision Record (ADR-004)

**Date**: March 04, 2026
**Status**: Active & Authoritative

## 1. Context

This ADR is the final, authoritative source of truth for all architectural decisions for the Obsidian project. It is based exclusively on the `obsidian-implementation-spec-v1.md` and formally supersedes all previous ADRs (ADR-002, ADR-003) and handoff documents. All development must adhere to the decisions codified herein.

## 2. Decisions

### 2.1. Governance & Document Precedence

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | **Document Precedence:** What is the single source of truth? | The `obsidian-implementation-spec-v1.md` is the single, authoritative source of truth for all implementation details. This ADR serves as the formal record of its key decisions. In any conflict, the v1 spec wins. |

### 2.2. Core Architecture

| # | Area | Decision |
| :--- | :--- | :--- |
| 2 | **Compute Stack:** What is the compute architecture? | The system will implement a pluggable compute stack with six providers: `Qwen` (default local), `Ollama`, `Morpheus`, `OpenAI`, `Anthropic`, and `Moonshot Kimi`. The architecture must support a global default provider and per-deliberation overrides. |
| 3 | **Reliability:** What is the provider failure policy? | A multi-stage automatic fallback policy is mandatory. On failure, the system must attempt this sequence: **Active Provider -> Local (Qwen -> Ollama) -> Cloud (user-defined priority)**. |
| 4 | **Observability:** What is the logging model? | A cross-platform, dual-tier logging system with a 90-day retention policy is required. This includes a full, encrypted local event stream and a redacted, plaintext-safe graph feed for future UI integration. |
| 5 | **Secrets Management:** How are secrets stored? | The system must support both **OS keychain** (preferred default) and an **encrypted local config file**. The user can configure the mode (`KeychainOnly`, `EncryptedFileOnly`, `DualWrite`). |

### 2.3. Scope & Data Model

| # | Area | Decision |
| :--- | :--- | :--- |
| 6 | **MVP Scope:** Are Task Sub-Spheres in scope? | **No.** The Task Sub-Sphere, SpecialistLens, tool registry, and Lens Library are explicitly **out of scope** for this implementation phase. |
| 7 | **Forward-Compatibility:** How is future compatibility handled? | The `SoulFile` data model **must** include the `future_sub_sphere_registry`, `future_lens_library_manifest`, and `extensions` fields, populated with default/empty values. This ensures the MVP is forward-compatible with future features without requiring a breaking schema change. |

### 2.4. Constitutional Invariants

| # | Invariant | Statement |
| :--- | :--- | :--- |
| 8 | **Sovereignty is Irreducible** | The user (PL) is always the ultimate authority. |
| 9 | **Delegations are Revocable** | Every agent delegation must be tied to a `revocation_token`. |
| 10 | **AI Cannot Rate Humans** | The `MeritMetrics` system is strictly for agent-to-agent peer review. |
| 11 | **Actions Must Be Validated** | All agent actions must be validated against the user's `WillVector`. |
| 12 | **Federations are Bounded** | A `FractalSeed` federation must contain between 2 and 7 users. |
| 13 | **The Ledger is Append-Only** | The `MerkleDAG` is immutable. |
| 14 | **No Self-Rating** | An agent cannot rate itself in the `MeritMetrics` system. |
| 15 | **Helios: Pre-Validation Mandate** | A network request must not be initiated until `validate_action()` has succeeded. |
| 16 | **Helios: Encryption Mandate** | All external data payloads must be `FheCiphertext`. |
| 17 | **Helios: Private Key Locality** | The `FhePrivateKey` must never be serialized or leave the local device. |

## 3. Consequences

These decisions, derived directly from the v1 implementation spec, provide a complete and unambiguous blueprint for development. The project is now fully specified, and the development team (human or AI) has a clear and authoritative plan to execute.
