# Obsidian × Morpheus: Technical Specification
## Local-Validate, Remote-Compute Architecture (Codename: Helios)

**Document Type**: Technical Specification & Constitutional Addendum
**Version**: 1.0 — Draft for Review
**Status**: Proposed
**Grounded in**: Metacanon Constitution v3.0, Obsidian Handoff v4.0, Morpheus AI Whitepaper

---

## 1. Purpose and Constitutional Grounding

This specification defines the architecture for integrating the **Obsidian Sovereign AI Governance System** with the **Morpheus AI decentralized compute network** as an optional, user-controlled compute backend. The integration is codenamed **Helios**.

The design is governed by a single, non-negotiable principle derived from the Metacanon Constitution:

> **The Perspective Lens (PL) is always sovereign. Morpheus is a tool. Tools do not have standing.**

This means Morpheus never governs, never validates, and never has visibility into the content of the PL's deliberations. It is a compute pipe — nothing more. Every governance operation — validation, logging, decryption, and human-in-the-loop approval — remains local to the PL's device.

### 1.1 Constitutional Amendment: Article VIII — Bounded External Compute

The following article is proposed as an addendum to the Metacanon Constitution v3.0 to authorize this integration:

> **Article VIII: Bounded External Compute.** A Perspective Lens may delegate compute-intensive tasks to an external, decentralized network under the following non-negotiable conditions:
>
> 1. **Sovereign Validation First**: All actions must be validated against the PL's `WillVector` locally before any network dispatch.
> 2. **Zero-Knowledge Transmission**: All data transmitted to the external network must be protected by Fully Homomorphic Encryption (FHE), rendering the content unknowable to the compute provider.
> 3. **Permissionless & Revocable**: The choice of network and provider must be permissionless, and the ability to use the external network must be instantly revocable by the PL at any time via the existing `Ratchet` mechanism.
> 4. **No Surrender of Authority**: At no point shall an external network or compute provider be granted standing, authority, or the ability to bypass the PL's sovereign governance chain.

---

## 2. Architecture Overview

The Helios architecture introduces a strict, linear data flow that separates local governance from remote compute. The sequence is immutable — no step may be skipped or reordered.

```
┌─────────────────────────────────────────────────────────────────┐
│                     OBSIDIAN (LOCAL DEVICE)                     │
│                                                                 │
│  User Query                                                     │
│      │                                                          │
│      ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 1: SOVEREIGN VALIDATION                            │   │
│  │  validate_action() — cosine similarity vs WillVector     │   │
│  │  ✓ Pass → continue   ✗ Fail → ActiveSilence (HALT)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 2: FHE ENCRYPTION                                  │   │
│  │  fhe::encrypt(prompt, soul_file.fhe_public_key)          │   │
│  │  Plaintext never leaves this boundary.                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│      │                                                          │
└──────┼──────────────────────────────────────────────────────────┘
       │  FheCiphertext (opaque to all external parties)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MORPHEUS NETWORK (REMOTE)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 3: ROUTER DISPATCH                                 │   │
│  │  MorpheusInterface → Router → Provider bidding           │   │
│  └──────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 4: REMOTE COMPUTE (on encrypted data)              │   │
│  │  Provider performs inference on FheCiphertext.           │   │
│  │  Provider never sees plaintext. Returns FheCiphertext.   │   │
│  └──────────────────────────────────────────────────────────┘   │
│      │                                                          │
└──────┼──────────────────────────────────────────────────────────┘
       │  FheCiphertext (result)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OBSIDIAN (LOCAL DEVICE)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 5: LOCAL DECRYPTION                                │   │
│  │  fhe::decrypt(result, soul_file.fhe_private_key)         │   │
│  │  Private key never leaves this boundary.                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 6: MERKLE DAG LOGGING                              │   │
│  │  Append governance event to local, append-only ledger.   │   │
│  └──────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  Result returned to user in Deliberation Mode UI               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Specifications

### 3.1 New Module: `src/fhe.rs`

This module provides the FHE cryptographic layer. The recommended underlying library is `tfhe-rs`, an open-source Rust implementation of TFHE (Fast Fully Homomorphic Encryption over the Torus).

```rust
// src/fhe.rs
//
// Provides Fully Homomorphic Encryption primitives for the Helios integration.
// The private key is generated once during the Genesis Rite and stored in the
// SoulFile. It MUST NEVER be serialized to a network-accessible location.

