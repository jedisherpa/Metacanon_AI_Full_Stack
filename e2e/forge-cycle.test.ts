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
    activeLensId: '1'
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

const passportResponse = {
  passport: {
    telegramId: '1',
    stats: atlasStateResponse.profile.stats,
    earnedLenses: [],
    activeLensId: '1'
  },
  hapticTrigger: null
};

const lensesResponse = {
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
};

async function mockAtlasAndForgeBootstrap(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/v1/atlas/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(atlasStateResponse)
    });
  });

  await page.route('**/api/v1/forge/passport', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(passportResponse)
    });
  });

  await page.route('**/api/v1/forge/lens', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(lensesResponse)
    });
  });
}

async function mockSphereBoundary(
  page: import('@playwright/test').Page,
  options?: {
    statusBody?: Record<string, unknown>;
    capabilitiesBody?: Record<string, unknown>;
    lensUpgradeRulesBody?: Record<string, unknown>;
    lensProgressionBody?: Record<string, unknown>;
  }
): Promise<void> {
  await page.route('**/api/v1/bff/sphere/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        options?.capabilitiesBody ?? {
          sphereThreadEnabled: true,
          features: {
            cycleEvents: true,
            replay: true,
            stream: false,
            ack: false
          }
        }
      )
    });
  });

  await page.route('**/api/v1/bff/sphere/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        options?.statusBody ?? {
          systemState: 'ACTIVE',
          threadCount: 0,
          degradedThreads: 0,
          haltedThreads: 0,
          traceId: 'trace-status'
        }
      )
    });
  });

  await page.route('**/api/v1/bff/sphere/lens-upgrade-rules', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        options?.lensUpgradeRulesBody ?? {
          registryVersion: '1.0',
          description: 'Deterministic lens progression registry for tests',
          tupleFields: ['ruleId', 'previousLensVersion', 'nextLensVersion'],
          rules: [
            {
              ruleId: 'rule-lens-upgrade-v1',
              fromVersion: '1.0.0',
              toVersion: '1.1.0',
              permittedLensIds: ['1', '2', '3']
            },
            {
              ruleId: 'rule-lens-upgrade-v2',
              fromVersion: '1.1.0',
              toVersion: '1.2.0',
              permittedLensIds: ['1', '2', '3']
            }
          ]
        }
      )
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
        count: 1,
        traceId: 'trace-members'
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
        count: 0,
        traceId: 'trace-invites'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/lens-progression', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        options?.lensProgressionBody ?? {
          threadId,
          initialVersion: '1.0.0',
          currentVersion: '1.0.0',
          upgradeCount: 0,
          latestUpgrade: null,
          upgrades: [],
          traceId: 'trace-lens-progression'
        }
      )
    });
  });

}

test('forge cycle tab writes seat event and shows replayed log entry', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page);

  const entries: Array<{
    clientEnvelope: Record<string, unknown>;
    ledgerEnvelope: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const nextCursor = entries.length > 0 ? entries.length : 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor: 0,
        nextCursor,
        entries,
        traceId: 'trace-replay'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/acks**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor: 0,
        nextCursor: 0,
        acks: [],
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const threadId = String(body.threadId);
    const eventType = String(body.eventType);
    const messageId = String(body.messageId);
    const traceId = String(body.traceId);
    const sequence = entries.length + 1;
    const intent =
      eventType === 'seat_taken'
        ? 'SEAT_TAKEN'
        : eventType === 'perspective_submitted'
          ? 'PERSPECTIVE_SUBMITTED'
          : eventType === 'synthesis_returned'
            ? 'SYNTHESIS_RETURNED'
            : 'LENS_UPGRADED';

    entries.push({
      clientEnvelope: {
        messageId,
        threadId,
        authorAgentId: body.authorAgentId,
        intent,
        protocolVersion: '3.0',
        schemaVersion: '3.0',
        traceId,
        causationId: body.causationId ?? [],
        attestation: body.attestation ?? [],
        agentSignature: body.agentSignature
      },
      ledgerEnvelope: {
        schemaVersion: '3.0',
        sequence,
        prevMessageHash: sequence === 1 ? 'GENESIS' : `hash-${sequence - 1}`,
        timestamp: new Date().toISOString(),
        conductorSignature: `sig-${sequence}`
      },
      payload: {
        ...(body.payload as Record<string, unknown> | undefined),
        cycleEventType: eventType
      }
    });

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        eventType,
        intent,
        sequence,
        timestamp: new Date().toISOString(),
        traceId
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();
  await expect(page.getByText('Sphere Cycle Runtime')).toBeVisible();

  const takeSeatButton = page.getByRole('button', { name: 'TAKE SEAT' });
  await expect(takeSeatButton).toBeEnabled();
  await takeSeatButton.click();

  await expect(page.getByText('Seat Taken', { exact: true })).toBeVisible();
  await expect(page.getByText('Phase: Seat Taken')).toBeVisible();
});

