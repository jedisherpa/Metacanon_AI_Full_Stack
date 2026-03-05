const test = require('node:test');
const assert = require('node:assert/strict');

const { fileExists, readFile, readSrc } = require('./contractTestUtils');

const specSource = readFile('deliverables/metacanon-ai-implementation-spec-v1.md');
const storageSource = readSrc('storage.rs');
const observabilityModuleExists = fileExists('src/observability.rs');

test('spec contract still requires dual-tier observability outputs', () => {
  assert.ok(
    specSource.includes('full-events.log.enc'),
    'spec no longer contains full encrypted observability log path contract'
  );

  assert.ok(
    specSource.includes('redacted-graph.ndjson'),
    'spec no longer contains redacted graph log path contract'
  );
});

test('spec contract still requires 90-day retention', () => {
  assert.ok(
    specSource.includes('Observability retention: 90 days.'),
    'spec no longer requires 90-day observability retention'
  );

  assert.ok(
    specSource.includes('Both tiers retained for 90 days.'),
    'spec must retain both observability tiers for 90 days'
  );
});

test('observability module exists for runtime output/retention implementation', () => {
  assert.ok(
    observabilityModuleExists,
    'Missing src/observability.rs; cannot validate dual-tier output writes or retention job behavior'
  );
});

test('storage keeps runtime event timestamps required for retention pruning', () => {
  assert.ok(
    storageSource.includes('pub const TASK_RUNTIME_EVENTS_TABLE_NAME: &str = "task_runtime_events";'),
    'task runtime events table constant is missing'
  );

  assert.ok(
    storageSource.includes('created_at INTEGER NOT NULL'),
    'created_at timestamp is required for retention pruning windows'
  );
});

test(
  'observability module declares output file contracts and 90-day retention policy',
  { skip: !observabilityModuleExists },
  () => {
    const observabilitySource = readSrc('observability.rs');

    assert.ok(
      observabilitySource.includes('full-events.log.enc'),
      'observability module should write encrypted full-events log'
    );

    assert.ok(
      observabilitySource.includes('redacted-graph.ndjson'),
      'observability module should write redacted graph feed'
    );

    assert.match(
      observabilitySource,
      /90/,
      'observability module should encode the 90-day retention period'
    );

    assert.match(
      observabilitySource.toLowerCase(),
      /retention|prune|purge/,
      'observability module should include retention pruning logic'
    );
  }
);
