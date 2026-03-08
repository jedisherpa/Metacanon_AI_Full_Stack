use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::compute::{
    ComputeError, ComputeProvider, ComputeResult, GenerateRequest, GenerateResponse,
    ProviderHealth, ProviderKind, TokenUsage,
};

pub const OPENAI_PROVIDER_ID: &str = "openai";
pub const OPENAI_DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
pub const OPENAI_DEFAULT_CHAT_MODEL: &str = "gpt-4.1-mini";
pub const OPENAI_DEFAULT_EMBEDDING_MODEL: &str = "text-embedding-3-small";
pub const OPENAI_MODEL_METADATA_KEY: &str = "openai_model";
pub const OPENAI_EMBEDDING_MODEL_METADATA_KEY: &str = "openai_embedding_model";
pub const OPENAI_RESPONSE_METADATA_KEY_BASE_URL: &str = "base_url";
pub const OPENAI_RESPONSE_METADATA_KEY_ROUTING: &str = "routing";
pub const OPENAI_RESPONSE_METADATA_KEY_API: &str = "api";
pub const OPENAI_RESPONSE_METADATA_KEY_SYSTEM_PROMPT_APPLIED: &str = "system_prompt_applied";
pub const OPENAI_DEFAULT_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenAiConfig {
    pub api_key: Option<String>,
    pub base_url: String,
    pub chat_model: String,
    pub embedding_model: String,
    pub available: bool,
}

impl Default for OpenAiConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            base_url: OPENAI_DEFAULT_BASE_URL.to_string(),
            chat_model: OPENAI_DEFAULT_CHAT_MODEL.to_string(),
            embedding_model: OPENAI_DEFAULT_EMBEDDING_MODEL.to_string(),
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OpenAiProvider {
    config: OpenAiConfig,
}

