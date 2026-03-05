const test = require('node:test');
const assert = require('node:assert/strict');

const { readSrc } = require('./contractTestUtils');

const computeSource = readSrc('compute.rs');
const qwenSource = readSrc('providers/qwen_local.rs');
const ollamaSource = readSrc('providers/ollama.rs');

test('compute router defaults to qwen local when setup/default is blank', () => {
  assert.ok(
    computeSource.includes('pub const PROVIDER_QWEN_LOCAL: &str = "qwen_local";'),
    'qwen_local provider id constant is missing'
  );

  assert.ok(
    computeSource.includes(
      'let global_default_provider = normalize_provider_id(global_default_provider.into())\n            .unwrap_or_else(|| PROVIDER_QWEN_LOCAL.to_string());'
    ),
    'global default provider does not fall back to qwen_local'
  );
});

test('provider switching supports global default and per-request override', () => {
  assert.ok(
    computeSource.includes('pub fn resolve_provider_id(&self, provider_override: Option<&str>) -> String {'),
    'resolve_provider_id contract is missing'
  );

  assert.ok(
    computeSource.includes('.and_then(normalize_provider_id)') &&
      computeSource.includes('.unwrap_or_else(|| self.global_default_provider.clone())'),
    'provider override should normalize first and then fall back to global default'
  );
});

test('fallback chain order is active provider then local then cloud', () => {
  assert.ok(
    computeSource.includes('fn required_local_fallback_priority() -> Vec<String> {') &&
      computeSource.includes('vec![PROVIDER_QWEN_LOCAL.to_string(), PROVIDER_OLLAMA.to_string()]') &&
      computeSource.includes('local_fallback_priority: required_local_fallback_priority()'),
    'local fallback priority must default to qwen_local then ollama'
  );

  const localLoopIndex = computeSource.indexOf('for provider_id in &self.local_fallback_priority');
  const cloudLoopIndex = computeSource.indexOf('for provider_id in &self.cloud_fallback_priority');

  assert.ok(localLoopIndex !== -1, 'local fallback iteration is missing');
  assert.ok(cloudLoopIndex !== -1, 'cloud fallback iteration is missing');
  assert.ok(localLoopIndex < cloudLoopIndex, 'cloud fallback must come after local fallback');

  assert.ok(
    computeSource.includes('let chain = self.provider_chain_for_request(req.provider_override.as_deref());'),
    'route_generate must route through computed fallback chain'
  );
});

test('provider chain normalization and dedupe remain enforced', () => {
  assert.ok(
    computeSource.includes('Some(trimmed.to_ascii_lowercase())'),
    'provider ids must be normalized to lowercase'
  );

  assert.ok(
    computeSource.includes('if seen.insert(provider_id.clone()) {') &&
      computeSource.includes('normalized.push(provider_id);'),
    'provider priority should be deduplicated in order'
  );
});

test('setup defaults keep required qwen local profile and ollama baseline', () => {
  assert.ok(
    qwenSource.includes('pub const QWEN_DEFAULT_LOCAL_TARGET: &str = "Qwen 3.5 32B Instruct GGUF Q8_0";'),
    'qwen default local target must be Qwen 3.5 32B Q8_0'
  );
  assert.ok(
    qwenSource.includes('pub const QWEN_DEFAULT_DOWNGRADE_PROFILE: &str = "Q5_K_M";'),
    'qwen downgrade profile must remain Q5_K_M'
  );
  assert.ok(
    qwenSource.includes('runtime_backend: "llama.cpp".to_string()'),
    'qwen local runtime backend default should remain llama.cpp'
  );

  assert.ok(
    ollamaSource.includes('pub const OLLAMA_DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";'),
    'ollama default base URL contract is missing'
  );
  assert.ok(
    ollamaSource.includes('pub const OLLAMA_DEFAULT_MODEL: &str = "qwen3.5:32b-instruct-q8_0";'),
    'ollama default model should remain qwen3.5:32b-instruct-q8_0'
  );
});
