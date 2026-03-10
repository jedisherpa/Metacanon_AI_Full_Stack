import { expect, test } from '@playwright/test';

const TMA_PORT = Number(process.env.TMA_PORT || 4173);
const TMA_URL = `http://localhost:${TMA_PORT}`;

const atlasStateResponse = {
  ok: true,
  profile: {
    telegramId: '1',
    firstName: 'Test',
    lastName: 'User',
    username: 'test-user',
    isPremium: false,
    photoUrl: null,
    stats: {
      gamesPlayed: 0,
      gamesWon: 0,
      cxpTotal: 0,
      currentStreak: 0
    },
    earnedLenses: [],
    activeLensId: null
  },
  territories: {
    citadel: { status: 'active', pendingVotes: 0 },
    forge: { status: 'active', activeGames: 0 },
    hub: { status: 'active', pendingEscalations: 0 },
    engineRoom: { status: 'active' }
  },
  activeGames: [],
  hapticTrigger: null
};

async function mockAtlasBootstrap(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/atlas/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(atlasStateResponse)
    });
  });
}

async function mockForgeCycleBootstrap(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/forge/passport', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        passport: {
          telegramId: '1',
          stats: atlasStateResponse.profile.stats,
          earnedLenses: [],
          activeLensId: null
        },
        hapticTrigger: null
      })
    });
  });

  await page.route('**/api/v1/forge/lens', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lenses: [
          {
            id: '1',
            name: 'Sentinel',
            epistemology: 'Observe before acting',
            family: 'guardian',
            color: { name: 'cyan', hex: '#00E5FF' }
          }
        ],
        hapticTrigger: null
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sphereThreadEnabled: true,
        features: {
          cycleEvents: true,
          replay: true,
          stream: false,
          ack: false
        }
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        systemState: 'ACTIVE',
        threadCount: 0,
        degradedThreads: 0,
        haltedThreads: 0
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/lens-upgrade-rules', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        registryVersion: '1.0',
        description: 'Deterministic lens progression registry for tests',
        tupleFields: ['ruleId', 'previousLensVersion', 'nextLensVersion'],
        rules: [
          {
            ruleId: 'rule-lens-upgrade-v1',
            fromVersion: '1.0.0',
            toVersion: '1.1.0',
            permittedLensIds: ['1']
          }
        ]
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const cursor = Number.parseInt(requestUrl.searchParams.get('cursor') ?? '0', 10) || 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor,
        nextCursor: cursor,
        entries: [],
        traceId: 'trace-replay'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/acks**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const cursorRaw =
      requestUrl.searchParams.get('cursor') ?? requestUrl.searchParams.get('ack_cursor') ?? '0';
    const cursor = Number.parseInt(cursorRaw, 10) || 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor,
        nextCursor: cursor,
        acks: [],
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/members**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        principal: 'did:key:zDefaultPrincipal',
        requestPrincipal: 'did:key:zDefaultPrincipal',
        requestRole: 'owner',
        members: [
          {
            threadId,
            principal: 'did:key:zDefaultPrincipal',
            role: 'owner',
            joinedAt: '2026-01-01T00:00:00.000Z'
          }
        ],
        count: 1
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        principal: 'did:key:zDefaultPrincipal',
        requestPrincipal: 'did:key:zDefaultPrincipal',
        requestRole: 'owner',
        invites: [],
        count: 0
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/lens-progression', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        initialVersion: '1.0.0',
        currentVersion: '1.0.0',
        upgradeCount: 0,
        latestUpgrade: null,
        upgrades: []
      })
    });
  });
}

test('open-claw route preselects command from query parameter', async ({ page }) => {
  await mockAtlasBootstrap(page);

  await page.goto(`${TMA_URL}/open-claw?command=forge_run_drill`);

  await expect(page.getByText('Open Claw Command Deck')).toBeVisible();
  await expect(page.getByText('POST /api/v1/forge/run-drill')).toBeVisible();
});

test('tg start param redirects to open-claw route with selected command', async ({ page }) => {
  await mockAtlasBootstrap(page);

  await page.goto(`${TMA_URL}/?tgWebAppStartParam=open_claw:hub_sync`);

  await expect.poll(() => page.url()).toContain('/open-claw?command=hub_sync');
  await expect(page.getByText('Open Claw Command Deck')).toBeVisible();
  await expect(page.getByText('POST /api/v1/hub/sync')).toBeVisible();
});

