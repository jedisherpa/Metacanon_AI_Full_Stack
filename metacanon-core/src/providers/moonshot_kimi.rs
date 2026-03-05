use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::compute::{
    estimate_token_count, normalized_ascii_embedding, ComputeError, ComputeProvider, ComputeResult,
    GenerateRequest, GenerateResponse, ProviderHealth, ProviderKind, TokenUsage,
};

pub const MOONSHOT_KIMI_PROVIDER_ID: &str = "moonshot_kimi";
pub const MOONSHOT_KIMI_DEFAULT_BASE_URL: &str = "https://api.moonshot.ai/v1";
pub const MOONSHOT_KIMI_DEFAULT_MODEL: &str = "moonshot-v1-8k";
pub const MOONSHOT_KIMI_MODEL_METADATA_KEY: &str = "moonshot_model";
pub const MOONSHOT_RESPONSE_METADATA_KEY_BASE_URL: &str = "base_url";
pub const MOONSHOT_RESPONSE_METADATA_KEY_ROUTING: &str = "routing";
pub const MOONSHOT_RESPONSE_METADATA_KEY_API: &str = "api";
pub const MOONSHOT_RESPONSE_METADATA_KEY_PROVIDER_FAMILY: &str = "provider_family";
pub const MOONSHOT_DEFAULT_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoonshotKimiConfig {
    pub api_key: Option<String>,
    pub base_url: String,
    pub model: String,
    pub live_api: bool,
    pub available: bool,
}

impl Default for MoonshotKimiConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            base_url: MOONSHOT_KIMI_DEFAULT_BASE_URL.to_string(),
            model: MOONSHOT_KIMI_DEFAULT_MODEL.to_string(),
            live_api: false,
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MoonshotKimiProvider {
    config: MoonshotKimiConfig,
}

