use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub const DEFAULT_SPHERE_ENGINE_URL: &str = "http://localhost:3101";
pub const DEFAULT_SPHERE_SERVICE_TOKEN: &str = "dev-sphere-bff-service-token";
const THREAD_NAMESPACE_PREFIX: &str = "metacanon-thread:";
const DID_KEY_MULTICODEC_PREFIX: [u8; 2] = [0xed, 0x01];
const SIGNER_ROLES: [&str; 5] = ["prism", "torus", "watcher", "synthesis", "auditor"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SphereClientConfig {
    pub base_url: String,
    pub service_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SphereRuntimeEvent {
    pub thread_id: String,
    pub author_agent_id: String,
    pub intent: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct RuntimeSignerRecord {
    did: String,
    secret_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
struct RuntimeSignerBundle {
    signers: BTreeMap<String, RuntimeSignerRecord>,
}

#[derive(Debug, Clone)]
struct RuntimeSigner {
    did: String,
    signing_key: SigningKey,
}

#[derive(Debug)]
pub enum SphereClientError {
    InvalidConfig(String),
    Signing(String),
    Storage(String),
    MissingSigner(String),
    Http(reqwest::Error),
    UnexpectedStatus(u16, String),
}

impl fmt::Display for SphereClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SphereClientError::InvalidConfig(message) => write!(f, "invalid sphere client config: {message}"),
            SphereClientError::Signing(message) => write!(f, "invalid sphere signer state: {message}"),
            SphereClientError::Storage(message) => write!(f, "sphere signer storage failed: {message}"),
            SphereClientError::MissingSigner(role) => write!(f, "no runtime signer is configured for role '{role}'"),
            SphereClientError::Http(error) => write!(f, "sphere client request failed: {error}"),
            SphereClientError::UnexpectedStatus(status, body) => {
                write!(f, "sphere client request failed with status {status}: {body}")
            }
        }
    }
}

impl std::error::Error for SphereClientError {}

#[derive(Debug, Clone)]
pub struct SphereClient {
    config: SphereClientConfig,
    http: reqwest::blocking::Client,
    signers: BTreeMap<String, RuntimeSigner>,
}

impl SphereClient {
    pub fn new(config: SphereClientConfig) -> Result<Self, SphereClientError> {
        if config.base_url.trim().is_empty() {
            return Err(SphereClientError::InvalidConfig(
                "base_url must not be empty".to_string(),
            ));
        }
        if config.service_token.trim().is_empty() {
            return Err(SphereClientError::InvalidConfig(
                "service_token must not be empty".to_string(),
            ));
        }

        let bundle = load_or_create_runtime_signer_bundle(default_runtime_signer_path())?;
        let signers = build_runtime_signers(&bundle)?;

        Ok(Self {
            config,
            http: reqwest::blocking::Client::new(),
            signers,
        })
    }

    pub fn from_env() -> Result<Self, SphereClientError> {
        let base_url = std::env::var("SPHERE_ENGINE_URL")
            .unwrap_or_else(|_| DEFAULT_SPHERE_ENGINE_URL.to_string());
        let service_token = std::env::var("SPHERE_BFF_SERVICE_TOKEN")
            .unwrap_or_else(|_| DEFAULT_SPHERE_SERVICE_TOKEN.to_string());
        Self::new(SphereClientConfig {
            base_url,
            service_token,
        })
    }

    pub fn signer_did(&self, role: &str) -> Option<String> {
        self.signers
            .get(&normalize_role(role))
            .map(|signer| signer.did.clone())
    }

    pub fn publish_runtime_event(&self, event: &SphereRuntimeEvent) -> Result<(), SphereClientError> {
        let role = normalize_role(&event.author_agent_id);
        let signer = self
            .signers
            .get(&role)
            .ok_or_else(|| SphereClientError::MissingSigner(role.clone()))?;
        let message_id = runtime_uuid();
        let trace_id = runtime_uuid();
        let payload = with_runtime_author_payload(&event.payload, &role);
        let client_envelope = client_envelope_base(
            &event.thread_id,
            &signer.did,
            &message_id,
            &trace_id,
            &event.intent,
        );
        let canonical_payload = canonicalize_json_value(&json!({
            "clientEnvelope": client_envelope.clone(),
            "payload": payload.clone(),
        }));
        let agent_signature = sign_compact_jws(&canonical_payload, &signer.signing_key)?;
        let url = format!(
            "{}/api/v1/sphere/messages",
            self.config.base_url.trim_end_matches('/')
        );
        let body = json!({
            "threadId": event.thread_id.clone(),
            "authorAgentId": signer.did.clone(),
            "messageId": message_id.clone(),
            "traceId": trace_id.clone(),
            "intent": event.intent.clone(),
            "attestation": [],
            "schemaVersion": "3.0",
            "protocolVersion": "3.0",
            "causationId": [],
            "agentSignature": agent_signature,
            "payload": payload,
        });

        let response = self
            .http
            .post(url)
            .header("Content-Type", "application/json")
            .header("x-sphere-service-token", &self.config.service_token)
            .json(&body)
            .send()
            .map_err(SphereClientError::Http)?;

        if response.status().is_success() {
            return Ok(());
        }

        let status = response.status().as_u16();
        let body = response.text().unwrap_or_default();
        Err(SphereClientError::UnexpectedStatus(status, body))
    }
}

pub fn runtime_thread_id(thread_name: &str) -> String {
    let normalized = thread_name.trim().to_ascii_lowercase();
    let mut hasher = Sha256::new();
    hasher.update(format!("{THREAD_NAMESPACE_PREFIX}{normalized}"));
    let hash = hasher.finalize();
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes).to_string()
}

