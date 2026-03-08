import { useEffect, useMemo, useState } from 'react';
import { installerApi } from './lib/api';
import type {
  AgentRoutingMode,
  CommunicationStatus,
  ComputeOption,
  GenesisRiteResult,
  InstallReviewSummary,
  LocalBootstrapStatus,
  ModelDownloadStatus,
  PrismLaneOutput,
  PrismRoundCommandResult,
  PrismRuntimeInitResult,
  ProviderHealthStatus,
  SystemCheckReport,
} from './lib/types';

type ThemeName = 'light' | 'void';
type ProviderConfigFieldType = 'text' | 'password' | 'checkbox';
type GenesisMode = 'default' | 'personalized';
type SourceMode = 'bundled' | 'path' | 'url';
type SetupPath = 'quick' | 'custom';
type InitPhaseId = 'crystal' | 'tetrahedron' | 'agents' | 'taurus' | 'sphere';
type InitPhaseState = 'pending' | 'active' | 'done' | 'error';
type InitLogPhase = InitPhaseId | 'system';
type CommunicationSubStepId =
  | 'select'
  | 'telegram_token'
  | 'telegram_pair'
  | 'discord_token'
  | 'discord_target'
  | 'review';
type PairingState = 'idle' | 'listening' | 'paired' | 'timed_out' | 'error';

type InitLogEntry = {
  id: number;
  text: string;
  phase: InitLogPhase;
};

type ProviderConfigField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: ProviderConfigFieldType;
  required?: boolean;
};

type NoticeTone = 'error' | 'success';

const STEPS = [
  'Theme',
  'Welcome',
  'Compute',
  'Provider Setup',
  'Communication',
  'Genesis Rite',
  'Initialization',
  'Meet Prism',
  'First Tasks',
  'Done',
];

const DEFAULT_GENESIS = {
  vision_core: 'Build a sovereign MetaCanon runtime aligned to my values.',
  core_values: ['Sovereignty', 'Clarity', 'Truthfulness', 'Human Dignity'],
  will_directives: ['Do not bypass constitutional controls.', 'Escalate uncertain high-risk actions.'],
};

const SMOKE_QUERY = 'Return a one-line installer verification status.';
const INIT_PHASES: Array<{ id: InitPhaseId; label: string; detail: string }> = [
  { id: 'crystal', label: 'Genesis Crystal', detail: 'Hashing values + constitution anchor.' },
  { id: 'tetrahedron', label: 'Tensegrity Tetrahedron', detail: 'Primary deliberation path online.' },
  { id: 'agents', label: 'Core Lanes', detail: 'Watcher, Synthesis, and Auditor are activated behind Prism.' },
  { id: 'taurus', label: 'Torus Protocol', detail: 'Deliberation lanes and Sphere Thread publishing are online.' },
  { id: 'sphere', label: 'Sphere Established', detail: 'Prism is ready as the user-facing interface.' },
];

function emptyInitPhaseState(): Record<InitPhaseId, InitPhaseState> {
  return {
    crystal: 'pending',
    tetrahedron: 'pending',
    agents: 'pending',
    taurus: 'pending',
    sphere: 'pending',
  };
}

function prettyLaneLabel(lane: string): string {
  switch (lane) {
    case 'watcher':
      return 'Watcher';
    case 'synthesis':
      return 'Synthesis';
    case 'auditor':
      return 'Auditor';
    default:
      return lane;
  }
}

