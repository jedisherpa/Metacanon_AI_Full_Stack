import { invoke } from '@tauri-apps/api/tauri';
import type {
  AgentBinding,
  AgentRoutingMode,
  CommunicationDispatchResult,
  CommunicationStatus,
  ComputeOption,
  DeliberationCommandResult,
  GenesisRiteResult,
  DiscordDeferredInteractionAck,
  DiscordGatewayCloseResult,
  DiscordGatewayEventResult,
  DiscordGatewayProbeResult,
  DiscordGatewayState,
  DiscordInteractionCompletionResult,
  InAppThreadMessage,
  InstallReviewSummary,
  LocalBootstrapStatus,
  LocalModelPackInstallResult,
  ObservabilityStatus,
  ProviderHealthStatus,
  SecurityPersistenceSettings,
  ThreeAgentBootstrapResult,
  SubSpherePrismBinding,
  SystemCheckReport,
  TelegramInboundRecord,
  TelegramUpdatePullResult,
  TelegramWebhookConfigResult,
  TelegramWebhookResult,
  TypingIndicatorResult,
  TaskSubSphereSummary,
  WorkflowDefinition,
  WorkflowTrainingSession,
} from './types';

function notTauriError(): Error {
  return new Error('Tauri runtime not detected. Start with `npm run tauri:dev`.');
}

async function call<T>(command: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!(window as unknown as { __TAURI_IPC__?: unknown }).__TAURI_IPC__) {
    throw notTauriError();
  }
  return invoke<T>(command, payload);
}

