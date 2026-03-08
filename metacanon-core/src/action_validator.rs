use crate::compute::GenerateRequest;
use std::error::Error;
use std::fmt;

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
