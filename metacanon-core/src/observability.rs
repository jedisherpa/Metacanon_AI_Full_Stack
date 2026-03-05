use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::error::Error;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_RETENTION_DAYS: i64 = 90;
const MILLIS_PER_DAY: i64 = 86_400_000;
static EVENT_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObservabilityConfig {
    pub full_events_log_path: PathBuf,
    pub redacted_graph_feed_path: PathBuf,
    pub encryption_key: Vec<u8>,
    pub retention_days: i64,
}

impl ObservabilityConfig {
    pub fn for_log_dir(log_dir: impl AsRef<Path>, encryption_key: Vec<u8>) -> Self {
        let log_dir = log_dir.as_ref();
        Self {
            full_events_log_path: log_dir.join("full-events.log.enc"),
            redacted_graph_feed_path: log_dir.join("redacted-graph.ndjson"),
            encryption_key,
            retention_days: DEFAULT_RETENTION_DAYS,
        }
    }
}

#[derive(Debug)]
pub enum ObservabilityError {
    InvalidEncryptionKey,
    Io(std::io::Error),
    Serde(serde_json::Error),
    CorruptCiphertext(String),
}

impl fmt::Display for ObservabilityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ObservabilityError::InvalidEncryptionKey => {
                f.write_str("observability encryption key cannot be empty")
            }
            ObservabilityError::Io(error) => write!(f, "observability io error: {error}"),
            ObservabilityError::Serde(error) => {
                write!(f, "observability serialization error: {error}")
            }
            ObservabilityError::CorruptCiphertext(message) => {
                write!(f, "corrupt encrypted log payload: {message}")
            }
        }
    }
}

