use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::compute::{
    estimate_token_count, normalized_ascii_embedding, ComputeError, ComputeProvider, ComputeResult,
    GenerateRequest, GenerateResponse, ProviderHealth, ProviderKind, TokenUsage, PROVIDER_OLLAMA,
};

pub const OLLAMA_PROVIDER_ID: &str = PROVIDER_OLLAMA;
pub const OLLAMA_DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
pub const OLLAMA_DEFAULT_MODEL: &str = "qwen3.5:32b-instruct-q8_0";
pub const OLLAMA_MODEL_METADATA_KEY: &str = "ollama_model";
pub const OLLAMA_DEFAULT_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OllamaConfig {
    pub base_url: String,
    pub default_model: String,
    pub installed_models: Vec<String>,
    pub live_api: bool,
    pub available: bool,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        let default_model = OLLAMA_DEFAULT_MODEL.to_string();
        Self {
            base_url: OLLAMA_DEFAULT_BASE_URL.to_string(),
            default_model: default_model.clone(),
            installed_models: vec![default_model],
            live_api: false,
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OllamaProvider {
    config: OllamaConfig,
}

impl OllamaProvider {
    pub fn new(config: OllamaConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &OllamaConfig {
        &self.config
    }

    pub fn mark_available(&mut self) {
        self.config.available = true;
    }

    pub fn mark_unavailable(&mut self) {
        self.config.available = false;
    }

    pub fn set_installed_models<I, S>(&mut self, models: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let mut deduped = Vec::new();

        for model in models.into_iter().map(Into::into) {
            let trimmed = model.trim();
            if trimmed.is_empty() {
                continue;
            }
            if !deduped.iter().any(|existing: &String| existing == trimmed) {
                deduped.push(trimmed.to_string());
            }
        }

        self.config.installed_models = deduped;
    }

    pub fn installed_models(&self) -> &[String] {
        &self.config.installed_models
    }

    pub fn resolve_model_for_request(&self, req: &GenerateRequest) -> ComputeResult<String> {
        match req.metadata.get(OLLAMA_MODEL_METADATA_KEY) {
            Some(model) => {
                let requested = model.trim();
                if requested.is_empty() {
                    return Err(ComputeError::invalid_request(
                        "ollama model override cannot be empty",
                    ));
                }
                if self.config.live_api
                    || self
                        .config
                        .installed_models
                        .iter()
                        .any(|installed| installed == requested)
                {
                    Ok(requested.to_string())
                } else {
                    Err(ComputeError::invalid_request(format!(
                        "ollama model '{requested}' is not installed locally"
                    )))
                }
            }
            None => {
                if self.config.live_api {
                    return Ok(self.config.default_model.clone());
                }

                if self
                    .config
                    .installed_models
                    .iter()
                    .any(|installed| installed == &self.config.default_model)
                {
                    return Ok(self.config.default_model.clone());
                }

                if let Some(first_model) = self.config.installed_models.first() {
                    return Ok(first_model.clone());
                }

                Err(ComputeError::provider_unavailable(
                    OLLAMA_PROVIDER_ID,
                    "no installed local models available",
                ))
            }
        }
    }

    fn unavailable_error(&self, action: &str) -> ComputeError {
        ComputeError::provider_unavailable(
            OLLAMA_PROVIDER_ID,
            format!("ollama runtime unavailable during {action}"),
        )
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.config.base_url.trim_end_matches('/'), path)
    }

    fn build_http_client(&self) -> ComputeResult<reqwest::blocking::Client> {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(OLLAMA_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| {
                ComputeError::provider_unavailable(
                    OLLAMA_PROVIDER_ID,
                    format!("failed to initialize local ollama http client: {error}"),
                )
            })
    }

    fn map_live_http_error(&self, action: &str, error: impl std::fmt::Display) -> ComputeError {
        ComputeError::provider_unavailable(
            OLLAMA_PROVIDER_ID,
            format!("ollama live {action} failed: {error}"),
        )
    }

    fn request_live_generate(
        &self,
        req: &GenerateRequest,
        model: &str,
    ) -> ComputeResult<(OllamaGenerateResponse, u64)> {
        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(ComputeError::invalid_request(
                "prompt cannot be empty for generation",
            ));
        }

        let payload = OllamaGenerateRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            stream: false,
            system: req
                .system_prompt
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
            options: Some(OllamaGenerateOptions {
                temperature: req.temperature,
                num_predict: req.max_tokens,
            }),
        };

        let client = self.build_http_client()?;
        let started = Instant::now();
        let response = client
            .post(self.endpoint("api/generate"))
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .map_err(|error| self.map_live_http_error("generate", error))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| self.map_live_http_error("generate", error))?;

        if !status.is_success() {
            return Err(self.map_live_http_error(
                "generate",
                format!("http {}: {}", status.as_u16(), trim_error_body(&body, 240)),
            ));
        }

        let parsed: OllamaGenerateResponse = serde_json::from_str(&body).map_err(|error| {
            self.map_live_http_error("generate", format!("invalid json payload: {error}"))
        })?;

        Ok((parsed, started.elapsed().as_millis() as u64))
    }

    fn request_live_embedding(&self, text: &str, model: &str) -> ComputeResult<Vec<f64>> {
        let input = text.trim();
        if input.is_empty() {
            return Err(ComputeError::invalid_request(
                "embedding text cannot be empty",
            ));
        }

        let payload = OllamaEmbeddingRequest {
            model: model.to_string(),
            prompt: input.to_string(),
        };

        let client = self.build_http_client()?;
        let response = client
            .post(self.endpoint("api/embeddings"))
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .map_err(|error| self.map_live_http_error("embedding", error))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| self.map_live_http_error("embedding", error))?;

        if !status.is_success() {
            return Err(self.map_live_http_error(
                "embedding",
                format!("http {}: {}", status.as_u16(), trim_error_body(&body, 240)),
            ));
        }

        let parsed: OllamaEmbeddingResponse = serde_json::from_str(&body).map_err(|error| {
            self.map_live_http_error("embedding", format!("invalid json payload: {error}"))
        })?;

        if parsed.embedding.is_empty() {
            return Err(
                self.map_live_http_error("embedding", "empty embedding returned by local runtime")
            );
        }

        Ok(parsed.embedding)
    }

    fn probe_live_api(&self) -> Result<(), String> {
        let client = self
            .build_http_client()
            .map_err(|error| error.message.clone())?;
        let response = client
            .get(self.endpoint("api/tags"))
            .send()
            .map_err(|error| error.to_string())?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("http status {}", response.status().as_u16()))
        }
    }
}

