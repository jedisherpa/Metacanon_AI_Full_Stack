use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug)]
pub enum SnapshotStorageError {
    Io(std::io::Error),
    Serialize(serde_json::Error),
    Deserialize(serde_json::Error),
}

impl std::fmt::Display for SnapshotStorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SnapshotStorageError::Io(error) => write!(f, "storage io error: {error}"),
            SnapshotStorageError::Serialize(error) => {
                write!(f, "snapshot serialization error: {error}")
            }
            SnapshotStorageError::Deserialize(error) => {
                write!(f, "snapshot deserialization error: {error}")
            }
        }
    }
}

impl std::error::Error for SnapshotStorageError {}

pub fn write_snapshot_json<T: Serialize>(
    path: impl AsRef<Path>,
    value: &T,
) -> Result<(), SnapshotStorageError> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(SnapshotStorageError::Io)?;
    }

    let encoded = serde_json::to_vec_pretty(value).map_err(SnapshotStorageError::Serialize)?;
    fs::write(path, encoded).map_err(SnapshotStorageError::Io)
}

pub fn read_snapshot_json<T: DeserializeOwned>(
    path: impl AsRef<Path>,
) -> Result<T, SnapshotStorageError> {
    let bytes = fs::read(path).map_err(SnapshotStorageError::Io)?;
    serde_json::from_slice(&bytes).map_err(SnapshotStorageError::Deserialize)
}

pub const SOUL_FILES_TABLE_NAME: &str = "soul_files";
pub const TASK_SUB_SPHERES_TABLE_NAME: &str = "task_sub_spheres";
pub const TASK_RUNTIME_EVENTS_TABLE_NAME: &str = "task_runtime_events";
pub const LENS_LIBRARY_ENTRIES_TABLE_NAME: &str = "lens_library_entries";
pub const WORKFLOW_TRAINING_SESSIONS_TABLE_NAME: &str = "workflow_training_sessions";
pub const WORKFLOWS_TABLE_NAME: &str = "workflows";

pub const CREATE_SOUL_FILES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS soul_files (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    vision_core TEXT NOT NULL,
    core_values_json TEXT NOT NULL,
    soul_facets_json TEXT NOT NULL,
    ai_boundaries_json TEXT NOT NULL,
    ratchet_json TEXT NOT NULL,
    will_vector_json TEXT NOT NULL,
    genesis_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    task_sub_spheres_json TEXT NOT NULL DEFAULT '[]',
    lens_library_json TEXT NOT NULL DEFAULT '{"entries":[]}',
    workflow_registry_json TEXT NOT NULL DEFAULT '{"training_sessions":[],"workflows":[]}',
    future_sub_sphere_registry_json TEXT,
    future_lens_library_manifest_json TEXT,
    extensions_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);
"#;