impl MoonshotKimiProvider {
    pub fn new(config: MoonshotKimiConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &MoonshotKimiConfig {
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

    fn ensure_available(&self, action: &str) -> Result<(), MoonshotKimiAdapterError> {
        if self.config.available {
            Ok(())
        } else {
            Err(MoonshotKimiAdapterError::ProviderUnavailable(format!(
                "moonshot kimi provider unavailable during {action}"
            )))
        }
    }

    fn ensure_api_key(&self) -> Result<&str, MoonshotKimiAdapterError> {
        let key = self
            .config
            .api_key
            .as_deref()
            .ok_or(MoonshotKimiAdapterError::MissingApiKey)?;
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return Err(MoonshotKimiAdapterError::MissingApiKey);
        }
        if trimmed.len() < 12 {
            return Err(MoonshotKimiAdapterError::InvalidApiKeyFormat);
        }
        Ok(trimmed)
    }

    fn map_generate_request(
        &self,
        req: GenerateRequest,
    ) -> Result<MoonshotKimiChatRequest, MoonshotKimiAdapterError> {
        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(MoonshotKimiAdapterError::EmptyPrompt);
        }

        if let Some(temperature) = req.temperature {
            if !(0.0..=2.0).contains(&temperature) {
                return Err(MoonshotKimiAdapterError::InvalidTemperature(temperature));
            }
        }

        let model = req
            .metadata
            .get(MOONSHOT_KIMI_MODEL_METADATA_KEY)
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or(&self.config.model)
            .to_string();

        let mut messages = Vec::new();
        if let Some(system_prompt) = req.system_prompt.as_deref().map(str::trim) {
            if !system_prompt.is_empty() {
                messages.push(MoonshotKimiMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                });
            }
        }
        messages.push(MoonshotKimiMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        });

        Ok(MoonshotKimiChatRequest {
            model,
            messages,
            max_tokens: req.max_tokens,
            temperature: req.temperature,
        })
    }

    fn map_response(
        &self,
        response: MoonshotKimiChatResponse,
        latency_ms: u64,
    ) -> Result<GenerateResponse, MoonshotKimiAdapterError> {
        let choice = response
            .choices
            .into_iter()
            .next()
            .ok_or(MoonshotKimiAdapterError::MissingChoice)?;
        let output_text = choice.message.content.trim().to_string();
        if output_text.is_empty() {
            return Err(MoonshotKimiAdapterError::MissingChoice);
        }

        let usage = response.usage.map(|usage| TokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        });

        let mut metadata = BTreeMap::new();
        metadata.insert(
            MOONSHOT_RESPONSE_METADATA_KEY_BASE_URL.to_string(),
            self.config.base_url.clone(),
        );
        metadata.insert(
            MOONSHOT_RESPONSE_METADATA_KEY_ROUTING.to_string(),
            "cloud".to_string(),
        );
        metadata.insert(
            MOONSHOT_RESPONSE_METADATA_KEY_API.to_string(),
            "chat.completions".to_string(),
        );
        metadata.insert(
            MOONSHOT_RESPONSE_METADATA_KEY_PROVIDER_FAMILY.to_string(),
            "moonshot".to_string(),
        );

        Ok(GenerateResponse {
            provider_id: MOONSHOT_KIMI_PROVIDER_ID.to_string(),
            model: response.model,
            output_text,
            finish_reason: choice.finish_reason,
            usage,
            metadata,
            latency_ms,
        })
    }

    fn simulate_chat_completion(
        &self,
        request: &MoonshotKimiChatRequest,
    ) -> MoonshotKimiChatResponse {
        let prompt = request
            .messages
            .iter()
            .rev()
            .find(|message| message.role == "user")
            .map(|message| message.content.as_str())
            .unwrap_or("");

        let prompt_tokens = estimate_token_count(prompt);
        let temperature = request.temperature.unwrap_or(0.7);
        let completion_tokens = 70.min(request.max_tokens.unwrap_or(70).max(1));

        MoonshotKimiChatResponse {
            model: request.model.clone(),
            choices: vec![MoonshotKimiChoice {
                message: MoonshotKimiMessage {
                    role: "assistant".to_string(),
                    content: format!(
                        "Moonshot Kimi [{}] generated a cloud response (temp={temperature:.2}) for: {}",
                        request.model, prompt
                    ),
                },
                finish_reason: Some("stop".to_string()),
            }],
            usage: Some(MoonshotKimiUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens.saturating_add(completion_tokens),
            }),
        }
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
        request: &MoonshotKimiChatRequest,
    ) -> Result<(MoonshotKimiChatResponse, u64), MoonshotKimiAdapterError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(MOONSHOT_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| MoonshotKimiAdapterError::HttpTransport(error.to_string()))?;

        let started = Instant::now();
        let response = client
            .post(self.chat_completions_endpoint())
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .json(request)
            .send()
            .map_err(|error| MoonshotKimiAdapterError::HttpTransport(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| MoonshotKimiAdapterError::HttpTransport(error.to_string()))?;
        if !status.is_success() {
            return Err(MoonshotKimiAdapterError::HttpStatus {
                status: status.as_u16(),
                body: trim_error_body(&body, 240),
            });
        }

        let parsed: MoonshotKimiLiveChatResponse = serde_json::from_str(&body)
            .map_err(|error| MoonshotKimiAdapterError::InvalidApiPayload(error.to_string()))?;
        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or(MoonshotKimiAdapterError::MissingChoice)?;
        let content = choice.message.content.trim().to_string();
        if content.is_empty() {
            return Err(MoonshotKimiAdapterError::MissingChoice);
        }

        let normalized = MoonshotKimiChatResponse {
            model: if parsed.model.trim().is_empty() {
                request.model.clone()
            } else {
                parsed.model
            },
            choices: vec![MoonshotKimiChoice {
                message: MoonshotKimiMessage {
                    role: "assistant".to_string(),
                    content,
                },
                finish_reason: choice.finish_reason,
            }],
            usage: parsed.usage.map(|usage| MoonshotKimiUsage {
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
        text: &str,
    ) -> Result<Vec<f64>, MoonshotKimiAdapterError> {
        let input = text.trim();
        if input.is_empty() {
            return Err(MoonshotKimiAdapterError::EmptyEmbeddingInput);
        }

        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(MOONSHOT_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| MoonshotKimiAdapterError::HttpTransport(error.to_string()))?;

        let response = client
            .post(self.embeddings_endpoint())
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .json(&MoonshotKimiEmbeddingRequest {
                model: self.config.model.clone(),
                input: input.to_string(),
            })
            .send()
            .map_err(|error| MoonshotKimiAdapterError::HttpTransport(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| MoonshotKimiAdapterError::HttpTransport(error.to_string()))?;
        if !status.is_success() {
            return Err(MoonshotKimiAdapterError::HttpStatus {
                status: status.as_u16(),
                body: trim_error_body(&body, 240),
            });
        }

        let parsed: MoonshotKimiEmbeddingResponse = serde_json::from_str(&body)
            .map_err(|error| MoonshotKimiAdapterError::InvalidApiPayload(error.to_string()))?;
        parsed
            .data
            .into_iter()
            .next()
            .map(|row| row.embedding)
            .ok_or(MoonshotKimiAdapterError::EmptyEmbeddingInput)
    }
}

impl ComputeProvider for MoonshotKimiProvider {
    fn provider_id(&self) -> &'static str {
        MOONSHOT_KIMI_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Cloud
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        self.ensure_available("health_check")
            .map_err(|error| error.to_compute_error())?;

        if self.ensure_api_key().is_err() {
            return Ok(ProviderHealth::unhealthy(
                MOONSHOT_KIMI_PROVIDER_ID,
                ProviderKind::Cloud,
                Some("missing or invalid Moonshot API key".to_string()),
            ));
        }

        Ok(ProviderHealth::healthy(
            MOONSHOT_KIMI_PROVIDER_ID,
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
        let api_key = self
            .ensure_api_key()
            .map_err(|error| error.to_compute_error())?;

        let input = text.trim();
        if input.is_empty() {
            return Err(MoonshotKimiAdapterError::EmptyEmbeddingInput.to_compute_error());
        }

        if self.config.live_api {
            self.request_live_embedding(api_key, input)
                .map_err(|error| error.to_compute_error())
        } else {
            Ok(normalized_ascii_embedding(
                &format!("{}::{input}", self.config.model),
                24,
                0x6D_6F_6F_6E_73_68,
            ))
        }
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
            (self.simulate_chat_completion(&request), 132)
        };
        self.map_response(response, latency_ms)
            .map_err(|error| error.to_compute_error())
    }
}

#[derive(Debug, Clone, PartialEq)]
enum MoonshotKimiAdapterError {
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

impl MoonshotKimiAdapterError {
    fn to_compute_error(&self) -> ComputeError {
        match self {
            Self::ProviderUnavailable(message) => {
                ComputeError::provider_unavailable(MOONSHOT_KIMI_PROVIDER_ID, message)
            }
            Self::MissingApiKey => {
                ComputeError::invalid_request("moonshot api key is not configured")
            }
            Self::InvalidApiKeyFormat => {
                ComputeError::invalid_request("moonshot api key appears to be invalid")
            }
            Self::InvalidTemperature(value) => ComputeError::invalid_request(format!(
                "temperature {value} is out of range; expected 0.0..=2.0"
            )),
            Self::EmptyPrompt => {
                ComputeError::invalid_request("prompt cannot be empty for generation")
            }
            Self::MissingChoice => ComputeError::internal(
                MOONSHOT_KIMI_PROVIDER_ID,
                "moonshot completion did not include text",
            ),
            Self::EmptyEmbeddingInput => {
                ComputeError::invalid_request("embedding text cannot be empty")
            }
            Self::HttpTransport(message) => ComputeError::provider_unavailable(
                MOONSHOT_KIMI_PROVIDER_ID,
                format!("moonshot live api transport error: {message}"),
            ),
            Self::HttpStatus { status, body } => {
                if *status == 401 || *status == 403 {
                    ComputeError::invalid_request(format!(
                        "moonshot api rejected credentials/permissions (status {status}): {body}"
                    ))
                } else {
                    ComputeError::provider_unavailable(
                        MOONSHOT_KIMI_PROVIDER_ID,
                        format!("moonshot api request failed (status {status}): {body}"),
                    )
                }
            }
            Self::InvalidApiPayload(message) => ComputeError::internal(
                MOONSHOT_KIMI_PROVIDER_ID,
                format!("moonshot api payload could not be parsed: {message}"),
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
struct MoonshotKimiChatRequest {
    model: String,
    messages: Vec<MoonshotKimiMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct MoonshotKimiMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MoonshotKimiChoice {
    message: MoonshotKimiMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct MoonshotKimiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MoonshotKimiChatResponse {
    model: String,
    choices: Vec<MoonshotKimiChoice>,
    usage: Option<MoonshotKimiUsage>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
struct MoonshotKimiEmbeddingRequest {
    model: String,
    input: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct MoonshotKimiEmbeddingResponse {
    data: Vec<MoonshotKimiEmbeddingData>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct MoonshotKimiEmbeddingData {
    embedding: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct MoonshotKimiLiveChatResponse {
    model: String,
    choices: Vec<MoonshotKimiLiveChoice>,
    usage: Option<MoonshotKimiUsage>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct MoonshotKimiLiveChoice {
    message: MoonshotKimiMessage,
    finish_reason: Option<String>,
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
        let provider = MoonshotKimiProvider::default();

        let health = provider
            .health_check()
            .expect("health check should return status");
        assert!(!health.is_healthy);
        assert_eq!(health.provider_id, MOONSHOT_KIMI_PROVIDER_ID);
    }

    #[test]
    fn generation_requires_key() {
        let provider = MoonshotKimiProvider::default();
        let result = provider.generate_response(GenerateRequest::new("hello"));

        let error = result.expect_err("missing key should fail");
        assert_eq!(error.kind, crate::compute::ComputeErrorKind::InvalidRequest);
    }

    #[test]
    fn generation_maps_to_normalized_shape() {
        let mut provider = MoonshotKimiProvider::default();
        provider.set_api_key("moonshot-test-key");

        let response = provider
            .generate_response(
                GenerateRequest::new("write a compact summary")
                    .with_metadata(MOONSHOT_KIMI_MODEL_METADATA_KEY, "moonshot-v1-32k"),
            )
            .expect("generation should succeed");

        assert_eq!(response.provider_id, MOONSHOT_KIMI_PROVIDER_ID);
        assert_eq!(response.model, "moonshot-v1-32k");
        assert!(response.output_text.contains("compact summary"));
        assert!(response.metadata.contains_key("provider_family"));
    }

    #[test]
    fn embedding_returns_non_empty_vector() {
        let mut provider = MoonshotKimiProvider::default();
        provider.set_api_key("moonshot-test-key");

        let embedding = provider
            .get_embedding("constitutional graph state")
            .expect("embedding should succeed");
        assert!(!embedding.is_empty());
    }

    #[test]
    fn provider_and_metadata_key_contracts_are_stable() {
        assert_eq!(MOONSHOT_KIMI_PROVIDER_ID, "moonshot_kimi");
        assert_eq!(MOONSHOT_KIMI_MODEL_METADATA_KEY, "moonshot_model");
        assert_eq!(MOONSHOT_RESPONSE_METADATA_KEY_BASE_URL, "base_url");
        assert_eq!(MOONSHOT_RESPONSE_METADATA_KEY_ROUTING, "routing");
        assert_eq!(MOONSHOT_RESPONSE_METADATA_KEY_API, "api");
        assert_eq!(
            MOONSHOT_RESPONSE_METADATA_KEY_PROVIDER_FAMILY,
            "provider_family"
        );
    }

    #[test]
    fn default_config_keeps_live_api_disabled_for_deterministic_tests() {
        assert!(!MoonshotKimiConfig::default().live_api);
    }
}
