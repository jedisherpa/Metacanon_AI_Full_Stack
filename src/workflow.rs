use serde::{Deserialize, Serialize};

use crate::genesis::current_unix_timestamp;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowTrainingStatus {
    #[default]
    Collecting,
    Saved,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TrainingMessageRole {
    #[default]
    User,
    Lens,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrainingMessage {
    pub role: TrainingMessageRole,
    pub message: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkflowTrainingSession {
    pub session_id: String,
    pub sub_sphere_id: String,
    #[serde(default)]
    pub status: WorkflowTrainingStatus,
    #[serde(default)]
    pub transcript: Vec<TrainingMessage>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkflowStep {
    pub step_id: String,
    pub instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkflowDefinition {
    pub workflow_id: String,
    pub sub_sphere_id: String,
    pub workflow_name: String,
    #[serde(default)]
    pub steps: Vec<WorkflowStep>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct WorkflowRegistry {
    #[serde(default)]
    pub training_sessions: Vec<WorkflowTrainingSession>,
    #[serde(default)]
    pub workflows: Vec<WorkflowDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowError {
    EmptySubSphereId,
    EmptySessionId,
    EmptyWorkflowId,
    EmptyMessage,
    EmptyWorkflowName,
    SessionNotFound(String),
    WorkflowNotFound(String),
    InvalidTrainingSessionState(String),
}

impl std::fmt::Display for WorkflowError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowError::EmptySubSphereId => f.write_str("sub_sphere_id must not be empty"),
            WorkflowError::EmptySessionId => f.write_str("session_id must not be empty"),
            WorkflowError::EmptyWorkflowId => f.write_str("workflow_id must not be empty"),
            WorkflowError::EmptyMessage => f.write_str("training message must not be empty"),
            WorkflowError::EmptyWorkflowName => f.write_str("workflow_name must not be empty"),
            WorkflowError::SessionNotFound(id) => write!(f, "training session not found: {id}"),
            WorkflowError::WorkflowNotFound(id) => write!(f, "workflow not found: {id}"),
            WorkflowError::InvalidTrainingSessionState(id) => {
                write!(f, "training session is not collecting: {id}")
            }
        }
    }
}

impl std::error::Error for WorkflowError {}

impl WorkflowRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_workflow_training(
        &mut self,
        sub_sphere_id: &str,
    ) -> Result<WorkflowTrainingSession, WorkflowError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(WorkflowError::EmptySubSphereId);
        }

        let now = current_unix_timestamp();
        let session = WorkflowTrainingSession {
            session_id: format!("wf-session-{sub_sphere_id}-{now}"),
            sub_sphere_id: sub_sphere_id.to_string(),
            status: WorkflowTrainingStatus::Collecting,
            transcript: vec![],
            created_at: now,
            updated_at: now,
        };

        self.training_sessions.push(session.clone());
        Ok(session)
    }

    pub fn submit_training_message(
        &mut self,
        session_id: &str,
        message: &str,
    ) -> Result<(), WorkflowError> {
        if session_id.trim().is_empty() {
            return Err(WorkflowError::EmptySessionId);
        }
        if message.trim().is_empty() {
            return Err(WorkflowError::EmptyMessage);
        }

        let session = self
            .training_sessions
            .iter_mut()
            .find(|candidate| candidate.session_id == session_id)
            .ok_or_else(|| WorkflowError::SessionNotFound(session_id.to_string()))?;

        if !matches!(session.status, WorkflowTrainingStatus::Collecting) {
            return Err(WorkflowError::InvalidTrainingSessionState(
                session_id.to_string(),
            ));
        }

        session.transcript.push(TrainingMessage {
            role: TrainingMessageRole::User,
            message: message.trim().to_string(),
            created_at: current_unix_timestamp(),
        });
        session.updated_at = current_unix_timestamp();
        Ok(())
    }

    pub fn save_trained_workflow(
        &mut self,
        session_id: &str,
        workflow_name: &str,
    ) -> Result<WorkflowDefinition, WorkflowError> {
        if session_id.trim().is_empty() {
            return Err(WorkflowError::EmptySessionId);
        }
        if workflow_name.trim().is_empty() {
            return Err(WorkflowError::EmptyWorkflowName);
        }

        let session = self
            .training_sessions
            .iter_mut()
            .find(|candidate| candidate.session_id == session_id)
            .ok_or_else(|| WorkflowError::SessionNotFound(session_id.to_string()))?;

        if !matches!(session.status, WorkflowTrainingStatus::Collecting) {
            return Err(WorkflowError::InvalidTrainingSessionState(
                session_id.to_string(),
            ));
        }

        let now = current_unix_timestamp();
        let steps: Vec<WorkflowStep> = session
            .transcript
            .iter()
            .enumerate()
            .map(|(index, message)| WorkflowStep {
                step_id: format!("wf-step-{}", index + 1),
                instruction: message.message.clone(),
            })
            .collect();

        let workflow = WorkflowDefinition {
            workflow_id: format!("wf-{}-{now}", session.sub_sphere_id),
            sub_sphere_id: session.sub_sphere_id.clone(),
            workflow_name: workflow_name.trim().to_string(),
            steps,
            created_at: now,
            updated_at: now,
        };

        session.status = WorkflowTrainingStatus::Saved;
        session.updated_at = now;

        self.workflows.push(workflow.clone());
        Ok(workflow)
    }

    pub fn get_workflow_list(
        &self,
        sub_sphere_id: &str,
    ) -> Result<Vec<WorkflowDefinition>, WorkflowError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(WorkflowError::EmptySubSphereId);
        }

        Ok(self
            .workflows
            .iter()
            .filter(|workflow| workflow.sub_sphere_id == sub_sphere_id)
            .cloned()
            .collect())
    }

    pub fn delete_workflow(
        &mut self,
        sub_sphere_id: &str,
        workflow_id: &str,
    ) -> Result<(), WorkflowError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(WorkflowError::EmptySubSphereId);
        }
        if workflow_id.trim().is_empty() {
            return Err(WorkflowError::EmptyWorkflowId);
        }

        let original_len = self.workflows.len();
        self.workflows.retain(|workflow| {
            !(workflow.sub_sphere_id == sub_sphere_id && workflow.workflow_id == workflow_id)
        });

        if self.workflows.len() == original_len {
            return Err(WorkflowError::WorkflowNotFound(workflow_id.to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn training_session_to_saved_workflow() {
        let mut registry = WorkflowRegistry::new();
        let session = registry
            .start_workflow_training("ss-research")
            .expect("session should be created");
        registry
            .submit_training_message(&session.session_id, "Gather all source notes.")
            .expect("message should be accepted");
        registry
            .submit_training_message(&session.session_id, "Summarize contradictions.")
            .expect("message should be accepted");

        let workflow = registry
            .save_trained_workflow(&session.session_id, "Source synthesis")
            .expect("workflow should be saved");

        assert_eq!(workflow.steps.len(), 2);
        assert_eq!(workflow.workflow_name, "Source synthesis");
    }
}
