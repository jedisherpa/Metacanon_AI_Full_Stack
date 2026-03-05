use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

use crate::compute::{ComputeRouter, GenerateRequest, RoutingFailure};
use crate::genesis::{current_unix_timestamp, TaskSubSphere, TaskSubSphereStatus};
use crate::lens_library::{LensLibraryEntry, LensLibraryError, LensLibraryState, LensLibraryTier};
use crate::specialist_lens::{
    select_active_lenses_for_tags, ActiveSpecialistLens, LensRuntimeError, SpecialistLensDefinition,
};
use crate::sub_sphere_torus::{
    DeliberationRecord, SubSphereQueryResult, SubSphereTorus, SubSphereTorusError,
};
use crate::tool_registry::{ToolGuardrailError, ToolRegistry};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskSubSphereSummary {
    pub sub_sphere_id: String,
    pub name: String,
    pub objective: String,
    pub status: TaskSubSphereStatus,
    pub hitl_required: bool,
}

type LensOutputOverrides = (BTreeMap<String, String>, BTreeMap<String, String>);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskSubSphereRuntimeError {
    EmptySubSphereId,
    EmptyName,
    EmptyObjective,
    EmptyReason,
    DuplicateSubSphereId(String),
    UnknownSubSphereId(String),
    SubSphereNotActive(String),
    DuplicateLensId(String),
    UnknownLensId(String),
    LensRuntime(LensRuntimeError),
    LensLibrary(LensLibraryError),
    ToolGuardrail(ToolGuardrailError),
    Torus(SubSphereTorusError),
    ComputeRouting(RoutingFailure),
}

impl std::fmt::Display for TaskSubSphereRuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskSubSphereRuntimeError::EmptySubSphereId => {
                f.write_str("sub_sphere_id must not be empty")
            }
            TaskSubSphereRuntimeError::EmptyName => f.write_str("name must not be empty"),
            TaskSubSphereRuntimeError::EmptyObjective => f.write_str("objective must not be empty"),
            TaskSubSphereRuntimeError::EmptyReason => f.write_str("reason must not be empty"),
            TaskSubSphereRuntimeError::DuplicateSubSphereId(id) => {
                write!(f, "duplicate sub_sphere_id: {id}")
            }
            TaskSubSphereRuntimeError::UnknownSubSphereId(id) => {
                write!(f, "unknown sub_sphere_id: {id}")
            }
            TaskSubSphereRuntimeError::SubSphereNotActive(id) => {
                write!(f, "sub-sphere is not active: {id}")
            }
            TaskSubSphereRuntimeError::DuplicateLensId(id) => write!(f, "duplicate lens_id: {id}"),
            TaskSubSphereRuntimeError::UnknownLensId(id) => write!(f, "unknown lens_id: {id}"),
            TaskSubSphereRuntimeError::LensRuntime(err) => err.fmt(f),
            TaskSubSphereRuntimeError::LensLibrary(err) => err.fmt(f),
            TaskSubSphereRuntimeError::ToolGuardrail(err) => err.fmt(f),
            TaskSubSphereRuntimeError::Torus(err) => err.fmt(f),
            TaskSubSphereRuntimeError::ComputeRouting(err) => err.fmt(f),
        }
    }
}

impl std::error::Error for TaskSubSphereRuntimeError {}

impl From<LensRuntimeError> for TaskSubSphereRuntimeError {
    fn from(value: LensRuntimeError) -> Self {
        Self::LensRuntime(value)
    }
}

impl From<ToolGuardrailError> for TaskSubSphereRuntimeError {
    fn from(value: ToolGuardrailError) -> Self {
        Self::ToolGuardrail(value)
    }
}

impl From<LensLibraryError> for TaskSubSphereRuntimeError {
    fn from(value: LensLibraryError) -> Self {
        Self::LensLibrary(value)
    }
}

impl From<SubSphereTorusError> for TaskSubSphereRuntimeError {
    fn from(value: SubSphereTorusError) -> Self {
        Self::Torus(value)
    }
}

impl From<RoutingFailure> for TaskSubSphereRuntimeError {
    fn from(value: RoutingFailure) -> Self {
        Self::ComputeRouting(value)
    }
}