impl Error for ObservabilityError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            ObservabilityError::Io(error) => Some(error),
            ObservabilityError::Serde(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for ObservabilityError {
    fn from(error: std::io::Error) -> Self {
        ObservabilityError::Io(error)
    }
}

impl From<serde_json::Error> for ObservabilityError {
    fn from(error: serde_json::Error) -> Self {
        ObservabilityError::Serde(error)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FullEventRecord {
    pub event_id: String,
    pub trace_id: String,
    pub parent_id: Option<String>,
    pub event_type: String,
    pub created_at_ms: i64,
    pub provider_id: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RedactedGraphEvent {
    pub event_id: String,
    pub trace_id: String,
    pub parent_id: Option<String>,
    pub event_type: String,
    pub created_at_ms: i64,
    pub provider_id: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedFullLogLine {
    created_at_ms: i64,
    event_id: String,
    trace_id: String,
    event_type: String,
    ciphertext_hex: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionReport {
    pub full_before: usize,
    pub full_after: usize,
    pub redacted_before: usize,
    pub redacted_after: usize,
    pub cutoff_timestamp_ms: i64,
}

#[derive(Debug, Clone)]
pub struct ObservabilityLogger {
    config: ObservabilityConfig,
}

impl ObservabilityLogger {
    pub fn new(config: ObservabilityConfig) -> Result<Self, ObservabilityError> {
        if config.encryption_key.is_empty() {
            return Err(ObservabilityError::InvalidEncryptionKey);
        }

        create_parent_dir(&config.full_events_log_path)?;
        create_parent_dir(&config.redacted_graph_feed_path)?;

        if !config.full_events_log_path.exists() {
            File::create(&config.full_events_log_path)?;
        }
        if !config.redacted_graph_feed_path.exists() {
            File::create(&config.redacted_graph_feed_path)?;
        }

        Ok(Self { config })
    }

    pub fn config(&self) -> &ObservabilityConfig {
        &self.config
    }

    pub fn record_dual_tier_event(
        &self,
        event_type: &str,
        trace_id: &str,
        parent_id: Option<&str>,
        provider_id: Option<&str>,
        full_payload: Value,
        redacted_payload: Value,
    ) -> Result<String, ObservabilityError> {
        self.record_dual_tier_event_at(
            event_type,
            trace_id,
            parent_id,
            provider_id,
            full_payload,
            redacted_payload,
            current_unix_timestamp_ms(),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn record_dual_tier_event_at(
        &self,
        event_type: &str,
        trace_id: &str,
        parent_id: Option<&str>,
        provider_id: Option<&str>,
        full_payload: Value,
        redacted_payload: Value,
        created_at_ms: i64,
    ) -> Result<String, ObservabilityError> {
        let event_id = next_event_id(created_at_ms);
        let event_type = event_type.trim().to_string();
        let trace_id = trace_id.trim().to_string();
        let parent_id = parent_id.map(|id| id.trim().to_string());
        let provider_id = provider_id.map(|id| id.trim().to_string());

        let full_event = FullEventRecord {
            event_id: event_id.clone(),
            trace_id: trace_id.clone(),
            parent_id: parent_id.clone(),
            event_type: event_type.clone(),
            created_at_ms,
            provider_id: provider_id.clone(),
            payload: full_payload,
        };

        let ciphertext_hex = self.encrypt_event(&full_event)?;
        let encrypted_line = EncryptedFullLogLine {
            created_at_ms,
            event_id: event_id.clone(),
            trace_id: trace_id.clone(),
            event_type: event_type.clone(),
            ciphertext_hex,
        };
        append_ndjson_line(&self.config.full_events_log_path, &encrypted_line)?;

        let redacted_event = RedactedGraphEvent {
            event_id: event_id.clone(),
            trace_id,
            parent_id,
            event_type,
            created_at_ms,
            provider_id,
            payload: redact_graph_value(&redacted_payload),
        };
        append_ndjson_line(&self.config.redacted_graph_feed_path, &redacted_event)?;

        Ok(event_id)
    }

    pub fn record_fallback_transition(
        &self,
        trace_id: &str,
        from_provider: &str,
        to_provider: &str,
        reason: &str,
        attempt_index: u32,
    ) -> Result<(), ObservabilityError> {
        let full_payload = json!({
            "from_provider": from_provider,
            "to_provider": to_provider,
            "reason": reason,
            "attempt_index": attempt_index,
        });
        let redacted_payload = json!({
            "from_provider": from_provider,
            "to_provider": to_provider,
            "reason": reason,
            "attempt_index": attempt_index,
        });

        self.record_dual_tier_event(
            "fallback_transition",
            trace_id,
            None,
            Some(to_provider),
            full_payload,
            redacted_payload,
        )?;
        Ok(())
    }

    pub fn record_deliberation_success(
        &self,
        trace_id: &str,
        requested_provider: &str,
        resolved_provider: &str,
        attempt_count: u32,
    ) -> Result<(), ObservabilityError> {
        let full_payload = json!({
            "status": "success",
            "requested_provider": requested_provider,
            "resolved_provider": resolved_provider,
            "attempt_count": attempt_count,
        });
        let redacted_payload = json!({
            "status": "success",
            "requested_provider": requested_provider,
            "resolved_provider": resolved_provider,
            "attempt_count": attempt_count,
        });

        self.record_dual_tier_event(
            "deliberation_outcome",
            trace_id,
            None,
            Some(resolved_provider),
            full_payload,
            redacted_payload,
        )?;
        Ok(())
    }

    pub fn record_deliberation_failure(
        &self,
        trace_id: &str,
        requested_provider: &str,
        attempt_chain: &[String],
    ) -> Result<(), ObservabilityError> {
        let full_payload = json!({
            "status": "failed",
            "requested_provider": requested_provider,
            "attempt_chain": attempt_chain,
        });
        let redacted_payload = json!({
            "status": "failed",
            "requested_provider": requested_provider,
            "attempt_chain": attempt_chain,
        });

        self.record_dual_tier_event(
            "deliberation_outcome",
            trace_id,
            None,
            Some(requested_provider),
            full_payload,
            redacted_payload,
        )?;
        Ok(())
    }

    pub fn read_full_events(&self) -> Result<Vec<FullEventRecord>, ObservabilityError> {
        let mut events = Vec::new();
        for line in read_non_empty_lines(&self.config.full_events_log_path)? {
            let entry: EncryptedFullLogLine = serde_json::from_str(&line)?;
            events.push(self.decrypt_line(entry)?);
        }
        Ok(events)
    }

    pub fn read_redacted_events(&self) -> Result<Vec<RedactedGraphEvent>, ObservabilityError> {
        let mut events = Vec::new();
        for line in read_non_empty_lines(&self.config.redacted_graph_feed_path)? {
            let entry: RedactedGraphEvent = serde_json::from_str(&line)?;
            events.push(entry);
        }
        Ok(events)
    }

    pub fn run_retention(&self, now_ms: i64) -> Result<RetentionReport, ObservabilityError> {
        let retention_days = self.config.retention_days.max(0);
        let cutoff_timestamp_ms =
            now_ms.saturating_sub(retention_days.saturating_mul(MILLIS_PER_DAY));

        let (full_before, full_after) =
            retain_lines(
                &self.config.full_events_log_path,
                |line| match serde_json::from_str::<EncryptedFullLogLine>(line) {
                    Ok(entry) => entry.created_at_ms >= cutoff_timestamp_ms,
                    Err(_) => true,
                },
            )?;

        let (redacted_before, redacted_after) = retain_lines(
            &self.config.redacted_graph_feed_path,
            |line| match serde_json::from_str::<RedactedGraphEvent>(line) {
                Ok(entry) => entry.created_at_ms >= cutoff_timestamp_ms,
                Err(_) => true,
            },
        )?;

        Ok(RetentionReport {
            full_before,
            full_after,
            redacted_before,
            redacted_after,
            cutoff_timestamp_ms,
        })
    }

    fn encrypt_event(&self, event: &FullEventRecord) -> Result<String, ObservabilityError> {
        let plaintext = serde_json::to_vec(event)?;
        let ciphertext = xor_cipher(&plaintext, &self.config.encryption_key)?;
        Ok(hex_encode(&ciphertext))
    }

    fn decrypt_line(
        &self,
        line: EncryptedFullLogLine,
    ) -> Result<FullEventRecord, ObservabilityError> {
        let ciphertext = hex_decode(&line.ciphertext_hex)?;
        let plaintext = xor_cipher(&ciphertext, &self.config.encryption_key)?;
        let event: FullEventRecord = serde_json::from_slice(&plaintext)?;
        Ok(event)
    }
}

fn create_parent_dir(path: &Path) -> Result<(), ObservabilityError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn append_ndjson_line<T: Serialize>(path: &Path, value: &T) -> Result<(), ObservabilityError> {
    let mut file = OpenOptions::new().append(true).create(true).open(path)?;
    serde_json::to_writer(&mut file, value)?;
    file.write_all(b"\n")?;
    file.flush()?;
    Ok(())
}

fn read_non_empty_lines(path: &Path) -> Result<Vec<String>, ObservabilityError> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut lines = Vec::new();

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            lines.push(trimmed.to_string());
        }
    }

    Ok(lines)
}

fn retain_lines<F>(path: &Path, mut should_keep: F) -> Result<(usize, usize), ObservabilityError>
where
    F: FnMut(&str) -> bool,
{
    if !path.exists() {
        return Ok((0, 0));
    }

    let lines = read_non_empty_lines(path)?;
    let before = lines.len();
    let retained: Vec<String> = lines.into_iter().filter(|line| should_keep(line)).collect();
    let after = retained.len();

    let mut updated = retained.join("\n");
    if !updated.is_empty() {
        updated.push('\n');
    }
    fs::write(path, updated)?;

    Ok((before, after))
}

fn xor_cipher(payload: &[u8], key: &[u8]) -> Result<Vec<u8>, ObservabilityError> {
    if key.is_empty() {
        return Err(ObservabilityError::InvalidEncryptionKey);
    }

    Ok(payload
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()])
        .collect())
}

fn next_event_id(now_ms: i64) -> String {
    let sequence = EVENT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("evt-{now_ms}-{sequence}")
}

fn current_unix_timestamp_ms() -> i64 {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch");
    i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
}

fn redact_graph_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut redacted = Map::new();
            for (key, value) in map {
                if should_redact_key(key) {
                    redacted.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    redacted.insert(key.clone(), redact_graph_value(value));
                }
            }
            Value::Object(redacted)
        }
        Value::Array(values) => Value::Array(values.iter().map(redact_graph_value).collect()),
        _ => value.clone(),
    }
}

