import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nodeRoot = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const { createInstallerWebappCommands } = require(path.join(nodeRoot, "commands.js"));

test("command adapter maps installer payload fields to client methods", () => {
  let recorded = null;
  const commands = createInstallerWebappCommands({
    client: {
      createTaskSubSphere(name, objective, hitlRequired) {
        recorded = { name, objective, hitlRequired };
        return { sub_sphere_id: "sphere-1", status: "active" };
      },
    },
  });

  const result = commands.createTaskSubSphere({
    name: "Genesis Task",
    objective: "Validate adapter mapping",
    hitl_required: true,
  });

  assert.deepEqual(recorded, {
    name: "Genesis Task",
    objective: "Validate adapter mapping",
    hitlRequired: true,
  });
  assert.equal(result.sub_sphere_id, "sphere-1");
});

test("command adapter forwards agent route and messaging payloads", () => {
  let routePayload = null;
  let messagePayload = null;

  const commands = createInstallerWebappCommands({
    client: {
      bindAgentRoute(agentId, telegramChatId, discordThreadId, inAppThreadId, isOrchestrator) {
        routePayload = {
          agentId,
          telegramChatId,
          discordThreadId,
          inAppThreadId,
          isOrchestrator,
        };
        return { agent_id: agentId, in_app_thread_id: inAppThreadId };
      },
      sendAgentMessage(platform, agentId, message) {
        messagePayload = { platform, agentId, message };
        return { platform, agent_id: agentId, message_id: "msg-1" };
      },
    },
  });

  const routeResult = commands.bindAgentCommunicationRoute({
    agent_id: "agent-orchestrator",
    in_app_thread_id: "thread-1",
    is_orchestrator: true,
  });
  const messageResult = commands.sendAgentMessage({
    platform: "in_app",
    agent_id: "agent-orchestrator",
    message: "hello",
  });

  assert.deepEqual(routePayload, {
    agentId: "agent-orchestrator",
    telegramChatId: null,
    discordThreadId: null,
    inAppThreadId: "thread-1",
    isOrchestrator: true,
  });
  assert.deepEqual(messagePayload, {
    platform: "in_app",
    agentId: "agent-orchestrator",
    message: "hello",
  });
  assert.equal(routeResult.agent_id, "agent-orchestrator");
  assert.equal(messageResult.message_id, "msg-1");
});