use serde::{Serialize, Deserialize};

/// Opaque wrapper for the FHE public key.
/// Safe to store in the SoulFile and reference in MorpheusRequests.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FhePublicKey(pub Vec<u8>);

/// Opaque wrapper for the FHE private key.
/// CONSTITUTIONAL INVARIANT 10: Must never leave the local device.
/// Not derived from Serialize to prevent accidental serialization.
#[derive(Clone)]
pub struct FhePrivateKey(Vec<u8>);

/// An encrypted payload. Opaque to any party that does not hold the FhePrivateKey.
#[derive(Serialize, Deserialize, Clone)]
pub struct FheCiphertext(pub Vec<u8>);

/// Generates a new FHE keypair. Called once during the Genesis Rite.
pub fn generate_keys() -> (FhePublicKey, FhePrivateKey) {
    // Implementation uses tfhe-rs:
    // use tfhe::{generate_keys, ConfigBuilder};
    // let config = ConfigBuilder::default().build();
    // let (client_key, server_key) = generate_keys(config);
    // (FhePublicKey(serialize(server_key)), FhePrivateKey(serialize(client_key)))
    unimplemented!("Sprint 5, Milestone 5.1")
}

/// Encrypts a plaintext string using the FHE public key.
/// The resulting FheCiphertext can be safely transmitted to any external party.
pub fn encrypt(plaintext: &str, public_key: &FhePublicKey) -> FheCiphertext {
    unimplemented!("Sprint 5, Milestone 5.1")
}

/// Decrypts an FheCiphertext using the FHE private key.
/// This operation MUST only occur on the local device.
pub fn decrypt(ciphertext: &FheCiphertext, private_key: &FhePrivateKey) -> Result<String, String> {
    unimplemented!("Sprint 5, Milestone 5.1")
}
```

**Key Design Decisions for `fhe.rs`:**

The `FhePrivateKey` struct intentionally does **not** derive `Serialize`. This is a compile-time constitutional enforcement: it is structurally impossible to serialize the private key to JSON, send it over a network, or store it in the SQLite ledger. Any attempt to do so will produce a compiler error, not a runtime error.

---

### 3.2 New Module: `src/morpheus.rs`

This module encapsulates all network interactions with the Morpheus AI network.

```rust
// src/morpheus.rs
//
// Interface to the Morpheus AI decentralized compute network.
// This module is the ONLY module in Obsidian that makes external network calls.
// It treats the Morpheus network as an untrusted, privacy-preserving compute pipe.

use serde::{Serialize, Deserialize};
use crate::fhe::FheCiphertext;

/// User-configurable settings for the Morpheus integration.
/// Stored in AIBoundaries within the SoulFile.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MorpheusConfig {
    /// The endpoint of the Morpheus Router.
    pub router_endpoint: String,
    /// The user's Web3 wallet address for MOR token staking and payments.
    pub mor_wallet_address: String,
    /// Required capability tags for provider selection.
    /// MUST include "fhe_enabled" to enforce Constitutional Invariant 9.
    pub required_provider_tags: Vec<String>,
    /// Maximum MOR tokens willing to pay per inference-per-second.
    pub max_price_per_ips: u64,
}

impl MorpheusConfig {
    /// Creates a new config with FHE enforcement pre-set.
    pub fn new(router_endpoint: String, wallet_address: String) -> Self {
        MorpheusConfig {
            router_endpoint,
            mor_wallet_address: wallet_address,
            // "fhe_enabled" is a hard requirement, not an option.
            required_provider_tags: vec!["fhe_enabled".to_string()],
            max_price_per_ips: 100, // Configurable by user
        }
    }
}

/// The outbound request payload sent to the Morpheus Router.
#[derive(Serialize)]
struct MorpheusRequest {
    /// The encrypted prompt. The Router and Provider never see plaintext.
    encrypted_payload: FheCiphertext,
    /// Provider capability requirements.
    required_tags: Vec<String>,
    /// Bidding ceiling.
    max_price_per_ips: u64,
}

