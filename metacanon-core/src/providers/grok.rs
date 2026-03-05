use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::compute::{
    estimate_token_count, normalized_ascii_embedding, ComputeError, ComputeProvider, ComputeResult,
    GenerateRequest, GenerateResponse, ProviderHealth, ProviderKind, TokenUsage,
};

pub const GROK_PROVIDER_ID: &str = "grok";
pub const GROK_DEFAULT_BASE_URL: &str = "https://api.x.ai/v1";
pub const GROK_DEFAULT_MODEL: &str = "grok-4-0709";
pub const GROK_MODEL_METADATA_KEY: &str = "grok_model";
pub const GROK_RESPONSE_METADATA_KEY_BASE_URL: &str = "base_url";
pub const GROK_RESPONSE_METADATA_KEY_ROUTING: &str = "routing";
pub const GROK_RESPONSE_METADATA_KEY_API: &str = "api";
pub const GROK_RESPONSE_METADATA_KEY_PROVIDER_FAMILY: &str = "provider_family";
pub const GROK_DEFAULT_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GrokConfig {
    pub api_key: Option<String>,
    pub base_url: String,
    pub model: String,
    pub live_api: bool,
    pub available: bool,
}

impl Default for GrokConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            base_url: GROK_DEFAULT_BASE_URL.to_string(),
            model: GROK_DEFAULT_MODEL.to_string(),
            live_api: false,
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GrokProvider {
    config: GrokConfig,
}

impl GrokProvider {
    pub fn new(config: GrokConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &GrokConfig {
        &self.config
    }

    pub fn set_api_key(&mut self, api_key: impl Into<String>) {
        self.config.api_key = Some(api_key.into());
    }

    pub fn clear_api_key(&mut self) {
        self.config.api_key = None;
    }

    pub fn mark_available(&mut self) {
        self.config.available = true;
    }

    pub fn mark_unavailable(&mut self) {
        self.config.available = false;
    }

    fn ensure_available(&self, action: &str) -> Result<(), GrokAdapterError> {
        if self.config.available {
            Ok(())
        } else {
            Err(GrokAdapterError::ProviderUnavailable(format!(
                "grok provider unavailable during {action}"
            )))
        }
    }

    fn ensure_api_key(&self) -> Result<&str, GrokAdapterError> {
        let key = self
            .config
            .api_key
            .as_deref()
            .ok_or(GrokAdapterError::MissingApiKey)?;
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return Err(GrokAdapterError::MissingApiKey);
        }
        if trimmed.len() < 10 {
            return Err(GrokAdapterError::InvalidApiKeyFormat);
        }
        Ok(trimmed)
    }

    fn map_generate_request(
        &self,
        req: GenerateRequest,
    ) -> Result<GrokChatRequest, GrokAdapterError> {
        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(GrokAdapterError::EmptyPrompt);
        }

        if let Some(temperature) = req.temperature {
            if !(0.0..=2.0).contains(&temperature) {
                return Err(GrokAdapterError::InvalidTemperature(temperature));
            }
        }

        let model = req
            .metadata
            .get(GROK_MODEL_METADATA_KEY)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or(&self.config.model)
            .to_string();