pub const CREATE_TASK_SUB_SPHERES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS task_sub_spheres (
    sub_sphere_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    objective TEXT NOT NULL,
    hitl_required INTEGER NOT NULL DEFAULT 0,
    territories_json TEXT NOT NULL,
    duties_json TEXT NOT NULL,
    capability_tags_json TEXT NOT NULL,
    specialist_lenses_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    dissolved_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
"#;

pub const CREATE_TASK_RUNTIME_EVENTS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS task_runtime_events (
    event_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    sub_sphere_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(sub_sphere_id) REFERENCES task_sub_spheres(sub_sphere_id)
);
"#;

pub const CREATE_LENS_LIBRARY_ENTRIES_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS lens_library_entries (
    entry_id TEXT PRIMARY KEY,
    source_sub_sphere_id TEXT NOT NULL,
    lens_definition_json TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    tier TEXT NOT NULL DEFAULT 'local_private',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
"#;

pub const CREATE_WORKFLOW_TRAINING_SESSIONS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS workflow_training_sessions (
    session_id TEXT PRIMARY KEY,
    sub_sphere_id TEXT NOT NULL,
    status TEXT NOT NULL,
    transcript_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(sub_sphere_id) REFERENCES task_sub_spheres(sub_sphere_id)
);
"#;

pub const CREATE_WORKFLOWS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS workflows (
    workflow_id TEXT PRIMARY KEY,
    sub_sphere_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    steps_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(sub_sphere_id) REFERENCES task_sub_spheres(sub_sphere_id)
);
"#;

pub const ALTER_SOUL_FILES_ADD_FUTURE_SUB_SPHERE_REGISTRY_SQL: &str = r#"
ALTER TABLE soul_files
ADD COLUMN future_sub_sphere_registry_json TEXT;
"#;

pub const ALTER_SOUL_FILES_ADD_FUTURE_LENS_LIBRARY_MANIFEST_SQL: &str = r#"
ALTER TABLE soul_files
ADD COLUMN future_lens_library_manifest_json TEXT;
"#;

pub const ALTER_SOUL_FILES_ADD_EXTENSIONS_SQL: &str = r#"
ALTER TABLE soul_files
ADD COLUMN extensions_json TEXT NOT NULL DEFAULT '{}';
"#;

pub const ALTER_SOUL_FILES_ADD_TASK_SUB_SPHERES_SQL: &str = r#"
ALTER TABLE soul_files
ADD COLUMN task_sub_spheres_json TEXT NOT NULL DEFAULT '[]';
"#;

pub const ALTER_SOUL_FILES_ADD_LENS_LIBRARY_SQL: &str = r#"
ALTER TABLE soul_files
ADD COLUMN lens_library_json TEXT NOT NULL DEFAULT '{"entries":[]}';
"#;

pub const ALTER_SOUL_FILES_ADD_WORKFLOW_REGISTRY_SQL: &str = r#"
ALTER TABLE soul_files
ADD COLUMN workflow_registry_json TEXT NOT NULL DEFAULT '{"training_sessions":[],"workflows":[]}';
"#;

pub const SOUL_FILE_SCHEMA_ALTER_STEPS: [&str; 6] = [
    ALTER_SOUL_FILES_ADD_TASK_SUB_SPHERES_SQL,
    ALTER_SOUL_FILES_ADD_LENS_LIBRARY_SQL,
    ALTER_SOUL_FILES_ADD_WORKFLOW_REGISTRY_SQL,
    ALTER_SOUL_FILES_ADD_FUTURE_SUB_SPHERE_REGISTRY_SQL,
    ALTER_SOUL_FILES_ADD_FUTURE_LENS_LIBRARY_MANIFEST_SQL,
    ALTER_SOUL_FILES_ADD_EXTENSIONS_SQL,
];

pub const TASK_RUNTIME_SCHEMA_BOOTSTRAP_STEPS: [&str; 5] = [
    CREATE_TASK_SUB_SPHERES_TABLE_SQL,
    CREATE_TASK_RUNTIME_EVENTS_TABLE_SQL,
    CREATE_LENS_LIBRARY_ENTRIES_TABLE_SQL,
    CREATE_WORKFLOW_TRAINING_SESSIONS_TABLE_SQL,
    CREATE_WORKFLOWS_TABLE_SQL,
];

pub fn soul_file_schema_bootstrap_sql() -> &'static str {
    CREATE_SOUL_FILES_TABLE_SQL
}

pub fn soul_file_schema_alter_steps() -> &'static [&'static str] {
    &SOUL_FILE_SCHEMA_ALTER_STEPS
}

pub fn task_runtime_schema_bootstrap_steps() -> &'static [&'static str] {
    &TASK_RUNTIME_SCHEMA_BOOTSTRAP_STEPS
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
    struct SnapshotFixture {
        id: String,
        value: i64,
    }

    #[test]
    fn snapshot_json_round_trip() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be available")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("metacanon-storage-test-{nanos}.json"));
        let fixture = SnapshotFixture {
            id: "fixture-1".to_string(),
            value: 42,
        };

        write_snapshot_json(&path, &fixture).expect("snapshot write should succeed");
        let loaded: SnapshotFixture =
            read_snapshot_json(&path).expect("snapshot read should succeed");
        assert_eq!(loaded, fixture);

        let _ = fs::remove_file(path);
    }
}