fn should_redact_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    let sensitive_patterns = [
        "prompt",
        "secret",
        "password",
        "token",
        "api_key",
        "authorization",
        "signature",
        "ciphertext",
    ];
    sensitive_patterns
        .iter()
        .any(|pattern| key.contains(pattern))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(hex_char(byte >> 4));
        output.push(hex_char(byte & 0x0F));
    }
    output
}

fn hex_char(value: u8) -> char {
    match value {
        0..=9 => (b'0' + value) as char,
        10..=15 => (b'a' + (value - 10)) as char,
        _ => '0',
    }
}

fn hex_decode(hex: &str) -> Result<Vec<u8>, ObservabilityError> {
    let hex = hex.trim();
    if !hex.len().is_multiple_of(2) {
        return Err(ObservabilityError::CorruptCiphertext(
            "hex payload has odd length".to_string(),
        ));
    }

    let mut bytes = Vec::with_capacity(hex.len() / 2);
    let chars: Vec<char> = hex.chars().collect();

    for index in (0..chars.len()).step_by(2) {
        let high = hex_value(chars[index]).ok_or_else(|| {
            ObservabilityError::CorruptCiphertext("invalid high nibble".to_string())
        })?;
        let low = hex_value(chars[index + 1]).ok_or_else(|| {
            ObservabilityError::CorruptCiphertext("invalid low nibble".to_string())
        })?;
        bytes.push((high << 4) | low);
    }

    Ok(bytes)
}