/// The inbound response from the Morpheus Provider.
#[derive(Deserialize)]
struct MorpheusResponse {
    /// The encrypted inference result.
    encrypted_result: FheCiphertext,
    /// Cryptographic proof of computation from the provider.
    /// Used to verify the provider actually performed the inference.
    provider_proof: Vec<u8>,
    /// The provider's MOR wallet address (for payment routing).
    provider_address: String,
}

/// The primary interface for dispatching compute to the Morpheus network.
pub struct MorpheusInterface {
    config: MorpheusConfig,
}

impl MorpheusInterface {
    pub fn new(config: MorpheusConfig) -> Self {
        MorpheusInterface { config }
    }

    /// Dispatches an encrypted payload to the Morpheus network.
    ///
    /// # Constitutional Guarantees
    /// - The `payload` argument MUST be an `FheCiphertext`. Plaintext dispatch
    ///   is structurally impossible due to the type signature.
    /// - The provider proof is verified before the result is returned.
    ///
    /// # Returns
    /// `Ok(FheCiphertext)` — the encrypted result, ready for local decryption.
    /// `Err(String)` — network error, provider proof failure, or no provider found.
    pub fn dispatch_compute(&self, payload: FheCiphertext) -> Result<FheCiphertext, String> {
        let request = MorpheusRequest {
            encrypted_payload: payload,
            required_tags: self.config.required_provider_tags.clone(),
            max_price_per_ips: self.config.max_price_per_ips,
        };

        // 1. Serialize request and send to Router endpoint via HTTP POST.
        // 2. Router performs provider matching and bidding.
        // 3. Await MorpheusResponse.
        // 4. Verify provider_proof cryptographically.
        // 5. Return Ok(encrypted_result) or Err on any failure.
        unimplemented!("Sprint 5, Milestone 5.3")
    }
}
```

---

### 3.3 Modifications to `src/genesis.rs`

The `AIBoundaries` and `SoulFile` structs require targeted additions to support the Helios integration.

```rust
// In src/genesis.rs — targeted additions only

use crate::morpheus::MorpheusConfig;
use crate::fhe::{FhePublicKey, FhePrivateKey};

// BEFORE:
pub struct AIBoundaries {
    pub human_in_loop: bool,
    pub interpretive_boundaries: Vec<String>,
    pub drift_prevention: String,
}

// AFTER:
pub struct AIBoundaries {
    pub human_in_loop: bool,
    pub interpretive_boundaries: Vec<String>,
    pub drift_prevention: String,
    // --- Helios additions ---
    /// Whether Morpheus compute is enabled. Default: false (offline-first preserved).
    pub enable_morpheus_compute: bool,
    /// Morpheus configuration. Required if enable_morpheus_compute is true.
    pub morpheus_config: Option<MorpheusConfig>,
}

// BEFORE:
pub struct SoulFile {
    pub merkle_root: [u8; 32],
    pub signature: Signature,
    pub vision_core: String,
    // ... all existing fields ...
}

// AFTER:
pub struct SoulFile {
    pub merkle_root: [u8; 32],
    pub signature: Signature,
    pub vision_core: String,
    // ... all existing fields ...
    // --- Helios additions ---
    /// FHE public key. Generated during Genesis Rite. Safe to store and transmit.
    pub fhe_public_key: FhePublicKey,
    /// FHE private key. Generated during Genesis Rite. NEVER leaves this struct.
    /// Not serializable by design (FhePrivateKey does not derive Serialize).
    fhe_private_key: FhePrivateKey,
}

// New method on SoulFile:
impl SoulFile {
    /// Returns a reference to the FHE private key for local decryption only.
    /// The key itself cannot be extracted or cloned outside this module.
    pub(crate) fn fhe_private_key(&self) -> &FhePrivateKey {
        &self.fhe_private_key
    }
}
```

---

### 3.4 Modifications to `src/torus.rs`

The `TorusLoop::run` method is the core integration point. The modification is additive — it wraps the existing deliberation call with the Helios flow.

```rust
// In src/torus.rs — modified run() method

use crate::morpheus::MorpheusInterface;
use crate::fhe;

