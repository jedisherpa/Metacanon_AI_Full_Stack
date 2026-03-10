use std::collections::BTreeMap;
use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::compute::{
    estimate_token_count, normalized_ascii_embedding, ComputeError, ComputeProvider, ComputeResult,
    GenerateRequest, GenerateResponse, ProviderHealth, ProviderKind, TokenUsage,
    PROVIDER_QWEN_LOCAL,
};

pub const QWEN_LOCAL_PROVIDER_ID: &str = PROVIDER_QWEN_LOCAL;
pub const QWEN_DEFAULT_LOCAL_TARGET: &str = "Qwen 3.5 32B Instruct GGUF Q8_0";
pub const QWEN_DEFAULT_DOWNGRADE_PROFILE: &str = "Q5_K_M";
pub const QWEN_DOWNGRADE_LOCAL_TARGET: &str = "Qwen 3.5 32B Instruct GGUF Q5_K_M";
pub const QWEN_PROFILE_METADATA_KEY: &str = "qwen_profile";
pub const QWEN_DEFAULT_BASE_URL: &str = "http://127.0.0.1:11434";
pub const QWEN_DEFAULT_PRIMARY_MODEL_ID: &str = "qwen3.5:32b-instruct-q8_0";
pub const QWEN_DEFAULT_DOWNGRADE_MODEL_ID: &str = "qwen3.5:32b-instruct-q5_k_m";
pub const QWEN_DEFAULT_LLAMACPP_BINARY: &str = "llama-cli";
pub const QWEN_DEFAULT_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QwenLocalConfig {
    pub primary_target: String,
    pub downgrade_profile: String,
    pub downgrade_target: String,
    pub runtime_backend: String,
    pub base_url: String,
    pub primary_model_id: String,
    pub downgrade_model_id: String,
    pub llama_cpp_binary: String,
    pub llama_cpp_model_path: String,
    pub live_api: bool,
    pub available: bool,
}

impl Default for QwenLocalConfig {
    fn default() -> Self {
        Self {
            primary_target: QWEN_DEFAULT_LOCAL_TARGET.to_string(),
            downgrade_profile: QWEN_DEFAULT_DOWNGRADE_PROFILE.to_string(),
            downgrade_target: QWEN_DOWNGRADE_LOCAL_TARGET.to_string(),
            runtime_backend: "llama.cpp".to_string(),
            base_url: QWEN_DEFAULT_BASE_URL.to_string(),
            primary_model_id: QWEN_DEFAULT_PRIMARY_MODEL_ID.to_string(),
            downgrade_model_id: QWEN_DEFAULT_DOWNGRADE_MODEL_ID.to_string(),
            llama_cpp_binary: QWEN_DEFAULT_LLAMACPP_BINARY.to_string(),
            llama_cpp_model_path: String::new(),
            live_api: false,
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct QwenLocalProvider {
    config: QwenLocalConfig,
}

impl QwenLocalProvider {
    pub fn new(config: QwenLocalConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &QwenLocalConfig {
        &self.config
    }

    pub fn mark_available(&mut self) {
        self.config.available = true;
    }

    pub fn mark_unavailable(&mut self) {
        self.config.available = false;
    }

    pub fn select_target_for_request<'a>(&'a self, req: &GenerateRequest) -> &'a str {
        if self.request_uses_downgrade(req) {
            &self.config.downgrade_target
        } else {
            &self.config.primary_target
        }
    }

    fn select_runtime_model_for_request<'a>(&'a self, req: &GenerateRequest) -> &'a str {
        if self.request_uses_downgrade(req) {
            &self.config.downgrade_model_id
        } else {
            &self.config.primary_model_id
        }
    }

    fn request_uses_downgrade(&self, req: &GenerateRequest) -> bool {
        match req.metadata.get(QWEN_PROFILE_METADATA_KEY) {
            Some(profile) => {
                let normalized = profile.trim().to_ascii_uppercase();
                normalized == "DOWNGRADE"
                    || normalized == self.config.downgrade_profile.to_ascii_uppercase()
            }
            None => false,
        }
    }

