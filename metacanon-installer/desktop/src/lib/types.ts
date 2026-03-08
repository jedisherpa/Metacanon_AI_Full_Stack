export type ComputeOption = {
  provider_id: string;
  display_name: string;
  kind: string;
  implemented: boolean;
  configured: boolean;
  available: boolean;
  selected_global: boolean;
  default_if_skipped: boolean;
};

export type TaskSubSphereStatus = 'active' | 'paused' | 'dissolved';

export type TaskSubSphereSummary = {
  sub_sphere_id: string;
  name: string;
  objective: string;
  status: TaskSubSphereStatus;
  hitl_required: boolean;
};

export type WorkflowTrainingStatus = 'collecting' | 'saved' | 'cancelled';

export type WorkflowTrainingSession = {
  session_id: string;
  sub_sphere_id: string;
  status: WorkflowTrainingStatus;
  created_at: number;
  updated_at: number;
};

export type WorkflowStep = {
  step_id: string;
  instruction: string;
};

export type WorkflowDefinition = {
  workflow_id: string;
  sub_sphere_id: string;
  workflow_name: string;
  steps: WorkflowStep[];
  created_at: number;
  updated_at: number;
};

export type ProviderHealthStatus = {
  provider_id: string;
  kind: string;
  implemented: boolean;
  configured: boolean;
  is_healthy: boolean;
  detail?: string | null;
};

export type SystemCheckItem = {
  check_id: string;
  label: string;
  status: string;
  detail: string;
  blocking: boolean;
};

export type SystemCheckReport = {
  checks: SystemCheckItem[];
  has_blocking_failures: boolean;
  warn_count: number;
  fail_count: number;
};

export type LocalBootstrapStatus = {
  model_root: string;
  model_root_exists: boolean;
  qwen_model_hint_present: boolean;
  ollama_installed: boolean;
  ollama_reachable: boolean;
  ollama_default_model_installed: boolean;
  recommended_actions: string[];
};

export type LocalModelPackInstallResult = {
  source_path: string;
  source_kind: string;
  model_root: string;
  installed_files: number;
  notes: string[];
  bootstrap: LocalBootstrapStatus;
};

export type ModelDownloadStatus = {
  status: 'idle' | 'running' | 'completed' | 'failed';
  model_id?: string | null;
  progress_percent?: number | null;
  detail: string;
  updated_at_epoch_ms: number;
};

export type GenesisRiteResult = {
  genesis_hash: string;
  signature: string;
  created_at: number;
  schema_version: number;
  sensitive_compute_policy: string;
  soul_file: Record<string, unknown>;
};

export type SecurityPersistenceSettings = {
  snapshot_path: string;
  encryption_enabled: boolean;
  passphrase_configured: boolean;
  auto_save_enabled: boolean;
  secret_backend_mode: string;
};

export type ObservabilityStatus = {
  retention_days: number;
  log_level: string;
  full_tier_encrypted: boolean;
  redacted_graph_feed_enabled: boolean;
  full_event_log_path: string;
  redacted_graph_feed_path: string;
};

export type InstallReviewIssue = {
  severity: string;
  message: string;
};

export type InstallReviewSummary = {
  can_install: boolean;
  global_provider_id: string;
  provider_chain: string[];
  selected_provider_ids: string[];
  issues: InstallReviewIssue[];
  observability: ObservabilityStatus;
  security: SecurityPersistenceSettings;
  system_check: SystemCheckReport;
};

export type DeliberationCommandResult = {
  requested_provider_id: string;
  provider_override?: string | null;
  provider_id: string;
  provider_chain: string[];
  used_fallback: boolean;
  model: string;
  output_text: string;
  finish_reason?: string | null;
  metadata: Record<string, string>;
};

export type PrismLaneOutput = {
  lane: string;
  requested_provider_id: string;
  provider_id: string;
  provider_chain: string[];
  used_fallback: boolean;
  model: string;
  output_text: string;
  finish_reason?: string | null;
  metadata: Record<string, string>;
};

