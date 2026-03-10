// Contract mirror for runtime bridge parity checks.
// Canonical implementation lives in ../ffi-node/commands.js when the full stack workspace is present.

function createInstallerWebappCommands() {
  return {
    raw: null,
    logEvent(traceId, eventType, payload) {},
    getCodeSnippet(filePath, startLine, endLine) {},
    getWillVector(soulFile) {},
    updateSoulFile(soulFile, patch, signingSecret) {},
    getComputeOptions() {},
    setGlobalComputeProvider(providerId) {},
    setProviderPriority(cloudProviderPriority) {},
    updateProviderConfig(providerId, config) {},
    invokeGenesisRite(request) {},
    validateAction(action, willVector) {},
    createTaskSubSphere(payload) {},
    getSubSphereList() {},
    getSubSphereStatus(subSphereId) {},
    pauseSubSphere(subSphereId) {},
    dissolveSubSphere(subSphereId, reason) {},
    submitSubSphereQuery(subSphereId, query, providerOverride = null) {},
    updateTelegramIntegration(config) {},
    updateDiscordIntegration(config) {},
    bindAgentCommunicationRoute(payload) {},
    bindSubSpherePrismRoute(payload) {},
    sendAgentMessage(payload) {},
    sendSubSpherePrismMessage(payload) {},
    getCommunicationStatus() {}
  };
}

module.exports = {
  createInstallerWebappCommands
};
