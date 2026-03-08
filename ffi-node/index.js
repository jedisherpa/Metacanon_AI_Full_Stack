const fs = require("node:fs");
const path = require("node:path");

const addonPath = path.join(__dirname, "metacanon_ai.node");

if (!fs.existsSync(addonPath)) {
  throw new Error(
    `Native addon not found at ${addonPath}. Run 'npm run build:native' in ffi-node first.`
  );
}

const native = require(addonPath);

module.exports = {
  ...native,
  // Compatibility aliases so JS callers can use the Rust-style snake_case names.
  genesis_rite: native.genesisRite,
  validate_action: native.validateAction,
  log_event: native.logEvent,
  get_code_snippet: native.getCodeSnippet,
  get_will_vector: native.getWillVector,
  update_soul_file: native.updateSoulFile,
  get_compute_options: native.getComputeOptions,
  set_global_compute_provider: native.setGlobalComputeProvider,
  set_provider_priority: native.setProviderPriority,
  update_provider_config: native.updateProviderConfig,
  create_task_sub_sphere: native.createTaskSubSphere,
  get_sub_sphere_list: native.getSubSphereList,
  get_sub_sphere_status: native.getSubSphereStatus,
  pause_sub_sphere: native.pauseSubSphere,
  dissolve_sub_sphere: native.dissolveSubSphere,
  submit_sub_sphere_query: native.submitSubSphereQuery,
  update_telegram_integration: native.updateTelegramIntegration,
  update_discord_integration: native.updateDiscordIntegration,
  bind_agent_route: native.bindAgentRoute,
  bind_sub_sphere_prism_route: native.bindSubSpherePrismRoute,
  send_agent_message: native.sendAgentMessage,
  send_sub_sphere_prism_message: native.sendSubSpherePrismMessage,
  get_communication_status: native.getCommunicationStatus,
};
