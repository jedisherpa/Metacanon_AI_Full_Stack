use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fmt;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const TELEGRAM_API_BASE_URL: &str = "https://api.telegram.org";
const DISCORD_API_BASE_URL: &str = "https://discord.com/api/v10";
const HTTP_TIMEOUT_SECONDS: u64 = 20;
const MAX_HTTP_ATTEMPTS: u32 = 4;
const HTTP_BACKOFF_BASE_MS: u64 = 250;
const TELEGRAM_INBOX_MAX_RECORDS: usize = 500;
const DISCORD_INTERACTION_TOKEN_TTL_MS: u128 = 15 * 60 * 1000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CommunicationPlatform {
    Telegram,
    Discord,
    InApp,
}

impl CommunicationPlatform {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "telegram" => Some(Self::Telegram),
            "discord" => Some(Self::Discord),
            "in_app" | "inapp" | "app" => Some(Self::InApp),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Telegram => "telegram",
            Self::Discord => "discord",
            Self::InApp => "in_app",
        }
    }
}

impl fmt::Display for CommunicationPlatform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentRoutingMode {
    #[default]
    PerAgent,
    Orchestrator,
}

impl AgentRoutingMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "per_agent" | "direct" | "individual" => Some(Self::PerAgent),
            "orchestrator" | "single_thread" => Some(Self::Orchestrator),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DiscordGatewayLifecycle {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Fatal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordGatewayState {
    pub lifecycle: DiscordGatewayLifecycle,
    pub gateway_url: Option<String>,
    pub session_id: Option<String>,
    pub last_sequence: Option<u64>,
    pub last_heartbeat_epoch_ms: Option<u128>,
    pub last_close_code: Option<u16>,
    pub resume_recommended: bool,
    pub shard_count: Option<u32>,
    pub session_start_limit_remaining: Option<u32>,
    pub last_error: Option<String>,
}

impl Default for DiscordGatewayState {
    fn default() -> Self {
        Self {
            lifecycle: DiscordGatewayLifecycle::Disconnected,
            gateway_url: None,
            session_id: None,
            last_sequence: None,
            last_heartbeat_epoch_ms: None,
            last_close_code: None,
            resume_recommended: false,
            shard_count: None,
            session_start_limit_remaining: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordGatewayProbeResult {
    pub lifecycle: DiscordGatewayLifecycle,
    pub gateway_url: String,
    pub shard_count: Option<u32>,
    pub session_start_limit_remaining: Option<u32>,
    pub live_probe: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordGatewayCloseResult {
    pub close_code: u16,
    pub lifecycle: DiscordGatewayLifecycle,
    pub resume_recommended: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramInboundRecord {
    pub update_id: i64,
    pub chat_id: String,
    pub from_id: Option<String>,
    pub text: String,
    pub routed_agent_id: String,
    pub routed_thread_id: String,
    pub source: String,
    pub received_at_epoch_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramUpdatePullResult {
    pub fetched_updates: usize,
    pub processed_updates: usize,
    pub dispatched_messages: usize,
    pub next_offset: Option<i64>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramWebhookResult {
    pub processed: bool,
    pub update_id: Option<i64>,
    pub routed_agent_id: Option<String>,
    pub routed_thread_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramWebhookConfigResult {
    pub applied: bool,
    pub webhook_url: Option<String>,
    pub allowed_updates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordGatewayEventResult {
    pub processed: bool,
    pub event_type: Option<String>,
    pub routed_agent_id: Option<String>,
    pub routed_thread_id: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordDeferredInteractionAck {
    pub interaction_id: String,
    pub command_name: String,
    pub routed_agent_id: String,
    pub routed_thread_id: String,
    pub deferred_response_type: u8,
    pub token_expires_at_epoch_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordInteractionCompletionResult {
    pub interaction_id: String,
    pub message_id: String,
    pub delivered_live: bool,
    pub routed_thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TypingIndicatorResult {
    pub platform: CommunicationPlatform,
    pub target_id: String,
    pub delivered_live: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
struct RateLimitWindowState {
    window_start_epoch_ms: u128,
    sent_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct DiscordPendingInteraction {
    interaction_id: String,
    application_id: String,
    token: String,
    command_name: String,
    routed_agent_id: String,
    routed_thread_id: String,
    created_at_epoch_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramIntegrationConfig {
    pub enabled: bool,
    pub bot_token: Option<String>,
    pub default_chat_id: Option<String>,
    pub orchestrator_chat_id: Option<String>,
    pub routing_mode: AgentRoutingMode,
    pub use_webhook: bool,
    pub webhook_url: Option<String>,
    pub webhook_secret_token: Option<String>,
    pub last_error: Option<String>,
}

impl Default for TelegramIntegrationConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bot_token: None,
            default_chat_id: None,
            orchestrator_chat_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            use_webhook: false,
            webhook_url: None,
            webhook_secret_token: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordIntegrationConfig {
    pub enabled: bool,
    pub bot_token: Option<String>,
    pub guild_id: Option<String>,
    pub default_channel_id: Option<String>,
    pub orchestrator_thread_id: Option<String>,
    pub routing_mode: AgentRoutingMode,
    pub auto_spawn_sub_sphere_threads: bool,
    pub last_error: Option<String>,
}

impl Default for DiscordIntegrationConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bot_token: None,
            guild_id: None,
            default_channel_id: None,
            orchestrator_thread_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            auto_spawn_sub_sphere_threads: true,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentBinding {
    pub agent_id: String,
    pub telegram_chat_id: Option<String>,
    pub discord_thread_id: Option<String>,
    pub in_app_thread_id: Option<String>,
    pub is_orchestrator: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubSpherePrismBinding {
    pub sub_sphere_id: String,
    pub prism_agent_id: String,
    pub telegram_chat_id: Option<String>,
    pub discord_thread_id: Option<String>,
    pub in_app_thread_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InAppThreadMessage {
    pub message_id: String,
    pub thread_id: String,
    pub agent_id: String,
    pub sub_sphere_id: Option<String>,
    pub sent_at_epoch_ms: u128,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommunicationDispatchResult {
    pub platform: CommunicationPlatform,
    pub agent_id: String,
    pub sub_sphere_id: Option<String>,
    pub thread_id: String,
    pub message_id: String,
    pub delivered_live: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramIntegrationStatus {
    pub enabled: bool,
    pub routing_mode: AgentRoutingMode,
    pub use_webhook: bool,
    pub configured: bool,
    pub has_bot_token: bool,
    pub default_chat_id: Option<String>,
    pub orchestrator_chat_id: Option<String>,
    pub webhook_url: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscordIntegrationStatus {
    pub enabled: bool,
    pub routing_mode: AgentRoutingMode,
    pub configured: bool,
    pub has_bot_token: bool,
    pub guild_id: Option<String>,
    pub default_channel_id: Option<String>,
    pub orchestrator_thread_id: Option<String>,
    pub auto_spawn_sub_sphere_threads: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommunicationStatus {
    pub telegram: TelegramIntegrationStatus,
    pub discord: DiscordIntegrationStatus,
    pub discord_gateway_state: DiscordGatewayState,
    pub agent_bindings: Vec<AgentBinding>,
    pub sub_sphere_bindings: Vec<SubSpherePrismBinding>,
    pub in_app_thread_count: usize,
    pub telegram_inbox_count: usize,
    pub discord_pending_interaction_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CommunicationError {
    EmptyAgentId,
    EmptySubSphereId,
    EmptyMessage,
    PlatformDisabled {
        platform: CommunicationPlatform,
    },
    MissingRoutingTarget {
        platform: CommunicationPlatform,
        reason: String,
    },
    InvalidRoutingMode {
        value: String,
    },
    InvalidPlatform {
        value: String,
    },
    HttpTransport(String),
    HttpStatus {
        status: u16,
        body: String,
    },
    InvalidApiResponse(String),
}

impl fmt::Display for CommunicationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CommunicationError::EmptyAgentId => f.write_str("agent_id must not be empty"),
            CommunicationError::EmptySubSphereId => f.write_str("sub_sphere_id must not be empty"),
            CommunicationError::EmptyMessage => f.write_str("message must not be empty"),
            CommunicationError::PlatformDisabled { platform } => {
                write!(f, "{platform} integration is not enabled")
            }
            CommunicationError::MissingRoutingTarget { platform, reason } => {
                write!(f, "missing {platform} routing target: {reason}")
            }
            CommunicationError::InvalidRoutingMode { value } => {
                write!(f, "invalid routing mode: {value}")
            }
            CommunicationError::InvalidPlatform { value } => {
                write!(f, "invalid communication platform: {value}")
            }
            CommunicationError::HttpTransport(message) => {
                write!(f, "http transport error: {message}")
            }
            CommunicationError::HttpStatus { status, body } => {
                write!(f, "http status {status}: {body}")
            }
            CommunicationError::InvalidApiResponse(message) => {
                write!(f, "invalid api response: {message}")
            }
        }
    }
}

impl std::error::Error for CommunicationError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunicationHub {
    pub telegram: TelegramIntegrationConfig,
    pub discord: DiscordIntegrationConfig,
    #[serde(default)]
    pub agent_bindings: BTreeMap<String, AgentBinding>,
    #[serde(default)]
    pub sub_sphere_bindings: BTreeMap<String, SubSpherePrismBinding>,
    #[serde(default)]
    pub in_app_threads: BTreeMap<String, Vec<InAppThreadMessage>>,
    #[serde(default)]
    pub telegram_inbox: Vec<TelegramInboundRecord>,
    #[serde(default)]
    pub telegram_next_update_offset: Option<i64>,
    #[serde(default)]
    pub discord_gateway_state: DiscordGatewayState,
    #[serde(default)]
    discord_pending_interactions: BTreeMap<String, DiscordPendingInteraction>,
    #[serde(default)]
    rate_limit_windows: BTreeMap<String, RateLimitWindowState>,
    #[serde(default)]
    message_counter: u64,
}

impl Default for CommunicationHub {
    fn default() -> Self {
        Self::new()
    }
}

impl CommunicationHub {
    pub fn new() -> Self {
        Self {
            telegram: TelegramIntegrationConfig::default(),
            discord: DiscordIntegrationConfig::default(),
            agent_bindings: BTreeMap::new(),
            sub_sphere_bindings: BTreeMap::new(),
            in_app_threads: BTreeMap::new(),
            telegram_inbox: Vec::new(),
            telegram_next_update_offset: None,
            discord_gateway_state: DiscordGatewayState::default(),
            discord_pending_interactions: BTreeMap::new(),
            rate_limit_windows: BTreeMap::new(),
            message_counter: 0,
        }
    }

    pub fn status(&self) -> CommunicationStatus {
        let has_telegram_token = has_non_empty(&self.telegram.bot_token);
        let has_discord_token = has_non_empty(&self.discord.bot_token);

        let telegram_target_present = self.telegram.default_chat_id.is_some()
            || self.telegram.orchestrator_chat_id.is_some()
            || self
                .agent_bindings
                .values()
                .any(|binding| binding.telegram_chat_id.is_some());
        let telegram_ingress_configured = if self.telegram.use_webhook {
            self.telegram
                .webhook_url
                .as_deref()
                .is_some_and(|url| !url.trim().is_empty())
        } else {
            true
        };

        let discord_target_present = self.discord.default_channel_id.is_some()
            || self.discord.orchestrator_thread_id.is_some()
            || self
                .agent_bindings
                .values()
                .any(|binding| binding.discord_thread_id.is_some())
            || self
                .sub_sphere_bindings
                .values()
                .any(|binding| binding.discord_thread_id.is_some());

        CommunicationStatus {
            telegram: TelegramIntegrationStatus {
                enabled: self.telegram.enabled,
                routing_mode: self.telegram.routing_mode,
                use_webhook: self.telegram.use_webhook,
                configured: self.telegram.enabled
                    && telegram_target_present
                    && telegram_ingress_configured
                    && has_telegram_token,
                has_bot_token: has_telegram_token,
                default_chat_id: self.telegram.default_chat_id.clone(),
                orchestrator_chat_id: self.telegram.orchestrator_chat_id.clone(),
                webhook_url: self.telegram.webhook_url.clone(),
                last_error: self.telegram.last_error.clone(),
            },
            discord: DiscordIntegrationStatus {
                enabled: self.discord.enabled,
                routing_mode: self.discord.routing_mode,
                configured: self.discord.enabled
                    && discord_target_present
                    && has_discord_token,
                has_bot_token: has_discord_token,
                guild_id: self.discord.guild_id.clone(),
                default_channel_id: self.discord.default_channel_id.clone(),
                orchestrator_thread_id: self.discord.orchestrator_thread_id.clone(),
                auto_spawn_sub_sphere_threads: self.discord.auto_spawn_sub_sphere_threads,
                last_error: self.discord.last_error.clone(),
            },
            discord_gateway_state: self.discord_gateway_state.clone(),
            agent_bindings: self.agent_bindings.values().cloned().collect(),
            sub_sphere_bindings: self.sub_sphere_bindings.values().cloned().collect(),
            in_app_thread_count: self.in_app_threads.len(),
            telegram_inbox_count: self.telegram_inbox.len(),
            discord_pending_interaction_count: self.discord_pending_interactions.len(),
        }
    }

    pub fn clone_without_secrets(&self) -> Self {
        let mut cloned = self.clone();
        cloned.telegram.bot_token = None;
        cloned.telegram.webhook_secret_token = None;
        cloned.telegram.last_error = None;
        cloned.discord.bot_token = None;
        cloned.discord.last_error = None;
        cloned.discord_pending_interactions.clear();
        cloned.rate_limit_windows.clear();
        cloned
    }

    pub fn update_telegram_config(&mut self, mut config: TelegramIntegrationConfig) {
        config.bot_token = normalize_optional_string(config.bot_token);
        config.default_chat_id = normalize_optional_string(config.default_chat_id);
        config.orchestrator_chat_id = normalize_optional_string(config.orchestrator_chat_id);
        config.webhook_url = normalize_optional_string(config.webhook_url);
        config.webhook_secret_token = normalize_optional_string(config.webhook_secret_token);
        config.last_error = None;
        self.telegram = config;
    }

    pub fn update_discord_config(&mut self, mut config: DiscordIntegrationConfig) {
        config.bot_token = normalize_optional_string(config.bot_token);
        config.guild_id = normalize_optional_string(config.guild_id);
        config.default_channel_id = normalize_optional_string(config.default_channel_id);
        config.orchestrator_thread_id = normalize_optional_string(config.orchestrator_thread_id);
        config.last_error = None;
        self.discord = config;
    }

    pub fn bind_agent_route(
        &mut self,
        mut binding: AgentBinding,
    ) -> Result<AgentBinding, CommunicationError> {
        let agent_id = binding.agent_id.trim();
        if agent_id.is_empty() {
            return Err(CommunicationError::EmptyAgentId);
        }

        binding.agent_id = agent_id.to_string();
        binding.telegram_chat_id = normalize_optional_string(binding.telegram_chat_id);
        binding.discord_thread_id = normalize_optional_string(binding.discord_thread_id);
        binding.in_app_thread_id = normalize_optional_string(binding.in_app_thread_id);

        self.agent_bindings
            .insert(binding.agent_id.clone(), binding.clone());
        Ok(binding)
    }

    pub fn bind_sub_sphere_prism_route(
        &mut self,
        mut binding: SubSpherePrismBinding,
    ) -> Result<SubSpherePrismBinding, CommunicationError> {
        let sub_sphere_id = binding.sub_sphere_id.trim();
        if sub_sphere_id.is_empty() {
            return Err(CommunicationError::EmptySubSphereId);
        }
        let prism_agent_id = binding.prism_agent_id.trim();
        if prism_agent_id.is_empty() {
            return Err(CommunicationError::EmptyAgentId);
        }

        binding.sub_sphere_id = sub_sphere_id.to_string();
        binding.prism_agent_id = prism_agent_id.to_string();
        binding.telegram_chat_id = normalize_optional_string(binding.telegram_chat_id);
        binding.discord_thread_id = normalize_optional_string(binding.discord_thread_id);
        binding.in_app_thread_id = normalize_optional_string(binding.in_app_thread_id);

        self.sub_sphere_bindings
            .insert(binding.sub_sphere_id.clone(), binding.clone());

        self.agent_bindings
            .entry(binding.prism_agent_id.clone())
            .or_insert_with(|| AgentBinding {
                agent_id: binding.prism_agent_id.clone(),
                telegram_chat_id: binding.telegram_chat_id.clone(),
                discord_thread_id: binding.discord_thread_id.clone(),
                in_app_thread_id: binding.in_app_thread_id.clone(),
                is_orchestrator: false,
            });

        Ok(binding)
    }

    pub fn ensure_sub_sphere_binding_for_spawn(
        &mut self,
        sub_sphere_id: &str,
    ) -> Result<SubSpherePrismBinding, CommunicationError> {
        let normalized_sub_sphere_id = sub_sphere_id.trim();
        if normalized_sub_sphere_id.is_empty() {
            return Err(CommunicationError::EmptySubSphereId);
        }

        if let Some(existing) = self.sub_sphere_bindings.get(normalized_sub_sphere_id) {
            return Ok(existing.clone());
        }

        let prism_agent_id = format!("prism-{normalized_sub_sphere_id}");
        let mut discord_thread_id = None;

        if self.discord.enabled && self.discord.auto_spawn_sub_sphere_threads {
            let thread_name = format!("sub-sphere-{normalized_sub_sphere_id}");
            match self.create_discord_thread(&thread_name) {
                Ok(created_thread_id) => {
                    discord_thread_id = Some(created_thread_id);
                    self.discord.last_error = None;
                }
                Err(error) => {
                    self.discord.last_error = Some(error.to_string());
                }
            }
        }

        let binding = SubSpherePrismBinding {
            sub_sphere_id: normalized_sub_sphere_id.to_string(),
            prism_agent_id: prism_agent_id.clone(),
            telegram_chat_id: self.telegram.default_chat_id.clone(),
            discord_thread_id: discord_thread_id.clone(),
            in_app_thread_id: Some(format!("inapp-{normalized_sub_sphere_id}")),
        };

        self.bind_sub_sphere_prism_route(binding)
    }

    pub fn dispatch_to_agent(
        &mut self,
        platform: CommunicationPlatform,
        agent_id: &str,
        message: &str,
    ) -> Result<CommunicationDispatchResult, CommunicationError> {
        let agent_id = normalize_required_agent_id(agent_id)?;
        let content = normalize_required_message(message)?;
        let thread_id = self.resolve_agent_target(platform, &agent_id)?;
        self.dispatch(
            platform,
            &thread_id,
            &agent_id,
            None,
            &content,
            Some("agent dispatch"),
        )
    }

    pub fn dispatch_to_sub_sphere_prism(
        &mut self,
        platform: CommunicationPlatform,
        sub_sphere_id: &str,
        message: &str,
    ) -> Result<CommunicationDispatchResult, CommunicationError> {
        let sub_sphere_id = normalize_required_sub_sphere_id(sub_sphere_id)?;
        let content = normalize_required_message(message)?;

        let binding = if let Some(existing) = self.sub_sphere_bindings.get(&sub_sphere_id) {
            existing.clone()
        } else {
            self.ensure_sub_sphere_binding_for_spawn(&sub_sphere_id)?
        };

        let thread_id = match platform {
            CommunicationPlatform::Telegram => {
                if let Some(chat_id) = binding.telegram_chat_id.clone() {
                    chat_id
                } else {
                    self.resolve_agent_target(platform, &binding.prism_agent_id)?
                }
            }
            CommunicationPlatform::Discord => {
                if let Some(thread_id) = binding.discord_thread_id.clone() {
                    thread_id
                } else if self.discord.auto_spawn_sub_sphere_threads {
                    let created = self.create_discord_thread(&format!("sub-sphere-{sub_sphere_id}"))?;
                    self.discord.last_error = None;

                    if let Some(entry) = self.sub_sphere_bindings.get_mut(&sub_sphere_id) {
                        entry.discord_thread_id = Some(created.clone());
                    }
                    created
                } else {
                    self.resolve_agent_target(platform, &binding.prism_agent_id)?
                }
            }
            CommunicationPlatform::InApp => binding
                .in_app_thread_id
                .clone()
                .unwrap_or_else(|| format!("inapp-{sub_sphere_id}")),
        };

        self.dispatch(
            platform,
            &thread_id,
            &binding.prism_agent_id,
            Some(sub_sphere_id),
            &content,
            Some("sub-sphere prism dispatch"),
        )
    }

    pub fn get_in_app_thread_messages(
        &self,
        thread_id: &str,
        limit: usize,
        offset: usize,
    ) -> Vec<InAppThreadMessage> {
        let normalized_thread = thread_id.trim();
        if normalized_thread.is_empty() {
            return Vec::new();
        }

        self.in_app_threads
            .get(normalized_thread)
            .map(|entries| {
                entries
                    .iter()
                    .skip(offset)
                    .take(limit.max(1))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    }

    pub fn get_telegram_inbox(&self, limit: usize, offset: usize) -> Vec<TelegramInboundRecord> {
        self.telegram_inbox
            .iter()
            .skip(offset)
            .take(limit.max(1))
            .cloned()
            .collect()
    }

    pub fn poll_telegram_updates_once(
        &mut self,
        limit: usize,
    ) -> Result<TelegramUpdatePullResult, CommunicationError> {
        if !self.telegram.enabled {
            return Err(CommunicationError::PlatformDisabled {
                platform: CommunicationPlatform::Telegram,
            });
        }

        if !has_non_empty(&self.telegram.bot_token) {
            return Err(CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Telegram,
                reason: "bot_token is required for Telegram polling".to_string(),
            });
        }

        let normalized_limit = limit.clamp(1, 100);
        let body = json!({
            "offset": self.telegram_next_update_offset,
            "timeout": 1,
            "limit": normalized_limit,
            "allowed_updates": ["message", "edited_message"]
        });
        let payload = self.call_telegram_method_json("getUpdates", &body)?;
        let updates = payload
            .get("result")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                CommunicationError::InvalidApiResponse(
                    "telegram getUpdates response missing result[]".to_string(),
                )
            })?;

        let mut fetched_updates = 0usize;
        let mut processed_updates = 0usize;
        let mut dispatched_messages = 0usize;
        let mut max_update_id = self.telegram_next_update_offset.map(|value| value - 1);

        for update in updates {
            fetched_updates = fetched_updates.saturating_add(1);
            let update_id = update
                .get("update_id")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            max_update_id = Some(max_update_id.map_or(update_id, |current| current.max(update_id)));

            if self.ingest_telegram_update(update, "polling")?.is_some() {
                processed_updates = processed_updates.saturating_add(1);
                dispatched_messages = dispatched_messages.saturating_add(1);
            }
        }

        if let Some(max_update_id) = max_update_id {
            self.telegram_next_update_offset = Some(max_update_id.saturating_add(1));
        }

        Ok(TelegramUpdatePullResult {
            fetched_updates,
            processed_updates,
            dispatched_messages,
            next_offset: self.telegram_next_update_offset,
            note: None,
        })
    }

    pub fn process_telegram_webhook_payload(
        &mut self,
        payload: Value,
    ) -> Result<TelegramWebhookResult, CommunicationError> {
        if !self.telegram.enabled {
            return Err(CommunicationError::PlatformDisabled {
                platform: CommunicationPlatform::Telegram,
            });
        }

        let update_id = payload.get("update_id").and_then(Value::as_i64);
        if let Some(update_id) = update_id {
            self.telegram_next_update_offset = Some(update_id.saturating_add(1));
        }

        let processed_record = self.ingest_telegram_update(&payload, "webhook")?;
        if let Some(record) = processed_record {
            Ok(TelegramWebhookResult {
                processed: true,
                update_id: Some(record.update_id),
                routed_agent_id: Some(record.routed_agent_id),
                routed_thread_id: Some(record.routed_thread_id),
            })
        } else {
            Ok(TelegramWebhookResult {
                processed: false,
                update_id,
                routed_agent_id: None,
                routed_thread_id: None,
            })
        }
    }

    pub fn set_telegram_webhook(
        &mut self,
        webhook_url: String,
        secret_token: Option<String>,
        allowed_updates: Vec<String>,
    ) -> Result<TelegramWebhookConfigResult, CommunicationError> {
        let normalized_url = normalize_optional_string(Some(webhook_url));
        if normalized_url.is_none() {
            return Err(CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Telegram,
                reason: "webhook url must not be empty".to_string(),
            });
        }

        let allowed_updates = if allowed_updates.is_empty() {
            vec!["message".to_string(), "edited_message".to_string()]
        } else {
            allowed_updates
                .into_iter()
                .filter_map(|value| normalize_optional_string(Some(value)))
                .collect::<Vec<_>>()
        };

        self.telegram.use_webhook = true;
        self.telegram.webhook_url = normalized_url.clone();
        self.telegram.webhook_secret_token = normalize_optional_string(secret_token);

        let body = json!({
            "url": normalized_url,
            "secret_token": self.telegram.webhook_secret_token,
            "allowed_updates": allowed_updates,
        });
        let _ = self.call_telegram_method_json("setWebhook", &body)?;
        self.telegram.last_error = None;
        Ok(TelegramWebhookConfigResult {
            applied: true,
            webhook_url: self.telegram.webhook_url.clone(),
            allowed_updates,
        })
    }

    pub fn clear_telegram_webhook(
        &mut self,
    ) -> Result<TelegramWebhookConfigResult, CommunicationError> {
        let existing_url = self.telegram.webhook_url.clone();
        self.telegram.use_webhook = false;
        self.telegram.webhook_url = None;
        self.telegram.webhook_secret_token = None;

        let body = json!({ "drop_pending_updates": false });
        let _ = self.call_telegram_method_json("deleteWebhook", &body)?;
        self.telegram.last_error = None;
        Ok(TelegramWebhookConfigResult {
            applied: true,
            webhook_url: existing_url,
            allowed_updates: Vec::new(),
        })
    }

    pub fn process_discord_gateway_event(
        &mut self,
        payload: Value,
    ) -> Result<DiscordGatewayEventResult, CommunicationError> {
        if !self.discord.enabled {
            return Err(CommunicationError::PlatformDisabled {
                platform: CommunicationPlatform::Discord,
            });
        }

        let op = payload.get("op").and_then(Value::as_i64);
        if let Some(sequence) = payload.get("s").and_then(Value::as_u64) {
            self.discord_gateway_state.last_sequence = Some(sequence);
        }

        let event_type = payload
            .get("t")
            .and_then(Value::as_str)
            .map(ToString::to_string);

        if op != Some(0) {
            return Ok(DiscordGatewayEventResult {
                processed: false,
                event_type,
                routed_agent_id: None,
                routed_thread_id: None,
                note: Some("gateway event ignored because op is not dispatch (0)".to_string()),
            });
        }

        let Some(event_name) = event_type.as_deref() else {
            return Ok(DiscordGatewayEventResult {
                processed: false,
                event_type: None,
                routed_agent_id: None,
                routed_thread_id: None,
                note: Some("dispatch payload missing event type".to_string()),
            });
        };

        self.discord_gateway_state.lifecycle = DiscordGatewayLifecycle::Connected;
        self.discord_gateway_state.last_error = None;

        match event_name {
            "READY" => {
                self.discord_gateway_state.session_id = payload
                    .get("d")
                    .and_then(Value::as_object)
                    .and_then(|data| data.get("session_id"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string);
                Ok(DiscordGatewayEventResult {
                    processed: true,
                    event_type,
                    routed_agent_id: None,
                    routed_thread_id: None,
                    note: Some("gateway READY session recorded".to_string()),
                })
            }
            "RESUMED" => Ok(DiscordGatewayEventResult {
                processed: true,
                event_type,
                routed_agent_id: None,
                routed_thread_id: None,
                note: Some("gateway session resumed".to_string()),
            }),
            "INTERACTION_CREATE" => {
                let interaction_payload = payload.get("d").cloned().ok_or_else(|| {
                    CommunicationError::InvalidApiResponse(
                        "gateway interaction event missing d payload".to_string(),
                    )
                })?;
                let ack = self.defer_discord_interaction(interaction_payload)?;
                Ok(DiscordGatewayEventResult {
                    processed: true,
                    event_type,
                    routed_agent_id: Some(ack.routed_agent_id),
                    routed_thread_id: Some(ack.routed_thread_id),
                    note: Some("interaction deferred for async completion".to_string()),
                })
            }
            "MESSAGE_CREATE" => {
                let message = payload.get("d").and_then(Value::as_object).ok_or_else(|| {
                    CommunicationError::InvalidApiResponse(
                        "gateway message event missing d object".to_string(),
                    )
                })?;

                let is_bot_author = message
                    .get("author")
                    .and_then(Value::as_object)
                    .and_then(|author| author.get("bot"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                if is_bot_author {
                    return Ok(DiscordGatewayEventResult {
                        processed: false,
                        event_type,
                        routed_agent_id: None,
                        routed_thread_id: None,
                        note: Some("ignored bot-authored message".to_string()),
                    });
                }

                let raw_text = message
                    .get("content")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .unwrap_or_default();
                if raw_text.is_empty() {
                    return Ok(DiscordGatewayEventResult {
                        processed: false,
                        event_type,
                        routed_agent_id: None,
                        routed_thread_id: None,
                        note: Some("ignored empty message content".to_string()),
                    });
                }

                let channel_id =
                    value_to_string_id(message.get("channel_id")).ok_or_else(|| {
                        CommunicationError::InvalidApiResponse(
                            "gateway message missing channel_id".to_string(),
                        )
                    })?;

                let (agent_override, normalized_text) = parse_agent_override_from_message(raw_text);
                let routed_agent_id =
                    self.resolve_inbound_discord_agent(&channel_id, agent_override.as_deref());
                let routed_thread_id =
                    self.resolve_agent_target(CommunicationPlatform::InApp, &routed_agent_id)?;
                let _ = self.dispatch(
                    CommunicationPlatform::InApp,
                    &routed_thread_id,
                    &routed_agent_id,
                    None,
                    &format!("[discord] {normalized_text}"),
                    Some("discord inbound gateway"),
                )?;

                Ok(DiscordGatewayEventResult {
                    processed: true,
                    event_type,
                    routed_agent_id: Some(routed_agent_id),
                    routed_thread_id: Some(routed_thread_id),
                    note: Some("discord message routed to in-app thread".to_string()),
                })
            }
            _ => Ok(DiscordGatewayEventResult {
                processed: false,
                event_type,
                routed_agent_id: None,
                routed_thread_id: None,
                note: Some("unsupported discord dispatch event".to_string()),
            }),
        }
    }

    pub fn probe_discord_gateway(
        &mut self,
    ) -> Result<DiscordGatewayProbeResult, CommunicationError> {
        if !self.discord.enabled {
            return Err(CommunicationError::PlatformDisabled {
                platform: CommunicationPlatform::Discord,
            });
        }

        self.discord_gateway_state.lifecycle = DiscordGatewayLifecycle::Connecting;
        let payload = self.call_discord_get_json("/gateway/bot")?;
        let gateway_url = payload
            .get("url")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| "wss://gateway.discord.gg/?v=10&encoding=json".to_string());
        let shard_count = payload
            .get("shards")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let session_start_remaining = payload
            .get("session_start_limit")
            .and_then(|value| value.get("remaining"))
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());

        self.discord_gateway_state.lifecycle = DiscordGatewayLifecycle::Connected;
        self.discord_gateway_state.gateway_url = Some(gateway_url.clone());
        self.discord_gateway_state.shard_count = shard_count;
        self.discord_gateway_state.session_start_limit_remaining = session_start_remaining;
        self.discord_gateway_state.last_error = None;

        Ok(DiscordGatewayProbeResult {
            lifecycle: DiscordGatewayLifecycle::Connected,
            gateway_url,
            shard_count,
            session_start_limit_remaining: session_start_remaining,
            live_probe: true,
            note: None,
        })
    }

    pub fn record_discord_gateway_heartbeat(
        &mut self,
        sequence: Option<u64>,
    ) -> DiscordGatewayState {
        self.discord_gateway_state.last_heartbeat_epoch_ms = Some(now_epoch_millis());
        if let Some(sequence) = sequence {
            self.discord_gateway_state.last_sequence = Some(sequence);
        }
        if matches!(
            self.discord_gateway_state.lifecycle,
            DiscordGatewayLifecycle::Disconnected | DiscordGatewayLifecycle::Connecting
        ) {
            self.discord_gateway_state.lifecycle = DiscordGatewayLifecycle::Connected;
        }
        self.discord_gateway_state.clone()
    }

    pub fn register_discord_gateway_close(&mut self, close_code: u16) -> DiscordGatewayCloseResult {
        let (lifecycle, resume_recommended, note) = match close_code {
            4004 => (
                DiscordGatewayLifecycle::Fatal,
                false,
                "authentication failed; refresh discord bot token".to_string(),
            ),
            4013 | 4014 => (
                DiscordGatewayLifecycle::Fatal,
                false,
                "gateway intents invalid/disallowed; fix intent configuration".to_string(),
            ),
            _ => (
                DiscordGatewayLifecycle::Reconnecting,
                true,
                "reconnect and attempt session resume".to_string(),
            ),
        };

        self.discord_gateway_state.lifecycle = lifecycle;
        self.discord_gateway_state.last_close_code = Some(close_code);
        self.discord_gateway_state.resume_recommended = resume_recommended;

        DiscordGatewayCloseResult {
            close_code,
            lifecycle,
            resume_recommended,
            note,
        }
    }

    pub fn defer_discord_interaction(
        &mut self,
        payload: Value,
    ) -> Result<DiscordDeferredInteractionAck, CommunicationError> {
        let interaction_id = payload
            .get("id")
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())))
            .ok_or_else(|| {
                CommunicationError::InvalidApiResponse("interaction payload missing id".to_string())
            })?;
        let application_id = payload
            .get("application_id")
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())))
            .ok_or_else(|| {
                CommunicationError::InvalidApiResponse(
                    "interaction payload missing application_id".to_string(),
                )
            })?;
        let token = payload
            .get("token")
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())))
            .ok_or_else(|| {
                CommunicationError::InvalidApiResponse(
                    "interaction payload missing token".to_string(),
                )
            })?;
        let command_name = payload
            .get("data")
            .and_then(|data| data.get("name"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| "unknown".to_string());

        let routed_agent_id = extract_discord_option_string(&payload, "agent_id")
            .or_else(|| extract_discord_option_string(&payload, "agent"))
            .or_else(|| {
                self.orchestrator_binding()
                    .map(|binding| binding.agent_id.clone())
            })
            .unwrap_or_else(|| "agent-0".to_string());
        let routed_agent_id = normalize_required_agent_id(&routed_agent_id)?;
        let routed_thread_id =
            self.resolve_agent_target(CommunicationPlatform::InApp, &routed_agent_id)?;

        if let Some(question) = extract_discord_option_string(&payload, "question")
            .or_else(|| extract_discord_option_string(&payload, "query"))
        {
            if !question.trim().is_empty() {
                let inbound = format!("[discord /{command_name}] {}", question.trim());
                let _ = self.dispatch(
                    CommunicationPlatform::InApp,
                    &routed_thread_id,
                    &routed_agent_id,
                    None,
                    &inbound,
                    Some("discord interaction ingress"),
                )?;
            }
        }

        let created_at = now_epoch_millis();
        self.discord_pending_interactions.insert(
            interaction_id.clone(),
            DiscordPendingInteraction {
                interaction_id: interaction_id.clone(),
                application_id,
                token,
                command_name: command_name.clone(),
                routed_agent_id: routed_agent_id.clone(),
                routed_thread_id: routed_thread_id.clone(),
                created_at_epoch_ms: created_at,
            },
        );

        Ok(DiscordDeferredInteractionAck {
            interaction_id,
            command_name,
            routed_agent_id,
            routed_thread_id,
            deferred_response_type: 5,
            token_expires_at_epoch_ms: created_at.saturating_add(DISCORD_INTERACTION_TOKEN_TTL_MS),
        })
    }

    pub fn complete_discord_interaction(
        &mut self,
        interaction_id: &str,
        response_text: &str,
        ephemeral: bool,
    ) -> Result<DiscordInteractionCompletionResult, CommunicationError> {
        let interaction_id = interaction_id.trim();
        if interaction_id.is_empty() {
            return Err(CommunicationError::InvalidApiResponse(
                "interaction_id must not be empty".to_string(),
            ));
        }
        let response_text = normalize_required_message(response_text)?;

        let pending = self
            .discord_pending_interactions
            .remove(interaction_id)
            .ok_or_else(|| {
                CommunicationError::InvalidApiResponse(
                    "interaction_id not found in pending interaction store".to_string(),
                )
            })?;
        let now = now_epoch_millis();
        if now.saturating_sub(pending.created_at_epoch_ms) > DISCORD_INTERACTION_TOKEN_TTL_MS {
            return Err(CommunicationError::InvalidApiResponse(
                "interaction token expired (older than 15 minutes)".to_string(),
            ));
        }

        let endpoint = format!(
            "{}/webhooks/{}/{}/messages/@original",
            DISCORD_API_BASE_URL, pending.application_id, pending.token
        );
        let mut body = json!({ "content": response_text });
        if ephemeral {
            body["flags"] = json!(64);
        }

        let payload = self.discord_json_request_with_retry(
            reqwest::Method::PATCH,
            &endpoint,
            Some(&body),
        )?;
        let message_id = payload
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("discord-followup-{}", now_epoch_millis()));
        self.discord.last_error = None;
        Ok(DiscordInteractionCompletionResult {
            interaction_id: pending.interaction_id,
            message_id,
            delivered_live: true,
            routed_thread_id: pending.routed_thread_id,
        })
    }

    pub fn send_telegram_typing_indicator(
        &mut self,
        chat_id: String,
    ) -> Result<TypingIndicatorResult, CommunicationError> {
        let chat_id = normalize_optional_string(Some(chat_id)).ok_or_else(|| {
            CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Telegram,
                reason: "chat_id must not be empty".to_string(),
            }
        })?;

        let body = json!({
            "chat_id": chat_id,
            "action": "typing"
        });
        let _ = self.call_telegram_method_json("sendChatAction", &body)?;
        Ok(TypingIndicatorResult {
            platform: CommunicationPlatform::Telegram,
            target_id: chat_id,
            delivered_live: true,
        })
    }

    pub fn send_discord_typing_indicator(
        &mut self,
        channel_id: String,
    ) -> Result<TypingIndicatorResult, CommunicationError> {
        let channel_id = normalize_optional_string(Some(channel_id)).ok_or_else(|| {
            CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Discord,
                reason: "channel_id must not be empty".to_string(),
            }
        })?;

        let endpoint = format!("{}/channels/{}/typing", DISCORD_API_BASE_URL, channel_id);
        let _ = self.discord_json_request_with_retry(reqwest::Method::POST, &endpoint, None)?;
        Ok(TypingIndicatorResult {
            platform: CommunicationPlatform::Discord,
            target_id: channel_id,
            delivered_live: true,
        })
    }

    fn ingest_telegram_update(
        &mut self,
        update: &Value,
        source: &str,
    ) -> Result<Option<TelegramInboundRecord>, CommunicationError> {
        let update_id = update
            .get("update_id")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let message = update
            .get("message")
            .or_else(|| update.get("edited_message"))
            .and_then(Value::as_object);
        let Some(message) = message else {
            return Ok(None);
        };

        let raw_text = message
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();
        if raw_text.is_empty() {
            return Ok(None);
        }

        let chat_id = match message.get("chat").and_then(Value::as_object) {
            Some(chat) => value_to_string_id(chat.get("id")),
            None => None,
        }
        .ok_or_else(|| {
            CommunicationError::InvalidApiResponse(
                "telegram update missing message.chat.id".to_string(),
            )
        })?;
        let from_id = message
            .get("from")
            .and_then(Value::as_object)
            .and_then(|from| value_to_string_id(from.get("id")));

        let (agent_override, normalized_text) = parse_agent_override_from_message(raw_text);
        let routed_agent_id =
            self.resolve_inbound_telegram_agent(&chat_id, agent_override.as_deref());
        let routed_thread_id =
            self.resolve_agent_target(CommunicationPlatform::InApp, &routed_agent_id)?;

        let _ = self.dispatch(
            CommunicationPlatform::InApp,
            &routed_thread_id,
            &routed_agent_id,
            None,
            &format!("[telegram] {normalized_text}"),
            Some("telegram inbound"),
        )?;

        let record = TelegramInboundRecord {
            update_id,
            chat_id,
            from_id,
            text: normalized_text,
            routed_agent_id,
            routed_thread_id,
            source: source.to_string(),
            received_at_epoch_ms: now_epoch_millis(),
        };

        self.telegram_inbox.push(record.clone());
        if self.telegram_inbox.len() > TELEGRAM_INBOX_MAX_RECORDS {
            let drop_count = self
                .telegram_inbox
                .len()
                .saturating_sub(TELEGRAM_INBOX_MAX_RECORDS);
            self.telegram_inbox.drain(0..drop_count);
        }

        Ok(Some(record))
    }

    fn resolve_inbound_telegram_agent(
        &self,
        chat_id: &str,
        agent_override: Option<&str>,
    ) -> String {
        if let Some(agent_override) = agent_override {
            return agent_override.to_string();
        }

        if let Some(binding) = self
            .agent_bindings
            .values()
            .find(|binding| binding.telegram_chat_id.as_deref() == Some(chat_id))
        {
            return binding.agent_id.clone();
        }

        if matches!(self.telegram.routing_mode, AgentRoutingMode::Orchestrator) {
            if let Some(binding) = self.orchestrator_binding() {
                return binding.agent_id.clone();
            }
        }

        "agent-0".to_string()
    }

    fn resolve_inbound_discord_agent(
        &self,
        channel_id: &str,
        agent_override: Option<&str>,
    ) -> String {
        if let Some(agent_override) = agent_override {
            return agent_override.to_string();
        }

        if let Some(binding) = self
            .agent_bindings
            .values()
            .find(|binding| binding.discord_thread_id.as_deref() == Some(channel_id))
        {
            return binding.agent_id.clone();
        }

        if matches!(self.discord.routing_mode, AgentRoutingMode::Orchestrator) {
            if let Some(binding) = self.orchestrator_binding() {
                return binding.agent_id.clone();
            }
        }

        "agent-0".to_string()
    }

    fn call_telegram_method_json(
        &mut self,
        method: &str,
        body: &Value,
    ) -> Result<Value, CommunicationError> {
        let bot_token = self
            .telegram
            .bot_token
            .as_ref()
            .and_then(|value| normalize_optional_string(Some(value.clone())))
            .ok_or_else(|| CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Telegram,
                reason: "bot_token is required for Discord API access".to_string(),
            })?;
        let endpoint = format!("{}/bot{}/{}", TELEGRAM_API_BASE_URL, bot_token, method);
        self.telegram_json_request_with_retry(&endpoint, body)
    }

    fn telegram_json_request_with_retry(
        &mut self,
        endpoint: &str,
        body: &Value,
    ) -> Result<Value, CommunicationError> {
        let mut last_error = None;
        for attempt in 1..=MAX_HTTP_ATTEMPTS {
            self.enforce_send_rate_limits(CommunicationPlatform::Telegram, "telegram-global");
            let response = Self::http_client()?
                .post(endpoint)
                .header("content-type", "application/json")
                .json(body)
                .send();

            match response {
                Ok(response) => {
                    let status = response.status();
                    let retry_after_header = parse_retry_after_header(response.headers());
                    let text = response
                        .text()
                        .map_err(|error| CommunicationError::HttpTransport(error.to_string()))?;
                    if status.is_success() {
                        return serde_json::from_str::<Value>(&text).map_err(|error| {
                            CommunicationError::InvalidApiResponse(error.to_string())
                        });
                    }

                    let retry_after_body = parse_retry_after_body(&text);
                    let retry_after_ms = retry_after_header.or(retry_after_body);
                    let retryable = status.as_u16() == 429 || status.is_server_error();
                    if retryable && attempt < MAX_HTTP_ATTEMPTS {
                        sleep_with_backoff(attempt, retry_after_ms);
                        continue;
                    }

                    return Err(CommunicationError::HttpStatus {
                        status: status.as_u16(),
                        body: trim_error_body(&text, 300),
                    });
                }
                Err(error) => {
                    last_error = Some(error.to_string());
                    if attempt < MAX_HTTP_ATTEMPTS {
                        sleep_with_backoff(attempt, None);
                        continue;
                    }
                }
            }
        }

        Err(CommunicationError::HttpTransport(
            last_error.unwrap_or_else(|| {
                "telegram request failed with unknown transport error".to_string()
            }),
        ))
    }

    fn call_discord_get_json(&mut self, route: &str) -> Result<Value, CommunicationError> {
        let endpoint = format!("{}{}", DISCORD_API_BASE_URL, route);
        self.discord_json_request_with_retry(reqwest::Method::GET, &endpoint, None)
    }

    fn discord_json_request_with_retry(
        &mut self,
        method: reqwest::Method,
        endpoint: &str,
        body: Option<&Value>,
    ) -> Result<Value, CommunicationError> {
        let bot_token = self
            .discord
            .bot_token
            .as_ref()
            .and_then(|value| normalize_optional_string(Some(value.clone())))
            .ok_or_else(|| CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Discord,
                reason: "bot_token is required for Telegram API access".to_string(),
            })?;

        let target_hint = endpoint
            .split("/channels/")
            .nth(1)
            .and_then(|tail| tail.split('/').next())
            .unwrap_or("discord-global");

        let mut last_error = None;
        for attempt in 1..=MAX_HTTP_ATTEMPTS {
            self.enforce_send_rate_limits(CommunicationPlatform::Discord, target_hint);
            let client = Self::http_client()?;
            let mut request = client
                .request(method.clone(), endpoint)
                .header("authorization", format!("Bot {bot_token}"))
                .header("content-type", "application/json");
            if let Some(body) = body {
                request = request.json(body);
            }

            match request.send() {
                Ok(response) => {
                    let status = response.status();
                    let retry_after_header = parse_retry_after_header(response.headers());
                    let text = response
                        .text()
                        .map_err(|error| CommunicationError::HttpTransport(error.to_string()))?;
                    if status.is_success() {
                        if text.trim().is_empty() {
                            return Ok(json!({}));
                        }
                        return serde_json::from_str::<Value>(&text).map_err(|error| {
                            CommunicationError::InvalidApiResponse(error.to_string())
                        });
                    }

                    let retry_after_body = parse_retry_after_body(&text);
                    let retry_after_ms = retry_after_header.or(retry_after_body);
                    let retryable = status.as_u16() == 429 || status.is_server_error();
                    if retryable && attempt < MAX_HTTP_ATTEMPTS {
                        sleep_with_backoff(attempt, retry_after_ms);
                        continue;
                    }

                    return Err(CommunicationError::HttpStatus {
                        status: status.as_u16(),
                        body: trim_error_body(&text, 300),
                    });
                }
                Err(error) => {
                    last_error = Some(error.to_string());
                    if attempt < MAX_HTTP_ATTEMPTS {
                        sleep_with_backoff(attempt, None);
                        continue;
                    }
                }
            }
        }

        Err(CommunicationError::HttpTransport(
            last_error.unwrap_or_else(|| {
                "discord request failed with unknown transport error".to_string()
            }),
        ))
    }

    fn enforce_send_rate_limits(&mut self, platform: CommunicationPlatform, target: &str) {
        match platform {
            CommunicationPlatform::Telegram => {
                self.enforce_rate_window("telegram-global", 30, 1_000);
                self.enforce_rate_window(&format!("telegram-chat-{target}"), 1, 1_000);
            }
            CommunicationPlatform::Discord => {
                self.enforce_rate_window("discord-global", 50, 1_000);
                self.enforce_rate_window(&format!("discord-channel-{target}"), 5, 5_000);
            }
            CommunicationPlatform::InApp => {}
        }
    }

    fn enforce_rate_window(&mut self, key: &str, max_count: u32, window_ms: u128) {
        let now = now_epoch_millis();
        let state = self
            .rate_limit_windows
            .entry(key.to_string())
            .or_insert_with(|| RateLimitWindowState {
                window_start_epoch_ms: now,
                sent_count: 0,
            });

        if now.saturating_sub(state.window_start_epoch_ms) >= window_ms {
            state.window_start_epoch_ms = now;
            state.sent_count = 0;
        }

        if state.sent_count >= max_count {
            let elapsed = now.saturating_sub(state.window_start_epoch_ms);
            let wait_ms = window_ms.saturating_sub(elapsed).saturating_add(5);
            let wait_ms = u64::try_from(wait_ms).unwrap_or(0);
            if wait_ms > 0 {
                thread::sleep(Duration::from_millis(wait_ms));
            }
            state.window_start_epoch_ms = now_epoch_millis();
            state.sent_count = 0;
        }

        state.sent_count = state.sent_count.saturating_add(1);
    }

    fn resolve_agent_target(
        &self,
        platform: CommunicationPlatform,
        agent_id: &str,
    ) -> Result<String, CommunicationError> {
        match platform {
            CommunicationPlatform::Telegram => {
                if !self.telegram.enabled {
                    return Err(CommunicationError::PlatformDisabled { platform });
                }

                let direct = self
                    .agent_bindings
                    .get(agent_id)
                    .and_then(|binding| binding.telegram_chat_id.clone());
                let target = match self.telegram.routing_mode {
                    AgentRoutingMode::PerAgent => {
                        direct.or_else(|| self.telegram.default_chat_id.clone())
                    }
                    AgentRoutingMode::Orchestrator => self
                        .telegram
                        .orchestrator_chat_id
                        .clone()
                        .or_else(|| {
                            self.orchestrator_binding()
                                .and_then(|binding| binding.telegram_chat_id.clone())
                        })
                        .or_else(|| self.telegram.default_chat_id.clone()),
                };

                target.ok_or_else(|| CommunicationError::MissingRoutingTarget {
                    platform,
                    reason: "set default_chat_id, per-agent chat id, or orchestrator_chat_id"
                        .to_string(),
                })
            }
            CommunicationPlatform::Discord => {
                if !self.discord.enabled {
                    return Err(CommunicationError::PlatformDisabled { platform });
                }

                let direct = self
                    .agent_bindings
                    .get(agent_id)
                    .and_then(|binding| binding.discord_thread_id.clone());
                let target = match self.discord.routing_mode {
                    AgentRoutingMode::PerAgent => {
                        direct.or_else(|| self.discord.default_channel_id.clone())
                    }
                    AgentRoutingMode::Orchestrator => self
                        .discord
                        .orchestrator_thread_id
                        .clone()
                        .or_else(|| {
                            self.orchestrator_binding()
                                .and_then(|binding| binding.discord_thread_id.clone())
                        })
                        .or_else(|| self.discord.default_channel_id.clone()),
                };

                target.ok_or_else(|| CommunicationError::MissingRoutingTarget {
                    platform,
                    reason:
                        "set default_channel_id, per-agent thread id, or orchestrator_thread_id"
                            .to_string(),
                })
            }
            CommunicationPlatform::InApp => {
                if let Some(binding) = self.agent_bindings.get(agent_id) {
                    if let Some(thread_id) = binding.in_app_thread_id.clone() {
                        return Ok(thread_id);
                    }
                }
                Ok(format!("inapp-agent-{agent_id}"))
            }
        }
    }

    fn orchestrator_binding(&self) -> Option<&AgentBinding> {
        self.agent_bindings
            .values()
            .find(|binding| binding.is_orchestrator)
    }

    fn dispatch(
        &mut self,
        platform: CommunicationPlatform,
        thread_id: &str,
        agent_id: &str,
        sub_sphere_id: Option<String>,
        message: &str,
        note: Option<&str>,
    ) -> Result<CommunicationDispatchResult, CommunicationError> {
        match platform {
            CommunicationPlatform::InApp => {
                let message_id = self.next_message_id("inapp");
                let entry = InAppThreadMessage {
                    message_id: message_id.clone(),
                    thread_id: thread_id.to_string(),
                    agent_id: agent_id.to_string(),
                    sub_sphere_id: sub_sphere_id.clone(),
                    sent_at_epoch_ms: now_epoch_millis(),
                    content: message.to_string(),
                };
                self.in_app_threads
                    .entry(thread_id.to_string())
                    .or_default()
                    .push(entry);

                Ok(CommunicationDispatchResult {
                    platform,
                    agent_id: agent_id.to_string(),
                    sub_sphere_id,
                    thread_id: thread_id.to_string(),
                    message_id,
                    delivered_live: true,
                    note: note.map(ToString::to_string),
                })
            }
            CommunicationPlatform::Telegram => {
                let message_id = self.send_telegram_message(thread_id, message)?;
                self.telegram.last_error = None;
                Ok(CommunicationDispatchResult {
                    platform,
                    agent_id: agent_id.to_string(),
                    sub_sphere_id,
                    thread_id: thread_id.to_string(),
                    message_id,
                    delivered_live: true,
                    note: note.map(ToString::to_string),
                })
            }
            CommunicationPlatform::Discord => {
                let message_id = self.send_discord_message(thread_id, message)?;
                self.discord.last_error = None;
                Ok(CommunicationDispatchResult {
                    platform,
                    agent_id: agent_id.to_string(),
                    sub_sphere_id,
                    thread_id: thread_id.to_string(),
                    message_id,
                    delivered_live: true,
                    note: note.map(ToString::to_string),
                })
            }
        }
    }

    fn send_telegram_message(
        &mut self,
        chat_id: &str,
        message: &str,
    ) -> Result<String, CommunicationError> {
        let body = json!({
            "chat_id": chat_id,
            "text": message
        });
        let payload = self.call_telegram_method_json("sendMessage", &body)?;
        let message_id = payload
            .get("result")
            .and_then(|result| result.get("message_id"))
            .and_then(Value::as_i64)
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("telegram-{}", now_epoch_millis()));
        Ok(message_id)
    }

    fn send_discord_message(
        &mut self,
        channel_or_thread_id: &str,
        message: &str,
    ) -> Result<String, CommunicationError> {
        let endpoint = format!(
            "{}/channels/{}/messages",
            DISCORD_API_BASE_URL, channel_or_thread_id
        );
        let body = json!({ "content": message });
        let payload =
            self.discord_json_request_with_retry(reqwest::Method::POST, &endpoint, Some(&body))?;
        let message_id = payload
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("discord-{}", now_epoch_millis()));
        Ok(message_id)
    }

    fn create_discord_thread(&mut self, thread_name: &str) -> Result<String, CommunicationError> {
        let channel_id = self.discord.default_channel_id.clone().ok_or_else(|| {
            CommunicationError::MissingRoutingTarget {
                platform: CommunicationPlatform::Discord,
                reason: "default_channel_id is required to auto-create threads".to_string(),
            }
        })?;
        let endpoint = format!("{}/channels/{}/threads", DISCORD_API_BASE_URL, channel_id);
        let body = json!({
            "name": thread_name,
            "auto_archive_duration": 1440,
            "type": 12,
            "invitable": true
        });
        let payload =
            self.discord_json_request_with_retry(reqwest::Method::POST, &endpoint, Some(&body))?;
        payload
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .ok_or_else(|| {
                CommunicationError::InvalidApiResponse(
                    "discord thread creation response missing id".to_string(),
                )
            })
    }

    fn next_message_id(&mut self, prefix: &str) -> String {
        self.message_counter = self.message_counter.saturating_add(1);
        format!("{prefix}-{}-{}", now_epoch_millis(), self.message_counter)
    }

    fn http_client() -> Result<Client, CommunicationError> {
        Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| CommunicationError::HttpTransport(error.to_string()))
    }
}

fn value_to_string_id(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(value)) => normalize_optional_string(Some(value.to_string())),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn parse_agent_override_from_message(message: &str) -> (Option<String>, String) {
    let trimmed = message.trim();
    let mut parts = trimmed.split_whitespace();
    let first = parts.next();
    let second = parts.next();

    if matches!(first, Some("/agent" | "/a" | "@agent")) {
        if let Some(agent) =
            second.and_then(|value| normalize_optional_string(Some(value.to_string())))
        {
            let mut remainder = parts.collect::<Vec<_>>().join(" ");
            if remainder.trim().is_empty() {
                remainder = format!("Message routed to {agent}");
            }
            return (Some(agent), remainder);
        }
    }

    (None, trimmed.to_string())
}

fn extract_discord_option_string(payload: &Value, option_name: &str) -> Option<String> {
    let options = payload
        .get("data")
        .and_then(|data| data.get("options"))
        .and_then(Value::as_array)?;

    options.iter().find_map(|option| {
        let name_matches = option
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| name.eq_ignore_ascii_case(option_name));
        if !name_matches {
            return None;
        }

        match option.get("value") {
            Some(Value::String(value)) => normalize_optional_string(Some(value.clone())),
            Some(Value::Number(value)) => Some(value.to_string()),
            _ => None,
        }
    })
}

fn parse_retry_after_header(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_retry_after_to_millis)
}

fn parse_retry_after_body(body: &str) -> Option<u64> {
    let payload = serde_json::from_str::<Value>(body).ok()?;
    payload.get("retry_after").and_then(|value| match value {
        Value::Number(number) => number
            .as_f64()
            .map(|seconds| (seconds.max(0.0) * 1000.0) as u64),
        Value::String(text) => parse_retry_after_to_millis(text),
        _ => None,
    })
}

fn parse_retry_after_to_millis(text: &str) -> Option<u64> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(seconds_float) = trimmed.parse::<f64>() {
        let millis = (seconds_float.max(0.0) * 1000.0) as u64;
        return Some(millis);
    }
    if let Ok(seconds_int) = trimmed.parse::<u64>() {
        return Some(seconds_int.saturating_mul(1000));
    }
    None
}

