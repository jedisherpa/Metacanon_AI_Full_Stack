use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::genesis::current_unix_timestamp;
use crate::specialist_lens::{ActiveSpecialistLens, SpecialistLensDefinition};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum LensLibraryTier {
    #[default]
    LocalPrivate,
    LocalShared,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LensLibraryEntry {
    pub entry_id: String,
    pub source_sub_sphere_id: String,
    pub lens_definition: SpecialistLensDefinition,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub tier: LensLibraryTier,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct LensLibraryState {
    #[serde(default)]
    pub entries: Vec<LensLibraryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LensLibraryError {
    EmptySubSphereId,
    EmptyEntryId,
    EntryNotFound(String),
}

impl std::fmt::Display for LensLibraryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LensLibraryError::EmptySubSphereId => f.write_str("sub_sphere_id must not be empty"),
            LensLibraryError::EmptyEntryId => f.write_str("entry_id must not be empty"),
            LensLibraryError::EntryNotFound(id) => write!(f, "lens library entry not found: {id}"),
        }
    }
}

impl std::error::Error for LensLibraryError {}

impl LensLibraryState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn save_active_lens(
        &mut self,
        source_sub_sphere_id: &str,
        lens: &ActiveSpecialistLens,
        tier: LensLibraryTier,
    ) -> Result<LensLibraryEntry, LensLibraryError> {
        if source_sub_sphere_id.trim().is_empty() {
            return Err(LensLibraryError::EmptySubSphereId);
        }

        let now = current_unix_timestamp();
        let entry = LensLibraryEntry {
            entry_id: format!("ll-{}-{now}", lens.lens_id),
            source_sub_sphere_id: source_sub_sphere_id.to_string(),
            lens_definition: SpecialistLensDefinition {
                lens_definition_id: lens.lens_definition_id.clone(),
                name: lens.name.clone(),
                objective: lens.objective.clone(),
                capability_tags: lens.capability_tags.clone(),
                tool_allowlist: lens.tool_allowlist.clone(),
                requires_hitl_approval: lens.requires_hitl_approval,
            },
            tags: lens.capability_tags.clone(),
            tier,
            created_at: now,
            updated_at: now,
        };

        self.entries.push(entry.clone());
        Ok(entry)
    }

    pub fn save_lens_to_library(
        &mut self,
        source_sub_sphere_id: &str,
        lens: &ActiveSpecialistLens,
        tier: LensLibraryTier,
    ) -> Result<LensLibraryEntry, LensLibraryError> {
        self.save_active_lens(source_sub_sphere_id, lens, tier)
    }

    pub fn search(
        &self,
        query: &str,
        tier: Option<LensLibraryTier>,
        tags: &[String],
    ) -> Vec<LensLibraryEntry> {
        let lowered_query = query.trim().to_lowercase();
        let tag_set: HashSet<&str> = tags.iter().map(std::string::String::as_str).collect();

        self.entries
            .iter()
            .filter(|entry| match tier.as_ref() {
                Some(expected) => expected == &entry.tier,
                None => true,
            })
            .filter(|entry| {
                if lowered_query.is_empty() {
                    return true;
                }

                entry
                    .lens_definition
                    .name
                    .to_lowercase()
                    .contains(&lowered_query)
                    || entry
                        .lens_definition
                        .objective
                        .to_lowercase()
                        .contains(&lowered_query)
                    || entry
                        .tags
                        .iter()
                        .any(|tag| tag.to_lowercase().contains(&lowered_query))
            })
            .filter(|entry| {
                if tag_set.is_empty() {
                    return true;
                }
                let entry_tag_set: HashSet<&str> =
                    entry.tags.iter().map(std::string::String::as_str).collect();
                tag_set.iter().all(|tag| entry_tag_set.contains(tag))
            })
            .cloned()
            .collect()
    }

    pub fn search_lens_library(
        &self,
        query: &str,
        tier: Option<LensLibraryTier>,
        tags: &[String],
    ) -> Vec<LensLibraryEntry> {
        self.search(query, tier, tags)
    }

    pub fn instantiate_lens_definition(
        &self,
        entry_id: &str,
        lens_definition_id: String,
    ) -> Result<SpecialistLensDefinition, LensLibraryError> {
        if entry_id.trim().is_empty() {
            return Err(LensLibraryError::EmptyEntryId);
        }

        let entry = self
            .entries
            .iter()
            .find(|candidate| candidate.entry_id == entry_id)
            .ok_or_else(|| LensLibraryError::EntryNotFound(entry_id.to_string()))?;

        let mut definition = entry.lens_definition.clone();
        definition.lens_definition_id = lens_definition_id;
        Ok(definition)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn save_and_search_lens_library_entry() {
        let mut state = LensLibraryState::new();
        let lens = ActiveSpecialistLens {
            lens_id: "lens-ops".to_string(),
            lens_definition_id: "def-ops".to_string(),
            name: "Ops Lens".to_string(),
            objective: "Handle operational incidents".to_string(),
            capability_tags: vec!["ops".to_string(), "alerts".to_string()],
            tool_allowlist: vec!["local_search".to_string()],
            requires_hitl_approval: false,
            customizations: Value::Null,
            status: crate::specialist_lens::SpecialistLensStatus::Active,
            contact_lens_text: Some("Prioritize uptime and safety".to_string()),
            created_at: current_unix_timestamp(),
            updated_at: current_unix_timestamp(),
            revoked_reason: None,
        };

        state
            .save_active_lens("ss-ops", &lens, LensLibraryTier::LocalPrivate)
            .expect("save should succeed");

        let results = state.search("ops", Some(LensLibraryTier::LocalPrivate), &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].lens_definition.name, "Ops Lens");
    }
}
