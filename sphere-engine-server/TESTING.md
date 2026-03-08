# Testing Guide (Synchronous v2)

## Unit/integration tests

Run:

```bash
npm test -w engine
```

## Postgres integration suite (conductor + API replay/quorum/write-guard + break-glass/signature red-team + alert sink)

Run:

```bash
npm run test:integration:pg -w engine
```

Guard behavior:

1. Fails fast if `DATABASE_URL` is missing.
2. Fails fast if Postgres is unreachable, with setup hints.
3. Forces `RUN_PG_INTEGRATION=1` so the gated suite executes in CI and local runs.

### DB role-separation checks

To enforce non-bypassable `sphere_events` writes through `metacanon_append_sphere_event`, set:

```bash
SPHERE_DB_ENFORCE_ROLE_SEPARATION=true
SPHERE_DB_APP_ROLE=sphere_app
```

Then create the app role in Postgres (example):

```sql
CREATE ROLE sphere_app LOGIN PASSWORD 'replace-with-strong-password';
```

During startup, the conductor applies grants with `metacanon_apply_sphere_app_role_grants(role)`:

1. `sphere_app` gets `EXECUTE` on append function.
2. `sphere_app` gets `SELECT` only on `sphere_events`.
3. Direct `INSERT/UPDATE/DELETE` on `sphere_events` is revoked for `sphere_app`.
4. API and worker startup fail fast if `current_user` is not `SPHERE_DB_APP_ROLE`.
5. API and worker startup fail before DB work if `DATABASE_URL` username is not `SPHERE_DB_APP_ROLE`.

### Sphere boundary hardening suites

Run:

```bash
npm run test -w engine -- --run \
  src/middleware/sphereServiceAuth.test.ts \
  src/api/v1/c2Routes.boundary.test.ts \
  src/api/v1/c2StandaloneRoutes.test.ts
```

Modes to verify:

1. `SPHERE_THREAD_ENABLED=true` for canonical Sphere boundary behavior.
2. `SPHERE_THREAD_ENABLED=false` for independent webapp mission flow behavior.
3. Optional: `SPHERE_C2_ALIAS_ENABLED=false` to verify canonical-only `/api/v1/sphere/*` surface.

## E2E

Run:

```bash
npm run test:e2e
```

## Manual smoke

1. Unlock admin panel.
2. Create game.
3. Join as participant.
4. Open/close rounds from admin console.
5. Submit participant responses.
6. Run deliberation controls.
7. Export JSON.
