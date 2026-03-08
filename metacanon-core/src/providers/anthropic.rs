use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::compute::{
    ComputeError, ComputeProvider, ComputeResult, GenerateRequest, GenerateResponse,
    ProviderHealth, ProviderKind, TokenUsage,
};

pub const ANTHROPIC_PROVIDER_ID: &str = "anthropic";
pub const ANTHROPIC_DEFAULT_BASE_URL: &str = "https://api.anthropic.com/v1";
pub const ANTHROPIC_DEFAULT_MODEL: &str = "claude-3-5-sonnet-latest";
pub const ANTHROPIC_MODEL_METADATA_KEY: &str = "anthropic_model";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";
pub const ANTHROPIC_RESPONSE_METADATA_KEY_BASE_URL: &str = "base_url";
pub const ANTHROPIC_RESPONSE_METADATA_KEY_ROUTING: &str = "routing";
pub const ANTHROPIC_RESPONSE_METADATA_KEY_API: &str = "api";
pub const ANTHROPIC_RESPONSE_METADATA_KEY_STOP_REASON: &str = "stop_reason";
pub const ANTHROPIC_RESPONSE_METADATA_KEY_VERSION: &str = "version";
pub const ANTHROPIC_DEFAULT_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnthropicConfig {
    pub api_key: Option<String>,
    pub base_url: String,
    pub model: String,
    pub available: bool,
}

impl Default for AnthropicConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            base_url: ANTHROPIC_DEFAULT_BASE_URL.to_string(),
            model: ANTHROPIC_DEFAULT_MODEL.to_string(),
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AnthropicProvider {
    config: AnthropicConfig,
}

impl AnthropicProvider {
    pub fn new(config: AnthropicConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &AnthropicConfig {
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

    fn ensure_available(&self, action: &str) -> Result<(), AnthropicAdapterError> {
        if self.config.available {
            Ok(())
        } else {
            Err(AnthropicAdapterError::ProviderUnavailable(format!(
                "anthropic provider unavailable during {action}"
            )))
        }
    }

    fn ensure_api_key(&self) -> Result<&str, AnthropicAdapterError> {
        let key = self
            .config
            .api_key
            .as_deref()
            .ok_or(AnthropicAdapterError::MissingApiKey)?;
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return Err(AnthropicAdapterError::MissingApiKey);
        }
        if trimmed.len() < 16 {
            return Err(AnthropicAdapterError::InvalidApiKeyFormat);
        }
        Ok(trimmed)
    }

    fn map_generate_request(
        &self,
        req: GenerateRequest,
    ) -> Result<AnthropicMessagesRequest, AnthropicAdapterError> {
        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(AnthropicAdapterError::EmptyPrompt);
        }

        if let Some(temperature) = req.temperature {
            if !(0.0..=1.0).contains(&temperature) {
                return Err(AnthropicAdapterError::InvalidTemperature(temperature));
            }
        }

        let model = req
            .metadata
            .get(ANTHROPIC_MODEL_METADATA_KEY)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or(&self.config.model)
            .to_string();

        let messages = vec![AnthropicMessage {
            role: "user".to_string(),
            content: vec![AnthropicContentBlock {
                block_type: "text".to_string(),
                text: prompt.to_string(),
            }],
        }];

        Ok(AnthropicMessagesRequest {
            model,
            system: req
                .system_prompt
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
            messages,
            max_tokens: req.max_tokens.unwrap_or(512),
            temperature: req.temperature,
            anthropic_version: ANTHROPIC_VERSION.to_string(),
        })
    }

