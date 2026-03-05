# Team Workstreams

This is the operating contract for parallel development.

## Independent Workstreams

| Workstream | Repository | Owns | Must Not Break |
|---|---|---|---|
| Constitutional Runtime | `metacanon-core` | SoulFile, compute routing, security, sub-sphere runtime, observability | Public command/data contracts in `src/ui.rs` used by installer |
| Installer Experience | `metacanon-installer` | 8-step setup UI, Tauri bridge, setup flows | Rust command names and payload contracts exposed by core |
| Sphere Orchestration Backend | `sphere-engine-server` | API routes, governance enforcement, ws hub, telegram bridge | BFF and route contracts consumed by frontends |
| Council Web Skin | `sphere-skin-council-nebula` | Deliberation web UX | API route schemas from sphere-engine-server |
| Telegram Mini App | `sphere-tma-app` | Mobile-first Telegram UX | API route schemas + auth model from sphere-engine-server |
| Live Code Visualization API | `metacanon-code-api` | Code snippet manifest + retrieval proxy from GitHub | `code-map.yaml` schema and API response shape consumed by website |

## Cross-Repo Contract Boundaries

1. Core -> Installer:
`metacanon-core/src/ui.rs` is the contract surface; keep backward compatibility or version changes explicitly.

2. Sphere Engine -> Skins/TMA:
API route and auth changes require coordinated frontend updates in the same release window.

3. Core -> Code API:
`metacanon-code-api/code-map.yaml` file paths and line ranges must track `metacanon-core` source moves.

## Change Control Rules

1. If a public command/endpoint changes, add/update a contract test in the owning repository.
2. Use additive changes first, then deprecate old fields; avoid instant breaking deletes.
3. Each repo must ship its own README, run instructions, and independent test command.

## Minimum Validation Per Workstream

- `metacanon-core`: `cargo test`
- `metacanon-installer`: `cd desktop && npm run build`
- `sphere-engine-server`: `npm run test` (engine workspace)
- `sphere-skin-council-nebula`: `npm run build`
- `sphere-tma-app`: `npm run build`
- `metacanon-code-api`: `npm run check`