impl TorusLoop {
    pub fn run(&self, query: &str, soul_file: &SoulFile) -> Result<String, String> {
        let mut file = OpenOptions::new()
            .read(true).write(true).create(true)
            .open("torus.mmap")
            .map_err(|e| e.to_string())?;
        let mut mmap = unsafe { MmapMut::map_mut(&file).map_err(|e| e.to_string())? };
        mmap.copy_from_slice(query.as_bytes());

        for cycle in 0..self.cycle_limit {
            for cl in &self.contact_lenses {
                let input = String::from_utf8_lossy(&mmap[..]).to_string();

                // ─────────────────────────────────────────────────────────
                // STEP 1: SOVEREIGN VALIDATION (LOCAL — ALWAYS)
                // This call MUST precede any compute dispatch.
                // Constitutional Invariant 8: Pre-Validation Mandate.
                // ─────────────────────────────────────────────────────────
                soul_file.validate_action(&input)?;

                let output = if soul_file.ai_boundaries.enable_morpheus_compute {
                    let config = soul_file
                        .ai_boundaries
                        .morpheus_config
                        .as_ref()
                        .ok_or("Morpheus enabled but config is missing")?;

                    // ─────────────────────────────────────────────────────
                    // STEP 2: FHE ENCRYPTION (LOCAL)
                    // Constitutional Invariant 9: Encryption Mandate.
                    // ─────────────────────────────────────────────────────
                    let encrypted_prompt = fhe::encrypt(&input, &soul_file.fhe_public_key);

                    // ─────────────────────────────────────────────────────
                    // STEP 3 & 4: REMOTE DISPATCH & COMPUTE (NETWORK)
                    // ─────────────────────────────────────────────────────
                    let interface = MorpheusInterface::new(config.clone());
                    let encrypted_result = interface.dispatch_compute(encrypted_prompt)?;

                    // ─────────────────────────────────────────────────────
                    // STEP 5: LOCAL DECRYPTION (LOCAL — ALWAYS)
                    // Constitutional Invariant 10: Private Key Locality.
                    // ─────────────────────────────────────────────────────
                    fhe::decrypt(&encrypted_result, soul_file.fhe_private_key())?

                } else {
                    // Fallback: local deliberation (original behavior, unchanged)
                    cl.deliberate(&input, soul_file)
                };

                mmap.copy_from_slice(output.as_bytes());
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // STEP 6: MERKLE DAG LOGGING (LOCAL — ALWAYS)
        // ─────────────────────────────────────────────────────────────────
        let final_result = String::from_utf8_lossy(&mmap[..]).to_string();
        // MerkleDAG::add_event(GovernanceEvent { entry: final_result.clone(), ... });
        Ok(final_result)
    }
}
```

---

## 4. New Constitutional Invariants

The following three invariants are added to `docs/design-docs/constitutional-invariants.md` to govern the Helios integration.

### Invariant 8: Pre-Validation Mandate

**Statement**: A network request to an external compute provider must not be initiated until `validate_action()` has returned `Ok(())` for the current query.

**Verification**:
```rust
// In torus.rs, the call order is enforced by the compiler:
soul_file.validate_action(&input)?;  // Must succeed before...
let encrypted_prompt = fhe::encrypt(&input, ...); // ...this line is reached.
```

**What triggers violation**: Any code path that calls `MorpheusInterface::dispatch_compute` without a preceding successful `validate_action` call in the same cycle.

**Consequence of violation**: Constitutional violation. The deliberation result is invalid and must be discarded. The ContactLens enters `ActiveSilence("Pre-validation bypassed")`.

---

### Invariant 9: Encryption Mandate

**Statement**: Any data payload sent to an external compute provider must be an `FheCiphertext` object. Plaintext transmission is a constitutional violation.

**Verification**:
```rust
// The type signature of dispatch_compute enforces this at compile time:
pub fn dispatch_compute(&self, payload: FheCiphertext) -> Result<FheCiphertext, String>
// It is structurally impossible to pass a &str or String to this function.
```

**What triggers violation**: Any modification to `dispatch_compute`'s signature that accepts a `String` or `&str` parameter.

**Consequence of violation**: Constitutional violation. The SoulFile's contents have been exposed to an untrusted third party. This is an unrecoverable privacy breach.

---

### Invariant 10: Private Key Locality

**Statement**: The `FhePrivateKey` must never be serialized, cloned outside of `SoulFile`'s internal scope, or transmitted over any network interface.

**Verification**:
```rust
// FhePrivateKey intentionally does NOT derive Serialize or Clone:
#[derive()] // No Serialize, no Clone
pub struct FhePrivateKey(Vec<u8>);

// Access is restricted to a pub(crate) method:
pub(crate) fn fhe_private_key(&self) -> &FhePrivateKey { &self.fhe_private_key }
```

**What triggers violation**: Adding `Serialize` or `Clone` to `FhePrivateKey`, or adding a `pub` accessor that returns the key by value.

**Consequence of violation**: Constitutional violation. The private key has been exposed. All past and future FHE-encrypted deliberations are compromised.

---

## 5. Genesis Rite Changes (Sprint 5 UI)

The Genesis Rite must be updated to generate FHE keys during the initial setup ceremony. The UX change is minimal and must preserve the ceremonial character of the rite.

After the user presses **"Seal the Rite"**, the following occurs before the Genesis Crystal is displayed:

1. `fhe::generate_keys()` is called. This may take several seconds.
2. A single line of text is displayed: *"Forging your encryption keys..."*
3. The `fhe_public_key` is stored in the `SoulFile` and persisted to SQLite.
4. The `fhe_private_key` is stored in memory within the `SoulFile` struct and **never written to disk in plaintext**. It is protected by the operating system's secure memory facilities.
5. The Genesis Crystal is displayed as normal.

Additionally, a new optional prompt is added to the Genesis Rite sequence:

> **Compute Mode** — "Do you want to enable decentralized cloud compute via the Morpheus network? This allows your AI agents to use more powerful models. Your prompts will be encrypted and unreadable to any provider. (Enter your Morpheus wallet address, or leave blank to remain fully offline.)"

---

## 6. Implementation Plan: Sprint 5 (Helios)

Sprint 5 is a standalone sprint that builds on the completed Sprint 4 codebase. All existing sprints remain unchanged.

| Milestone | Description | Acceptance Criteria |
|---|---|---|
| **5.1** | Implement `src/fhe.rs` using `tfhe-rs` | `cargo test` passes for key generation, encrypt/decrypt round-trip, and the compile-time `Serialize` restriction. |
| **5.2** | Update `genesis.rs` (`AIBoundaries`, `SoulFile`) | `cargo test` passes for SoulFile construction with FHE keys; private key is not present in `serde_json::to_string()` output. |
| **5.3** | Implement `src/morpheus.rs` with a local mock server | `cargo test` passes for a full mock round-trip: encrypt → dispatch to mock → receive → decrypt. |
| **5.4** | Integrate Helios loop into `torus.rs` | `cargo test` passes for both the Morpheus path and the local fallback path. |
| **5.5** | Add Genesis Rite UI changes | `cargo tauri dev` — complete the rite with a wallet address, verify FHE keys are generated and Morpheus config is stored. |
| **5.6** | Invariant tests | `cargo test` passes for all three new invariants (8, 9, 10), including negative tests that verify violations are caught. |

**New `Cargo.toml` dependency for Sprint 5**:
```toml
[dependencies]
tfhe = { version = "0.6", features = ["boolean", "shortint", "integer"] }
reqwest = { version = "0.11", features = ["json", "blocking"] }
```

---

## 7. What Does NOT Change

The following elements of the Obsidian architecture are **completely unchanged** by the Helios integration:

| Component | Status |
|---|---|
| `WillVector` and `validate_action()` | Unchanged. Always runs locally. |
| `Ratchet` and `Delegation` | Unchanged. Morpheus is not a ContactLens and has no delegation. |
| `MerkleDAG` governance ledger | Unchanged. All events are still logged locally. |
| `FractalSeed` federation | Unchanged. Federation is a PL-to-PL concept, not a compute concept. |
| `MeritMetrics` | Unchanged. Morpheus providers are not rated by the merit system. |
| Offline-first mode | Unchanged. `enable_morpheus_compute: false` is the default. The system functions identically to the pre-Helios architecture when Morpheus is disabled. |
| WASM sandboxing for ContactLenses | Unchanged. The Morpheus call happens in the `TorusLoop`, not inside a ContactLens WASM module. |