impl OpenAiProvider {
    pub fn new(config: OpenAiConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &OpenAiConfig {
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

    fn ensure_available(&self, action: &str) -> Result<(), OpenAiAdapterError> {
        if self.config.available {
            Ok(())
        } else {
            Err(OpenAiAdapterError::ProviderUnavailable(format!(
                "openai provider unavailable during {action}"
            )))
        }
    }

    fn ensure_api_key(&self) -> Result<&str, OpenAiAdapterError> {
        let key = self
            .config
            .api_key
            .as_deref()
            .ok_or(OpenAiAdapterError::MissingApiKey)?;
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return Err(OpenAiAdapterError::MissingApiKey);
        }
        if !trimmed.starts_with("sk-") {
            return Err(OpenAiAdapterError::InvalidApiKeyFormat);
        }
        Ok(trimmed)
    }

    fn map_generate_request(
        &self,
        req: GenerateRequest,
    ) -> Result<OpenAiChatRequest, OpenAiAdapterError> {
        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(OpenAiAdapterError::EmptyPrompt);
        }

        if let Some(temperature) = req.temperature {
            if !(0.0..=2.0).contains(&temperature) {
                return Err(OpenAiAdapterError::InvalidTemperature(temperature));
            }
        }

        let model = req
            .metadata
            .get(OPENAI_MODEL_METADATA_KEY)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or(&self.config.chat_model)
            .to_string();

        let mut messages = Vec::new();
        if let Some(system_prompt) = req.system_prompt.as_deref().map(str::trim) {
            if !system_prompt.is_empty() {
                messages.push(OpenAiChatMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                });
            }
        }
        messages.push(OpenAiChatMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        });

        Ok(OpenAiChatRequest {
            model,
            messages,
            max_tokens: req.max_tokens,
            temperature: req.temperature,
        })
    }

    fn map_chat_response(
        &self,
        response: OpenAiChatResponse,
        latency_ms: u64,
    ) -> Result<GenerateResponse, OpenAiAdapterError> {
        let choice = response
            .choices
            .into_iter()
            .next()
            .ok_or(OpenAiAdapterError::EmptyCompletion)?;

        let output_text = choice.message.content.trim().to_string();
        if output_text.is_empty() {
            return Err(OpenAiAdapterError::EmptyCompletion);
        }

        let usage = response.usage.map(|usage| TokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        });

        let mut metadata = BTreeMap::new();
        metadata.insert(
            OPENAI_RESPONSE_METADATA_KEY_BASE_URL.to_string(),
            self.config.base_url.clone(),
        );
        metadata.insert(
            OPENAI_RESPONSE_METADATA_KEY_ROUTING.to_string(),
            "cloud".to_string(),
        );
        metadata.insert(
            OPENAI_RESPONSE_METADATA_KEY_API.to_string(),
            "chat.completions".to_string(),
        );
        metadata.insert(
            OPENAI_RESPONSE_METADATA_KEY_SYSTEM_PROMPT_APPLIED.to_string(),
            choice.system_prompt_applied.to_string(),
        );

        Ok(GenerateResponse {
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            model: response.model,
            output_text,
            finish_reason: choice.finish_reason,
            usage,
            metadata,
            latency_ms,
        })
    }

    fn map_embedding_request(
        &self,
        text: &str,
        model_override: Option<&str>,
    ) -> Result<OpenAiEmbeddingRequest, OpenAiAdapterError> {
        let input = text.trim();
        if input.is_empty() {
            return Err(OpenAiAdapterError::EmptyEmbeddingInput);
        }

        let model = model_override
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(&self.config.embedding_model)
            .to_string();

        Ok(OpenAiEmbeddingRequest {
            model,
            input: input.to_string(),
        })
    }

    fn map_embedding_response(
        &self,
        response: OpenAiEmbeddingResponse,
    ) -> Result<Vec<f64>, OpenAiAdapterError> {
        if response.model.trim().is_empty() {
            return Err(OpenAiAdapterError::EmptyEmbeddingVector);
        }
        if response.embedding.is_empty() {
            return Err(OpenAiAdapterError::EmptyEmbeddingVector);
        }
        Ok(response.embedding)
    }

    fn chat_completions_endpoint(&self) -> String {
        format!(
            "{}/chat/completions",
            self.config.base_url.trim_end_matches('/')
        )
    }

    fn embeddings_endpoint(&self) -> String {
        format!("{}/embeddings", self.config.base_url.trim_end_matches('/'))
    }

    fn request_live_chat_completion(
        &self,
        api_key: &str,
        request: &OpenAiChatRequest,
    ) -> Result<(OpenAiChatResponse, u64), OpenAiAdapterError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(OPENAI_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| OpenAiAdapterError::HttpTransport(error.to_string()))?;

        let started = Instant::now();
        let response = client
            .post(self.chat_completions_endpoint())
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .json(request)
            .send()
            .map_err(|error| OpenAiAdapterError::HttpTransport(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| OpenAiAdapterError::HttpTransport(error.to_string()))?;
        if !status.is_success() {
            return Err(OpenAiAdapterError::HttpStatus {
                status: status.as_u16(),
                body: trim_error_body(&body, 240),
            });
        }

        let parsed: OpenAiLiveChatResponse = serde_json::from_str(&body)
            .map_err(|error| OpenAiAdapterError::InvalidApiPayload(error.to_string()))?;

        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or(OpenAiAdapterError::EmptyCompletion)?;
        let output_text = choice.message.content.trim().to_string();
        if output_text.is_empty() {
            return Err(OpenAiAdapterError::EmptyCompletion);
        }

        let model = if parsed.model.trim().is_empty() {
            request.model.clone()
        } else {
            parsed.model
        };

        let normalized = OpenAiChatResponse {
            model,
            choices: vec![OpenAiChatChoice {
                message: OpenAiChatMessage {
                    role: "assistant".to_string(),
                    content: output_text,
                },
                finish_reason: choice.finish_reason,
                system_prompt_applied: request
                    .messages
                    .iter()
                    .any(|message| message.role == "system"),
            }],
            usage: parsed.usage.map(|usage| OpenAiUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
            }),
        };

        let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        Ok((normalized, latency_ms))
    }

    fn request_live_embedding(
        &self,
        api_key: &str,
        request: &OpenAiEmbeddingRequest,
    ) -> Result<OpenAiEmbeddingResponse, OpenAiAdapterError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(OPENAI_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| OpenAiAdapterError::HttpTransport(error.to_string()))?;

        let response = client
            .post(self.embeddings_endpoint())
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .json(request)
            .send()
            .map_err(|error| OpenAiAdapterError::HttpTransport(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| OpenAiAdapterError::HttpTransport(error.to_string()))?;
        if !status.is_success() {
            return Err(OpenAiAdapterError::HttpStatus {
                status: status.as_u16(),
                body: trim_error_body(&body, 240),
            });
        }

        let parsed: OpenAiLiveEmbeddingResponse = serde_json::from_str(&body)
            .map_err(|error| OpenAiAdapterError::InvalidApiPayload(error.to_string()))?;
        let vector = parsed
            .data
            .into_iter()
            .next()
            .map(|row| row.embedding)
            .unwrap_or_default();
        Ok(OpenAiEmbeddingResponse {
            model: if parsed.model.trim().is_empty() {
                request.model.clone()
            } else {
                parsed.model
            },
            embedding: vector,
        })
    }

}

