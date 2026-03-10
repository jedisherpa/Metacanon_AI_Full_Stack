use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ToolScope {
    #[default]
    LocalOnly,
    NetworkRestricted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolDefinition {
    pub tool_id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub allowed_sub_sphere_ids: Vec<String>,
    #[serde(default)]
    pub required_capability_tags: Vec<String>,
    #[serde(default)]
    pub scope: ToolScope,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolInvocationRequest {
    pub tool_id: String,
    pub sub_sphere_id: String,
    #[serde(default)]
    pub lens_id: Option<String>,
    #[serde(default)]
    pub lens_capability_tags: Vec<String>,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolGuardrailError {
    EmptyToolId,
    EmptySubSphereId,
    DuplicateToolId(String),
    UnknownTool(String),
    ToolDisabled(String),
    SubSphereNotAllowed {
        tool_id: String,
        sub_sphere_id: String,
    },
    MissingCapability {
        tool_id: String,
        capability: String,
    },
}

impl std::fmt::Display for ToolGuardrailError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolGuardrailError::EmptyToolId => f.write_str("tool_id must not be empty"),
            ToolGuardrailError::EmptySubSphereId => f.write_str("sub_sphere_id must not be empty"),
            ToolGuardrailError::DuplicateToolId(tool_id) => {
                write!(f, "tool already exists: {tool_id}")
            }
            ToolGuardrailError::UnknownTool(tool_id) => write!(f, "unknown tool: {tool_id}"),
            ToolGuardrailError::ToolDisabled(tool_id) => write!(f, "tool disabled: {tool_id}"),
            ToolGuardrailError::SubSphereNotAllowed {
                tool_id,
                sub_sphere_id,
            } => write!(
                f,
                "sub-sphere {sub_sphere_id} is not allowed to invoke tool {tool_id}"
            ),
            ToolGuardrailError::MissingCapability {
                tool_id,
                capability,
            } => write!(
                f,
                "tool {tool_id} requires missing capability tag: {capability}"
            ),
        }
    }
}

impl std::error::Error for ToolGuardrailError {}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolRegistry {
    tools: BTreeMap<String, ToolDefinition>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_tool(&mut self, definition: ToolDefinition) -> Result<(), ToolGuardrailError> {
        if definition.tool_id.trim().is_empty() {
            return Err(ToolGuardrailError::EmptyToolId);
        }
        if self.tools.contains_key(&definition.tool_id) {
            return Err(ToolGuardrailError::DuplicateToolId(
                definition.tool_id.clone(),
            ));
        }

        self.tools.insert(definition.tool_id.clone(), definition);
        Ok(())
    }

    pub fn get_tool(&self, tool_id: &str) -> Option<&ToolDefinition> {
        self.tools.get(tool_id)
    }

    pub fn list_tools_for_sub_sphere(&self, sub_sphere_id: &str) -> Vec<ToolDefinition> {
        self.tools
            .values()
            .filter(|tool| {
                tool.allowed_sub_sphere_ids.is_empty()
                    || tool
                        .allowed_sub_sphere_ids
                        .iter()
                        .any(|id| id == sub_sphere_id)
            })
            .cloned()
            .collect()
    }

    pub fn ensure_known_tools(&self, tool_ids: &[String]) -> Result<(), ToolGuardrailError> {
        for tool_id in tool_ids {
            if !self.tools.contains_key(tool_id) {
                return Err(ToolGuardrailError::UnknownTool(tool_id.clone()));
            }
        }
        Ok(())
    }

    pub fn validate_invocation(
        &self,
        request: &ToolInvocationRequest,
    ) -> Result<&ToolDefinition, ToolGuardrailError> {
        if request.tool_id.trim().is_empty() {
            return Err(ToolGuardrailError::EmptyToolId);
        }
        if request.sub_sphere_id.trim().is_empty() {
            return Err(ToolGuardrailError::EmptySubSphereId);
        }

        let tool = self
            .tools
            .get(&request.tool_id)
            .ok_or_else(|| ToolGuardrailError::UnknownTool(request.tool_id.clone()))?;

        if !tool.enabled {
            return Err(ToolGuardrailError::ToolDisabled(tool.tool_id.clone()));
        }

        if !tool.allowed_sub_sphere_ids.is_empty()
            && !tool
                .allowed_sub_sphere_ids
                .iter()
                .any(|id| id == &request.sub_sphere_id)
        {
            return Err(ToolGuardrailError::SubSphereNotAllowed {
                tool_id: tool.tool_id.clone(),
                sub_sphere_id: request.sub_sphere_id.clone(),
            });
        }

        let lens_capability_set: HashSet<&str> = request
            .lens_capability_tags
            .iter()
            .map(std::string::String::as_str)
            .collect();

        for required in &tool.required_capability_tags {
            if !lens_capability_set.contains(required.as_str()) {
                return Err(ToolGuardrailError::MissingCapability {
                    tool_id: tool.tool_id.clone(),
                    capability: required.clone(),
                });
            }
        }

        Ok(tool)
    }
}

fn default_enabled() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_invocation_guardrails_block_missing_capability() {
        let mut registry = ToolRegistry::new();
        registry
            .register_tool(ToolDefinition {
                tool_id: "local_search".to_string(),
                name: "Local Search".to_string(),
                description: "Search local indexed content".to_string(),
                allowed_sub_sphere_ids: vec!["ss-research".to_string()],
                required_capability_tags: vec!["search".to_string()],
                scope: ToolScope::LocalOnly,
                enabled: true,
            })
            .expect("tool registration should succeed");

        let result = registry.validate_invocation(&ToolInvocationRequest {
            tool_id: "local_search".to_string(),
            sub_sphere_id: "ss-research".to_string(),
            lens_id: Some("lens-r1".to_string()),
            lens_capability_tags: vec!["summarization".to_string()],
            payload: Value::Null,
        });

        assert_eq!(
            result,
            Err(ToolGuardrailError::MissingCapability {
                tool_id: "local_search".to_string(),
                capability: "search".to_string()
            })
        );
    }
}
