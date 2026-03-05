# Testing Guide (Synchronous v2)

## Unit/integration tests

Run:

```bash
npm test -w engine
```

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
