# Role in Ecosystem

**Current Role**: Historical predecessor platform baseline supplying governance and community lineage. Registered as `in_scope_historical` and `predecessor_platform` with rationale that it contains MetaCanon runtime, SphereThread server, web skin, and Telegram Mini App providing reusable interfaces. Evidence: `discovery/repository-registry.yml` and frozen report section 1.

**Target Role**: Retain as historical baseline for constitutional runtime abstractions, provider routing, sub-sphere behavior, installer contracts, backend governance routes, and snippet API contracts. Target does not include active runtime participation or new cross-surface contracts.

**Responsibilities** (justified by synthesis and report):
- Define core runtime abstractions in `metacanon-core/src/lib.rs:00001-00016`.
- Preserve installer command contracts in `metacanon-installer/desktop/src/App.tsx:00506-00513`.
- Maintain backend governance and game routes in `sphere-engine-server/engine/src/index.ts:00143-00157`.
- Supply UI shells and snippet API contracts.

**Non-Responsibilities**:
- Production website frontend integration (`docs/WEBSITE_DUAL_MODE_IMPLEMENTATION_PLAN.md:00054-00064`).
- Production release promotion for independent repositories (`docs/BRIEF_INTEGRATION_STATUS.md:00068-00072`).
- Joeville implementation (no code evidence present).
- Any active broadcast, animation, or community runtime coordination.

**Upstream Dependencies** (internal only):
- Installer Tauri backend depends on `metacanon-core` path dependency (`metacanon-installer/desktop/src-tauri/Cargo.toml:00009-00017`).
- Council Nebula consumes `/api/v2` endpoints (`sphere-skin-council-nebula/src/lib/api.ts:00043-00178`).
- TMA consumes BFF endpoints (`sphere-tma-app/vite.config.ts:00011-00023`).
- Code API fetches from GitHub (`metacanon-code-api/src/githubClient.ts:00032-00068`).

**Downstream Consumers**: None verified at baseline commit. Historical lineage only.

**Integration Boundaries**: Monorepo layout remains as-is. No shared event bus or identity authority. Governance boundaries preserved per authority hierarchy; no bypass of CDISS or security policy. Unresolved monorepo vs split-repo layout documented in `docs/BRIEF_INTEGRATION_STATUS.md:00010-00020`.