        let mut messages = Vec::new();
        if let Some(system_prompt) = req.system_prompt.as_deref().map(str::trim) {
            if !system_prompt.is_empty() {
                messages.push(GrokMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                });
            }
        }
        messages.push(GrokMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        });

        Ok(GrokChatRequest {
            model,
            messages,
            max_tokens: req.max_tokens,
            temperature: req.temperature,
        })
    }

    fn chat_completions_endpoint(&self) -> String {
        format!(
            "{}/chat/completions",
            self.config.base_url.trim_end_matches('/')
        )
    }

    fn request_live_chat_completion(
        &self,
        api_key: &str,
        request: &GrokChatRequest,
    ) -> Result<(GrokChatResponse, u64), GrokAdapterError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(GROK_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| GrokAdapterError::HttpTransport(error.to_string()))?;

        let started = Instant::now();
        let response = client
            .post(self.chat_completions_endpoint())
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .json(request)
            .send()
            .map_err(|error| GrokAdapterError::HttpTransport(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| GrokAdapterError::HttpTransport(error.to_string()))?;

        if !status.is_success() {
            return Err(GrokAdapterError::HttpStatus {
                status: status.as_u16(),
                body: trim_error_body(&body, 240),
            });
        }

        let parsed: GrokChatResponse = serde_json::from_str(&body)
            .map_err(|error| GrokAdapterError::InvalidApiPayload(error.to_string()))?;

        let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        Ok((parsed, latency_ms))
    }

    fn map_response(
        &self,
        response: GrokChatResponse,
        latency_ms: u64,
    ) -> Result<GenerateResponse, GrokAdapterError> {
        let choice = response
            .choices
            .into_iter()
            .next()
            .ok_or(GrokAdapterError::MissingChoice)?;
        let output_text = choice.message.content.trim().to_string();
        if output_text.is_empty() {
            return Err(GrokAdapterError::MissingChoice);
        }

        let usage = response.usage.map(|usage| TokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        });

        let mut metadata = BTreeMap::new();
        metadata.insert(
            GROK_RESPONSE_METADATA_KEY_BASE_URL.to_string(),
            self.config.base_url.clone(),
        );
        metadata.insert(
            GROK_RESPONSE_METADATA_KEY_ROUTING.to_string(),
            "cloud".to_string(),
        );
        metadata.insert(
            GROK_RESPONSE_METADATA_KEY_API.to_string(),
            "chat.completions".to_string(),
        );
        metadata.insert(
            GROK_RESPONSE_METADATA_KEY_PROVIDER_FAMILY.to_string(),
            "xai".to_string(),
        );

        Ok(GenerateResponse {
            provider_id: GROK_PROVIDER_ID.to_string(),
            model: response.model,
            output_text,
            finish_reason: choice.finish_reason,
            usage,
            metadata,
            latency_ms,
        })
    }

    fn simulate_chat_completion(&self, request: &GrokChatRequest) -> GrokChatResponse {
        let prompt = request
            .messages
            .iter()
            .rev()
            .find(|message| message.role == "user")
            .map(|message| message.content.as_str())
            .unwrap_or("");

        let prompt_tokens = estimate_token_count(prompt);
        let temperature = request.temperature.unwrap_or(0.7);
        let completion_tokens = 66.min(request.max_tokens.unwrap_or(66).max(1));

        GrokChatResponse {
            id: None,
            model: request.model.clone(),
            choices: vec![GrokChoice {
                index: None,
                message: GrokMessage {
                    role: "assistant".to_string(),
                    content: format!(
                        "Grok [{}] generated a cloud response (temp={temperature:.2}) for: {}",
                        request.model, prompt
                    ),
                },
                finish_reason: Some("stop".to_string()),
            }],
            usage: Some(GrokUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens.saturating_add(completion_tokens),
            }),
        }
    }
}

impl ComputeProvider for GrokProvider {
    fn provider_id(&self) -> &'static str {
        GROK_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Cloud
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        self.ensure_available("health_check")
            .map_err(|error| error.to_compute_error())?;

        if self.ensure_api_key().is_err() {
            return Ok(ProviderHealth::unhealthy(
                GROK_PROVIDER_ID,
                ProviderKind::Cloud,
                Some("missing or invalid Grok API key".to_string()),
            ));
        }

        Ok(ProviderHealth::healthy(
            GROK_PROVIDER_ID,
            ProviderKind::Cloud,
            Some(format!(
                "base_url={}, model={}",
                self.config.base_url, self.config.model
            )),
        ))
    }

    fn get_embedding(&self, text: &str) -> ComputeResult<Vec<f64>> {
        self.ensure_available("get_embedding")
            .map_err(|error| error.to_compute_error())?;
        self.ensure_api_key()
            .map_err(|error| error.to_compute_error())?;

        let input = text.trim();
        if input.is_empty() {
            return Err(GrokAdapterError::EmptyEmbeddingInput.to_compute_error());
        }

        Ok(normalized_ascii_embedding(
            &format!("{}::{input}", self.config.model),
            24,
            0x67_72_6F_6B_33_21,
        ))
    }

    fn generate_response(&self, req: GenerateRequest) -> ComputeResult<GenerateResponse> {
        self.ensure_available("generate_response")
            .map_err(|error| error.to_compute_error())?;
        let api_key = self
            .ensure_api_key()
            .map_err(|error| error.to_compute_error())?;

        let request = self
            .map_generate_request(req)
            .map_err(|error| error.to_compute_error())?;
        let (response, latency_ms) = if self.config.live_api {
            self.request_live_chat_completion(api_key, &request)
                .map_err(|error| error.to_compute_error())?
        } else {
            (self.simulate_chat_completion(&request), 128)
        };

        self.map_response(response, latency_ms)
            .map_err(|error| error.to_compute_error())
    }
}

#[derive(Debug, Clone, PartialEq)]
enum GrokAdapterError {
    ProviderUnavailable(String),
    MissingApiKey,
    InvalidApiKeyFormat,
    InvalidTemperature(f32),
    EmptyPrompt,
    MissingChoice,
    EmptyEmbeddingInput,
    HttpTransport(String),
    HttpStatus { status: u16, body: String },
    InvalidApiPayload(String),
}

