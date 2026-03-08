use crate::compute::ComputeRouter;
use crate::genesis::{SoulFile, TaskSubSphere, TaskSubSphereStatus};
use crate::sub_sphere_torus::{SubSphereQueryResult, SubSphereTorus};
use crate::task_sub_sphere::{TaskSubSphereRuntime, TaskSubSphereRuntimeError};
use crate::tool_registry::ToolRegistry;
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{channel, Receiver, Sender};

pub type SubSphereId = String;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubSphereLifecycleState {
    Pending,
    Running,
    Suspended,
    Complete,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubSphereEvent {
    Spawn {
        name: String,
        objective: String,
        hitl_required: bool,
    },
    Pause {
        sub_sphere_id: SubSphereId,
    },
    Dissolve {
        sub_sphere_id: SubSphereId,
        reason: String,
    },
    SubmitQuery {
        sub_sphere_id: SubSphereId,
        query: String,
        provider_override: Option<String>,
    },
    Stop,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubSphereEventOutcome {
    Spawned {
        sub_sphere_id: SubSphereId,
    },
    Paused {
        sub_sphere_id: SubSphereId,
    },
    Dissolved {
        sub_sphere_id: SubSphereId,
    },
    QuerySubmitted {
        sub_sphere_id: SubSphereId,
        result: SubSphereQueryResult,
    },
    Stopped,
}

#[derive(Debug)]
pub enum SubSphereManagerError {
    Runtime(TaskSubSphereRuntimeError),
    EventChannelClosed,
}

impl std::fmt::Display for SubSphereManagerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubSphereManagerError::Runtime(error) => error.fmt(f),
            SubSphereManagerError::EventChannelClosed => {
                f.write_str("sub-sphere event channel is closed")
            }
        }
    }
}

impl std::error::Error for SubSphereManagerError {}

impl From<TaskSubSphereRuntimeError> for SubSphereManagerError {
    fn from(value: TaskSubSphereRuntimeError) -> Self {
        Self::Runtime(value)
    }
}

pub struct SubSphereManager {
    runtime: TaskSubSphereRuntime,
    torus: SubSphereTorus,
    tool_registry: ToolRegistry,
    compute_router: ComputeRouter,
    event_tx: Sender<SubSphereEvent>,
    event_rx: Receiver<SubSphereEvent>,
}

impl SubSphereManager {
    pub fn new(
        runtime: TaskSubSphereRuntime,
        torus: SubSphereTorus,
        tool_registry: ToolRegistry,
        compute_router: ComputeRouter,
    ) -> Self {
        let (event_tx, event_rx) = channel();
        Self {
            runtime,
            torus,
            tool_registry,
            compute_router,
            event_tx,
            event_rx,
        }
    }

    pub fn initialize_from_soul_file(&mut self, soul_file: &SoulFile) {
        self.runtime = TaskSubSphereRuntime::new(soul_file.task_sub_spheres.clone());
    }

    pub fn event_sender(&self) -> Sender<SubSphereEvent> {
        self.event_tx.clone()
    }

    pub fn runtime(&self) -> &TaskSubSphereRuntime {
        &self.runtime
    }

    pub fn snapshot_parts(&self) -> (TaskSubSphereRuntime, SubSphereTorus) {
        (self.runtime.clone(), self.torus.clone())
    }

