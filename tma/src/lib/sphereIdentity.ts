const SPHERE_IDENTITY_STORAGE_KEY = 'lensforge_sphere_identity_v1';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

type StoredSphereIdentity = {
  did: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
};

type SphereSigner = {
  did: string;
  signCanonicalPayload: (payload: string) => Promise<string>;
};

let cachedSignerPromise: Promise<SphereSigner> | null = null;

function hasWebCrypto(): boolean {
  return typeof globalThis !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return '';
  }

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const x = digits[index] * 256 + carry;
      digits[index] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeroCount = 0;
  while (leadingZeroCount < bytes.length && bytes[leadingZeroCount] === 0) {
    leadingZeroCount += 1;
  }

  let output = '1'.repeat(leadingZeroCount);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += BASE58_ALPHABET[digits[index]];
  }

  return output;
}

function buildDidKeyFromRawPublicKey(rawPublicKey: Uint8Array): string {
  const multicodecKey = new Uint8Array(rawPublicKey.length + 2);
  multicodecKey[0] = 0xed;
  multicodecKey[1] = 0x01;
  multicodecKey.set(rawPublicKey, 2);
  return `did:key:z${base58Encode(multicodecKey)}`;
}

function readStoredIdentity(): StoredSphereIdentity | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SPHERE_IDENTITY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const candidate = parsed as StoredSphereIdentity;
    if (
      typeof candidate.did !== 'string' ||
      !candidate.did.startsWith('did:key:') ||
      typeof candidate.privateJwk !== 'object' ||
      typeof candidate.publicJwk !== 'object'
    ) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

function writeStoredIdentity(identity: StoredSphereIdentity): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SPHERE_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage failures.
  }
}

async function importStoredSigner(identity: StoredSphereIdentity): Promise<SphereSigner> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.privateJwk,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  return {
    did: identity.did,
    signCanonicalPayload: async (payload: string) => {
      const headerSegment = stringToBase64Url(JSON.stringify({ alg: 'EdDSA' }));
      const payloadSegment = stringToBase64Url(payload);
      const signingInput = `${headerSegment}.${payloadSegment}`;
      const signature = await crypto.subtle.sign(
        { name: 'Ed25519' },
        privateKey,
        new TextEncoder().encode(signingInput)
      );
      const signatureSegment = bytesToBase64Url(new Uint8Array(signature));
      return `${signingInput}.${signatureSegment}`;
    }
  };
}

async function createSigner(): Promise<SphereSigner> {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);

  const [privateJwk, publicJwk, rawPublicKeyBuffer] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('raw', keyPair.publicKey)
  ]);

  const did = buildDidKeyFromRawPublicKey(new Uint8Array(rawPublicKeyBuffer));
  writeStoredIdentity({
    did,
    privateJwk,
    publicJwk
  });

  return importStoredSigner({
    did,
    privateJwk,
    publicJwk
  });
}

export async function getSphereSigner(): Promise<SphereSigner> {
  if (!cachedSignerPromise) {
    cachedSignerPromise = (async () => {
      if (!hasWebCrypto()) {
        throw new Error('Web Crypto API unavailable. Cannot sign Sphere requests in this environment.');
      }

      const stored = readStoredIdentity();
      if (stored) {
        try {
          return await importStoredSigner(stored);
        } catch {
          // Fall through and replace invalid stored keys.
        }
      }

      return createSigner();
    })();
  }

  return cachedSignerPromise;
}
