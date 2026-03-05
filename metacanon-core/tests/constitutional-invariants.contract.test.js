const test = require('node:test');
const assert = require('node:assert/strict');

const { fileExists, readFile, readSrc } = require('./contractTestUtils');

const adrSource = readFile('deliverables/metacanon-ai-codex-multi-agent-instructions.md');
const genesisSource = readSrc('genesis.rs');
const fheSource = readSrc('fhe.rs');
const morpheusProviderExists = fileExists('src/providers/morpheus.rs');

test('constitutional references still include Helios invariants', () => {
  assert.ok(
    adrSource.includes('Preserve constitutional invariants (including Helios 8/9/10).'),
    'multi-agent instructions no longer preserve constitutional/Helios invariants'
  );

  assert.ok(
    adrSource.includes('Do not bypass `validate_action()` before external dispatch.'),
    'validate_action pre-dispatch invariant is missing from project guardrails'
  );

  assert.ok(
    adrSource.includes('Do not serialize or expose `FhePrivateKey`.'),
    'FhePrivateKey locality invariant is missing from project guardrails'
  );
});

test('will vector remains first-class in SoulFile and integrity hash payload', () => {
  assert.ok(
    genesisSource.includes('pub will_vector: WillVector,'),
    'SoulFile must keep will_vector to enforce PL authority boundaries'
  );

  assert.ok(
    genesisSource.includes("will_vector: &'a WillVector,"),
    'SoulFile hash view must include WillVector'
  );

  assert.ok(
    genesisSource.includes('will_vector: &soul_file.will_vector,'),
    'genesis hash computation must include will_vector'
  );
});

test('FHE private key locality remains type-level enforced', () => {
  const privateKeyStructIndex = fheSource.indexOf('pub struct FhePrivateKey {');
  assert.notEqual(privateKeyStructIndex, -1, 'FhePrivateKey struct definition is missing');

  const leadingWindow = fheSource.slice(Math.max(0, privateKeyStructIndex - 160), privateKeyStructIndex + 40);
  assert.ok(
    !/derive\([^\)]*Serialize[^\)]*\)\s*pub struct FhePrivateKey/.test(leadingWindow),
    'FhePrivateKey must not derive Serialize'
  );

  assert.ok(
    !/derive\([^\)]*Deserialize[^\)]*\)\s*pub struct FhePrivateKey/.test(leadingWindow),
    'FhePrivateKey must not derive Deserialize'
  );

  assert.ok(
    fheSource.includes('key_material: Vec<u8>,'),
    'FhePrivateKey key_material field is missing'
  );

  assert.ok(
    !fheSource.includes('pub key_material: Vec<u8>,'),
    'FhePrivateKey key material must remain private'
  );

  assert.ok(
    fheSource.includes('.field("key_material", &"<redacted>")'),
    'FhePrivateKey Debug implementation must redact key material'
  );
});

test('morpheus provider file exists to enforce Helios pre-validation and encryption path', () => {
  assert.ok(
    morpheusProviderExists,
    'Missing src/providers/morpheus.rs; cannot validate Helios pre-validation/encryption invariants'
  );
});

test(
  'morpheus provider keeps validate_action before any remote dispatch and uses FheCiphertext',
  { skip: !morpheusProviderExists },
  () => {
    const morpheusSource = readSrc('providers/morpheus.rs');

    assert.ok(
      morpheusSource.includes('let ticket = self.validate_action(&req)?;') &&
        morpheusSource.includes('let remote_request = self.build_remote_request(&req, ticket)?;') &&
        morpheusSource.includes('let remote_response = self.dispatch_remote_compute(ticket, remote_request)?;'),
      'generate_response must call validate_action before building and dispatching remote request'
    );

    assert.match(
      morpheusSource,
      /FheCiphertext/,
      'Morpheus provider must route external payloads through FheCiphertext'
    );
  }
);
