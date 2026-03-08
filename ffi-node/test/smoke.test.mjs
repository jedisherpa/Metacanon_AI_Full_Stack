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
const { createInstallerWebappCommands } = require(path.join(nodeRoot, "commands.js"));

const client = createMetaCanonClient();
const commands = createInstallerWebappCommands({ client });

test("validate_action returns true for aligned action", () => {
  const action = {
    target: "llm_call",
    content:
      "protect private thoughts and require human approval before external actions",
    metadata: {},
  };
  const willVector = {
    directives: [
      "protect private thoughts",
      "human approval before external actions",
    ],
  };

  const ok = commands.validateAction(action, willVector);
  assert.equal(ok, true);
});

test("genesis_rite and get_will_vector round trip", () => {
  const genesisRequest = {
    vision_core: "MetaCanon Node FFI",
    core_values: ["Sovereignty", "Clarity"],
    soul_facets: [],
    human_in_loop: true,
    interpretive_boundaries: [],
    drift_prevention: "strict",
    enable_morpheus_compute: false,
    morpheus: {},
    will_directives: ["protect private thoughts"],
    signing_secret: "ffi-test-secret",
  };

  const result = commands.invokeGenesisRite(genesisRequest);
  assert.ok(result.genesis_hash);
  assert.ok(result.signature);
  assert.ok(result.soul_file);

  const willVector = commands.getWillVector(result.soul_file);
  assert.equal(willVector.directives.length, 1);
  assert.equal(willVector.directives[0], "protect private thoughts");
});

test("get_code_snippet returns non-empty source snippet", () => {
  const root = path.join(nodeRoot, "..");
  const snippet = commands.getCodeSnippet(path.join(root, "metacanon-core", "src", "lib.rs"), 1, 4);
  assert.ok(snippet.includes("pub mod"));
});

test("update_soul_file regenerates genesis hash", () => {
  const genesisRequest = {
    vision_core: "MetaCanon Node Patch",
    core_values: ["Sovereignty"],
    soul_facets: [],
    human_in_loop: true,
    interpretive_boundaries: [],
    drift_prevention: "strict",
    enable_morpheus_compute: false,
    morpheus: {},
    will_directives: ["protect private thoughts"],
    signing_secret: "ffi-hash-a",
  };
  const result = commands.invokeGenesisRite(genesisRequest);
  const beforeHash = result.genesis_hash;

  const patchedSoulFile = commands.updateSoulFile(
    result.soul_file,
    { core_values: ["Sovereignty", "Integrity"] },
    "ffi-hash-b"
  );
  assert.notEqual(patchedSoulFile.genesis_hash, beforeHash);
});

test("log_event writes an observability event id", () => {
  const eventId = commands.logEvent(
    "ffi-smoke-trace",
    "ffi_smoke_event",
    { source: "node-smoke", status: "ok" }
  );
  assert.ok(eventId.length > 0);
});

test("typed installer/webapp command layer supports provider, sub-sphere, and communication flows", () => {
  const computeOptions = commands.getComputeOptions();
  assert.ok(Array.isArray(computeOptions));
  assert.ok(computeOptions.length >= 2);

  const providerConfig = commands.updateProviderConfig("openai", {
    api_key: "sk-ffi-test-key",
    available: true,
  });
  assert.equal(providerConfig.provider_id, "openai");

  const selectedProvider = commands.setGlobalComputeProvider("openai");
  assert.equal(selectedProvider.provider_id, "openai");

  const priority = commands.setProviderPriority(["anthropic", "grok"]);
  assert.deepEqual(priority.cloud_provider_priority, ["anthropic", "grok"]);

  const created = commands.createTaskSubSphere({
    name: "FFI Runtime",
    objective: "Validate lifecycle",
    hitl_required: false,
  });
  assert.ok(created.sub_sphere_id);

  const status = commands.getSubSphereStatus(created.sub_sphere_id);
  assert.equal(status.status, "active");

  const list = commands.getSubSphereList();
  assert.ok(list.some((entry) => entry.sub_sphere_id === created.sub_sphere_id));

  const paused = commands.pauseSubSphere(created.sub_sphere_id);
  assert.equal(paused.ok, true);

  const dissolved = commands.dissolveSubSphere(created.sub_sphere_id, "ffi lifecycle complete");
  assert.equal(dissolved.ok, true);

  const agentBinding = commands.bindAgentCommunicationRoute({
    agent_id: "agent-ffi",
    telegram_chat_id: null,
    discord_thread_id: null,
    in_app_thread_id: "inapp-agent-ffi",
    is_orchestrator: false,
  });
  assert.equal(agentBinding.agent_id, "agent-ffi");

  const agentDispatch = commands.sendAgentMessage({
    platform: "in_app",
    agent_id: "agent-ffi",
    message: "FFI says hello",
  });
  assert.equal(agentDispatch.agent_id, "agent-ffi");

  const createdPrism = commands.createTaskSubSphere({
    name: "FFI Prism",
    objective: "Validate prism route",
    hitl_required: false,
  });
  const prismBinding = commands.bindSubSpherePrismRoute({
    sub_sphere_id: createdPrism.sub_sphere_id,
    prism_agent_id: "agent-ffi",
    telegram_chat_id: null,
    discord_thread_id: null,
    in_app_thread_id: "inapp-prism-ffi",
  });
  assert.equal(prismBinding.sub_sphere_id, createdPrism.sub_sphere_id);

  const prismDispatch = commands.sendSubSpherePrismMessage({
    platform: "in_app",
    sub_sphere_id: createdPrism.sub_sphere_id,
    message: "Prism ping",
  });
  assert.equal(prismDispatch.sub_sphere_id, createdPrism.sub_sphere_id);

  const communicationStatus = commands.getCommunicationStatus();
  assert.ok(Array.isArray(communicationStatus.agent_bindings));
});
