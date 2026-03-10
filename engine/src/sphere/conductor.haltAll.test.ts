import { beforeAll, describe, expect, it, vi } from 'vitest';

let SphereConductor: any;
let ConductorError: any;

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
}

function makeConductor(params: {
  threads: Array<{ threadId: string; missionId: string }>;
  controlMessageId?: string;
}): any {
  const conductor = Object.create(SphereConductor.prototype) as any;
  conductor.ensureReady = vi.fn(async () => undefined);
  conductor.listThreads = vi.fn(async () => params.threads);
  conductor.dispatchIntent = vi
    .fn()
    .mockResolvedValueOnce({
      clientEnvelope: {
        messageId: params.controlMessageId ?? '11111111-1111-4111-8111-111111111111'
      }
    })
    .mockResolvedValue({
      clientEnvelope: {
        messageId: '22222222-2222-4222-8222-222222222222'
      }
    });
  return conductor;
}

describe('SphereConductor halt-all envelope propagation', () => {
  beforeAll(async () => {
    setEnv();
    const conductorModule = await import('./conductor.js');
    SphereConductor = conductorModule.SphereConductor;
    ConductorError = conductorModule.ConductorError;
  });

  it('consumes submitted halt-all envelope and fans out derived thread shutdown entries', async () => {
    const conductor = makeConductor({
      threads: [
        {
          threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          missionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        },
        {
          threadId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          missionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        }
      ],
      controlMessageId: '99999999-9999-4999-8999-999999999999'
    });

    const result = await conductor.haltAllThreads({
      actorDid: 'did:example:commander',
      actorRole: 'Commander',
      messageId: '11111111-1111-4111-8111-111111111111',
      traceId: '22222222-2222-4222-8222-222222222222',
      intent: 'EMERGENCY_SHUTDOWN',
      schemaVersion: '3.0',
      attestation: ['did:example:prism-holder'],
      agentSignature: 'sig:halt-all-command',
      reason: 'Emergency stop',
      confirmerDid: 'did:example:prism-holder',
      confirmerRole: 'Prism Holder',
      prismHolderApproved: true
    });

    expect(conductor.dispatchIntent).toHaveBeenCalledTimes(2);

    const controlCall = conductor.dispatchIntent.mock.calls[0][0];
    expect(controlCall.authorAgentId).toBe('did:example:commander');
    expect(controlCall.messageId).toBe('11111111-1111-4111-8111-111111111111');
    expect(controlCall.traceId).toBe('22222222-2222-4222-8222-222222222222');
    expect(controlCall.attestation).toEqual(['did:example:prism-holder']);
    expect(controlCall.agentSignature).toBe('sig:halt-all-command');

    const derivedCall = conductor.dispatchIntent.mock.calls[1][0];
    expect(derivedCall.authorAgentId).toBe('did:system:conductor');
    expect(derivedCall.intent).toBe('EMERGENCY_SHUTDOWN');
    expect(derivedCall.schemaVersion).toBe('3.0');
    expect(derivedCall.traceId).toBe('22222222-2222-4222-8222-222222222222');
    expect(derivedCall.causationId).toEqual(['99999999-9999-4999-8999-999999999999']);
    expect(derivedCall.derivedFromVerifiedCommand).toBe(true);

    expect(result).toEqual({
      haltedCount: 2,
      threadIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      ]
    });
  });

  it('rejects non EMERGENCY_SHUTDOWN intent in halt-all command envelope', async () => {
    const conductor = makeConductor({
      threads: [
        {
          threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          missionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        }
      ]
    });

    await expect(
      conductor.haltAllThreads({
        actorDid: 'did:example:commander',
        actorRole: 'Commander',
        messageId: '11111111-1111-4111-8111-111111111111',
        traceId: '22222222-2222-4222-8222-222222222222',
        intent: 'HALT_THREAD',
        schemaVersion: '3.0',
        attestation: ['did:example:prism-holder'],
        agentSignature: 'sig:halt-all-command',
        reason: 'Emergency stop'
      })
    ).rejects.toThrowError(ConductorError);
  });
});