    fn unavailable_error(&self, action: &str) -> ComputeError {
        ComputeError::provider_unavailable(
            QWEN_LOCAL_PROVIDER_ID,
            format!("qwen local runtime unavailable during {action}"),
        )
    }

    fn backend_is_ollama(&self) -> bool {
        self.config
            .runtime_backend
            .to_ascii_lowercase()
            .contains("ollama")
    }

    fn backend_is_llama_cpp(&self) -> bool {
        self.config
            .runtime_backend
            .to_ascii_lowercase()
            .contains("llama")
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.config.base_url.trim_end_matches('/'), path)
    }

    fn build_http_client(&self) -> ComputeResult<reqwest::blocking::Client> {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(QWEN_DEFAULT_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| {
                ComputeError::provider_unavailable(
                    QWEN_LOCAL_PROVIDER_ID,
                    format!("failed to initialize qwen local http client: {error}"),
                )
            })
    }

    fn map_live_error(&self, action: &str, error: impl std::fmt::Display) -> ComputeError {
        ComputeError::provider_unavailable(
            QWEN_LOCAL_PROVIDER_ID,
            format!("qwen local live {action} failed: {error}"),
        )
    }

    fn probe_live_backend(&self) -> Result<(), String> {
        if self.backend_is_ollama() {
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
        } else if self.backend_is_llama_cpp() {
            let output = Command::new(&self.config.llama_cpp_binary)
                .arg("--help")
                .output()
                .map_err(|error| error.to_string())?;
            if output.status.success() {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
            }
        } else {
            Err(format!(
                "unsupported runtime_backend '{}'",
                self.config.runtime_backend
            ))
        }
    }

    fn request_live_generate_ollama(
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
            .map_err(|error| self.map_live_error("generate", error))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| self.map_live_error("generate", error))?;

        if !status.is_success() {
            return Err(self.map_live_error(
                "generate",
                format!("http {}: {}", status.as_u16(), trim_error_body(&body, 240)),
            ));
        }

        let parsed: OllamaGenerateResponse = serde_json::from_str(&body)
            .map_err(|error| self.map_live_error("generate", format!("invalid json: {error}")))?;

        Ok((parsed, started.elapsed().as_millis() as u64))
    }

    fn request_live_embedding_ollama(&self, text: &str, model: &str) -> ComputeResult<Vec<f64>> {
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
            .map_err(|error| self.map_live_error("embedding", error))?;

        let status = response.status();
        let body = response
            .text()
            .map_err(|error| self.map_live_error("embedding", error))?;

        if !status.is_success() {
            return Err(self.map_live_error(
                "embedding",
                format!("http {}: {}", status.as_u16(), trim_error_body(&body, 240)),
            ));
        }

        let parsed: OllamaEmbeddingResponse = serde_json::from_str(&body)
            .map_err(|error| self.map_live_error("embedding", format!("invalid json: {error}")))?;

        if parsed.embedding.is_empty() {
            return Err(self.map_live_error("embedding", "empty embedding vector"));
        }

        Ok(parsed.embedding)
    }

    fn request_live_generate_llama(
        &self,
        req: &GenerateRequest,
        selected_target: &str,
    ) -> ComputeResult<(String, u64)> {
        let model_path = self.config.llama_cpp_model_path.trim();
        if model_path.is_empty() {
            return Err(self.map_live_error("generate", "llama_cpp_model_path is not configured"));
        }

        let mut prompt = req.prompt.trim().to_string();
        if let Some(system_prompt) = req
            .system_prompt
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            prompt = format!("System:\n{system_prompt}\n\nUser:\n{prompt}");
        }

        let started = Instant::now();
        let mut command = Command::new(&self.config.llama_cpp_binary);
        command.arg("-m").arg(model_path);
        command.arg("-p").arg(prompt);
        command
            .arg("-n")
            .arg(req.max_tokens.unwrap_or(256).to_string());
        if let Some(temperature) = req.temperature {
            command.arg("--temp").arg(temperature.to_string());
        }

        let output = command
            .output()
            .map_err(|error| self.map_live_error("generate", error))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(self.map_live_error(
                "generate",
                format!(
                    "llama.cpp invocation failed for target '{}': {}",
                    selected_target,
                    stderr.trim()
                ),
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Err(self.map_live_error("generate", "llama.cpp produced empty output"));
        }

        Ok((stdout, started.elapsed().as_millis() as u64))
    }
}

