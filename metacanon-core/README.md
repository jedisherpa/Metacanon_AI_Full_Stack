# metacanon-core

Constitutional runtime for MetaCanon AI.

## What This Repository Contains

- Rust library and CLI runtime (`src/`)
- Compute abstraction + provider routing
- Security primitives (secrets + Helios FHE scaffolding)
- Task sub-sphere runtime and specialist lens logic
- Observability + communications adapters

## Layered Architecture

1. Constitutional Layer: `genesis.rs`
2. Compute Abstraction: `compute.rs`, `torus.rs`, `providers/`
3. Security & Encryption: `secrets.rs`, `fhe.rs`
4. Agent Abstraction: `specialist_lens.rs`, `lens_library.rs`, `workflow.rs`
5. Sub-Sphere Communication: `task_sub_sphere.rs`, `sub_sphere_torus.rs`
6. Platform Services: `observability.rs`, `storage.rs`, `communications.rs`

Application shell files (above layers): `ui.rs`, `main.rs`.

## Build & Test

```bash
cargo test
cargo run -- help
```

## Notes

- Contract tests are included under `tests/`.
- Installer-specific contract test is intentionally removed from this split because it belongs in `metacanon-installer`.
