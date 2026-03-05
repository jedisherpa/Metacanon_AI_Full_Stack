#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use metacanon_ai::ui::{
    self, AgentBinding, CommunicationDispatchResult, CommunicationStatus, ComputeOption,
    DeliberationCommandResult, DiscordDeferredInteractionAck, DiscordGatewayCloseResult,
    DiscordGatewayEventResult, DiscordGatewayProbeResult, DiscordGatewayState,
    DiscordInteractionCompletionResult, GenesisRiteResult, InAppThreadMessage,
    InstallReviewSummary, LocalBootstrapStatus, LocalModelPackInstallResult, ObservabilityStatus,
    ProviderConfigUpdateResult, ProviderHealthStatus, RuntimeSnapshotResult,
    SecurityPersistenceSettings, SetupComputeSelectionResult, SubSpherePrismBinding,
    SystemCheckReport, TelegramInboundRecord, TelegramUpdatePullResult, TelegramWebhookConfigResult,
    TelegramWebhookResult, TypingIndicatorResult, UiCommandRuntime,
};
use metacanon_ai::task_sub_sphere::TaskSubSphereSummary;
use metacanon_ai::workflow::{WorkflowDefinition, WorkflowTrainingSession};
use serde_json::Value;

struct InstallerState {
    runtime: UiCommandRuntime,
}

impl InstallerState {
    fn new() -> Self {
        let snapshot_path = std::env::var("HOME")
            .map(|home| format!("{home}/.metacanon_ai/runtime_snapshot.json"))
            .unwrap_or_else(|_| ".metacanon_ai/runtime_snapshot.json".to_string());

        let runtime = UiCommandRuntime::new_with_auto_snapshot(snapshot_path.clone())
            .or_else(|_| {
                let runtime = UiCommandRuntime::new();
                ui::enable_runtime_auto_snapshot(&runtime, snapshot_path, true)?;
                Ok::<UiCommandRuntime, ui::UiCommandError>(runtime)
            })
            .unwrap_or_else(|_| UiCommandRuntime::new());

        Self { runtime }
    }
}

fn map_error(error: ui::UiCommandError) -> String {
    error.to_string()
}

