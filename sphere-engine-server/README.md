# sphere-engine-server

Backend server for MetaCanon SphereThread orchestration.

## What This Repository Contains

- `engine/`: API, orchestration, governance enforcement, ws hub, telegram bridge
- `governance/`: runtime governance config and contact lens policy files
- `lens-packs/`: lens pack runtime assets
- `config/`, `deploy/`, `scripts/`: deployment and operational tooling

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm run test
```

## Notes

- This split intentionally excludes UI skins and TMA frontend.
- Keep `governance/` versioned with server code (runtime dependency).