fn runtime_uuid() -> String {
    Uuid::new_v4().to_string()
}

fn normalize_role(role: &str) -> String {
    role.trim().to_ascii_lowercase()
}

fn default_runtime_signer_path() -> PathBuf {
    if let Some(custom) = std::env::var_os("SPHERE_RUNTIME_SIGNER_PATH") {
        return PathBuf::from(custom);
    }

    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".metacanon_ai")
        .join("runtime_signers.json")
}

fn load_or_create_runtime_signer_bundle(
    path: PathBuf,
) -> Result<RuntimeSignerBundle, SphereClientError> {
    if path.is_file() {
        let raw = fs::read_to_string(&path)
            .map_err(|error| SphereClientError::Storage(error.to_string()))?;
        let mut bundle: RuntimeSignerBundle = serde_json::from_str(&raw)
            .map_err(|error| SphereClientError::Storage(error.to_string()))?;
        let mut changed = false;
        for role in SIGNER_ROLES {
            if !bundle.signers.contains_key(role) {
                bundle
                    .signers
                    .insert(role.to_string(), generate_runtime_signer_record()?);
                changed = true;
            }
        }
        if changed {
            save_runtime_signer_bundle(&path, &bundle)?;
        }
        return Ok(bundle);
    }

    let mut signers = BTreeMap::new();
    for role in SIGNER_ROLES {
        signers.insert(role.to_string(), generate_runtime_signer_record()?);
    }
    let bundle = RuntimeSignerBundle { signers };
    save_runtime_signer_bundle(&path, &bundle)?;
    Ok(bundle)
}

fn save_runtime_signer_bundle(
    path: &PathBuf,
    bundle: &RuntimeSignerBundle,
) -> Result<(), SphereClientError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| SphereClientError::Storage(error.to_string()))?;
    }
    let serialized = serde_json::to_string_pretty(bundle)
        .map_err(|error| SphereClientError::Storage(error.to_string()))?;
    fs::write(path, serialized).map_err(|error| SphereClientError::Storage(error.to_string()))?;
    Ok(())
}

fn build_runtime_signers(
    bundle: &RuntimeSignerBundle,
) -> Result<BTreeMap<String, RuntimeSigner>, SphereClientError> {
    let mut signers = BTreeMap::new();

    for (role, record) in &bundle.signers {
        let secret = URL_SAFE_NO_PAD
            .decode(record.secret_key.as_bytes())
            .map_err(|error| SphereClientError::Signing(error.to_string()))?;
        if secret.len() != 32 {
            return Err(SphereClientError::Signing(format!(
                "signer '{}' secret key must decode to 32 bytes",
                role
            )));
        }

        let mut secret_bytes = [0u8; 32];
        secret_bytes.copy_from_slice(&secret);
        let signing_key = SigningKey::from_bytes(&secret_bytes);
        let expected_did = did_key_from_signing_key(&signing_key);
        if record.did != expected_did {
            return Err(SphereClientError::Signing(format!(
                "signer '{}' did:key does not match its private key",
                role
            )));
        }

        signers.insert(
            normalize_role(role),
            RuntimeSigner {
                did: expected_did,
                signing_key,
            },
        );
    }

    Ok(signers)
}

