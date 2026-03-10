use crate::compute::{ComputeRouter, GenerateRequest, RoutingFailure};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrismSynthesisRequest {
    pub query: String,
    pub inputs: Vec<String>,
    #[serde(default)]
    pub provider_override: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

impl PrismSynthesisRequest {
    pub fn new(query: impl Into<String>, inputs: Vec<String>) -> Self {
        Self {
            query: query.into(),
            inputs,
            provider_override: None,
            system_prompt: None,
            metadata: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrismOutput {
    pub provider_id: String,
    pub model: String,
    pub content: String,
    pub source_count: usize,
    pub finish_reason: Option<String>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrismError {
    EmptyQuery,
    NoInputs,
    Routing(RoutingFailure),
}

impl std::fmt::Display for PrismError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PrismError::EmptyQuery => f.write_str("query must not be empty"),
            PrismError::NoInputs => f.write_str("at least one source input is required"),
            PrismError::Routing(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for PrismError {}

impl From<RoutingFailure> for PrismError {
    fn from(value: RoutingFailure) -> Self {
        Self::Routing(value)
    }
}

pub trait Prism {
    fn synthesize(
        &self,
        router: &ComputeRouter,
        request: PrismSynthesisRequest,
    ) -> Result<PrismOutput, PrismError>;
}

#[derive(Debug, Clone)]
pub struct DefaultPrism {
    synthesis_template: String,
}

impl Default for DefaultPrism {
    fn default() -> Self {
        Self {
            synthesis_template: "Synthesize the following lens outputs into one clear response.\nQuery: {query}\n\nLens Outputs:\n{inputs}\n".to_string(),
        }
    }
}

impl DefaultPrism {
    pub fn new(template: Option<String>) -> Self {
        if let Some(template) = template {
            let trimmed = template.trim();
            if !trimmed.is_empty() {
                return Self {
                    synthesis_template: trimmed.to_string(),
                };
            }
        }
        Self::default()
    }

    fn render_prompt(&self, request: &PrismSynthesisRequest) -> String {
        let formatted_inputs = request
            .inputs
            .iter()
            .enumerate()
            .map(|(index, content)| format!("{}. {}", index + 1, content.trim()))
            .collect::<Vec<_>>()
            .join("\n");

        self.synthesis_template
            .replace("{query}", request.query.trim())
            .replace("{inputs}", &formatted_inputs)
    }
}

impl Prism for DefaultPrism {
    fn synthesize(
        &self,
        router: &ComputeRouter,
        request: PrismSynthesisRequest,
    ) -> Result<PrismOutput, PrismError> {
        if request.query.trim().is_empty() {
            return Err(PrismError::EmptyQuery);
        }
        if request.inputs.is_empty() {
            return Err(PrismError::NoInputs);
        }

        let prompt = self.render_prompt(&request);
        let mut generate_request = GenerateRequest::new(prompt);
        generate_request.system_prompt = request.system_prompt.clone();
        generate_request.provider_override = request.provider_override.clone();
        generate_request.metadata = request.metadata.clone();
        generate_request.metadata.insert(
            "prism_source_count".to_string(),
            request.inputs.len().to_string(),
        );
        generate_request
            .metadata
            .insert("prism_query".to_string(), request.query.clone());

        let response = router.route_generate(generate_request)?;
        Ok(PrismOutput {
            provider_id: response.provider_id,
            model: response.model,
            content: response.output_text,
            source_count: request.inputs.len(),
            finish_reason: response.finish_reason,
            metadata: response.metadata,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::{
        ComputeError, ComputeErrorKind, ComputeProvider, GenerateResponse, ProviderHealth,
        ProviderKind,
    };
    use std::sync::Arc;

    struct MockProvider {
        id: &'static str,
        content: &'static str,
    }

    impl ComputeProvider for MockProvider {
        fn provider_id(&self) -> &'static str {
            self.id
        }

        fn kind(&self) -> ProviderKind {
            ProviderKind::Local
        }

        fn health_check(&self) -> Result<ProviderHealth, ComputeError> {
            Ok(ProviderHealth::healthy(self.id, self.kind(), None))
        }

        fn get_embedding(&self, text: &str) -> Result<Vec<f64>, ComputeError> {
            if text.trim().is_empty() {
                return Err(ComputeError::invalid_request("text cannot be empty"));
            }
            Ok(vec![0.1, 0.2, 0.3])
        }

        fn generate_response(
            &self,
            req: GenerateRequest,
        ) -> Result<GenerateResponse, ComputeError> {
            if req.prompt.trim().is_empty() {
                return Err(ComputeError::new(
                    ComputeErrorKind::InvalidRequest,
                    Some(self.id.to_string()),
                    "prompt cannot be empty",
                ));
            }
            Ok(GenerateResponse {
                provider_id: self.id.to_string(),
                model: format!("model-{}", self.id),
                output_text: self.content.to_string(),
                finish_reason: Some("stop".to_string()),
                usage: None,
                metadata: BTreeMap::new(),
                latency_ms: 1,
            })
        }
    }

    #[test]
    fn synthesize_rejects_empty_query() {
        let prism = DefaultPrism::default();
        let router = ComputeRouter::new("qwen_local");
        let request = PrismSynthesisRequest::new("   ", vec!["lens output".to_string()]);
        let result = prism.synthesize(&router, request);
        assert!(matches!(result, Err(PrismError::EmptyQuery)));
    }

    #[test]
    fn synthesize_rejects_missing_inputs() {
        let prism = DefaultPrism::default();
        let router = ComputeRouter::new("qwen_local");
        let request = PrismSynthesisRequest::new("query", Vec::new());
        let result = prism.synthesize(&router, request);
        assert!(matches!(result, Err(PrismError::NoInputs)));
    }

    #[test]
    fn synthesize_routes_through_compute_router() {
        let prism = DefaultPrism::default();
        let mut router = ComputeRouter::new("qwen_local");
        router.register_provider(Arc::new(MockProvider {
            id: "qwen_local",
            content: "Synthesis complete",
        }));

        let request = PrismSynthesisRequest::new(
            "What should we do next?",
            vec![
                "Lens 1: prefer private-by-default execution".to_string(),
                "Lens 2: keep a cloud fallback only for setup".to_string(),
            ],
        );
        let output = prism
            .synthesize(&router, request)
            .expect("synthesis should succeed");
        assert_eq!(output.provider_id, "qwen_local");
        assert_eq!(output.source_count, 2);
        assert_eq!(output.content, "Synthesis complete");
    }

    #[test]
    fn synthesize_honors_provider_override() {
        let prism = DefaultPrism::default();
        let mut router = ComputeRouter::new("qwen_local");
        router.register_provider(Arc::new(MockProvider {
            id: "qwen_local",
            content: "default",
        }));
        router.register_provider(Arc::new(MockProvider {
            id: "grok",
            content: "override",
        }));

        let mut request = PrismSynthesisRequest::new(
            "Pick the best option.",
            vec!["Lens output A".to_string(), "Lens output B".to_string()],
        );
        request.provider_override = Some("grok".to_string());

        let output = prism
            .synthesize(&router, request)
            .expect("override path should succeed");
        assert_eq!(output.provider_id, "grok");
        assert_eq!(output.content, "override");
    }
}
