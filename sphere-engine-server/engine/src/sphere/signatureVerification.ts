import { createPublicKey, type KeyObject, verify } from 'node:crypto';

const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

function fail(message: string): never {
  throw new SignatureVerificationError(message);
}

export function isDidKey(value: string): boolean {
  return value.startsWith('did:key:z');
}

function decodeBase64UrlStrict(value: string, errorMessage: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    fail(errorMessage);
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    fail(errorMessage);
  }

  return decoded;
}

function base58Decode(input: string): Buffer {
  if (!input) {
    return Buffer.alloc(0);
  }

  let value = 0n;
  for (const char of input) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) {
      fail('Invalid base58 character in did:key.');
    }
    value = value * 58n + BigInt(index);
  }

  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value % 256n));
    value /= 256n;
  }
  bytes.reverse();

  let leadingZeros = 0;
  for (const char of input) {
    if (char === '1') {
      leadingZeros += 1;
    } else {
      break;
    }
  }

  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(bytes)]);
}

function ed25519RawToPublicKey(rawPublicKey: Buffer): KeyObject {
  if (rawPublicKey.length !== 32) {
    fail('Ed25519 public key must be 32 bytes.');
  }

  const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]);
  return createPublicKey({
    key: spkiDer,
    format: 'der',
    type: 'spki'
  });
}

function decodeRawKey(input: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(input)) {
    return Buffer.from(input, 'hex');
  }

  try {
    const base64Url = decodeBase64UrlStrict(input, 'Invalid base64url public key.');
    if (base64Url.length === 32) {
      return base64Url;
    }
  } catch {
    // no-op
  }

  try {
    const base64 = Buffer.from(input, 'base64');
    if (base64.length === 32) {
      return base64;
    }
  } catch {
    // no-op
  }

  return null;
}

export function didKeyToPublicKey(did: string): KeyObject {
  if (!isDidKey(did)) {
    fail('did:key signer must include multibase z payload.');
  }

  const multibase = did.slice('did:key:'.length);
  const multicodecBytes = base58Decode(multibase.slice(1));
  if (multicodecBytes.length < 34) {
    fail('did:key payload is too short.');
  }

  const prefixBytes = multicodecBytes.subarray(0, 2);
  if (!prefixBytes.equals(ED25519_MULTICODEC_PREFIX)) {
    fail('did:key signer is not an Ed25519 key.');
  }

  const rawPublicKey = multicodecBytes.subarray(2);
  return ed25519RawToPublicKey(rawPublicKey);
}

export function publicKeyStringToKeyObject(publicKey: string): KeyObject {
  const normalized = publicKey.trim();
  if (!normalized) {
    fail('Public key string is empty.');
  }

  if (isDidKey(normalized)) {
    return didKeyToPublicKey(normalized);
  }

  if (normalized.includes('BEGIN PUBLIC KEY')) {
    try {
      return createPublicKey(normalized);
    } catch {
      fail('Invalid PEM public key.');
    }
  }

  const rawKey = decodeRawKey(normalized);
  if (rawKey) {
    return ed25519RawToPublicKey(rawKey);
  }

  fail('Unsupported public key format. Expected did:key, PEM, hex, or base64/base64url Ed25519 key.');
}

export function verifyCompactJwsEdDsa(params: {
  compactJws: string;
  canonicalPayload: string;
  publicKey: KeyObject;
}): void {
  const segments = params.compactJws.split('.');
  if (segments.length !== 3) {
    fail('agentSignature must be compact JWS with three segments.');
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  if (!headerSegment || !signatureSegment) {
    fail('Malformed JWS payload.');
  }

  const headerRaw = decodeBase64UrlStrict(headerSegment, 'Invalid JWS header encoding.').toString(
    'utf8'
  );
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(headerRaw) as Record<string, unknown>;
  } catch {
    fail('Invalid JWS header JSON.');
  }

  if (header.alg !== 'EdDSA') {
    fail('JWS alg must be EdDSA for Ed25519 verification.');
  }

  const payloadForSigning =
    payloadSegment.length > 0
      ? payloadSegment
      : Buffer.from(params.canonicalPayload, 'utf8').toString('base64url');

  if (payloadSegment.length > 0) {
    let payloadRaw: string;
    try {
      payloadRaw = decodeBase64UrlStrict(payloadSegment, 'Invalid JWS payload encoding.').toString(
        'utf8'
      );
    } catch {
      fail('Invalid JWS payload encoding.');
    }

    if (payloadRaw !== params.canonicalPayload) {
      fail('agentSignature payload does not match canonical payload.');
    }
  }

  let signature: Buffer;
  try {
    signature = decodeBase64UrlStrict(signatureSegment, 'Invalid JWS signature encoding.');
  } catch {
    fail('Invalid JWS signature encoding.');
  }

  if (signature.length === 0) {
    fail('JWS signature is empty.');
  }

  const signingInput = `${headerSegment}.${payloadForSigning}`;
  const valid = verify(null, Buffer.from(signingInput, 'utf8'), params.publicKey, signature);
  if (!valid) {
    fail('JWS signature verification failed.');
  }
}