fn generate_runtime_signer_record() -> Result<RuntimeSignerRecord, SphereClientError> {
    let signing_key = SigningKey::generate(&mut OsRng);
    Ok(RuntimeSignerRecord {
        did: did_key_from_signing_key(&signing_key),
        secret_key: URL_SAFE_NO_PAD.encode(signing_key.to_bytes()),
    })
}

fn did_key_from_signing_key(signing_key: &SigningKey) -> String {
    let mut multicodec = Vec::with_capacity(34);
    multicodec.extend_from_slice(&DID_KEY_MULTICODEC_PREFIX);
    multicodec.extend_from_slice(&signing_key.verifying_key().to_bytes());
    format!("did:key:z{}", bs58::encode(multicodec).into_string())
}

fn client_envelope_base(
    thread_id: &str,
    author_agent_id: &str,
    message_id: &str,
    trace_id: &str,
    intent: &str,
) -> Value {
    let mut envelope = Map::new();
    envelope.insert("messageId".to_string(), Value::String(message_id.to_string()));
    envelope.insert("threadId".to_string(), Value::String(thread_id.to_string()));
    envelope.insert(
        "authorAgentId".to_string(),
        Value::String(author_agent_id.to_string()),
    );
    envelope.insert("intent".to_string(), Value::String(intent.to_string()));
    envelope.insert(
        "protocolVersion".to_string(),
        Value::String("3.0".to_string()),
    );
    envelope.insert(
        "schemaVersion".to_string(),
        Value::String("3.0".to_string()),
    );
    envelope.insert("traceId".to_string(), Value::String(trace_id.to_string()));
    envelope.insert("causationId".to_string(), Value::Array(Vec::new()));
    envelope.insert("attestation".to_string(), Value::Array(Vec::new()));
    Value::Object(envelope)
}

fn with_runtime_author_payload(payload: &Value, role: &str) -> Value {
    match payload {
        Value::Object(existing) => {
            let mut payload = existing.clone();
            payload
                .entry("runtimeAuthor".to_string())
                .or_insert_with(|| Value::String(role.to_string()));
            Value::Object(payload)
        }
        other => {
            let mut payload = Map::new();
            payload.insert("runtimeAuthor".to_string(), Value::String(role.to_string()));
            payload.insert("value".to_string(), other.clone());
            Value::Object(payload)
        }
    }
}

fn canonicalize_json_value(value: &Value) -> String {
    serde_json::to_string(&sort_json_value(value.clone())).unwrap_or_else(|_| "null".to_string())
}

fn sort_json_value(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.into_iter().map(sort_json_value).collect()),
        Value::Object(map) => {
            let sorted = map
                .into_iter()
                .map(|(key, value)| (key, sort_json_value(value)))
                .collect::<BTreeMap<_, _>>();
            let mut normalized = Map::new();
            for (key, value) in sorted {
                normalized.insert(key, value);
            }
            Value::Object(normalized)
        }
        other => other,
    }
}

fn sign_compact_jws(
    canonical_payload: &str,
    signing_key: &SigningKey,
) -> Result<String, SphereClientError> {
    let header_segment = URL_SAFE_NO_PAD.encode(r#"{"alg":"EdDSA","typ":"JWT"}"#);
    let payload_segment = URL_SAFE_NO_PAD.encode(canonical_payload.as_bytes());
    let signing_input = format!("{header_segment}.{payload_segment}");
    let signature = signing_key.sign(signing_input.as_bytes());
    let signature_segment = URL_SAFE_NO_PAD.encode(signature.to_bytes());
    Ok(format!(
        "{header_segment}.{payload_segment}.{signature_segment}"
    ))
}