#[derive(Debug, Clone, Default)]
pub struct TaskSubSphereRuntime {
    pub sub_spheres: Vec<TaskSubSphere>,
}

impl TaskSubSphereRuntime {
    pub fn new(sub_spheres: Vec<TaskSubSphere>) -> Self {
        Self { sub_spheres }
    }

    pub fn into_inner(self) -> Vec<TaskSubSphere> {
        self.sub_spheres
    }

    pub fn create_task_sub_sphere(
        &mut self,
        name: &str,
        objective: &str,
        hitl_required: bool,
    ) -> Result<TaskSubSphere, TaskSubSphereRuntimeError> {
        if name.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptyName);
        }
        if objective.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptyObjective);
        }

        let now = current_unix_timestamp();
        let sub_sphere_id = format!("ss-{now}-{}", self.sub_spheres.len() + 1);
        if self
            .sub_spheres
            .iter()
            .any(|existing| existing.sub_sphere_id == sub_sphere_id)
        {
            return Err(TaskSubSphereRuntimeError::DuplicateSubSphereId(
                sub_sphere_id,
            ));
        }

        let sub_sphere = TaskSubSphere {
            sub_sphere_id: sub_sphere_id.clone(),
            name: name.trim().to_string(),
            objective: objective.trim().to_string(),
            hitl_required,
            territories: vec![],
            duties: vec![],
            capability_tags: vec![],
            specialist_lenses: vec![],
            status: TaskSubSphereStatus::Active,
            created_at: now,
            updated_at: now,
            dissolved_reason: None,
        };

        self.sub_spheres.push(sub_sphere.clone());
        Ok(sub_sphere)
    }

    pub fn get_sub_sphere_list(&self) -> Vec<TaskSubSphereSummary> {
        self.sub_spheres
            .iter()
            .map(|sub_sphere| TaskSubSphereSummary {
                sub_sphere_id: sub_sphere.sub_sphere_id.clone(),
                name: sub_sphere.name.clone(),
                objective: sub_sphere.objective.clone(),
                status: sub_sphere.status.clone(),
                hitl_required: sub_sphere.hitl_required,
            })
            .collect()
    }

    pub fn get_sub_sphere_status(
        &self,
        sub_sphere_id: &str,
    ) -> Result<TaskSubSphereStatus, TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }

        let sub_sphere = self
            .sub_spheres
            .iter()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        Ok(sub_sphere.status.clone())
    }

    pub fn pause_sub_sphere(
        &mut self,
        sub_sphere_id: &str,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }

        let sub_sphere = self
            .sub_spheres
            .iter_mut()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        sub_sphere.status = TaskSubSphereStatus::Paused;
        sub_sphere.updated_at = current_unix_timestamp();
        Ok(())
    }

    pub fn dissolve_sub_sphere(
        &mut self,
        sub_sphere_id: &str,
        reason: &str,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }
        if reason.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptyReason);
        }

        let sub_sphere = self
            .sub_spheres
            .iter_mut()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        sub_sphere.status = TaskSubSphereStatus::Dissolved;
        sub_sphere.dissolved_reason = Some(reason.trim().to_string());
        sub_sphere.updated_at = current_unix_timestamp();
        Ok(())
    }

    pub fn add_lens_to_sub_sphere(
        &mut self,
        sub_sphere_id: &str,
        lens_definition: &SpecialistLensDefinition,
        customizations: Value,
        tool_registry: &ToolRegistry,
    ) -> Result<ActiveSpecialistLens, TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }

        let sub_sphere = self
            .sub_spheres
            .iter_mut()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        if !matches!(sub_sphere.status, TaskSubSphereStatus::Active) {
            return Err(TaskSubSphereRuntimeError::SubSphereNotActive(
                sub_sphere_id.to_string(),
            ));
        }

        tool_registry.ensure_known_tools(&lens_definition.tool_allowlist)?;

        let lens_id = format!(
            "lens-{}-{}",
            sub_sphere_id,
            sub_sphere.specialist_lenses.len() + 1
        );
        if sub_sphere
            .specialist_lenses
            .iter()
            .any(|existing| existing.lens_id == lens_id)
        {
            return Err(TaskSubSphereRuntimeError::DuplicateLensId(lens_id));
        }

        let lens = ActiveSpecialistLens::from_definition(lens_id, lens_definition, customizations)?;
        sub_sphere.specialist_lenses.push(lens.clone());
        sub_sphere.updated_at = current_unix_timestamp();
        Ok(lens)
    }

    pub fn approve_ai_contact_lens(
        &mut self,
        sub_sphere_id: &str,
        lens_id: &str,
        contact_lens_text: &str,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        let lens = self.lookup_lens_mut(sub_sphere_id, lens_id)?;
        lens.approve_contact_lens(contact_lens_text)?;
        Ok(())
    }

    pub fn revoke_specialist_lens(
        &mut self,
        sub_sphere_id: &str,
        lens_id: &str,
        reason: &str,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        let lens = self.lookup_lens_mut(sub_sphere_id, lens_id)?;
        lens.revoke(reason)?;
        Ok(())
    }

    pub fn submit_sub_sphere_query(
        &self,
        sub_sphere_id: &str,
        query: &str,
        torus: &mut SubSphereTorus,
        tool_registry: &ToolRegistry,
        compute_router: &ComputeRouter,
        provider_override: Option<&str>,
    ) -> Result<SubSphereQueryResult, TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }

        let sub_sphere = self
            .sub_spheres
            .iter()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        if !matches!(sub_sphere.status, TaskSubSphereStatus::Active) {
            return Err(TaskSubSphereRuntimeError::SubSphereNotActive(
                sub_sphere_id.to_string(),
            ));
        }

        for lens in &sub_sphere.specialist_lenses {
            tool_registry.ensure_known_tools(&lens.tool_allowlist)?;
        }

        let selected_lens_ids = select_active_lenses_for_tags(&sub_sphere.specialist_lenses, &[]);
        let selected_lenses: Vec<ActiveSpecialistLens> = sub_sphere
            .specialist_lenses
            .iter()
            .filter(|lens| {
                selected_lens_ids
                    .iter()
                    .any(|selected| selected == &lens.lens_id)
            })
            .cloned()
            .collect();

        let (lens_message_overrides, lens_summary_overrides) =
            generate_lens_outputs(&selected_lenses, query, compute_router, provider_override)?;

        let result = torus.submit_query(
            sub_sphere_id,
            query,
            &selected_lenses,
            sub_sphere.hitl_required,
            Some(&lens_message_overrides),
            Some(&lens_summary_overrides),
        )?;
        Ok(result)
    }

    pub fn get_sub_sphere_deliberation_log(
        &self,
        sub_sphere_id: &str,
        limit: usize,
        offset: usize,
        torus: &SubSphereTorus,
    ) -> Result<Vec<DeliberationRecord>, TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }

        if !self
            .sub_spheres
            .iter()
            .any(|sub_sphere| sub_sphere.sub_sphere_id == sub_sphere_id)
        {
            return Err(TaskSubSphereRuntimeError::UnknownSubSphereId(
                sub_sphere_id.to_string(),
            ));
        }

        Ok(torus.get_sub_sphere_deliberation_log(sub_sphere_id, limit, offset)?)
    }

    pub fn approve_deliverable(
        &self,
        sub_sphere_id: &str,
        deliverable_id: &str,
        torus: &mut SubSphereTorus,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        self.ensure_sub_sphere_exists(sub_sphere_id)?;
        Ok(torus.approve_deliverable(sub_sphere_id, deliverable_id)?)
    }

    pub fn reject_deliverable(
        &self,
        sub_sphere_id: &str,
        deliverable_id: &str,
        feedback: &str,
        torus: &mut SubSphereTorus,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        self.ensure_sub_sphere_exists(sub_sphere_id)?;
        Ok(torus.reject_deliverable(sub_sphere_id, deliverable_id, feedback)?)
    }

    pub fn approve_hitl_action(
        &self,
        sub_sphere_id: &str,
        pending_action_id: &str,
        torus: &mut SubSphereTorus,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        self.ensure_sub_sphere_exists(sub_sphere_id)?;
        Ok(torus.approve_hitl_action(sub_sphere_id, pending_action_id)?)
    }

    pub fn reject_hitl_action(
        &self,
        sub_sphere_id: &str,
        pending_action_id: &str,
        reason: &str,
        torus: &mut SubSphereTorus,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        self.ensure_sub_sphere_exists(sub_sphere_id)?;
        Ok(torus.reject_hitl_action(sub_sphere_id, pending_action_id, reason)?)
    }

    pub fn save_lens_to_library(
        &self,
        sub_sphere_id: &str,
        lens_id: &str,
        tier: LensLibraryTier,
        lens_library: &mut LensLibraryState,
    ) -> Result<LensLibraryEntry, TaskSubSphereRuntimeError> {
        let lens = self.lookup_lens(sub_sphere_id, lens_id)?;
        Ok(lens_library.save_lens_to_library(sub_sphere_id, lens, tier)?)
    }

    pub fn search_lens_library(
        &self,
        lens_library: &LensLibraryState,
        query: &str,
        tier: Option<LensLibraryTier>,
        tags: &[String],
    ) -> Vec<LensLibraryEntry> {
        lens_library.search_lens_library(query, tier, tags)
    }

    fn lookup_lens_mut(
        &mut self,
        sub_sphere_id: &str,
        lens_id: &str,
    ) -> Result<&mut ActiveSpecialistLens, TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }
        if lens_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::UnknownLensId(
                lens_id.to_string(),
            ));
        }

        let sub_sphere = self
            .sub_spheres
            .iter_mut()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        sub_sphere
            .specialist_lenses
            .iter_mut()
            .find(|lens| lens.lens_id == lens_id)
            .ok_or_else(|| TaskSubSphereRuntimeError::UnknownLensId(lens_id.to_string()))
    }

    fn ensure_sub_sphere_exists(
        &self,
        sub_sphere_id: &str,
    ) -> Result<(), TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }

        if self
            .sub_spheres
            .iter()
            .any(|sub_sphere| sub_sphere.sub_sphere_id == sub_sphere_id)
        {
            return Ok(());
        }
        Err(TaskSubSphereRuntimeError::UnknownSubSphereId(
            sub_sphere_id.to_string(),
        ))
    }

    fn lookup_lens(
        &self,
        sub_sphere_id: &str,
        lens_id: &str,
    ) -> Result<&ActiveSpecialistLens, TaskSubSphereRuntimeError> {
        if sub_sphere_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::EmptySubSphereId);
        }
        if lens_id.trim().is_empty() {
            return Err(TaskSubSphereRuntimeError::UnknownLensId(
                lens_id.to_string(),
            ));
        }

        let sub_sphere = self
            .sub_spheres
            .iter()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| {
                TaskSubSphereRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string())
            })?;

        sub_sphere
            .specialist_lenses
            .iter()
            .find(|lens| lens.lens_id == lens_id)
            .ok_or_else(|| TaskSubSphereRuntimeError::UnknownLensId(lens_id.to_string()))
    }
}

