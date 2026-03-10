# Gap Analysis & Remediation Plan

**Author:** Manus AI
**Date:** February 25, 2026
**Status:** For Review

---

## 1. Executive Summary

This document provides a comprehensive gap analysis between the current codebase (as of the `CODEX_FULL_REPO_SOURCE_EXPORT.md` and `CODEX_SPHERE_THREAD_CODE_EXPORT.md` snapshots) and the definitive **Sphere Thread Model v3.0 Build Specification**. 

The analysis reveals that the current implementation is a **prototype-level system** that validates several high-level concepts but **diverges significantly** from the hardened, production-ready architecture defined in the v3.0 spec. The existing codebase is a Node.js/TypeScript application built around a Telegram Mini App (TMA) frontend, with a focus on user-facing features for governance and deliberation. It is **not** the Go-based, gRPC-first, security-hardened protocol engine specified.

**The core remediation recommendation is a strategic pivot:** Treat the existing Node.js application as a valuable **Reference Implementation** and **first client**, but begin a **greenfield build** of the core Sphere Thread protocol engine in Go, adhering strictly to the v3.0 specification. The Node.js app will eventually communicate with the new Go service via its gRPC API, becoming the first consumer of the official protocol.

## 2. High-Level Architectural Gaps

| Spec v3.0 Component | Current Implementation | Gap & Risk Assessment |
| :--- | :--- | :--- |
| **Language/Stack** | Go | Node.js / TypeScript | **Critical.** The spec mandates Go for its performance, concurrency, and static typing, which are essential for a high-throughput, low-latency protocol engine. Node.js is unsuitable for this core infrastructure layer. |
| **API Protocol** | gRPC | RESTful HTTP | **Critical.** The spec mandates gRPC for its performance, streaming capabilities, and strongly-typed interface definition. The current REST API is a significant deviation and lacks the required performance and schema enforcement. |
| **Database** | PostgreSQL | PostgreSQL | **Alignment.** The current implementation correctly uses PostgreSQL. However, the schema is different and lacks the core `events` table structure. |
| **Identity** | `did:key` | None | **Critical.** The current system has no concept of decentralized identity. Agents are identified by simple strings (`agentDid`). This is a major security and auditability gap. |
| **Cryptography** | EdDSA / JCS / Vault | None | **Critical.** There is no cryptographic signing, verification, or canonicalization in the current codebase. This is the single largest gap and means the system has no integrity or non-repudiation guarantees. |
| **Governance** | Sovereign with Counsel | Ad-hoc voting logic | **High.** The current system has `sphere_votes` and `vote_choices` tables, but the logic does not implement the formal "Sovereign with Counsel" protocol, quorum rules, or dissent logging specified. |

## 3. Detailed Component-Level Gap Analysis

### 3.1. Conductor Service

*   **Spec:** A stateless Go service with a `SubmitMessage` gRPC endpoint.
*   **Implementation:** A TypeScript class `SphereConductor` that appears to manage threads in-memory or via a simple DB lookup. It does not implement the gRPC interface or the transactional logic specified.
*   **Gap:** The entire service is missing. The current `SphereConductor` is a placeholder.

### 3.2. Data Models & Schemas

*   **Spec:** `LogEntry`, `ClientEnvelope`, `LedgerEnvelope` with JCS canonicalization and JWS signatures.
*   **Implementation:** Ad-hoc TypeScript types. No `ClientEnvelope` or `LedgerEnvelope`. No signing. The `governance_events` table is a simple audit log, not an immutable, hash-chained event store.
*   **Gap:** The core data structures that guarantee immutability and auditability are completely absent.

### 3.3. PostgreSQL Spine

*   **Spec:** A single `events` table with a `BIGSERIAL` primary key, acting as an event store.
*   **Implementation:** Multiple tables (`user_profiles`, `sphere_votes`, `vote_choices`, `governance_events`) designed for a traditional application, not an event-sourced system.
*   **Gap:** The fundamental event-sourcing model is not implemented. The current schema cannot support the hash-chaining and immutable log requirements.

### 3.4. HALT Contract & Privacy

*   **Spec:** VC-based authorization for HALT, 3-tier privacy model, HMAC redaction.
*   **Implementation:** A `haltAllSchema` exists, but it relies on simple string roles (`actorRole`) and an optional `emergencyCredential` string. There is no VC validation, no state machine, and no privacy model.
*   - **Gap:** The security and safety mechanisms for halting and privacy are non-existent.

### 3.5. Human Oversight Ports

*   **Spec:** Dedicated Observability (SSE) and Intervention (REST) ports.
*   **Implementation:** A WebSocket-based system (`ws/hub.js`) for pushing game and deliberation events to the frontend. 
*   **Gap:** The specified read-only, resumable, and audited human oversight ports are not implemented. The WebSocket implementation is for application-level notifications, not protocol-level observability.

## 4. Remediation Plan

The path forward involves a two-track strategy: **Build** the new core engine and **Adapt** the existing application.

### Track 1: Build the Sphere Thread Protocol Engine (Greenfield)

This is the main effort and should be staffed with the 5-person engineering team outlined in the build estimation. The team will ignore the existing Node.js codebase and build directly from the v3.0 specification.

**Phase 1 (3 Months): The Spine**

1.  **Setup:** Establish the Go monorepo, CI/CD pipeline, and PostgreSQL instance.
2.  **Data Models:** Implement the Go structs for `LogEntry`, `ClientEnvelope`, and `LedgerEnvelope`.
3.  **Database:** Implement the `events` table schema in PostgreSQL.
4.  **Cryptography:** Implement the JCS canonicalization and EdDSA signing/verification logic using a Go crypto library. Integrate with HashiCorp Vault for key management.
5.  **Conductor v1:** Build the `SubmitMessage` gRPC endpoint. Implement the full transactional logic for validation, signing, and inserting into the `events` table.
6.  **Governance v1:** Implement the `governance.yaml` loading and the core "Sovereign with Counsel" quorum check within the `SubmitMessage` handler.

**Phase 2 (6 Months): The Fabric**

1.  **HALT Contract:** Implement the full HALT state machine and VC-based authorization logic.
2.  **Observability Port:** Build the SSE streaming service that reads from the PostgreSQL `events` table (using logical replication or polling).
3.  **Intervention Port:** Build the audited REST API for privileged human actions.
4.  **Adapters:** Begin design and implementation of the A2A and MCP adapters as separate services.

### Track 2: Adapt the LensForge TMA Application (Maintenance & Integration)

One engineer from the existing team can be tasked with maintaining the current Node.js application and preparing it for integration.

1.  **API Client Refactor:** Abstract all data access in the TMA into a single API client module.
2.  **gRPC Integration:** Once the Go Conductor's gRPC API is stable, replace the internal API calls in the Node.js backend with calls to the new gRPC service. The Node.js app becomes a client of the Sphere Thread protocol.
3.  **Deprecation:** Gradually deprecate the ad-hoc governance and event tables (`sphere_votes`, `governance_events`) in favor of reading from the official `events` log via the Observability Port.

This two-track approach allows for rapid development of the correct, production-grade core protocol while preserving the valuable UI/UX work and domain logic of the existing application. The end state is a robust, secure, and spec-compliant system with the TMA as its first and most feature-rich client.