test('forge cycle tab can join a thread from a pasted invite code', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page);

  const inviteCode = 'invitecode1234567890';
  const threadId = '11111111-1111-4111-8111-111111111119';
  let inviteAcceptCalled = 0;

  await page.route(`**/api/v1/bff/sphere/invites/${inviteCode}/accept`, async (route) => {
    inviteAcceptCalled += 1;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        acceptance: {
          inviteCode,
          threadId,
          principal: 'did:key:zDefaultPrincipal',
          role: 'member',
          acceptedAt: '2026-01-01T00:00:00.000Z',
          remainingUses: 24
        }
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();
  await expect(page.getByText('Sphere Cycle Runtime')).toBeVisible();

  await page.getByPlaceholder('Paste invite code or thread ID').fill(inviteCode);
  await page.getByRole('button', { name: 'JOIN' }).click();

  await expect.poll(() => inviteAcceptCalled).toBe(1);
  await expect(page.getByText(`thread: ${threadId}`)).toBeVisible();
});

test('forge cycle tab can join directly from a pasted thread ID', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page);

  const threadId = '11111111-1111-4111-8111-111111111120';

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();
  await expect(page.getByText('Sphere Cycle Runtime')).toBeVisible();
  await expect(page.locator('[data-testid=\"launch-step-thread\"]')).toContainText('PENDING');
  await expect(page.locator('[data-testid=\"launch-step-api-key\"]')).toContainText('PENDING');

  await page.getByPlaceholder('Paste invite code or thread ID').fill(threadId);
  await page.getByRole('button', { name: 'JOIN' }).click();

  await expect(page.getByText(`thread: ${threadId}`)).toBeVisible();
  await expect(page.getByText('Joined thread by ID.')).toBeVisible();
  await expect(page.locator('[data-testid=\"launch-step-thread\"]')).toContainText('DONE');
});

test('forge cycle tab sends agent relay messages into the shared thread', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page);

  const entries: Array<{
    clientEnvelope: Record<string, unknown>;
    ledgerEnvelope: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];
  const messageWrites: Array<Record<string, unknown>> = [];

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const nextCursor = entries.length > 0 ? entries.length : 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor: 0,
        nextCursor,
        entries,
        traceId: 'trace-replay'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/acks**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor: 0,
        nextCursor: 0,
        acks: [],
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const threadId = String(body.threadId);
    const eventType = String(body.eventType);
    const messageId = String(body.messageId);
    const traceId = String(body.traceId);
    const sequence = entries.length + 1;
    const intent = eventType === 'seat_taken' ? 'SEAT_TAKEN' : 'CYCLE_EVENT';

    entries.push({
      clientEnvelope: {
        messageId,
        threadId,
        authorAgentId: body.authorAgentId,
        intent,
        protocolVersion: '3.0',
        schemaVersion: '3.0',
        traceId,
        causationId: body.causationId ?? [],
        attestation: body.attestation ?? [],
        agentSignature: body.agentSignature
      },
      ledgerEnvelope: {
        schemaVersion: '3.0',
        sequence,
        prevMessageHash: sequence === 1 ? 'GENESIS' : `hash-${sequence - 1}`,
        timestamp: new Date().toISOString(),
        conductorSignature: `sig-${sequence}`
      },
      payload: {
        ...(body.payload as Record<string, unknown> | undefined),
        cycleEventType: eventType
      }
    });

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        eventType,
        intent,
        sequence,
        timestamp: new Date().toISOString(),
        traceId
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/messages', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    messageWrites.push(body);
    const threadId = String(body.threadId);
    const messageId = String(body.messageId);
    const traceId = String(body.traceId);
    const intent = String(body.intent ?? 'AGENT_MESSAGE');
    const sequence = entries.length + 1;

    entries.push({
      clientEnvelope: {
        messageId,
        threadId,
        authorAgentId: body.authorAgentId,
        intent,
        protocolVersion: '3.0',
        schemaVersion: '3.0',
        traceId,
        causationId: body.causationId ?? [],
        attestation: body.attestation ?? [],
        agentSignature: body.agentSignature
      },
      ledgerEnvelope: {
        schemaVersion: '3.0',
        sequence,
        prevMessageHash: `hash-${sequence - 1}`,
        timestamp: new Date().toISOString(),
        conductorSignature: `sig-${sequence}`
      },
      payload: (body.payload as Record<string, unknown> | undefined) ?? {}
    });

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        sequence,
        timestamp: new Date().toISOString(),
        traceId
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();
  await expect(page.getByText('Sphere Cycle Runtime')).toBeVisible();

  await page.getByRole('button', { name: 'TAKE SEAT' }).click();
  await expect(page.getByText('Phase: Seat Taken')).toBeVisible();

  const relayMessage = `Agent relay ping ${Date.now()}`;
  await page.getByPlaceholder('Send an agent message to this thread').fill(relayMessage);
  await page.getByRole('button', { name: 'SEND AGENT MESSAGE' }).click();

  await expect.poll(() => messageWrites.length).toBe(1);
  expect(messageWrites[0]?.intent).toBe('AGENT_MESSAGE');
  expect(messageWrites[0]?.payload).toEqual(
    expect.objectContaining({
      text: relayMessage,
      channel: 'agent_relay'
    })
  );

  await expect(page.getByText('AGENT_MESSAGE', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(relayMessage)).toBeVisible();
});