    pub fn process_event(
        &mut self,
        event: SubSphereEvent,
    ) -> Result<SubSphereEventOutcome, SubSphereManagerError> {
        match event {
            SubSphereEvent::Spawn {
                name,
                objective,
                hitl_required,
            } => {
                let sphere =
                    self.runtime
                        .create_task_sub_sphere(&name, &objective, hitl_required)?;
                Ok(SubSphereEventOutcome::Spawned {
                    sub_sphere_id: sphere.sub_sphere_id,
                })
            }
            SubSphereEvent::Pause { sub_sphere_id } => {
                self.runtime.pause_sub_sphere(&sub_sphere_id)?;
                Ok(SubSphereEventOutcome::Paused { sub_sphere_id })
            }
            SubSphereEvent::Dissolve {
                sub_sphere_id,
                reason,
            } => {
                self.runtime.dissolve_sub_sphere(&sub_sphere_id, &reason)?;
                Ok(SubSphereEventOutcome::Dissolved { sub_sphere_id })
            }
            SubSphereEvent::SubmitQuery {
                sub_sphere_id,
                query,
                provider_override,
            } => {
                let result =
                    self.submit_query(&sub_sphere_id, &query, provider_override.as_deref())?;
                Ok(SubSphereEventOutcome::QuerySubmitted {
                    sub_sphere_id,
                    result,
                })
            }
            SubSphereEvent::Stop => Ok(SubSphereEventOutcome::Stopped),
        }
    }

    pub fn run(&mut self) -> Result<Vec<SubSphereEventOutcome>, SubSphereManagerError> {
        let mut outcomes = Vec::new();
        loop {
            let event = self
                .event_rx
                .recv()
                .map_err(|_| SubSphereManagerError::EventChannelClosed)?;
            let outcome = self.process_event(event)?;
            let should_stop = matches!(outcome, SubSphereEventOutcome::Stopped);
            outcomes.push(outcome);
            if should_stop {
                break;
            }
        }
        Ok(outcomes)
    }

    fn submit_query(
        &mut self,
        sub_sphere_id: &str,
        query: &str,
        provider_override: Option<&str>,
    ) -> Result<SubSphereQueryResult, TaskSubSphereRuntimeError> {
        self.runtime.submit_sub_sphere_query(
            sub_sphere_id,
            query,
            &mut self.torus,
            &self.tool_registry,
            &self.compute_router,
            provider_override,
        )
    }

    pub fn lifecycle_state(
        &self,
        sub_sphere_id: &str,
    ) -> Result<SubSphereLifecycleState, TaskSubSphereRuntimeError> {
        let status = self.runtime.get_sub_sphere_status(sub_sphere_id)?;
        Ok(match status {
            TaskSubSphereStatus::Active => SubSphereLifecycleState::Running,
            TaskSubSphereStatus::Paused => SubSphereLifecycleState::Suspended,
            TaskSubSphereStatus::Dissolved => SubSphereLifecycleState::Complete,
        })
    }

    pub fn list_sub_spheres(&self) -> &[TaskSubSphere] {
        &self.runtime.sub_spheres
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::{
        ComputeError, ComputeProvider, GenerateRequest, GenerateResponse, ProviderHealth,
        ProviderKind,
    };
    use crate::genesis::{
        AIBoundaries, Ratchet, SensitiveComputePolicy, SoulFacet,
        TaskSubSphere as GenesisSubSphere, WillVector,
    };
    use std::sync::Arc;

    struct StaticProvider;

    impl ComputeProvider for StaticProvider {
        fn provider_id(&self) -> &'static str {
            "qwen_local"
        }

        fn kind(&self) -> ProviderKind {
            ProviderKind::Local
        }

        fn health_check(&self) -> Result<ProviderHealth, ComputeError> {
            Ok(ProviderHealth::healthy("qwen_local", self.kind(), None))
        }

        fn get_embedding(&self, text: &str) -> Result<Vec<f64>, ComputeError> {
            if text.trim().is_empty() {
                return Err(ComputeError::invalid_request("text cannot be empty"));
            }
            Ok(vec![0.1, 0.2, 0.3])
        }

        fn generate_response(
            &self,
            _req: GenerateRequest,
        ) -> Result<GenerateResponse, ComputeError> {
            Ok(GenerateResponse {
                provider_id: "qwen_local".to_string(),
                model: "qwen-3.5-32b-q8_0".to_string(),
                output_text: "ok".to_string(),
                finish_reason: Some("stop".to_string()),
                usage: None,
                metadata: Default::default(),
                latency_ms: 1,
            })
        }
    }

