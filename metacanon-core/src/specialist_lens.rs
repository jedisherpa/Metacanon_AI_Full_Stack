use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

use crate::genesis::current_unix_timestamp;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SpecialistLensStatus {
    #[default]
    PendingApproval,
    Active,
    Revoked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpecialistLensDefinition {
    pub lens_definition_id: String,
    pub name: String,
    pub objective: String,
    #[serde(default)]
    pub capability_tags: Vec<String>,
    #[serde(default)]
    pub tool_allowlist: Vec<String>,
    #[serde(default)]
    pub requires_hitl_approval: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ActiveSpecialistLens {
    pub lens_id: String,
    pub lens_definition_id: String,
    pub name: String,
    pub objective: String,
    #[serde(default)]
    pub capability_tags: Vec<String>,
    #[serde(default)]
    pub tool_allowlist: Vec<String>,
    #[serde(default)]
    pub requires_hitl_approval: bool,
    #[serde(default)]
    pub customizations: Value,
    #[serde(default)]
    pub status: SpecialistLensStatus,
    pub contact_lens_text: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub revoked_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LensRuntimeError {
    EmptyLensId,
    EmptyLensDefinitionId,
    EmptyName,
    EmptyObjective,
    EmptyContactLensText,
    EmptyRevokeReason,
    InvalidStatusTransition,
}

impl std::fmt::Display for LensRuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LensRuntimeError::EmptyLensId => f.write_str("lens_id must not be empty"),
            LensRuntimeError::EmptyLensDefinitionId => {
                f.write_str("lens_definition_id must not be empty")
            }
            LensRuntimeError::EmptyName => f.write_str("name must not be empty"),
            LensRuntimeError::EmptyObjective => f.write_str("objective must not be empty"),
            LensRuntimeError::EmptyContactLensText => {
                f.write_str("contact_lens_text must not be empty")
            }
            LensRuntimeError::EmptyRevokeReason => f.write_str("revoke reason must not be empty"),
            LensRuntimeError::InvalidStatusTransition => {
                f.write_str("invalid specialist lens status transition")
            }
        }
    }
}

impl std::error::Error for LensRuntimeError {}

impl SpecialistLensDefinition {
    pub fn validate(&self) -> Result<(), LensRuntimeError> {
        if self.lens_definition_id.trim().is_empty() {
            return Err(LensRuntimeError::EmptyLensDefinitionId);
        }
        if self.name.trim().is_empty() {
            return Err(LensRuntimeError::EmptyName);
        }
        if self.objective.trim().is_empty() {
            return Err(LensRuntimeError::EmptyObjective);
        }
        Ok(())
    }
}

impl ActiveSpecialistLens {
    pub fn from_definition(
        lens_id: String,
        definition: &SpecialistLensDefinition,
        customizations: Value,
    ) -> Result<Self, LensRuntimeError> {
        definition.validate()?;
        if lens_id.trim().is_empty() {
            return Err(LensRuntimeError::EmptyLensId);
        }

        let now = current_unix_timestamp();
        Ok(Self {
            lens_id,
            lens_definition_id: definition.lens_definition_id.clone(),
            name: definition.name.clone(),
            objective: definition.objective.clone(),
            capability_tags: definition.capability_tags.clone(),
            tool_allowlist: definition.tool_allowlist.clone(),
            requires_hitl_approval: definition.requires_hitl_approval,
            customizations,
            status: SpecialistLensStatus::PendingApproval,
            contact_lens_text: None,
            created_at: now,
            updated_at: now,
            revoked_reason: None,
        })
    }

    pub fn approve_contact_lens(
        &mut self,
        contact_lens_text: &str,
    ) -> Result<(), LensRuntimeError> {
        if matches!(self.status, SpecialistLensStatus::Revoked) {
            return Err(LensRuntimeError::InvalidStatusTransition);
        }
        if contact_lens_text.trim().is_empty() {
            return Err(LensRuntimeError::EmptyContactLensText);
        }

        self.contact_lens_text = Some(contact_lens_text.trim().to_string());
        self.status = SpecialistLensStatus::Active;
        self.updated_at = current_unix_timestamp();
        Ok(())
    }

    pub fn revoke(&mut self, reason: &str) -> Result<(), LensRuntimeError> {
        if reason.trim().is_empty() {
            return Err(LensRuntimeError::EmptyRevokeReason);
        }
        if matches!(self.status, SpecialistLensStatus::Revoked) {
            return Err(LensRuntimeError::InvalidStatusTransition);
        }

        self.status = SpecialistLensStatus::Revoked;
        self.revoked_reason = Some(reason.trim().to_string());
        self.updated_at = current_unix_timestamp();
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        matches!(self.status, SpecialistLensStatus::Active)
    }

    pub fn supports_required_tags(&self, required_tags: &[String]) -> bool {
        if required_tags.is_empty() {
            return true;
        }

        let capability_set: HashSet<&str> = self
            .capability_tags
            .iter()
            .map(std::string::String::as_str)
            .collect();

        required_tags
            .iter()
            .map(std::string::String::as_str)
            .all(|tag| capability_set.contains(tag))
    }
}

pub fn select_active_lenses_for_tags(
    lenses: &[ActiveSpecialistLens],
    required_tags: &[String],
) -> Vec<String> {
    lenses
        .iter()
        .filter(|lens| lens.is_active())
        .filter(|lens| lens.supports_required_tags(required_tags))
        .map(|lens| lens.lens_id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn definition_to_active_lens_requires_approval() {
        let definition = SpecialistLensDefinition {
            lens_definition_id: "def-research".to_string(),
            name: "Research Lens".to_string(),
            objective: "Analyze documents".to_string(),
            capability_tags: vec!["analysis".to_string()],
            tool_allowlist: vec!["local_search".to_string()],
            requires_hitl_approval: true,
        };

        let mut lens =
            ActiveSpecialistLens::from_definition("lens-001".to_string(), &definition, Value::Null)
                .expect("definition should produce an active lens shell");

        assert_eq!(lens.status, SpecialistLensStatus::PendingApproval);
        lens.approve_contact_lens("Use evidence-first synthesis.")
            .expect("approval should succeed");
        assert_eq!(lens.status, SpecialistLensStatus::Active);
    }

    #[test]
    fn revoke_requires_reason() {
        let definition = SpecialistLensDefinition {
            lens_definition_id: "def-op".to_string(),
            name: "Ops Lens".to_string(),
            objective: "Handle runbooks".to_string(),
            capability_tags: vec![],
            tool_allowlist: vec![],
            requires_hitl_approval: false,
        };
        let mut lens =
            ActiveSpecialistLens::from_definition("lens-ops".to_string(), &definition, Value::Null)
                .expect("lens should be created");

        assert_eq!(lens.revoke(""), Err(LensRuntimeError::EmptyRevokeReason));
        lens.revoke("superseded").expect("valid revoke reason");
        assert_eq!(lens.status, SpecialistLensStatus::Revoked);
    }
}
