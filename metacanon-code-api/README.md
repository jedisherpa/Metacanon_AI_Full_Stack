# metacanon-code-api

Proxy service that serves live source snippets from `metacanon-core` for the 3D website code panel.

## Endpoints

- `GET /api/v1/manifest`
- `GET /api/v1/snippet/:id`

## Run

```bash
npm install
npm run dev
```

## Required Environment Variables

- `GITHUB_TOKEN` (read-only)
- `GITHUB_OWNER`
- `GITHUB_REPO` (default: `metacanon-core`)
- `GITHUB_REF` (default: `main`)
- `PORT` (default: `8787`)

## Mapping File

- `code-map.yaml`
