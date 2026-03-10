# Pre-Build Decision Record (PBDR)

**Date:** February 25, 2026
**Status:** Authoritative & Binding

> This document provides definitive answers to the 20 pre-build questions raised during the v2.0 spec review. These decisions are binding for the Phase 1 implementation. All answers are reflected in the accompanying **Engineer's Build Specification v2.1**.

---

### 1. MVP Scope & Phasing

*   **Decision:** Phase 1 MVP includes the **Conductor + PostgreSQL spine ONLY**. The A2A Adapter, MCP Adapter, Observability Port, and Intervention Port are **Phase 2**. The core must be stable before we build on top of it.

### 2. Canonical Source for Unchanged Sections

*   **Decision:** The canonical source for all sections is the **Engineer's Build Specification v1.4**. The v2.1 document is a clean, complete version that integrates the v2.0 strategic changes with the stable v1.4 baseline.

### 3. Non-Functional Targets (Phase 1)

*   **Decision:**
    *   **Throughput:** 500 writes/sec
    *   **Latency (p95 `SubmitMessage`):** 150ms
    *   **Latency (p99 `SubmitMessage`):** 300ms
    *   **Max Thread Size:** Unbounded (logically)
    *   **Retention Period:** 7 years (active), forever (archived)
    *   **RPO:** 0 (synchronous replication)
    *   **RTO:** 2 hours (disaster recovery from backup)

### 4. Deployment Target & Consistency

*   **Decision:** Phase 1 is **single-region**. PostgreSQL will be deployed in a high-availability configuration (e.g., Amazon RDS with Multi-AZ). The Conductor service will be active-passive across availability zones. True active-active multi-region is a Phase 3 goal.

### 5. Read-After-Write Consistency

*   **Decision:** **Strict read-after-write consistency** is required for the Conductor's gRPC API. The Observability Port is explicitly **eventually consistent**.

### 6. Governance Configuration

*   **Decision:**
    *   **Material-Impact Intents:** Defined in a new `governance.yaml` config file, loaded at startup.
    *   **Counselor Set:** Managed in a dedicated `counselors` table in PostgreSQL.
    *   **Quorum Rules:** Fixed count (e.g., `3 of 5`), defined in `governance.yaml`.
    *   **Key Rotation:** Standard `did:key` rotation. The system MUST honor the key validity period.
    *   **Missing Attestations:** **Hard-reject**. The `SubmitMessage` call will fail with a `FAILED_PRECONDITION` error.

### 7. Dissent Representation

*   **Decision:** Dissent is logged as a valid attestation with a `"decision": "dissent"` field. The UI will display a warning icon on any decision that passed with dissent. The full dissent statement will be viewable in the audit trail.

### 8. Idempotency Key

*   **Decision:** The `(thread_id, message_id)` unique index in PostgreSQL is sufficient and is the chosen implementation.

### 9. `SubmitMessage` Failure Contract

*   **Decision:** The API will return specific, retry-safe error codes as defined in the Error Catalog (Appendix A). Duplicate submissions will return `STM_ERR_DUPLICATE_IDEMPOTENCY_KEY`.

### 10. Schema Versioning

*   **Decision:** A `"schemaVersion": "2.1"` field will be added to both `ClientEnvelope` and `LedgerEnvelope`. The policy is **backward-compatible reads**. The service will reject requests with an unsupported future version.

### 11. Vault Integration

*   **Decision:** **Transit engine is required**. If Vault is degraded (e.g., sealed, high latency), the Conductor will fail open for reads but **fail closed for all writes**, returning `STM_ERR_VAULT_UNAVAILABLE`.

### 12. Debezium/NATS Delivery Guarantee

*   **Decision:** **At-least-once**. The `observability-service` is responsible for deduplication using the `sequence` number from the event payload.

### 13. Adapter Access Boundaries

*   **Decision (for Phase 2):**
    *   **Auth:** OAuth 2.0 Client Credentials flow.
    *   **Tenant Isolation:** A JWT claim will specify the `tenant_id`, and all database queries will be scoped to that tenant.
    *   **Rate Limits:** Per-client, per-endpoint rate limits will be enforced at the API gateway (e.g., Kong, Traefik).

### 14. MCP Tool Execution

*   **Decision (for Phase 2):** Tool execution happens in a **separate, sandboxed `tool-execution-service`**. The MCP adapter delegates the call and receives the output. The adapter is responsible for redacting the output before persisting the result.

### 15. PII & Privacy Rules

*   **Decision:** All PII fields (to be defined in a data classification policy) **MUST be encrypted at the application layer** before being written to the `client_envelope` JSONB blob, using Vault's Transit engine. This provides field-level encryption. The right-to-delete will be handled by cryptographic erasure (deleting the encryption key).

### 16. Mandatory Audit Requirements

*   **Decision:** The system will be designed to be **SOC 2 Type 2 compliant**. This requires immutable evidence (provided by the event store's hash chain), detailed key usage logs from Vault, and a full audit trail of all operator actions from the Intervention Port.

### 17. Red Cell Program Acceptance Criteria

*   **Decision:**
    *   **Cadence:** One full Red Cell exercise per quarter.
    *   **SLA:** Critical/High findings must have a patch available within 7 days.
    *   **Gate:** No release can proceed with an open Critical or High severity finding from the latest Red Cell report.

### 18. Rollout Strategy

*   **Decision:** **Greenfield cutover**. There is no existing system to migrate from. The prior Raft/BadgerDB work was a prototype and will be decommissioned.

### 19. Authoritative File Confirmation

*   **Decision:** The file `Sphere_Thread_Model_Engineers_Build_Spec_v2.1.md` is the complete, canonical, and corruption-free source of truth.

### 20. Corrupted File Issue

*   **Decision:** The issue was likely a streaming or copy-paste error. The v2.1 document is being generated from scratch to ensure integrity.
