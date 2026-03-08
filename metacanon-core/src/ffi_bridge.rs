use crate::action_validator::{
    ActionRequest, WillVectorActionValidator,
};
use crate::genesis::{SoulFile, WillVector};
use crate::observability::{ObservabilityConfig, ObservabilityLogger};
use crate::ui::{
    bind_agent_communication_route as ui_bind_agent_communication_route,
    bind_sub_sphere_prism_route as ui_bind_sub_sphere_prism_route,
    create_task_sub_sphere as ui_create_task_sub_sphere,
    dissolve_sub_sphere as ui_dissolve_sub_sphere,
    get_communication_status as ui_get_communication_status,
    get_compute_options as ui_get_compute_options, get_sub_sphere_list as ui_get_sub_sphere_list,
    get_sub_sphere_status as ui_get_sub_sphere_status, invoke_genesis_rite,
    pause_sub_sphere as ui_pause_sub_sphere, send_agent_message as ui_send_agent_message,
    send_sub_sphere_prism_message as ui_send_sub_sphere_prism_message,
    set_global_compute_provider as ui_set_global_compute_provider,
    set_provider_priority as ui_set_provider_priority,
    submit_sub_sphere_query as ui_submit_sub_sphere_query,
    update_discord_integration as ui_update_discord_integration,
    update_provider_config as ui_update_provider_config,
    update_telegram_integration as ui_update_telegram_integration, GenesisRiteRequest,
    UiCommandRuntime,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

#[cfg(feature = "napi")]
use napi_derive::napi;

static UI_RUNTIME: OnceLock<UiCommandRuntime> = OnceLock::new();
static OBSERVABILITY_LOGGER: OnceLock<Result<ObservabilityLogger, String>> = OnceLock::new();

fn runtime() -> &'static UiCommandRuntime {
    UI_RUNTIME.get_or_init(UiCommandRuntime::new)
}

