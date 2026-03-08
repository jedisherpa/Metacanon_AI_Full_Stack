use metacanon_ai::action_validator::{ActionRequest, WillVectorActionValidator};
use metacanon_ai::genesis::{MorpheusConfig, SoulFacet, WillVector};
use metacanon_ai::ui::GenesisMorpheusSettings;
use metacanon_ai::ui::{
    bind_agent_communication_route, bind_sub_sphere_prism_route, create_task_sub_sphere,
    dissolve_sub_sphere, enable_runtime_auto_snapshot, get_communication_status,
    get_compute_options, get_sub_sphere_list, get_sub_sphere_status, invoke_genesis_rite,
    pause_sub_sphere, save_runtime_snapshot, send_agent_message, send_sub_sphere_prism_message,
    set_global_compute_provider, set_provider_priority, submit_sub_sphere_query,
    update_discord_integration, update_provider_config, update_telegram_integration,
    GenesisRiteRequest, UiCommandError, UiCommandRuntime,
};
use serde::Serialize;
use serde_json::Value;
use std::env;
use std::path::Path;

#[derive(Debug)]
struct RuntimeOptions {
    snapshot_path: String,
    command: String,
    args: Vec<String>,
}

#[derive(Debug, serde::Deserialize)]
struct GenesisPayload {
    vision_core: String,
    core_values: Vec<String>,
    #[serde(default)]
    soul_facets: Vec<SoulFacet>,
    #[serde(default)]
    human_in_loop: bool,
    #[serde(default)]
    interpretive_boundaries: Vec<String>,
    drift_prevention: String,
    #[serde(default)]
    enable_morpheus_compute: bool,
    #[serde(default)]
    morpheus: Option<MorpheusConfig>,
    #[serde(default)]
    will_directives: Vec<String>,
    signing_secret: String,
    #[serde(default)]
    extensions: Value,
}