fn sleep_with_backoff(attempt: u32, retry_after_ms: Option<u64>) {
    let fallback =
        HTTP_BACKOFF_BASE_MS.saturating_mul(2u64.saturating_pow(attempt.saturating_sub(1)));
    let millis = retry_after_ms.unwrap_or(fallback).clamp(50, 10_000);
    thread::sleep(Duration::from_millis(millis));
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|candidate| {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_required_agent_id(agent_id: &str) -> Result<String, CommunicationError> {
    let trimmed = agent_id.trim();
    if trimmed.is_empty() {
        Err(CommunicationError::EmptyAgentId)
    } else {
        Ok(trimmed.to_string())
    }
}

fn normalize_required_sub_sphere_id(sub_sphere_id: &str) -> Result<String, CommunicationError> {
    let trimmed = sub_sphere_id.trim();
    if trimmed.is_empty() {
        Err(CommunicationError::EmptySubSphereId)
    } else {
        Ok(trimmed.to_string())
    }
}

fn normalize_required_message(message: &str) -> Result<String, CommunicationError> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        Err(CommunicationError::EmptyMessage)
    } else {
        Ok(trimmed.to_string())
    }
}

fn has_non_empty(value: &Option<String>) -> bool {
    value
        .as_deref()
        .is_some_and(|candidate| !candidate.trim().is_empty())
}