fn observability_logger() -> Result<&'static ObservabilityLogger, String> {
    OBSERVABILITY_LOGGER
        .get_or_init(|| {
            let log_dir = env::var("METACANON_LOG_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from(".metacanon_ai/logs"));
            let key = env::var("METACANON_OBSERVABILITY_KEY")
                .unwrap_or_else(|_| "metacanon-local-dev-key".to_string())
                .into_bytes();
            let config = ObservabilityConfig::for_log_dir(log_dir, key);
            ObservabilityLogger::new(config).map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

fn merge_json_objects(target: &mut Map<String, Value>, patch: &Map<String, Value>) {
    for (key, value) in patch {
        match (target.get_mut(key), value) {
            (Some(Value::Object(target_obj)), Value::Object(patch_obj)) => {
                merge_json_objects(target_obj, patch_obj);
            }
            _ => {
                target.insert(key.clone(), value.clone());
            }
        }
    }
}

fn to_json_string<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("failed to serialize result: {error}"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramIntegrationPayload {
    pub enabled: bool,
    pub routing_mode: String,
    #[serde(default)]
    pub bot_token: Option<String>,
    #[serde(default)]
    pub default_chat_id: Option<String>,
    #[serde(default)]
    pub orchestrator_chat_id: Option<String>,
    #[serde(default)]
    pub live_api: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscordIntegrationPayload {
    pub enabled: bool,
    pub routing_mode: String,
    #[serde(default)]
    pub bot_token: Option<String>,
    #[serde(default)]
    pub guild_id: Option<String>,
    #[serde(default)]
    pub default_channel_id: Option<String>,
    #[serde(default)]
    pub orchestrator_thread_id: Option<String>,
    #[serde(default)]
    pub auto_spawn_sub_sphere_threads: bool,
    #[serde(default)]
    pub live_api: bool,
}

pub fn genesis_rite_impl(request_json: &str) -> Result<String, String> {
    let request = serde_json::from_str::<GenesisRiteRequest>(request_json)
        .map_err(|error| format!("invalid genesis request json: {error}"))?;
    let result = invoke_genesis_rite(runtime(), request).map_err(|error| error.to_string())?;
    serde_json::to_string(&result).map_err(|error| format!("failed to serialize result: {error}"))
}

pub fn validate_action_impl(action_json: &str, will_vector_json: &str) -> Result<bool, String> {
    let action = serde_json::from_str::<ActionRequest>(action_json)
        .map_err(|error| format!("invalid action json: {error}"))?;
    let will_vector = serde_json::from_str::<WillVector>(will_vector_json)
        .map_err(|error| format!("invalid will_vector json: {error}"))?;
    let validator = WillVectorActionValidator::new(will_vector);
    Ok(validator.validate_action_request(&action).is_ok())
}

pub fn log_event_impl(
    trace_id: &str,
    event_type: &str,
    payload_json: &str,
) -> Result<String, String> {
    let logger = observability_logger()?;
    let payload = serde_json::from_str::<Value>(payload_json)
        .map_err(|error| format!("invalid payload json: {error}"))?;
    logger
        .record_dual_tier_event(event_type, trace_id, None, None, payload.clone(), payload)
        .map_err(|error| format!("failed to record event: {error}"))
}

pub fn get_code_snippet_impl(
    file_path: &str,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> Result<String, String> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err("file_path must not be empty".to_string());
    }

    let content = fs::read_to_string(file_path)
        .map_err(|error| format!("failed to read file '{file_path}': {error}"))?;
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Ok(String::new());
    }

    let start = start_line.unwrap_or(1).max(1) as usize;
    let end = end_line
        .unwrap_or(start as u32)
        .max(start as u32)
        .min(lines.len() as u32) as usize;

    let snippet = lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| {
            let line_no = index + 1;
            if line_no >= start && line_no <= end {
                Some(format!("{line_no:>4}: {line}"))
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok(snippet)
}

pub fn get_will_vector_impl(soul_file_json: &str) -> Result<String, String> {
    let soul_file = serde_json::from_str::<SoulFile>(soul_file_json)
        .map_err(|error| format!("invalid soul file json: {error}"))?;
    serde_json::to_string(&soul_file.will_vector)
        .map_err(|error| format!("failed to serialize will vector: {error}"))
}

pub fn update_soul_file_impl(
    soul_file_json: &str,
    patch_json: &str,
    signing_secret: &str,
) -> Result<String, String> {
    let mut soul_file_value = serde_json::from_str::<Value>(soul_file_json)
        .map_err(|error| format!("invalid soul file json: {error}"))?;
    let patch_value = serde_json::from_str::<Value>(patch_json)
        .map_err(|error| format!("invalid patch json: {error}"))?;

    let soul_file_object = soul_file_value
        .as_object_mut()
        .ok_or_else(|| "soul file payload must be a json object".to_string())?;
    let patch_object = patch_value
        .as_object()
        .ok_or_else(|| "patch payload must be a json object".to_string())?;
    merge_json_objects(soul_file_object, patch_object);

    let mut soul_file = serde_json::from_value::<SoulFile>(soul_file_value)
        .map_err(|error| format!("patched soul file is invalid: {error}"))?;
    soul_file.ensure_forward_compat_defaults();

    let signing_secret = signing_secret.trim();
    if signing_secret.is_empty() {
        return Err("signing_secret must not be empty".to_string());
    }
    soul_file.regenerate_integrity(signing_secret);

    serde_json::to_string(&soul_file)
        .map_err(|error| format!("failed to serialize soul file: {error}"))
}

pub fn get_compute_options_impl() -> Result<String, String> {
    let result = ui_get_compute_options(runtime()).map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn set_global_compute_provider_impl(provider_id: &str) -> Result<String, String> {
    let result = ui_set_global_compute_provider(runtime(), provider_id.to_string())
        .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn set_provider_priority_impl(priority_json: &str) -> Result<String, String> {
    let priority = if priority_json.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str::<Vec<String>>(priority_json)
            .map_err(|error| format!("invalid provider priority json: {error}"))?
    };
    let result =
        ui_set_provider_priority(runtime(), priority).map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn update_provider_config_impl(provider_id: &str, config_json: &str) -> Result<String, String> {
    let config = serde_json::from_str::<Value>(config_json)
        .map_err(|error| format!("invalid provider config json: {error}"))?;
    let result = ui_update_provider_config(runtime(), provider_id.to_string(), config)
        .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn create_task_sub_sphere_impl(
    name: &str,
    objective: &str,
    hitl_required: bool,
) -> Result<String, String> {
    let result = ui_create_task_sub_sphere(
        runtime(),
        name.to_string(),
        objective.to_string(),
        hitl_required,
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn get_sub_sphere_list_impl() -> Result<String, String> {
    let result = ui_get_sub_sphere_list(runtime()).map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn get_sub_sphere_status_impl(sub_sphere_id: &str) -> Result<String, String> {
    let status = ui_get_sub_sphere_status(runtime(), sub_sphere_id.to_string())
        .map_err(|error| error.to_string())?;
    to_json_string(&json!({ "status": status }))
}

pub fn pause_sub_sphere_impl(sub_sphere_id: &str) -> Result<String, String> {
    ui_pause_sub_sphere(runtime(), sub_sphere_id.to_string()).map_err(|error| error.to_string())?;
    to_json_string(&json!({ "ok": true }))
}

pub fn dissolve_sub_sphere_impl(sub_sphere_id: &str, reason: &str) -> Result<String, String> {
    ui_dissolve_sub_sphere(runtime(), sub_sphere_id.to_string(), reason.to_string())
        .map_err(|error| error.to_string())?;
    to_json_string(&json!({ "ok": true }))
}

pub fn submit_sub_sphere_query_impl(
    sub_sphere_id: &str,
    query: &str,
    provider_override: Option<String>,
) -> Result<String, String> {
    let result = ui_submit_sub_sphere_query(
        runtime(),
        sub_sphere_id.to_string(),
        query.to_string(),
        provider_override,
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn update_telegram_integration_impl(config_json: &str) -> Result<String, String> {
    let config = serde_json::from_str::<TelegramIntegrationPayload>(config_json)
        .map_err(|error| format!("invalid telegram config json: {error}"))?;
    let result = ui_update_telegram_integration(
        runtime(),
        config.enabled,
        config.routing_mode,
        config.bot_token,
        config.default_chat_id,
        config.orchestrator_chat_id,
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn update_discord_integration_impl(config_json: &str) -> Result<String, String> {
    let config = serde_json::from_str::<DiscordIntegrationPayload>(config_json)
        .map_err(|error| format!("invalid discord config json: {error}"))?;
    let result = ui_update_discord_integration(
        runtime(),
        config.enabled,
        config.routing_mode,
        config.bot_token,
        config.guild_id,
        config.default_channel_id,
        config.orchestrator_thread_id,
        config.auto_spawn_sub_sphere_threads,
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

#[allow(clippy::too_many_arguments)]
pub fn bind_agent_route_impl(
    agent_id: &str,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    in_app_thread_id: Option<String>,
    is_orchestrator: bool,
) -> Result<String, String> {
    let result = ui_bind_agent_communication_route(
        runtime(),
        agent_id.to_string(),
        telegram_chat_id,
        discord_thread_id,
        in_app_thread_id,
        is_orchestrator,
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn bind_sub_sphere_prism_route_impl(
    sub_sphere_id: &str,
    prism_agent_id: &str,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    in_app_thread_id: Option<String>,
) -> Result<String, String> {
    let result = ui_bind_sub_sphere_prism_route(
        runtime(),
        sub_sphere_id.to_string(),
        prism_agent_id.to_string(),
        telegram_chat_id,
        discord_thread_id,
        in_app_thread_id,
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn send_agent_message_impl(
    platform: &str,
    agent_id: &str,
    message: &str,
) -> Result<String, String> {
    let result = ui_send_agent_message(
        runtime(),
        platform.to_string(),
        agent_id.to_string(),
        message.to_string(),
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn send_sub_sphere_prism_message_impl(
    platform: &str,
    sub_sphere_id: &str,
    message: &str,
) -> Result<String, String> {
    let result = ui_send_sub_sphere_prism_message(
        runtime(),
        platform.to_string(),
        sub_sphere_id.to_string(),
        message.to_string(),
    )
    .map_err(|error| error.to_string())?;
    to_json_string(&result)
}

pub fn get_communication_status_impl() -> Result<String, String> {
    let result = ui_get_communication_status(runtime()).map_err(|error| error.to_string())?;
    to_json_string(&result)
}

#[cfg(feature = "napi")]
#[napi]
pub fn genesis_rite(request_json: String) -> napi::Result<String> {
    genesis_rite_impl(&request_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn validate_action(action_json: String, will_vector_json: String) -> napi::Result<bool> {
    validate_action_impl(&action_json, &will_vector_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn log_event(
    trace_id: String,
    event_type: String,
    payload_json: String,
) -> napi::Result<String> {
    log_event_impl(&trace_id, &event_type, &payload_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn get_code_snippet(
    file_path: String,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> napi::Result<String> {
    get_code_snippet_impl(&file_path, start_line, end_line).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn get_will_vector(soul_file_json: String) -> napi::Result<String> {
    get_will_vector_impl(&soul_file_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn update_soul_file(
    soul_file_json: String,
    patch_json: String,
    signing_secret: String,
) -> napi::Result<String> {
    update_soul_file_impl(&soul_file_json, &patch_json, &signing_secret)
        .map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn get_compute_options() -> napi::Result<String> {
    get_compute_options_impl().map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn set_global_compute_provider(provider_id: String) -> napi::Result<String> {
    set_global_compute_provider_impl(&provider_id).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn set_provider_priority(priority_json: String) -> napi::Result<String> {
    set_provider_priority_impl(&priority_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn update_provider_config(provider_id: String, config_json: String) -> napi::Result<String> {
    update_provider_config_impl(&provider_id, &config_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn create_task_sub_sphere(
    name: String,
    objective: String,
    hitl_required: bool,
) -> napi::Result<String> {
    create_task_sub_sphere_impl(&name, &objective, hitl_required).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn get_sub_sphere_list() -> napi::Result<String> {
    get_sub_sphere_list_impl().map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn get_sub_sphere_status(sub_sphere_id: String) -> napi::Result<String> {
    get_sub_sphere_status_impl(&sub_sphere_id).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn pause_sub_sphere(sub_sphere_id: String) -> napi::Result<String> {
    pause_sub_sphere_impl(&sub_sphere_id).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn dissolve_sub_sphere(sub_sphere_id: String, reason: String) -> napi::Result<String> {
    dissolve_sub_sphere_impl(&sub_sphere_id, &reason).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn submit_sub_sphere_query(
    sub_sphere_id: String,
    query: String,
    provider_override: Option<String>,
) -> napi::Result<String> {
    submit_sub_sphere_query_impl(&sub_sphere_id, &query, provider_override)
        .map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn update_telegram_integration(config_json: String) -> napi::Result<String> {
    update_telegram_integration_impl(&config_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn update_discord_integration(config_json: String) -> napi::Result<String> {
    update_discord_integration_impl(&config_json).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn bind_agent_route(
    agent_id: String,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    in_app_thread_id: Option<String>,
    is_orchestrator: bool,
) -> napi::Result<String> {
    bind_agent_route_impl(
        &agent_id,
        telegram_chat_id,
        discord_thread_id,
        in_app_thread_id,
        is_orchestrator,
    )
    .map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn bind_sub_sphere_prism_route(
    sub_sphere_id: String,
    prism_agent_id: String,
    telegram_chat_id: Option<String>,
    discord_thread_id: Option<String>,
    in_app_thread_id: Option<String>,
) -> napi::Result<String> {
    bind_sub_sphere_prism_route_impl(
        &sub_sphere_id,
        &prism_agent_id,
        telegram_chat_id,
        discord_thread_id,
        in_app_thread_id,
    )
    .map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn send_agent_message(
    platform: String,
    agent_id: String,
    message: String,
) -> napi::Result<String> {
    send_agent_message_impl(&platform, &agent_id, &message).map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn send_sub_sphere_prism_message(
    platform: String,
    sub_sphere_id: String,
    message: String,
) -> napi::Result<String> {
    send_sub_sphere_prism_message_impl(&platform, &sub_sphere_id, &message)
        .map_err(napi::Error::from_reason)
}

#[cfg(feature = "napi")]
#[napi]
pub fn get_communication_status() -> napi::Result<String> {
    get_communication_status_impl().map_err(napi::Error::from_reason)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validate_action_impl_accepts_aligned_action() {
        let action = json!({
            "target": "llm_call",
            "content": "protect private thoughts and require human approval before external actions",
            "metadata": {}
        });
        let will_vector = json!({
            "directives": [
                "protect private thoughts",
                "human approval before external actions"
            ]
        });

        let is_valid = validate_action_impl(&action.to_string(), &will_vector.to_string())
            .expect("validation should run");
        assert!(is_valid);
    }

    #[test]
    fn get_code_snippet_impl_returns_requested_range() {
        let file_path = format!("{}/src/lib.rs", env!("CARGO_MANIFEST_DIR"));
        let snippet =
            get_code_snippet_impl(&file_path, Some(1), Some(3)).expect("snippet should load");
        assert!(snippet.contains("pub mod"));
    }

    #[test]
    fn genesis_rite_and_get_will_vector_round_trip() {
        let request = json!({
            "vision_core": "MetaCanon core",
            "core_values": ["Sovereignty", "Clarity"],
            "soul_facets": [],
            "human_in_loop": true,
            "interpretive_boundaries": [],
            "drift_prevention": "strict",
            "enable_morpheus_compute": false,
            "morpheus": {},
            "will_directives": ["protect private thoughts"],
            "signing_secret": "test-secret"
        });

        let result_json = genesis_rite_impl(&request.to_string()).expect("genesis should succeed");
        let result_value: Value =
            serde_json::from_str(&result_json).expect("genesis result should parse");
        let soul_file_json = result_value
            .get("soul_file")
            .expect("soul file should be present")
            .to_string();

        let will_vector_json =
            get_will_vector_impl(&soul_file_json).expect("will vector should extract");
        let will_vector: Value =
            serde_json::from_str(&will_vector_json).expect("will vector should parse");
        assert_eq!(
            will_vector
                .get("directives")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(1)
        );
    }

    #[test]
    fn update_soul_file_regenerates_integrity() {
        let request = json!({
            "vision_core": "MetaCanon",
            "core_values": ["Sovereignty"],
            "soul_facets": [],
            "human_in_loop": true,
            "interpretive_boundaries": [],
            "drift_prevention": "strict",
            "enable_morpheus_compute": false,
            "morpheus": {},
            "will_directives": ["protect private thoughts"],
            "signing_secret": "secret-a"
        });
        let initial =
            genesis_rite_impl(&request.to_string()).expect("initial genesis should succeed");
        let initial_value: Value =
            serde_json::from_str(&initial).expect("initial json should parse");
        let soul_file = initial_value
            .get("soul_file")
            .expect("soul file should exist")
            .to_string();
        let initial_hash = initial_value
            .get("genesis_hash")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

        let patch = json!({
            "core_values": ["Sovereignty", "Integrity"]
        });
        let updated_json = update_soul_file_impl(&soul_file, &patch.to_string(), "secret-b")
            .expect("soul file update should succeed");
        let updated_value: Value =
            serde_json::from_str(&updated_json).expect("updated soul file should parse");
        let updated_hash = updated_value
            .get("genesis_hash")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        assert_ne!(initial_hash, updated_hash);
    }
}