    fn map_response(
        &self,
        response: AnthropicMessagesResponse,
        latency_ms: u64,
    ) -> Result<GenerateResponse, AnthropicAdapterError> {
        let text_block = response
            .content
            .into_iter()
            .find(|block| block.block_type == "text")
            .ok_or(AnthropicAdapterError::MissingTextContent)?;

        let output_text = text_block.text.trim().to_string();
        if output_text.is_empty() {
            return Err(AnthropicAdapterError::MissingTextContent);
        }

        let mut metadata = BTreeMap::new();
        metadata.insert(
            ANTHROPIC_RESPONSE_METADATA_KEY_BASE_URL.to_string(),
            self.config.base_url.clone(),
        );
        metadata.insert(
            ANTHROPIC_RESPONSE_METADATA_KEY_ROUTING.to_string(),
            "cloud".to_string(),
        );
        metadata.insert(
            ANTHROPIC_RESPONSE_METADATA_KEY_API.to_string(),
            "messages".to_string(),
        );
        let stop_reason = response
            .stop_reason
            .clone()
            .unwrap_or_else(|| "end_turn".to_string());
        metadata.insert(
            ANTHROPIC_RESPONSE_METADATA_KEY_STOP_REASON.to_string(),
            stop_reason.clone(),
        );
        metadata.insert(
            ANTHROPIC_RESPONSE_METADATA_KEY_VERSION.to_string(),
            ANTHROPIC_VERSION.to_string(),
        );

        Ok(GenerateResponse {
            provider_id: ANTHROPIC_PROVIDER_ID.to_string(),
            model: response.model,
            output_text,
            finish_reason: Some(stop_reason),
            usage: Some(TokenUsage {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response
                    .usage
                    .input_tokens
                    .saturating_add(response.usage.output_tokens),
            }),
            metadata,
            latency_ms,
        })
    }

    fn messages_endpoint(&self) -> String {
        format!("{}/messages", self.config.base_url.trim_end_matches('/'))
    }

    fn request_live_messages(
        &self,
        api_key: &str,
        request: &AnthropicMessagesRequest,
    ) -> Result<(AnthropicMessagesResponse, u64), AnthropicAdapterError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(ANTHROPIC_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| AnthropicAdapterError::HttpTransport(error.to_string()))?;

        let started = Instant::now();
        let response = client
            .post(self.messages_endpoint())
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(request)
            .send()
            .map_err(|error| AnthropicAdapterError::HttpTransport(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| AnthropicAdapterError::HttpTransport(error.to_string()))?;
        if !status.is_success() {
            return Err(AnthropicAdapterError::HttpStatus {
                status: status.as_u16(),
                body: trim_error_body(&body, 240),
            });
        }

        let parsed: AnthropicMessagesResponse = serde_json::from_str(&body)
            .map_err(|error| AnthropicAdapterError::InvalidApiPayload(error.to_string()))?;
        let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        Ok((parsed, latency_ms))
    }
}

impl ComputeProvider for AnthropicProvider {
    fn provider_id(&self) -> &'static str {
        ANTHROPIC_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Cloud
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        self.ensure_available("health_check")
            .map_err(|error| error.to_compute_error())?;

        if self.ensure_api_key().is_err() {
            return Ok(ProviderHealth::unhealthy(
                ANTHROPIC_PROVIDER_ID,
                ProviderKind::Cloud,
                Some("missing or invalid Anthropic API key".to_string()),
            ));
        }