function trimForMessage(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

function formatLaneSummary(lane: PrismLaneOutput): string {
  return (
    `${prettyLaneLabel(lane.lane)} (${lane.provider_id} / ${lane.model})\n` +
    `${trimForMessage(lane.output_text, 700)}`
  );
}

function formatPrismRoundMessage(result: PrismRoundCommandResult): string {
  const laneSummary =
    result.lane_outputs.length > 0
      ? `Lane Deliberation:\n${result.lane_outputs.map(formatLaneSummary).join('\n\n')}\n\n`
      : '';
  const eventSummary = result.event_publish.enabled
    ? `${result.event_publish.succeeded}/${result.event_publish.attempted} sphere events published`
    : 'Sphere event publishing is disabled';

  return (
    `Task Complete\n\n` +
    `Route: ${result.route}\n` +
    `Round: ${result.round_id ?? 'n/a'}\n` +
    `Final provider: ${result.final_result.provider_id}\n` +
    `Model: ${result.final_result.model}\n` +
    `Fallback used: ${result.final_result.used_fallback ? 'Yes' : 'No'}\n` +
    `Sphere sync: ${eventSummary}\n\n` +
    laneSummary +
    `Final Response:\n${trimForMessage(result.final_result.output_text, 3000)}`
  );
}

function configFieldsForProvider(providerId: string): ProviderConfigField[] {
  switch (providerId) {
    case 'qwen_local':
      return [
        { key: 'runtime_backend', label: 'Runtime Backend', placeholder: 'ollama', required: true },
        { key: 'base_url', label: 'Local Base URL', placeholder: 'http://127.0.0.1:11434' },
        {
          key: 'primary_model_id',
          label: 'Primary Model',
          placeholder: 'qwen3.5:35b',
          required: true,
        },
      ];
    case 'ollama':
      return [
        { key: 'base_url', label: 'Ollama Base URL', placeholder: 'http://127.0.0.1:11434' },
        { key: 'default_model', label: 'Default Model', placeholder: 'qwen3.5:35b' },
      ];
    case 'morpheus':
      return [
        { key: 'endpoint', label: 'Morpheus Endpoint', placeholder: 'https://morpheus.local/compute' },
        { key: 'key_id', label: 'Morpheus Key', placeholder: 'morpheus-key', type: 'password', required: true },
      ];
    case 'openai':
      return [
        { key: 'api_key', label: 'OpenAI API Key', type: 'password', placeholder: 'sk-...', required: true },
        { key: 'chat_model', label: 'Chat Model', placeholder: 'gpt-4.1' },
      ];
    case 'anthropic':
      return [
        {
          key: 'api_key',
          label: 'Anthropic API Key',
          type: 'password',
          placeholder: 'sk-ant-...',
          required: true,
        },
        { key: 'model', label: 'Model', placeholder: 'claude-sonnet-4-5' },
      ];
    case 'grok':
      return [
        { key: 'api_key', label: 'Grok API Key', type: 'password', placeholder: 'xai-...', required: true },
        { key: 'model', label: 'Model', placeholder: 'grok-4-0709' },
      ];
    case 'gemini':
      return [
        { key: 'api_key', label: 'Gemini API Key', type: 'password', placeholder: 'AIza...', required: true },
        { key: 'model', label: 'Model', placeholder: 'gemini-2.0-flash' },
      ];
    default:
      return [
        { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Paste key', required: true },
        { key: 'model', label: 'Model', placeholder: 'provider-model-id' },
      ];
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

function emptyCommunication(): CommunicationStatus {
  return {
    telegram: {
      enabled: false,
      routing_mode: 'orchestrator',
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
      routing_mode: 'orchestrator',
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

function securityTier(providerId: string): 'Maximum' | 'High' | 'Balanced' {
  if (providerId === 'qwen_local' || providerId === 'ollama') {
    return 'Maximum';
  }
  if (providerId === 'morpheus') {
    return 'High';
  }
  return 'Balanced';
}

function providerDescription(providerId: string): string {
  switch (providerId) {
    case 'qwen_local':
      return 'Qwen 3.5 35B local runtime via Ollama (recommended when machine supports it).';
    case 'ollama':
      return 'Local Ollama runtime for offline-first operation.';
    case 'morpheus':
      return 'Remote Morpheus provider. Encrypted loop can be configured in advanced settings.';
    case 'openai':
      return 'OpenAI cloud fallback.';
    case 'anthropic':
      return 'Anthropic cloud fallback.';
    case 'grok':
      return 'Grok cloud fallback.';
    case 'gemini':
      return 'Gemini cloud fallback.';
    default:
      return 'Provider fallback option.';
  }
}

function toQuestionList(raw: string): string[] {
  return raw
    .split(/[,\n]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function emptyModelDownloadStatus(): ModelDownloadStatus {
  return {
    status: 'idle',
    model_id: null,
    progress_percent: null,
    detail: 'No model download in progress.',
    updated_at_epoch_ms: Date.now(),
  };
}

function normalizeTelegramBotToken(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith('bot')) {
    return trimmed.slice(3).trim();
  }
  return trimmed;
}

function isLikelyTelegramToken(value: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(value);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(resolveInitialTheme);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);

  const [computeOptions, setComputeOptions] = useState<ComputeOption[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthStatus[]>([]);
  const [systemReport, setSystemReport] = useState<SystemCheckReport>(emptySystemReport());
  const [localBootstrap, setLocalBootstrap] = useState<LocalBootstrapStatus>(emptyLocalBootstrap());
  const [communication, setCommunication] = useState<CommunicationStatus>(emptyCommunication());

  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [fallbackOrder, setFallbackOrder] = useState<string[]>([]);
  const [setupPath, setSetupPath] = useState<SetupPath>('quick');
  const [dragProviderId, setDragProviderId] = useState<string | null>(null);
  const [dragTargetProviderId, setDragTargetProviderId] = useState<string | null>(null);
  const [suppressCardClick, setSuppressCardClick] = useState(false);

  const [providerConfigDrafts, setProviderConfigDrafts] = useState<Record<string, Record<string, string>>>({});

  const [localSourceMode, setLocalSourceMode] = useState<SourceMode>('bundled');
  const [localSourceInput, setLocalSourceInput] = useState('');
  const [localSetupResult, setLocalSetupResult] = useState('');
  const [modelDownloadStatus, setModelDownloadStatus] = useState<ModelDownloadStatus>(
    emptyModelDownloadStatus(),
  );

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramRoutingMode, setTelegramRoutingMode] = useState<AgentRoutingMode>('orchestrator');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramDefaultChatId, setTelegramDefaultChatId] = useState('');

  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordRoutingMode, setDiscordRoutingMode] = useState<AgentRoutingMode>('orchestrator');
  const [discordBotToken, setDiscordBotToken] = useState('');
  const [discordGuildId, setDiscordGuildId] = useState('');
  const [discordDefaultChannelId, setDiscordDefaultChannelId] = useState('');

  const [communicationTestResult, setCommunicationTestResult] = useState('');
  const [communicationSubStepIndex, setCommunicationSubStepIndex] = useState(0);
  const [telegramPairCode, setTelegramPairCode] = useState('');
  const [telegramPairState, setTelegramPairState] = useState<PairingState>('idle');
  const [telegramPairStatusText, setTelegramPairStatusText] = useState('');

  const [genesisMode, setGenesisMode] = useState<GenesisMode>('default');
  const [visionCore, setVisionCore] = useState(DEFAULT_GENESIS.vision_core);
  const [coreValues, setCoreValues] = useState(DEFAULT_GENESIS.core_values.join(', '));
  const [willDirectives, setWillDirectives] = useState(DEFAULT_GENESIS.will_directives.join('\n'));
  const [genesisSigningSecret, setGenesisSigningSecret] = useState('');
  const [genesisResult, setGenesisResult] = useState<GenesisRiteResult | null>(null);
  const [genesisStatusMessage, setGenesisStatusMessage] = useState('');

  const [constitutionSource, setConstitutionSource] = useState<'latest' | 'upload'>('latest');
  const [constitutionVersion, setConstitutionVersion] = useState('Constitution vCurrent');
  const [constitutionUploadPath, setConstitutionUploadPath] = useState('');

  const [initializationLog, setInitializationLog] = useState<InitLogEntry[]>([]);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [initializationPhaseState, setInitializationPhaseState] =
    useState<Record<InitPhaseId, InitPhaseState>>(emptyInitPhaseState());
  const [activeInitializationPhase, setActiveInitializationPhase] = useState<InitPhaseId | null>(
    null,
  );
  const [review, setReview] = useState<InstallReviewSummary | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<PrismRuntimeInitResult | null>(null);

  const [prismName, setPrismName] = useState('Prism');
  const [prismTestResult, setPrismTestResult] = useState('');

  const [starterTask, setStarterTask] = useState('Create a short system health summary.');
  const [starterTaskResult, setStarterTaskResult] = useState('');


  const selectedProviderObjects = useMemo(
    () => fallbackOrder.map((id) => computeOptions.find((option) => option.provider_id === id)).filter(Boolean) as ComputeOption[],
    [computeOptions, fallbackOrder],
  );

  function appendLog(text: string, phase: InitLogPhase = 'system') {
    setInitializationLog((previous) => [...previous, { id: Date.now() + Math.random(), text, phase }]);
  }

  function playPhaseChime(_phase: InitPhaseId) {
    // Sound cues are intentionally disabled in the guided installer until they are a persisted preference.
  }

  function activateInitPhase(phase: InitPhaseId) {
    playPhaseChime(phase);
    setActiveInitializationPhase(phase);
    setInitializationPhaseState((previous) => ({ ...previous, [phase]: 'active' }));
  }

  function completeInitPhase(phase: InitPhaseId) {
    setInitializationPhaseState((previous) => ({ ...previous, [phase]: 'done' }));
  }

  function failInitPhase(phase: InitPhaseId) {
    setInitializationPhaseState((previous) => ({ ...previous, [phase]: 'error' }));
  }

  async function runTask(label: string, task: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({
        tone: 'error',
        message: `${label} failed. ${message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshCoreState() {
    const [options, health, checks, bootstrap, comms] = await Promise.all([
      installerApi.getComputeOptions(),
      installerApi.getProviderHealth(),
      installerApi.runSystemCheck(),
      installerApi.getLocalBootstrapStatus(),
      installerApi.getCommunicationStatus(),
    ]);

    setComputeOptions(options);
    setProviderHealth(health);
    setSystemReport(checks);
    setLocalBootstrap(bootstrap);
    setCommunication(comms);

    setTelegramEnabled(comms.telegram.enabled);
    setTelegramRoutingMode(comms.telegram.routing_mode);
    setTelegramDefaultChatId(comms.telegram.default_chat_id ?? '');

    setDiscordEnabled(comms.discord.enabled);
    setDiscordRoutingMode(comms.discord.routing_mode);
    setDiscordGuildId(comms.discord.guild_id ?? '');
    setDiscordDefaultChannelId(comms.discord.default_channel_id ?? '');

    const currentGlobal = options.find((option) => option.selected_global)?.provider_id;
    const suggested = currentGlobal ? [currentGlobal] : options.some((opt) => opt.provider_id === 'qwen_local') ? ['qwen_local'] : [];
    if (selectedProviders.length === 0 && suggested.length > 0) {
      setSelectedProviders(suggested);
      setFallbackOrder(suggested);
    }

    return { options, health, checks, bootstrap, comms };
  }

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void runTask('Loading installer state', async () => {
      await refreshCoreState();
      await installerApi.flushRuntimeAutoSnapshot();
    });
  }, []);

  useEffect(() => {
    setNotice(null);
  }, [stepIndex]);

  useEffect(() => {
    if (modelDownloadStatus.status !== 'running') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        const latest = await installerApi.getModelDownloadStatus();
        setModelDownloadStatus(latest);
        if (latest.status === 'completed' || latest.status === 'failed') {
          setLocalBootstrap(await installerApi.getLocalBootstrapStatus());
          if (latest.status === 'completed') {
            setLocalSetupResult(`${latest.detail}`);
          }
        }
      })();
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [modelDownloadStatus.status]);

  function toggleProvider(providerId: string) {
    const exists = selectedProviders.includes(providerId);
    if (exists) {
      const nextProviders = selectedProviders.filter((id) => id !== providerId);
      setSelectedProviders(nextProviders);
      setFallbackOrder((previous) => previous.filter((id) => id !== providerId));
      return;
    }

    setSelectedProviders((previous) => [...previous, providerId]);
    setFallbackOrder((previous) => [...previous, providerId]);
  }

  function reorderFallbackByDrop(draggedProviderId: string, targetProviderId: string) {
    if (draggedProviderId === targetProviderId) {
      return;
    }

    setFallbackOrder((previous) => {
      if (!previous.includes(draggedProviderId) || !previous.includes(targetProviderId)) {
        return previous;
      }

      const filtered = previous.filter((id) => id !== draggedProviderId);
      const targetIndex = filtered.indexOf(targetProviderId);
      filtered.splice(targetIndex, 0, draggedProviderId);
      return filtered;
    });
  }

  function setProviderDraftValue(providerId: string, key: string, value: string) {
    setProviderConfigDrafts((previous) => ({
      ...previous,
      [providerId]: {
        ...(previous[providerId] ?? {}),
        [key]: value,
      },
    }));
  }

  async function persistComputeSelection() {
    if (fallbackOrder.length === 0) {
      throw new Error('Select at least one compute provider.');
    }

    await installerApi.setGlobalComputeProvider(fallbackOrder[0]);
    const cloudOrder = fallbackOrder.filter((id) => !['qwen_local', 'ollama'].includes(id));
    if (cloudOrder.length > 0) {
      await installerApi.setProviderPriority(cloudOrder);
    }

    await refreshCoreState();
  }

  async function saveProviderConfig(providerId: string) {
    const fields = configFieldsForProvider(providerId);
    const draft = providerConfigDrafts[providerId] ?? {};
    const patch: Record<string, string> = {};

    for (const field of fields) {
      const value = (draft[field.key] ?? '').trim();
      if (!value) {
        continue;
      }
      patch[field.key] = value;
    }

    const missingRequired = fields.some((field) => field.required && !(draft[field.key] ?? '').trim());
    if (missingRequired) {
      throw new Error('Fill all required fields before saving.');
    }

    if (Object.keys(patch).length === 0) {
      throw new Error('Enter at least one value before saving provider settings.');
    }

    await installerApi.updateProviderConfig(providerId, patch);
    await refreshCoreState();
  }

  function isLocalProviderId(providerId: string): boolean {
    return providerId === 'qwen_local' || providerId === 'ollama';
  }

  function requiredFieldsForProvider(providerId: string): ProviderConfigField[] {
    return configFieldsForProvider(providerId).filter((field) => field.required);
  }

  function providerDraftHasRequiredValues(providerId: string): boolean {
    const draft = providerConfigDrafts[providerId] ?? {};
    return requiredFieldsForProvider(providerId).every((field) => Boolean((draft[field.key] ?? '').trim()));
  }

  function localQwenReady(bootstrap: LocalBootstrapStatus = localBootstrap): boolean {
    return bootstrap.ollama_installed && bootstrap.ollama_reachable && bootstrap.qwen_model_hint_present;
  }

  function providerIsReady(
    providerId: string,
    healthList: ProviderHealthStatus[] = providerHealth,
    bootstrap: LocalBootstrapStatus = localBootstrap,
  ): boolean {
    const health = healthList.find((entry) => entry.provider_id === providerId);
    if (providerId === 'qwen_local') {
      return Boolean(health?.is_healthy) && localQwenReady(bootstrap);
    }
    if (providerId === 'ollama') {
      return Boolean(health?.is_healthy) && bootstrap.ollama_installed && bootstrap.ollama_reachable;
    }
    return Boolean(health?.is_healthy);
  }

  function providerCanContinue(providerId: string): boolean {
    if (isLocalProviderId(providerId)) {
      return providerIsReady(providerId);
    }
    const requiredFields = requiredFieldsForProvider(providerId);
    if (requiredFields.length === 0) {
      return providerIsReady(providerId);
    }
    return providerIsReady(providerId) || providerDraftHasRequiredValues(providerId);
  }

  async function persistProviderSetup() {
    if (selectedProviders.some((providerId) => isLocalProviderId(providerId))) {
      await syncLocalComputeConfigFromUi();
    }

    const remoteProviders = selectedProviderObjects.filter((provider) => !isLocalProviderId(provider.provider_id));
    for (const provider of remoteProviders) {
      if (providerIsReady(provider.provider_id)) {
        continue;
      }

      if (!providerDraftHasRequiredValues(provider.provider_id)) {
        const labels = requiredFieldsForProvider(provider.provider_id)
          .map((field) => field.label)
          .join(', ');
        throw new Error(`Enter ${labels} for ${provider.display_name} before continuing.`);
      }

      await saveProviderConfig(provider.provider_id);
    }

    const { health, bootstrap } = await refreshCoreState();
    const localSelected = selectedProviders.some((providerId) => isLocalProviderId(providerId));
    if (localSelected && !localQwenReady(bootstrap)) {
      throw new Error('Local Qwen is not ready yet. Install Ollama, start it, and download Qwen 3.5 35B before continuing.');
    }

    const pendingProviders = selectedProviderObjects.filter(
      (provider) => !providerIsReady(provider.provider_id, health, bootstrap),
    );
    if (pendingProviders.length > 0) {
      throw new Error(
        `Finish setup for ${pendingProviders.map((provider) => provider.display_name).join(', ')} before continuing.`,
      );
    }
  }

  async function syncLocalComputeConfigFromUi() {
    const qwenDraft = providerConfigDrafts.qwen_local ?? {};
    const ollamaDraft = providerConfigDrafts.ollama ?? {};

    const runtimeBackend = (qwenDraft.runtime_backend ?? 'ollama').trim() || 'ollama';
    const baseUrl =
      (qwenDraft.base_url ?? ollamaDraft.base_url ?? 'http://127.0.0.1:11434').trim() ||
      'http://127.0.0.1:11434';
    const primaryModelId = (qwenDraft.primary_model_id ?? 'qwen3.5:35b').trim() || 'qwen3.5:35b';
    const defaultModel = (ollamaDraft.default_model ?? primaryModelId).trim() || primaryModelId;

    await installerApi.updateProviderConfig('qwen_local', {
      runtime_backend: runtimeBackend,
      base_url: baseUrl,
      primary_model_id: primaryModelId,
    });
    await installerApi.updateProviderConfig('ollama', {
      base_url: baseUrl,
      default_model: defaultModel,
    });
  }

  async function prepareLocalQwenStack() {
    const baseline = await installerApi.prepareLocalRuntime(false);
    setLocalBootstrap(baseline);

    if (localSourceMode !== 'bundled') {
      if (!localSourceInput.trim()) {
        throw new Error('Enter a source path or URL before installing model assets.');
      }
      const result = await installerApi.installLocalModelPack(localSourceInput.trim());
      setLocalSetupResult(
        `Model assets were installed from ${result.source_kind}. ${result.installed_files} files were added to ${result.model_root}.`,
      );
      setLocalBootstrap(result.bootstrap);
    }

    await syncLocalComputeConfigFromUi();
    const latestBootstrap = await installerApi.getLocalBootstrapStatus();
    setLocalBootstrap(latestBootstrap);
    if (!latestBootstrap.qwen_model_hint_present) {
      const status = await installerApi.startModelDownload('qwen3.5:35b');
      setModelDownloadStatus(status);
      setLocalSetupResult('');
    } else {
      await refreshCoreState();
    }
  }

  async function downloadQwenModelOnly() {
    const status = await installerApi.startModelDownload('qwen3.5:35b');
    setModelDownloadStatus(status);
    setLocalSetupResult('');
  }

  async function runLocalActionWithFeedback(label: string, task: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    setLocalSetupResult(`${label}...`);
    try {
      await task();
      setLocalSetupResult((previous) =>
        previous === `${label}...`
          ? `${label} started. You can stay on this screen while it finishes.`
          : previous,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalSetupResult(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveCommunicationChannels() {
    const normalizedTelegramToken = normalizeTelegramBotToken(telegramBotToken);
    if (telegramEnabled && normalizedTelegramToken && !isLikelyTelegramToken(normalizedTelegramToken)) {
      throw new Error('Telegram bot token format looks invalid. Use the exact token from BotFather (no leading "bot").');
    }

    await installerApi.updateTelegramIntegration({
      enabled: telegramEnabled,
      routing_mode: telegramRoutingMode,
      bot_token: normalizedTelegramToken || null,
      default_chat_id: telegramDefaultChatId || null,
      orchestrator_chat_id: telegramDefaultChatId || null,
    });

    await installerApi.updateDiscordIntegration({
      enabled: discordEnabled,
      routing_mode: discordRoutingMode,
      bot_token: discordBotToken || null,
      guild_id: discordGuildId || null,
      default_channel_id: discordDefaultChannelId || null,
      orchestrator_thread_id: null,
      auto_spawn_sub_sphere_threads: true,
    });

    if (telegramEnabled) {
      await installerApi.startTelegramDeliberationListener();
    }

    setCommunication(await installerApi.getCommunicationStatus());
  }

  async function runGenesis() {
    if (!genesisSigningSecret.trim()) {
      throw new Error('Genesis signing secret is required.');
    }
    if (!constitutionVersion.trim()) {
      throw new Error('Choose a constitution version label before running the genesis rite.');
    }
    if (constitutionSource === 'upload' && !constitutionUploadPath.trim()) {
      throw new Error('Enter the path to your custom constitution before running the genesis rite.');
    }

    const payload =
      genesisMode === 'default'
        ? {
            vision_core: DEFAULT_GENESIS.vision_core,
            core_values: DEFAULT_GENESIS.core_values,
            will_directives: DEFAULT_GENESIS.will_directives,
            signing_secret: genesisSigningSecret,
            facet_vision: 'Constitutional synthesis and values stewardship.',
            constitution_source: constitutionSource,
            constitution_version: constitutionVersion.trim(),
            constitution_upload_path:
              constitutionSource === 'upload' ? constitutionUploadPath.trim() : null,
          }
        : {
            vision_core: visionCore,
            core_values: toQuestionList(coreValues),
            will_directives: toQuestionList(willDirectives),
            signing_secret: genesisSigningSecret,
            facet_vision: 'Constitutional synthesis and values stewardship.',
            constitution_source: constitutionSource,
            constitution_version: constitutionVersion.trim(),
            constitution_upload_path:
              constitutionSource === 'upload' ? constitutionUploadPath.trim() : null,
          };

    const result = await installerApi.invokeGuidedGenesisRite(payload);
    setGenesisResult(result);
  }

  async function runGenesisWithFeedback() {
    setBusy(true);
    setNotice(null);
    setGenesisStatusMessage('Running genesis rite...');
    try {
      await runGenesis();
      setGenesisStatusMessage('Genesis rite complete. Values and constitution reference have been sealed into the genesis record.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenesisStatusMessage(`Genesis rite failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runInitializationSequence() {
    if (!genesisResult) {
      throw new Error('Run Genesis Rite before initialization.');
    }

    setInitializationLog([]);
    setInitializationComplete(false);
    setInitializationPhaseState(emptyInitPhaseState());
    setActiveInitializationPhase(null);

    let activePhase: InitPhaseId | null = null;

    try {
      activePhase = 'crystal';
      activateInitPhase('crystal');
      appendLog('Genesis crystal initiated.', 'crystal');
      const reviewState = await installerApi.getInstallReviewSummary();
      setReview(reviewState);
      appendLog(
        reviewState.can_install
          ? 'System review passed. Initialization can continue.'
          : 'System review found open issues, but initialization is continuing for inspection.',
        'crystal',
      );
      completeInitPhase('crystal');

      activePhase = 'tetrahedron';
      activateInitPhase('tetrahedron');
      appendLog('Building tensegrity tetrahedron...', 'tetrahedron');
      const smoke = await installerApi.runPrismRound({
        query: SMOKE_QUERY,
        provider_override: fallbackOrder[0] ?? null,
        channel: 'installer',
        force_deliberation: false,
      });
      appendLog(
        `Primary compute responded through ${smoke.final_result.provider_id} using ${smoke.final_result.model} (${smoke.route}).`,
        'tetrahedron',
      );
      if (smoke.round_id) {
        appendLog(`Round ${smoke.round_id} reached synthesis across ${smoke.lane_outputs.length} lanes.`, 'tetrahedron');
      }
      completeInitPhase('tetrahedron');

      activePhase = 'agents';
      activateInitPhase('agents');
      appendLog('Initializing Prism runtime and internal lanes: watcher, synthesis, auditor...', 'agents');
      const bootstrap = await installerApi.initializePrismRuntime({
        prism_display_name: prismName,
        prism_sub_sphere_id: 'meta-prism',
        telegram_chat_id: telegramDefaultChatId || null,
        discord_thread_id: discordDefaultChannelId || null,
      });
      setBootstrapResult(bootstrap);
      appendLog(
        bootstrap.sphere_signer_did
          ? `Sphere signer ready: ${bootstrap.sphere_signer_did}.`
          : 'Sphere signer unavailable. Engine publishing will stay local-only until the signer is ready.',
        'agents',
      );
      completeInitPhase('agents');

      activePhase = 'taurus';
      activateInitPhase('taurus');
      appendLog('Initiating Torus protocol...', 'taurus');
      await installerApi.flushRuntimeAutoSnapshot();
      appendLog('Persistence, Prism routing, and Sphere Thread publishing synchronized.', 'taurus');
      completeInitPhase('taurus');

      activePhase = 'sphere';
      activateInitPhase('sphere');
      appendLog('Values synthesis complete.', 'sphere');
      appendLog('Sphere established.', 'sphere');
      completeInitPhase('sphere');
      setInitializationComplete(true);
      setActiveInitializationPhase(null);
    } catch (error) {
      if (activePhase) {
        failInitPhase(activePhase);
      }
      throw error;
    }
  }

  function platformLabel(platform: 'telegram' | 'discord' | 'in_app'): string {
    switch (platform) {
      case 'telegram':
        return 'Telegram';
      case 'discord':
        return 'Discord';
      default:
        return 'In-app';
    }
  }

  async function sendPrismTestMessage() {
    if (!bootstrapResult) {
      throw new Error('Initialization must complete before sending a prism test.');
    }

    const platforms: Array<'telegram' | 'discord' | 'in_app'> = [];
    if (communication.telegram.enabled && communication.telegram.configured) {
      platforms.push('telegram');
    }
    if (communication.discord.enabled && communication.discord.configured) {
      platforms.push('discord');
    }
    if (platforms.length === 0) {
      platforms.push('in_app');
    }

    const message = `Hello from ${prismName}. Confirm communication channels are active.`;
    const lines: string[] = [];

    for (const platform of platforms) {
      const dispatch = await installerApi.sendAgentMessage({
        platform,
        agent_id: bootstrapResult.orchestrator_agent_id,
        message,
      });
      const label = platformLabel(dispatch.platform);
      if (dispatch.delivered_live) {
        lines.push(`${label}: live test message sent successfully.`);
      } else {
        lines.push(`${label}: test message was queued for delivery.`);
      }
    }

    setPrismTestResult(lines.join(' '));
  }

  async function runStarterTask() {
    if (!bootstrapResult) {
      throw new Error('Initialization must complete before running starter tasks.');
    }

    const platforms: Array<'telegram' | 'discord' | 'in_app'> = [];
    if (communication.telegram.enabled && communication.telegram.configured) {
      platforms.push('telegram');
    }
    if (communication.discord.enabled && communication.discord.configured) {
      platforms.push('discord');
    }
    if (platforms.length === 0) {
      platforms.push('in_app');
    }

    const runningMessage = `Running Task: ${starterTask}...`;
    for (const platform of platforms) {
      await installerApi.sendAgentMessage({
        platform,
        agent_id: bootstrapResult.orchestrator_agent_id,
        message: runningMessage,
      });
    }

    let completionMessage = '';
    const normalizedTask = starterTask.trim().toLowerCase();
    const isSystemHealthTask =
      normalizedTask.includes('system health') ||
      normalizedTask.includes('runtime health');

    if (isSystemHealthTask) {
      const [checks, health, bootstrap] = await Promise.all([
        installerApi.runSystemCheck(),
        installerApi.getProviderHealth(),
        installerApi.getLocalBootstrapStatus(),
      ]);

      const topIssues = checks.checks
        .filter((item) => item.status !== 'pass')
        .slice(0, 5)
        .map((item) => `- ${item.label}: ${item.status} (${item.detail})`);
      const unhealthyProviders = health
        .filter((provider) => !provider.is_healthy)
        .map((provider) => `- ${provider.provider_id}: ${provider.detail ?? 'unhealthy'}`);

      completionMessage =
        `System Health Summary\n\n` +
        `Blocking issues: ${checks.fail_count}\n` +
        `Warnings: ${checks.warn_count}\n` +
        `Ollama installed: ${bootstrap.ollama_installed ? 'Yes' : 'No'}\n` +
        `Ollama running: ${bootstrap.ollama_reachable ? 'Yes' : 'No'}\n` +
        `Qwen 3.5 35B ready: ${bootstrap.qwen_model_hint_present ? 'Yes' : 'No'}\n\n` +
        `Top Issues:\n${topIssues.length > 0 ? topIssues.join('\n') : '- none'}\n\n` +
        `Unhealthy Providers:\n${unhealthyProviders.length > 0 ? unhealthyProviders.join('\n') : '- none'}`;
    } else {
      if (fallbackOrder.some((providerId) => providerId === 'qwen_local' || providerId === 'ollama')) {
        await syncLocalComputeConfigFromUi();
      }
      const prismRound = await installerApi.runPrismRound({
        query: starterTask,
        provider_override: fallbackOrder[0] ?? null,
        channel: platforms[0],
        force_deliberation: true,
      });
      completionMessage = formatPrismRoundMessage(prismRound);
    }

    for (const platform of platforms) {
      await installerApi.sendAgentMessage({
        platform,
        agent_id: bootstrapResult.orchestrator_agent_id,
        message: completionMessage,
      });
    }

    setStarterTaskResult(completionMessage);
  }

  function communicationSubSteps(): CommunicationSubStepId[] {
    const steps: CommunicationSubStepId[] = ['select'];
    if (telegramEnabled) {
      steps.push('telegram_token', 'telegram_pair');
    }
    if (discordEnabled) {
      steps.push('discord_token', 'discord_target');
    }
    steps.push('review');
    return steps;
  }

  const communicationSteps = communicationSubSteps();
  const communicationSubStep = communicationSteps[Math.min(communicationSubStepIndex, communicationSteps.length - 1)];

  useEffect(() => {
    const maxIndex = Math.max(0, communicationSteps.length - 1);
    if (communicationSubStepIndex > maxIndex) {
      setCommunicationSubStepIndex(maxIndex);
    }
  }, [communicationSubStepIndex, communicationSteps.length]);

  function communicationStepLabel(step: CommunicationSubStepId): string {
    switch (step) {
      case 'select':
        return 'Select Channels';
      case 'telegram_token':
        return 'Telegram Bot';
      case 'telegram_pair':
        return 'Telegram Pairing';
      case 'discord_token':
        return 'Discord Bot';
      case 'discord_target':
        return 'Discord Target';
      case 'review':
        return 'Review';
      default:
        return 'Communication';
    }
  }

  function isTelegramSetupComplete(): boolean {
    if (!telegramEnabled) {
      return true;
    }
    return Boolean(telegramBotToken.trim()) && Boolean(telegramDefaultChatId.trim());
  }

  function isDiscordSetupComplete(): boolean {
    if (!discordEnabled) {
      return true;
    }
    return Boolean(discordBotToken.trim()) && Boolean(discordGuildId.trim()) && Boolean(discordDefaultChannelId.trim());
  }

  function isCommunicationFlowComplete(): boolean {
    const onReviewStep = communicationSubStepIndex >= communicationSteps.length - 1;
    return onReviewStep && isTelegramSetupComplete() && isDiscordSetupComplete();
  }

  function canAdvanceCommunicationSubStep(): boolean {
    switch (communicationSubStep) {
      case 'select':
        return telegramEnabled || discordEnabled;
      case 'telegram_token':
        return Boolean(telegramBotToken.trim());
      case 'telegram_pair':
        return Boolean(telegramDefaultChatId.trim());
      case 'discord_token':
        return Boolean(discordBotToken.trim());
      case 'discord_target':
        return Boolean(discordGuildId.trim()) && Boolean(discordDefaultChannelId.trim());
      default:
        return true;
    }
  }

  function nextCommunicationSubStep() {
    if (!canAdvanceCommunicationSubStep()) {
      return;
    }
    setCommunicationSubStepIndex((index) => Math.min(communicationSteps.length - 1, index + 1));
  }

  function previousCommunicationSubStep() {
    setCommunicationSubStepIndex((index) => Math.max(0, index - 1));
  }

  async function startTelegramPairingMode() {
    const normalizedTelegramToken = normalizeTelegramBotToken(telegramBotToken);
    if (!normalizedTelegramToken) {
      throw new Error('Enter Telegram bot token first.');
    }
    if (!isLikelyTelegramToken(normalizedTelegramToken)) {
      throw new Error('Telegram bot token format looks invalid. Use the exact token from BotFather (no leading "bot").');
    }

    const code = `MC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setTelegramEnabled(true);
    setTelegramPairState('idle');
    setTelegramPairStatusText('Preparing Telegram integration...');
    setTelegramPairCode(code);

    try {
      await withTimeout(
        installerApi.updateTelegramIntegration({
          enabled: true,
          routing_mode: telegramRoutingMode,
          bot_token: normalizedTelegramToken,
          default_chat_id: telegramDefaultChatId.trim() || null,
          orchestrator_chat_id: telegramDefaultChatId.trim() || null,
        }),
        12000,
        'Telegram integration setup',
      );
      setTelegramPairState('listening');
      setTelegramPairStatusText(`Pair code ${code} generated. Send "/pair ${code}" to your bot.`);
    } catch (error) {
      setTelegramPairState('error');
      const message = error instanceof Error ? error.message : String(error);
      setTelegramPairStatusText(`Pairing failed: ${message}`);
      throw error;
    }
  }

  useEffect(() => {
    if (telegramPairState !== 'listening' || !telegramPairCode.trim()) {
      return;
    }

    let stopped = false;
    const codeLower = telegramPairCode.trim().toLowerCase();

    const intervalId = window.setInterval(() => {
      void (async () => {
        if (stopped) {
          return;
        }

        try {
          await installerApi.pollTelegramUpdatesOnce(50);
          const inbox = await installerApi.getTelegramInbox(50, 0);
          const match = inbox.find((entry) => entry.text.toLowerCase().includes(codeLower));

          if (!match) {
            return;
          }

          stopped = true;
          window.clearInterval(intervalId);
          window.clearTimeout(timeoutId);

          setTelegramDefaultChatId(match.chat_id);
          setTelegramPairState('paired');
          setTelegramPairStatusText(`Paired with chat ${match.chat_id}.`);

          await installerApi.updateTelegramIntegration({
            enabled: true,
            routing_mode: telegramRoutingMode,
            bot_token: normalizeTelegramBotToken(telegramBotToken),
            default_chat_id: match.chat_id,
            orchestrator_chat_id: match.chat_id,
          });
          setCommunication(await installerApi.getCommunicationStatus());
        } catch (error) {
          stopped = true;
          window.clearInterval(intervalId);
          window.clearTimeout(timeoutId);
          setTelegramPairState('error');
          setTelegramPairStatusText(
            error instanceof Error ? `Pairing failed: ${error.message}` : `Pairing failed: ${String(error)}`,
          );
        }
      })();
    }, 2500);

    const timeoutId = window.setTimeout(() => {
      if (stopped) {
        return;
      }
      stopped = true;
      window.clearInterval(intervalId);
      setTelegramPairState('timed_out');
      setTelegramPairStatusText('Pairing timed out. Start again and send the pair code within 90 seconds.');
    }, 90_000);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [telegramPairCode, telegramPairState, telegramBotToken, telegramRoutingMode]);

  function canContinue(): boolean {
    const localSelected = selectedProviders.some((providerId) => isLocalProviderId(providerId));
    const remoteReady = selectedProviderObjects
      .filter((provider) => !isLocalProviderId(provider.provider_id))
      .every((provider) => providerCanContinue(provider.provider_id));

    switch (stepIndex) {
      case 1:
        return setupPath === 'quick';
      case 2:
        return fallbackOrder.length > 0;
      case 3:
        return selectedProviderObjects.length > 0 && remoteReady && (!localSelected || localQwenReady());
      case 4:
        return isCommunicationFlowComplete();
      case 5:
        return Boolean(genesisResult);
      case 6:
        return initializationComplete;
      default:
        return true;
    }
  }

  async function onContinue() {
    setBusy(true);
    setNotice(null);

    try {
      if (stepIndex === 2) {
        await persistComputeSelection();
      }

      if (stepIndex === 3) {
        await persistProviderSetup();
      }

      if (stepIndex === 4) {
        await saveCommunicationChannels();
      }

      setStepIndex((previous) => Math.min(STEPS.length - 1, previous + 1));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({
        tone: 'error',
        message,
      });
    } finally {
      setBusy(false);
    }
  }

  function renderThemeStep() {
    return (
      <section className="wizard-panel hero-step">
        <img className="hero-geometry" src={geometryAsset(theme, 'genesis-crystal')} alt="" aria-hidden="true" />
        <h1>MetaCanon Installer</h1>
        <p className="muted">Initializing the genesis of your sovereign mind.</p>
        <div className="theme-choice-row">
          <button className={`theme-choice ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
            <img className="inline-icon" src={iconAsset(theme, 'icon-sun')} alt="" aria-hidden="true" />
            Light
          </button>
          <button className={`theme-choice ${theme === 'void' ? 'active' : ''}`} onClick={() => setTheme('void')}>
            <img className="inline-icon" src={iconAsset(theme, 'icon-star')} alt="" aria-hidden="true" />
            Dark
          </button>
        </div>
      </section>
    );
  }

  function renderWelcomeStep() {
    return (
      <section className="wizard-panel">
        <h2>Welcome to MetaCanon</h2>
        <p className="muted">This setup guides you one decision at a time. Quick Path is the current guided install flow.</p>
        <div className="card-grid two-up">
          <button
            className={`setup-card path-card ${setupPath === 'quick' ? 'selected' : ''}`}
            onClick={() => setSetupPath('quick')}
          >
            <h3>Quick Path</h3>
            <p>Recommended settings, local-first compute, and secure defaults.</p>
          </button>
          <button
            className="setup-card path-card disabled"
            type="button"
            disabled
          >
            <h3>Custom Path</h3>
            <p>Coming soon. Advanced branching and deeper setup controls will live here.</p>
          </button>
        </div>
      </section>
    );
  }

  function renderComputeStep() {
    return (
      <section className="wizard-panel">
        <h2>Choose Compute + Fallback Order</h2>
        <p className="muted">Select one or more providers, then drag the selected cards into the order you want the installer to try them.</p>

        <div className="card-grid compute-grid">
          {computeOptions.map((option) => {
            const selected = selectedProviders.includes(option.provider_id);
            const priorityIndex = selected ? fallbackOrder.indexOf(option.provider_id) + 1 : 0;
            return (
              <button
                key={option.provider_id}
                className={`provider-choice ${selected ? 'selected' : ''} ${
                  dragTargetProviderId === option.provider_id ? 'drag-target' : ''
                }`}
                onClick={() => {
                  if (suppressCardClick) {
                    return;
                  }
                  toggleProvider(option.provider_id);
                }}
                draggable={selected}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', option.provider_id);
                  setDragProviderId(option.provider_id);
                  setSuppressCardClick(true);
                }}
                onDragEnd={() => {
                  setDragProviderId(null);
                  setDragTargetProviderId(null);
                  window.setTimeout(() => setSuppressCardClick(false), 120);
                }}
                onDragOver={(event) => {
                  if (!selected || !dragProviderId || dragProviderId === option.provider_id) {
                    return;
                  }
                  event.preventDefault();
                  setDragTargetProviderId(option.provider_id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromTransfer = event.dataTransfer.getData('text/plain');
                  const draggedId = dragProviderId ?? fromTransfer;
                  if (!draggedId || !selected) {
                    return;
                  }
                  reorderFallbackByDrop(draggedId, option.provider_id);
                  setDragProviderId(null);
                  setDragTargetProviderId(null);
                  setSuppressCardClick(true);
                  window.setTimeout(() => setSuppressCardClick(false), 120);
                }}
              >
                <div className="row between">
                  <strong>{option.display_name}</strong>
                  {selected ? <span className="chip">#{priorityIndex}</span> : null}
                </div>
                <p className="muted mono">{option.provider_id}</p>
                <p className="muted">
                  Security Rating: <strong>{securityTier(option.provider_id)}</strong>
                </p>
                <p className="muted">{providerDescription(option.provider_id)}</p>
              </button>
            );
          })}
        </div>

        <p className="muted">Drag selected cards to reorder fallback priority. Card number = priority.</p>
      </section>
    );
  }

  function renderProviderSetupStep() {
    const localSelected = selectedProviders.some((providerId) => isLocalProviderId(providerId));
    const remoteProviders = selectedProviderObjects.filter((provider) => !isLocalProviderId(provider.provider_id));

    return (
      <section className="wizard-panel">
        <h2>Provider Setup</h2>
        <p className="muted">Finish the setup work for the providers you chose. The installer keeps this screen focused on only what still needs action.</p>

        {localSelected ? (
          <article className="setup-card">
            <h3>Local Qwen/Ollama Setup</h3>
            <p className="muted">Prepare the local runtime first, then download Qwen 3.5 35B if it is not already present.</p>
            <div className="radio-stack">
              <label className="radio-pill">
                <input
                  type="radio"
                  checked={localSourceMode === 'bundled'}
                  onChange={() => setLocalSourceMode('bundled')}
                />
                <span className="radio-copy">Bundled installer assets (offline-friendly)</span>
              </label>
              <label className="radio-pill">
                <input type="radio" checked={localSourceMode === 'path'} onChange={() => setLocalSourceMode('path')} />
                <span className="radio-copy">Local file or folder path</span>
              </label>
              <label className="radio-pill">
                <input type="radio" checked={localSourceMode === 'url'} onChange={() => setLocalSourceMode('url')} />
                <span className="radio-copy">Online download URL</span>
              </label>
            </div>

            {localSourceMode !== 'bundled' ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label>{localSourceMode === 'path' ? 'Local Source Path' : 'Download URL'}</label>
                <input
                  value={localSourceInput}
                  onChange={(event) => setLocalSourceInput(event.target.value)}
                  placeholder={
                    localSourceMode === 'path'
                      ? '/Volumes/ExternalDrive/qwen-model-pack.tar.gz'
                      : 'https://example.com/qwen-model-pack.tar.gz'
                  }
                />
              </div>
            ) : null}

            <div className="row gap wrap" style={{ marginTop: 12 }}>
              {!localBootstrap.ollama_installed ? (
                <button
                  className="btn primary"
                  onClick={() =>
                    void runLocalActionWithFeedback(
                      'Preparing local runtime',
                      prepareLocalQwenStack,
                    )
                  }
                  disabled={busy || modelDownloadStatus.status === 'running'}
                >
                  Prepare Local Runtime
                </button>
              ) : null}
              {!localBootstrap.qwen_model_hint_present && localBootstrap.ollama_installed ? (
                <button
                  className="btn primary"
                  onClick={() =>
                    void runLocalActionWithFeedback(
                      'Starting Qwen 3.5 35B download',
                      downloadQwenModelOnly,
                    )
                  }
                  disabled={busy || modelDownloadStatus.status === 'running'}
                >
                  Download Qwen 3.5 35B
                </button>
              ) : null}
              <button
                className="btn secondary"
                onClick={() =>
                  runTask('Refreshing local machine capability', async () => {
                    setLocalBootstrap(await installerApi.getLocalBootstrapStatus());
                  })
                }
                disabled={busy}
              >
                Refresh Capability
              </button>
            </div>
            <ul className="summary-list">
              <li>Ollama installed: {localBootstrap.ollama_installed ? 'Yes' : 'No'}</li>
              <li>Ollama running: {localBootstrap.ollama_reachable ? 'Yes' : 'No'}</li>
              <li>Qwen 3.5 35B ready: {localBootstrap.qwen_model_hint_present ? 'Yes' : 'No'}</li>
            </ul>
            {modelDownloadStatus.status !== 'idle' ? (
              <div className="download-status-card">
                <div className="row between">
                  <strong>
                    {modelDownloadStatus.status === 'running'
                      ? 'Downloading model...'
                      : modelDownloadStatus.status === 'completed'
                        ? 'Download complete'
                        : 'Download failed'}
                  </strong>
                  <span className="mono">
                    {modelDownloadStatus.progress_percent != null
                      ? `${Math.round(modelDownloadStatus.progress_percent)}%`
                      : '--'}
                  </span>
                </div>
                <div className="download-progress-track">
                  <div
                    className={`download-progress-fill ${
                      modelDownloadStatus.status === 'failed' ? 'failed' : ''
                    } ${
                      modelDownloadStatus.status === 'running' &&
                      (modelDownloadStatus.progress_percent == null ||
                        modelDownloadStatus.progress_percent <= 0)
                        ? 'indeterminate'
                        : ''
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, modelDownloadStatus.progress_percent ?? 0))}%` }}
                  />
                </div>
                <p className="muted">{modelDownloadStatus.detail}</p>
                {modelDownloadStatus.status === 'running' &&
                (modelDownloadStatus.progress_percent == null ||
                  modelDownloadStatus.progress_percent <= 0) ? (
                  <p className="muted">Downloading... progress is not reported by this Ollama build.</p>
                ) : null}
              </div>
            ) : null}
            {localSetupResult ? (
              <div className="result-card">
                <p className="result-text">{localSetupResult}</p>
              </div>
            ) : null}
          </article>
        ) : null}

        {remoteProviders.map((provider) => {
          const requiredFields = requiredFieldsForProvider(provider.provider_id);
          const providerDraft = providerConfigDrafts[provider.provider_id] ?? {};
          const health = providerHealth.find((entry) => entry.provider_id === provider.provider_id);
          const ready = providerIsReady(provider.provider_id);
          const missingRequiredValues = requiredFields.some((field) => !(providerDraft[field.key] ?? '').trim());
          const statusLabel = ready ? 'Ready' : 'Needs Setup';
          const guidance = ready
            ? 'Saved credentials are already healthy.'
            : health?.detail ??
              (missingRequiredValues
                ? 'Enter the required credential below. The installer will save it when you continue.'
                : 'The installer will validate this provider when you continue.');

          return (
            <article className="setup-card" key={provider.provider_id}>
              <div className="row between wrap">
                <h3>{provider.display_name}</h3>
                <span className={`chip ${ready ? 'pass' : 'warn'}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="muted">{providerDescription(provider.provider_id)}</p>
              <p className="muted">{guidance}</p>

              {requiredFields.length > 0 && !ready ? (
                <div className="field-stack">
                  {requiredFields.map((field) => (
                    <div className="field" key={`${provider.provider_id}-${field.key}`}>
                      <label>{field.label}</label>
                      <input
                        type={field.type === 'password' ? 'password' : 'text'}
                        value={providerDraft[field.key] ?? ''}
                        onChange={(event) =>
                          setProviderDraftValue(provider.provider_id, field.key, event.target.value)
                        }
                        placeholder={field.placeholder ?? ''}
                      />
                    </div>
                  ))}
                </div>
              ) : requiredFields.length > 0 ? (
                <p className="muted">Saved credentials are already working for this provider.</p>
              ) : (
                <p className="muted">No extra credentials are needed here.</p>
              )}
            </article>
          );
        })}

        <button
          className="btn secondary"
          onClick={() =>
            runTask('Refreshing provider health', async () => {
              await refreshCoreState();
            })
          }
          disabled={busy}
        >
          Refresh Health
        </button>

        {stepIndex === 3 && !canContinue() ? (
          <p className="muted">
            Complete the items above before continuing. Local setup requires Ollama installed and running, plus Qwen 3.5 35B downloaded.
          </p>
        ) : null}
      </section>
    );
  }

  function renderCommunicationStep() {
    const atFirstSubStep = communicationSubStepIndex === 0;
    const atLastSubStep = communicationSubStepIndex >= communicationSteps.length - 1;

    const stepBody = (() => {
      switch (communicationSubStep) {
        case 'select':
          return (
            <article className="setup-card">
              <h3>Select Channels</h3>
              <p className="muted">Choose where Prism should reach you first. You can add more channels later.</p>
              <div className="card-grid two-up">
                <button
                  className={`setup-card path-card ${telegramEnabled ? 'selected' : ''}`}
                  onClick={() => setTelegramEnabled((value) => !value)}
                  type="button"
                >
                  <h4>Telegram</h4>
                  <p>Fast setup with direct bot pairing.</p>
                </button>
                <button
                  className={`setup-card path-card ${discordEnabled ? 'selected' : ''}`}
                  onClick={() => setDiscordEnabled((value) => !value)}
                  type="button"
                >
                  <h4>Discord</h4>
                  <p>Bot + server channel workflow.</p>
                </button>
              </div>
              {!telegramEnabled && !discordEnabled ? (
                <p className="muted">Select at least one channel to continue.</p>
              ) : null}
            </article>
          );
        case 'telegram_token':
          return (
            <article className="setup-card">
              <h3>Telegram Bot Setup</h3>
              <p className="muted">
                Create a bot with BotFather, then paste the token. We will pair chat automatically in the next step.
              </p>
              <div className="field-stack">
                <div className="field">
                  <label>Bot Token</label>
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(event) => setTelegramBotToken(event.target.value)}
                    placeholder="123456:bot-token"
                  />
                </div>
              </div>
            </article>
          );
        case 'telegram_pair':
          return (
            <article className="setup-card">
              <h3>Pair Telegram Chat</h3>
              <p className="muted">
                Click start pairing, then send the pair command to your bot from the chat you want to authorize.
              </p>
              <div className="row gap wrap">
                <button
                  className="btn primary"
                  onClick={() => runTask('Starting Telegram pairing', startTelegramPairingMode)}
                  disabled={busy || !telegramBotToken.trim() || telegramPairState === 'listening'}
                >
                  {telegramPairState === 'listening' ? 'Pairing...' : 'Start Pairing'}
                </button>
                {telegramPairCode ? <span className="mono">Pair Code: {telegramPairCode}</span> : null}
              </div>
              <p className="muted">
                Command to send: <code>/pair {telegramPairCode || 'MC-XXXXXX'}</code>
              </p>
              {telegramPairStatusText ? <p className="muted">{telegramPairStatusText}</p> : null}
              <div className="field">
                <label>Linked Chat ID</label>
                <input
                  value={telegramDefaultChatId}
                  onChange={(event) => setTelegramDefaultChatId(event.target.value)}
                  placeholder="-100123456789"
                />
              </div>
            </article>
          );
        case 'discord_token':
          return (
            <article className="setup-card">
              <h3>Discord Bot Setup</h3>
              <p className="muted">Create a Discord bot in Developer Portal and paste its token.</p>
              <div className="field-stack">
                <div className="field">
                  <label>Bot Token</label>
                  <input
                    type="password"
                    value={discordBotToken}
                    onChange={(event) => setDiscordBotToken(event.target.value)}
                    placeholder="discord-bot-token"
                  />
                </div>
              </div>
            </article>
          );
        case 'discord_target':
          return (
            <article className="setup-card">
              <h3>Discord Channel Target</h3>
              <p className="muted">Choose where your Prism/orchestrator messages should be delivered.</p>
              <div className="field-stack">
                <div className="field">
                  <label>Guild ID</label>
                  <input
                    value={discordGuildId}
                    onChange={(event) => setDiscordGuildId(event.target.value)}
                    placeholder="guild-id"
                  />
                </div>
                <div className="field">
                  <label>Default Channel ID</label>
                  <input
                    value={discordDefaultChannelId}
                    onChange={(event) => setDiscordDefaultChannelId(event.target.value)}
                    placeholder="channel-id"
                  />
                </div>
              </div>
            </article>
          );
        case 'review':
        default:
          return (
            <>
              <article className="setup-card">
                <h3>How Messages Route</h3>
                <p className="muted">
                  <strong>orchestrator</strong> sends everything to Prism first, then routes internally. This is the simplest path and the recommended default.
                </p>
                <p className="muted">
                  <strong>per_agent</strong> sends messages straight to agent-specific threads or chats. Use it only if you already know you want separate lanes.
                </p>
                {telegramEnabled ? (
                  <div className="field">
                    <label>Telegram Routing</label>
                    <select
                      value={telegramRoutingMode}
                      onChange={(event) => setTelegramRoutingMode(event.target.value as AgentRoutingMode)}
                    >
                      <option value="orchestrator">orchestrator (recommended)</option>
                      <option value="per_agent">per_agent</option>
                    </select>
                  </div>
                ) : null}
                {discordEnabled ? (
                  <div className="field">
                    <label>Discord Routing</label>
                    <select
                      value={discordRoutingMode}
                      onChange={(event) => setDiscordRoutingMode(event.target.value as AgentRoutingMode)}
                    >
                      <option value="orchestrator">orchestrator (recommended)</option>
                      <option value="per_agent">per_agent</option>
                    </select>
                  </div>
                ) : null}
              </article>

              <article className="setup-card">
                <h3>Channel Summary</h3>
                <ul className="summary-list">
                  <li>Telegram: {telegramEnabled ? (telegramDefaultChatId ? `paired with chat ${telegramDefaultChatId}` : 'selected, but not paired yet') : 'not selected'}</li>
                  <li>Discord: {discordEnabled ? (discordDefaultChannelId ? `ready for channel ${discordDefaultChannelId}` : 'selected, but no target channel is set yet') : 'not selected'}</li>
                  <li>Channels are saved when you press Continue.</li>
                </ul>
              </article>

              <div className="row gap wrap">
                <button
                  className="btn secondary"
                  onClick={() =>
                    runTask('Testing channels', async () => {
                      const lines: string[] = [];
                      if (telegramEnabled) {
                        const pull = await installerApi.pollTelegramUpdatesOnce(1);
                        lines.push(
                          pull.fetched_updates > 0 || pull.processed_updates > 0
                            ? 'Telegram is connected and the bot can read updates.'
                            : 'Telegram is connected. There were no new updates waiting.',
                        );
                      }
                      if (discordEnabled) {
                        const probe = await installerApi.probeDiscordGateway();
                        lines.push(`Discord gateway responded successfully (${probe.lifecycle}).`);
                      }
                      if (!telegramEnabled && !discordEnabled) {
                        lines.push('Select a channel before testing.');
                      }
                      setCommunicationTestResult(lines.join(' '));
                      setCommunication(await installerApi.getCommunicationStatus());
                    })
                  }
                  disabled={busy}
                >
                  Test Channels
                </button>
              </div>
              {communicationTestResult ? (
                <div className="result-card">
                  <p className="result-text">{communicationTestResult}</p>
                </div>
              ) : null}
            </>
          );
      }
    })();

    return (
      <section className="wizard-panel">
        <h2>Communication Channels</h2>
        <p className="muted">Guided setup in small steps. Configure the channels you want now, then continue.</p>
        <p className="mono muted">
          Sub-step {communicationSubStepIndex + 1}/{communicationSteps.length}: {communicationStepLabel(communicationSubStep)}
        </p>

        {stepBody}

        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <button className="btn secondary" onClick={previousCommunicationSubStep} disabled={busy || atFirstSubStep}>
            Back
          </button>
          <button
            className="btn primary"
            onClick={nextCommunicationSubStep}
            disabled={busy || atLastSubStep || !canAdvanceCommunicationSubStep()}
          >
            Next
          </button>
        </div>
      </section>
    );
  }

  function renderGenesisStep() {
    return (
      <section className="wizard-panel">
        <h2>Begin Genesis Rite</h2>
        <p className="muted">Choose default values or personalize your values profile, then confirm which constitution reference this install should anchor to.</p>

        <div className="row gap wrap">
          <label className="radio-pill">
            <input type="radio" checked={genesisMode === 'default'} onChange={() => setGenesisMode('default')} />
            Run Default
          </label>
          <label className="radio-pill">
            <input
              type="radio"
              checked={genesisMode === 'personalized'}
              onChange={() => setGenesisMode('personalized')}
            />
            Personalize
          </label>
        </div>

        {genesisMode === 'personalized' ? (
          <div className="field-stack" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Vision Core</label>
              <input value={visionCore} onChange={(event) => setVisionCore(event.target.value)} />
            </div>
            <div className="field">
              <label>Core Values (comma or newline separated)</label>
              <textarea value={coreValues} onChange={(event) => setCoreValues(event.target.value)} rows={3} />
            </div>
            <div className="field">
              <label>Will Directives (comma or newline separated)</label>
              <textarea value={willDirectives} onChange={(event) => setWillDirectives(event.target.value)} rows={3} />
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>
            Default values will be applied. You can revise them later.
          </p>
        )}

        <article className="setup-card">
          <h3>Constitution Reference</h3>
          <p className="muted">Pick the constitution version for this install. The reference is recorded in the genesis metadata.</p>

          <div className="row gap wrap">
            <label className="radio-pill">
              <input type="radio" checked={constitutionSource === 'latest'} onChange={() => setConstitutionSource('latest')} />
              Use Latest
            </label>
            <label className="radio-pill">
              <input type="radio" checked={constitutionSource === 'upload'} onChange={() => setConstitutionSource('upload')} />
              Use Custom File
            </label>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Constitution Version</label>
            <input value={constitutionVersion} onChange={(event) => setConstitutionVersion(event.target.value)} />
          </div>

          {constitutionSource === 'upload' ? (
            <div className="field">
              <label>Custom Constitution Path</label>
              <input
                value={constitutionUploadPath}
                onChange={(event) => setConstitutionUploadPath(event.target.value)}
                placeholder="/path/to/constitution.json"
              />
            </div>
          ) : null}
        </article>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Genesis Signing Secret</label>
          <input
            type="password"
            value={genesisSigningSecret}
            onChange={(event) => setGenesisSigningSecret(event.target.value)}
            placeholder="Required"
          />
        </div>

        <button className="btn primary" onClick={() => void runGenesisWithFeedback()} disabled={busy}>
          {busy ? 'Running...' : 'Run Genesis Rite'}
        </button>
        {genesisStatusMessage ? <p className="muted">{genesisStatusMessage}</p> : null}

        {genesisResult ? (
          <div className="result-card">
            <p className="result-text">
              Genesis hash: {genesisResult.genesis_hash}
              {'\n'}
              Signature: {genesisResult.signature}
              {'\n'}
              Schema version: {genesisResult.schema_version}
            </p>
          </div>
        ) : null}
      </section>
    );
  }

  function renderInitializationStep() {
    const activePhaseClass = activeInitializationPhase ? `phase-${activeInitializationPhase}` : 'phase-idle';
    const captionPhase =
      activeInitializationPhase ??
      (initializationComplete ? 'sphere' : null);
    const captionMeta = captionPhase
      ? INIT_PHASES.find((phase) => phase.id === captionPhase)
      : {
          label: 'Awaiting Initialization',
          detail: 'Start the sequence to initiate crystal, agents, and sphere synthesis.',
        };

    return (
      <section className="wizard-panel">
        <h2>Initialization Sequence</h2>
        <p className="muted">Crystal initiation, core-agent spinup, and first synthesis pass.</p>

        <div className={`initialization-visual ${activePhaseClass} ${initializationComplete ? 'complete' : ''}`}>
          <div className="sphere-shell" />
          <div className="orbital-ring ring-one" />
          <div className="orbital-ring ring-two" />
          <div className="orbital-ring ring-three" />
          <div className="taurus-particles">
            <span className="particle p1" />
            <span className="particle p2" />
            <span className="particle p3" />
            <span className="particle p4" />
            <span className="particle p5" />
            <span className="particle p6" />
          </div>
          <div className="tetra-line line-one" />
          <div className="tetra-line line-two" />
          <div className="tetra-line line-three" />
          <div className="tetra-line line-four" />
          <div className="agent-dot dot-synthesis">S</div>
          <div className="agent-dot dot-genesis">G</div>
          <div className="agent-dot dot-auditor">A</div>
          <div className="core-crystal-node" />
          <div className="pulse-halo" />
          <div className="init-caption">
            <h3>{captionMeta?.label}</h3>
            <p>{captionMeta?.detail}</p>
          </div>
        </div>

        <div className="phase-list">
          {INIT_PHASES.map((phase, index) => {
            const state = initializationPhaseState[phase.id];
            return (
              <div className={`phase-row state-${state}`} key={phase.id}>
                <span className="phase-index">{index + 1}</span>
                <div className="grow">
                  <strong>{phase.label}</strong>
                  <p className="muted">{phase.detail}</p>
                </div>
                <span className={`phase-chip state-${state}`}>{state}</span>
              </div>
            );
          })}
        </div>

        <button className="btn primary" onClick={() => runTask('Running initialization sequence', runInitializationSequence)} disabled={busy}>
          Start Initialization
        </button>

        {initializationLog.length > 0 ? (
          <div className="init-log-feed">
            {initializationLog.map((entry, index) => (
              <p
                key={entry.id}
                className={`init-log-line phase-${entry.phase}`}
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <span className="mono log-phase">{entry.phase}</span>
                <span>{entry.text}</span>
              </p>
            ))}
          </div>
        ) : null}
        {initializationComplete ? <p className="success-line">Initialization complete.</p> : null}
      </section>
    );
  }

  function renderMeetPrismStep() {
    return (
      <section className="wizard-panel">
        <h2>Meet Your Prism Agent</h2>
        <p className="muted">Prism is the only user-facing interface for your sphere. Watcher, Synthesis, and Auditor run behind it as internal Torus lanes.</p>

        <div className="field">
          <label>Prism Name</label>
          <input value={prismName} onChange={(event) => setPrismName(event.target.value)} />
        </div>

        <div className="card-grid three-up">
          <article className="setup-card">
            <h3>Watcher</h3>
            <p>Reviews requests for constitutional, sovereignty, and operational risk concerns.</p>
          </article>
          <article className="setup-card">
            <h3>Synthesis</h3>
            <p>Builds the constructive reasoning path and draft answer inside the Torus round.</p>
          </article>
          <article className="setup-card">
            <h3>Auditor</h3>
            <p>Tracks what should be recorded, verified, and attested before Prism replies.</p>
          </article>
        </div>

        <button className="btn primary" onClick={() => runTask('Sending prism test message', sendPrismTestMessage)} disabled={busy}>
          Test Prism Communication
        </button>

        {prismTestResult ? (
          <div className="result-card">
            <p className="result-text">{prismTestResult}</p>
          </div>
        ) : null}
      </section>
    );
  }

  function renderStarterTasksStep() {
    return (
      <section className="wizard-panel">
        <h2>Start Learning with Simple Tasks</h2>
        <p className="muted">Try a first task to validate behavior and communication.</p>

        <div className="row gap wrap" style={{ marginBottom: 12 }}>
          <button className="btn ghost" onClick={() => setStarterTask('Organize files in Downloads into dated folders.')}>Suggested Task: Organize Files</button>
          <button className="btn ghost" onClick={() => setStarterTask('Check local runtime health and summarize warnings.')}>Suggested Task: Runtime Health</button>
          <button className="btn ghost" onClick={() => setStarterTask('Draft a short daily priority plan from local notes.')}>Suggested Task: Daily Plan</button>
        </div>

        <div className="field">
          <label>Task</label>
          <textarea value={starterTask} onChange={(event) => setStarterTask(event.target.value)} rows={3} />
        </div>

        <button className="btn primary" onClick={() => runTask('Running starter task', runStarterTask)} disabled={busy}>
          Run Task
        </button>

        {starterTaskResult ? (
          <div className="result-card">
            <p className="result-text">{starterTaskResult}</p>
          </div>
        ) : null}
      </section>
    );
  }

  function renderDoneStep() {
    return (
      <section className="wizard-panel">
        <h2>Setup Complete</h2>
        <p className="muted">Your MetaCanon sphere is established and ready.</p>

        <article className="setup-card">
          <h3>What Is Ready</h3>
          <ul className="summary-list">
            <li>Provider order: {fallbackOrder.join(' -> ')}</li>
            <li>Constitution reference: {constitutionVersion}</li>
            <li>Prism name: {prismName}</li>
            <li>Install review passed: {review?.can_install ? 'Yes' : 'Not confirmed'}</li>
            <li>Prism runtime initialized: {bootstrapResult ? 'Yes' : 'No'}</li>
          </ul>
        </article>

        <p className="muted">You can keep using the connected channels and return to deeper dashboard tooling later.</p>
      </section>
    );
  }

  function renderCurrentStep() {
    switch (stepIndex) {
      case 0:
        return renderThemeStep();
      case 1:
        return renderWelcomeStep();
      case 2:
        return renderComputeStep();
      case 3:
        return renderProviderSetupStep();
      case 4:
        return renderCommunicationStep();
      case 5:
        return renderGenesisStep();
      case 6:
        return renderInitializationStep();
      case 7:
        return renderMeetPrismStep();
      case 8:
        return renderStarterTasksStep();
      case 9:
      default:
        return renderDoneStep();
    }
  }

  return (
    <div className="wizard-shell">
      <header className="wizard-header panel glass-surface">
        <div className="row between wrap">
          <div>
            <p className="mono muted">Step {stepIndex + 1} of {STEPS.length}</p>
            <h2>{STEPS[stepIndex]}</h2>
          </div>
          <div className="header-actions">
            <button className="theme-toggle" onClick={() => setTheme((value) => (value === 'void' ? 'light' : 'void'))} aria-label="Toggle theme">
              <img className="icon-light icon-asset" src={iconAsset(theme, 'icon-sun')} alt="" aria-hidden="true" />
              <img className="icon-void icon-asset" src={iconAsset(theme, 'icon-star')} alt="" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="step-dots">
          {STEPS.map((label, index) => (
            <button
              key={label}
              className={`dot ${index <= stepIndex ? 'active' : ''} ${index > stepIndex ? 'locked' : ''}`}
              onClick={() => {
                if (index <= stepIndex) {
                  setStepIndex(index);
                }
              }}
              aria-label={`Go to ${label}`}
              disabled={index > stepIndex}
            />
          ))}
        </div>
      </header>

      <main className="wizard-content">
        {notice ? (
          <div className={`notice-banner ${notice.tone}`}>
            <p>{notice.message}</p>
          </div>
        ) : null}
        {renderCurrentStep()}
      </main>

      <footer className="wizard-footer panel compact glass-surface">
        <div className="row between wrap gap">
          <div />
          <div className="row gap">
            {stepIndex > 0 ? (
              <button className="btn ghost" onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))} disabled={busy}>
                Back
              </button>
            ) : null}
            <button className="btn primary" onClick={() => void onContinue()} disabled={busy || stepIndex === STEPS.length - 1 || !canContinue()}>
              Continue
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
