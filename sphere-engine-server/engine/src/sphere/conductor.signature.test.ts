import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

let SphereConductor: any;
let ConductorError: any;

function setEnv(): void {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://council:council@localhost:5432/council';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.LENS_PACK = process.env.LENS_PACK || 'hands-of-the-void';
  process.env.ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'test-password';
  process.env.KIMI_API_KEY = process.env.KIMI_API_KEY || 'test-kimi-key';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
  process.env.WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || '12345678901234567890123456789012';
}

function makeConductor(
  signatureVerificationMode: 'off' | 'did_key' | 'strict' = 'did_key',
  resolveDidPublicKey?: (did: string) => Promise<string | null>
): any {
  const conductor = Object.create(SphereConductor.prototype) as any;
  conductor.signatureVerificationMode = signatureVerificationMode;
  conductor.conductorSecret = 'test-conductor-secret';
  conductor.resolveDidPublicKey = resolveDidPublicKey;
  return conductor;
}

function createJws(params: {
  payload: string;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}): string {
  const headerSegment = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf8').toString(
    'base64url'
  );
  const payloadSegment = Buffer.from(params.payload, 'utf8').toString('base64url');
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = sign(null, Buffer.from(signingInput, 'utf8'), params.privateKey).toString(
    'base64url'
  );
  return `${headerSegment}.${payloadSegment}.${signature}`;
}

describe('SphereConductor signature hardening', () => {
  beforeAll(async () => {
    setEnv();
    const conductorModule = await import('./conductor.js');
    SphereConductor = conductorModule.SphereConductor;
    ConductorError = conductorModule.ConductorError;
  });

  it('re-signs non-did:key caller signatures in did_key mode', async () => {
    const conductor = makeConductor('did_key');
    const legacyPayload = { k: 'v' };

    const signature = await conductor.resolveAgentSignature({
      signerDid: 'did:example:legacy-agent',
      providedSignature: 'unverified-caller-signature',
      canonicalPayload: '{"k":"v"}',
      legacyPayload,
      context: 'dispatch'
    });

    expect(signature).not.toBe('unverified-caller-signature');
    expect(signature).toBe(conductor.signPayload(legacyPayload));
  });

  it('rejects compact JWS with empty payload segment for did:key signers', async () => {
    const conductor = makeConductor('did_key');

    await expect(
      conductor.resolveAgentSignature({
        signerDid: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        providedSignature: 'eyJhbGciOiJFZERTQSJ9..ZmFrZQ',
        canonicalPayload: '{"k":"v"}',
        legacyPayload: { k: 'v' },
        context: 'dispatch'
      })
    ).rejects.toThrowError(ConductorError);
  });

  it('rejects invalid base64url encoding in did:key JWS', async () => {
    const conductor = makeConductor('did_key');

    await expect(
      conductor.resolveAgentSignature({
        signerDid: 'did:key:z6Mkr4R8NnqYv6Uqv8n3n2Vg7p7c1Xb2HqW5fW3r8jN8H1xQ',
        providedSignature: '!invalid!.payload.signature',
        canonicalPayload: '{"k":"v"}',
        legacyPayload: { k: 'v' },
        context: 'dispatch'
      })
    ).rejects.toThrowError(ConductorError);
  });

  it('accepts strict-mode signatures for non did:key signers when registered key exists', async () => {
    const keyPair = generateKeyPairSync('ed25519');
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const canonicalPayload = '{"k":"v"}';
    const providedSignature = createJws({
      payload: canonicalPayload,
      privateKey: keyPair.privateKey
    });

    const conductor = makeConductor('strict', async (did) =>
      did === 'did:example:registered-agent' ? pem : null
    );

    const signature = await conductor.resolveAgentSignature({
      signerDid: 'did:example:registered-agent',
      providedSignature,
      canonicalPayload,
      legacyPayload: { k: 'v' },
      context: 'dispatch'
    });

    expect(signature).toBe(providedSignature);
  });
});
