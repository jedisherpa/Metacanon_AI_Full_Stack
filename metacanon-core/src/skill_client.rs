use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt;

pub const DEFAULT_SKILL_RUNTIME_URL: &str = "http://localhost:3101";
pub const DEFAULT_SPHERE_SERVICE_TOKEN: &str = "dev-sphere-bff-service-token";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillClientConfig {
    pub base_url: String,
    pub service_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillExecutionRequest {
    pub skill_id: String,
    pub input: Value,
    pub trace_id: Option<String>,
    pub requested_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillExecutionResult {
    pub skill_id: String,
    pub run_id: String,
    pub status: String,
    pub message: String,
    pub code: Option<String>,
    pub trace_id: Option<String>,
    pub output_preview: Option<String>,
    pub output_json: Option<String>,
}

#[derive(Debug)]
pub enum SkillClientError {
    InvalidConfig(String),
    Http(reqwest::Error),
    Parse(String),
    UnexpectedStatus(u16, String),
}

impl fmt::Display for SkillClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SkillClientError::InvalidConfig(message) => {
                write!(f, "invalid skill client config: {message}")
            }
            SkillClientError::Http(error) => write!(f, "skill runtime request failed: {error}"),
            SkillClientError::Parse(message) => write!(f, "skill runtime response invalid: {message}"),
            SkillClientError::UnexpectedStatus(status, body) => {
                write!(f, "skill runtime returned status {status}: {body}")
            }
        }
    }
}

impl std::error::Error for SkillClientError {}

#[derive(Debug, Deserialize)]
struct SkillRunEnvelope {
    run: SkillRunRecord,
}

#[derive(Debug, Deserialize)]
struct SkillRunRecord {
    #[serde(rename = "runId")]
    run_id: String,
    #[serde(rename = "skillId")]
    skill_id: String,
    #[serde(rename = "traceId")]
    trace_id: Option<String>,
    result: SkillRunOutcome,
}

#[derive(Debug, Deserialize)]
struct SkillRunOutcome {
    status: String,
    message: Option<String>,
    code: Option<String>,
    output: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct SkillClient {
    config: SkillClientConfig,
    http: Client,
}

impl SkillClient {
    pub fn new(config: SkillClientConfig) -> Result<Self, SkillClientError> {
        if config.base_url.trim().is_empty() {
            return Err(SkillClientError::InvalidConfig(
                "base_url must not be empty".to_string(),
            ));
        }
        if config.service_token.trim().is_empty() {
            return Err(SkillClientError::InvalidConfig(
                "service_token must not be empty".to_string(),
            ));
        }

        Ok(Self {
            config,
            http: Client::new(),
        })
    }

    pub fn from_env() -> Result<Self, SkillClientError> {
        let base_url = std::env::var("SPHERE_ENGINE_URL")
            .unwrap_or_else(|_| DEFAULT_SKILL_RUNTIME_URL.to_string());
        let service_token = std::env::var("SPHERE_BFF_SERVICE_TOKEN")
            .unwrap_or_else(|_| DEFAULT_SPHERE_SERVICE_TOKEN.to_string());
        Self::new(SkillClientConfig {
            base_url,
            service_token,
        })
    }

    pub fn execute_skill(
        &self,
        request: SkillExecutionRequest,
    ) -> Result<SkillExecutionResult, SkillClientError> {
        let url = format!(
            "{}/api/v1/runtime/skills/run",
            self.config.base_url.trim_end_matches('/')
        );
        let body = json!({
            "skillId": request.skill_id,
            "input": request.input,
            "traceId": request.trace_id,
            "requestedBy": request.requested_by,
        });

        let response = self
            .http
            .post(url)
            .header("Content-Type", "application/json")
            .header("x-sphere-service-token", &self.config.service_token)
            .json(&body)
            .send()
            .map_err(SkillClientError::Http)?;

        let status = response.status().as_u16();
        let body_text = response.text().map_err(SkillClientError::Http)?;
        if status != 200 && status != 409 {
            return Err(SkillClientError::UnexpectedStatus(status, body_text));
        }

        let parsed: SkillRunEnvelope =
            serde_json::from_str(&body_text).map_err(|error| SkillClientError::Parse(error.to_string()))?;
        let output_preview = parsed
            .run
            .result
            .output
            .as_ref()
            .map(|value| trim_preview(&value.to_string(), 480));
        let output_json = parsed
            .run
            .result
            .output
            .as_ref()
            .map(|value| value.to_string());
        let message = parsed
            .run
            .result
            .message
            .clone()
            .unwrap_or_else(|| default_skill_message(&parsed.run.result.status, output_preview.as_deref()));

        Ok(SkillExecutionResult {
            skill_id: parsed.run.skill_id,
            run_id: parsed.run.run_id,
            status: parsed.run.result.status,
            message,
            code: parsed.run.result.code,
            trace_id: parsed.run.trace_id,
            output_preview,
            output_json,
        })
    }
}

fn trim_preview(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    let mut shortened = text[..max_len].to_string();
    shortened.push_str("...");
    shortened
}

fn default_skill_message(status: &str, output_preview: Option<&str>) -> String {
    match status {
        "success" => output_preview
            .map(|preview| format!("Skill executed successfully. Output preview: {preview}"))
            .unwrap_or_else(|| "Skill executed successfully.".to_string()),
        "queued" => "Skill request accepted and queued.".to_string(),
        "running" => "Skill is currently running.".to_string(),
        "skipped" => "Skill did not execute.".to_string(),
        "failed" => output_preview
            .map(|preview| format!("Skill execution failed. Output preview: {preview}"))
            .unwrap_or_else(|| "Skill execution failed.".to_string()),
        _ => output_preview
            .map(|preview| format!("Skill returned status {status}. Output preview: {preview}"))
            .unwrap_or_else(|| format!("Skill returned status {status}.")),
    }
}