fn generate_lens_outputs(
    selected_lenses: &[ActiveSpecialistLens],
    query: &str,
    compute_router: &ComputeRouter,
    provider_override: Option<&str>,
) -> Result<LensOutputOverrides, TaskSubSphereRuntimeError> {
    let mut lens_message_overrides = BTreeMap::new();
    let mut lens_summary_overrides = BTreeMap::new();

    for lens in selected_lenses {
        let request = build_lens_generate_request(query, lens, provider_override);
        let response = compute_router.route_generate(request)?;
        let body = format!(
            "{} [{} | {}]: {}",
            lens.name,
            response.provider_id,
            response.model,
            response.output_text.trim()
        );
        let summary = format!(
            "{} via {}: {}",
            lens.name,
            response.provider_id,
            truncate_for_summary(response.output_text.trim(), 160)
        );

        lens_message_overrides.insert(lens.lens_id.clone(), body);
        lens_summary_overrides.insert(lens.lens_id.clone(), summary);
    }

    Ok((lens_message_overrides, lens_summary_overrides))
}

fn build_lens_generate_request(
    query: &str,
    lens: &ActiveSpecialistLens,
    provider_override: Option<&str>,
) -> GenerateRequest {
    let mut request = GenerateRequest::new(format!(
        "Sub-sphere query: {}\nLens objective: {}\nReturn a concise lens contribution.",
        query.trim(),
        lens.objective
    ));
    request.system_prompt = Some(match lens.contact_lens_text.as_ref() {
        Some(contact_lens_text) => format!(
            "You are the '{}' specialist lens. Objective: {}. Contact lens: {}",
            lens.name, lens.objective, contact_lens_text
        ),
        None => format!(
            "You are the '{}' specialist lens. Objective: {}.",
            lens.name, lens.objective
        ),
    });
    request.max_tokens = Some(384);
    request.temperature = Some(0.2);
    if let Some(provider_id) = provider_override {
        request.provider_override = Some(provider_id.to_string());
    }
    request
        .metadata
        .insert("sub_sphere_lens_id".to_string(), lens.lens_id.clone());
    request.metadata.insert(
        "sub_sphere_lens_definition_id".to_string(),
        lens.lens_definition_id.clone(),
    );
    request
}

