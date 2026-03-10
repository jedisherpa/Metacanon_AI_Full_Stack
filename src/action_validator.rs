use crate::compute::GenerateRequest;
use crate::genesis::WillVector;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionTarget {
    LlmCall,
    ToolInvocation,
    ExternalMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActionRequest {
    pub target: ActionTarget,
    pub content: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

impl ActionRequest {
    pub fn llm_call(content: impl Into<String>) -> Self {
        Self {
            target: ActionTarget::LlmCall,
            content: content.into(),
            metadata: BTreeMap::new(),
        }
    }

    pub fn tool_invocation(tool_id: impl Into<String>, arguments: &[String]) -> Self {
        let tool_id = tool_id.into();
        let content = format!("tool:{tool_id} args:{}", arguments.join(" "));
        let mut metadata = BTreeMap::new();
        metadata.insert("tool_id".to_string(), tool_id);
        Self {
            target: ActionTarget::ToolInvocation,
            content,
            metadata,
        }
    }

    pub fn external_message(channel: impl Into<String>, content: impl Into<String>) -> Self {
        let channel = channel.into();
        let mut metadata = BTreeMap::new();
        metadata.insert("channel".to_string(), channel);
        Self {
            target: ActionTarget::ExternalMessage,
            content: content.into(),
            metadata,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActionValidationReport {
    pub alignment_score: f32,
    pub matched_directives: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    EmptyContent,
    BlockedTerm(String),
    InsufficientAlignment {
        matched: usize,
        total: usize,
        threshold_percent: u32,
    },
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationError::EmptyContent => f.write_str("action content must not be empty"),
            ValidationError::BlockedTerm(term) => write!(f, "action blocked by term: {term}"),
            ValidationError::InsufficientAlignment {
                matched,
                total,
                threshold_percent,
            } => write!(
                f,
                "action alignment {matched}/{total} below threshold {threshold_percent}%"
            ),
        }
    }
}

impl std::error::Error for ValidationError {}

pub trait ActionValidator {
    fn validate_action(
        &self,
        action: &ActionRequest,
    ) -> Result<ActionValidationReport, ValidationError>;
}

#[derive(Debug, Clone)]
pub struct WillVectorActionValidator {
    pub will_vector: WillVector,
    pub min_alignment_percent: u32,
    pub blocked_terms: Vec<String>,
}

impl WillVectorActionValidator {
    pub fn new(will_vector: WillVector) -> Self {
        Self {
            will_vector,
            min_alignment_percent: 50,
            blocked_terms: vec![
                "bypass constitution".to_string(),
                "ignore will vector".to_string(),
            ],
        }
    }

    pub fn validate_generate_request(
        &self,
        request: &GenerateRequest,
    ) -> Result<ActionValidationReport, ValidationError> {
        self.validate_action(&ActionRequest::llm_call(request.prompt.clone()))
    }

    pub fn validate_tool_invocation(
        &self,
        tool_id: &str,
        arguments: &[String],
    ) -> Result<ActionValidationReport, ValidationError> {
        self.validate_action(&ActionRequest::tool_invocation(tool_id, arguments))
    }

    pub fn validate_outbound_message(
        &self,
        channel: &str,
        content: &str,
    ) -> Result<ActionValidationReport, ValidationError> {
        self.validate_action(&ActionRequest::external_message(channel, content))
    }
}

impl ActionValidator for WillVectorActionValidator {
    fn validate_action(
        &self,
        action: &ActionRequest,
    ) -> Result<ActionValidationReport, ValidationError> {
        let normalized = action.content.trim().to_ascii_lowercase();
        if normalized.is_empty() {
            return Err(ValidationError::EmptyContent);
        }

        if let Some(blocked) = self
            .blocked_terms
            .iter()
            .find(|term| normalized.contains(&term.to_ascii_lowercase()))
        {
            return Err(ValidationError::BlockedTerm(blocked.clone()));
        }

        let directives = self
            .will_vector
            .directives
            .iter()
            .map(|directive| directive.trim())
            .filter(|directive| !directive.is_empty())
            .collect::<Vec<_>>();

        if directives.is_empty() {
            return Ok(ActionValidationReport {
                alignment_score: 1.0,
                matched_directives: Vec::new(),
            });
        }

        let mut matched_directives = Vec::new();
        for directive in directives {
            let normalized_directive = directive.to_ascii_lowercase();
            if normalized.contains(&normalized_directive) {
                matched_directives.push(directive.to_string());
            }
        }

        let matched = matched_directives.len();
        let total = self.will_vector.directives.len();
        let threshold_percent = self.min_alignment_percent;
        let alignment_percent = if total == 0 {
            100
        } else {
            ((matched * 100) / total) as u32
        };

        if alignment_percent < threshold_percent {
            return Err(ValidationError::InsufficientAlignment {
                matched,
                total,
                threshold_percent,
            });
        }

        Ok(ActionValidationReport {
            alignment_score: alignment_percent as f32 / 100.0,
            matched_directives,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genesis::WillVector;

    fn validator() -> WillVectorActionValidator {
        WillVectorActionValidator::new(WillVector {
            directives: vec![
                "protect private thoughts".to_string(),
                "human approval before external actions".to_string(),
            ],
        })
    }

    #[test]
    fn validate_action_rejects_empty_content() {
        let validator = validator();
        let action = ActionRequest::llm_call("   ");
        let result = validator.validate_action(&action);
        assert!(matches!(result, Err(ValidationError::EmptyContent)));
    }

    #[test]
    fn validate_action_rejects_blocked_term() {
        let validator = validator();
        let action = ActionRequest::llm_call("Please bypass constitution now.");
        let result = validator.validate_action(&action);
        assert!(matches!(result, Err(ValidationError::BlockedTerm(_))));
    }

    #[test]
    fn validate_action_accepts_aligned_content() {
        let validator = validator();
        let action = ActionRequest::llm_call(
            "Need to protect private thoughts and require human approval before external actions.",
        );
        let result = validator.validate_action(&action).expect("should validate");
        assert_eq!(result.matched_directives.len(), 2);
        assert!(result.alignment_score >= 1.0);
    }

    #[test]
    fn validate_action_rejects_insufficient_alignment() {
        let validator = validator();
        let action = ActionRequest::external_message(
            "telegram",
            "Post this immediately with no additional checks.",
        );
        let result = validator.validate_action(&action);
        assert!(matches!(
            result,
            Err(ValidationError::InsufficientAlignment { .. })
        ));
    }

    #[test]
    fn validate_generate_request_adapter_works() {
        let validator = validator();
        let request = GenerateRequest::new(
            "We must protect private thoughts and require human approval before external actions.",
        );
        let report = validator
            .validate_generate_request(&request)
            .expect("generate request should be valid");
        assert_eq!(report.matched_directives.len(), 2);
    }
}