    fn compute_router() -> ComputeRouter {
        let mut router = ComputeRouter::new("qwen_local");
        router.register_provider(Arc::new(StaticProvider));
        router
    }

    fn manager() -> SubSphereManager {
        SubSphereManager::new(
            TaskSubSphereRuntime::default(),
            SubSphereTorus::new(),
            ToolRegistry::default(),
            compute_router(),
        )
    }

    #[test]
    fn initialize_from_soul_file_seeds_runtime_state() {
        let mut soul_file = SoulFile::new(
            "MetaCanon".to_string(),
            vec!["Privacy".to_string()],
            vec![SoulFacet {
                vision: "Protect".to_string(),
                territories: vec!["runtime".to_string()],
                duties: vec!["validate".to_string()],
                expansion_thresholds: vec![],
                emotional_thresholds: vec![],
            }],
            AIBoundaries {
                human_in_loop: true,
                interpretive_boundaries: vec![],
                drift_prevention: "strict".to_string(),
                enable_morpheus_compute: false,
                morpheus_config: None,
                sensitive_compute_policy: SensitiveComputePolicy::UserChoice,
            },
            Ratchet::default(),
            WillVector {
                directives: vec!["protect private thoughts".to_string()],
            },
            "test-secret",
        );

        soul_file.task_sub_spheres.push(GenesisSubSphere {
            sub_sphere_id: "ss-1".to_string(),
            name: "One".to_string(),
            objective: "Ship".to_string(),
            hitl_required: false,
            territories: vec![],
            duties: vec![],
            capability_tags: vec![],
            specialist_lenses: vec![],
            status: TaskSubSphereStatus::Active,
            created_at: 1,
            updated_at: 1,
            dissolved_reason: None,
        });

        let mut manager = manager();
        manager.initialize_from_soul_file(&soul_file);
        assert_eq!(manager.list_sub_spheres().len(), 1);
        assert_eq!(manager.list_sub_spheres()[0].sub_sphere_id, "ss-1");
    }

    #[test]
    fn process_event_spawn_and_pause_updates_lifecycle() {
        let mut manager = manager();
        let spawned = manager
            .process_event(SubSphereEvent::Spawn {
                name: "Integrations".to_string(),
                objective: "Wire Telegram".to_string(),
                hitl_required: true,
            })
            .expect("spawn should succeed");

        let sub_sphere_id = match spawned {
            SubSphereEventOutcome::Spawned { sub_sphere_id } => sub_sphere_id,
            _ => panic!("unexpected outcome"),
        };
        assert_eq!(
            manager
                .lifecycle_state(&sub_sphere_id)
                .expect("state should exist"),
            SubSphereLifecycleState::Running
        );

        manager
            .process_event(SubSphereEvent::Pause {
                sub_sphere_id: sub_sphere_id.clone(),
            })
            .expect("pause should succeed");

        assert_eq!(
            manager
                .lifecycle_state(&sub_sphere_id)
                .expect("state should exist"),
            SubSphereLifecycleState::Suspended
        );
    }

    #[test]
    fn run_consumes_queued_events_until_stop() {
        let mut manager = manager();
        let sender = manager.event_sender();
        sender
            .send(SubSphereEvent::Spawn {
                name: "Core".to_string(),
                objective: "Build".to_string(),
                hitl_required: false,
            })
            .expect("send spawn");
        sender.send(SubSphereEvent::Stop).expect("send stop");

        let outcomes = manager.run().expect("run should succeed");
        assert!(outcomes
            .iter()
            .any(|outcome| matches!(outcome, SubSphereEventOutcome::Spawned { .. })));
        assert!(matches!(
            outcomes.last(),
            Some(SubSphereEventOutcome::Stopped)
        ));
    }
}