export const installerApi = {
  getComputeOptions: () => call<ComputeOption[]>('get_compute_options'),
  finalizeSetupComputeSelection: (providerId?: string) =>
    call('finalize_setup_compute_selection', { provider_id: providerId ?? null }),
  setGlobalComputeProvider: (providerId: string) =>
    call('set_global_compute_provider', { provider_id: providerId }),
  setProviderPriority: (cloudProviderPriority: string[]) =>
    call('set_provider_priority', { cloud_provider_priority: cloudProviderPriority }),
  getProviderHealth: () => call<ProviderHealthStatus[]>('get_provider_health'),
  updateProviderConfig: (providerId: string, config: Record<string, unknown>) =>
    call('update_provider_config', { provider_id: providerId, config }),
  runSystemCheck: () => call<SystemCheckReport>('run_system_check'),
  getLocalBootstrapStatus: () => call<LocalBootstrapStatus>('get_local_bootstrap_status'),
  installLocalModelPack: (sourcePath: string) =>
    call<LocalModelPackInstallResult>('install_local_model_pack', {
      source_path: sourcePath,
    }),
  prepareLocalRuntime: (pullOllamaDefaultModel: boolean) =>
    call<LocalBootstrapStatus>('prepare_local_runtime', {
      pull_ollama_default_model: pullOllamaDefaultModel,
    }),
  invokeGuidedGenesisRite: (payload: {
    vision_core: string;
    core_values: string[];
    will_directives: string[];
    signing_secret: string;
    facet_vision?: string | null;
  }) => call<GenesisRiteResult>('invoke_guided_genesis_rite', payload),
  bootstrapThreeAgents: (payload: {
    orchestrator_agent_id: string;
    prism_agent_id: string;
    telegram_chat_id_genesis?: string | null;
    telegram_chat_id_synthesis?: string | null;
    telegram_chat_id_auditor?: string | null;
    discord_thread_id_genesis?: string | null;
    discord_thread_id_synthesis?: string | null;
    discord_thread_id_auditor?: string | null;
    prism_sub_sphere_id?: string | null;
  }) => call<ThreeAgentBootstrapResult>('bootstrap_three_agents', payload),
  getSecuritySettings: () =>
    call<SecurityPersistenceSettings>('get_security_persistence_settings'),
  updateSecuritySettings: (payload: {
    snapshot_path: string;
    encryption_enabled: boolean;
    passphrase?: string | null;
    auto_save_enabled: boolean;
    secret_backend_mode: string;
  }) =>
    call<SecurityPersistenceSettings>('update_security_persistence_settings', payload),
  getObservabilityStatus: () => call<ObservabilityStatus>('get_observability_status'),
  updateObservabilitySettings: (retentionDays: number, logLevel: string) =>
    call<ObservabilityStatus>('update_observability_settings', {
      retention_days: retentionDays,
      log_level: logLevel,
    }),
  getInstallReviewSummary: () =>
    call<InstallReviewSummary>('get_install_review_summary'),
  submitDeliberation: (query: string, providerOverride?: string) =>
    call<DeliberationCommandResult>('submit_deliberation', {
      query,
      provider_override: providerOverride ?? null,
    }),
  getCommunicationStatus: () =>
    call<CommunicationStatus>('get_communication_status'),
  updateTelegramIntegration: (payload: {
    enabled: boolean;
    routing_mode: AgentRoutingMode;
    bot_token?: string | null;
    default_chat_id?: string | null;
    orchestrator_chat_id?: string | null;
    live_api: boolean;
  }) => call<CommunicationStatus>('update_telegram_integration', payload),
  updateDiscordIntegration: (payload: {
    enabled: boolean;
    routing_mode: AgentRoutingMode;
    bot_token?: string | null;
    guild_id?: string | null;
    default_channel_id?: string | null;
    orchestrator_thread_id?: string | null;
    auto_spawn_sub_sphere_threads: boolean;
    live_api: boolean;
  }) => call<CommunicationStatus>('update_discord_integration', payload),
  bindAgentCommunicationRoute: (payload: {
    agent_id: string;
    telegram_chat_id?: string | null;
    discord_thread_id?: string | null;
    in_app_thread_id?: string | null;
    is_orchestrator: boolean;
  }) => call<AgentBinding>('bind_agent_communication_route', payload),
  bindSubSpherePrismRoute: (payload: {
    sub_sphere_id: string;
    prism_agent_id: string;
    telegram_chat_id?: string | null;
    discord_thread_id?: string | null;
    in_app_thread_id?: string | null;
  }) => call<SubSpherePrismBinding>('bind_sub_sphere_prism_route', payload),
  sendAgentMessage: (payload: {
    platform: 'telegram' | 'discord' | 'in_app';
    agent_id: string;
    message: string;
  }) => call<CommunicationDispatchResult>('send_agent_message', payload),
  sendSubSpherePrismMessage: (payload: {
    platform: 'telegram' | 'discord' | 'in_app';
    sub_sphere_id: string;
    message: string;
  }) =>
    call<CommunicationDispatchResult>('send_sub_sphere_prism_message', payload),
  getInAppThreadMessages: (threadId: string, limit = 30, offset = 0) =>
    call<InAppThreadMessage[]>('get_in_app_thread_messages', {
      thread_id: threadId,
      limit,
      offset,
    }),
  getTelegramInbox: (limit = 50, offset = 0) =>
    call<TelegramInboundRecord[]>('get_telegram_inbox', {
      limit,
      offset,
    }),
  pollTelegramUpdatesOnce: (limit = 50) =>
    call<TelegramUpdatePullResult>('poll_telegram_updates_once', { limit }),
  processTelegramWebhookPayload: (payload: Record<string, unknown>) =>
    call<TelegramWebhookResult>('process_telegram_webhook_payload', { payload }),
  setTelegramWebhook: (payload: {
    webhook_url: string;
    secret_token?: string | null;
    allowed_updates?: string[];
  }) =>
    call<TelegramWebhookConfigResult>('set_telegram_webhook', {
      webhook_url: payload.webhook_url,
      secret_token: payload.secret_token ?? null,
      allowed_updates: payload.allowed_updates ?? [],
    }),
  clearTelegramWebhook: () =>
    call<TelegramWebhookConfigResult>('clear_telegram_webhook'),
  sendTelegramTypingIndicator: (chatId: string) =>
    call<TypingIndicatorResult>('send_telegram_typing_indicator', {
      chat_id: chatId,
    }),
  probeDiscordGateway: () =>
    call<DiscordGatewayProbeResult>('probe_discord_gateway'),
  recordDiscordGatewayHeartbeat: (sequence?: number) =>
    call<DiscordGatewayState>('record_discord_gateway_heartbeat', {
      sequence: sequence ?? null,
    }),
  registerDiscordGatewayClose: (closeCode: number) =>
    call<DiscordGatewayCloseResult>('register_discord_gateway_close', {
      close_code: closeCode,
    }),
  processDiscordGatewayEvent: (payload: Record<string, unknown>) =>
    call<DiscordGatewayEventResult>('process_discord_gateway_event', { payload }),
  deferDiscordInteraction: (payload: Record<string, unknown>) =>
    call<DiscordDeferredInteractionAck>('defer_discord_interaction', { payload }),
  completeDiscordInteraction: (payload: {
    interaction_id: string;
    response_text: string;
    ephemeral?: boolean;
  }) =>
    call<DiscordInteractionCompletionResult>('complete_discord_interaction', {
      interaction_id: payload.interaction_id,
      response_text: payload.response_text,
      ephemeral: payload.ephemeral ?? false,
    }),
  sendDiscordTypingIndicator: (channelId: string) =>
    call<TypingIndicatorResult>('send_discord_typing_indicator', {
      channel_id: channelId,
    }),
  flushRuntimeAutoSnapshot: () => call('flush_runtime_auto_snapshot'),
  createTaskSubSphere: (payload: {
    name: string;
    objective: string;
    hitl_required: boolean;
  }) => call<TaskSubSphereSummary>('create_task_sub_sphere', payload),
  getSubSphereList: () => call<TaskSubSphereSummary[]>('get_sub_sphere_list'),
  startWorkflowTraining: (subSphereId: string) =>
    call<WorkflowTrainingSession>('start_workflow_training', {
      sub_sphere_id: subSphereId,
    }),
  submitTrainingMessage: (sessionId: string, message: string) =>
    call<void>('submit_training_message', {
      session_id: sessionId,
      message,
    }),
  saveTrainedWorkflow: (sessionId: string, workflowName: string) =>
    call<WorkflowDefinition>('save_trained_workflow', {
      session_id: sessionId,
      workflow_name: workflowName,
    }),
  getWorkflowList: (subSphereId: string) =>
    call<WorkflowDefinition[]>('get_workflow_list', {
      sub_sphere_id: subSphereId,
    }),
  deleteWorkflow: (subSphereId: string, workflowId: string) =>
    call<void>('delete_workflow', {
      sub_sphere_id: subSphereId,
      workflow_id: workflowId,
    }),
};
