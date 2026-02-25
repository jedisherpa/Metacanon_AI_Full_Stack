# Testing Guide (Synchronous v2)

## Unit/integration tests

Run:

```bash
npm test -w engine
```

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