#[tauri::command]
fn get_compute_options(state: tauri::State<'_, InstallerState>) -> Result<Vec<ComputeOption>, String> {
    ui::get_compute_options(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn finalize_setup_compute_selection(
    provider_id: Option<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<SetupComputeSelectionResult, String> {
    ui::finalize_setup_compute_selection(&state.runtime, provider_id).map_err(map_error)
}

#[tauri::command]
fn set_global_compute_provider(
    provider_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<ui::GlobalProviderSelection, String> {
    ui::set_global_compute_provider(&state.runtime, provider_id).map_err(map_error)
}

#[tauri::command]
fn set_provider_priority(
    cloud_provider_priority: Vec<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<ui::ProviderPriorityUpdateResult, String> {
    ui::set_provider_priority(&state.runtime, cloud_provider_priority).map_err(map_error)
}

#[tauri::command]
fn get_provider_health(
    state: tauri::State<'_, InstallerState>,
) -> Result<Vec<ProviderHealthStatus>, String> {
    ui::get_provider_health(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn update_provider_config(
    provider_id: String,
    config: Value,
    state: tauri::State<'_, InstallerState>,
) -> Result<ProviderConfigUpdateResult, String> {
    ui::update_provider_config(&state.runtime, provider_id, config).map_err(map_error)
}

#[tauri::command]
fn get_communication_status(
    state: tauri::State<'_, InstallerState>,
) -> Result<CommunicationStatus, String> {
    ui::get_communication_status(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn update_telegram_integration(
    enabled: bool,
    routing_mode: String,
    bot_token: Option<String>,
    default_chat_id: Option<String>,
    orchestrator_chat_id: Option<String>,
    live_api: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<CommunicationStatus, String> {
    ui::update_telegram_integration(
        &state.runtime,
        enabled,
        routing_mode,
        bot_token,
        default_chat_id,
        orchestrator_chat_id,
        live_api,
    )
    .map_err(map_error)
}

#[tauri::command]
fn update_discord_integration(
    enabled: bool,
    routing_mode: String,
    bot_token: Option<String>,
    guild_id: Option<String>,
    default_channel_id: Option<String>,
    orchestrator_thread_id: Option<String>,
    auto_spawn_sub_sphere_threads: bool,
    live_api: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<CommunicationStatus, String> {
    ui::update_discord_integration(
        &state.runtime,
        enabled,
        routing_mode,
        bot_token,
        guild_id,
        default_channel_id,
        orchestrator_thread_id,
        auto_spawn_sub_sphere_threads,
        live_api,
    )
    .map_err(map_error)
}

#[tauri::command]
fn bind_agent_communication_route(
    agent_id: String,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    in_app_thread_id: Option<String>,
    is_orchestrator: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<AgentBinding, String> {
    ui::bind_agent_communication_route(
        &state.runtime,
        agent_id,
        telegram_chat_id,
        discord_thread_id,
        in_app_thread_id,
        is_orchestrator,
    )
    .map_err(map_error)
}

#[tauri::command]
fn bind_sub_sphere_prism_route(
    sub_sphere_id: String,
    prism_agent_id: String,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    in_app_thread_id: Option<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<SubSpherePrismBinding, String> {
    ui::bind_sub_sphere_prism_route(
        &state.runtime,
        sub_sphere_id,
        prism_agent_id,
        telegram_chat_id,
        discord_thread_id,
        in_app_thread_id,
    )
    .map_err(map_error)
}

#[tauri::command]
fn send_agent_message(
    platform: String,
    agent_id: String,
    message: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<CommunicationDispatchResult, String> {
    ui::send_agent_message(&state.runtime, platform, agent_id, message).map_err(map_error)
}

#[tauri::command]
fn send_sub_sphere_prism_message(
    platform: String,
    sub_sphere_id: String,
    message: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<CommunicationDispatchResult, String> {
    ui::send_sub_sphere_prism_message(&state.runtime, platform, sub_sphere_id, message)
        .map_err(map_error)
}

#[tauri::command]
fn get_in_app_thread_messages(
    thread_id: String,
    limit: usize,
    offset: usize,
    state: tauri::State<'_, InstallerState>,
) -> Result<Vec<InAppThreadMessage>, String> {
    ui::get_in_app_thread_messages(&state.runtime, thread_id, limit, offset).map_err(map_error)
}

#[tauri::command]
fn get_telegram_inbox(
    limit: usize,
    offset: usize,
    state: tauri::State<'_, InstallerState>,
) -> Result<Vec<TelegramInboundRecord>, String> {
    ui::get_telegram_inbox(&state.runtime, limit, offset).map_err(map_error)
}

#[tauri::command]
fn poll_telegram_updates_once(
    limit: usize,
    state: tauri::State<'_, InstallerState>,
) -> Result<TelegramUpdatePullResult, String> {
    ui::poll_telegram_updates_once(&state.runtime, limit).map_err(map_error)
}

#[tauri::command]
fn process_telegram_webhook_payload(
    payload: Value,
    state: tauri::State<'_, InstallerState>,
) -> Result<TelegramWebhookResult, String> {
    ui::process_telegram_webhook_payload(&state.runtime, payload).map_err(map_error)
}

#[tauri::command]
fn set_telegram_webhook(
    webhook_url: String,
    secret_token: Option<String>,
    allowed_updates: Vec<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<TelegramWebhookConfigResult, String> {
    ui::set_telegram_webhook(&state.runtime, webhook_url, secret_token, allowed_updates)
        .map_err(map_error)
}

#[tauri::command]
fn clear_telegram_webhook(
    state: tauri::State<'_, InstallerState>,
) -> Result<TelegramWebhookConfigResult, String> {
    ui::clear_telegram_webhook(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn send_telegram_typing_indicator(
    chat_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<TypingIndicatorResult, String> {
    ui::send_telegram_typing_indicator(&state.runtime, chat_id).map_err(map_error)
}

#[tauri::command]
fn probe_discord_gateway(
    state: tauri::State<'_, InstallerState>,
) -> Result<DiscordGatewayProbeResult, String> {
    ui::probe_discord_gateway(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn record_discord_gateway_heartbeat(
    sequence: Option<u64>,
    state: tauri::State<'_, InstallerState>,
) -> Result<DiscordGatewayState, String> {
    ui::record_discord_gateway_heartbeat(&state.runtime, sequence).map_err(map_error)
}

#[tauri::command]
fn register_discord_gateway_close(
    close_code: u16,
    state: tauri::State<'_, InstallerState>,
) -> Result<DiscordGatewayCloseResult, String> {
    ui::register_discord_gateway_close(&state.runtime, close_code).map_err(map_error)
}

#[tauri::command]
fn process_discord_gateway_event(
    payload: Value,
    state: tauri::State<'_, InstallerState>,
) -> Result<DiscordGatewayEventResult, String> {
    ui::process_discord_gateway_event(&state.runtime, payload).map_err(map_error)
}

#[tauri::command]
fn defer_discord_interaction(
    payload: Value,
    state: tauri::State<'_, InstallerState>,
) -> Result<DiscordDeferredInteractionAck, String> {
    ui::defer_discord_interaction(&state.runtime, payload).map_err(map_error)
}

#[tauri::command]
fn complete_discord_interaction(
    interaction_id: String,
    response_text: String,
    ephemeral: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<DiscordInteractionCompletionResult, String> {
    ui::complete_discord_interaction(&state.runtime, interaction_id, response_text, ephemeral)
        .map_err(map_error)
}

#[tauri::command]
fn send_discord_typing_indicator(
    channel_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<TypingIndicatorResult, String> {
    ui::send_discord_typing_indicator(&state.runtime, channel_id).map_err(map_error)
}

#[tauri::command]
fn run_system_check(
    state: tauri::State<'_, InstallerState>,
) -> Result<SystemCheckReport, String> {
    ui::run_system_check(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn get_local_bootstrap_status(
    state: tauri::State<'_, InstallerState>,
) -> Result<LocalBootstrapStatus, String> {
    ui::get_local_bootstrap_status(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn prepare_local_runtime(
    pull_ollama_default_model: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<LocalBootstrapStatus, String> {
    ui::prepare_local_runtime(&state.runtime, pull_ollama_default_model).map_err(map_error)
}

#[tauri::command]
fn install_local_model_pack(
    source_path: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<LocalModelPackInstallResult, String> {
    ui::install_local_model_pack(&state.runtime, source_path).map_err(map_error)
}

#[tauri::command]
fn invoke_guided_genesis_rite(
    vision_core: String,
    core_values: Vec<String>,
    will_directives: Vec<String>,
    signing_secret: String,
    facet_vision: Option<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<GenesisRiteResult, String> {
    ui::invoke_guided_genesis_rite(
        &state.runtime,
        ui::GuidedGenesisRequest {
            vision_core,
            core_values,
            will_directives,
            signing_secret,
            facet_vision,
        },
    )
    .map_err(map_error)
}

#[tauri::command]
fn bootstrap_three_agents(
    orchestrator_agent_id: String,
    prism_agent_id: String,
    telegram_chat_id_genesis: Option<String>,
    telegram_chat_id_synthesis: Option<String>,
    telegram_chat_id_auditor: Option<String>,
    discord_thread_id_genesis: Option<String>,
    discord_thread_id_synthesis: Option<String>,
    discord_thread_id_auditor: Option<String>,
    prism_sub_sphere_id: Option<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<ui::ThreeAgentBootstrapResult, String> {
    ui::bootstrap_three_agents(
        &state.runtime,
        ui::ThreeAgentBootstrapRequest {
            orchestrator_agent_id,
            prism_agent_id,
            telegram_chat_id_genesis,
            telegram_chat_id_synthesis,
            telegram_chat_id_auditor,
            discord_thread_id_genesis,
            discord_thread_id_synthesis,
            discord_thread_id_auditor,
            prism_sub_sphere_id,
        },
    )
    .map_err(map_error)
}

#[tauri::command]
fn get_security_persistence_settings(
    state: tauri::State<'_, InstallerState>,
) -> Result<SecurityPersistenceSettings, String> {
    ui::get_security_persistence_settings(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn update_security_persistence_settings(
    snapshot_path: String,
    encryption_enabled: bool,
    passphrase: Option<String>,
    auto_save_enabled: bool,
    secret_backend_mode: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<SecurityPersistenceSettings, String> {
    ui::update_security_persistence_settings(
        &state.runtime,
        snapshot_path,
        encryption_enabled,
        passphrase,
        auto_save_enabled,
        secret_backend_mode,
    )
    .map_err(map_error)
}

#[tauri::command]
fn get_observability_status(
    state: tauri::State<'_, InstallerState>,
) -> Result<ObservabilityStatus, String> {
    ui::get_observability_status(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn update_observability_settings(
    retention_days: u32,
    log_level: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<ObservabilityStatus, String> {
    ui::update_observability_settings(&state.runtime, retention_days, log_level).map_err(map_error)
}

#[tauri::command]
fn get_install_review_summary(
    state: tauri::State<'_, InstallerState>,
) -> Result<InstallReviewSummary, String> {
    ui::get_install_review_summary(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn submit_deliberation(
    query: String,
    provider_override: Option<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<DeliberationCommandResult, String> {
    ui::submit_deliberation(&state.runtime, query, provider_override).map_err(map_error)
}

#[tauri::command]
fn flush_runtime_auto_snapshot(
    state: tauri::State<'_, InstallerState>,
) -> Result<Option<RuntimeSnapshotResult>, String> {
    ui::flush_runtime_auto_snapshot(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn create_task_sub_sphere(
    name: String,
    objective: String,
    hitl_required: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<TaskSubSphereSummary, String> {
    ui::create_task_sub_sphere(&state.runtime, name, objective, hitl_required).map_err(map_error)
}

#[tauri::command]
fn get_sub_sphere_list(state: tauri::State<'_, InstallerState>) -> Result<Vec<TaskSubSphereSummary>, String> {
    ui::get_sub_sphere_list(&state.runtime).map_err(map_error)
}

#[tauri::command]
fn start_workflow_training(
    sub_sphere_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<WorkflowTrainingSession, String> {
    ui::start_workflow_training(&state.runtime, sub_sphere_id).map_err(map_error)
}

#[tauri::command]
fn submit_training_message(
    session_id: String,
    message: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<(), String> {
    ui::submit_training_message(&state.runtime, session_id, message).map_err(map_error)
}

#[tauri::command]
fn save_trained_workflow(
    session_id: String,
    workflow_name: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<WorkflowDefinition, String> {
    ui::save_trained_workflow(&state.runtime, session_id, workflow_name).map_err(map_error)
}

#[tauri::command]
fn get_workflow_list(
    sub_sphere_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<Vec<WorkflowDefinition>, String> {
    ui::get_workflow_list(&state.runtime, sub_sphere_id).map_err(map_error)
}

#[tauri::command]
fn delete_workflow(
    sub_sphere_id: String,
    workflow_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<(), String> {
    ui::delete_workflow(&state.runtime, sub_sphere_id, workflow_id).map_err(map_error)
}

fn main() {
    tauri::Builder::default()
        .manage(InstallerState::new())
        .invoke_handler(tauri::generate_handler![
            get_compute_options,
            finalize_setup_compute_selection,
            set_global_compute_provider,
            set_provider_priority,
            get_provider_health,
            update_provider_config,
            get_communication_status,
            update_telegram_integration,
            update_discord_integration,
            bind_agent_communication_route,
            bind_sub_sphere_prism_route,
            send_agent_message,
            send_sub_sphere_prism_message,
            get_in_app_thread_messages,
            get_telegram_inbox,
            poll_telegram_updates_once,
            process_telegram_webhook_payload,
            set_telegram_webhook,
            clear_telegram_webhook,
            send_telegram_typing_indicator,
            probe_discord_gateway,
            record_discord_gateway_heartbeat,
            register_discord_gateway_close,
            process_discord_gateway_event,
            defer_discord_interaction,
            complete_discord_interaction,
            send_discord_typing_indicator,
            run_system_check,
            get_local_bootstrap_status,
            install_local_model_pack,
            prepare_local_runtime,
            invoke_guided_genesis_rite,
            bootstrap_three_agents,
            get_security_persistence_settings,
            update_security_persistence_settings,
            get_observability_status,
            update_observability_settings,
            get_install_review_summary,
            submit_deliberation,
            flush_runtime_auto_snapshot,
            create_task_sub_sphere,
            get_sub_sphere_list,
            start_workflow_training,
            submit_training_message,
            save_trained_workflow,
            get_workflow_list,
            delete_workflow
        ])
        .run(tauri::generate_context!())
        .expect("failed to run metacanon installer desktop app");
}