impl ComputeProvider for OllamaProvider {
    fn provider_id(&self) -> &'static str {
        OLLAMA_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Local
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        if !self.config.available {
            return Err(self.unavailable_error("health_check"));
        }

        if self.config.live_api {
            match self.probe_live_api() {
                Ok(()) => {
                    return Ok(ProviderHealth::healthy(
                        OLLAMA_PROVIDER_ID,
                        ProviderKind::Local,
                        Some(format!(
                            "live_api=true, base_url={}, default_model={}",
                            self.config.base_url, self.config.default_model
                        )),
                    ));
                }
                Err(error) => {
                    return Ok(ProviderHealth::unhealthy(
                        OLLAMA_PROVIDER_ID,
                        ProviderKind::Local,
                        Some(format!(
                            "live_api=true, base_url={}, probe_error={error}",
                            self.config.base_url
                        )),
                    ));
                }
            }
        }

        Ok(ProviderHealth::healthy(
            OLLAMA_PROVIDER_ID,
            ProviderKind::Local,
            Some(format!(
                "live_api=false, base_url={}, default_model={}, installed_models={}",
                self.config.base_url,
                self.config.default_model,
                self.config.installed_models.len()
            )),
        ))
    }

    fn get_embedding(&self, text: &str) -> ComputeResult<Vec<f64>> {
        if !self.config.available {
            return Err(self.unavailable_error("get_embedding"));
        }
        if text.trim().is_empty() {
            return Err(ComputeError::invalid_request(
                "embedding text cannot be empty",
            ));
        }

        let model = self.config.default_model.clone();
        if self.config.live_api {
            return self.request_live_embedding(text, &model);
        }

        Ok(normalized_ascii_embedding(text, 16, 0x6F_6C_6C_61))
    }

    fn generate_response(&self, req: GenerateRequest) -> ComputeResult<GenerateResponse> {
        if !self.config.available {
            return Err(self.unavailable_error("generate_response"));
        }

        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(ComputeError::invalid_request(
                "prompt cannot be empty for generation",
            ));
        }

        let selected_model = self.resolve_model_for_request(&req)?;

        if self.config.live_api {
            let (response, latency_ms) = self.request_live_generate(&req, &selected_model)?;
            let output_text = response.response.trim().to_string();
            if output_text.is_empty() {
                return Err(self.map_live_http_error("generate", "empty response text"));
            }

            let usage = response.prompt_eval_count.zip(response.eval_count).map(
                |(prompt_tokens, completion_tokens)| TokenUsage {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens: prompt_tokens.saturating_add(completion_tokens),
                },
            );

            let mut metadata = BTreeMap::new();
            metadata.insert("base_url".to_string(), self.config.base_url.clone());
            metadata.insert("routing".to_string(), "local_live".to_string());
            metadata.insert("api".to_string(), "api/generate".to_string());

            return Ok(GenerateResponse {
                provider_id: OLLAMA_PROVIDER_ID.to_string(),
                model: response.model,
                output_text,
                finish_reason: response.done_reason,
                usage,
                metadata,
                latency_ms,
            });
        }

        let prompt_tokens = estimate_token_count(prompt);
        let completion_tokens = 40;
        let usage = TokenUsage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens.saturating_add(completion_tokens),
        };

        let mut metadata = BTreeMap::new();
        metadata.insert("base_url".to_string(), self.config.base_url.clone());
        metadata.insert("routing".to_string(), "local_simulated".to_string());
        metadata.insert("selected_model".to_string(), selected_model.clone());

        Ok(GenerateResponse {
            provider_id: OLLAMA_PROVIDER_ID.to_string(),
            model: selected_model.clone(),
            output_text: format!(
                "Ollama [{}] generated a local response for: {}",
                selected_model, prompt
            ),
            finish_reason: Some("stop".to_string()),
            usage: Some(usage),
            metadata,
            latency_ms: 28,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaGenerateOptions>,
}

#[derive(Debug, Clone, Serialize)]
struct OllamaGenerateOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaGenerateResponse {
    model: String,
    response: String,
    #[serde(default)]
    done_reason: Option<String>,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
    #[serde(default)]
    eval_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct OllamaEmbeddingRequest {
    model: String,
    prompt: String,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaEmbeddingResponse {
    embedding: Vec<f64>,
}

fn trim_error_body(body: &str, limit: usize) -> String {
    let trimmed = body.trim();
    if trimmed.len() <= limit {
        return trimmed.to_string();
    }
    let mut end = limit;
    while !trimmed.is_char_boundary(end) {
        end = end.saturating_sub(1);
    }
    format!("{}...", &trimmed[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_expose_local_registry_contract() {
        let provider = OllamaProvider::default();
        let config = provider.config();

        assert_eq!(config.base_url, OLLAMA_DEFAULT_BASE_URL);
        assert_eq!(config.default_model, OLLAMA_DEFAULT_MODEL);
        assert!(config.installed_models.contains(&config.default_model));
    }

    #[test]
    fn default_config_keeps_live_api_disabled_for_deterministic_tests() {
        let provider = OllamaProvider::default();
        assert!(!provider.config().live_api);
    }

    #[test]
    fn explicit_model_override_is_used_when_model_is_installed() {
        let mut provider = OllamaProvider::default();
        provider.set_installed_models(["qwen3.5:32b-instruct-q8_0", "llama3.2:3b"]);

        let request =
            GenerateRequest::new("hello").with_metadata(OLLAMA_MODEL_METADATA_KEY, "llama3.2:3b");

        let model = provider
            .resolve_model_for_request(&request)
            .expect("model override should resolve");

        assert_eq!(model, "llama3.2:3b");
    }

    #[test]
    fn unknown_model_override_is_rejected() {
        let provider = OllamaProvider::default();
        let request =
            GenerateRequest::new("hello").with_metadata(OLLAMA_MODEL_METADATA_KEY, "missing:model");

        let result = provider.resolve_model_for_request(&request);
        assert!(result.is_err());
        let error = result.expect_err("unknown model should fail");
        assert_eq!(error.kind, crate::compute::ComputeErrorKind::InvalidRequest);
    }

    #[test]
    fn generation_returns_selected_model_in_response() {
        let provider = OllamaProvider::default();
        let request = GenerateRequest::new("test prompt");

        let response = provider
            .generate_response(request)
            .expect("generation should succeed");

        assert_eq!(response.provider_id, OLLAMA_PROVIDER_ID);
        assert_eq!(response.model, OLLAMA_DEFAULT_MODEL);
    }

    #[test]
    fn empty_registry_rejects_generation_model_resolution() {
        let mut provider = OllamaProvider::default();
        provider.set_installed_models::<Vec<String>, String>(Vec::new());

        let request = GenerateRequest::new("test prompt");
        let error = provider
            .resolve_model_for_request(&request)
            .expect_err("expected missing local model error");
        assert_eq!(
            error.kind,
            crate::compute::ComputeErrorKind::ProviderUnavailable
        );
    }
}