test('forge cycle tab surfaces degraded mode errors', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    statusBody: {
      systemState: 'DEGRADED_NO_LLM',
      degradedNoLlmReason: 'Model-dependent mission execution is blocked while LLM is unavailable.',
      threadCount: 0,
      degradedThreads: 0,
      haltedThreads: 0,
      traceId: 'trace-status'
    }
  });

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        cursor: 0,
        nextCursor: 0,
        entries: [],
        traceId: 'trace-replay'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/acks**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        cursor: 0,
        nextCursor: 0,
        acks: [],
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'DEGRADED_NO_LLM',
        message: 'Model-dependent mission execution is blocked while LLM is unavailable.',
        retryable: true,
        traceId: 'trace-degraded'
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();
  await page.getByRole('button', { name: 'TAKE SEAT' }).click();

  await expect(
    page.getByText('Model-dependent mission execution is blocked while LLM is unavailable.')
  ).toBeVisible();
  await expect(page.getByText('DEGRADED_NO_LLM')).toBeVisible();
  await expect(page.getByText(/traceId:\s*trace-degraded/i)).toBeVisible();
});

test('forge cycle tab surfaces halted status and blocks write controls', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    statusBody: {
      systemState: 'ACTIVE',
      threadCount: 5,
      degradedThreads: 0,
      haltedThreads: 2,
      traceId: 'trace-status'
    }
  });

  let cycleEventWrites = 0;

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        cursor: 0,
        nextCursor: 0,
        entries: [],
        traceId: 'trace-replay'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/acks**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        cursor: 0,
        nextCursor: 0,
        acks: [],
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    cycleEventWrites += 1;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        eventType: 'seat_taken',
        intent: 'SEAT_TAKEN',
        sequence: 1,
        timestamp: new Date().toISOString(),
        traceId: 'trace-seat'
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();

  const takeSeatButton = page.getByRole('button', { name: /take seat/i });
  await expect(page.getByText('Halted', { exact: true })).toBeVisible();
  await expect(page.getByText('Detected 2 halted thread(s). Write paths may be blocked.')).toBeVisible();
  await expect(page.getByText('Writes blocked: yes')).toBeVisible();
  await expect(takeSeatButton).toBeDisabled();
  expect(cycleEventWrites).toBe(0);
});