fn now_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn trim_error_body(body: &str, limit: usize) -> String {
    let trimmed = body.trim();
    if trimmed.len() <= limit {
        return trimmed.to_string();
    }
    let mut clipped = trimmed.chars().take(limit).collect::<String>();
    clipped.push_str("...");
    clipped
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn telegram_orchestrator_mode_routes_to_single_chat() {
        let mut hub = CommunicationHub::new();
        hub.update_telegram_config(TelegramIntegrationConfig {
            enabled: true,
            bot_token: None,
            default_chat_id: Some("default-chat".to_string()),
            orchestrator_chat_id: Some("orchestrator-chat".to_string()),
            routing_mode: AgentRoutingMode::Orchestrator,
            use_webhook: false,
            webhook_url: None,
            webhook_secret_token: None,
            last_error: None,
        });
        hub.bind_agent_route(AgentBinding {
            agent_id: "agent-0".to_string(),
            telegram_chat_id: Some("agent-zero".to_string()),
            discord_thread_id: None,
            in_app_thread_id: None,
            is_orchestrator: true,
        })
        .expect("binding should succeed");

        let routed = hub
            .resolve_agent_target(CommunicationPlatform::Telegram, "agent-9")
            .expect("route should resolve");
        assert_eq!(routed, "orchestrator-chat");
    }

    #[test]
    fn sub_sphere_spawn_creates_prism_binding_and_discord_thread() {
        let mut hub = CommunicationHub::new();
        hub.update_discord_config(DiscordIntegrationConfig {
            enabled: true,
            bot_token: None,
            guild_id: Some("guild-1".to_string()),
            default_channel_id: Some("channel-root".to_string()),
            orchestrator_thread_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            auto_spawn_sub_sphere_threads: true,
            last_error: None,
        });

        let binding = hub
            .ensure_sub_sphere_binding_for_spawn("ss-123")
            .expect("sub-sphere binding should be created");
        assert_eq!(binding.sub_sphere_id, "ss-123");
        assert_eq!(binding.prism_agent_id, "prism-ss-123");
        assert!(binding.discord_thread_id.is_none());
        assert!(hub.discord.last_error.is_some());
    }

    #[test]
    fn dispatch_to_in_app_thread_records_messages() {
        let mut hub = CommunicationHub::new();
        hub.bind_agent_route(AgentBinding {
            agent_id: "agent-2".to_string(),
            telegram_chat_id: None,
            discord_thread_id: None,
            in_app_thread_id: Some("inapp-thread-2".to_string()),
            is_orchestrator: false,
        })
        .expect("binding should succeed");

        let result = hub
            .dispatch_to_agent(CommunicationPlatform::InApp, "agent-2", "hello lens")
            .expect("in-app dispatch should succeed");
        assert_eq!(result.thread_id, "inapp-thread-2");
        assert!(result.delivered_live);

        let entries = hub.get_in_app_thread_messages("inapp-thread-2", 20, 0);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "hello lens");
        assert_eq!(entries[0].agent_id, "agent-2");
    }

    #[test]
    fn status_redacts_tokens_but_shows_configuration() {
        let mut hub = CommunicationHub::new();
        hub.update_telegram_config(TelegramIntegrationConfig {
            enabled: true,
            bot_token: Some("telegram-token-secret".to_string()),
            default_chat_id: Some("chat-a".to_string()),
            orchestrator_chat_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            use_webhook: true,
            webhook_url: Some("https://example.com/tg".to_string()),
            webhook_secret_token: Some("secret".to_string()),
            last_error: None,
        });

        let status = hub.status();
        assert!(status.telegram.enabled);
        assert!(status.telegram.has_bot_token);
        assert!(status.telegram.configured);
        assert!(status.telegram.use_webhook);
        assert_eq!(
            status.telegram.webhook_url.as_deref(),
            Some("https://example.com/tg")
        );
        assert_eq!(status.telegram.default_chat_id.as_deref(), Some("chat-a"));
    }

    #[test]
    fn telegram_webhook_payload_is_ingested_and_routed_to_in_app() {
        let mut hub = CommunicationHub::new();
        hub.update_telegram_config(TelegramIntegrationConfig {
            enabled: true,
            bot_token: None,
            default_chat_id: Some("chat-default".to_string()),
            orchestrator_chat_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            use_webhook: true,
            webhook_url: Some("https://example.com/webhook".to_string()),
            webhook_secret_token: None,
            last_error: None,
        });
        hub.bind_agent_route(AgentBinding {
            agent_id: "agent-17".to_string(),
            telegram_chat_id: Some("12345".to_string()),
            discord_thread_id: None,
            in_app_thread_id: Some("inapp-agent-17".to_string()),
            is_orchestrator: false,
        })
        .expect("agent binding should succeed");

        let webhook = json!({
            "update_id": 777,
            "message": {
                "chat": { "id": 12345 },
                "from": { "id": 67890 },
                "text": "status please"
            }
        });
        let result = hub
            .process_telegram_webhook_payload(webhook)
            .expect("webhook payload should process");
        assert!(result.processed);
        assert_eq!(result.routed_agent_id.as_deref(), Some("agent-17"));

        let inbox = hub.get_telegram_inbox(10, 0);
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].update_id, 777);
        assert_eq!(inbox[0].routed_agent_id, "agent-17");

        let inapp = hub.get_in_app_thread_messages("inapp-agent-17", 10, 0);
        assert_eq!(inapp.len(), 1);
        assert!(inapp[0].content.contains("[telegram]"));
    }

    #[test]
    fn discord_gateway_message_create_is_ingested_and_routed_to_in_app() {
        let mut hub = CommunicationHub::new();
        hub.update_discord_config(DiscordIntegrationConfig {
            enabled: true,
            bot_token: None,
            guild_id: Some("guild-77".to_string()),
            default_channel_id: Some("channel-default".to_string()),
            orchestrator_thread_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            auto_spawn_sub_sphere_threads: true,
            last_error: None,
        });
        hub.bind_agent_route(AgentBinding {
            agent_id: "agent-42".to_string(),
            telegram_chat_id: None,
            discord_thread_id: Some("thread-42".to_string()),
            in_app_thread_id: Some("inapp-agent-42".to_string()),
            is_orchestrator: false,
        })
        .expect("agent binding should succeed");

        let event = json!({
            "op": 0,
            "t": "MESSAGE_CREATE",
            "s": 99,
            "d": {
                "id": "msg-42",
                "channel_id": "thread-42",
                "content": "status pulse",
                "author": {
                    "id": "user-1",
                    "bot": false
                }
            }
        });
        let result = hub
            .process_discord_gateway_event(event)
            .expect("gateway message should process");
        assert!(result.processed);
        assert_eq!(result.routed_agent_id.as_deref(), Some("agent-42"));
        assert_eq!(result.routed_thread_id.as_deref(), Some("inapp-agent-42"));

        let entries = hub.get_in_app_thread_messages("inapp-agent-42", 10, 0);
        assert_eq!(entries.len(), 1);
        assert!(entries[0].content.contains("[discord] status pulse"));
        assert_eq!(hub.discord_gateway_state.last_sequence, Some(99));
    }

    #[test]
    fn discord_gateway_interaction_create_delegates_to_defer_flow() {
        let mut hub = CommunicationHub::new();
        hub.update_discord_config(DiscordIntegrationConfig {
            enabled: true,
            bot_token: None,
            guild_id: Some("guild-2".to_string()),
            default_channel_id: Some("channel-2".to_string()),
            orchestrator_thread_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            auto_spawn_sub_sphere_threads: true,
            last_error: None,
        });
        hub.bind_agent_route(AgentBinding {
            agent_id: "agent-3".to_string(),
            telegram_chat_id: None,
            discord_thread_id: None,
            in_app_thread_id: Some("inapp-agent-3".to_string()),
            is_orchestrator: false,
        })
        .expect("agent binding should succeed");

        let event = json!({
            "op": 0,
            "t": "INTERACTION_CREATE",
            "d": {
                "id": "interaction-2",
                "application_id": "app-1",
                "token": "token-2",
                "type": 2,
                "data": {
                    "name": "ask",
                    "options": [
                        { "name": "agent_id", "value": "agent-3" },
                        { "name": "question", "value": "what is next?" }
                    ]
                }
            }
        });
        let result = hub
            .process_discord_gateway_event(event)
            .expect("interaction event should process");
        assert!(result.processed);
        assert_eq!(result.routed_agent_id.as_deref(), Some("agent-3"));
        assert_eq!(result.routed_thread_id.as_deref(), Some("inapp-agent-3"));
    }

    #[test]
    fn discord_interaction_defer_and_completion_simulate_when_live_disabled() {
        let mut hub = CommunicationHub::new();
        hub.update_discord_config(DiscordIntegrationConfig {
            enabled: true,
            bot_token: None,
            guild_id: Some("guild-2".to_string()),
            default_channel_id: Some("channel-2".to_string()),
            orchestrator_thread_id: None,
            routing_mode: AgentRoutingMode::PerAgent,
            auto_spawn_sub_sphere_threads: true,
            last_error: None,
        });
        hub.bind_agent_route(AgentBinding {
            agent_id: "agent-3".to_string(),
            telegram_chat_id: None,
            discord_thread_id: None,
            in_app_thread_id: Some("inapp-agent-3".to_string()),
            is_orchestrator: false,
        })
        .expect("agent binding should succeed");

        let payload = json!({
            "id": "interaction-1",
            "application_id": "app-1",
            "token": "token-1",
            "type": 2,
            "data": {
                "name": "ask",
                "options": [
                    { "name": "agent_id", "value": "agent-3" },
                    { "name": "question", "value": "what is next?" }
                ]
            }
        });
        let ack = hub
            .defer_discord_interaction(payload)
            .expect("interaction defer should succeed");
        assert_eq!(ack.deferred_response_type, 5);
        assert_eq!(ack.routed_agent_id, "agent-3");

        let completion_error = hub
            .complete_discord_interaction("interaction-1", "all systems go", false)
            .expect_err("completion should require a Discord bot token");
        assert!(matches!(completion_error, CommunicationError::MissingRoutingTarget { .. }));
    }

    #[test]
    fn discord_gateway_close_code_4014_marks_fatal_state() {
        let mut hub = CommunicationHub::new();
        let close = hub.register_discord_gateway_close(4014);
        assert_eq!(close.lifecycle, DiscordGatewayLifecycle::Fatal);
        assert!(!close.resume_recommended);
    }
}
