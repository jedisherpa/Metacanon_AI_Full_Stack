import { useEffect, useMemo, useState } from 'react';
import { installerApi } from './lib/api';
import type {
  AgentRoutingMode,
  CommunicationStatus,
  ComputeOption,
  GenesisRiteResult,
  InAppThreadMessage,
  InstallReviewSummary,
  LocalBootstrapStatus,
  LocalModelPackInstallResult,
  ObservabilityStatus,
  ProviderHealthStatus,
  SecurityPersistenceSettings,
  SystemCheckReport,
  TaskSubSphereSummary,
  TelegramInboundRecord,
  ThreeAgentBootstrapResult,
  WorkflowDefinition,
} from './lib/types';

type ThemeName = 'light' | 'void';
type ProviderConfigFieldType = 'text' | 'password' | 'checkbox';

type ProviderConfigField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: ProviderConfigFieldType;
};

const STEPS = [
  'Welcome',
  'System Check',
  'Compute Selection',
  'Provider Config',
  'Security & Persistence',
  'Observability',
  'Review & Install',
  'Done',
];

const DEFAULT_CLOUD_PRIORITY = 'openai,anthropic,moonshot_kimi,grok';
const DEFAULT_SNAPSHOT_PATH = '~/.metacanon_ai/runtime_snapshot.json';
const SMOKE_QUERY = 'Return a one-line installer verification status.';
const CORE_AGENT_IDS = ['agent-genesis', 'agent-synthesis', 'agent-auditor'];

