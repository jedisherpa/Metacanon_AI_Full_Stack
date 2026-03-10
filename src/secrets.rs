use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::fmt;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const SECRET_FILE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SecretBackendMode {
    #[default]
    KeychainOnly,
    EncryptedFileOnly,
    DualWrite,
}

#[derive(Debug)]
pub enum SecretError {
    InvalidSecretKey,
    InvalidEncryptionKey,
    MissingBackend(&'static str),
    Io(std::io::Error),
    Serde(serde_json::Error),
    CorruptEncryptedPayload(String),
    Keychain(String),
    PartialFailure {
        operation: &'static str,
        keychain_error: Option<String>,
        file_error: Option<String>,
    },
}

impl fmt::Display for SecretError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SecretError::InvalidSecretKey => f.write_str("secret key cannot be empty"),
            SecretError::InvalidEncryptionKey => f.write_str("encrypted file key cannot be empty"),
            SecretError::MissingBackend(backend) => {
                write!(f, "required backend is not configured: {backend}")
            }
            SecretError::Io(error) => write!(f, "secret io error: {error}"),
            SecretError::Serde(error) => write!(f, "secret serialization error: {error}"),
            SecretError::CorruptEncryptedPayload(message) => {
                write!(f, "corrupt encrypted secret payload: {message}")
            }
            SecretError::Keychain(message) => write!(f, "keychain error: {message}"),
            SecretError::PartialFailure {
                operation,
                keychain_error,
                file_error,
            } => {
                write!(
                    f,
                    "secret {operation} partially failed (keychain: {}, encrypted_file: {})",
                    keychain_error.clone().unwrap_or_else(|| "ok".to_string()),
                    file_error.clone().unwrap_or_else(|| "ok".to_string())
                )
            }
        }
    }
}

