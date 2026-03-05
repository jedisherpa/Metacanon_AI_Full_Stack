use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::genesis::current_unix_timestamp;
use crate::specialist_lens::ActiveSpecialistLens;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DeliberationMessageStatus {
    #[default]
    Routed,
    Converged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeliberationMessage {
    pub message_id: String,
    pub sub_sphere_id: String,
    pub deliberation_id: String,
    pub lens_id: String,
    pub body: String,
    #[serde(default)]
    pub status: DeliberationMessageStatus,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DeliverableStatus {
    #[default]
    PendingApproval,
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Deliverable {
    pub deliverable_id: String,
    pub sub_sphere_id: String,
    pub deliberation_id: String,
    pub content: String,
    #[serde(default)]
    pub status: DeliverableStatus,
    pub rejection_feedback: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PendingHitlActionType {
    #[default]
    ApproveDeliverable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingHitlAction {
    pub pending_action_id: String,
    pub sub_sphere_id: String,
    pub deliverable_id: String,
    #[serde(default)]
    pub action_type: PendingHitlActionType,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeliberationRecord {
    pub deliberation_id: String,
    pub sub_sphere_id: String,
    pub query: String,
    pub convergence_summary: String,
    pub deliverable_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubSphereQueryResult {
    pub deliberation_id: String,
    pub deliverable_id: String,
    pub pending_action_id: Option<String>,
    pub convergence_summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubSphereTorusError {
    EmptySubSphereId,
    EmptyQuery,
    NoActiveLenses,
    EmptyDeliverableId,
    EmptyPendingActionId,
    DeliverableNotFound(String),
    PendingActionNotFound(String),
    SubSphereMismatch,
}

impl std::fmt::Display for SubSphereTorusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubSphereTorusError::EmptySubSphereId => f.write_str("sub_sphere_id must not be empty"),
            SubSphereTorusError::EmptyQuery => f.write_str("query must not be empty"),
            SubSphereTorusError::NoActiveLenses => {
                f.write_str("no active specialist lenses available")
            }
            SubSphereTorusError::EmptyDeliverableId => {
                f.write_str("deliverable_id must not be empty")
            }
            SubSphereTorusError::EmptyPendingActionId => {
                f.write_str("pending_action_id must not be empty")
            }
            SubSphereTorusError::DeliverableNotFound(id) => {
                write!(f, "deliverable not found: {id}")
            }
            SubSphereTorusError::PendingActionNotFound(id) => {
                write!(f, "pending action not found: {id}")
            }
            SubSphereTorusError::SubSphereMismatch => {
                f.write_str("sub-sphere id does not match target record")
            }
        }
    }
}

impl std::error::Error for SubSphereTorusError {}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubSphereTorus {
    pub messages: Vec<DeliberationMessage>,
    pub deliberations: Vec<DeliberationRecord>,
    pub deliverables: Vec<Deliverable>,
    pub pending_hitl_actions: Vec<PendingHitlAction>,
}

impl SubSphereTorus {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn submit_query(
        &mut self,
        sub_sphere_id: &str,
        query: &str,
        active_lenses: &[ActiveSpecialistLens],
        hitl_required: bool,
        lens_message_overrides: Option<&BTreeMap<String, String>>,
        lens_summary_overrides: Option<&BTreeMap<String, String>>,
    ) -> Result<SubSphereQueryResult, SubSphereTorusError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptySubSphereId);
        }
        if query.trim().is_empty() {
            return Err(SubSphereTorusError::EmptyQuery);
        }

        let lenses: Vec<&ActiveSpecialistLens> = active_lenses
            .iter()
            .filter(|lens| lens.is_active())
            .collect();

        if lenses.is_empty() {
            return Err(SubSphereTorusError::NoActiveLenses);
        }

        let now = current_unix_timestamp();
        let deliberation_id = format!("delib-{}-{}", sub_sphere_id, self.deliberations.len() + 1);

        let mut lens_summaries = Vec::with_capacity(lenses.len());
        for lens in lenses {
            let message_id = format!("msg-{deliberation_id}-{}", self.messages.len() + 1);
            let body = lens_message_overrides
                .and_then(|overrides| overrides.get(&lens.lens_id))
                .cloned()
                .unwrap_or_else(|| format!("{}: {}", lens.name, query.trim()));
            self.messages.push(DeliberationMessage {
                message_id,
                sub_sphere_id: sub_sphere_id.to_string(),
                deliberation_id: deliberation_id.clone(),
                lens_id: lens.lens_id.clone(),
                body,
                status: DeliberationMessageStatus::Converged,
                created_at: now,
            });
            let summary = lens_summary_overrides
                .and_then(|overrides| overrides.get(&lens.lens_id))
                .cloned()
                .unwrap_or_else(|| format!("{} handled {}", lens.name, lens.objective));
            lens_summaries.push(summary);
        }

        let convergence_summary = lens_summaries.join(" | ");
        let deliverable_id = format!("deliverable-{deliberation_id}");
        let needs_hitl =
            hitl_required || active_lenses.iter().any(|lens| lens.requires_hitl_approval);

        let deliverable_status = if needs_hitl {
            DeliverableStatus::PendingApproval
        } else {
            DeliverableStatus::Approved
        };

        self.deliverables.push(Deliverable {
            deliverable_id: deliverable_id.clone(),
            sub_sphere_id: sub_sphere_id.to_string(),
            deliberation_id: deliberation_id.clone(),
            content: format!("query='{}' | {}", query.trim(), convergence_summary),
            status: deliverable_status,
            rejection_feedback: None,
            created_at: now,
            updated_at: now,
        });

        let pending_action_id = if needs_hitl {
            let action_id = format!("hitl-{deliberation_id}");
            self.pending_hitl_actions.push(PendingHitlAction {
                pending_action_id: action_id.clone(),
                sub_sphere_id: sub_sphere_id.to_string(),
                deliverable_id: deliverable_id.clone(),
                action_type: PendingHitlActionType::ApproveDeliverable,
                created_at: now,
            });
            Some(action_id)
        } else {
            None
        };

        self.deliberations.push(DeliberationRecord {
            deliberation_id: deliberation_id.clone(),
            sub_sphere_id: sub_sphere_id.to_string(),
            query: query.trim().to_string(),
            convergence_summary: convergence_summary.clone(),
            deliverable_id: deliverable_id.clone(),
            created_at: now,
        });

        Ok(SubSphereQueryResult {
            deliberation_id,
            deliverable_id,
            pending_action_id,
            convergence_summary,
        })
    }

    pub fn get_sub_sphere_deliberation_log(
        &self,
        sub_sphere_id: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DeliberationRecord>, SubSphereTorusError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptySubSphereId);
        }

        let page = self
            .deliberations
            .iter()
            .filter(|record| record.sub_sphere_id == sub_sphere_id)
            .skip(offset)
            .take(limit)
            .cloned()
            .collect();
        Ok(page)
    }

    pub fn approve_deliverable(
        &mut self,
        sub_sphere_id: &str,
        deliverable_id: &str,
    ) -> Result<(), SubSphereTorusError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptySubSphereId);
        }
        if deliverable_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptyDeliverableId);
        }

        let deliverable = self
            .deliverables
            .iter_mut()
            .find(|record| record.deliverable_id == deliverable_id)
            .ok_or_else(|| SubSphereTorusError::DeliverableNotFound(deliverable_id.to_string()))?;

        if deliverable.sub_sphere_id != sub_sphere_id {
            return Err(SubSphereTorusError::SubSphereMismatch);
        }

        deliverable.status = DeliverableStatus::Approved;
        deliverable.updated_at = current_unix_timestamp();
        deliverable.rejection_feedback = None;
        Ok(())
    }

    pub fn reject_deliverable(
        &mut self,
        sub_sphere_id: &str,
        deliverable_id: &str,
        feedback: &str,
    ) -> Result<(), SubSphereTorusError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptySubSphereId);
        }
        if deliverable_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptyDeliverableId);
        }

        let deliverable = self
            .deliverables
            .iter_mut()
            .find(|record| record.deliverable_id == deliverable_id)
            .ok_or_else(|| SubSphereTorusError::DeliverableNotFound(deliverable_id.to_string()))?;

        if deliverable.sub_sphere_id != sub_sphere_id {
            return Err(SubSphereTorusError::SubSphereMismatch);
        }

        deliverable.status = DeliverableStatus::Rejected;
        deliverable.updated_at = current_unix_timestamp();
        deliverable.rejection_feedback = Some(feedback.trim().to_string());
        Ok(())
    }

    pub fn approve_hitl_action(
        &mut self,
        sub_sphere_id: &str,
        pending_action_id: &str,
    ) -> Result<(), SubSphereTorusError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptySubSphereId);
        }
        if pending_action_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptyPendingActionId);
        }

        let action_index = self
            .pending_hitl_actions
            .iter()
            .position(|action| action.pending_action_id == pending_action_id)
            .ok_or_else(|| {
                SubSphereTorusError::PendingActionNotFound(pending_action_id.to_string())
            })?;

        let action = self.pending_hitl_actions[action_index].clone();
        if action.sub_sphere_id != sub_sphere_id {
            return Err(SubSphereTorusError::SubSphereMismatch);
        }

        self.approve_deliverable(sub_sphere_id, &action.deliverable_id)?;
        self.pending_hitl_actions.remove(action_index);
        Ok(())
    }

    pub fn reject_hitl_action(
        &mut self,
        sub_sphere_id: &str,
        pending_action_id: &str,
        reason: &str,
    ) -> Result<(), SubSphereTorusError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptySubSphereId);
        }
        if pending_action_id.trim().is_empty() {
            return Err(SubSphereTorusError::EmptyPendingActionId);
        }

        let action_index = self
            .pending_hitl_actions
            .iter()
            .position(|action| action.pending_action_id == pending_action_id)
            .ok_or_else(|| {
                SubSphereTorusError::PendingActionNotFound(pending_action_id.to_string())
            })?;

        let action = self.pending_hitl_actions[action_index].clone();
        if action.sub_sphere_id != sub_sphere_id {
            return Err(SubSphereTorusError::SubSphereMismatch);
        }

        self.reject_deliverable(sub_sphere_id, &action.deliverable_id, reason)?;
        self.pending_hitl_actions.remove(action_index);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::specialist_lens::{SpecialistLensDefinition, SpecialistLensStatus};
    use serde_json::Value;

    #[test]
    fn submit_query_creates_pending_hitl_when_required() {
        let definition = SpecialistLensDefinition {
            lens_definition_id: "def-research".to_string(),
            name: "Research".to_string(),
            objective: "Review evidence".to_string(),
            capability_tags: vec!["analysis".to_string()],
            tool_allowlist: vec![],
            requires_hitl_approval: false,
        };

        let mut lens =
            ActiveSpecialistLens::from_definition("lens-r1".to_string(), &definition, Value::Null)
                .expect("lens from definition");
        lens.status = SpecialistLensStatus::Active;

        let mut torus = SubSphereTorus::new();
        let result = torus
            .submit_query(
                "ss-research",
                "Summarize this thread",
                &[lens],
                true,
                None,
                None,
            )
            .expect("submit query should succeed");

        assert!(result.pending_action_id.is_some());
        assert_eq!(torus.pending_hitl_actions.len(), 1);
    }
}
