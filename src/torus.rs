use crate::compute::{
    AttemptedProviderError, ComputeError, ComputeRouter, GenerateRequest, GenerateResponse,
    RoutingFailure, PROVIDER_OLLAMA, PROVIDER_QWEN_LOCAL,
};
use crate::observability::{ObservabilityError, ObservabilityLogger};
use std::collections::HashSet;
use std::error::Error;
use std::fmt;

pub const FALLBACK_QWEN_PROVIDER_ID: &str = PROVIDER_QWEN_LOCAL;
pub const FALLBACK_OLLAMA_PROVIDER_ID: &str = PROVIDER_OLLAMA;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    EmptyPrompt,
    BlockedByWillVector(String),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EmptyPrompt => f.write_str("prompt cannot be empty"),
            ValidationError::BlockedByWillVector(reason) => {
                write!(f, "request blocked by will vector: {reason}")
            }
        }
    }
}

impl Error for ValidationError {}

pub trait ActionValidator {
    fn validate_action(&self, request: &GenerateRequest) -> Result<(), ValidationError>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DefaultActionValidator;

impl ActionValidator for DefaultActionValidator {
    fn validate_action(&self, request: &GenerateRequest) -> Result<(), ValidationError> {
        if request.prompt.trim().is_empty() {
            return Err(ValidationError::EmptyPrompt);
        }

        if let Some(reason) = request.metadata.get("blocked_by_will_vector") {
            return Err(ValidationError::BlockedByWillVector(reason.clone()));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TorusConfig {
    pub cloud_fallback_priority: Vec<String>,
}

impl TorusConfig {
    pub fn with_cloud_fallback_priority<I, S>(priority: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            cloud_fallback_priority: dedupe_provider_priority(priority),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct DeliberationTorus {
    config: TorusConfig,
}

impl DeliberationTorus {
    pub fn new(config: TorusConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &TorusConfig {
        &self.config
    }

    pub fn set_cloud_fallback_priority<I, S>(&mut self, priority: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.config.cloud_fallback_priority = dedupe_provider_priority(priority);
    }

    pub fn fallback_chain_for_request(
        &self,
        router: &ComputeRouter,
        provider_override: Option<&str>,
    ) -> Vec<String> {
        let requested_provider = router.resolve_provider_id(provider_override);
        let mut seen = HashSet::new();
        let mut chain = Vec::new();

        let mut push = |provider_id: String| {
            if seen.insert(provider_id.clone()) {
                chain.push(provider_id);
            }
        };

        push(requested_provider);
        push(FALLBACK_QWEN_PROVIDER_ID.to_string());
        push(FALLBACK_OLLAMA_PROVIDER_ID.to_string());

        for provider_id in &self.config.cloud_fallback_priority {
            push(provider_id.clone());
        }

        chain
    }

    pub fn deliberate<V: ActionValidator>(
        &self,
        router: &ComputeRouter,
        request: GenerateRequest,
        trace_id: &str,
        validator: &V,
        observability: Option<&ObservabilityLogger>,
    ) -> Result<GenerateResponse, TorusError> {
        validator
            .validate_action(&request)
            .map_err(TorusError::Validation)?;

        let requested_provider = router.resolve_provider_id(request.provider_override.as_deref());
        let chain = self.fallback_chain_for_request(router, request.provider_override.as_deref());
        let mut attempts = Vec::new();

        for (index, provider_id) in chain.iter().enumerate() {
            let attempt_index = u32::try_from(index + 1).unwrap_or(u32::MAX);

            let Some(provider) = router.provider(provider_id) else {
                let error = ComputeError::provider_not_registered(provider_id.clone());
                attempts.push(AttemptedProviderError {
                    provider_id: provider_id.clone(),
                    error: error.clone(),
                });

                if let Some(next_provider) = chain.get(index + 1) {
                    if let Some(logger) = observability {
                        logger
                            .record_fallback_transition(
                                trace_id,
                                provider_id,
                                next_provider,
                                &error.message,
                                attempt_index,
                            )
                            .map_err(TorusError::Observability)?;
                    }
                }
                continue;
            };

            let mut provider_request = request.clone();
            provider_request.provider_override = Some(provider_id.clone());

            match provider.generate_response(provider_request) {
                Ok(mut response) => {
                    if response.provider_id.trim().is_empty() {
                        response.provider_id = provider.provider_id().to_string();
                    }

                    if let Some(logger) = observability {
                        logger
                            .record_deliberation_success(
                                trace_id,
                                &requested_provider,
                                &response.provider_id,
                                attempt_index,
                            )
                            .map_err(TorusError::Observability)?;
                    }

                    return Ok(response);
                }
                Err(error) => {
                    attempts.push(AttemptedProviderError {
                        provider_id: provider_id.clone(),
                        error: error.clone(),
                    });

                    if let Some(next_provider) = chain.get(index + 1) {
                        if let Some(logger) = observability {
                            logger
                                .record_fallback_transition(
                                    trace_id,
                                    provider_id,
                                    next_provider,
                                    &error.message,
                                    attempt_index,
                                )
                                .map_err(TorusError::Observability)?;
                        }
                    }
                }
            }
        }

        let failure = RoutingFailure {
            requested_provider: requested_provider.clone(),
            attempts,
        };

        if let Some(logger) = observability {
            let attempt_chain: Vec<String> = failure
                .attempts
                .iter()
                .map(|attempt| format!("{} => {}", attempt.provider_id, attempt.error))
                .collect();
            logger
                .record_deliberation_failure(trace_id, &requested_provider, &attempt_chain)
                .map_err(TorusError::Observability)?;
        }

        Err(TorusError::Routing(failure))
    }
}

#[derive(Debug)]
pub enum TorusError {
    Validation(ValidationError),
    Routing(RoutingFailure),
    Observability(ObservabilityError),
}

impl fmt::Display for TorusError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TorusError::Validation(error) => write!(f, "validation failed: {error}"),
            TorusError::Routing(error) => write!(f, "{error}"),
            TorusError::Observability(error) => write!(f, "observability failed: {error}"),
        }
    }
}

impl Error for TorusError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            TorusError::Validation(error) => Some(error),
            TorusError::Observability(error) => Some(error),
            TorusError::Routing(_) => None,
        }
    }
}

fn dedupe_provider_priority<I, S>(priority: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for provider_id in priority.into_iter().filter_map(normalize_provider_id) {
        if seen.insert(provider_id.clone()) {
            normalized.push(provider_id);
        }
    }

    normalized
}

fn normalize_provider_id(provider_id: impl Into<String>) -> Option<String> {
    let normalized = provider_id.into();
    let normalized = normalized.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    Some(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::{
        ComputeError, ComputeErrorKind, ComputeProvider, ComputeResult, ProviderHealth,
        ProviderKind,
    };
    use crate::observability::ObservabilityConfig;
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Debug)]
    struct MockProvider {
        id: &'static str,
        kind: ProviderKind,
        fail_generate: bool,
        model: &'static str,
        calls: Arc<AtomicUsize>,
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
            Ok(vec![1.0, 0.0])
        }