impl GrokAdapterError {
    fn to_compute_error(&self) -> ComputeError {
        match self {
            Self::ProviderUnavailable(message) => {
                ComputeError::provider_unavailable(GROK_PROVIDER_ID, message)
            }
            Self::MissingApiKey => ComputeError::invalid_request("grok api key is not configured"),
            Self::InvalidApiKeyFormat => {
                ComputeError::invalid_request("grok api key appears to be invalid")
            }
            Self::InvalidTemperature(value) => ComputeError::invalid_request(format!(
                "temperature {value} is out of range; expected 0.0..=2.0"
            )),
            Self::EmptyPrompt => {
                ComputeError::invalid_request("prompt cannot be empty for generation")
            }
            Self::MissingChoice => {
                ComputeError::internal(GROK_PROVIDER_ID, "grok completion did not include text")
            }
            Self::EmptyEmbeddingInput => {
                ComputeError::invalid_request("embedding text cannot be empty")
            }
            Self::HttpTransport(message) => ComputeError::provider_unavailable(
                GROK_PROVIDER_ID,
                format!("grok live api transport error: {message}"),
            ),
            Self::HttpStatus { status, body } => {
                if *status == 401 || *status == 403 {
                    ComputeError::invalid_request(format!(
                        "grok api rejected credentials/permissions (status {status}): {body}"
                    ))
                } else {
                    ComputeError::provider_unavailable(
                        GROK_PROVIDER_ID,
                        format!("grok api request failed (status {status}): {body}"),
                    )
                }
            }
            Self::InvalidApiPayload(message) => ComputeError::internal(
                GROK_PROVIDER_ID,
                format!("grok api payload could not be parsed: {message}"),
            ),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct GrokChatRequest {
    model: String,
    messages: Vec<GrokMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct GrokMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct GrokChoice {
    #[serde(default)]
    #[allow(dead_code)]
    index: Option<u32>,
    message: GrokMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct GrokUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct GrokChatResponse {
    #[allow(dead_code)]
    id: Option<String>,
    model: String,
    choices: Vec<GrokChoice>,
    usage: Option<GrokUsage>,
}

fn trim_error_body(body: &str, max_chars: usize) -> String {
    let trimmed = body.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }

    let mut out = String::new();
    for character in trimmed.chars().take(max_chars) {
        out.push(character);
    }
    out.push_str("...");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_check_is_unhealthy_without_key() {
        let provider = GrokProvider::default();

        let health = provider
            .health_check()
            .expect("health check should return status");
        assert!(!health.is_healthy);
        assert_eq!(health.provider_id, GROK_PROVIDER_ID);
    }

    #[test]
    fn generation_rejects_invalid_temperature() {
        let mut provider = GrokProvider::default();
        provider.set_api_key("grok-test-key");

        let mut request = GenerateRequest::new("hello");
        request.temperature = Some(3.0);

        let result = provider.generate_response(request);
        let error = result.expect_err("invalid temperature should fail");
        assert_eq!(error.kind, crate::compute::ComputeErrorKind::InvalidRequest);
    }

    #[test]
    fn generation_maps_to_normalized_shape() {
        let mut provider = GrokProvider::default();
        provider.set_api_key("grok-test-key");

        let response = provider
            .generate_response(
                GenerateRequest::new("design fallback monitoring")
                    .with_metadata(GROK_MODEL_METADATA_KEY, "grok-3"),
            )
            .expect("generation should succeed");

        assert_eq!(response.provider_id, GROK_PROVIDER_ID);
        assert_eq!(response.model, "grok-3");
        assert!(response.output_text.contains("fallback monitoring"));
        assert!(response.metadata.contains_key("provider_family"));
    }

    #[test]
    fn embedding_returns_non_empty_vector() {
        let mut provider = GrokProvider::default();
        provider.set_api_key("grok-test-key");

        let embedding = provider
            .get_embedding("cloud health graph")
            .expect("embedding should succeed");
        assert!(!embedding.is_empty());
    }

    #[test]
    fn provider_and_metadata_key_contracts_are_stable() {
        assert_eq!(GROK_PROVIDER_ID, "grok");
        assert_eq!(GROK_MODEL_METADATA_KEY, "grok_model");
        assert_eq!(GROK_RESPONSE_METADATA_KEY_BASE_URL, "base_url");
        assert_eq!(GROK_RESPONSE_METADATA_KEY_ROUTING, "routing");
        assert_eq!(GROK_RESPONSE_METADATA_KEY_API, "api");
        assert_eq!(
            GROK_RESPONSE_METADATA_KEY_PROVIDER_FAMILY,
            "provider_family"
        );
    }

    #[test]
    fn default_config_keeps_live_api_disabled_for_deterministic_tests() {
        assert!(!GrokConfig::default().live_api);
    }

    #[test]
    #[ignore = "requires GROK_API_KEY and network access"]
    fn live_generation_round_trip_with_real_api_key() {
        let api_key =
            std::env::var("GROK_API_KEY").expect("GROK_API_KEY must be set for live test");
        let provider = GrokProvider::new(GrokConfig {
            api_key: Some(api_key),
            model: GROK_DEFAULT_MODEL.to_string(),
            live_api: true,
            ..GrokConfig::default()
        });

        let response = provider
            .generate_response(GenerateRequest::new("Reply with OK only."))
            .expect("live grok request should succeed");

        assert_eq!(response.provider_id, GROK_PROVIDER_ID);
        assert!(!response.output_text.trim().is_empty());
    }
}
