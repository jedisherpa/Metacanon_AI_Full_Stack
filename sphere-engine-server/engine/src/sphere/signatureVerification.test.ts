import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  didKeyToPublicKey,
  publicKeyStringToKeyObject,
  SignatureVerificationError,
  verifyCompactJwsEdDsa
} from './signatureVerification.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(input: Buffer): string {
  if (input.length === 0) {
    return '';
  }

  let value = BigInt(`0x${input.toString('hex')}`);
  let encoded = '';

  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= 58n;
  }

  let leadingZeros = 0;
  for (const byte of input) {
    if (byte === 0) {
      leadingZeros += 1;
    } else {
      break;
    }
  }

  return `${'1'.repeat(leadingZeros)}${encoded}`;
}

function toDidKeyFromPublicKeyDer(spkiDer: Buffer): string {
  const rawPublicKey = spkiDer.subarray(spkiDer.length - 32);
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), rawPublicKey]);
  return `did:key:z${base58Encode(multicodec)}`;
}

function createJws(params: {
  payload: string;
  detached?: boolean;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}): string {
  const headerSegment = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf8').toString(
    'base64url'
  );
  const payloadSegment = params.detached
    ? ''
    : Buffer.from(params.payload, 'utf8').toString('base64url');
  const signingPayload =
    payloadSegment.length > 0
      ? payloadSegment
      : Buffer.from(params.payload, 'utf8').toString('base64url');
  const signingInput = `${headerSegment}.${signingPayload}`;
  const signature = sign(null, Buffer.from(signingInput, 'utf8'), params.privateKey).toString(
    'base64url'
  );
  return `${headerSegment}.${payloadSegment}.${signature}`;
}

describe('signatureVerification', () => {
  it('verifies an inline JWS for did:key signer', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const spkiDer = keyPair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const didKey = toDidKeyFromPublicKeyDer(spkiDer);
    const payload = JSON.stringify({ hello: 'world' });
    const compactJws = createJws({ payload, privateKey: keyPair.privateKey });

    verifyCompactJwsEdDsa({
      compactJws,
      canonicalPayload: payload,
      publicKey: didKeyToPublicKey(didKey)
    });
  });

  it('verifies a detached JWS for did:key signer', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const spkiDer = keyPair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const didKey = toDidKeyFromPublicKeyDer(spkiDer);
    const payload = JSON.stringify({ detached: true });
    const compactJws = createJws({ payload, privateKey: keyPair.privateKey, detached: true });

    verifyCompactJwsEdDsa({
      compactJws,
      canonicalPayload: payload,
      publicKey: didKeyToPublicKey(didKey)
    });
  });

  it('rejects when payload in JWS does not match canonical payload', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const compactJws = createJws({
      payload: JSON.stringify({ canonical: 'a' }),
      privateKey: keyPair.privateKey
    });

    expect(() =>
      verifyCompactJwsEdDsa({
        compactJws,
        canonicalPayload: JSON.stringify({ canonical: 'b' }),
        publicKey: publicKeyStringToKeyObject(pem)
      })
    ).toThrowError(SignatureVerificationError);
  });

  it('parses PEM and raw base64url public key formats', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const rawPublicKey = spkiDer.subarray(spkiDer.length - 32);
    const base64UrlRawKey = rawPublicKey.toString('base64url');
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

    expect(() => publicKeyStringToKeyObject(pem)).not.toThrow();
    expect(() => publicKeyStringToKeyObject(base64UrlRawKey)).not.toThrow();
  });

  it('rejects malformed base64url in JWS header segment', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const payload = JSON.stringify({ malformed: 'header' });
    const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url');
    const compactJws = `***.${payloadSegment}.ZmFrZQ`;

    expect(() =>
      verifyCompactJwsEdDsa({
        compactJws,
        canonicalPayload: payload,
        publicKey: keyPair.publicKey
      })
    ).toThrowError(SignatureVerificationError);
  });

  it('rejects malformed base64url in JWS payload segment', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const payload = JSON.stringify({ malformed: 'payload' });
    const headerSegment = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf8').toString(
      'base64url'
    );
    const compactJws = `${headerSegment}.abc*.ZmFrZQ`;

    expect(() =>
      verifyCompactJwsEdDsa({
        compactJws,
        canonicalPayload: payload,
        publicKey: keyPair.publicKey
      })
    ).toThrowError(SignatureVerificationError);
  });

  it('rejects malformed base64url in JWS signature segment', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const payload = JSON.stringify({ malformed: 'signature' });
    const headerSegment = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf8').toString(
      'base64url'
    );
    const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url');
    const compactJws = `${headerSegment}.${payloadSegment}.abc*`;

    expect(() =>
      verifyCompactJwsEdDsa({
        compactJws,
        canonicalPayload: payload,
        publicKey: keyPair.publicKey
      })
    ).toThrowError(SignatureVerificationError);
  });
});