impl ComputeProvider for OpenAiProvider {
    fn provider_id(&self) -> &'static str {
        OPENAI_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Cloud
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        self.ensure_available("health_check")
            .map_err(|error| error.to_compute_error())?;

        if self.ensure_api_key().is_err() {
            return Ok(ProviderHealth::unhealthy(
                OPENAI_PROVIDER_ID,
                ProviderKind::Cloud,
                Some("missing or invalid OpenAI API key".to_string()),
            ));
        }

        Ok(ProviderHealth::healthy(
            OPENAI_PROVIDER_ID,
            ProviderKind::Cloud,
            Some(format!(
                "base_url={}, chat_model={}, embedding_model={}",
                self.config.base_url, self.config.chat_model, self.config.embedding_model
            )),
        ))
    }

    fn get_embedding(&self, text: &str) -> ComputeResult<Vec<f64>> {
        self.ensure_available("get_embedding")
            .map_err(|error| error.to_compute_error())?;
        let api_key = self
            .ensure_api_key()
            .map_err(|error| error.to_compute_error())?;

        let request = self
            .map_embedding_request(text, None)
            .map_err(|error| error.to_compute_error())?;

        let response = self
            .request_live_embedding(api_key, &request)
            .map_err(|error| error.to_compute_error())?;
        self.map_embedding_response(response)
            .map_err(|error| error.to_compute_error())
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
            .request_live_chat_completion(api_key, &request)
            .map_err(|error| error.to_compute_error())?;
        self.map_chat_response(response, latency_ms)
            .map_err(|error| error.to_compute_error())
    }
}

#[derive(Debug, Clone, PartialEq)]
enum OpenAiAdapterError {
    ProviderUnavailable(String),
    MissingApiKey,
    InvalidApiKeyFormat,
    InvalidTemperature(f32),
    EmptyPrompt,
    EmptyCompletion,
    EmptyEmbeddingInput,
    EmptyEmbeddingVector,
    HttpTransport(String),
    HttpStatus { status: u16, body: String },
    InvalidApiPayload(String),
}

