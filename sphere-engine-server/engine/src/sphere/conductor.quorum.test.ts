import { beforeAll, describe, expect, it, vi } from 'vitest';

let SphereConductor: any;

function setEnv(): void {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
  process.env.WS_TOKEN_SECRET =
    process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012';
  process.env.RUNTIME_ENV = process.env.RUNTIME_ENV || 'local';
}

function makeConductor(quorumCount = 2): any {
  const conductor = Object.create(SphereConductor.prototype) as any;
  conductor.governanceConfig = {
    materialImpactIntents: new Set(['FORCE_EVICT', 'AMEND_CONSTITUTION']),
    quorumCount
  };
  return conductor;
}

describe('SphereConductor material-impact quorum enforcement', () => {
  beforeAll(async () => {
    setEnv();
    const conductorModule = await import('./conductor.js');
    SphereConductor = conductorModule.SphereConductor;
  });

  it('accepts material-impact quorum when signed ACK approvals satisfy active counselor quorum', async () => {
    const conductor = makeConductor(2);
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { counselor_did: 'did:example:counselor-1' },
            { counselor_did: 'did:example:counselor-2' },
            { counselor_did: 'did:example:counselor-3' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { actor_did: 'did:example:counselor-1' },
            { actor_did: 'did:example:counselor-2' }
          ]
        })
    };

    await expect(
      conductor.enforceCounselQuorum(client as any, {
        threadId: '11111111-1111-4111-8111-111111111111',
        approvalRefs: [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333'
        ]
      })
    ).resolves.toBeUndefined();

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('target_message_id::text = ANY($2::text[])'),
      [
        '11111111-1111-4111-8111-111111111111',
        ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
      ]
    );
  });

  it('rejects material-impact quorum when approval refs are missing', async () => {
    const conductor = makeConductor(2);
    const client = {
      query: vi.fn()
    };

    await expect(
      conductor.enforceCounselQuorum(client as any, {
        threadId: '11111111-1111-4111-8111-111111111111',
        approvalRefs: []
      })
    ).rejects.toMatchObject({
      code: 'STM_ERR_MISSING_ATTESTATION'
    });

    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects material-impact quorum when signed ACK approvals do not meet quorum', async () => {
    const conductor = makeConductor(2);
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            { counselor_did: 'did:example:counselor-1' },
            { counselor_did: 'did:example:counselor-2' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ actor_did: 'did:example:counselor-1' }]
        })
    };

    await expect(
      conductor.enforceCounselQuorum(client as any, {
        threadId: '11111111-1111-4111-8111-111111111111',
        approvalRefs: ['22222222-2222-4222-8222-222222222222']
      })
    ).rejects.toMatchObject({
      code: 'STM_ERR_MISSING_ATTESTATION'
    });
  });
});