fn hex_value(character: char) -> Option<u8> {
    match character {
        '0'..='9' => Some((character as u8) - b'0'),
        'a'..='f' => Some((character as u8) - b'a' + 10),
        'A'..='F' => Some((character as u8) - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_logger(test_name: &str) -> ObservabilityLogger {
        let mut log_dir = std::env::temp_dir();
        log_dir.push(format!(
            "metacanon-observability-{test_name}-{}",
            current_unix_timestamp_ms()
        ));

        let config = ObservabilityConfig::for_log_dir(log_dir, b"test-encryption-key".to_vec());
        ObservabilityLogger::new(config).expect("logger should initialize")
    }

    #[test]
    fn dual_tier_logging_writes_encrypted_full_and_redacted_graph() {
        let logger = create_test_logger("dual-tier");

        let secret_prompt = "super-secret-prompt";
        let event_id = logger
            .record_dual_tier_event(
                "provider_attempt",
                "trace-1",
                None,
                Some("openai"),
                json!({
                    "prompt": secret_prompt,
                    "provider": "openai",
                }),
                json!({
                    "prompt": secret_prompt,
                    "provider": "openai",
                }),
            )
            .expect("event write should succeed");

        let full_raw = fs::read_to_string(&logger.config().full_events_log_path)
            .expect("full log should exist");
        assert!(
            !full_raw.contains(secret_prompt),
            "full encrypted log should not expose plaintext prompt"
        );

        let full_events = logger
            .read_full_events()
            .expect("full events should decode");
        assert_eq!(full_events.len(), 1);
        assert_eq!(full_events[0].event_id, event_id);
        assert_eq!(full_events[0].payload["prompt"], secret_prompt);

        let redacted_events = logger
            .read_redacted_events()
            .expect("redacted events should parse");
        assert_eq!(redacted_events.len(), 1);
        assert_eq!(
            redacted_events[0].payload["prompt"],
            Value::String("[REDACTED]".to_string())
        );
    }

    #[test]
    fn retention_prunes_entries_older_than_ninety_days() {
        let logger = create_test_logger("retention");
        let now_ms = current_unix_timestamp_ms();
        let old_ms = now_ms - (91 * MILLIS_PER_DAY);
        let fresh_ms = now_ms - (2 * MILLIS_PER_DAY);

        logger
            .record_dual_tier_event_at(
                "provider_attempt",
                "trace-old",
                None,
                Some("qwen_local"),
                json!({ "prompt": "legacy" }),
                json!({ "prompt": "legacy" }),
                old_ms,
            )
            .expect("old event should write");
        logger
            .record_dual_tier_event_at(
                "provider_attempt",
                "trace-fresh",
                None,
                Some("ollama"),
                json!({ "prompt": "fresh" }),
                json!({ "prompt": "fresh" }),
                fresh_ms,
            )
            .expect("fresh event should write");

        let report = logger.run_retention(now_ms).expect("retention should run");
        assert_eq!(report.full_before, 2);
        assert_eq!(report.full_after, 1);
        assert_eq!(report.redacted_before, 2);
        assert_eq!(report.redacted_after, 1);

        let full_events = logger
            .read_full_events()
            .expect("remaining full events should decode");
        assert_eq!(full_events.len(), 1);
        assert_eq!(full_events[0].trace_id, "trace-fresh");

        let redacted_events = logger
            .read_redacted_events()
            .expect("remaining redacted events should parse");
        assert_eq!(redacted_events.len(), 1);
        assert_eq!(redacted_events[0].trace_id, "trace-fresh");
    }

    #[test]
    fn fallback_and_outcome_helpers_write_dual_tier_records() {
        let logger = create_test_logger("helper-events");

        logger
            .record_fallback_transition("trace-helpers", "openai", "qwen_local", "timeout", 1)
            .expect("fallback event should write");
        logger
            .record_deliberation_success("trace-helpers", "openai", "qwen_local", 2)
            .expect("success event should write");
        logger
            .record_deliberation_failure(
                "trace-helpers",
                "openai",
                &[
                    "openai: timeout".to_string(),
                    "qwen_local: unavailable".to_string(),
                ],
            )
            .expect("failure event should write");

        let redacted_events = logger
            .read_redacted_events()
            .expect("redacted events should parse");
        assert_eq!(redacted_events.len(), 3);
        assert_eq!(redacted_events[0].event_type, "fallback_transition");
        assert_eq!(redacted_events[1].event_type, "deliberation_outcome");
        assert_eq!(redacted_events[2].event_type, "deliberation_outcome");
    }
}
