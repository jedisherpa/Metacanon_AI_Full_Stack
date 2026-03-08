const { createMetaCanonClient } = require("./client.js");

function createInstallerWebappCommands(options = {}) {
  const client = options.client || createMetaCanonClient(options.nativeBridge);

  return {
    raw: client,

    logEvent(traceId, eventType, payload) {
      return client.logEvent(traceId, eventType, payload);
    },

    getCodeSnippet(filePath, startLine, endLine) {
      return client.getCodeSnippet(filePath, startLine, endLine);
    },

    getWillVector(soulFile) {
      return client.getWillVector(soulFile);
    },

    updateSoulFile(soulFile, patch, signingSecret) {
      return client.updateSoulFile(soulFile, patch, signingSecret);
    },

    getComputeOptions() {
      return client.getComputeOptions();
    },

    setGlobalComputeProvider(providerId) {
      return client.setGlobalComputeProvider(providerId);
    },

    setProviderPriority(cloudProviderPriority) {
      return client.setProviderPriority(cloudProviderPriority);
    },

    updateProviderConfig(providerId, config) {
      return client.updateProviderConfig(providerId, config);
    },

    invokeGenesisRite(request) {
      return client.genesisRite(request);
    },

    validateAction(action, willVector) {
      return client.validateAction(action, willVector);
    },

    createTaskSubSphere(payload) {
      return client.createTaskSubSphere(payload.name, payload.objective, payload.hitl_required);
    },

    getSubSphereList() {
      return client.getSubSphereList();
    },

    getSubSphereStatus(subSphereId) {
      return client.getSubSphereStatus(subSphereId);
    },

    pauseSubSphere(subSphereId) {
      return client.pauseSubSphere(subSphereId);
    },

    dissolveSubSphere(subSphereId, reason) {
      return client.dissolveSubSphere(subSphereId, reason);
    },

    submitSubSphereQuery(subSphereId, query, providerOverride = null) {
      return client.submitSubSphereQuery(subSphereId, query, providerOverride);
    },

    updateTelegramIntegration(config) {
      return client.updateTelegramIntegration(config);
    },

    updateDiscordIntegration(config) {
      return client.updateDiscordIntegration(config);
    },

    bindAgentCommunicationRoute(payload) {
      return client.bindAgentRoute(
        payload.agent_id,
        payload.telegram_chat_id ?? null,
        payload.discord_thread_id ?? null,
        payload.in_app_thread_id ?? null,
        payload.is_orchestrator ?? false
      );
    },

    bindSubSpherePrismRoute(payload) {
      return client.bindSubSpherePrismRoute(
        payload.sub_sphere_id,
        payload.prism_agent_id,
        payload.telegram_chat_id ?? null,
        payload.discord_thread_id ?? null,
        payload.in_app_thread_id ?? null
      );
    },

    sendAgentMessage(payload) {
      return client.sendAgentMessage(payload.platform, payload.agent_id, payload.message);
    },

    sendSubSpherePrismMessage(payload) {
      return client.sendSubSpherePrismMessage(payload.platform, payload.sub_sphere_id, payload.message);
    },

    getCommunicationStatus() {
      return client.getCommunicationStatus();
    },
  };
}

module.exports = {
  createInstallerWebappCommands,
};