test('changing selected command updates url query for shareable deep links', async ({ page }) => {
  await mockAtlasBootstrap(page);

  await page.goto(`${TMA_URL}/open-claw?command=open_claw`);
  await page.getByRole('button', { name: /forge_run_drill/i }).click();

  await expect.poll(() => page.url()).toContain('/open-claw?command=forge_run_drill');
  await expect(page.getByText('POST /api/v1/forge/run-drill')).toBeVisible();
});

test('tg start param can open Forge cycle on a shared thread', async ({ page }) => {
  await mockAtlasBootstrap(page);
  await mockForgeCycleBootstrap(page);

  const threadId = '11111111-1111-4111-8111-111111111111';
  await page.goto(`${TMA_URL}/?tgWebAppStartParam=cycle_${threadId}`);

  await expect.poll(() => page.url()).toContain(`/forge?cycleThreadId=${threadId}`);
  await expect(page.getByText('Sphere Cycle Runtime')).toBeVisible();
  await expect(page.getByText(`thread: ${threadId}`)).toBeVisible();
});

test('tg start param can accept Forge cycle invite tokens', async ({ page }) => {
  await mockAtlasBootstrap(page);
  await mockForgeCycleBootstrap(page);

  const threadId = '11111111-1111-4111-8111-111111111111';
  const inviteCode = 'invitecode1234567890';
  let inviteAcceptCalled = false;
  await page.addInitScript(() => {
    window.localStorage.setItem('lensforge_agent_api_key_v1', 'test-agent-key-123456');
  });
  await page.route(`**/api/v1/bff/sphere/invites/${inviteCode}/accept`, async (route) => {
    inviteAcceptCalled = true;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        acceptance: {
          inviteCode,
          threadId,
          principal: 'alpha',
          role: 'member',
          acceptedAt: '2026-01-01T00:00:00.000Z',
          remainingUses: 24
        }
      })
    });
  });

  await page.goto(`${TMA_URL}/?tgWebAppStartParam=cycle_invite_${inviteCode}`);

  await expect.poll(() => page.url()).toContain('/forge?');
  await expect(page.getByText('Sphere Cycle Runtime')).toBeVisible();
  await expect(page.getByText(`thread: ${threadId}`)).toBeVisible();
  expect(inviteAcceptCalled).toBe(true);
});

test('open-claw custom request mode can execute direct sphere endpoint calls', async ({ page }) => {
  await mockAtlasBootstrap(page);

  await page.route('**/api/v1/bff/sphere/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sphereThreadEnabled: true,
        features: {
          cycleEvents: true,
          replay: true,
          stream: true,
          ack: true
        }
      })
    });
  });

  await page.goto(`${TMA_URL}/open-claw?command=open_claw`);

  await page.getByRole('button', { name: /custom off/i }).click();
  await page.getByPlaceholder('/api/v1/sphere/...').fill('/api/v1/sphere/capabilities');
  await page.getByRole('button', { name: /run command/i }).click();

  await expect(page.getByText('"sphereThreadEnabled": true')).toBeVisible();
  await expect(page.getByText('"cycleEvents": true')).toBeVisible();
});

test('open-claw blocks sphere template placeholders during preflight validation', async ({ page }) => {
  await mockAtlasBootstrap(page);

  let cycleEventCalled = false;
  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    cycleEventCalled = true;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto(`${TMA_URL}/open-claw?command=open_claw`);

  await page.getByRole('button', { name: /custom off/i }).click();
  await page.getByRole('button', { name: 'Cycle Event', exact: true }).click();
  await page.getByRole('button', { name: /run command/i }).click();

  await expect(page.getByText(/preflight check failed/i)).toBeVisible();
  await expect(page.getByText(/unresolved placeholders/i)).toBeVisible();
  await expect(page.getByText(/\{threadId\}/i).first()).toBeVisible();
  expect(cycleEventCalled).toBe(false);
});

test('open-claw blocks sphere writes that miss required envelope fields', async ({ page }) => {
  await mockAtlasBootstrap(page);

  let cycleEventCalled = false;
  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    cycleEventCalled = true;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto(`${TMA_URL}/open-claw?command=open_claw`);

  await page.getByRole('button', { name: /custom off/i }).click();
  await page.getByRole('combobox').selectOption('POST');
  await page.getByPlaceholder('/api/v1/sphere/...').fill('/api/v1/sphere/cycle-events');
  await page.locator('textarea').nth(1).fill('{}');
  await page.getByRole('button', { name: /run command/i }).click();

  await expect(page.getByText(/preflight check failed/i)).toBeVisible();
  await expect(page.getByText(/body\.messageId is required/i)).toBeVisible();
  await expect(page.getByText(/body\.traceId is required/i)).toBeVisible();
  expect(cycleEventCalled).toBe(false);
});
