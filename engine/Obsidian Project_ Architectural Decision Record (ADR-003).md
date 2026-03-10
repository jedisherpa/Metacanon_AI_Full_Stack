# Obsidian Project: Architectural Decision Record (ADR-003)

**Date**: March 04, 2026
**Status**: Active & Authoritative

## 1. Context

This ADR supersedes ADR-002. It incorporates the **Helios** architecture, which integrates the **Morpheus AI decentralized compute network** as the primary cloud compute provider for Obsidian. This document provides the single, authoritative answer to all known architectural questions. All development must adhere to these decisions.

## 2. Decisions

### 2.1. Governance & Document Precedence

| # | Question | Decision |
| :--- | :--- | :--- |
| 1 | **Document Precedence:** Which document wins in a conflict? | The order of precedence is: **1. This ADR (ADR-003)** > **2. `obsidian_morpheus_spec_final.md`** > **3. The AI Agent Handoff** > **4. `Prompt.md`** > **5. All other documents**. |

### 2.2. Core Types & Scope

| # | Question | Decision |
| :--- | :--- | :--- |
| 2 | **Sub-Sphere Scope:** Is the Task Sub-Sphere in scope? | **No.** The entire Task Sub-Sphere, SpecialistLens (PCL), tool registry, and lens library are **out of scope for the initial MVP (Sprints 0-5)**. |

### 2.3. Network & Inference

| # | Question | Decision |
| :--- | :--- | :--- |
| 3 | **Cloud Support:** How is cloud support handled? | The system now has a primary, constitutionally-grounded cloud compute path via the **Morpheus AI network (Helios)**. This feature **must be disabled by default**. The user enables it during the Genesis Rite by providing a Morpheus wallet address. The legacy `CloudApiProvider` is a fallback option. |
| 4 | **Primary Inference Path:** What is the primary inference path? | The primary path is the **`ComputeProvider` abstraction layer**. When Morpheus is enabled, the `TorusLoop` must follow the strict Helios flow: **Local Validate -> FHE Encrypt -> Remote Compute -> Local Decrypt -> Local Log**. |

### 2.4. Genesis & Data Structures

| # | Question | Decision |
| :--- | :--- | :--- |
| 5 | **Required SoulFile Fields:** What are the required fields at Genesis? | In addition to the fields from ADR-002, the `SoulFile` must now include a `fhe_public_key` and a non-serializable `fhe_private_key`, generated during the Genesis Rite. The `AIBoundaries` struct must include `enable_morpheus_compute: bool` and `morpheus_config: Option<MorpheusConfig>`. |

### 2.5. New Constitutional Invariants (from Helios Spec)

| # | Invariant | Statement |
| :--- | :--- | :--- |
| 8 | **Pre-Validation Mandate** | A network request to an external compute provider must not be initiated until `validate_action()` has returned `Ok(())` for the current query. |
| 9 | **Encryption Mandate** | Any data payload sent to an external compute provider must be an `FheCiphertext` object. Plaintext transmission is a constitutional violation. |
| 10 | **Private Key Locality** | The `FhePrivateKey` must never be serialized, cloned outside of `SoulFile`'s internal scope, or transmitted over any network interface. |

## 3. Consequences

These decisions formally integrate the Morpheus network as a first-class citizen of the Obsidian architecture. The use of Fully Homomorphic Encryption (FHE) provides a powerful, constitutionally-sound method for leveraging external compute without sacrificing user sovereignty or privacy. The project is now ready for a development team to proceed with the full Sprints 0-5 implementation.
