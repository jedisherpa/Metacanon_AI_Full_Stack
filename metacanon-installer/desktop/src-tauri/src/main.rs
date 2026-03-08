#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use metacanon_ai::ui::{
    self, AgentBinding, CommunicationDispatchResult, CommunicationStatus, ComputeOption,
    DeliberationCommandResult, DiscordDeferredInteractionAck, DiscordGatewayCloseResult,
    DiscordGatewayEventResult, DiscordGatewayProbeResult, DiscordGatewayState,
    DiscordInteractionCompletionResult, GenesisRiteResult, InAppThreadMessage,
    InstallReviewSummary, LocalBootstrapStatus, LocalModelPackInstallResult, ObservabilityStatus,
    PrismRoundCommandResult, PrismRuntimeInitResult, ProviderConfigUpdateResult, ProviderHealthStatus,
    RuntimeSnapshotResult, SecurityPersistenceSettings, SetupComputeSelectionResult, SubSpherePrismBinding,
    SystemCheckReport, TelegramInboundRecord, TelegramUpdatePullResult, TelegramWebhookConfigResult,
    TelegramWebhookResult, TypingIndicatorResult, UiCommandRuntime,
};
use metacanon_ai::task_sub_sphere::TaskSubSphereSummary;
use metacanon_ai::workflow::{WorkflowDefinition, WorkflowTrainingSession};
use serde::Serialize;
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
enum ModelDownloadState {
    Idle,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
struct ModelDownloadStatus {
    status: ModelDownloadState,
    model_id: Option<String>,
    progress_percent: Option<f64>,
    detail: String,
    updated_at_epoch_ms: i64,
}

struct InstallerState {
    runtime: Arc<UiCommandRuntime>,
    model_download: Arc<Mutex<ModelDownloadStatus>>,
    telegram_deliberation_listener: Arc<Mutex<TelegramDeliberationListenerState>>,
}

#[derive(Debug, Clone)]
struct TelegramDeliberationListenerState {
    running: bool,
    last_processed_update_id: i64,
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

        Self {
            runtime: Arc::new(runtime),
            model_download: Arc::new(Mutex::new(ModelDownloadStatus {
                status: ModelDownloadState::Idle,
                model_id: None,
                progress_percent: None,
                detail: "No model download in progress.".to_string(),
                updated_at_epoch_ms: now_epoch_ms(),
            })),
            telegram_deliberation_listener: Arc::new(Mutex::new(
                TelegramDeliberationListenerState {
                    running: false,
                    last_processed_update_id: 0,
                },
            )),
        }
    }
}

fn map_error(error: ui::UiCommandError) -> String {
    error.to_string()
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_progress_percent_from_line(line: &str) -> Option<f64> {
    let percent_index = line.find('%')?;
    let prefix = &line[..percent_index];
    let mut digits = String::new();
    for ch in prefix.chars().rev() {
        if ch.is_ascii_digit() || ch == '.' {
            digits.insert(0, ch);
        } else if !digits.is_empty() {
            break;
        }
    }
    if digits.is_empty() {
        return None;
    }
    digits.parse::<f64>().ok().map(|value| value.clamp(0.0, 100.0))
}

fn strip_ansi_sequences(input: &str) -> String {
    let mut output = String::new();
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if let Some(next) = chars.peek() {
                if *next == '[' || *next == '?' {
                    while let Some(consumed) = chars.next() {
                        if consumed.is_ascii_alphabetic() {
                            break;
                        }
                    }
                    continue;
                }
            }
            continue;
        }
        if ch.is_control() && ch != '\n' && ch != '\t' {
            continue;
        }
        output.push(ch);
    }
    output
}

fn summarize_stderr(stderr_text: &str) -> String {
    let cleaned = strip_ansi_sequences(stderr_text);
    let lines: Vec<String> = cleaned
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    if lines.is_empty() {
        return String::new();
    }

    if let Some(line) = lines
        .iter()
        .find(|line| line.contains("Error:") || line.contains("error:"))
    {
        return line.clone();
    }
    if let Some(line) = lines.iter().find(|line| line.contains("Terminating app")) {
        return line.clone();
    }
    if let Some(line) = lines.iter().find(|line| line.contains("unknown")) {
        return line.clone();
    }

    lines.last().cloned().unwrap_or_default()
}