function configFieldsForProvider(providerId: string): ProviderConfigField[] {
  switch (providerId) {
    case 'qwen_local':
      return [
        { key: 'primary_target', label: 'Primary Target', placeholder: 'Qwen 3.5 32B Instruct GGUF Q8_0' },
        { key: 'downgrade_profile', label: 'Downgrade Profile', placeholder: 'Q5_K_M' },
        { key: 'downgrade_target', label: 'Downgrade Target', placeholder: 'Qwen 3.5 32B Instruct GGUF Q5_K_M' },
        { key: 'runtime_backend', label: 'Runtime Backend', placeholder: 'ollama or llama.cpp' },
        { key: 'base_url', label: 'Local Base URL', placeholder: 'http://127.0.0.1:11434' },
        { key: 'primary_model_id', label: 'Primary Runtime Model ID', placeholder: 'qwen3.5:32b-instruct-q8_0' },
        { key: 'downgrade_model_id', label: 'Downgrade Runtime Model ID', placeholder: 'qwen3.5:32b-instruct-q5_k_m' },
        { key: 'llama_cpp_binary', label: 'llama.cpp Binary', placeholder: 'llama-cli' },
        { key: 'llama_cpp_model_path', label: 'llama.cpp Model Path', placeholder: '/path/to/model.gguf' },
        { key: 'live_api', label: 'Enable Live Local Transport', type: 'checkbox' },
      ];
    case 'ollama':
      return [
        { key: 'base_url', label: 'Ollama Base URL', placeholder: 'http://127.0.0.1:11434' },
        { key: 'default_model', label: 'Default Model', placeholder: 'qwen3.5:32b-instruct-q8_0' },
        { key: 'live_api', label: 'Enable Live Local Transport', type: 'checkbox' },
      ];
    case 'morpheus':
      return [
        { key: 'endpoint', label: 'Morpheus Endpoint', placeholder: 'https://morpheus.local/compute' },
        { key: 'model', label: 'Morpheus Model', placeholder: 'helios-default' },
        { key: 'router_id', label: 'Router ID', placeholder: 'helios-router-default' },
        { key: 'key_id', label: 'Key ID', placeholder: 'helios-local-key' },
      ];
    case 'openai':
      return [
        { key: 'api_key', label: 'OpenAI API Key', type: 'password', placeholder: 'sk-...' },
        { key: 'base_url', label: 'OpenAI Base URL', placeholder: 'https://api.openai.com/v1' },
        { key: 'chat_model', label: 'Chat Model', placeholder: 'gpt-4.1' },
        { key: 'embedding_model', label: 'Embedding Model', placeholder: 'text-embedding-3-large' },
        { key: 'live_api', label: 'Enable Live API Transport', type: 'checkbox' },
      ];
    case 'anthropic':
      return [
        { key: 'api_key', label: 'Anthropic API Key', type: 'password', placeholder: 'sk-ant-...' },
        { key: 'base_url', label: 'Anthropic Base URL', placeholder: 'https://api.anthropic.com' },
        { key: 'model', label: 'Model', placeholder: 'claude-sonnet-4-5' },
        { key: 'live_api', label: 'Enable Live API Transport', type: 'checkbox' },
      ];
    case 'moonshot_kimi':
      return [
        { key: 'api_key', label: 'Moonshot Kimi API Key', type: 'password', placeholder: 'sk-...' },
        { key: 'base_url', label: 'Moonshot Base URL', placeholder: 'https://api.moonshot.cn/v1' },
        { key: 'model', label: 'Model', placeholder: 'moonshot-v1-128k' },
        { key: 'live_api', label: 'Enable Live API Transport', type: 'checkbox' },
      ];
    case 'grok':
      return [
        { key: 'api_key', label: 'Grok API Key', type: 'password', placeholder: 'xai-...' },
        { key: 'base_url', label: 'Grok Base URL', placeholder: 'https://api.x.ai/v1' },
        { key: 'model', label: 'Model', placeholder: 'grok-4-0709' },
        { key: 'live_api', label: 'Enable Live API Transport', type: 'checkbox' },
      ];
    default:
      return [
        { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Paste key' },
        { key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com' },
        { key: 'model', label: 'Model', placeholder: 'provider-model-id' },
      ];
  }
}

function providerTone(providerId: string): 'genesis' | 'synthesis' | 'auditor' {
  switch (providerId) {
    case 'qwen_local':
    case 'moonshot_kimi':
      return 'genesis';
    case 'morpheus':
    case 'anthropic':
      return 'auditor';
    case 'ollama':
    case 'openai':
    case 'grok':
    default:
      return 'synthesis';
  }
}

function emptySystemReport(): SystemCheckReport {
  return {
    checks: [],
    has_blocking_failures: false,
    warn_count: 0,
    fail_count: 0,
  };
}

function emptyLocalBootstrap(): LocalBootstrapStatus {
  return {
    model_root: '',
    model_root_exists: false,
    qwen_model_hint_present: false,
    ollama_installed: false,
    ollama_reachable: false,
    ollama_default_model_installed: false,
    recommended_actions: [],
  };
}

function emptySecuritySettings(): SecurityPersistenceSettings {
  return {
    snapshot_path: DEFAULT_SNAPSHOT_PATH,
    encryption_enabled: false,
    passphrase_configured: false,
    auto_save_enabled: true,
    secret_backend_mode: 'dual_write',
  };
}

function emptyObservability(): ObservabilityStatus {
  return {
    retention_days: 90,
    log_level: 'info',
    full_tier_encrypted: true,
    redacted_graph_feed_enabled: true,
    full_event_log_path: '',
    redacted_graph_feed_path: '',
  };
}

function emptyCommunicationStatus(): CommunicationStatus {
  return {
    telegram: {
      enabled: false,
      live_api: false,
      routing_mode: 'per_agent',
      use_webhook: false,
      configured: false,
      has_bot_token: false,
      default_chat_id: '',
      orchestrator_chat_id: '',
      webhook_url: '',
      last_error: null,
    },
    discord: {
      enabled: false,
      live_api: false,
      routing_mode: 'per_agent',
      configured: false,
      has_bot_token: false,
      guild_id: '',
      default_channel_id: '',
      orchestrator_thread_id: '',
      auto_spawn_sub_sphere_threads: true,
      last_error: null,
    },
    discord_gateway_state: {
      lifecycle: 'disconnected',
      gateway_url: '',
      session_id: '',
      last_sequence: null,
      last_heartbeat_epoch_ms: null,
      last_close_code: null,
      resume_recommended: false,
      shard_count: null,
      session_start_limit_remaining: null,
      last_error: null,
    },
    agent_bindings: [],
    sub_sphere_bindings: [],
    in_app_thread_count: 0,
    telegram_inbox_count: 0,
    discord_pending_interaction_count: 0,
  };
}

function resolveInitialTheme(): ThemeName {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const saved = window.localStorage.getItem('mc-theme');
  if (saved === 'light' || saved === 'void') {
    return saved;
  }
  return 'light';
}

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  window.localStorage.setItem('mc-theme', theme);
}

const GEOMETRY_ASSET_MAP = import.meta.glob('./assets/metacanon-assets/geometry/*/*.svg', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const ICON_ASSET_MAP = import.meta.glob('./assets/metacanon-assets/icons/*/*.svg', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const COMPONENT_ASSET_MAP = import.meta.glob('./assets/metacanon-assets/components/*/**/*.svg', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function baseAssetPath(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${relativePath}`;
}

function resolveAsset(
  assetMap: Record<string, string>,
  bundledKey: string,
  fallbackRelativePath: string,
): string {
  return assetMap[bundledKey] ?? baseAssetPath(fallbackRelativePath);
}

function geometryAsset(theme: ThemeName, name: string): string {
  return resolveAsset(
    GEOMETRY_ASSET_MAP,
    `./assets/metacanon-assets/geometry/${theme}/${name}.svg`,
    `metacanon-assets/geometry/${theme}/${name}.svg`,
  );
}

function iconAsset(theme: ThemeName, name: string): string {
  return resolveAsset(
    ICON_ASSET_MAP,
    `./assets/metacanon-assets/icons/${theme}/${name}.svg`,
    `metacanon-assets/icons/${theme}/${name}.svg`,
  );
}

function componentAsset(theme: ThemeName, path: string): string {
  return resolveAsset(
    COMPONENT_ASSET_MAP,
    `./assets/metacanon-assets/components/${theme}/${path}.svg`,
    `metacanon-assets/components/${theme}/${path}.svg`,
  );
}

function providerIcon(providerId: string): string {
  switch (providerId) {
    case 'qwen_local':
      return 'icon-lightning';
    case 'morpheus':
      return 'icon-lock';
    case 'openai':
    case 'anthropic':
    case 'moonshot_kimi':
    case 'grok':
      return 'icon-terminal';
    case 'ollama':
    default:
      return 'icon-node';
  }
}

function configFieldIcon(field: ProviderConfigField): string {
  if (field.type === 'password' || field.key.includes('key')) {
    return 'icon-lock';
  }
  if (field.key.includes('base_url') || field.key.includes('endpoint')) {
    return 'icon-terminal';
  }
  if (field.key.includes('profile') || field.key.includes('backend')) {
    return 'icon-sliders';
  }
  return 'icon-node';
}

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(resolveInitialTheme);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready. Start quick setup or run the system check.');

  const [computeOptions, setComputeOptions] = useState<ComputeOption[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthStatus[]>([]);
  const [systemReport, setSystemReport] = useState<SystemCheckReport>(emptySystemReport());
  const [localBootstrap, setLocalBootstrap] = useState<LocalBootstrapStatus>(emptyLocalBootstrap());
  const [localModelPackPath, setLocalModelPackPath] = useState('');
  const [localModelPackResult, setLocalModelPackResult] =
    useState<LocalModelPackInstallResult | null>(null);
  const [security, setSecurity] = useState<SecurityPersistenceSettings>(emptySecuritySettings());
  const [observability, setObservability] = useState<ObservabilityStatus>(emptyObservability());
  const [communication, setCommunication] = useState<CommunicationStatus>(emptyCommunicationStatus());
  const [review, setReview] = useState<InstallReviewSummary | null>(null);
  const [telegramInbox, setTelegramInbox] = useState<TelegramInboundRecord[]>([]);
  const [inAppThreadId, setInAppThreadId] = useState('');
  const [inAppMessages, setInAppMessages] = useState<InAppThreadMessage[]>([]);
  const [autoCommsServiceEnabled, setAutoCommsServiceEnabled] = useState(true);

  const [cloudPriorityInput, setCloudPriorityInput] = useState(DEFAULT_CLOUD_PRIORITY);
  const [providerConfigTarget, setProviderConfigTarget] = useState('openai');
  const [providerConfigDrafts, setProviderConfigDrafts] = useState<
    Record<string, Record<string, string | boolean>>
  >({});
  const [snapshotPath, setSnapshotPath] = useState(DEFAULT_SNAPSHOT_PATH);
  const [snapshotPassphrase, setSnapshotPassphrase] = useState('');
  const [smokeResult, setSmokeResult] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramLiveApi, setTelegramLiveApi] = useState(false);
  const [telegramRoutingMode, setTelegramRoutingMode] = useState<AgentRoutingMode>('per_agent');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramDefaultChatId, setTelegramDefaultChatId] = useState('');
  const [telegramOrchestratorChatId, setTelegramOrchestratorChatId] = useState('');

  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordLiveApi, setDiscordLiveApi] = useState(false);
  const [discordRoutingMode, setDiscordRoutingMode] = useState<AgentRoutingMode>('per_agent');
  const [discordBotToken, setDiscordBotToken] = useState('');
  const [discordGuildId, setDiscordGuildId] = useState('');
  const [discordDefaultChannelId, setDiscordDefaultChannelId] = useState('');
  const [discordOrchestratorThreadId, setDiscordOrchestratorThreadId] = useState('');
  const [discordAutoSpawnThreads, setDiscordAutoSpawnThreads] = useState(true);

  const [agentBindingId, setAgentBindingId] = useState('agent-0');
  const [agentBindingTelegramChatId, setAgentBindingTelegramChatId] = useState('');
  const [agentBindingDiscordThreadId, setAgentBindingDiscordThreadId] = useState('');
  const [agentBindingInAppThreadId, setAgentBindingInAppThreadId] = useState('');
  const [agentBindingOrchestrator, setAgentBindingOrchestrator] = useState(false);

  const [dispatchPlatform, setDispatchPlatform] = useState<'telegram' | 'discord' | 'in_app'>(
    'in_app',
  );
  const [dispatchAgentId, setDispatchAgentId] = useState('agent-0');
  const [dispatchSubSphereId, setDispatchSubSphereId] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('Status update request');
  const [dispatchResult, setDispatchResult] = useState('');
  const [transportOpsResult, setTransportOpsResult] = useState('');
  const [trainingSubSphereName, setTrainingSubSphereName] = useState('Research Ops');
  const [trainingSubSphereObjective, setTrainingSubSphereObjective] = useState(
    'Train a synthesis workflow over my notes',
  );
  const [trainingHitlRequired, setTrainingHitlRequired] = useState(false);
  const [trainingSubSpheres, setTrainingSubSpheres] = useState<TaskSubSphereSummary[]>([]);
  const [trainingSubSphereId, setTrainingSubSphereId] = useState('');
  const [trainingSessionId, setTrainingSessionId] = useState('');
  const [trainingMessage, setTrainingMessage] = useState('Step 1: gather source documents.');
  const [trainingWorkflowName, setTrainingWorkflowName] = useState('Workflow v1');
  const [trainingWorkflows, setTrainingWorkflows] = useState<WorkflowDefinition[]>([]);
  const [trainingResult, setTrainingResult] = useState('');
  const [guidedVisionCore, setGuidedVisionCore] = useState(
    'Build a sovereign MetaCanon runtime aligned to my values.',
  );
  const [guidedCoreValues, setGuidedCoreValues] = useState(
    'Sovereignty, Clarity, Truthfulness, Human Dignity',
  );
  const [guidedWillDirectives, setGuidedWillDirectives] = useState(
    'Do not bypass constitutional controls.\nEscalate uncertain high-risk actions.',
  );
  const [guidedFacetVision, setGuidedFacetVision] = useState(
    'Constitutional synthesis and values stewardship.',
  );
  const [guidedSigningSecret, setGuidedSigningSecret] = useState('');
  const [genesisResult, setGenesisResult] = useState<GenesisRiteResult | null>(null);

  const [bootstrapOrchestratorAgentId, setBootstrapOrchestratorAgentId] =
    useState('agent-genesis');
  const [bootstrapPrismAgentId, setBootstrapPrismAgentId] = useState('agent-genesis');
  const [bootstrapPrismSubSphereId, setBootstrapPrismSubSphereId] = useState('meta-prism');
  const [agentGenesisTelegramId, setAgentGenesisTelegramId] = useState('');
  const [agentSynthesisTelegramId, setAgentSynthesisTelegramId] = useState('');
  const [agentAuditorTelegramId, setAgentAuditorTelegramId] = useState('');
  const [agentGenesisDiscordThreadId, setAgentGenesisDiscordThreadId] = useState('');
  const [agentSynthesisDiscordThreadId, setAgentSynthesisDiscordThreadId] = useState('');
  const [agentAuditorDiscordThreadId, setAgentAuditorDiscordThreadId] = useState('');
  const [bootstrapResult, setBootstrapResult] = useState<ThreeAgentBootstrapResult | null>(null);

  const cloudPriority = useMemo(
    () =>
      cloudPriorityInput
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    [cloudPriorityInput],
  );

  function parseListInput(raw: string): string[] {
    return raw
      .split(/[,\\n]/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  async function runTask(label: string, task: () => Promise<void>) {
    setBusy(true);
    setStatus(`${label}...`);
    try {
      await task();
      setStatus(`${label} complete.`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function setProviderDraftValue(key: string, value: string | boolean) {
    setProviderConfigDrafts((previous) => ({
      ...previous,
      [providerConfigTarget]: {
        ...(previous[providerConfigTarget] ?? {}),
        [key]: value,
      },
    }));
  }

  function buildProviderPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const field of providerFields) {
      const rawValue = providerDraft[field.key];
      if (field.type === 'checkbox') {
        if (typeof rawValue === 'boolean') {
          patch[field.key] = rawValue;
        }
        continue;
      }

      if (typeof rawValue !== 'string') {
        continue;
      }

      const trimmed = rawValue.trim();
      if (trimmed.length > 0) {
        patch[field.key] = trimmed;
      }
    }
    return patch;
  }

  async function refreshComputeAndHealth() {
    const [options, health] = await Promise.all([
      installerApi.getComputeOptions(),
      installerApi.getProviderHealth(),
    ]);
    setComputeOptions(options);
    setProviderHealth(health);
  }

  async function refreshCommunicationInbox(knownStatus?: CommunicationStatus) {
    const statusState = knownStatus ?? (await installerApi.getCommunicationStatus());
    setCommunication(statusState);

    const inbox = await installerApi.getTelegramInbox(50, 0);
    setTelegramInbox(inbox);

    const candidateThreadIds = statusState.agent_bindings
      .map((binding) => binding.in_app_thread_id ?? '')
      .filter((value) => value.trim().length > 0);
    const resolvedThreadId =
      inAppThreadId.trim() || candidateThreadIds[0] || `inapp-${dispatchAgentId.trim() || 'agent-0'}`;
    setInAppThreadId(resolvedThreadId);

    if (resolvedThreadId.trim()) {
      const messages = await installerApi.getInAppThreadMessages(resolvedThreadId, 80, 0);
      setInAppMessages(messages);
    } else {
      setInAppMessages([]);
    }
  }

  async function refreshConfigState() {
    const [securityState, observabilityState, communicationState, reviewState] = await Promise.all([
      installerApi.getSecuritySettings(),
      installerApi.getObservabilityStatus(),
      installerApi.getCommunicationStatus(),
      installerApi.getInstallReviewSummary(),
    ]);
    setSecurity(securityState);
    setSnapshotPath(securityState.snapshot_path);
    setObservability(observabilityState);
    setTelegramEnabled(communicationState.telegram.enabled);
    setTelegramLiveApi(communicationState.telegram.live_api);
    setTelegramRoutingMode(communicationState.telegram.routing_mode);
    setTelegramDefaultChatId(communicationState.telegram.default_chat_id ?? '');
    setTelegramOrchestratorChatId(communicationState.telegram.orchestrator_chat_id ?? '');

    setDiscordEnabled(communicationState.discord.enabled);
    setDiscordLiveApi(communicationState.discord.live_api);
    setDiscordRoutingMode(communicationState.discord.routing_mode);
    setDiscordGuildId(communicationState.discord.guild_id ?? '');
    setDiscordDefaultChannelId(communicationState.discord.default_channel_id ?? '');
    setDiscordOrchestratorThreadId(communicationState.discord.orchestrator_thread_id ?? '');
    setDiscordAutoSpawnThreads(communicationState.discord.auto_spawn_sub_sphere_threads);

    setReview(reviewState);
    await refreshCommunicationInbox(communicationState);
  }

  async function refreshTrainingState() {
    const subSpheres = await installerApi.getSubSphereList();
    setTrainingSubSpheres(subSpheres);
    if (!trainingSubSphereId && subSpheres.length > 0) {
      setTrainingSubSphereId(subSpheres[0].sub_sphere_id);
    }
  }

  async function initialLoad() {
    await Promise.all([
      refreshComputeAndHealth(),
      refreshConfigState(),
      refreshTrainingState(),
      installerApi.getLocalBootstrapStatus().then(setLocalBootstrap),
      installerApi.runSystemCheck().then(setSystemReport),
    ]);
  }

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void runTask('Loading installer state', initialLoad);
  }, []);

  useEffect(() => {
    const shouldPoll =
      autoCommsServiceEnabled &&
      ((telegramEnabled && telegramLiveApi) || (discordEnabled && discordLiveApi));
    if (!shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        if (telegramEnabled && telegramLiveApi) {
          await installerApi.pollTelegramUpdatesOnce(20).catch(() => undefined);
        }
        if (discordEnabled && discordLiveApi) {
          await installerApi.probeDiscordGateway().catch(() => undefined);
        }
        await refreshCommunicationInbox().catch(() => undefined);
      })();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [autoCommsServiceEnabled, telegramEnabled, telegramLiveApi, discordEnabled, discordLiveApi]);

  useEffect(() => {
    if (computeOptions.length === 0) {
      return;
    }

    const exists = computeOptions.some(
      (option) => option.provider_id === providerConfigTarget,
    );
    if (!exists) {
      setProviderConfigTarget(computeOptions[0].provider_id);
    }
  }, [computeOptions, providerConfigTarget]);

  const selectedGlobal =
    computeOptions.find((option) => option.selected_global)?.provider_id ?? 'qwen_local';
  const providerFields = useMemo(
    () => configFieldsForProvider(providerConfigTarget),
    [providerConfigTarget],
  );
  const providerDraft = providerConfigDrafts[providerConfigTarget] ?? {};

  function renderStepNav() {
    return (
      <aside className="sidebar glass-surface">
        <div className="brand-row">
          <div>
            <h1>MetaCanon Installer</h1>
            <p className="muted">Fractal System</p>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((value) => (value === 'void' ? 'light' : 'void'))}
            aria-label="Toggle theme"
          >
            <img
              className="icon-light icon-asset"
              src={iconAsset(theme, 'icon-sun')}
              alt=""
              aria-hidden="true"
            />
            <img
              className="icon-void icon-asset"
              src={iconAsset(theme, 'icon-star')}
              alt=""
              aria-hidden="true"
            />
          </button>
        </div>

        <ol className="step-list">
          {STEPS.map((label, index) => {
            const stepState =
              index < stepIndex ? 'complete' : index === stepIndex ? 'active' : 'future';
            return (
              <li className="step-entry" key={label}>
                <button
                  type="button"
                  className={`step-item ${index === stepIndex ? 'active' : ''}`}
                  onClick={() => setStepIndex(index)}
                >
                  <img
                    className="step-index-asset"
                    src={componentAsset(theme, `nav/stepper-step-${stepState}`)}
                    alt=""
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{label}</strong>
                  </div>
                </button>
                {index < STEPS.length - 1 ? (
                  <img
                    className="step-connector"
                    src={componentAsset(theme, 'nav/stepper-connector')}
                    alt=""
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </aside>
    );
  }

  function renderWelcome() {
    return (
      <section className="panel glass-surface">
        <div className="section-header">
          <div>
            <h2>Welcome</h2>
            <p>
              Configure compute, security, observability, and fallback behavior. Theme toggle is
              always available in the sidebar.
            </p>
          </div>
          <img
            className="shape-asset shape-welcome"
            src={geometryAsset(theme, 'tetrahedron')}
            alt=""
            aria-hidden="true"
          />
        </div>

        <div className="chip-asset-row">
          <img src={componentAsset(theme, 'chips/chip-badge-genesis')} alt="Genesis Core badge" />
          <img src={componentAsset(theme, 'chips/chip-badge-synthesis')} alt="Local Runtime badge" />
          <img src={componentAsset(theme, 'chips/chip-badge-auditor')} alt="Fractal Mesh badge" />
        </div>

        <div className="welcome-grid">
          <button
            className="action-card tone-synthesis"
            onClick={() =>
              runTask('Quick setup', async () => {
                await installerApi.finalizeSetupComputeSelection();
                await refreshComputeAndHealth();
                await refreshConfigState();
                setStepIndex(6);
              })
            }
            disabled={busy}
          >
            <div className="row gap">
              <img
                className="inline-icon"
                src={iconAsset(theme, 'icon-lightning')}
                alt=""
                aria-hidden="true"
              />
              <h3>Quick Setup</h3>
            </div>
            <p>Auto-select Qwen local defaults and jump to review.</p>
          </button>
          <button
            className="action-card tone-auditor"
            onClick={() => setStepIndex(1)}
            disabled={busy}
          >
            <div className="row gap">
              <img
                className="inline-icon"
                src={iconAsset(theme, 'icon-sliders')}
                alt=""
                aria-hidden="true"
              />
              <h3>Advanced Setup</h3>
            </div>
            <p>Walk all installer stages with full control.</p>
          </button>
        </div>
      </section>
    );
  }

  function renderSystemCheck() {
    const bannerPath =
      systemReport.fail_count > 0
        ? componentAsset(theme, 'banners/banner-error')
        : systemReport.warn_count > 0
          ? componentAsset(theme, 'banners/banner-warning')
          : componentAsset(theme, 'banners/banner-success');

    return (
      <section className="panel glass-surface">
        <div className="row between section-header-inline">
          <div className="row gap">
            <img
              className="shape-asset shape-system"
              src={geometryAsset(theme, 'tensegrity-tetrahedron')}
              alt=""
              aria-hidden="true"
            />
            <h2>System Check</h2>
          </div>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Running system checks', async () => {
                const report = await installerApi.runSystemCheck();
                setSystemReport(report);
              })
            }
            disabled={busy}
          >
            Run Checks
          </button>
        </div>
        <p className="mono muted">
          readiness: blocking={String(systemReport.has_blocking_failures)} warn={systemReport.warn_count}{' '}
          fail={systemReport.fail_count}
        </p>
        <img className="banner-asset" src={bannerPath} alt="System readiness banner" />
        <div className="table">
          {systemReport.checks.map((check) => (
            <div className="table-row" key={check.check_id}>
              <span className="table-title-with-icon">
                <img
                  className="inline-icon tiny"
                  src={iconAsset(theme, check.status === 'fail' ? 'icon-error' : check.status === 'warn' ? 'icon-warning' : 'icon-check-circle')}
                  alt=""
                  aria-hidden="true"
                />
                {check.label}
              </span>
              <span className={`chip ${check.status === 'pass' ? 'pass' : check.status === 'warn' ? 'warn' : 'fail'}`}>
                {check.status}
              </span>
              <span className="muted">{check.detail}</span>
            </div>
          ))}
        </div>

        <div className="panel compact glass-surface" style={{ marginTop: 16 }}>
          <div className="row between">
            <h3>Local Runtime Bootstrap</h3>
            <div className="row gap">
              <button
                className="btn secondary"
                onClick={() =>
                  runTask('Refreshing local bootstrap status', async () => {
                    setLocalBootstrap(await installerApi.getLocalBootstrapStatus());
                  })
                }
                disabled={busy}
              >
                Refresh
              </button>
              <button
                className="btn primary"
                onClick={() =>
                  runTask('Preparing local runtime', async () => {
                    setLocalBootstrap(await installerApi.prepareLocalRuntime(true));
                  })
                }
                disabled={busy}
              >
                One-Click Prepare
              </button>
            </div>
          </div>
          <p className="mono muted">model_root={localBootstrap.model_root || '(not detected)'}</p>
          <div className="dynamic-field-grid">
            <div className="field grow">
              <label>Offline Model Pack Path (.zip/.tar.gz/.tgz/folder/.gguf)</label>
              <input
                value={localModelPackPath}
                onChange={(event) => setLocalModelPackPath(event.target.value)}
                placeholder="/Volumes/ExternalDrive/metacanon-model-pack.tar.gz"
              />
            </div>
            <div className="row gap">
              <button
                className="btn secondary"
                onClick={() =>
                  runTask('Installing offline model pack', async () => {
                    if (!localModelPackPath.trim()) {
                      throw new Error('Enter a local model pack path first.');
                    }
                    const result = await installerApi.installLocalModelPack(localModelPackPath);
                    setLocalModelPackResult(result);
                    setLocalBootstrap(result.bootstrap);
                  })
                }
                disabled={busy}
              >
                Install Model Pack
              </button>
            </div>
          </div>
          {localModelPackResult ? (
            <pre className="console">
              {`model_pack kind=${localModelPackResult.source_kind} installed_files=${localModelPackResult.installed_files} root=${localModelPackResult.model_root}`}
            </pre>
          ) : null}
          <div className="table">
            <div className="table-row">
              <span>Model root directory</span>
              <span className={`chip ${localBootstrap.model_root_exists ? 'pass' : 'warn'}`}>
                {localBootstrap.model_root_exists ? 'ready' : 'missing'}
              </span>
            </div>
            <div className="table-row">
              <span>Qwen local model hint</span>
              <span className={`chip ${localBootstrap.qwen_model_hint_present ? 'pass' : 'warn'}`}>
                {localBootstrap.qwen_model_hint_present ? 'detected' : 'not detected'}
              </span>
            </div>
            <div className="table-row">
              <span>Ollama installed</span>
              <span className={`chip ${localBootstrap.ollama_installed ? 'pass' : 'warn'}`}>
                {localBootstrap.ollama_installed ? 'yes' : 'no'}
              </span>
            </div>
            <div className="table-row">
              <span>Ollama reachable</span>
              <span className={`chip ${localBootstrap.ollama_reachable ? 'pass' : 'warn'}`}>
                {localBootstrap.ollama_reachable ? 'yes' : 'no'}
              </span>
            </div>
            <div className="table-row">
              <span>Default Ollama model</span>
              <span
                className={`chip ${localBootstrap.ollama_default_model_installed ? 'pass' : 'warn'}`}
              >
                {localBootstrap.ollama_default_model_installed ? 'installed' : 'missing'}
              </span>
            </div>
          </div>
          {localBootstrap.recommended_actions.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              {localBootstrap.recommended_actions.map((action, index) => (
                <p key={`${action}-${index}`} className="muted">
                  - {action}
                </p>
              ))}
            </div>
          ) : (
            <p className="muted">Local runtime baseline is ready.</p>
          )}
        </div>
      </section>
    );
  }

  function renderComputeSelection() {
    return (
      <section className="panel glass-surface">
        <div className="section-header">
          <div>
            <h2>Compute Selection</h2>
            <p className="muted">Choose global routing and verify fallback topology.</p>
          </div>
          <img
            className="shape-asset shape-compute"
            src={geometryAsset(theme, 'genesis-crystal')}
            alt=""
            aria-hidden="true"
          />
        </div>
        <div className="cards">
          {computeOptions.map((option) => {
            const tone = providerTone(option.provider_id);
            return (
              <button
                key={option.provider_id}
                className={`provider-card tone-${tone} ${option.selected_global ? 'selected' : ''}`}
                onClick={() =>
                  runTask(`Setting ${option.provider_id} as global provider`, async () => {
                    await installerApi.setGlobalComputeProvider(option.provider_id);
                    await refreshComputeAndHealth();
                  })
                }
                disabled={busy}
              >
                <div className="row between">
                  <span className="row gap">
                    <img
                      className="inline-icon"
                      src={iconAsset(theme, providerIcon(option.provider_id))}
                      alt=""
                      aria-hidden="true"
                    />
                    <strong>{option.display_name}</strong>
                  </span>
                  <span className={`chip ${option.available ? 'pass' : 'fail'}`}>
                    {option.available ? 'up' : 'down'}
                  </span>
                </div>
                <p className="muted mono">{option.provider_id}</p>
                <p className="muted">kind={option.kind} configured={String(option.configured)}</p>
              </button>
            );
          })}
        </div>

        <div className="topology-panel">
          <p className="mono muted">fallback_chain: active → qwen_local → ollama → cloud_priority</p>
          <img
            className="topology-asset"
            src={componentAsset(theme, 'topology/fallback-chain')}
            alt="Fallback chain topology"
          />
        </div>

        <div className="field">
          <label>Cloud Priority (comma-separated)</label>
          <input
            value={cloudPriorityInput}
            onChange={(event) => setCloudPriorityInput(event.target.value)}
          />
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Updating cloud priority', async () => {
                await installerApi.setProviderPriority(cloudPriority);
                await refreshComputeAndHealth();
              })
            }
            disabled={busy || cloudPriority.length === 0}
          >
            Save Priority
          </button>
        </div>
      </section>
    );
  }

  function renderProviderConfig() {
    const targetOption = computeOptions.find(
      (option) => option.provider_id === providerConfigTarget,
    );
    const textFields = providerFields.filter((field) => field.type !== 'checkbox');
    const checkboxFields = providerFields.filter((field) => field.type === 'checkbox');

    return (
      <section className="panel glass-surface">
        <div className="section-header-inline row between">
          <h2>Provider Config</h2>
          <img
            className="shape-asset shape-provider"
            src={geometryAsset(theme, 'fractal-scaling-path')}
            alt=""
            aria-hidden="true"
          />
        </div>

        <div className="row gap wrap">
          <div className="field grow">
            <label>Provider</label>
            <div className="input-with-icon">
              <img
                className="field-icon"
                src={iconAsset(theme, providerIcon(providerConfigTarget))}
                alt=""
                aria-hidden="true"
              />
              <select
                className="with-icon"
                value={providerConfigTarget}
                onChange={(event) => setProviderConfigTarget(event.target.value)}
              >
                {computeOptions.map((option) => (
                  <option key={option.provider_id} value={option.provider_id}>
                    {option.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mono muted provider-target-meta">
            {targetOption
              ? `${targetOption.provider_id} · ${targetOption.kind}`
              : providerConfigTarget}
          </p>
        </div>

        <div className="dynamic-field-grid">
          {textFields.map((field) => (
            <div className="field grow" key={field.key}>
              <label>{field.label}</label>
              <div className="input-with-icon">
                <img
                  className="field-icon"
                  src={iconAsset(theme, configFieldIcon(field))}
                  alt=""
                  aria-hidden="true"
                />
                <input
                  className="with-icon"
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={typeof providerDraft[field.key] === 'string' ? (providerDraft[field.key] as string) : ''}
                  onChange={(event) => setProviderDraftValue(field.key, event.target.value)}
                  placeholder={field.placeholder ?? ''}
                />
              </div>
            </div>
          ))}
        </div>

        {checkboxFields.length > 0 ? (
          <div className="row gap wrap">
            {checkboxFields.map((field) => (
              <label className="toggle" key={field.key}>
                <input
                  type="checkbox"
                  checked={providerDraft[field.key] === true}
                  onChange={(event) => setProviderDraftValue(field.key, event.target.checked)}
                />
                {field.label}
              </label>
            ))}
          </div>
        ) : null}

        <div className="row gap wrap">
          <button
            className="btn primary"
            onClick={() =>
              runTask(`Updating ${providerConfigTarget} config`, async () => {
                const patch = buildProviderPatch();
                if (Object.keys(patch).length === 0) {
                  throw new Error('Enter at least one provider field value before saving.');
                }
                await installerApi.updateProviderConfig(providerConfigTarget, patch);
                await refreshComputeAndHealth();
              })
            }
            disabled={busy}
          >
            Save Provider Config
          </button>
          <button
            className="btn secondary"
            onClick={() => runTask('Refreshing provider health', refreshComputeAndHealth)}
            disabled={busy}
          >
            Refresh Health
          </button>
        </div>

        <div className="table">
          {providerHealth.map((provider) => (
            <div className="table-row" key={provider.provider_id}>
              <span>{provider.provider_id}</span>
              <span className={`chip ${provider.is_healthy ? 'pass' : 'fail'}`}>
                {provider.is_healthy ? 'healthy' : 'unhealthy'}
              </span>
              <span className="muted">{provider.detail ?? 'no detail'}</span>
            </div>
          ))}
        </div>

        {renderCommunicationPanel()}
      </section>
    );
  }

  function renderCommunicationPanel() {
    return (
      <section className="panel compact glass-surface comms-panel">
        <h3>Agent Communications</h3>
        <p className="muted">
          Configure Telegram/Discord routing and communicate with agents directly or through an
          orchestrator thread.
        </p>
        <div className="row gap wrap">
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoCommsServiceEnabled}
              onChange={(event) => setAutoCommsServiceEnabled(event.target.checked)}
            />
            Auto-Run Communication Service Loop
          </label>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Refreshing communication inbox', async () => {
                await refreshCommunicationInbox();
              })
            }
            disabled={busy}
          >
            Refresh Inbox
          </button>
        </div>

        <div className="dynamic-field-grid">
          <div className="field grow">
            <label>Telegram Bot Token</label>
            <input
              type="password"
              value={telegramBotToken}
              onChange={(event) => setTelegramBotToken(event.target.value)}
              placeholder="123456:telegram-bot-token"
            />
          </div>
          <div className="field grow">
            <label>Telegram Default Chat ID</label>
            <input
              value={telegramDefaultChatId}
              onChange={(event) => setTelegramDefaultChatId(event.target.value)}
              placeholder="-100123456789"
            />
          </div>
          <div className="field grow">
            <label>Telegram Orchestrator Chat ID</label>
            <input
              value={telegramOrchestratorChatId}
              onChange={(event) => setTelegramOrchestratorChatId(event.target.value)}
              placeholder="-100987654321"
            />
          </div>
          <div className="field grow">
            <label>Telegram Routing Mode</label>
            <select
              value={telegramRoutingMode}
              onChange={(event) => setTelegramRoutingMode(event.target.value as AgentRoutingMode)}
            >
              <option value="per_agent">per_agent</option>
              <option value="orchestrator">orchestrator</option>
            </select>
          </div>
        </div>

        <div className="row gap wrap">
          <label className="toggle">
            <input
              type="checkbox"
              checked={telegramEnabled}
              onChange={(event) => setTelegramEnabled(event.target.checked)}
            />
            Enable Telegram
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={telegramLiveApi}
              onChange={(event) => setTelegramLiveApi(event.target.checked)}
            />
            Live Telegram API
          </label>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Updating Telegram integration', async () => {
                const status = await installerApi.updateTelegramIntegration({
                  enabled: telegramEnabled,
                  routing_mode: telegramRoutingMode,
                  bot_token: telegramBotToken || null,
                  default_chat_id: telegramDefaultChatId || null,
                  orchestrator_chat_id: telegramOrchestratorChatId || null,
                  live_api: telegramLiveApi,
                });
                await refreshCommunicationInbox(status);
              })
            }
            disabled={busy}
          >
            Save Telegram
          </button>
        </div>

        <div className="dynamic-field-grid">
          <div className="field grow">
            <label>Discord Bot Token</label>
            <input
              type="password"
              value={discordBotToken}
              onChange={(event) => setDiscordBotToken(event.target.value)}
              placeholder="discord-bot-token"
            />
          </div>
          <div className="field grow">
            <label>Discord Guild ID</label>
            <input
              value={discordGuildId}
              onChange={(event) => setDiscordGuildId(event.target.value)}
              placeholder="guild-id"
            />
          </div>
          <div className="field grow">
            <label>Discord Default Channel ID</label>
            <input
              value={discordDefaultChannelId}
              onChange={(event) => setDiscordDefaultChannelId(event.target.value)}
              placeholder="channel-id"
            />
          </div>
          <div className="field grow">
            <label>Discord Orchestrator Thread ID</label>
            <input
              value={discordOrchestratorThreadId}
              onChange={(event) => setDiscordOrchestratorThreadId(event.target.value)}
              placeholder="thread-id"
            />
          </div>
          <div className="field grow">
            <label>Discord Routing Mode</label>
            <select
              value={discordRoutingMode}
              onChange={(event) => setDiscordRoutingMode(event.target.value as AgentRoutingMode)}
            >
              <option value="per_agent">per_agent</option>
              <option value="orchestrator">orchestrator</option>
            </select>
          </div>
        </div>

        <div className="row gap wrap">
          <label className="toggle">
            <input
              type="checkbox"
              checked={discordEnabled}
              onChange={(event) => setDiscordEnabled(event.target.checked)}
            />
            Enable Discord
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={discordLiveApi}
              onChange={(event) => setDiscordLiveApi(event.target.checked)}
            />
            Live Discord API
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={discordAutoSpawnThreads}
              onChange={(event) => setDiscordAutoSpawnThreads(event.target.checked)}
            />
            Auto-Spawn Sub-Sphere Threads
          </label>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Updating Discord integration', async () => {
                const status = await installerApi.updateDiscordIntegration({
                  enabled: discordEnabled,
                  routing_mode: discordRoutingMode,
                  bot_token: discordBotToken || null,
                  guild_id: discordGuildId || null,
                  default_channel_id: discordDefaultChannelId || null,
                  orchestrator_thread_id: discordOrchestratorThreadId || null,
                  auto_spawn_sub_sphere_threads: discordAutoSpawnThreads,
                  live_api: discordLiveApi,
                });
                await refreshCommunicationInbox(status);
              })
            }
            disabled={busy}
          >
            Save Discord
          </button>
        </div>

        <div className="dynamic-field-grid">
          <div className="field grow">
            <label>Agent ID</label>
            <input
              value={agentBindingId}
              onChange={(event) => setAgentBindingId(event.target.value)}
              placeholder="agent-0"
            />
          </div>
          <div className="field grow">
            <label>Agent Telegram Chat ID</label>
            <input
              value={agentBindingTelegramChatId}
              onChange={(event) => setAgentBindingTelegramChatId(event.target.value)}
              placeholder="-100..."
            />
          </div>
          <div className="field grow">
            <label>Agent Discord Thread ID</label>
            <input
              value={agentBindingDiscordThreadId}
              onChange={(event) => setAgentBindingDiscordThreadId(event.target.value)}
              placeholder="thread-id"
            />
          </div>
          <div className="field grow">
            <label>Agent In-App Thread ID</label>
            <input
              value={agentBindingInAppThreadId}
              onChange={(event) => setAgentBindingInAppThreadId(event.target.value)}
              placeholder="inapp-agent-0"
            />
          </div>
        </div>

        <div className="row gap wrap">
          <label className="toggle">
            <input
              type="checkbox"
              checked={agentBindingOrchestrator}
              onChange={(event) => setAgentBindingOrchestrator(event.target.checked)}
            />
            Mark as Orchestrator Agent
          </label>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Saving agent route binding', async () => {
                await installerApi.bindAgentCommunicationRoute({
                  agent_id: agentBindingId,
                  telegram_chat_id: agentBindingTelegramChatId || null,
                  discord_thread_id: agentBindingDiscordThreadId || null,
                  in_app_thread_id: agentBindingInAppThreadId || null,
                  is_orchestrator: agentBindingOrchestrator,
                });
                await refreshCommunicationInbox();
              })
            }
            disabled={busy}
          >
            Save Agent Route
          </button>
        </div>

        <div className="dynamic-field-grid">
          <div className="field grow">
            <label>Dispatch Platform</label>
            <select
              value={dispatchPlatform}
              onChange={(event) =>
                setDispatchPlatform(event.target.value as 'telegram' | 'discord' | 'in_app')
              }
            >
              <option value="in_app">in_app</option>
              <option value="telegram">telegram</option>
              <option value="discord">discord</option>
            </select>
          </div>
          <div className="field grow">
            <label>Dispatch Agent ID</label>
            <input
              value={dispatchAgentId}
              onChange={(event) => setDispatchAgentId(event.target.value)}
              placeholder="agent-0"
            />
          </div>
          <div className="field grow">
            <label>Sub-Sphere ID (optional for prism dispatch)</label>
            <input
              value={dispatchSubSphereId}
              onChange={(event) => setDispatchSubSphereId(event.target.value)}
              placeholder="ss-..."
            />
          </div>
          <div className="field grow">
            <label>Message</label>
            <input
              value={dispatchMessage}
              onChange={(event) => setDispatchMessage(event.target.value)}
              placeholder="Type a message to the agent"
            />
          </div>
        </div>

        <div className="row gap wrap">
          <button
            className="btn primary"
            onClick={() =>
              runTask('Sending agent message', async () => {
                const result = await installerApi.sendAgentMessage({
                  platform: dispatchPlatform,
                  agent_id: dispatchAgentId,
                  message: dispatchMessage,
                });
                setDispatchResult(
                  `agent dispatch: platform=${result.platform} thread=${result.thread_id} live=${String(result.delivered_live)} simulated=${String(result.simulated)} id=${result.message_id}`,
                );
                await refreshCommunicationInbox();
              })
            }
            disabled={busy}
          >
            Send Agent Message
          </button>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Sending sub-sphere prism message', async () => {
                if (!dispatchSubSphereId.trim()) {
                  throw new Error('Enter sub-sphere id to send prism message.');
                }
                const result = await installerApi.sendSubSpherePrismMessage({
                  platform: dispatchPlatform,
                  sub_sphere_id: dispatchSubSphereId,
                  message: dispatchMessage,
                });
                setDispatchResult(
                  `sub-sphere dispatch: sphere=${result.sub_sphere_id ?? ''} platform=${result.platform} thread=${result.thread_id} live=${String(result.delivered_live)} simulated=${String(result.simulated)} id=${result.message_id}`,
                );
                await refreshCommunicationInbox();
              })
            }
            disabled={busy}
          >
            Send Prism Message
          </button>
        </div>

        <div className="row gap wrap">
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Polling Telegram updates', async () => {
                const result = await installerApi.pollTelegramUpdatesOnce(25);
                setTransportOpsResult(
                  `telegram poll: fetched=${result.fetched_updates} processed=${result.processed_updates} dispatched=${result.dispatched_messages} simulated=${String(result.simulated)} next_offset=${String(result.next_offset ?? '')}`,
                );
                await refreshCommunicationInbox();
              })
            }
            disabled={busy}
          >
            Poll Telegram
          </button>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Probing Discord gateway', async () => {
                const probe = await installerApi.probeDiscordGateway();
                setTransportOpsResult(
                  `discord gateway: lifecycle=${probe.lifecycle} url=${probe.gateway_url} live_probe=${String(probe.live_probe)}`,
                );
                await refreshCommunicationInbox();
              })
            }
            disabled={busy}
          >
            Probe Discord Gateway
          </button>
        </div>

        {dispatchResult ? <pre className="console">{dispatchResult}</pre> : null}
        {transportOpsResult ? <pre className="console">{transportOpsResult}</pre> : null}

        <div className="table">
          <div className="table-row">
            <span>telegram</span>
            <span className={`chip ${communication.telegram.configured ? 'pass' : 'warn'}`}>
              {communication.telegram.configured ? 'configured' : 'pending'}
            </span>
            <span className="muted">
              mode={communication.telegram.routing_mode} live_api=
              {String(communication.telegram.live_api)} webhook=
              {String(communication.telegram.use_webhook)}
            </span>
          </div>
          <div className="table-row">
            <span>discord</span>
            <span className={`chip ${communication.discord.configured ? 'pass' : 'warn'}`}>
              {communication.discord.configured ? 'configured' : 'pending'}
            </span>
            <span className="muted">
              mode={communication.discord.routing_mode} auto_spawn=
              {String(communication.discord.auto_spawn_sub_sphere_threads)}
            </span>
          </div>
          <div className="table-row">
            <span>agent routes</span>
            <span className="chip pass">{communication.agent_bindings.length}</span>
            <span className="muted">orchestrator or direct per-agent bindings</span>
          </div>
          <div className="table-row">
            <span>sub-sphere prism routes</span>
            <span className="chip pass">{communication.sub_sphere_bindings.length}</span>
            <span className="muted">discord/telegram/in-app prism route bindings</span>
          </div>
          <div className="table-row">
            <span>discord gateway</span>
            <span
              className={`chip ${
                communication.discord_gateway_state.lifecycle === 'fatal'
                  ? 'fail'
                  : communication.discord_gateway_state.lifecycle === 'connected'
                    ? 'pass'
                    : 'warn'
              }`}
            >
              {communication.discord_gateway_state.lifecycle}
            </span>
            <span className="muted">
              resume={String(communication.discord_gateway_state.resume_recommended)}
            </span>
          </div>
          <div className="table-row">
            <span>telegram inbox</span>
            <span className="chip pass">{communication.telegram_inbox_count}</span>
            <span className="muted">
              pending discord interactions={communication.discord_pending_interaction_count}
            </span>
          </div>
        </div>

        <div className="row gap wrap" style={{ marginTop: 12 }}>
          <div className="field grow">
            <label>In-App Thread</label>
            <select
              value={inAppThreadId}
              onChange={(event) => setInAppThreadId(event.target.value)}
            >
              {[...new Set([
                inAppThreadId,
                ...communication.agent_bindings
                  .map((binding) => binding.in_app_thread_id ?? '')
                  .filter((value) => value.trim().length > 0),
              ])]
                .filter((value) => value.trim().length > 0)
                .map((threadId) => (
                  <option key={threadId} value={threadId}>
                    {threadId}
                  </option>
                ))}
            </select>
          </div>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Loading in-app thread', async () => {
                if (!inAppThreadId.trim()) {
                  throw new Error('Select an in-app thread first.');
                }
                setInAppMessages(await installerApi.getInAppThreadMessages(inAppThreadId, 80, 0));
              })
            }
            disabled={busy}
          >
            Load In-App Messages
          </button>
        </div>

        <div className="table" style={{ marginTop: 8 }}>
          <div className="table-row">
            <span>telegram inbox entries</span>
            <span className="chip pass">{telegramInbox.length}</span>
            <span className="muted">latest inbound updates routed to agents</span>
          </div>
          {telegramInbox.slice(0, 8).map((entry) => (
            <div className="table-row" key={`${entry.update_id}-${entry.received_at_epoch_ms}`}>
              <span className="mono">{entry.chat_id}</span>
              <span className="chip pass">{entry.routed_agent_id}</span>
              <span className="muted">{entry.text}</span>
            </div>
          ))}
        </div>

        <div className="table" style={{ marginTop: 8 }}>
          <div className="table-row">
            <span>in-app thread messages</span>
            <span className="chip pass">{inAppMessages.length}</span>
            <span className="muted">direct app communication history</span>
          </div>
          {inAppMessages.slice(0, 12).map((entry) => (
            <div className="table-row" key={entry.message_id}>
              <span className="mono">{entry.agent_id}</span>
              <span className="chip pass">{entry.thread_id}</span>
              <span className="muted">{entry.content}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderSecurity() {
    return (
      <section className="panel glass-surface">
        <div className="section-header">
          <div>
            <h2>Security & Persistence</h2>
            <p className="muted">Configure encrypted snapshots and secret storage mode.</p>
          </div>
          <img
            className="shape-asset shape-security"
            src={geometryAsset(theme, 'genesis-crystal')}
            alt=""
            aria-hidden="true"
          />
        </div>
        <div className="field">
          <label>Snapshot Path</label>
          <div className="input-with-icon">
            <img
              className="field-icon"
              src={iconAsset(theme, 'icon-folder')}
              alt=""
              aria-hidden="true"
            />
            <input
              className="with-icon"
              value={snapshotPath}
              onChange={(event) => setSnapshotPath(event.target.value)}
            />
          </div>
        </div>

        <div className="row gap wrap">
          <label className="toggle">
            <input
              type="checkbox"
              checked={security.encryption_enabled}
              onChange={(event) =>
                setSecurity((prev) => ({ ...prev, encryption_enabled: event.target.checked }))
              }
            />
            Enable Snapshot Encryption
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={security.auto_save_enabled}
              onChange={(event) =>
                setSecurity((prev) => ({ ...prev, auto_save_enabled: event.target.checked }))
              }
            />
            Enable Auto-Save
          </label>
        </div>

        <div className="row gap">
          <div className="field grow">
            <label>Passphrase</label>
            <div className="input-with-icon">
              <img
                className="field-icon"
                src={iconAsset(theme, 'icon-lock')}
                alt=""
                aria-hidden="true"
              />
              <input
                className="with-icon"
                type="password"
                value={snapshotPassphrase}
                onChange={(event) => setSnapshotPassphrase(event.target.value)}
                placeholder="Enter passphrase"
              />
            </div>
            <img
              className="strength-asset"
              src={componentAsset(theme, 'inputs/strength-bar')}
              alt="Passphrase strength indicator"
            />
          </div>

          <div className="field grow">
            <label>Secret Backend Mode</label>
            <select
              value={security.secret_backend_mode}
              onChange={(event) =>
                setSecurity((prev) => ({ ...prev, secret_backend_mode: event.target.value }))
              }
            >
              <option value="dual_write">dual_write</option>
              <option value="keychain_only">keychain_only</option>
              <option value="encrypted_file_only">encrypted_file_only</option>
            </select>
          </div>
        </div>

        <div className="row gap">
          <img
            className="crystal-action-asset"
            src={componentAsset(theme, 'cards/crystal-action-card')}
            alt=""
            aria-hidden="true"
          />
          <button
            className="btn primary"
            onClick={() =>
              runTask('Saving security settings', async () => {
                const updated = await installerApi.updateSecuritySettings({
                  snapshot_path: snapshotPath,
                  encryption_enabled: security.encryption_enabled,
                  passphrase: snapshotPassphrase || null,
                  auto_save_enabled: security.auto_save_enabled,
                  secret_backend_mode: security.secret_backend_mode,
                });
                setSecurity(updated);
              })
            }
            disabled={busy}
          >
            Save Security
          </button>

          <button
            className="btn secondary"
            onClick={() =>
              runTask('Flushing snapshot', async () => {
                await installerApi.flushRuntimeAutoSnapshot();
              })
            }
            disabled={busy}
          >
            Flush Snapshot
          </button>
        </div>
      </section>
    );
  }

  function renderObservability() {
    return (
      <section className="panel glass-surface">
        <div className="section-header">
          <div>
            <h2>Observability</h2>
            <p className="muted">Dual-tier logs with encrypted full events and redacted graph feed.</p>
          </div>
          <img
            className="shape-asset shape-observability"
            src={geometryAsset(theme, 'icosahedron')}
            alt=""
            aria-hidden="true"
          />
        </div>

        <div className="row gap">
          <div className="field grow">
            <label>Retention Days</label>
            <input
              type="number"
              min={1}
              max={365}
              value={observability.retention_days}
              onChange={(event) =>
                setObservability((prev) => ({
                  ...prev,
                  retention_days: Number(event.target.value || 90),
                }))
              }
            />
          </div>

          <div className="field grow">
            <label>Log Level</label>
            <select
              value={observability.log_level}
              onChange={(event) =>
                setObservability((prev) => ({ ...prev, log_level: event.target.value }))
              }
            >
              <option>error</option>
              <option>warn</option>
              <option>info</option>
              <option>debug</option>
              <option>trace</option>
            </select>
          </div>
        </div>

        <img
          className="topology-asset"
          src={componentAsset(theme, 'topology/fallback-chain')}
          alt="Fallback chain visualization"
        />

        <div className="observability-paths">
          <p className="mono muted path-row">
            <img
              className="inline-icon tiny"
              src={iconAsset(theme, 'icon-terminal')}
              alt=""
              aria-hidden="true"
            />
            {observability.full_event_log_path}
          </p>
          <p className="mono muted path-row">
            <img
              className="inline-icon tiny"
              src={iconAsset(theme, 'icon-node')}
              alt=""
              aria-hidden="true"
            />
            {observability.redacted_graph_feed_path}
          </p>
        </div>

        <img
          className="banner-asset"
          src={componentAsset(theme, 'banners/banner-fallback')}
          alt="Fallback notification banner"
        />

        <button
          className="btn primary"
          onClick={() =>
            runTask('Saving observability settings', async () => {
              const updated = await installerApi.updateObservabilitySettings(
                observability.retention_days,
                observability.log_level,
              );
              setObservability(updated);
            })
          }
          disabled={busy}
        >
          Save Observability
        </button>
      </section>
    );
  }

  function renderReview() {
    return (
      <section className="panel glass-surface">
        <div className="row between">
          <h2>Review & Install</h2>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Refreshing review summary', async () => {
                setReview(await installerApi.getInstallReviewSummary());
              })
            }
            disabled={busy}
          >
            Refresh
          </button>
        </div>

        {review ? (
          <>
            <p className="mono">can_install={String(review.can_install)}</p>
            <p className="mono muted">{review.provider_chain.join(' -> ')}</p>
            <img
              className="topology-asset"
              src={componentAsset(theme, 'topology/fallback-chain')}
              alt="Configured fallback chain"
            />

            <div className="table">
              {review.issues.map((issue, index) => (
                <div className="table-row" key={`${issue.severity}-${index}`}>
                  <span className={`chip ${issue.severity === 'error' ? 'fail' : 'warn'}`}>
                    {issue.severity}
                  </span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>

            <img
              className="progress-asset"
              src={componentAsset(theme, review.can_install ? 'progress/progress-bar-complete' : 'progress/progress-bar')}
              alt="Install readiness progress"
            />

            <button
              className="btn primary"
              onClick={() =>
                runTask('Running install sequence', async () => {
                  const latest = await installerApi.getInstallReviewSummary();
                  setReview(latest);
                  if (!latest.can_install) {
                    throw new Error('Review has blocking errors; resolve them before install.');
                  }

                  const result = await installerApi.submitDeliberation(SMOKE_QUERY, selectedGlobal);
                  setSmokeResult(
                    `provider=${result.provider_id} model=${result.model} fallback=${String(result.used_fallback)} output=${result.output_text}`,
                  );
                  await installerApi.flushRuntimeAutoSnapshot();
                  setStepIndex(7);
                })
              }
              disabled={busy || !review.can_install}
            >
              Initiate Sequence
            </button>
          </>
        ) : (
          <p className="muted">Load review summary to continue.</p>
        )}
      </section>
    );
  }

  function renderDone() {
    return (
      <section className="panel glass-surface">
        <div className="section-header">
          <div>
            <h2>Installation Complete</h2>
            <p className="muted">Installer sequence and snapshot flush completed.</p>
          </div>
          <img
            className="shape-asset shape-done"
            src={geometryAsset(theme, 'octahedron')}
            alt=""
            aria-hidden="true"
          />
        </div>

        {smokeResult ? <pre className="console">{smokeResult}</pre> : null}

        <div className="panel compact glass-surface" style={{ marginTop: 16 }}>
          <div className="row between">
            <h3>Genesis + 3-Agent Bootstrap</h3>
            <span className="muted">soul file, soul facet, orchestrator, prism</span>
          </div>

          <div className="field">
            <label>Vision Core</label>
            <input
              value={guidedVisionCore}
              onChange={(event) => setGuidedVisionCore(event.target.value)}
            />
          </div>
          <div className="field">
            <label>Core Values (comma or newline separated)</label>
            <textarea
              value={guidedCoreValues}
              onChange={(event) => setGuidedCoreValues(event.target.value)}
              rows={3}
            />
          </div>
          <div className="field">
            <label>Will Directives (comma or newline separated)</label>
            <textarea
              value={guidedWillDirectives}
              onChange={(event) => setGuidedWillDirectives(event.target.value)}
              rows={3}
            />
          </div>
          <div className="field">
            <label>Soul Facet Vision</label>
            <input
              value={guidedFacetVision}
              onChange={(event) => setGuidedFacetVision(event.target.value)}
            />
          </div>
          <div className="field">
            <label>Genesis Signing Secret</label>
            <input
              type="password"
              value={guidedSigningSecret}
              onChange={(event) => setGuidedSigningSecret(event.target.value)}
              placeholder="Required to sign soul file"
            />
          </div>
          <button
            className="btn primary"
            onClick={() =>
              runTask('Creating genesis soul file', async () => {
                if (!guidedSigningSecret.trim()) {
                  throw new Error('Enter a signing secret for genesis.');
                }
                const result = await installerApi.invokeGuidedGenesisRite({
                  vision_core: guidedVisionCore,
                  core_values: parseListInput(guidedCoreValues),
                  will_directives: parseListInput(guidedWillDirectives),
                  signing_secret: guidedSigningSecret,
                  facet_vision: guidedFacetVision || null,
                });
                setGenesisResult(result);
              })
            }
            disabled={busy}
          >
            Create Soul File + Facet
          </button>
          {genesisResult ? (
            <pre className="console">
              {`genesis_hash=${genesisResult.genesis_hash}\nsignature=${genesisResult.signature}\ncreated_at=${genesisResult.created_at}`}
            </pre>
          ) : null}

          <div className="dynamic-field-grid" style={{ marginTop: 12 }}>
            <div className="field grow">
              <label>Orchestrator Agent</label>
              <select
                value={bootstrapOrchestratorAgentId}
                onChange={(event) => setBootstrapOrchestratorAgentId(event.target.value)}
              >
                {CORE_AGENT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow">
              <label>Prism Agent</label>
              <select
                value={bootstrapPrismAgentId}
                onChange={(event) => setBootstrapPrismAgentId(event.target.value)}
              >
                {CORE_AGENT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow">
              <label>Prism Sub-Sphere ID</label>
              <input
                value={bootstrapPrismSubSphereId}
                onChange={(event) => setBootstrapPrismSubSphereId(event.target.value)}
                placeholder="meta-prism"
              />
            </div>
          </div>

          <div className="dynamic-field-grid">
            <div className="field grow">
              <label>agent-genesis Telegram Chat ID</label>
              <input
                value={agentGenesisTelegramId}
                onChange={(event) => setAgentGenesisTelegramId(event.target.value)}
              />
            </div>
            <div className="field grow">
              <label>agent-synthesis Telegram Chat ID</label>
              <input
                value={agentSynthesisTelegramId}
                onChange={(event) => setAgentSynthesisTelegramId(event.target.value)}
              />
            </div>
            <div className="field grow">
              <label>agent-auditor Telegram Chat ID</label>
              <input
                value={agentAuditorTelegramId}
                onChange={(event) => setAgentAuditorTelegramId(event.target.value)}
              />
            </div>
          </div>

          <div className="dynamic-field-grid">
            <div className="field grow">
              <label>agent-genesis Discord Thread ID</label>
              <input
                value={agentGenesisDiscordThreadId}
                onChange={(event) => setAgentGenesisDiscordThreadId(event.target.value)}
              />
            </div>
            <div className="field grow">
              <label>agent-synthesis Discord Thread ID</label>
              <input
                value={agentSynthesisDiscordThreadId}
                onChange={(event) => setAgentSynthesisDiscordThreadId(event.target.value)}
              />
            </div>
            <div className="field grow">
              <label>agent-auditor Discord Thread ID</label>
              <input
                value={agentAuditorDiscordThreadId}
                onChange={(event) => setAgentAuditorDiscordThreadId(event.target.value)}
              />
            </div>
          </div>

          <button
            className="btn primary"
            onClick={() =>
              runTask('Bootstrapping three agents', async () => {
                const result = await installerApi.bootstrapThreeAgents({
                  orchestrator_agent_id: bootstrapOrchestratorAgentId,
                  prism_agent_id: bootstrapPrismAgentId,
                  telegram_chat_id_genesis: agentGenesisTelegramId || null,
                  telegram_chat_id_synthesis: agentSynthesisTelegramId || null,
                  telegram_chat_id_auditor: agentAuditorTelegramId || null,
                  discord_thread_id_genesis: agentGenesisDiscordThreadId || null,
                  discord_thread_id_synthesis: agentSynthesisDiscordThreadId || null,
                  discord_thread_id_auditor: agentAuditorDiscordThreadId || null,
                  prism_sub_sphere_id: bootstrapPrismSubSphereId || null,
                });
                setBootstrapResult(result);
                setCommunication(result.communication);
                setDispatchAgentId(result.orchestrator_agent_id);
                setAgentBindingId(result.orchestrator_agent_id);
                setDispatchSubSphereId(result.prism_sub_sphere_id);
                await refreshCommunicationInbox(result.communication);
              })
            }
            disabled={busy}
          >
            Initialize 3 Agents
          </button>

          {bootstrapResult ? (
            <pre className="console">
              {`agents=${bootstrapResult.agent_ids.join(',')}\norchestrator=${bootstrapResult.orchestrator_agent_id}\nprism=${bootstrapResult.prism_agent_id}\nprism_sub_sphere=${bootstrapResult.prism_sub_sphere_id}`}
            </pre>
          ) : null}
        </div>

        <div className="panel compact glass-surface" style={{ marginTop: 16 }}>
          <div className="row between">
            <h3>Start Training</h3>
            <button
              className="btn secondary"
              onClick={() =>
                runTask('Refreshing training state', async () => {
                  await refreshTrainingState();
                  if (trainingSubSphereId) {
                    setTrainingWorkflows(await installerApi.getWorkflowList(trainingSubSphereId));
                  }
                })
              }
              disabled={busy}
            >
              Refresh
            </button>
          </div>

          <div className="field">
            <label>New Sub-Sphere Name</label>
            <input
              value={trainingSubSphereName}
              onChange={(event) => setTrainingSubSphereName(event.target.value)}
            />
          </div>
          <div className="field">
            <label>Sub-Sphere Objective</label>
            <input
              value={trainingSubSphereObjective}
              onChange={(event) => setTrainingSubSphereObjective(event.target.value)}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={trainingHitlRequired}
              onChange={(event) => setTrainingHitlRequired(event.target.checked)}
            />
            <span>Require HITL for this training sub-sphere</span>
          </label>
          <button
            className="btn primary"
            onClick={() =>
              runTask('Creating training sub-sphere', async () => {
                const created = await installerApi.createTaskSubSphere({
                  name: trainingSubSphereName,
                  objective: trainingSubSphereObjective,
                  hitl_required: trainingHitlRequired,
                });
                setTrainingSubSphereId(created.sub_sphere_id);
                setTrainingResult(`sub_sphere_created=${created.sub_sphere_id}`);
                await refreshTrainingState();
              })
            }
            disabled={busy}
          >
            Create Sub-Sphere
          </button>

          <div className="field">
            <label>Target Sub-Sphere</label>
            <select
              value={trainingSubSphereId}
              onChange={(event) => setTrainingSubSphereId(event.target.value)}
            >
              <option value="">Select a sub-sphere</option>
              {trainingSubSpheres.map((entry) => (
                <option key={entry.sub_sphere_id} value={entry.sub_sphere_id}>
                  {entry.name} ({entry.sub_sphere_id})
                </option>
              ))}
            </select>
          </div>

          <div className="row gap">
            <button
              className="btn secondary"
              onClick={() =>
                runTask('Starting workflow training session', async () => {
                  if (!trainingSubSphereId) {
                    throw new Error('Select a sub-sphere before starting training.');
                  }
                  const session = await installerApi.startWorkflowTraining(trainingSubSphereId);
                  setTrainingSessionId(session.session_id);
                  setTrainingResult(`session_started=${session.session_id}`);
                })
              }
              disabled={busy}
            >
              Start Session
            </button>
            <p className="mono muted">session={trainingSessionId || '(none)'}</p>
          </div>

          <div className="field">
            <label>Training Message</label>
            <input
              value={trainingMessage}
              onChange={(event) => setTrainingMessage(event.target.value)}
            />
          </div>
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Submitting training message', async () => {
                if (!trainingSessionId) {
                  throw new Error('Start a session first.');
                }
                await installerApi.submitTrainingMessage(trainingSessionId, trainingMessage);
                setTrainingResult(`message_submitted_to=${trainingSessionId}`);
              })
            }
            disabled={busy}
          >
            Submit Message
          </button>

          <div className="field">
            <label>Workflow Name</label>
            <input
              value={trainingWorkflowName}
              onChange={(event) => setTrainingWorkflowName(event.target.value)}
            />
          </div>
          <button
            className="btn primary"
            onClick={() =>
              runTask('Saving trained workflow', async () => {
                if (!trainingSessionId) {
                  throw new Error('Start a session first.');
                }
                const workflow = await installerApi.saveTrainedWorkflow(
                  trainingSessionId,
                  trainingWorkflowName,
                );
                setTrainingResult(`workflow_saved=${workflow.workflow_id}`);
                setTrainingWorkflows(await installerApi.getWorkflowList(workflow.sub_sphere_id));
              })
            }
            disabled={busy}
          >
            Save Workflow
          </button>

          {trainingResult ? <pre className="console">{trainingResult}</pre> : null}
          {trainingWorkflows.length > 0 ? (
            <div className="table">
              {trainingWorkflows.map((workflow) => (
                <div className="table-row" key={workflow.workflow_id}>
                  <span>{workflow.workflow_name}</span>
                  <span className="mono muted">{workflow.workflow_id}</span>
                  <span className="chip pass">steps={workflow.steps.length}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="row gap">
          <button
            className="btn secondary"
            onClick={() =>
              runTask('Refreshing state', async () => {
                await initialLoad();
              })
            }
            disabled={busy}
          >
            Refresh State
          </button>
          <button className="btn primary" onClick={() => setStepIndex(6)} disabled={busy}>
            View Review
          </button>
        </div>
      </section>
    );
  }

  function renderCurrentStep() {
    switch (stepIndex) {
      case 0:
        return renderWelcome();
      case 1:
        return renderSystemCheck();
      case 2:
        return renderComputeSelection();
      case 3:
        return renderProviderConfig();
      case 4:
        return renderSecurity();
      case 5:
        return renderObservability();
      case 6:
        return renderReview();
      case 7:
      default:
        return renderDone();
    }
  }

  return (
    <div className="app-shell">
      {renderStepNav()}
      <main className="content">
        <header className="panel compact glass-surface">
          <div className="row between">
            <div>
              <p className="mono muted">step_{stepIndex + 1}</p>
              <h2>{STEPS[stepIndex]}</h2>
            </div>
            <img
              className="step-indicator-asset"
              src={componentAsset(theme, 'progress/step-indicator')}
              alt=""
              aria-hidden="true"
            />
            <div className="row gap">
              <button
                className="btn ghost"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={busy || stepIndex === 0}
              >
                Back
              </button>
              <button
                className="btn secondary"
                onClick={() => setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1))}
                disabled={busy || stepIndex === STEPS.length - 1}
              >
                Continue
              </button>
            </div>
          </div>
        </header>

        {renderCurrentStep()}

        <footer className="panel compact glass-surface">
          <p className="mono">status: {status}</p>
        </footer>
      </main>
    </div>
  );
}