        Ok(ProviderHealth::healthy(
            ANTHROPIC_PROVIDER_ID,
            ProviderKind::Cloud,
            Some(format!(
                "base_url={}, model={}, version={}",
                self.config.base_url, self.config.model, ANTHROPIC_VERSION
            )),
        ))
    }

    fn get_embedding(&self, text: &str) -> ComputeResult<Vec<f64>> {
        self.ensure_available("get_embedding")
            .map_err(|error| error.to_compute_error())?;
        let input = text.trim();
        if input.is_empty() {
            return Err(AnthropicAdapterError::EmptyEmbeddingInput.to_compute_error());
        }

        Err(ComputeError::provider_unavailable(
            ANTHROPIC_PROVIDER_ID,
            "anthropic embeddings are not implemented in this runtime",
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
        let (response, latency_ms) = self
            .request_live_messages(api_key, &request)
            .map_err(|error| error.to_compute_error())?;
        self.map_response(response, latency_ms)
            .map_err(|error| error.to_compute_error())
    }
}

#[derive(Debug, Clone, PartialEq)]
enum AnthropicAdapterError {
    ProviderUnavailable(String),
    MissingApiKey,
    InvalidApiKeyFormat,
    InvalidTemperature(f32),
    EmptyPrompt,
    MissingTextContent,
    EmptyEmbeddingInput,
    HttpTransport(String),
    HttpStatus { status: u16, body: String },
    InvalidApiPayload(String),
}

impl AnthropicAdapterError {
    fn to_compute_error(&self) -> ComputeError {
        match self {
            Self::ProviderUnavailable(message) => {
                ComputeError::provider_unavailable(ANTHROPIC_PROVIDER_ID, message)
            }
            Self::MissingApiKey => {
                ComputeError::invalid_request("anthropic api key is not configured")
            }
            Self::InvalidApiKeyFormat => {
                ComputeError::invalid_request("anthropic api key appears to be invalid")
            }
            Self::InvalidTemperature(value) => ComputeError::invalid_request(format!(
                "temperature {value} is out of range; expected 0.0..=1.0"
            )),
            Self::EmptyPrompt => {
                ComputeError::invalid_request("prompt cannot be empty for generation")
            }
            Self::MissingTextContent => ComputeError::internal(
                ANTHROPIC_PROVIDER_ID,
                "anthropic response did not include a text content block",
            ),
            Self::EmptyEmbeddingInput => {
                ComputeError::invalid_request("embedding text cannot be empty")
            }
            Self::HttpTransport(message) => ComputeError::provider_unavailable(
                ANTHROPIC_PROVIDER_ID,
                format!("anthropic live api transport error: {message}"),
            ),
            Self::HttpStatus { status, body } => {
                if *status == 401 || *status == 403 {
                    ComputeError::invalid_request(format!(
                        "anthropic api rejected credentials/permissions (status {status}): {body}"
                    ))
                } else {
                    ComputeError::provider_unavailable(
                        ANTHROPIC_PROVIDER_ID,
                        format!("anthropic api request failed (status {status}): {body}"),
                    )
                }
            }
            Self::InvalidApiPayload(message) => ComputeError::internal(
                ANTHROPIC_PROVIDER_ID,
                format!("anthropic api payload could not be parsed: {message}"),
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
struct AnthropicMessagesRequest {
    model: String,
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    temperature: Option<f32>,
    #[serde(skip_serializing)]
    anthropic_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct AnthropicMessagesResponse {
    model: String,
    content: Vec<AnthropicContentBlock>,
    stop_reason: Option<String>,
    usage: AnthropicUsage,
}

fn trim_error_body(body: &str, max_chars: usize) -> String {
    let trimmed = body.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    let mut shortened = trimmed.chars().take(max_chars).collect::<String>();
    shortened.push('…');
    shortened
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_check_is_unhealthy_without_key() {
        let provider = AnthropicProvider::default();

        let health = provider
            .health_check()
            .expect("health check should return status");
        assert!(!health.is_healthy);
        assert_eq!(health.provider_id, ANTHROPIC_PROVIDER_ID);
    }

    #[test]
    fn generation_rejects_invalid_temperature() {
        let mut provider = AnthropicProvider::default();
        provider.set_api_key("anthropic-test-token");

        let mut request = GenerateRequest::new("hello");
        request.temperature = Some(1.5);

        let result = provider.generate_response(request);
        let error = result.expect_err("invalid temperature should fail");
        assert_eq!(error.kind, crate::compute::ComputeErrorKind::InvalidRequest);
    }

    #[test]
    fn generation_maps_into_normalized_response() {
        let mut provider = AnthropicProvider::default();
        provider.set_api_key("anthropic-test-token");

        let response = provider
            .generate_response(
                GenerateRequest::new("reflect on ratchet updates")
                    .with_metadata(ANTHROPIC_MODEL_METADATA_KEY, "claude-3-7-sonnet"),
            )
            .expect("generation should succeed");

        assert_eq!(response.provider_id, ANTHROPIC_PROVIDER_ID);
        assert_eq!(response.model, "claude-3-7-sonnet");
        assert!(response.output_text.contains("ratchet"));
        assert_eq!(response.finish_reason.as_deref(), Some("end_turn"));
    }

    #[test]
    fn embedding_returns_non_empty_vector() {
        let mut provider = AnthropicProvider::default();
        provider.set_api_key("anthropic-test-token");

        let embedding = provider
            .get_embedding("delegate the constitutional check")
            .expect("embedding should succeed");
        assert!(!embedding.is_empty());
    }

    #[test]
    fn provider_and_metadata_key_contracts_are_stable() {
        assert_eq!(ANTHROPIC_PROVIDER_ID, "anthropic");
        assert_eq!(ANTHROPIC_MODEL_METADATA_KEY, "anthropic_model");
        assert_eq!(ANTHROPIC_RESPONSE_METADATA_KEY_BASE_URL, "base_url");
        assert_eq!(ANTHROPIC_RESPONSE_METADATA_KEY_ROUTING, "routing");
        assert_eq!(ANTHROPIC_RESPONSE_METADATA_KEY_API, "api");
        assert_eq!(ANTHROPIC_RESPONSE_METADATA_KEY_STOP_REASON, "stop_reason");
        assert_eq!(ANTHROPIC_RESPONSE_METADATA_KEY_VERSION, "version");
    }

}
