use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;
use std::sync::Arc;

pub const PROVIDER_QWEN_LOCAL: &str = "qwen_local";
pub const PROVIDER_OLLAMA: &str = "ollama";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderKind {
    Local,
    Cloud,
    Decentralized,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderHealth {
    pub provider_id: String,
    pub kind: ProviderKind,
    pub is_healthy: bool,
    pub detail: Option<String>,
}

impl ProviderHealth {
    pub fn healthy(
        provider_id: impl Into<String>,
        kind: ProviderKind,
        detail: impl Into<Option<String>>,
    ) -> Self {
        Self {
            provider_id: provider_id.into(),
            kind,
            is_healthy: true,
            detail: detail.into(),
        }
    }

    pub fn unhealthy(
        provider_id: impl Into<String>,
        kind: ProviderKind,
        detail: impl Into<Option<String>>,
    ) -> Self {
        Self {
            provider_id: provider_id.into(),
            kind,
            is_healthy: false,
            detail: detail.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComputeErrorKind {
    ProviderUnavailable,
    ProviderNotRegistered,
    InvalidRequest,
    Unsupported,
    Timeout,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComputeError {
    pub kind: ComputeErrorKind,
    pub provider_id: Option<String>,
    pub message: String,
}

impl ComputeError {
    pub fn new(
        kind: ComputeErrorKind,
        provider_id: Option<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            kind,
            provider_id,
            message: message.into(),
        }
    }

    pub fn provider_unavailable(
        provider_id: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::new(
            ComputeErrorKind::ProviderUnavailable,
            Some(provider_id.into()),
            message,
        )
    }

    pub fn provider_not_registered(provider_id: impl Into<String>) -> Self {
        let provider_id = provider_id.into();
        Self::new(
            ComputeErrorKind::ProviderNotRegistered,
            Some(provider_id.clone()),
            format!("provider '{provider_id}' is not registered"),
        )
    }

    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(ComputeErrorKind::InvalidRequest, None, message)
    }

    pub fn internal(provider_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(
            ComputeErrorKind::Internal,
            Some(provider_id.into()),
            message,
        )
    }
}

impl fmt::Display for ComputeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.provider_id {
            Some(provider_id) => write!(f, "{:?}({provider_id}): {}", self.kind, self.message),
            None => write!(f, "{:?}: {}", self.kind, self.message),
        }
    }
}

impl std::error::Error for ComputeError {}

pub type ComputeResult<T> = Result<T, ComputeError>;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct GenerateRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub provider_override: Option<String>,
    pub metadata: BTreeMap<String, String>,
}