export type PrismEventPublishStatus = {
  enabled: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

export type PrismRoundCommandResult = {
  route: 'direct' | 'deliberate';
  decision_summary: string;
  required_lanes: string[];
  round_id?: string | null;
  lane_outputs: PrismLaneOutput[];
  final_result: DeliberationCommandResult;
  event_publish: PrismEventPublishStatus;
};

export type AgentRoutingMode = 'per_agent' | 'orchestrator';

export type TelegramIntegrationStatus = {
  enabled: boolean;
  routing_mode: AgentRoutingMode;
  use_webhook: boolean;
  configured: boolean;
  has_bot_token: boolean;
  default_chat_id?: string | null;
  orchestrator_chat_id?: string | null;
  webhook_url?: string | null;
  last_error?: string | null;
};

export type DiscordIntegrationStatus = {
  enabled: boolean;
  routing_mode: AgentRoutingMode;
  configured: boolean;
  has_bot_token: boolean;
  guild_id?: string | null;
  default_channel_id?: string | null;
  orchestrator_thread_id?: string | null;
  auto_spawn_sub_sphere_threads: boolean;
  last_error?: string | null;
};

export type AgentBinding = {
  agent_id: string;
  telegram_chat_id?: string | null;
  discord_thread_id?: string | null;
  in_app_thread_id?: string | null;
  is_orchestrator: boolean;
};

export type SubSpherePrismBinding = {
  sub_sphere_id: string;
  prism_agent_id: string;
  telegram_chat_id?: string | null;
  discord_thread_id?: string | null;
  in_app_thread_id?: string | null;
};

export type CommunicationStatus = {
  telegram: TelegramIntegrationStatus;
  discord: DiscordIntegrationStatus;
  discord_gateway_state: DiscordGatewayState;
  agent_bindings: AgentBinding[];
  sub_sphere_bindings: SubSpherePrismBinding[];
  in_app_thread_count: number;
  telegram_inbox_count: number;
  discord_pending_interaction_count: number;
};

export type ThreeAgentBootstrapResult = {
  agent_ids: string[];
  orchestrator_agent_id: string;
  prism_agent_id: string;
  prism_sub_sphere_id: string;
  communication: CommunicationStatus;
};

export type PrismRuntimeInitResult = {
  agent_ids: string[];
  orchestrator_agent_id: string;
  prism_agent_id: string;
  watcher_agent_id: string;
  synthesis_agent_id: string;
  auditor_agent_id: string;
  prism_sub_sphere_id: string;
  sphere_signer_did?: string | null;
  communication: CommunicationStatus;
};

export type CommunicationDispatchResult = {
  platform: 'telegram' | 'discord' | 'in_app';
  agent_id: string;
  sub_sphere_id?: string | null;
  thread_id: string;
  message_id: string;
  delivered_live: boolean;
  note?: string | null;
};

export type InAppThreadMessage = {
  message_id: string;
  thread_id: string;
  agent_id: string;
  sub_sphere_id?: string | null;
  sent_at_epoch_ms: number;
  content: string;
};

export type TelegramInboundRecord = {
  update_id: number;
  chat_id: string;
  from_id?: string | null;
  text: string;
  routed_agent_id: string;
  routed_thread_id: string;
  source: string;
  received_at_epoch_ms: number;
};

export type TelegramUpdatePullResult = {
  fetched_updates: number;
  processed_updates: number;
  dispatched_messages: number;
  next_offset?: number | null;
  note?: string | null;
};

export type TelegramWebhookResult = {
  processed: boolean;
  update_id?: number | null;
  routed_agent_id?: string | null;
  routed_thread_id?: string | null;
};

export type TelegramWebhookConfigResult = {
  applied: boolean;
  webhook_url?: string | null;
  allowed_updates: string[];
};

export type DiscordGatewayLifecycle =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'fatal';

export type DiscordGatewayState = {
  lifecycle: DiscordGatewayLifecycle;
  gateway_url?: string | null;
  session_id?: string | null;
  last_sequence?: number | null;
  last_heartbeat_epoch_ms?: number | null;
  last_close_code?: number | null;
  resume_recommended: boolean;
  shard_count?: number | null;
  session_start_limit_remaining?: number | null;
  last_error?: string | null;
};

export type DiscordGatewayProbeResult = {
  lifecycle: DiscordGatewayLifecycle;
  gateway_url: string;
  shard_count?: number | null;
  session_start_limit_remaining?: number | null;
  live_probe: boolean;
  note?: string | null;
};

export type DiscordGatewayCloseResult = {
  close_code: number;
  lifecycle: DiscordGatewayLifecycle;
  resume_recommended: boolean;
  note: string;
};

export type DiscordGatewayEventResult = {
  processed: boolean;
  event_type?: string | null;
  routed_agent_id?: string | null;
  routed_thread_id?: string | null;
  note?: string | null;
};

export type DiscordDeferredInteractionAck = {
  interaction_id: string;
  command_name: string;
  routed_agent_id: string;
  routed_thread_id: string;
  deferred_response_type: number;
  token_expires_at_epoch_ms: number;
};

export type DiscordInteractionCompletionResult = {
  interaction_id: string;
  message_id: string;
  delivered_live: boolean;
  routed_thread_id: string;
};

export type TypingIndicatorResult = {
  platform: 'telegram' | 'discord' | 'in_app';
  target_id: string;
  delivered_live: boolean;
};