#[derive(Debug, serde::Deserialize)]
struct TelegramPayload {
    enabled: bool,
    routing_mode: String,
    #[serde(default)]
    bot_token: Option<String>,
    #[serde(default)]
    default_chat_id: Option<String>,
    #[serde(default)]
    orchestrator_chat_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct DiscordPayload {
    enabled: bool,
    routing_mode: String,
    #[serde(default)]
    bot_token: Option<String>,
    #[serde(default)]
    guild_id: Option<String>,
    #[serde(default)]
    default_channel_id: Option<String>,
    #[serde(default)]
    orchestrator_thread_id: Option<String>,
    #[serde(default)]
    auto_spawn_sub_sphere_threads: bool,
}

#[derive(Debug, serde::Deserialize)]
struct AgentBindingPayload {
    agent_id: String,
    #[serde(default)]
    telegram_chat_id: Option<String>,
    #[serde(default)]
    discord_thread_id: Option<String>,
    #[serde(default)]
    in_app_thread_id: Option<String>,
    #[serde(default)]
    is_orchestrator: bool,
}

#[derive(Debug, serde::Deserialize)]
struct PrismBindingPayload {
    sub_sphere_id: String,
    prism_agent_id: String,
    #[serde(default)]
    telegram_chat_id: Option<String>,
    #[serde(default)]
    discord_thread_id: Option<String>,
    #[serde(default)]
    in_app_thread_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct AgentMessagePayload {
    agent_id: String,
    platform: String,
    message: String,
}

#[derive(Debug, serde::Deserialize)]
struct PrismMessagePayload {
    sub_sphere_id: String,
    platform: String,
    message: String,
}

#[derive(Debug, serde::Deserialize)]
struct SubSphereCreatePayload {
    name: String,
    objective: String,
    #[serde(default)]
    hitl_required: bool,
}

#[derive(Debug, serde::Deserialize)]
struct SubSphereQueryPayload {
    query: String,
    #[serde(default)]
    provider_override: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct ValidatePayload {
    action: ActionRequest,
    will_vector: WillVector,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let options = parse_args(env::args().skip(1).collect())?;
    let runtime = runtime_for_snapshot(&options.snapshot_path).map_err(render_ui_error)?;

    match options.command.as_str() {
        "get-compute-options" => print_json(&get_compute_options(&runtime).map_err(render_ui_error)?),
        "set-global-compute-provider" => {
            let provider_id = required_arg(&options.args, 0, "provider_id")?;
            let result = set_global_compute_provider(&runtime, provider_id.to_string()).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "set-provider-priority" => {
            let priority_json = required_arg(&options.args, 0, "priority_json")?;
            let priority = serde_json::from_str::<Vec<String>>(priority_json)
                .map_err(|error| format!("invalid priority json: {error}"))?;
            let result = set_provider_priority(&runtime, priority).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "update-provider-config" => {
            let provider_id = required_arg(&options.args, 0, "provider_id")?;
            let config_json = required_arg(&options.args, 1, "config_json")?;
            let config = serde_json::from_str::<Value>(config_json)
                .map_err(|error| format!("invalid provider config json: {error}"))?;
            let result = update_provider_config(&runtime, provider_id.to_string(), config).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "invoke-genesis-rite" => {
            let payload = serde_json::from_str::<GenesisPayload>(required_arg(&options.args, 0, "request_json")?)
                .map_err(|error| format!("invalid genesis payload: {error}"))?;
            let result = invoke_genesis_rite(&runtime, GenesisRiteRequest {
                vision_core: payload.vision_core,
                core_values: payload.core_values,
                soul_facets: payload.soul_facets,
                human_in_loop: payload.human_in_loop,
                interpretive_boundaries: payload.interpretive_boundaries,
                drift_prevention: payload.drift_prevention,
                enable_morpheus_compute: payload.enable_morpheus_compute,
                morpheus: payload
                    .morpheus
                    .map(|value| GenesisMorpheusSettings {
                        router_id: value.router_id,
                        wallet_id: value.wallet_id,
                        endpoint: value.endpoint,
                    })
                    .unwrap_or_default(),
                will_directives: payload.will_directives,
                signing_secret: payload.signing_secret,
                extensions: payload.extensions,
            })
            .map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "validate-action" => {
            let payload = serde_json::from_str::<ValidatePayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid validation payload: {error}"))?;
            let validator = WillVectorActionValidator::new(payload.will_vector);
            let valid = validator.validate_action_request(&payload.action).is_ok();
            print_json(&serde_json::json!({ "valid": valid }))
        }
        "create-task-sub-sphere" => {
            let payload = serde_json::from_str::<SubSphereCreatePayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid sub-sphere payload: {error}"))?;
            let result = create_task_sub_sphere(&runtime, payload.name, payload.objective, payload.hitl_required)
                .map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "get-sub-sphere-list" => print_json(&get_sub_sphere_list(&runtime).map_err(render_ui_error)?),
        "get-sub-sphere-status" => {
            let sub_sphere_id = required_arg(&options.args, 0, "sub_sphere_id")?;
            let result = get_sub_sphere_status(&runtime, sub_sphere_id.to_string()).map_err(render_ui_error)?;
            print_json(&result)
        }
        "pause-sub-sphere" => {
            let sub_sphere_id = required_arg(&options.args, 0, "sub_sphere_id")?;
            pause_sub_sphere(&runtime, sub_sphere_id.to_string()).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&serde_json::json!({ "ok": true }))
        }
        "dissolve-sub-sphere" => {
            let sub_sphere_id = required_arg(&options.args, 0, "sub_sphere_id")?;
            let reason = required_arg(&options.args, 1, "reason")?;
            dissolve_sub_sphere(&runtime, sub_sphere_id.to_string(), reason.to_string()).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&serde_json::json!({ "ok": true }))
        }
        "submit-sub-sphere-query" => {
            let sub_sphere_id = required_arg(&options.args, 0, "sub_sphere_id")?;
            let payload = serde_json::from_str::<SubSphereQueryPayload>(required_arg(&options.args, 1, "payload_json")?)
                .map_err(|error| format!("invalid query payload: {error}"))?;
            let result = submit_sub_sphere_query(&runtime, sub_sphere_id.to_string(), payload.query, payload.provider_override)
                .map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "get-communication-status" => print_json(&get_communication_status(&runtime).map_err(render_ui_error)?),
        "update-telegram-integration" => {
            let payload = serde_json::from_str::<TelegramPayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid telegram payload: {error}"))?;
            let result = update_telegram_integration(
                &runtime,
                payload.enabled,
                payload.routing_mode,
                payload.bot_token,
                payload.default_chat_id,
                payload.orchestrator_chat_id,
            ).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "update-discord-integration" => {
            let payload = serde_json::from_str::<DiscordPayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid discord payload: {error}"))?;
            let result = update_discord_integration(
                &runtime,
                payload.enabled,
                payload.routing_mode,
                payload.bot_token,
                payload.guild_id,
                payload.default_channel_id,
                payload.orchestrator_thread_id,
                payload.auto_spawn_sub_sphere_threads,
            ).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "bind-agent-route" => {
            let payload = serde_json::from_str::<AgentBindingPayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid agent binding payload: {error}"))?;
            let result = bind_agent_communication_route(
                &runtime,
                payload.agent_id,
                payload.telegram_chat_id,
                payload.discord_thread_id,
                payload.in_app_thread_id,
                payload.is_orchestrator,
            ).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "bind-sub-sphere-prism-route" => {
            let payload = serde_json::from_str::<PrismBindingPayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid prism binding payload: {error}"))?;
            let result = bind_sub_sphere_prism_route(
                &runtime,
                payload.sub_sphere_id,
                payload.prism_agent_id,
                payload.telegram_chat_id,
                payload.discord_thread_id,
                payload.in_app_thread_id,
            ).map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "send-agent-message" => {
            let payload = serde_json::from_str::<AgentMessagePayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid agent message payload: {error}"))?;
            let result = send_agent_message(&runtime, payload.platform, payload.agent_id, payload.message)
                .map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        "send-sub-sphere-prism-message" => {
            let payload = serde_json::from_str::<PrismMessagePayload>(required_arg(&options.args, 0, "payload_json")?)
                .map_err(|error| format!("invalid prism message payload: {error}"))?;
            let result = send_sub_sphere_prism_message(&runtime, payload.platform, payload.sub_sphere_id, payload.message)
                .map_err(render_ui_error)?;
            persist_snapshot(&runtime, &options.snapshot_path)?;
            print_json(&result)
        }
        other => Err(format!("unknown runtime_control command: {other}")),
    }
}

fn parse_args(args: Vec<String>) -> Result<RuntimeOptions, String> {
    let mut snapshot_path = default_snapshot_path();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--snapshot" => {
                index += 1;
                if index >= args.len() {
                    return Err("missing value for --snapshot".to_string());
                }
                snapshot_path = args[index].clone();
                index += 1;
            }
            _ => break,
        }
    }

    if index >= args.len() {
        return Err("missing command".to_string());
    }

    Ok(RuntimeOptions {
        snapshot_path,
        command: args[index].clone(),
        args: args[index + 1..].to_vec(),
    })
}

fn runtime_for_snapshot(snapshot_path: &str) -> Result<UiCommandRuntime, UiCommandError> {
    if Path::new(snapshot_path).is_file() {
        UiCommandRuntime::new_with_auto_snapshot(snapshot_path.to_string())
    } else {
        let runtime = UiCommandRuntime::new();
        enable_runtime_auto_snapshot(&runtime, snapshot_path.to_string(), false)?;
        Ok(runtime)
    }
}

fn persist_snapshot(runtime: &UiCommandRuntime, snapshot_path: &str) -> Result<(), String> {
    save_runtime_snapshot(runtime, snapshot_path.to_string())
        .map(|_| ())
        .map_err(render_ui_error)
}

fn default_snapshot_path() -> String {
    if let Ok(home) = env::var("HOME") {
        return format!("{home}/.metacanon_ai/runtime_snapshot.json");
    }
    ".metacanon_ai/runtime_snapshot.json".to_string()
}

fn required_arg<'a>(args: &'a [String], index: usize, label: &str) -> Result<&'a str, String> {
    args.get(index)
        .map(String::as_str)
        .ok_or_else(|| format!("missing {label}"))
}

fn print_json<T: Serialize>(value: &T) -> Result<(), String> {
    let output = serde_json::to_string(value)
        .map_err(|error| format!("failed to serialize result: {error}"))?;
    println!("{output}");
    Ok(())
}

fn render_ui_error(error: UiCommandError) -> String {
    error.to_string()
}
