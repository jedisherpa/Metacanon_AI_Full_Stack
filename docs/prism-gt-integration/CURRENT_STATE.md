# Current State of jedisherpa/Metacanon_AI_Full_Stack

**Plain-English Description**: This is a historical monorepo containing a Rust CLI runtime for constitutional AI setup, a Tauri/React desktop installer, an Express backend for SphereThread orchestration, a React web skin, a Telegram Mini App, and a GitHub-backed code snippet API. Users can execute CLI commands, run an installer wizard, serve game and governance APIs, and navigate multiple frontends. The repository is explicitly labeled `predecessor_platform` with no verified production deployment evidence.

**Current Architecture**: The monorepo comprises six components per `README.md:00005-00018`. `metacanon-core` exports modules via `metacanon-core/src/lib.rs:00001-00016` and dispatches CLI via `metacanon-core/src/main.rs:00129-00152`. `metacanon-installer` uses Tauri config at `metacanon-installer/desktop/src-tauri/tauri.conf.json:00003-00035`. `sphere-engine-server` bootstraps Express at `sphere-engine-server/engine/src/index.ts:00038-00067`. Frontends render at `sphere-skin-council-nebula/src/main.tsx:00001-00018` and `sphere-tma-app/src/main.tsx:00009-00020`. `metacanon-code-api` serves endpoints at `metacanon-code-api/src/server.ts:00071-00087`.

**Implemented Features** (verified at baseline commit):
- Rust CLI command router dispatches setup, health, review, deliberate, sub-sphere, workflow, and snapshot commands (`metacanon-core/src/main.rs:00099-00117`, `metacanon-core/src/main.rs:00953-01019`).
- Compute provider abstraction with fallback routing (`metacanon-core/src/compute.rs:00214-00359`).
- Deliberation torus validation (`metacanon-core/src/torus.rs:00118-00222`).
- Genesis SoulFile creation and integrity (`metacanon-core/src/genesis.rs:00012-00036`).
- Specialist lenses and task sub-spheres (`metacanon-core/src/task_sub_sphere.rs:00106-00162`).
- Snapshot persistence via JSON (`metacanon-core/src/storage.rs:00029-00047`).
- Desktop installer wizard steps (`metacanon-installer/desktop/src/App.tsx:00049-00061`).
- Sphere engine DB schemas for games, sphere_threads, and Atlas (`sphere-engine-server/engine/src/db/schema.ts:00016-00249`).
- Council Nebula and TMA routing (`sphere-skin-council-nebula/src/App.tsx:00016-00071`, `sphere-tma-app/src/App.tsx:00021-00105`).
- Source snippet API endpoints (`metacanon-code-api/src/server.ts:00014-00029`).

**Partial Features** (material code present but incomplete):
- Observability dual-tier logging is exposed but not fully wired in normal UI paths (`metacanon-core/src/observability.rs:00127-00219`).
- Secret management implements in-memory and XOR file stores but lacks OS keychain backend (`metacanon-core/src/secrets.rs:00088-00131`).
- FHE scaffold uses simulated XOR (`metacanon-core/src/fhe.rs:00004-00035`).
- Sphere engine Docker and nested CI reference mismatched paths (`sphere-engine-server/Dockerfile:00005-00008`).

**Planned Features** (explicitly not implemented):
- Independent CI/CD per decomposed repository (`docs/BRIEF_INTEGRATION_STATUS.md:00068-00072`).
- Dual-mode local/cloud code snippets (`docs/WEBSITE_DUAL_MODE_IMPLEMENTATION_PLAN.md:00031-00069`).
- Production Telegram Mini App domain configuration (`sphere-tma-app/README.md:00018-00021`).

**Maturity Assessment**: Architecture is Integrated Alpha. Feature completeness is Functional Alpha. Testing is Functional Alpha with unit tests present but no observed run output. Security is Prototype to Functional Alpha. Governance is Functional Alpha in Sphere engine but Prototype in Rust core. Operations and release are Prototype. No production readiness evidence exists.

**Known Limitations and Concrete Code Evidence**: No release tags or deployment success. Tauri bridge files omitted from bundle. `metacanon-code-api` defaults `GITHUB_OWNER='YOUR_ORG'` (`metacanon-code-api/src/server.ts:00008-00013`). Installer docs contain absolute local paths (`metacanon-installer/desktop/README.md:00028-00051`). TMA sets `overflow: hidden` (`sphere-tma-app/src/index.css:00022-00028`).