        fn generate_response(&self, req: GenerateRequest) -> ComputeResult<GenerateResponse> {
            self.calls.fetch_add(1, Ordering::Relaxed);

            if self.fail_generate {
                return Err(ComputeError::internal(
                    self.id,
                    "simulated provider failure",
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
        calls: Arc<AtomicUsize>,
    ) -> Arc<dyn ComputeProvider> {
        Arc::new(MockProvider {
            id,
            kind,
            fail_generate,
            model: "mock-model",
            calls,
        })
    }

    #[test]
    fn fallback_chain_is_active_then_qwen_then_ollama_then_cloud() {
        let router = ComputeRouter::new(PROVIDER_QWEN_LOCAL);
        let torus = DeliberationTorus::new(TorusConfig::with_cloud_fallback_priority([
            "openai",
            "anthropic",
        ]));

        let chain = torus.fallback_chain_for_request(&router, Some("openai"));
        assert_eq!(
            chain,
            vec![
                "openai".to_string(),
                FALLBACK_QWEN_PROVIDER_ID.to_string(),
                FALLBACK_OLLAMA_PROVIDER_ID.to_string(),
                "anthropic".to_string(),
            ]
        );
    }

    #[test]
    fn deliberate_falls_back_through_required_sequence() {
        let mut router = ComputeRouter::new("openai");

        router.register_provider(mock_provider(
            "openai",
            ProviderKind::Cloud,
            true,
            Arc::new(AtomicUsize::new(0)),
        ));
        router.register_provider(mock_provider(
            FALLBACK_QWEN_PROVIDER_ID,
            ProviderKind::Local,
            true,
            Arc::new(AtomicUsize::new(0)),
        ));
        router.register_provider(mock_provider(
            FALLBACK_OLLAMA_PROVIDER_ID,
            ProviderKind::Local,
            false,
            Arc::new(AtomicUsize::new(0)),
        ));

        let torus = DeliberationTorus::new(TorusConfig::with_cloud_fallback_priority([
            "openai",
            "anthropic",
        ]));

        let response = torus
            .deliberate(
                &router,
                GenerateRequest::new("test prompt").with_provider_override("openai"),
                "trace-fallback",
                &DefaultActionValidator,
                None,
            )
            .expect("fallback should succeed via ollama");

        assert_eq!(response.provider_id, FALLBACK_OLLAMA_PROVIDER_ID);
    }

    #[test]
    fn deliberate_returns_routing_error_with_attempt_chain_when_all_fail() {
        let mut router = ComputeRouter::new("openai");

        router.register_provider(mock_provider(
            "openai",
            ProviderKind::Cloud,
            true,
            Arc::new(AtomicUsize::new(0)),
        ));
        router.register_provider(mock_provider(
            FALLBACK_QWEN_PROVIDER_ID,
            ProviderKind::Local,
            true,
            Arc::new(AtomicUsize::new(0)),
        ));
        router.register_provider(mock_provider(
            FALLBACK_OLLAMA_PROVIDER_ID,
            ProviderKind::Local,
            true,
            Arc::new(AtomicUsize::new(0)),
        ));

        let torus = DeliberationTorus::new(TorusConfig::with_cloud_fallback_priority([
            "openai",
            "anthropic",
        ]));

        let error = torus
            .deliberate(
                &router,
                GenerateRequest::new("test prompt").with_provider_override("openai"),
                "trace-all-fail",
                &DefaultActionValidator,
                None,
            )
            .expect_err("all providers should fail");

        match error {
            TorusError::Routing(failure) => {
                assert_eq!(failure.requested_provider, "openai");
                assert_eq!(failure.attempts.len(), 4);
                assert_eq!(failure.attempts[0].provider_id, "openai");
                assert_eq!(failure.attempts[1].provider_id, FALLBACK_QWEN_PROVIDER_ID);
                assert_eq!(failure.attempts[2].provider_id, FALLBACK_OLLAMA_PROVIDER_ID);
                assert_eq!(failure.attempts[3].provider_id, "anthropic");
                assert_eq!(
                    failure.attempts[3].error.kind,
                    ComputeErrorKind::ProviderNotRegistered
                );
            }
            other => panic!("expected routing error, got: {other}"),
        }
    }

    #[test]
    fn deliberate_validates_before_any_provider_dispatch() {
        struct RejectAllValidator;
        impl ActionValidator for RejectAllValidator {
            fn validate_action(&self, _request: &GenerateRequest) -> Result<(), ValidationError> {
                Err(ValidationError::BlockedByWillVector(
                    "policy block".to_string(),
                ))
            }
        }

        let calls = Arc::new(AtomicUsize::new(0));
        let mut router = ComputeRouter::new(FALLBACK_QWEN_PROVIDER_ID);
        router.register_provider(mock_provider(
            FALLBACK_QWEN_PROVIDER_ID,
            ProviderKind::Local,
            false,
            calls.clone(),
        ));

        let torus = DeliberationTorus::default();
        let error = torus
            .deliberate(
                &router,
                GenerateRequest::new("blocked"),
                "trace-validate",
                &RejectAllValidator,
                None,
            )
            .expect_err("validation should fail");

        assert!(matches!(error, TorusError::Validation(_)));
        assert_eq!(calls.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn deliberate_emits_observability_records_for_fallback_and_success() {
        let mut router = ComputeRouter::new("openai");
        router.register_provider(mock_provider(
            "openai",
            ProviderKind::Cloud,
            true,
            Arc::new(AtomicUsize::new(0)),
        ));
        router.register_provider(mock_provider(
            FALLBACK_QWEN_PROVIDER_ID,
            ProviderKind::Local,
            false,
            Arc::new(AtomicUsize::new(0)),
        ));

        let mut log_dir = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        log_dir.push(format!("metacanon-torus-observability-{nonce}"));
        let logger = ObservabilityLogger::new(ObservabilityConfig::for_log_dir(
            log_dir,
            b"torus-observability-key".to_vec(),
        ))
        .expect("logger should initialize");

        let torus = DeliberationTorus::new(TorusConfig::with_cloud_fallback_priority(["openai"]));
        let response = torus
            .deliberate(
                &router,
                GenerateRequest::new("test prompt").with_provider_override("openai"),
                "trace-observability",
                &DefaultActionValidator,
                Some(&logger),
            )
            .expect("fallback should succeed");
        assert_eq!(response.provider_id, FALLBACK_QWEN_PROVIDER_ID);

        let redacted_events = logger
            .read_redacted_events()
            .expect("redacted events should parse");
        assert!(redacted_events
            .iter()
            .any(|event| event.event_type == "fallback_transition"));
        assert!(redacted_events
            .iter()
            .any(|event| event.event_type == "deliberation_outcome"));
    }
}