impl Error for SecretError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            SecretError::Io(error) => Some(error),
            SecretError::Serde(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for SecretError {
    fn from(error: std::io::Error) -> Self {
        SecretError::Io(error)
    }
}

impl From<serde_json::Error> for SecretError {
    fn from(error: serde_json::Error) -> Self {
        SecretError::Serde(error)
    }
}

pub trait KeychainBackend: Send + Sync {
    fn set_secret(&self, key: &str, value: &str) -> Result<(), SecretError>;
    fn get_secret(&self, key: &str) -> Result<Option<String>, SecretError>;
    fn delete_secret(&self, key: &str) -> Result<(), SecretError>;
}

#[derive(Debug, Default)]
pub struct InMemoryKeychain {
    secrets: Mutex<HashMap<String, String>>,
}

impl InMemoryKeychain {
    pub fn new() -> Self {
        Self::default()
    }
}

impl KeychainBackend for InMemoryKeychain {
    fn set_secret(&self, key: &str, value: &str) -> Result<(), SecretError> {
        let mut secrets = self
            .secrets
            .lock()
            .map_err(|_| SecretError::Keychain("in-memory keychain mutex poisoned".to_string()))?;
        secrets.insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn get_secret(&self, key: &str) -> Result<Option<String>, SecretError> {
        let secrets = self
            .secrets
            .lock()
            .map_err(|_| SecretError::Keychain("in-memory keychain mutex poisoned".to_string()))?;
        Ok(secrets.get(key).cloned())
    }

    fn delete_secret(&self, key: &str) -> Result<(), SecretError> {
        let mut secrets = self
            .secrets
            .lock()
            .map_err(|_| SecretError::Keychain("in-memory keychain mutex poisoned".to_string()))?;
        secrets.remove(key);
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncryptedFileSecretStore {
    pub path: PathBuf,
    pub encryption_key: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SecretFileEnvelope {
    schema_version: u32,
    ciphertext_hex: String,
}

impl EncryptedFileSecretStore {
    pub fn new(path: impl Into<PathBuf>, encryption_key: Vec<u8>) -> Result<Self, SecretError> {
        if encryption_key.is_empty() {
            return Err(SecretError::InvalidEncryptionKey);
        }

        let path = path.into();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        Ok(Self {
            path,
            encryption_key,
        })
    }

    pub fn set_secret(&self, key: &str, value: &str) -> Result<(), SecretError> {
        let mut entries = self.read_entries()?;
        entries.insert(key.to_string(), value.to_string());
        self.write_entries(&entries)
    }

    pub fn get_secret(&self, key: &str) -> Result<Option<String>, SecretError> {
        let entries = self.read_entries()?;
        Ok(entries.get(key).cloned())
    }

    pub fn delete_secret(&self, key: &str) -> Result<(), SecretError> {
        let mut entries = self.read_entries()?;
        entries.remove(key);
        self.write_entries(&entries)
    }

    fn read_entries(&self) -> Result<BTreeMap<String, String>, SecretError> {
        if !self.path.exists() {
            return Ok(BTreeMap::new());
        }

        let envelope_text = fs::read_to_string(&self.path)?;
        if envelope_text.trim().is_empty() {
            return Ok(BTreeMap::new());
        }

        let envelope: SecretFileEnvelope = serde_json::from_str(&envelope_text)?;
        let ciphertext = hex_decode(&envelope.ciphertext_hex)?;
        let plaintext = xor_cipher(&ciphertext, &self.encryption_key)?;
        let entries = serde_json::from_slice(&plaintext)?;
        Ok(entries)
    }

    fn write_entries(&self, entries: &BTreeMap<String, String>) -> Result<(), SecretError> {
        let plaintext = serde_json::to_vec(entries)?;
        let ciphertext = xor_cipher(&plaintext, &self.encryption_key)?;
        let envelope = SecretFileEnvelope {
            schema_version: SECRET_FILE_SCHEMA_VERSION,
            ciphertext_hex: hex_encode(&ciphertext),
        };
        let serialized = serde_json::to_string(&envelope)?;
        fs::write(&self.path, serialized)?;
        Ok(())
    }
}

pub struct SecretsManager {
    mode: SecretBackendMode,
    keychain: Option<Arc<dyn KeychainBackend>>,
    encrypted_file: Option<EncryptedFileSecretStore>,
}

impl SecretsManager {
    pub fn new(
        mode: SecretBackendMode,
        keychain: Option<Arc<dyn KeychainBackend>>,
        encrypted_file: Option<EncryptedFileSecretStore>,
    ) -> Result<Self, SecretError> {
        match mode {
            SecretBackendMode::KeychainOnly if keychain.is_none() => {
                return Err(SecretError::MissingBackend("keychain"));
            }
            SecretBackendMode::EncryptedFileOnly if encrypted_file.is_none() => {
                return Err(SecretError::MissingBackend("encrypted_file"));
            }
            SecretBackendMode::DualWrite if keychain.is_none() || encrypted_file.is_none() => {
                return Err(SecretError::MissingBackend("keychain + encrypted_file"));
            }
            _ => {}
        }

        Ok(Self {
            mode,
            keychain,
            encrypted_file,
        })
    }

    pub fn keychain_only(keychain: Arc<dyn KeychainBackend>) -> Self {
        Self {
            mode: SecretBackendMode::KeychainOnly,
            keychain: Some(keychain),
            encrypted_file: None,
        }
    }

    pub fn encrypted_file_only(encrypted_file: EncryptedFileSecretStore) -> Self {
        Self {
            mode: SecretBackendMode::EncryptedFileOnly,
            keychain: None,
            encrypted_file: Some(encrypted_file),
        }
    }

    pub fn dual_write(
        keychain: Arc<dyn KeychainBackend>,
        encrypted_file: EncryptedFileSecretStore,
    ) -> Self {
        Self {
            mode: SecretBackendMode::DualWrite,
            keychain: Some(keychain),
            encrypted_file: Some(encrypted_file),
        }
    }

    pub fn mode(&self) -> SecretBackendMode {
        self.mode
    }

    pub fn set_secret(&self, key: &str, value: &str) -> Result<(), SecretError> {
        let key = validate_secret_key(key)?;

        match self.mode {
            SecretBackendMode::KeychainOnly => {
                let keychain = self
                    .keychain
                    .as_ref()
                    .ok_or(SecretError::MissingBackend("keychain"))?;
                keychain.set_secret(key, value)
            }
            SecretBackendMode::EncryptedFileOnly => {
                let encrypted_file = self
                    .encrypted_file
                    .as_ref()
                    .ok_or(SecretError::MissingBackend("encrypted_file"))?;
                encrypted_file.set_secret(key, value)
            }
            SecretBackendMode::DualWrite => {
                let mut keychain_error = None;
                let mut file_error = None;

                if let Some(keychain) = &self.keychain {
                    if let Err(error) = keychain.set_secret(key, value) {
                        keychain_error = Some(error.to_string());
                    }
                } else {
                    keychain_error = Some("missing keychain backend".to_string());
                }

                if let Some(encrypted_file) = &self.encrypted_file {
                    if let Err(error) = encrypted_file.set_secret(key, value) {
                        file_error = Some(error.to_string());
                    }
                } else {
                    file_error = Some("missing encrypted file backend".to_string());
                }

                if keychain_error.is_none() && file_error.is_none() {
                    Ok(())
                } else {
                    Err(SecretError::PartialFailure {
                        operation: "set",
                        keychain_error,
                        file_error,
                    })
                }
            }
        }
    }

    pub fn get_secret(&self, key: &str) -> Result<Option<String>, SecretError> {
        let key = validate_secret_key(key)?;

        match self.mode {
            SecretBackendMode::KeychainOnly => {
                let keychain = self
                    .keychain
                    .as_ref()
                    .ok_or(SecretError::MissingBackend("keychain"))?;
                keychain.get_secret(key)
            }
            SecretBackendMode::EncryptedFileOnly => {
                let encrypted_file = self
                    .encrypted_file
                    .as_ref()
                    .ok_or(SecretError::MissingBackend("encrypted_file"))?;
                encrypted_file.get_secret(key)
            }
            SecretBackendMode::DualWrite => {
                let mut keychain_error = None;

                if let Some(keychain) = &self.keychain {
                    match keychain.get_secret(key) {
                        Ok(Some(value)) => return Ok(Some(value)),
                        Ok(None) => {}
                        Err(error) => keychain_error = Some(error.to_string()),
                    }
                } else {
                    keychain_error = Some("missing keychain backend".to_string());
                }

                let file_error = if let Some(encrypted_file) = &self.encrypted_file {
                    match encrypted_file.get_secret(key) {
                        Ok(value) => return Ok(value),
                        Err(error) => Some(error.to_string()),
                    }
                } else {
                    Some("missing encrypted file backend".to_string())
                };

                if keychain_error.is_some() || file_error.is_some() {
                    Err(SecretError::PartialFailure {
                        operation: "get",
                        keychain_error,
                        file_error,
                    })
                } else {
                    Ok(None)
                }
            }
        }
    }

    pub fn delete_secret(&self, key: &str) -> Result<(), SecretError> {
        let key = validate_secret_key(key)?;

        match self.mode {
            SecretBackendMode::KeychainOnly => {
                let keychain = self
                    .keychain
                    .as_ref()
                    .ok_or(SecretError::MissingBackend("keychain"))?;
                keychain.delete_secret(key)
            }
            SecretBackendMode::EncryptedFileOnly => {
                let encrypted_file = self
                    .encrypted_file
                    .as_ref()
                    .ok_or(SecretError::MissingBackend("encrypted_file"))?;
                encrypted_file.delete_secret(key)
            }
            SecretBackendMode::DualWrite => {
                let mut keychain_error = None;
                let mut file_error = None;

                if let Some(keychain) = &self.keychain {
                    if let Err(error) = keychain.delete_secret(key) {
                        keychain_error = Some(error.to_string());
                    }
                } else {
                    keychain_error = Some("missing keychain backend".to_string());
                }

                if let Some(encrypted_file) = &self.encrypted_file {
                    if let Err(error) = encrypted_file.delete_secret(key) {
                        file_error = Some(error.to_string());
                    }
                } else {
                    file_error = Some("missing encrypted file backend".to_string());
                }

                if keychain_error.is_none() && file_error.is_none() {
                    Ok(())
                } else {
                    Err(SecretError::PartialFailure {
                        operation: "delete",
                        keychain_error,
                        file_error,
                    })
                }
            }
        }
    }
}

fn validate_secret_key(key: &str) -> Result<&str, SecretError> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err(SecretError::InvalidSecretKey);
    }
    Ok(trimmed)
}

fn xor_cipher(payload: &[u8], key: &[u8]) -> Result<Vec<u8>, SecretError> {
    if key.is_empty() {
        return Err(SecretError::InvalidEncryptionKey);
    }

    Ok(payload
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()])
        .collect())
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

fn hex_decode(hex: &str) -> Result<Vec<u8>, SecretError> {
    let hex = hex.trim();
    if !hex.len().is_multiple_of(2) {
        return Err(SecretError::CorruptEncryptedPayload(
            "hex payload has odd length".to_string(),
        ));
    }

    let mut bytes = Vec::with_capacity(hex.len() / 2);
    let chars: Vec<char> = hex.chars().collect();
    for index in (0..chars.len()).step_by(2) {
        let high = hex_value(chars[index]).ok_or_else(|| {
            SecretError::CorruptEncryptedPayload("invalid high nibble".to_string())
        })?;
        let low = hex_value(chars[index + 1]).ok_or_else(|| {
            SecretError::CorruptEncryptedPayload("invalid low nibble".to_string())
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

    #[derive(Debug)]
    struct FailingKeychain;

    impl KeychainBackend for FailingKeychain {
        fn set_secret(&self, _key: &str, _value: &str) -> Result<(), SecretError> {
            Err(SecretError::Keychain("write failed".to_string()))
        }

        fn get_secret(&self, _key: &str) -> Result<Option<String>, SecretError> {
            Err(SecretError::Keychain("read failed".to_string()))
        }

        fn delete_secret(&self, _key: &str) -> Result<(), SecretError> {
            Err(SecretError::Keychain("delete failed".to_string()))
        }
    }

    fn temp_secret_path(test_name: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let mut path = std::env::temp_dir();
        path.push(format!("metacanon-secrets-{test_name}-{nonce}"));
        path.push("config.json.enc");
        path
    }

    #[test]
    fn keychain_only_mode_round_trip() {
        let keychain = Arc::new(InMemoryKeychain::new());
        let manager = SecretsManager::keychain_only(keychain.clone());

        manager
            .set_secret("openai_api_key", "sk-test")
            .expect("set should succeed");
        let loaded = manager
            .get_secret("openai_api_key")
            .expect("get should succeed");
        assert_eq!(loaded.as_deref(), Some("sk-test"));

        manager
            .delete_secret("openai_api_key")
            .expect("delete should succeed");
        let loaded = manager
            .get_secret("openai_api_key")
            .expect("get should succeed");
        assert_eq!(loaded, None);
    }

    #[test]
    fn encrypted_file_only_mode_persists_across_instances() {
        let path = temp_secret_path("file-only");
        let store = EncryptedFileSecretStore::new(path.clone(), b"file-secret-key".to_vec())
            .expect("store should initialize");
        let manager = SecretsManager::encrypted_file_only(store.clone());

        manager
            .set_secret("anthropic_api_key", "anth-test")
            .expect("set should succeed");

        let second_store = EncryptedFileSecretStore::new(path, b"file-secret-key".to_vec())
            .expect("second store should initialize");
        let second_manager = SecretsManager::encrypted_file_only(second_store);
        let loaded = second_manager
            .get_secret("anthropic_api_key")
            .expect("get should succeed");
        assert_eq!(loaded.as_deref(), Some("anth-test"));
    }

    #[test]
    fn dual_write_mode_writes_both_and_reads_file_fallback() {
        let path = temp_secret_path("dual-write");
        let keychain = Arc::new(InMemoryKeychain::new());
        let file_store = EncryptedFileSecretStore::new(path.clone(), b"dual-write-key".to_vec())
            .expect("file store should initialize");
        let manager = SecretsManager::dual_write(keychain.clone(), file_store.clone());

        manager
            .set_secret("moonshot_key", "moonshot-test")
            .expect("dual write should succeed");

        let keychain_value = keychain
            .get_secret("moonshot_key")
            .expect("keychain read should succeed");
        assert_eq!(keychain_value.as_deref(), Some("moonshot-test"));

        let file_value = file_store
            .get_secret("moonshot_key")
            .expect("file read should succeed");
        assert_eq!(file_value.as_deref(), Some("moonshot-test"));

        let empty_keychain = Arc::new(InMemoryKeychain::new());
        let fallback_manager = SecretsManager::dual_write(empty_keychain, file_store);
        let fallback_value = fallback_manager
            .get_secret("moonshot_key")
            .expect("fallback read should succeed");
        assert_eq!(fallback_value.as_deref(), Some("moonshot-test"));
    }

    #[test]
    fn dual_write_reports_partial_failure_if_keychain_fails() {
        let path = temp_secret_path("dual-partial");
        let keychain = Arc::new(FailingKeychain);
        let file_store = EncryptedFileSecretStore::new(path, b"dual-partial-key".to_vec())
            .expect("file store should initialize");
        let manager = SecretsManager::dual_write(keychain, file_store.clone());

        let error = manager
            .set_secret("grok_key", "grok-test")
            .expect_err("partial failure should be returned");

        match error {
            SecretError::PartialFailure {
                operation,
                keychain_error,
                file_error,
            } => {
                assert_eq!(operation, "set");
                assert!(keychain_error.is_some());
                assert!(file_error.is_none());
            }
            other => panic!("unexpected error variant: {other}"),
        }

        let file_value = file_store
            .get_secret("grok_key")
            .expect("file write should still succeed");
        assert_eq!(file_value.as_deref(), Some("grok-test"));
    }
}
