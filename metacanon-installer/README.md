# metacanon-installer

Desktop installer for MetaCanon AI (Tauri + React).

## Internal Parts

1. Frontend UI: `desktop/src/`
2. Backend bridge: `desktop/src-tauri/src/`
3. App config/bundle metadata: `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/icons/`

## Run

```bash
cd desktop
npm install
npm run tauri:dev
```

## Build

```bash
cd desktop
npm run tauri:build
```

## Core Dependency

`desktop/src-tauri/Cargo.toml` is configured to pull `metacanon-core` using a git dependency placeholder. Set it to your organization repo URL and optional pinned tag/rev.
