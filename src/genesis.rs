use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::lens_library::LensLibraryState;
use crate::specialist_lens::{select_active_lenses_for_tags, ActiveSpecialistLens};
use crate::workflow::WorkflowRegistry;

pub const SOULFILE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SoulFile {
    pub vision_core: String,
    pub core_values: Vec<String>,
    pub soul_facets: Vec<SoulFacet>,
    pub ai_boundaries: AIBoundaries,
    pub ratchet: Ratchet,
    pub will_vector: WillVector,
    #[serde(default)]
    pub task_sub_spheres: Vec<TaskSubSphere>,
    #[serde(default = "default_lens_library")]
    pub lens_library: LensLibraryState,
    #[serde(default = "default_workflow_registry")]
    pub workflow_registry: WorkflowRegistry,
    pub genesis_hash: String,
    pub signature: String,
    pub created_at: i64,
    pub schema_version: u32,
    #[serde(default)]
    pub future_sub_sphere_registry: Option<FutureSubSphereRegistryRef>,
    #[serde(default)]
    pub future_lens_library_manifest: Option<FutureLensLibraryManifestRef>,
    #[serde(default = "default_extensions")]
    pub extensions: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SoulFacet {
    pub vision: String,
    pub territories: Vec<String>,
    pub duties: Vec<String>,
    pub expansion_thresholds: Vec<Threshold>,
    pub emotional_thresholds: Vec<Threshold>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Threshold {
    pub label: String,
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AIBoundaries {
    pub human_in_loop: bool,
    pub interpretive_boundaries: Vec<String>,
    pub drift_prevention: String,
    pub enable_morpheus_compute: bool,
    pub morpheus_config: Option<MorpheusConfig>,
    #[serde(default)]
    pub sensitive_compute_policy: SensitiveComputePolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SensitiveComputePolicy {
    #[default]
    UserChoice,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct MorpheusConfig {
    pub router_id: Option<String>,
    pub wallet_id: Option<String>,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Ratchet {
    pub revision: u64,
    pub previous_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct WillVector {
    pub directives: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct FutureSubSphereRegistryRef {
    pub registry_id: String,
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct FutureLensLibraryManifestRef {
    pub manifest_id: String,
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskSubSphereStatus {
    #[default]
    Active,
    Paused,
    Dissolved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskSubSphere {
    pub sub_sphere_id: String,
    pub name: String,
    pub objective: String,
    #[serde(default)]
    pub hitl_required: bool,
    pub territories: Vec<String>,
    pub duties: Vec<String>,
    pub capability_tags: Vec<String>,
    #[serde(default)]
    pub specialist_lenses: Vec<ActiveSpecialistLens>,
    #[serde(default)]
    pub status: TaskSubSphereStatus,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub dissolved_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskDispatchRequest {
    pub task_id: String,
    pub summary: String,
    #[serde(default)]
    pub required_capability_tags: Vec<String>,
    #[serde(default)]
    pub preferred_sub_sphere_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskDispatchPlan {
    pub task_id: String,
    pub selected_sub_sphere_id: String,
    pub selected_lens_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskRuntimeError {
    MissingTaskId,
    DuplicateSubSphereId(String),
    UnknownSubSphereId(String),
    SubSphereInactive(String),
    NoEligibleSubSphere,
}

impl std::fmt::Display for TaskRuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskRuntimeError::MissingTaskId => f.write_str("task_id must not be empty"),
            TaskRuntimeError::DuplicateSubSphereId(id) => {
                write!(f, "duplicate sub_sphere_id: {id}")
            }
            TaskRuntimeError::UnknownSubSphereId(id) => write!(f, "unknown sub_sphere_id: {id}"),
            TaskRuntimeError::SubSphereInactive(id) => {
                write!(f, "sub_sphere_id is not active: {id}")
            }
            TaskRuntimeError::NoEligibleSubSphere => {
                f.write_str("no eligible active task sub-sphere found")
            }
        }
    }
}

impl std::error::Error for TaskRuntimeError {}

impl SoulFile {
    pub fn new(
        vision_core: String,
        core_values: Vec<String>,
        soul_facets: Vec<SoulFacet>,
        ai_boundaries: AIBoundaries,
        ratchet: Ratchet,
        will_vector: WillVector,
        signing_secret: &str,
    ) -> Self {
        let mut soul_file = Self {
            vision_core,
            core_values,
            soul_facets,
            ai_boundaries,
            ratchet,
            will_vector,
            task_sub_spheres: vec![],
            lens_library: default_lens_library(),
            workflow_registry: default_workflow_registry(),
            genesis_hash: String::new(),
            signature: String::new(),
            created_at: current_unix_timestamp(),
            schema_version: SOULFILE_SCHEMA_VERSION,
            future_sub_sphere_registry: None,
            future_lens_library_manifest: None,
            extensions: default_extensions(),
        };

        soul_file.regenerate_integrity(signing_secret);
        soul_file
    }

    pub fn regenerate_integrity(&mut self, signing_secret: &str) {
        self.genesis_hash = compute_genesis_hash(self);
        self.signature = sign_genesis_hash(&self.genesis_hash, signing_secret);
    }

    pub fn ensure_forward_compat_defaults(&mut self) {
        if self.extensions.is_null() {
            self.extensions = default_extensions();
        }
    }

    pub fn register_task_sub_sphere(
        &mut self,
        sub_sphere: TaskSubSphere,
    ) -> Result<(), TaskRuntimeError> {
        if self
            .task_sub_spheres
            .iter()
            .any(|existing| existing.sub_sphere_id == sub_sphere.sub_sphere_id)
        {
            return Err(TaskRuntimeError::DuplicateSubSphereId(
                sub_sphere.sub_sphere_id,
            ));
        }
        self.task_sub_spheres.push(sub_sphere);
        Ok(())
    }

    pub fn set_task_sub_sphere_status(
        &mut self,
        sub_sphere_id: &str,
        status: TaskSubSphereStatus,
    ) -> Result<(), TaskRuntimeError> {
        let sub_sphere = self
            .task_sub_spheres
            .iter_mut()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| TaskRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string()))?;

        sub_sphere.status = status;
        Ok(())
    }

    pub fn attach_specialist_lens(
        &mut self,
        sub_sphere_id: &str,
        lens: ActiveSpecialistLens,
    ) -> Result<(), TaskRuntimeError> {
        let sub_sphere = self
            .task_sub_spheres
            .iter_mut()
            .find(|entry| entry.sub_sphere_id == sub_sphere_id)
            .ok_or_else(|| TaskRuntimeError::UnknownSubSphereId(sub_sphere_id.to_string()))?;

        sub_sphere.specialist_lenses.push(lens);
        Ok(())
    }

    pub fn plan_task_dispatch(
        &self,
        request: &TaskDispatchRequest,
    ) -> Result<TaskDispatchPlan, TaskRuntimeError> {
        if request.task_id.trim().is_empty() {
            return Err(TaskRuntimeError::MissingTaskId);
        }

        let sub_sphere = if let Some(preferred_id) = request.preferred_sub_sphere_id.as_deref() {
            let preferred = self
                .task_sub_spheres
                .iter()
                .find(|entry| entry.sub_sphere_id == preferred_id)
                .ok_or_else(|| TaskRuntimeError::UnknownSubSphereId(preferred_id.to_string()))?;

            if preferred.status != TaskSubSphereStatus::Active {
                return Err(TaskRuntimeError::SubSphereInactive(
                    preferred_id.to_string(),
                ));
            }
            preferred
        } else {
            self.task_sub_spheres
                .iter()
                .find(|entry| {
                    entry.status == TaskSubSphereStatus::Active
                        && sub_sphere_matches_required_tags(
                            entry,
                            &request.required_capability_tags,
                        )
                })
                .ok_or(TaskRuntimeError::NoEligibleSubSphere)?
        };

        Ok(TaskDispatchPlan {
            task_id: request.task_id.clone(),
            selected_sub_sphere_id: sub_sphere.sub_sphere_id.clone(),
            selected_lens_ids: select_active_lenses_for_tags(
                &sub_sphere.specialist_lenses,
                &request.required_capability_tags,
            ),
        })
    }
}

fn sub_sphere_matches_required_tags(sub_sphere: &TaskSubSphere, required_tags: &[String]) -> bool {
    if required_tags.is_empty() {
        return true;
    }

    let capability_set: HashSet<&str> = sub_sphere
        .capability_tags
        .iter()
        .map(std::string::String::as_str)
        .collect();

    required_tags
        .iter()
        .map(std::string::String::as_str)
        .all(|tag| capability_set.contains(tag))
}

#[derive(Serialize)]
struct SoulFileHashView<'a> {
    vision_core: &'a str,
    core_values: &'a [String],
    soul_facets: &'a [SoulFacet],
    ai_boundaries: &'a AIBoundaries,
    ratchet: &'a Ratchet,
    will_vector: &'a WillVector,
    task_sub_spheres: &'a [TaskSubSphere],
    lens_library: &'a LensLibraryState,
    workflow_registry: &'a WorkflowRegistry,
    created_at: i64,
    schema_version: u32,
    future_sub_sphere_registry: &'a Option<FutureSubSphereRegistryRef>,
    future_lens_library_manifest: &'a Option<FutureLensLibraryManifestRef>,
    extensions: &'a Value,
}

pub fn compute_genesis_hash(soul_file: &SoulFile) -> String {
    let hash_view = SoulFileHashView {
        vision_core: &soul_file.vision_core,
        core_values: &soul_file.core_values,
        soul_facets: &soul_file.soul_facets,
        ai_boundaries: &soul_file.ai_boundaries,
        ratchet: &soul_file.ratchet,
        will_vector: &soul_file.will_vector,
        task_sub_spheres: &soul_file.task_sub_spheres,
        lens_library: &soul_file.lens_library,
        workflow_registry: &soul_file.workflow_registry,
        created_at: soul_file.created_at,
        schema_version: soul_file.schema_version,
        future_sub_sphere_registry: &soul_file.future_sub_sphere_registry,
        future_lens_library_manifest: &soul_file.future_lens_library_manifest,
        extensions: &soul_file.extensions,
    };

    let bytes = serde_json::to_vec(&hash_view).unwrap_or_default();
    stable_hash_hex(&bytes)
}

pub fn sign_genesis_hash(genesis_hash: &str, signing_secret: &str) -> String {
    let payload = format!("{signing_secret}:{genesis_hash}");
    stable_hash_hex(payload.as_bytes())
}

pub fn default_extensions() -> Value {
    Value::Object(Map::new())
}

pub fn default_lens_library() -> LensLibraryState {
    LensLibraryState::default()
}

pub fn default_workflow_registry() -> WorkflowRegistry {
    WorkflowRegistry::default()
}

pub fn current_unix_timestamp() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs() as i64,
        Err(_) => 0,
    }
}

fn stable_hash_hex(bytes: &[u8]) -> String {
    const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x00000100000001b3;

    let mut hash = FNV_OFFSET_BASIS;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_soul_file() -> SoulFile {
        SoulFile::new(
            "vision".to_string(),
            vec!["clarity".to_string()],
            vec![],
            AIBoundaries {
                human_in_loop: true,
                interpretive_boundaries: vec!["no coercion".to_string()],
                drift_prevention: "explicit constraints".to_string(),
                enable_morpheus_compute: false,
                morpheus_config: None,
                sensitive_compute_policy: SensitiveComputePolicy::UserChoice,
            },
            Ratchet::default(),
            WillVector::default(),
            "signing-secret",
        )
    }

    #[test]
    fn soul_file_defaults_forward_compat_fields() {
        let soul_file = base_soul_file();

        assert_eq!(soul_file.schema_version, SOULFILE_SCHEMA_VERSION);
        assert!(soul_file.future_sub_sphere_registry.is_none());
        assert!(soul_file.future_lens_library_manifest.is_none());
        assert_eq!(soul_file.extensions, default_extensions());
        assert!(soul_file.task_sub_spheres.is_empty());
        assert_eq!(soul_file.lens_library, default_lens_library());
        assert_eq!(soul_file.workflow_registry, default_workflow_registry());
        assert!(!soul_file.genesis_hash.is_empty());
        assert!(!soul_file.signature.is_empty());
    }

    #[test]
    fn integrity_hash_changes_with_payload() {
        let mut left = SoulFile::new(
            "vision-a".to_string(),
            vec!["one".to_string()],
            vec![],
            AIBoundaries {
                human_in_loop: true,
                interpretive_boundaries: vec![],
                drift_prevention: "strict".to_string(),
                enable_morpheus_compute: false,
                morpheus_config: None,
                sensitive_compute_policy: SensitiveComputePolicy::UserChoice,
            },
            Ratchet::default(),
            WillVector::default(),
            "k",
        );

        let original_hash = left.genesis_hash.clone();
        left.vision_core = "vision-b".to_string();
        left.regenerate_integrity("k");

        assert_ne!(left.genesis_hash, original_hash);
    }

    #[test]
    fn register_and_dispatch_task_sub_sphere() {
        let mut soul_file = base_soul_file();

        soul_file
            .register_task_sub_sphere(TaskSubSphere {
                sub_sphere_id: "ops".to_string(),
                name: "Operations".to_string(),
                objective: "Execute recurring operational tasks".to_string(),
                hitl_required: false,
                territories: vec!["platform".to_string()],
                duties: vec!["uptime".to_string()],
                capability_tags: vec!["monitoring".to_string(), "alerts".to_string()],
                specialist_lenses: vec![ActiveSpecialistLens {
                    lens_id: "lens-alert-triage".to_string(),
                    lens_definition_id: "def-alert-triage".to_string(),
                    name: "Alert Triage Lens".to_string(),
                    objective: "Triage alerts".to_string(),
                    capability_tags: vec!["alerts".to_string()],
                    tool_allowlist: vec![],
                    requires_hitl_approval: false,
                    customizations: Value::Null,
                    status: crate::specialist_lens::SpecialistLensStatus::Active,
                    contact_lens_text: Some("Prioritize critical alerts.".to_string()),
                    created_at: current_unix_timestamp(),
                    updated_at: current_unix_timestamp(),
                    revoked_reason: None,
                }],
                status: TaskSubSphereStatus::Active,
                created_at: current_unix_timestamp(),
                updated_at: current_unix_timestamp(),
                dissolved_reason: None,
            })
            .expect("register should succeed");

        let plan = soul_file
            .plan_task_dispatch(&TaskDispatchRequest {
                task_id: "task-001".to_string(),
                summary: "Triage alert burst".to_string(),
                required_capability_tags: vec!["alerts".to_string()],
                preferred_sub_sphere_id: None,
            })
            .expect("dispatch should succeed");

        assert_eq!(plan.selected_sub_sphere_id, "ops");
        assert_eq!(
            plan.selected_lens_ids,
            vec!["lens-alert-triage".to_string()]
        );
    }

    #[test]
    fn preferred_inactive_sub_sphere_returns_error() {
        let mut soul_file = base_soul_file();

        soul_file
            .register_task_sub_sphere(TaskSubSphere {
                sub_sphere_id: "research".to_string(),
                name: "Research".to_string(),
                objective: "Deep analysis tasks".to_string(),
                hitl_required: true,
                territories: vec!["knowledge".to_string()],
                duties: vec!["analysis".to_string()],
                capability_tags: vec!["reasoning".to_string()],
                specialist_lenses: vec![],
                status: TaskSubSphereStatus::Paused,
                created_at: current_unix_timestamp(),
                updated_at: current_unix_timestamp(),
                dissolved_reason: None,
            })
            .expect("register should succeed");

        let result = soul_file.plan_task_dispatch(&TaskDispatchRequest {
            task_id: "task-002".to_string(),
            summary: "Analyze ADR drift".to_string(),
            required_capability_tags: vec!["reasoning".to_string()],
            preferred_sub_sphere_id: Some("research".to_string()),
        });

        assert_eq!(
            result,
            Err(TaskRuntimeError::SubSphereInactive("research".to_string()))
        );
    }
}