fn list_ollama_models() -> Result<Vec<String>, String> {
    let script = "if [ -x /opt/homebrew/bin/ollama ]; then /opt/homebrew/bin/ollama list; else ollama list; fi";
    let output = Command::new("/bin/zsh")
        .arg("-lc")
        .arg(script)
        .output()
        .map_err(|error| format!("failed to run ollama list: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("ollama list exited with status: {}", output.status)
        } else {
            format!("ollama list exited with status: {}. detail: {stderr}", output.status)
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let models = strip_ansi_sequences(&stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.to_ascii_lowercase().starts_with("name"))
        .filter_map(|line| line.split_whitespace().next())
        .map(|name| name.trim().to_string())
        .collect::<Vec<_>>();

    Ok(models)
}

fn has_ollama_model(model_id: &str) -> Result<bool, String> {
    let normalized_target = model_id.trim().to_ascii_lowercase();
    if normalized_target.is_empty() {
        return Ok(false);
    }

    let model_names = list_ollama_models()?;
    Ok(model_names
        .iter()
        .any(|name| name.trim().to_ascii_lowercase() == normalized_target))
}

fn send_telegram_progress(runtime: &UiCommandRuntime, text: &str) {
    let _ = ui::send_agent_message(
        runtime,
        "telegram".to_string(),
        "agent-synthesis".to_string(),
        text.to_string(),
    );
}

fn start_telegram_deliberation_listener_inner(
    runtime: Arc<UiCommandRuntime>,
    listener_state: Arc<Mutex<TelegramDeliberationListenerState>>,
) {
    std::thread::spawn(move || loop {
        let is_running = listener_state
            .lock()
            .map(|guard| guard.running)
            .unwrap_or(false);
        if !is_running {
            break;
        }

        let _ = ui::poll_telegram_updates_once(&runtime, 50);
        let inbox = ui::get_telegram_inbox(&runtime, 200, 0).unwrap_or_default();
        let mut sorted = inbox;
        sorted.sort_by_key(|entry| entry.update_id);

        for entry in sorted {
            let mut should_process = false;
            if let Ok(mut state) = listener_state.lock() {
                if entry.update_id > state.last_processed_update_id {
                    state.last_processed_update_id = entry.update_id;
                    should_process = true;
                }
            }
            if !should_process {
                continue;
            }

            let raw_text = entry.text.trim();
            let maybe_query = if let Some(rest) = raw_text.strip_prefix("/deliberate ") {
                Some(rest.trim().to_string())
            } else if raw_text == "/deliberate" {
                Some(String::new())
            } else {
                None
            };

            let Some(query) = maybe_query else {
                continue;
            };

            if query.is_empty() {
                send_telegram_progress(
                    &runtime,
                    "Usage: /deliberate <question>. Example: /deliberate create a daily plan.",
                );
                continue;
            }

            send_telegram_progress(&runtime, &format!("Running Task: {query}..."));
            send_telegram_progress(
                &runtime,
                "Step 1/5 Validate request and gather provider chain...",
            );

            if let Ok(review) = ui::get_install_review_summary(&runtime) {
                send_telegram_progress(
                    &runtime,
                    &format!(
                        "Step 2/5 Provider chain: {}",
                        review.provider_chain.join(" -> ")
                    ),
                );
            } else {
                send_telegram_progress(
                    &runtime,
                    "Step 2/5 Provider chain unavailable, continuing...",
                );
            }

            send_telegram_progress(&runtime, "Step 3/5 Opening Prism/Torus round...");
            match ui::run_prism_round(
                &runtime,
                ui::PrismRoundRequest {
                    query: query.clone(),
                    provider_override: None,
                    channel: Some("telegram".to_string()),
                    force_deliberation: true,
                },
            ) {
                Ok(result) => {
                    if let Some(round_id) = result.round_id.as_deref() {
                        send_telegram_progress(
                            &runtime,
                            &format!("Step 4/5 Round {round_id} converged across {} lanes.", result.lane_outputs.len()),
                        );
                    }
                    for lane in &result.lane_outputs {
                        let mut lane_body = lane.output_text.clone();
                        if lane_body.len() > 1200 {
                            lane_body.truncate(1200);
                            lane_body.push_str("\n\n[truncated]");
                        }
                        send_telegram_progress(
                            &runtime,
                            &format!(
                                "{} lane via {} / {}:\n\n{}",
                                lane.lane, lane.provider_id, lane.model, lane_body
                            ),
                        );
                    }
                    let mut body = result.final_result.output_text.clone();
                    if body.len() > 2800 {
                        body.truncate(2800);
                        body.push_str("\n\n[truncated]");
                    }
                    send_telegram_progress(
                        &runtime,
                        &format!(
                            "Step 5/5 Complete.\nRoute: {}\nProvider: {}\nModel: {}\nFallback: {}\nSphere sync: {}/{}\n\n{}",
                            result.route,
                            result.final_result.provider_id,
                            result.final_result.model,
                            result.final_result.used_fallback,
                            result.event_publish.succeeded,
                            result.event_publish.attempted,
                            body
                        ),
                    );
                }
                Err(error) => {
                    send_telegram_progress(&runtime, &format!("Deliberation failed: {}", error));
                }
            }
        }

        std::thread::sleep(Duration::from_millis(1500));
    });
}

#[tauri::command]
fn start_telegram_deliberation_listener(
    state: tauri::State<'_, InstallerState>,
) -> Result<String, String> {
    let mut listener = state
        .telegram_deliberation_listener
        .lock()
        .map_err(|_| "failed to lock telegram deliberation listener state".to_string())?;

    if listener.running {
        return Ok("telegram deliberation listener already running".to_string());
    }

    listener.last_processed_update_id = ui::get_telegram_inbox(&state.runtime, 200, 0)
        .unwrap_or_default()
        .iter()
        .map(|entry| entry.update_id)
        .max()
        .unwrap_or(0);
    listener.running = true;
    drop(listener);

    start_telegram_deliberation_listener_inner(
        Arc::clone(&state.runtime),
        Arc::clone(&state.telegram_deliberation_listener),
    );
    Ok("telegram deliberation listener started".to_string())
}

#[tauri::command]
fn start_model_download(
    model_id: String,
    state: tauri::State<'_, InstallerState>,
) -> Result<ModelDownloadStatus, String> {
    {
        let mut current = state
            .model_download
            .lock()
            .map_err(|_| "failed to lock model download state".to_string())?;
        if matches!(current.status, ModelDownloadState::Running) {
            return Err("A model download is already running.".to_string());
        }

        *current = ModelDownloadStatus {
            status: ModelDownloadState::Running,
            model_id: Some(model_id.clone()),
            progress_percent: None,
            detail: format!("Starting download: {model_id}"),
            updated_at_epoch_ms: now_epoch_ms(),
        };
    }

    let progress_state = Arc::clone(&state.model_download);
    std::thread::spawn(move || {
        let escaped_model_id = model_id.replace('\'', "'\\''");
        let shell_cmd = format!(
            "export TERM=xterm-256color; \
             if [ -x /opt/homebrew/bin/ollama ]; then \
               /opt/homebrew/bin/ollama pull '{escaped_model_id}'; \
             else \
               ollama pull '{escaped_model_id}'; \
             fi"
        );

        let child = Command::new("/usr/bin/script")
            .arg("-q")
            .arg("/dev/null")
            .arg("/bin/zsh")
            .arg("-lc")
            .arg(shell_cmd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match child {
            Ok(process) => process,
            Err(error) => {
                if let Ok(mut status) = progress_state.lock() {
                    *status = ModelDownloadStatus {
                        status: ModelDownloadState::Failed,
                        model_id: Some(model_id.clone()),
                        progress_percent: None,
                        detail: format!("Failed to start ollama pull: {error}"),
                        updated_at_epoch_ms: now_epoch_ms(),
                    };
                }
                return;
            }
        };

        let stderr_handle = child.stderr.take().map(|stderr| {
            let progress_state = Arc::clone(&progress_state);
            let model_id_for_stderr = model_id.clone();
            std::thread::spawn(move || {
                let mut reader = BufReader::new(stderr);
                let mut output = String::new();
                let mut chunk = Vec::new();

                loop {
                    chunk.clear();
                    match reader.read_until(b'\r', &mut chunk) {
                        Ok(0) => break,
                        Ok(_) => {
                            let raw = String::from_utf8_lossy(&chunk);
                            let cleaned =
                                strip_ansi_sequences(&raw).replace('\r', "\n");

                            for segment in cleaned
                                .split('\n')
                                .map(|entry| entry.trim())
                                .filter(|entry| !entry.is_empty())
                            {
                                if !output.is_empty() {
                                    output.push('\n');
                                }
                                output.push_str(segment);

                                let progress =
                                    parse_progress_percent_from_line(segment);
                                if let Ok(mut status) = progress_state.lock() {
                                    status.status = ModelDownloadState::Running;
                                    status.model_id =
                                        Some(model_id_for_stderr.clone());
                                    if let Some(percent) = progress {
                                        status.progress_percent = Some(percent);
                                    }
                                    status.detail = segment.to_string();
                                    status.updated_at_epoch_ms = now_epoch_ms();
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }

                output
            })
        });

        if let Some(stdout) = child.stdout.take() {
            let mut reader = BufReader::new(stdout);
            let mut chunk = Vec::new();
            loop {
                chunk.clear();
                match reader.read_until(b'\r', &mut chunk) {
                    Ok(0) => break,
                    Ok(_) => {
                        let raw = String::from_utf8_lossy(&chunk);
                        let cleaned = strip_ansi_sequences(&raw).replace('\r', "\n");
                        for segment in cleaned
                            .split('\n')
                            .map(|entry| entry.trim())
                            .filter(|entry| !entry.is_empty())
                        {
                            let progress = parse_progress_percent_from_line(segment);
                            if let Ok(mut status) = progress_state.lock() {
                                status.status = ModelDownloadState::Running;
                                status.model_id = Some(model_id.clone());
                                if let Some(percent) = progress {
                                    status.progress_percent = Some(percent);
                                }
                                status.detail = segment.to_string();
                                status.updated_at_epoch_ms = now_epoch_ms();
                            }
                        }
                    }
                    Err(error) => {
                        if let Ok(mut status) = progress_state.lock() {
                            *status = ModelDownloadStatus {
                                status: ModelDownloadState::Failed,
                                model_id: Some(model_id.clone()),
                                progress_percent: None,
                                detail: format!("Failed reading download progress: {error}"),
                                updated_at_epoch_ms: now_epoch_ms(),
                            };
                        }
                        return;
                    }
                }
            }
        }

        let stderr_text = stderr_handle
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default();
        let stderr_summary = summarize_stderr(&stderr_text);

        match child.wait() {
            Ok(exit_status) if exit_status.success() => {
                if let Ok(mut status) = progress_state.lock() {
                    *status = ModelDownloadStatus {
                        status: ModelDownloadState::Completed,
                        model_id: Some(model_id.clone()),
                        progress_percent: Some(100.0),
                        detail: format!("Model ready: {model_id}"),
                        updated_at_epoch_ms: now_epoch_ms(),
                    };
                }
            }
            Ok(exit_status) => {
                if let Ok(mut status) = progress_state.lock() {
                    *status = ModelDownloadStatus {
                        status: ModelDownloadState::Failed,
                        model_id: Some(model_id.clone()),
                        progress_percent: None,
                        detail: if stderr_summary.is_empty() {
                            format!("ollama pull exited with status: {exit_status}")
                        } else {
                            format!(
                                "ollama pull exited with status: {exit_status}. detail: {}",
                                stderr_summary
                            )
                        },
                        updated_at_epoch_ms: now_epoch_ms(),
                    };
                }
            }
            Err(error) => {
                if let Ok(mut status) = progress_state.lock() {
                    *status = ModelDownloadStatus {
                        status: ModelDownloadState::Failed,
                        model_id: Some(model_id.clone()),
                        progress_percent: None,
                        detail: format!("Failed waiting for ollama pull: {error}"),
                        updated_at_epoch_ms: now_epoch_ms(),
                    };
                }
            }
        }
    });

    let snapshot = state
        .model_download
        .lock()
        .map_err(|_| "failed to lock model download state".to_string())?
        .clone();
    Ok(snapshot)
}

#[tauri::command]
fn get_model_download_status(
    state: tauri::State<'_, InstallerState>,
) -> Result<ModelDownloadStatus, String> {
    let status = state
        .model_download
        .lock()
        .map_err(|_| "failed to lock model download state".to_string())?
        .clone();
    Ok(status)
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
    state: tauri::State<'_, InstallerState>,
) -> Result<CommunicationStatus, String> {
    ui::update_telegram_integration(
        &state.runtime,
        enabled,
        routing_mode,
        bot_token,
        default_chat_id,
        orchestrator_chat_id,
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
    let mut status = ui::get_local_bootstrap_status(&state.runtime).map_err(map_error)?;

    if status.ollama_installed && !status.qwen_model_hint_present {
        if let Ok(found) = has_ollama_model("qwen3.5:35b") {
            if found {
                status.qwen_model_hint_present = true;
            }
        }
    }

    Ok(status)
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
    constitution_source: Option<String>,
    constitution_version: Option<String>,
    constitution_upload_path: Option<String>,
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
            constitution_source,
            constitution_version,
            constitution_upload_path,
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
fn initialize_prism_runtime(
    prism_display_name: Option<String>,
    prism_sub_sphere_id: Option<String>,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    state: tauri::State<'_, InstallerState>,
) -> Result<PrismRuntimeInitResult, String> {
    ui::initialize_prism_runtime(
        &state.runtime,
        ui::PrismRuntimeInitRequest {
            prism_display_name,
            prism_sub_sphere_id,
            telegram_chat_id,
            discord_thread_id,
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
fn run_prism_round(
    query: String,
    provider_override: Option<String>,
    channel: Option<String>,
    force_deliberation: bool,
    state: tauri::State<'_, InstallerState>,
) -> Result<PrismRoundCommandResult, String> {
    ui::run_prism_round(
        &state.runtime,
        ui::PrismRoundRequest {
            query,
            provider_override,
            channel,
            force_deliberation,
        },
    )
    .map_err(map_error)
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
            start_telegram_deliberation_listener,
            run_system_check,
            get_local_bootstrap_status,
            install_local_model_pack,
            prepare_local_runtime,
            start_model_download,
            get_model_download_status,
            invoke_guided_genesis_rite,
            bootstrap_three_agents,
            initialize_prism_runtime,
            get_security_persistence_settings,
            update_security_persistence_settings,
            get_observability_status,
            update_observability_settings,
            get_install_review_summary,
            submit_deliberation,
            run_prism_round,
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