test('forge cycle tab surfaces quorum errors without hard-blocking writes', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page);

  let cycleEventWrites = 0;

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        cursor: 0,
        nextCursor: 0,
        entries: [],
        traceId: 'trace-replay'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/acks**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId: 'thread',
        cursor: 0,
        nextCursor: 0,
        acks: [],
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    cycleEventWrites += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PRISM_HOLDER_APPROVAL_REQUIRED',
        message: 'Material-impact intent requires 2 counselor attestations.',
        retryable: false,
        traceId: 'trace-quorum'
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();

  const takeSeatButton = page.getByRole('button', { name: /take seat/i });
  await expect(takeSeatButton).toBeEnabled();
  await takeSeatButton.click();

  await expect(page.getByText('Quorum Required')).toBeVisible();
  await expect(page.getByText('Material-impact intent requires 2 counselor attestations.')).toBeVisible();
  await expect(page.getByText(/traceId:\s*trace-quorum/i)).toBeVisible();
  await expect(page.getByText('Writes blocked: no')).toBeVisible();
  await expect(takeSeatButton).toBeEnabled();
  expect(cycleEventWrites).toBe(1);
});

test('forge cycle access controls disable remove/revoke for non-owner principals', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: false,
        ack: false,
        threadAcks: true
      }
    }
  });

  await page.route('**/api/v1/bff/sphere/lens-upgrade-rules', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        registryVersion: 'test-registry-v1',
        rules: [
          {
            ruleId: 'rule-lens-upgrade-v1',
            fromVersion: '1.0.0',
            toVersion: '1.1.0',
            priority: 10
          }
        ]
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
        principal: 'agent_member',
        requestPrincipal: 'agent_member',
        requestRole: 'member',
        members: [
          {
            threadId,
            principal: 'agent_owner',
            role: 'owner',
            joinedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            threadId,
            principal: 'agent_member',
            role: 'member',
            joinedAt: '2026-01-02T00:00:00.000Z'
          }
        ],
        count: 2
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
        requestPrincipal: 'agent_member',
        requestRole: 'member',
        invites: [
          {
            inviteCode: 'invite-code-abc',
            threadId,
            createdBy: 'agent_owner',
            label: 'Council cohort',
            purpose: 'Invite cohort members',
            maxUses: 25,
            usedCount: 3,
            remainingUses: 22,
            expiresAt: '2026-03-01T00:00:00.000Z',
            createdAt: '2026-01-02T00:00:00.000Z'
          },
          {
            inviteCode: 'invite-code-revoked',
            threadId,
            createdBy: 'agent_owner',
            label: 'Legacy cohort',
            purpose: 'Legacy invite flow',
            maxUses: 5,
            usedCount: 5,
            remainingUses: 0,
            expiresAt: '2026-02-01T00:00:00.000Z',
            revokedAt: '2026-02-02T18:00:00.000Z',
            revokedBy: 'agent_owner',
            revocationReason: 'duplicate invite',
            createdAt: '2026-01-02T00:00:00.000Z'
          }
        ],
        count: 2
      })
    });
  });

  await page.goto(`${TMA_URL}/forge?cycleThreadId=11111111-1111-4111-8111-111111111111`);
  await page.getByRole('button', { name: /cycle/i }).click();

  await expect(page.getByText('Thread Access Controls')).toBeVisible();
  await expect(
    page.getByText('Only owners can remove members. Invite revoke is limited to owners or invite creators.')
  ).toBeVisible();
  await expect(page.getByText('Only owners or invite creators can revoke this invite.')).toBeVisible();
  await expect(page.getByText(/label: Council cohort \| purpose: Invite cohort members/i)).toBeVisible();
  await expect(page.getByText(/created by agent_owner/i).first()).toBeVisible();
  await expect(page.getByText(/revoked by agent_owner at 2026-02-02 18:00:00Z/i)).toBeVisible();
  await expect(page.getByText(/reason: duplicate invite/i)).toBeVisible();

  await expect(page.getByRole('button', { name: 'REMOVE' }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'REVOKE' }).first()).toBeDisabled();
});

