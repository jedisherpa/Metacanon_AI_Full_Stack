import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nodeRoot = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const { createMetaCanonClient } = require(path.join(nodeRoot, "client.js"));

test("typed client serializes input and parses JSON output", () => {
  let providerIdSeen = null;
  let patchSeen = null;

  const client = createMetaCanonClient({
    update_provider_config(providerId, configJson) {
      providerIdSeen = providerId;
      patchSeen = JSON.parse(configJson);
      return JSON.stringify({
        provider_id: providerId,
        available: true,
      });
    },
  });

  const response = client.updateProviderConfig("grok", {
    api_key: "xai-test",
    model: "grok-4-0709",
  });

  assert.equal(providerIdSeen, "grok");
  assert.deepEqual(patchSeen, {
    api_key: "xai-test",
    model: "grok-4-0709",
  });
  assert.equal(response.provider_id, "grok");
  assert.equal(response.available, true);
});

test("typed client surfaces invalid JSON from native bridge", () => {
  const client = createMetaCanonClient({
    get_compute_options() {
      return "not-json";
    },
  });

  assert.throws(() => client.getComputeOptions(), /returned invalid JSON/);
});

test("typed client rejects non-serializable payloads", () => {
  const client = createMetaCanonClient({
    update_telegram_integration() {
      return JSON.stringify({ ok: true });
    },
  });

  const circular = {};
  circular.self = circular;

  assert.throws(
    () => client.updateTelegramIntegration(circular),
    /Failed to serialize telegram integration config/
  );
});
