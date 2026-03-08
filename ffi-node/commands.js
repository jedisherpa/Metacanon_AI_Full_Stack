const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function defaultSnapshotPath() {
  const home = process.env.HOME;
  return home
    ? path.join(home, '.metacanon_ai', 'runtime_snapshot.json')
    : '.metacanon_ai/runtime_snapshot.json';
}

function runtimeBinaryPath() {
  return process.env.METACANON_RUNTIME_CONTROL_BIN
    || path.join(repoRoot(), 'metacanon-core', 'target', 'debug', 'runtime_control');
}

function buildEnv() {
  return {
    ...process.env,
    PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH || ''}:${process.env.HOME || ''}/.cargo/bin`,
  };
}

function runRuntimeControl(command, args = []) {
  const snapshotPath = process.env.METACANON_RUNTIME_SNAPSHOT || defaultSnapshotPath();
  const fullArgs = ['--snapshot', snapshotPath, command, ...args];
  const binPath = runtimeBinaryPath();
  const opts = { cwd: repoRoot(), env: buildEnv(), encoding: 'utf8' };

  const result = fs.existsSync(binPath)
    ? spawnSync(binPath, fullArgs, opts)
    : spawnSync('cargo', ['run', '--quiet', '--bin', 'runtime_control', '--', ...fullArgs], {
        ...opts,
        cwd: path.join(repoRoot(), 'metacanon-core'),
      });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `runtime_control failed with status ${result.status}`).trim());
  }

  const stdout = (result.stdout || '').trim();
  return stdout ? JSON.parse(stdout) : null;
}

function createInstallerWebappCommands() {
  return {
    getComputeOptions() {
      return runRuntimeControl('get-compute-options');
    },
    setGlobalComputeProvider(providerId) {
      return runRuntimeControl('set-global-compute-provider', [providerId]);
    },
    setProviderPriority(cloudProviderPriority) {
      return runRuntimeControl('set-provider-priority', [JSON.stringify(cloudProviderPriority)]);
    },
    updateProviderConfig(providerId, config) {
      return runRuntimeControl('update-provider-config', [providerId, JSON.stringify(config)]);
    },
    invokeGenesisRite(request) {
      return runRuntimeControl('invoke-genesis-rite', [JSON.stringify(request)]);
    },
    validateAction(action, willVector) {
      const result = runRuntimeControl('validate-action', [JSON.stringify({ action, will_vector: willVector })]);
      return Boolean(result && result.valid);
    },
    createTaskSubSphere(payload) {
      return runRuntimeControl('create-task-sub-sphere', [JSON.stringify(payload)]);
    },
    getSubSphereList() {
      return runRuntimeControl('get-sub-sphere-list');
    },
    getSubSphereStatus(subSphereId) {
      return runRuntimeControl('get-sub-sphere-status', [subSphereId]);
    },
    pauseSubSphere(subSphereId) {
      return runRuntimeControl('pause-sub-sphere', [subSphereId]);
    },
    dissolveSubSphere(subSphereId, reason) {
      return runRuntimeControl('dissolve-sub-sphere', [subSphereId, reason]);
    },
    submitSubSphereQuery(subSphereId, query, providerOverride) {
      return runRuntimeControl('submit-sub-sphere-query', [subSphereId, JSON.stringify({ query, provider_override: providerOverride ?? null })]);
    },
    updateTelegramIntegration(config) {
      return runRuntimeControl('update-telegram-integration', [JSON.stringify(config)]);
    },
    updateDiscordIntegration(config) {
      return runRuntimeControl('update-discord-integration', [JSON.stringify(config)]);
    },
    bindAgentCommunicationRoute(payload) {
      return runRuntimeControl('bind-agent-route', [JSON.stringify(payload)]);
    },
    bindSubSpherePrismRoute(payload) {
      return runRuntimeControl('bind-sub-sphere-prism-route', [JSON.stringify(payload)]);
    },
    sendAgentMessage(payload) {
      return runRuntimeControl('send-agent-message', [JSON.stringify(payload)]);
    },
    sendSubSpherePrismMessage(payload) {
      return runRuntimeControl('send-sub-sphere-prism-message', [JSON.stringify(payload)]);
    },
    getCommunicationStatus() {
      return runRuntimeControl('get-communication-status');
    },
  };
}

module.exports = { createInstallerWebappCommands };