test('forge cycle owner revoke prompt sends optional reason to BFF revoke endpoint', async ({
  page
}) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: false,
        ack: false,
        threadAcks: true
      }
    }
  });

  const threadId = '11111111-1111-4111-8111-111111111112';
  let revokeReason: string | null = null;
  let revoked = false;

  await page.route('**/api/v1/bff/sphere/threads/*/members**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        principal: 'agent_owner',
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        members: [
          {
            threadId,
            principal: 'agent_owner',
            role: 'owner',
            joinedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            threadId,
            principal: 'agent_member',
            role: 'member',
            joinedAt: '2026-01-02T00:00:00.000Z'
          }
        ],
        count: 2
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        invites: [
          revoked
            ? {
                inviteCode: 'invite-code-owner',
                threadId,
                createdBy: 'agent_owner',
                label: 'Owner invite',
                purpose: 'Owner-managed invite',
                maxUses: 10,
                usedCount: 2,
                remainingUses: 8,
                expiresAt: '2026-03-01T00:00:00.000Z',
                revokedAt: '2026-02-03T12:00:00.000Z',
                revokedBy: 'agent_owner',
                revocationReason: revokeReason ?? undefined,
                createdAt: '2026-01-02T00:00:00.000Z'
              }
            : {
                inviteCode: 'invite-code-owner',
                threadId,
                createdBy: 'agent_owner',
                label: 'Owner invite',
                purpose: 'Owner-managed invite',
                maxUses: 10,
                usedCount: 2,
                remainingUses: 8,
                expiresAt: '2026-03-01T00:00:00.000Z',
                createdAt: '2026-01-02T00:00:00.000Z'
              }
        ],
        count: 1
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites/*/revoke', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    revokeReason = typeof body.reason === 'string' ? body.reason : null;
    revoked = true;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        invite: {
          inviteCode: 'invite-code-owner',
          threadId,
          createdBy: 'agent_owner',
          label: 'Owner invite',
          purpose: 'Owner-managed invite',
          maxUses: 10,
          usedCount: 2,
          remainingUses: 8,
          revokedAt: '2026-02-03T12:00:00.000Z',
          revokedBy: 'agent_owner',
          revocationReason: revokeReason ?? undefined,
          createdAt: '2026-01-02T00:00:00.000Z'
        }
      })
    });
  });

  await page.goto(`${TMA_URL}/forge?cycleThreadId=${threadId}`);
  await page.getByRole('button', { name: /cycle/i }).click();

  await expect(page.getByRole('button', { name: 'REMOVE' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: 'REVOKE' }).first()).toBeEnabled();

  page.once('dialog', (dialog) => {
    void dialog.accept('rotation cleanup');
  });
  await page.getByRole('button', { name: 'REVOKE' }).first().click();

  await expect.poll(() => revokeReason).toBe('rotation cleanup');
  await expect(page.getByText(/Invite revoked\./i)).toBeVisible();
  await expect(page.getByText(/reason: rotation cleanup/i)).toBeVisible();
});

test('forge cycle invite revoke denial surfaces API message and keeps invite active', async ({
  page
}) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: false,
        ack: false,
        threadAcks: true
      }
    }
  });

  const threadId = '11111111-1111-4111-8111-111111111115';
  let revokeAttempted = false;

  await page.route('**/api/v1/bff/sphere/threads/*/members**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        principal: 'agent_owner',
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        members: [
          {
            threadId,
            principal: 'agent_owner',
            role: 'owner',
            joinedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            threadId,
            principal: 'agent_member',
            role: 'member',
            joinedAt: '2026-01-02T00:00:00.000Z'
          }
        ],
        count: 2
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        invites: [
          {
            inviteCode: 'invite-code-owner-denied',
            threadId,
            createdBy: 'agent_owner',
            label: 'Owner invite',
            purpose: 'Owner-managed invite',
            maxUses: 10,
            usedCount: 2,
            remainingUses: 8,
            expiresAt: '2026-03-01T00:00:00.000Z',
            createdAt: '2026-01-02T00:00:00.000Z'
          }
        ],
        count: 1
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites/*/revoke', async (route) => {
    revokeAttempted = true;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'BFF_ERR_OWNER_REQUIRED',
        message: 'Only thread owner or invite creator can revoke this invite.',
        retryable: false,
        details: {
          threadId,
          principal: 'agent_owner'
        },
        traceId: 'trace-revoke-denied'
      })
    });
  });

  await page.goto(`${TMA_URL}/forge?cycleThreadId=${threadId}`);
  await page.getByRole('button', { name: /cycle/i }).click();

  page.once('dialog', (dialog) => {
    void dialog.accept('policy review');
  });
  await page.getByRole('button', { name: 'REVOKE' }).first().click();

  await expect.poll(() => revokeAttempted).toBe(true);
  await expect(page.getByText('Only thread owner or invite creator can revoke this invite.')).toBeVisible();
  await expect(page.getByText('Invite revoked.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'REVOKE' }).first()).toBeVisible();
});