impl GenerateRequest {
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            ..Self::default()
        }
    }

    pub fn with_provider_override(mut self, provider_id: impl Into<String>) -> Self {
        self.provider_override = Some(provider_id.into());
        self
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GenerateResponse {
    pub provider_id: String,
    pub model: String,
    pub output_text: String,
    pub finish_reason: Option<String>,
    pub usage: Option<TokenUsage>,
    pub metadata: BTreeMap<String, String>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EmbeddingResponse {
    pub provider_id: String,
    pub embedding: Vec<f64>,
}

pub trait ComputeProvider: Send + Sync {
    fn provider_id(&self) -> &'static str;
    fn kind(&self) -> ProviderKind;
    fn health_check(&self) -> ComputeResult<ProviderHealth>;
    fn get_embedding(&self, text: &str) -> ComputeResult<Vec<f64>>;
    fn generate_response(&self, req: GenerateRequest) -> ComputeResult<GenerateResponse>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttemptedProviderError {
    pub provider_id: String,
    pub error: ComputeError,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutingFailure {
    pub requested_provider: String,
    pub attempts: Vec<AttemptedProviderError>,
}

impl fmt::Display for RoutingFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(
            f,
            "failed to generate response for requested provider '{}':",
            self.requested_provider
        )?;
        for attempt in &self.attempts {
            writeln!(f, "- {} => {}", attempt.provider_id, attempt.error)?;
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct ComputeRouter {
    providers: HashMap<String, Arc<dyn ComputeProvider>>,
    global_default_provider: String,
    local_fallback_priority: Vec<String>,
    cloud_fallback_priority: Vec<String>,
}

impl ComputeRouter {
    pub fn new(global_default_provider: impl Into<String>) -> Self {
        let global_default_provider = normalize_provider_id(global_default_provider.into())
            .unwrap_or_else(|| PROVIDER_QWEN_LOCAL.to_string());

        Self {
            providers: HashMap::new(),
            global_default_provider,
            local_fallback_priority: required_local_fallback_priority(),
            cloud_fallback_priority: Vec::new(),
        }
    }

    pub fn register_provider(
        &mut self,
        provider: Arc<dyn ComputeProvider>,
    ) -> Option<Arc<dyn ComputeProvider>> {
        let provider_id = normalize_provider_id(provider.provider_id())
            .expect("provider id returned by implementation cannot be empty");
        self.providers.insert(provider_id, provider)
    }

    pub fn contains_provider(&self, provider_id: &str) -> bool {
        normalize_provider_id(provider_id)
            .map(|provider_id| self.providers.contains_key(&provider_id))
            .unwrap_or(false)
    }

    pub fn provider(&self, provider_id: &str) -> Option<Arc<dyn ComputeProvider>> {
        normalize_provider_id(provider_id)
            .and_then(|provider_id| self.providers.get(&provider_id).cloned())
    }

    pub fn provider_ids(&self) -> Vec<String> {
        let mut provider_ids: Vec<_> = self.providers.keys().cloned().collect();
        provider_ids.sort();
        provider_ids
    }

    pub fn set_global_default_provider(&mut self, provider_id: impl Into<String>) {
        self.global_default_provider = normalize_provider_id(provider_id.into())
            .unwrap_or_else(|| self.global_default_provider.clone());
    }

    pub fn global_default_provider(&self) -> &str {
        &self.global_default_provider
    }

    pub fn set_local_fallback_priority<I, S>(&mut self, priority: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.local_fallback_priority = normalize_local_fallback_priority(priority);
    }

    pub fn set_cloud_fallback_priority<I, S>(&mut self, priority: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.cloud_fallback_priority = dedupe_provider_priority(priority);
    }

    pub fn resolve_provider_id(&self, provider_override: Option<&str>) -> String {
        provider_override
            .and_then(normalize_provider_id)
            .unwrap_or_else(|| self.global_default_provider.clone())
    }

    pub fn provider_chain_for_request(&self, provider_override: Option<&str>) -> Vec<String> {
        let requested_provider = self.resolve_provider_id(provider_override);
        let mut seen = HashSet::new();
        let mut chain = Vec::new();

        let mut push = |provider_id: String| {
            if seen.insert(provider_id.clone()) {
                chain.push(provider_id);
            }
        };

        push(requested_provider);

        for provider_id in &self.local_fallback_priority {
            push(provider_id.clone());
        }

        for provider_id in &self.cloud_fallback_priority {
            push(provider_id.clone());
        }

        chain
    }

    pub fn available_provider_chain_for_request(
        &self,
        provider_override: Option<&str>,
    ) -> Vec<String> {
        self.provider_chain_for_request(provider_override)
            .into_iter()
            .filter(|provider_id| self.providers.contains_key(provider_id))
            .collect()
    }

    pub fn route_generate(&self, req: GenerateRequest) -> Result<GenerateResponse, RoutingFailure> {
        let requested_provider = self.resolve_provider_id(req.provider_override.as_deref());
        let chain = self.provider_chain_for_request(req.provider_override.as_deref());

        let mut attempts = Vec::new();

        for provider_id in chain {
            let Some(provider) = self.providers.get(&provider_id) else {
                attempts.push(AttemptedProviderError {
                    provider_id: provider_id.clone(),
                    error: ComputeError::provider_not_registered(provider_id),
                });
                continue;
            };

            match provider.generate_response(req.clone()) {
                Ok(mut response) => {
                    if response.provider_id.trim().is_empty() {
                        response.provider_id = provider.provider_id().to_string();
                    }
                    return Ok(response);
                }
                Err(error) => attempts.push(AttemptedProviderError {
                    provider_id: provider.provider_id().to_string(),
                    error,
                }),
            }
        }

        Err(RoutingFailure {
            requested_provider,
            attempts,
        })
    }

    pub fn route_embedding(
        &self,
        text: &str,
        provider_override: Option<&str>,
    ) -> Result<EmbeddingResponse, RoutingFailure> {
        let requested_provider = self.resolve_provider_id(provider_override);
        let chain = self.provider_chain_for_request(provider_override);

        let mut attempts = Vec::new();

        for provider_id in chain {
            let Some(provider) = self.providers.get(&provider_id) else {
                attempts.push(AttemptedProviderError {
                    provider_id: provider_id.clone(),
                    error: ComputeError::provider_not_registered(provider_id),
                });
                continue;
            };

            match provider.get_embedding(text) {
                Ok(embedding) => {
                    return Ok(EmbeddingResponse {
                        provider_id: provider.provider_id().to_string(),
                        embedding,
                    });
                }
                Err(error) => attempts.push(AttemptedProviderError {
                    provider_id: provider.provider_id().to_string(),
                    error,
                }),
            }
        }

        Err(RoutingFailure {
            requested_provider,
            attempts,
        })
    }

    pub fn health_snapshot(&self) -> Vec<ComputeResult<ProviderHealth>> {
        let mut provider_ids: Vec<_> = self.providers.keys().cloned().collect();
        provider_ids.sort();

        provider_ids
            .into_iter()
            .filter_map(|provider_id| self.providers.get(&provider_id))
            .map(|provider| provider.health_check())
            .collect()
    }
}

pub fn estimate_token_count(text: &str) -> u32 {
    u32::try_from(text.split_whitespace().count()).unwrap_or(u32::MAX)
}

pub fn normalized_ascii_embedding(text: &str, dimensions: usize, salt: u64) -> Vec<f64> {
    if dimensions == 0 {
        return Vec::new();
    }

    let mut buckets = vec![0_u64; dimensions];

    for (index, byte) in text.bytes().enumerate() {
        let slot = (index + (salt as usize)) % dimensions;
        let mix = ((index as u64 + 1).wrapping_mul(0x9E37_79B9)) ^ (byte as u64) ^ salt;
        buckets[slot] = buckets[slot]
            .wrapping_mul(1_099_511_628_211)
            .wrapping_add(mix);
    }

    let max = buckets.iter().copied().max().unwrap_or(0);
    if max == 0 {
        return vec![0.0; dimensions];
    }

    buckets
        .into_iter()
        .map(|value| value as f64 / max as f64)
        .collect()
}

fn dedupe_provider_priority<I, S>(priority: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for provider_id in priority.into_iter() {
        if let Some(provider_id) = normalize_provider_id(provider_id.into()) {
            if seen.insert(provider_id.clone()) {
                normalized.push(provider_id);
            }
        }
    }

    normalized
}

fn required_local_fallback_priority() -> Vec<String> {
    vec![PROVIDER_QWEN_LOCAL.to_string(), PROVIDER_OLLAMA.to_string()]
}

fn normalize_local_fallback_priority<I, S>(priority: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut normalized = required_local_fallback_priority();
    let mut seen: HashSet<String> = normalized.iter().cloned().collect();

    for provider_id in dedupe_provider_priority(priority) {
        if seen.insert(provider_id.clone()) {
            normalized.push(provider_id);
        }
    }

    normalized
}

fn normalize_provider_id(provider_id: impl AsRef<str>) -> Option<String> {
    let trimmed = provider_id.as_ref().trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug)]
    struct MockProvider {
        id: &'static str,
        kind: ProviderKind,
        fail_generate: bool,
        fail_embedding: bool,
        model: &'static str,
    }

    impl ComputeProvider for MockProvider {
        fn provider_id(&self) -> &'static str {
            self.id
        }

        fn kind(&self) -> ProviderKind {
            self.kind
        }

        fn health_check(&self) -> ComputeResult<ProviderHealth> {
            Ok(ProviderHealth::healthy(
                self.id,
                self.kind,
                Some("ok".to_string()),
            ))
        }

        fn get_embedding(&self, _text: &str) -> ComputeResult<Vec<f64>> {
            if self.fail_embedding {
                return Err(ComputeError::internal(
                    self.id,
                    "mock embedding failure",
                ));
            }

            Ok(vec![1.0, 0.0])
        }

        fn generate_response(&self, req: GenerateRequest) -> ComputeResult<GenerateResponse> {
            if self.fail_generate {
                return Err(ComputeError::internal(
                    self.id,
                    "mock provider failure",
                ));
            }

            Ok(GenerateResponse {
                provider_id: self.id.to_string(),
                model: self.model.to_string(),
                output_text: format!("{} handled: {}", self.id, req.prompt),
                finish_reason: Some("stop".to_string()),
                usage: None,
                metadata: BTreeMap::new(),
                latency_ms: 1,
            })
        }
    }

    fn mock_provider(
        id: &'static str,
        kind: ProviderKind,
        fail_generate: bool,
        fail_embedding: bool,
    ) -> Arc<dyn ComputeProvider> {
        Arc::new(MockProvider {
            id,
            kind,
            fail_generate,
            fail_embedding,
            model: "mock-model",
        })
    }

    #[test]
    fn provider_chain_follows_override_then_local_then_cloud() {
        let mut router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        router.set_cloud_fallback_priority(["openai", "anthropic"]);

        let chain = router.provider_chain_for_request(Some("openai"));
        assert_eq!(
            chain,
            vec![
                "openai".to_string(),
                PROVIDER_QWEN_LOCAL.to_string(),
                PROVIDER_OLLAMA.to_string(),
                "anthropic".to_string(),
            ]
        );
    }

    #[test]
    fn blank_override_uses_global_default() {
        let router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        assert_eq!(router.resolve_provider_id(Some("   ")), PROVIDER_QWEN_LOCAL);
    }

    #[test]
    fn route_generate_falls_back_to_ollama_when_qwen_fails() {
        let mut router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        router.set_cloud_fallback_priority(["openai"]);

        router.register_provider(mock_provider(
            PROVIDER_QWEN_LOCAL,
            ProviderKind::Local,
            true,
            false,
        ));
        router.register_provider(mock_provider(
            PROVIDER_OLLAMA,
            ProviderKind::Local,
            false,
            false,
        ));
        router.register_provider(mock_provider("openai", ProviderKind::Cloud, false, false));

        let request = GenerateRequest::new("test prompt");
        let response = router
            .route_generate(request)
            .expect("fallback should succeed");

        assert_eq!(response.provider_id, PROVIDER_OLLAMA);
    }

    #[test]
    fn route_generate_surfaces_attempt_chain_when_all_attempts_fail() {
        let mut router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        router.set_cloud_fallback_priority(["openai"]);

        router.register_provider(mock_provider(
            PROVIDER_QWEN_LOCAL,
            ProviderKind::Local,
            true,
            false,
        ));

        let request = GenerateRequest::new("test prompt");
        let failure = router
            .route_generate(request)
            .expect_err("routing should fail");

        assert_eq!(failure.requested_provider, PROVIDER_QWEN_LOCAL);
        assert_eq!(failure.attempts.len(), 3);
        assert_eq!(
            failure.attempts[0].error.kind,
            ComputeErrorKind::Internal,
            "qwen should fail with provider error"
        );
        assert_eq!(
            failure.attempts[1].error.kind,
            ComputeErrorKind::ProviderNotRegistered,
            "ollama should be attempted as local fallback"
        );
        assert_eq!(
            failure.attempts[2].provider_id, "openai",
            "cloud fallback should be attempted last"
        );
    }

    #[test]
    fn set_local_fallback_priority_preserves_required_local_order() {
        let mut router = ComputeRouter::new("openai");
        router.set_local_fallback_priority(["ollama", "qwen_local", "lan_local"]);

        let chain = router.provider_chain_for_request(Some("openai"));
        assert_eq!(
            chain,
            vec![
                "openai".to_string(),
                PROVIDER_QWEN_LOCAL.to_string(),
                PROVIDER_OLLAMA.to_string(),
                "lan_local".to_string(),
            ]
        );
    }

    #[test]
    fn route_embedding_falls_back_to_ollama_when_qwen_embedding_fails() {
        let mut router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        router.set_cloud_fallback_priority(["openai"]);

        router.register_provider(mock_provider(
            PROVIDER_QWEN_LOCAL,
            ProviderKind::Local,
            false,
            true,
        ));
        router.register_provider(mock_provider(
            PROVIDER_OLLAMA,
            ProviderKind::Local,
            false,
            false,
        ));
        router.register_provider(mock_provider("openai", ProviderKind::Cloud, false, false));

        let response = router
            .route_embedding("embed this", None)
            .expect("embedding fallback should succeed");

        assert_eq!(response.provider_id, PROVIDER_OLLAMA);
        assert_eq!(response.embedding, vec![1.0, 0.0]);
    }

    #[test]
    fn route_embedding_surfaces_attempt_chain_when_all_attempts_fail() {
        let mut router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        router.set_cloud_fallback_priority(["openai"]);

        router.register_provider(mock_provider(
            PROVIDER_QWEN_LOCAL,
            ProviderKind::Local,
            false,
            true,
        ));

        let failure = router
            .route_embedding("embed this", None)
            .expect_err("embedding should fail");

        assert_eq!(failure.requested_provider, PROVIDER_QWEN_LOCAL);
        assert_eq!(failure.attempts.len(), 3);
        assert_eq!(
            failure.attempts[0].error.kind,
            ComputeErrorKind::Internal,
            "qwen embedding failure should be first"
        );
        assert_eq!(
            failure.attempts[1].error.kind,
            ComputeErrorKind::ProviderNotRegistered,
            "ollama should be attempted as local fallback"
        );
        assert_eq!(failure.attempts[2].provider_id, "openai");
    }
}
