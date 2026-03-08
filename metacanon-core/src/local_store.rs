use crate::storage::{read_snapshot_json, write_snapshot_json, SnapshotStorageError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct GenesisArtifactReference {
    pub artifact_path: String,
    pub genesis_hash: String,
    pub signature: String,
    pub schema_version: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct LocalRuntimeSettings {
    pub prism_display_name: Option<String>,
    pub preferred_channel: Option<String>,
    pub sphere_engine_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct LocalRuntimeState {
    pub active_genesis: Option<GenesisArtifactReference>,
    pub settings: LocalRuntimeSettings,
    pub last_open_round_id: Option<String>,
    pub last_task_summary: Option<String>,
}

// Genesis remains a canonical file artifact on disk. This store only tracks
// local runtime metadata and references around that artifact.
pub fn default_local_runtime_state_path() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".metacanon_ai")
        .join("local_runtime_state.json")
}

pub fn load_local_runtime_state(
    path: impl AsRef<Path>,
) -> Result<LocalRuntimeState, SnapshotStorageError> {
    read_snapshot_json(path)
}

pub fn save_local_runtime_state(
    path: impl AsRef<Path>,
    state: &LocalRuntimeState,
) -> Result<(), SnapshotStorageError> {
    write_snapshot_json(path, state)
}