test('forge cycle owner remove action sends DELETE member request and refreshes list', async ({
  page
}) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: false,
        ack: false,
        threadAcks: true
      }
    }
  });

  const threadId = '11111111-1111-4111-8111-111111111113';
  let removedPrincipal: string | null = null;
  let memberRemoved = false;

  await page.route('**/api/v1/bff/sphere/threads/*/members**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        principal: 'agent_owner',
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        members: memberRemoved
          ? [
              {
                threadId,
                principal: 'agent_owner',
                role: 'owner',
                joinedAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          : [
              {
                threadId,
                principal: 'agent_owner',
                role: 'owner',
                joinedAt: '2026-01-01T00:00:00.000Z'
              },
              {
                threadId,
                principal: 'agent_member',
                role: 'member',
                joinedAt: '2026-01-02T00:00:00.000Z'
              }
            ],
        count: memberRemoved ? 1 : 2
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        invites: [],
        count: 0
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/members/*', async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    removedPrincipal = decodeURIComponent(parts[parts.length - 1] ?? '');
    memberRemoved = true;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        removal: {
          threadId,
          principal: removedPrincipal,
          role: 'member',
          removedAt: '2026-02-03T12:00:00.000Z'
        }
      })
    });
  });

  await page.goto(`${TMA_URL}/forge?cycleThreadId=${threadId}`);
  await page.getByRole('button', { name: /cycle/i }).click();

  await expect(page.getByText('agent_member')).toBeVisible();

  const memberRow = page
    .locator('div')
    .filter({ hasText: 'agent_member' })
    .filter({ hasText: 'member' })
    .first();
  await memberRow.getByRole('button', { name: 'REMOVE' }).click();

  await expect.poll(() => removedPrincipal).toBe('agent_member');
  await expect.poll(() => memberRemoved).toBe(true);
  await expect(page.getByText('agent_member')).toHaveCount(0);
});

test('forge cycle owner remove denial surfaces API message and preserves member list', async ({
  page
}) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: false,
        ack: false,
        threadAcks: true
      }
    }
  });

  const threadId = '11111111-1111-4111-8111-111111111114';
  let attemptedRemovalPrincipal: string | null = null;

  await page.route('**/api/v1/bff/sphere/threads/*/members**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        principal: 'agent_owner',
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        members: [
          {
            threadId,
            principal: 'agent_owner',
            role: 'owner',
            joinedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            threadId,
            principal: 'agent_member',
            role: 'member',
            joinedAt: '2026-01-02T00:00:00.000Z'
          }
        ],
        count: 2
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/invites**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        requestPrincipal: 'agent_owner',
        requestRole: 'owner',
        invites: [],
        count: 0
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/members/*', async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    attemptedRemovalPrincipal = decodeURIComponent(parts[parts.length - 1] ?? '');

    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'BFF_ERR_OWNER_REQUIRED',
        message: 'Only thread owner can remove members.',
        retryable: false,
        details: {
          threadId,
          principal: 'agent_owner'
        },
        traceId: 'trace-owner-required'
      })
    });
  });

  await page.goto(`${TMA_URL}/forge?cycleThreadId=${threadId}`);
  await page.getByRole('button', { name: /cycle/i }).click();

  await expect(page.getByText('agent_member')).toBeVisible();

  const memberRow = page
    .locator('div')
    .filter({ hasText: 'agent_member' })
    .filter({ hasText: 'member' })
    .first();
  await memberRow.getByRole('button', { name: 'REMOVE' }).click();

  await expect.poll(() => attemptedRemovalPrincipal).toBe('agent_member');
  await expect(page.getByText('Only thread owner can remove members.')).toBeVisible();
  await expect(page.getByText('agent_member')).toHaveCount(1);
  await expect(page.getByText('Member removed.')).toHaveCount(0);
});

test('forge cycle tab completes seat -> perspective -> synthesis -> lens upgrade with ACKs', async ({
  page
}) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: false,
        ack: true,
        threadAcks: true
      }
    }
  });

  const entries: Array<{
    clientEnvelope: Record<string, unknown>;
    ledgerEnvelope: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];
  const cycleWrites: Array<Record<string, unknown>> = [];
  const acks: Array<Record<string, unknown>> = [];
  const ackWrites: Array<Record<string, unknown>> = [];

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    cycleWrites.push(body);
    const threadId = String(body.threadId);
    const eventType = String(body.eventType);
    const messageId = String(body.messageId);
    const traceId = String(body.traceId);
    const sequence = entries.length + 1;
    const intent =
      eventType === 'seat_taken'
        ? 'SEAT_TAKEN'
        : eventType === 'perspective_submitted'
          ? 'PERSPECTIVE_SUBMITTED'
          : eventType === 'synthesis_returned'
            ? 'SYNTHESIS_RETURNED'
            : 'LENS_UPGRADED';

    entries.push({
      clientEnvelope: {
        messageId,
        threadId,
        authorAgentId: body.authorAgentId,
        intent,
        protocolVersion: '3.0',
        schemaVersion: '3.0',
        traceId,
        causationId: body.causationId ?? [],
        attestation: body.attestation ?? [],
        agentSignature: body.agentSignature
      },
      ledgerEnvelope: {
        schemaVersion: '3.0',
        sequence,
        prevMessageHash: sequence === 1 ? 'GENESIS' : `hash-${sequence - 1}`,
        timestamp: new Date().toISOString(),
        conductorSignature: `sig-${sequence}`
      },
      payload: {
        ...(body.payload as Record<string, unknown> | undefined),
        cycleEventType: eventType
      }
    });

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        eventType,
        intent,
        sequence,
        timestamp: new Date().toISOString(),
        traceId
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/replay**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const cursorParam = Number.parseInt(requestUrl.searchParams.get('cursor') ?? '0', 10);
    const cursor = Number.isNaN(cursorParam) ? 0 : cursorParam;
    const replayEntries = entries.filter((entry) => Number(entry.ledgerEnvelope.sequence) > cursor);
    const nextCursor =
      replayEntries.length > 0
        ? Number(replayEntries[replayEntries.length - 1].ledgerEnvelope.sequence)
        : cursor;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor,
        nextCursor,
        entries: replayEntries,
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
    const replayAcks = acks.filter((ack) => Number(ack.ackId) > cursor);
    const nextCursor = replayAcks.length > 0 ? Number(replayAcks[replayAcks.length - 1].ackId) : cursor;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor,
        nextCursor,
        acks: replayAcks,
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/ack', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const body = route.request().postDataJSON() as Record<string, unknown>;
    ackWrites.push(body);
    const ackId = acks.length + 1;
    const ackRecord = {
      ackId,
      threadId,
      targetSequence: body.targetSequence,
      targetMessageId: body.targetMessageId,
      actorDid: body.actorDid,
      ackMessageId: body.ackMessageId,
      traceId: body.traceId,
      intent: body.intent,
      schemaVersion: body.schemaVersion,
      attestation: body.attestation ?? [],
      agentSignature: body.agentSignature,
      receivedAt: body.receivedAt ?? null,
      acknowledgedAt: new Date().toISOString()
    };
    acks.push(ackRecord);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ack: ackRecord,
        traceId: body.traceId
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();

  await page.getByRole('button', { name: 'TAKE SEAT' }).click();

  await page.getByPlaceholder('Enter your perspective for this cycle').fill(
    'I support a cautious rollout with explicit review checkpoints.'
  );
  await page
    .getByPlaceholder('Leave blank to auto-generate via drill')
    .fill('Consensus: run a phased rollout and keep minority dissent visible.');
  await page.getByRole('button', { name: 'SUBMIT PERSPECTIVE + RECORD SYNTHESIS' }).click();

  await page
    .getByPlaceholder('What changed in your lens after this cycle?')
    .fill('I now value explicit dissent tracking in final synthesis.');
  await page.getByRole('button', { name: 'RECORD LENS UPGRADE' }).click();

  await expect(page.getByText('Seat Taken', { exact: true })).toBeVisible();
  await expect(page.getByText('Perspective Submitted', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthesis Returned', { exact: true })).toBeVisible();
  await expect(page.getByText('Lens Upgraded', { exact: true })).toBeVisible();
  await expect(page.getByText('Phase: Lens Upgraded')).toBeVisible();

  await expect.poll(() => ackWrites.length).toBeGreaterThanOrEqual(4);
  await expect(page.getByText('seq 4')).toBeVisible();

  const lensUpgradeWrite = cycleWrites.find((write) => write.eventType === 'lens_upgraded') as
    | { payload?: Record<string, unknown> }
    | undefined;
  expect(lensUpgradeWrite).toBeTruthy();
  expect(lensUpgradeWrite?.payload?.ruleId).toBe('rule-lens-upgrade-v1');
  expect(lensUpgradeWrite?.payload?.previousLensVersion).toBe('1.0.0');
  expect(lensUpgradeWrite?.payload?.nextLensVersion).toBe('1.1.0');
});

test('forge cycle stream auto-acks incoming SSE log entries', async ({ page }) => {
  await mockAtlasAndForgeBootstrap(page);
  await mockSphereBoundary(page, {
    capabilitiesBody: {
      sphereThreadEnabled: true,
      features: {
        cycleEvents: true,
        replay: true,
        stream: true,
        ack: true,
        threadAcks: true
      }
    }
  });

  const acks: Array<Record<string, unknown>> = [];
  const ackWrites: Array<Record<string, unknown>> = [];
  let streamRequestCount = 0;

  await page.route('**/api/v1/bff/sphere/cycle-events', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const threadId = String(body.threadId);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        eventType: body.eventType,
        intent: 'SEAT_TAKEN',
        sequence: 1,
        timestamp: new Date().toISOString(),
        traceId: body.traceId
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
    const replayAcks = acks.filter((ack) => Number(ack.ackId) > cursor);
    const nextCursor = replayAcks.length > 0 ? Number(replayAcks[replayAcks.length - 1].ackId) : cursor;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threadId,
        cursor,
        nextCursor,
        acks: replayAcks,
        traceId: 'trace-acks'
      })
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/stream**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    streamRequestCount += 1;

    const readyEvent = `retry: 1000\n\nevent: ready\ndata: ${JSON.stringify({
      threadId,
      missionId: 'mission-stream',
      state: 'ACTIVE',
      cursor: 0,
      ackCursor: 0,
      retryMs: 1000,
      traceId: 'trace-stream'
    })}\n\n`;

    const firstLogEntryEvent = `id: 7\nevent: log_entry\ndata: ${JSON.stringify({
      replay: false,
      cursor: 7,
      entry: {
        clientEnvelope: {
          messageId: '77777777-7777-4777-8777-777777777777',
          threadId,
          authorAgentId: 'did:key:zStream',
          intent: 'PERSPECTIVE_SUBMITTED',
          protocolVersion: '3.0',
          schemaVersion: '3.0',
          traceId: 'trace-log',
          causationId: [],
          attestation: [],
          agentSignature: 'sig-stream'
        },
        ledgerEnvelope: {
          schemaVersion: '3.0',
          sequence: 7,
          prevMessageHash: 'hash-6',
          timestamp: new Date().toISOString(),
          conductorSignature: 'sig-7'
        },
        payload: {
          cycleEventType: 'perspective_submitted',
          content: 'Streamed perspective.'
        }
      }
    })}\n\n`;

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamRequestCount === 1 ? `${readyEvent}${firstLogEntryEvent}` : readyEvent
    });
  });

  await page.route('**/api/v1/bff/sphere/threads/*/ack', async (route) => {
    const requestUrl = new URL(route.request().url());
    const threadId = requestUrl.pathname.split('/').slice(-2, -1)[0] || 'thread';
    const body = route.request().postDataJSON() as Record<string, unknown>;
    ackWrites.push(body);
    const ackId = acks.length + 1;
    const ackRecord = {
      ackId,
      threadId,
      targetSequence: body.targetSequence,
      targetMessageId: body.targetMessageId,
      actorDid: body.actorDid,
      ackMessageId: body.ackMessageId,
      traceId: body.traceId,
      intent: body.intent,
      schemaVersion: body.schemaVersion,
      attestation: body.attestation ?? [],
      agentSignature: body.agentSignature,
      receivedAt: body.receivedAt ?? null,
      acknowledgedAt: new Date().toISOString()
    };
    acks.push(ackRecord);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ack: ackRecord,
        traceId: body.traceId
      })
    });
  });

  await page.goto(`${TMA_URL}/`);
  await page.getByRole('button', { name: /the forge/i }).click();
  await page.getByRole('button', { name: /cycle/i }).click();
  await page.getByRole('button', { name: 'TAKE SEAT' }).click();

  await expect(page.getByText('Perspective Submitted', { exact: true })).toBeVisible();
  await expect.poll(() => ackWrites.length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => String(ackWrites[0]?.targetSequence ?? '')).toBe('7');
  await expect(page.getByText('seq 7')).toBeVisible();
});