fn truncate_for_summary(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }

    let mut truncated = String::new();
    for (index, ch) in text.chars().enumerate() {
        if index >= max_chars {
            break;
        }
        truncated.push(ch);
    }
    truncated.push_str("...");
    truncated
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::ComputeRouter;
    use crate::providers::qwen_local::QwenLocalProvider;
    use crate::specialist_lens::SpecialistLensDefinition;
    use crate::tool_registry::{ToolDefinition, ToolScope};
    use std::sync::Arc;

    #[test]
    fn create_staff_and_query_sub_sphere() {
        let mut runtime = TaskSubSphereRuntime::new(vec![]);
        let created = runtime
            .create_task_sub_sphere("Research", "Analyze policy updates", true)
            .expect("sub-sphere should be created");

        let mut tool_registry = ToolRegistry::new();
        tool_registry
            .register_tool(ToolDefinition {
                tool_id: "local_search".to_string(),
                name: "Local Search".to_string(),
                description: "Search local files".to_string(),
                allowed_sub_sphere_ids: vec![created.sub_sphere_id.clone()],
                required_capability_tags: vec![],
                scope: ToolScope::LocalOnly,
                enabled: true,
            })
            .expect("tool should register");

        let lens = runtime
            .add_lens_to_sub_sphere(
                &created.sub_sphere_id,
                &SpecialistLensDefinition {
                    lens_definition_id: "def-policy".to_string(),
                    name: "Policy Lens".to_string(),
                    objective: "Assess policy changes".to_string(),
                    capability_tags: vec!["analysis".to_string()],
                    tool_allowlist: vec!["local_search".to_string()],
                    requires_hitl_approval: false,
                },
                Value::Null,
                &tool_registry,
            )
            .expect("lens should be added");

        runtime
            .approve_ai_contact_lens(
                &created.sub_sphere_id,
                &lens.lens_id,
                "You are bounded to local analysis tasks.",
            )
            .expect("lens approval should succeed");

        let mut lens_library = LensLibraryState::new();
        runtime
            .save_lens_to_library(
                &created.sub_sphere_id,
                &lens.lens_id,
                LensLibraryTier::LocalPrivate,
                &mut lens_library,
            )
            .expect("saving lens to library should succeed");
        assert_eq!(
            runtime
                .search_lens_library(
                    &lens_library,
                    "policy",
                    Some(LensLibraryTier::LocalPrivate),
                    &[]
                )
                .len(),
            1
        );

        let mut torus = SubSphereTorus::new();
        let mut compute_router = ComputeRouter::new(crate::compute::PROVIDER_QWEN_LOCAL);
        compute_router.register_provider(Arc::new(QwenLocalProvider::default()));
        let result = runtime
            .submit_sub_sphere_query(
                &created.sub_sphere_id,
                "Compare current policy to baseline",
                &mut torus,
                &tool_registry,
                &compute_router,
                None,
            )
            .expect("query should run");

        assert!(result.pending_action_id.is_some());
        assert!(
            result.convergence_summary.contains("Qwen local"),
            "expected convergence to include generated provider output"
        );
        runtime
            .approve_hitl_action(
                &created.sub_sphere_id,
                result
                    .pending_action_id
                    .as_deref()
                    .expect("pending action should exist"),
                &mut torus,
            )
            .expect("HITL approval should succeed");

        assert_eq!(torus.pending_hitl_actions.len(), 0);
        assert_eq!(
            torus.deliverables[0].status,
            crate::sub_sphere_torus::DeliverableStatus::Approved
        );
        assert_eq!(torus.deliverables.len(), 1);
    }
}