impl ComputeProvider for QwenLocalProvider {
    fn provider_id(&self) -> &'static str {
        QWEN_LOCAL_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Local
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        if !self.config.available {
            return Err(self.unavailable_error("health_check"));
        }

        if self.config.live_api {
            match self.probe_live_backend() {
                Ok(()) => {
                    return Ok(ProviderHealth::healthy(
                        QWEN_LOCAL_PROVIDER_ID,
                        ProviderKind::Local,
                        Some(format!(
                            "live_api=true, backend={}, primary={}, downgrade={}",
                            self.config.runtime_backend,
                            self.config.primary_model_id,
                            self.config.downgrade_model_id
                        )),
                    ));
                }
                Err(error) => {
                    return Ok(ProviderHealth::unhealthy(
                        QWEN_LOCAL_PROVIDER_ID,
                        ProviderKind::Local,
                        Some(format!(
                            "live_api=true, backend={}, probe_error={error}",
                            self.config.runtime_backend
                        )),
                    ));
                }
            }
        }

        Ok(ProviderHealth::healthy(
            QWEN_LOCAL_PROVIDER_ID,
            ProviderKind::Local,
            Some(format!(
                "live_api=false, backend={}, primary={}, downgrade={} ({})",
                self.config.runtime_backend,
                self.config.primary_target,
                self.config.downgrade_target,
                self.config.downgrade_profile
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

        if self.config.live_api && self.backend_is_ollama() {
            return self.request_live_embedding_ollama(
                text,
                self.select_runtime_model_for_request(&GenerateRequest::new(text)),
            );
        }

        Ok(normalized_ascii_embedding(text, 16, 0x71_77_65_6E))
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

        let selected_target = self.select_target_for_request(&req).to_string();
        let selected_model = self.select_runtime_model_for_request(&req).to_string();

        if self.config.live_api {
            if self.backend_is_ollama() {
                let (response, latency_ms) =
                    self.request_live_generate_ollama(&req, &selected_model)?;
                let output_text = response.response.trim().to_string();
                if output_text.is_empty() {
                    return Err(self.map_live_error("generate", "empty response text"));
                }

                let usage = response.prompt_eval_count.zip(response.eval_count).map(
                    |(prompt_tokens, completion_tokens)| TokenUsage {
                        prompt_tokens,
                        completion_tokens,
                        total_tokens: prompt_tokens.saturating_add(completion_tokens),
                    },
                );

                let mut metadata = BTreeMap::new();
                metadata.insert(
                    "runtime_backend".to_string(),
                    self.config.runtime_backend.clone(),
                );
                metadata.insert("routing".to_string(), "local_live".to_string());
                metadata.insert("api".to_string(), "api/generate".to_string());
                metadata.insert("runtime_model".to_string(), selected_model.clone());
                metadata.insert("target_label".to_string(), selected_target);

                return Ok(GenerateResponse {
                    provider_id: QWEN_LOCAL_PROVIDER_ID.to_string(),
                    model: response.model,
                    output_text,
                    finish_reason: response.done_reason,
                    usage,
                    metadata,
                    latency_ms,
                });
            }

            if self.backend_is_llama_cpp() {
                let (output_text, latency_ms) =
                    self.request_live_generate_llama(&req, &selected_target)?;
                let mut metadata = BTreeMap::new();
                metadata.insert(
                    "runtime_backend".to_string(),
                    self.config.runtime_backend.clone(),
                );
                metadata.insert("routing".to_string(), "local_live".to_string());
                metadata.insert("api".to_string(), "llama.cpp-cli".to_string());
                metadata.insert("runtime_model".to_string(), selected_model.clone());
                metadata.insert("target_label".to_string(), selected_target);

                return Ok(GenerateResponse {
                    provider_id: QWEN_LOCAL_PROVIDER_ID.to_string(),
                    model: selected_model,
                    output_text,
                    finish_reason: Some("stop".to_string()),
                    usage: None,
                    metadata,
                    latency_ms,
                });
            }

            return Err(self.map_live_error(
                "generate",
                format!(
                    "unsupported runtime_backend '{}' for live mode",
                    self.config.runtime_backend
                ),
            ));
        }

        let downgrade = selected_target == self.config.downgrade_target;
        let completion_tokens = if downgrade { 32 } else { 48 };

        let prompt_tokens = estimate_token_count(prompt);
        let usage = TokenUsage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens.saturating_add(completion_tokens),
        };

        let mut metadata = BTreeMap::new();
        metadata.insert(
            "runtime_backend".to_string(),
            self.config.runtime_backend.clone(),
        );
        metadata.insert(
            "profile".to_string(),
            if downgrade {
                self.config.downgrade_profile.clone()
            } else {
                "Q8_0".to_string()
            },
        );
        metadata.insert("routing".to_string(), "local_simulated".to_string());
        metadata.insert("runtime_model".to_string(), selected_model.clone());

        Ok(GenerateResponse {
            provider_id: QWEN_LOCAL_PROVIDER_ID.to_string(),
            model: selected_target.clone(),
            output_text: format!(
                "Qwen local [{}] generated a local response for: {}",
                selected_target, prompt
            ),
            finish_reason: Some("stop".to_string()),
            usage: Some(usage),
            metadata,
            latency_ms: if downgrade { 42 } else { 35 },
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
    fn defaults_match_required_qwen_targets() {
        let provider = QwenLocalProvider::default();
        let config = provider.config();

        assert_eq!(config.primary_target, QWEN_DEFAULT_LOCAL_TARGET);
        assert_eq!(config.downgrade_profile, QWEN_DEFAULT_DOWNGRADE_PROFILE);
        assert_eq!(config.downgrade_target, QWEN_DOWNGRADE_LOCAL_TARGET);
    }

    #[test]
    fn default_config_keeps_live_api_disabled_for_deterministic_tests() {
        let provider = QwenLocalProvider::default();
        assert!(!provider.config().live_api);
    }

    #[test]
    fn downgrade_profile_selects_downgrade_target() {
        let provider = QwenLocalProvider::default();
        let request = GenerateRequest::new("hello")
            .with_metadata(QWEN_PROFILE_METADATA_KEY, QWEN_DEFAULT_DOWNGRADE_PROFILE);

        assert_eq!(
            provider.select_target_for_request(&request),
            QWEN_DOWNGRADE_LOCAL_TARGET
        );
    }

    #[test]
    fn unavailable_provider_fails_health_check() {
        let mut provider = QwenLocalProvider::default();
        provider.mark_unavailable();

        let result = provider.health_check();
        assert!(result.is_err());
        let error = result.expect_err("health check should fail when unavailable");
        assert_eq!(
            error.kind,
            crate::compute::ComputeErrorKind::ProviderUnavailable
        );
    }

    #[test]
    fn generation_uses_primary_target_by_default() {
        let provider = QwenLocalProvider::default();
        let request = GenerateRequest::new("test prompt");

        let response = provider
            .generate_response(request)
            .expect("generation should succeed");

        assert_eq!(response.provider_id, QWEN_LOCAL_PROVIDER_ID);
        assert_eq!(response.model, QWEN_DEFAULT_LOCAL_TARGET);
    }
}
