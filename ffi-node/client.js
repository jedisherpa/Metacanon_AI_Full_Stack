function parseJsonResult(methodName, payload) {
  if (typeof payload !== "string") {
    throw new TypeError(`${methodName} expected JSON string result`);
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error(`${methodName} returned invalid JSON: ${error.message}`);
  }
}

function toJsonPayload(value, label) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(`Failed to serialize ${label}: ${error.message}`);
  }
}

function createMetaCanonClient(nativeBridge) {
  const bridge = nativeBridge || require("./index.js");
  return {
    raw: bridge,

    genesisRite(request) {
      return parseJsonResult(
        "genesis_rite",
        bridge.genesis_rite(toJsonPayload(request, "genesis request"))
      );
    },

    validateAction(action, willVector) {
      return bridge.validate_action(
        toJsonPayload(action, "action"),
        toJsonPayload(willVector, "will vector")
      );
    },

    logEvent(traceId, eventType, payload) {
      return bridge.log_event(
        traceId,
        eventType,
        toJsonPayload(payload, "event payload")
      );
    },

    getCodeSnippet(filePath, startLine, endLine) {
      return bridge.get_code_snippet(filePath, startLine, endLine);
    },

    getWillVector(soulFile) {
      return parseJsonResult(
        "get_will_vector",
        bridge.get_will_vector(toJsonPayload(soulFile, "soul file"))
      );
    },

    updateSoulFile(soulFile, patch, signingSecret) {
      return parseJsonResult(
        "update_soul_file",
        bridge.update_soul_file(
          toJsonPayload(soulFile, "soul file"),
          toJsonPayload(patch, "soul file patch"),
          signingSecret
        )
      );
    },

    getComputeOptions() {
      return parseJsonResult(
        "get_compute_options",
        bridge.get_compute_options()
      );
    },

    setGlobalComputeProvider(providerId) {
      return parseJsonResult(
        "set_global_compute_provider",
        bridge.set_global_compute_provider(providerId)
      );
    },

    setProviderPriority(priorityList) {
      return parseJsonResult(
        "set_provider_priority",
        bridge.set_provider_priority(toJsonPayload(priorityList, "provider priority"))
      );
    },

    updateProviderConfig(providerId, patch) {
      return parseJsonResult(
        "update_provider_config",
        bridge.update_provider_config(providerId, toJsonPayload(patch, "provider config"))
      );
    },

    createTaskSubSphere(name, objective, hitlRequired = false) {
      return parseJsonResult(
        "create_task_sub_sphere",
        bridge.create_task_sub_sphere(name, objective, hitlRequired)
      );
    },

    getSubSphereList() {
      return parseJsonResult("get_sub_sphere_list", bridge.get_sub_sphere_list());
    },

    getSubSphereStatus(subSphereId) {
      return parseJsonResult(
        "get_sub_sphere_status",
        bridge.get_sub_sphere_status(subSphereId)
      );
    },

    pauseSubSphere(subSphereId) {
      return parseJsonResult("pause_sub_sphere", bridge.pause_sub_sphere(subSphereId));
    },

    dissolveSubSphere(subSphereId, reason) {
      return parseJsonResult(
        "dissolve_sub_sphere",
        bridge.dissolve_sub_sphere(subSphereId, reason)
      );
    },

    submitSubSphereQuery(subSphereId, query, providerOverride = null) {
      return parseJsonResult(
        "submit_sub_sphere_query",
        bridge.submit_sub_sphere_query(subSphereId, query, providerOverride)
      );
    },

    updateTelegramIntegration(config) {
      return parseJsonResult(
        "update_telegram_integration",
        bridge.update_telegram_integration(
          toJsonPayload(config, "telegram integration config")
        )
      );
    },

    updateDiscordIntegration(config) {
      return parseJsonResult(
        "update_discord_integration",
        bridge.update_discord_integration(
          toJsonPayload(config, "discord integration config")
        )
      );
    },

    bindAgentRoute(
      agentId,
      telegramChatId = null,
      discordThreadId = null,
      inAppThreadId = null,
      isOrchestrator = false
    ) {
      return parseJsonResult(
        "bind_agent_route",
        bridge.bind_agent_route(
          agentId,
          telegramChatId,
          discordThreadId,
          inAppThreadId,
          isOrchestrator
        )
      );
    },

    bindSubSpherePrismRoute(
      subSphereId,
      prismAgentId,
      telegramChatId = null,
      discordThreadId = null,
      inAppThreadId = null
    ) {
      return parseJsonResult(
        "bind_sub_sphere_prism_route",
        bridge.bind_sub_sphere_prism_route(
          subSphereId,
          prismAgentId,
          telegramChatId,
          discordThreadId,
          inAppThreadId
        )
      );
    },

    sendAgentMessage(platform, agentId, message) {
      return parseJsonResult(
        "send_agent_message",
        bridge.send_agent_message(platform, agentId, message)
      );
    },

    sendSubSpherePrismMessage(platform, subSphereId, message) {
      return parseJsonResult(
        "send_sub_sphere_prism_message",
        bridge.send_sub_sphere_prism_message(platform, subSphereId, message)
      );
    },

    getCommunicationStatus() {
      return parseJsonResult(
        "get_communication_status",
        bridge.get_communication_status()
      );
    },
  };
}

module.exports = {
  createMetaCanonClient,
};