impl OpenAiAdapterError {
    fn to_compute_error(&self) -> ComputeError {
        match self {
            Self::ProviderUnavailable(message) => {
                ComputeError::provider_unavailable(OPENAI_PROVIDER_ID, message)
            }
            Self::MissingApiKey => {
                ComputeError::invalid_request("openai api key is not configured")
            }
            Self::InvalidApiKeyFormat => {
                ComputeError::invalid_request("openai api key must start with 'sk-'")
            }
            Self::InvalidTemperature(value) => ComputeError::invalid_request(format!(
                "temperature {value} is out of range; expected 0.0..=2.0"
            )),
            Self::EmptyPrompt => {
                ComputeError::invalid_request("prompt cannot be empty for generation")
            }
            Self::EmptyCompletion => {
                ComputeError::internal(OPENAI_PROVIDER_ID, "openai completion did not include text")
            }
            Self::EmptyEmbeddingInput => {
                ComputeError::invalid_request("embedding text cannot be empty")
            }
            Self::EmptyEmbeddingVector => {
                ComputeError::internal(OPENAI_PROVIDER_ID, "openai embedding response was empty")
            }
            Self::HttpTransport(message) => ComputeError::provider_unavailable(
                OPENAI_PROVIDER_ID,
                format!("openai live api transport error: {message}"),
            ),
            Self::HttpStatus { status, body } => {
                if *status == 401 || *status == 403 {
                    ComputeError::invalid_request(format!(
                        "openai api rejected credentials/permissions (status {status}): {body}"
                    ))
                } else {
                    ComputeError::provider_unavailable(
                        OPENAI_PROVIDER_ID,
                        format!("openai api request failed (status {status}): {body}"),
                    )
                }
            }
            Self::InvalidApiPayload(message) => ComputeError::internal(
                OPENAI_PROVIDER_ID,
                format!("openai api payload could not be parsed: {message}"),
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiChatMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct OpenAiChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OpenAiChatChoice {
    message: OpenAiChatMessage,
    finish_reason: Option<String>,
    system_prompt_applied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OpenAiChatResponse {
    model: String,
    choices: Vec<OpenAiChatChoice>,
    usage: Option<OpenAiUsage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct OpenAiEmbeddingRequest {
    model: String,
    input: String,
}

#[derive(Debug, Clone, PartialEq)]
struct OpenAiEmbeddingResponse {
    model: String,
    embedding: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct OpenAiLiveChatResponse {
    model: String,
    choices: Vec<OpenAiLiveChatChoice>,
    usage: Option<OpenAiUsage>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct OpenAiLiveChatChoice {
    message: OpenAiLiveChatMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct OpenAiLiveChatMessage {
    content: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct OpenAiLiveEmbeddingResponse {
    model: String,
    data: Vec<OpenAiLiveEmbeddingRow>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct OpenAiLiveEmbeddingRow {
    embedding: Vec<f64>,
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
        let provider = OpenAiProvider::default();

        let health = provider
            .health_check()
            .expect("health check should return status");
        assert!(!health.is_healthy);
        assert_eq!(health.provider_id, OPENAI_PROVIDER_ID);
    }

    #[test]
    fn generation_requires_valid_openai_key() {
        let mut provider = OpenAiProvider::default();
        provider.set_api_key("not-openai");

        let result = provider.generate_response(GenerateRequest::new("hello"));
        let error = result.expect_err("invalid key should fail");
        assert_eq!(error.kind, crate::compute::ComputeErrorKind::InvalidRequest);
    }

    #[test]
    fn generation_maps_into_normalized_response() {
        let mut provider = OpenAiProvider::default();
        provider.set_api_key("sk-test-key");

        let request =
            GenerateRequest::new("hello world").with_metadata(OPENAI_MODEL_METADATA_KEY, "gpt-4.1");
        let response = provider
            .generate_response(request)
            .expect("generation should succeed");

        assert_eq!(response.provider_id, OPENAI_PROVIDER_ID);
        assert_eq!(response.model, "gpt-4.1");
        assert!(response.output_text.contains("hello world"));
        assert!(response.metadata.contains_key("api"));
    }

    #[test]
    fn embedding_maps_to_non_empty_vector() {
        let mut provider = OpenAiProvider::default();
        provider.set_api_key("sk-test-key");

        let embedding = provider
            .get_embedding("constitutional alignment")
            .expect("embedding should succeed");
        assert!(!embedding.is_empty());
    }

    #[test]
    fn provider_and_metadata_key_contracts_are_stable() {
        assert_eq!(OPENAI_PROVIDER_ID, "openai");
        assert_eq!(OPENAI_MODEL_METADATA_KEY, "openai_model");
        assert_eq!(
            OPENAI_EMBEDDING_MODEL_METADATA_KEY,
            "openai_embedding_model"
        );
        assert_eq!(OPENAI_RESPONSE_METADATA_KEY_BASE_URL, "base_url");
        assert_eq!(OPENAI_RESPONSE_METADATA_KEY_ROUTING, "routing");
        assert_eq!(OPENAI_RESPONSE_METADATA_KEY_API, "api");
        assert_eq!(
            OPENAI_RESPONSE_METADATA_KEY_SYSTEM_PROMPT_APPLIED,
            "system_prompt_applied"
        );
    }

}
