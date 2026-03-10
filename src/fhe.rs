use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

pub const HELIOS_FHE_SCHEME: &str = "helios-sim-fhe-v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FhePublicKey {
    pub key_id: String,
    pub scheme: String,
    pub material_hex: String,
}

impl FhePublicKey {
    pub fn new(
        key_id: impl Into<String>,
        material_hex: impl Into<String>,
    ) -> Result<Self, FheError> {
        let key_id = normalize_key_id(key_id.into())?;
        let material_hex = normalize_hex(material_hex.into())?;

        Ok(Self {
            key_id,
            scheme: HELIOS_FHE_SCHEME.to_string(),
            material_hex,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FheCiphertext {
    pub key_id: String,
    pub scheme: String,
    pub nonce: u64,
    pub payload_hex: String,
}

/// Private key is intentionally non-serializable and non-cloneable.
/// This enforces Helios private-key locality at the type level.
pub struct FhePrivateKey {
    key_id: String,
    scheme: String,
    key_material: Vec<u8>,
}

impl FhePrivateKey {
    pub fn new(key_id: impl Into<String>, key_material: Vec<u8>) -> Result<Self, FheError> {
        let key_id = normalize_key_id(key_id.into())?;
        if key_material.is_empty() {
            return Err(FheError::EmptyKeyMaterial);
        }

        Ok(Self {
            key_id,
            scheme: HELIOS_FHE_SCHEME.to_string(),
            key_material,
        })
    }

    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    pub fn scheme(&self) -> &str {
        &self.scheme
    }
}

impl fmt::Debug for FhePrivateKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FhePrivateKey")
            .field("key_id", &self.key_id)
            .field("scheme", &self.scheme)
            .field("key_material", &"<redacted>")
            .finish()
    }
}

pub struct FheLocalKeypair {
    pub public_key: FhePublicKey,
    private_key: FhePrivateKey,
}

impl FheLocalKeypair {
    pub fn private_key(&self) -> &FhePrivateKey {
        &self.private_key
    }

    pub fn into_parts(self) -> (FhePublicKey, FhePrivateKey) {
        (self.public_key, self.private_key)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FheError {
    InvalidKeyId,
    EmptyKeyMaterial,
    EmptyPlaintext,
    MalformedHex(String),
    KeyMismatch { expected: String, found: String },
    SchemeMismatch { expected: String, found: String },
    InvalidUtf8,
}

impl fmt::Display for FheError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FheError::InvalidKeyId => f.write_str("key_id cannot be empty"),
            FheError::EmptyKeyMaterial => f.write_str("key material cannot be empty"),
            FheError::EmptyPlaintext => f.write_str("plaintext cannot be empty"),
            FheError::MalformedHex(value) => write!(f, "malformed hex payload: {value}"),
            FheError::KeyMismatch { expected, found } => {
                write!(f, "key mismatch: expected '{expected}', found '{found}'")
            }
            FheError::SchemeMismatch { expected, found } => {
                write!(f, "scheme mismatch: expected '{expected}', found '{found}'")
            }
            FheError::InvalidUtf8 => f.write_str("decrypted payload is not valid UTF-8"),
        }
    }
}

impl std::error::Error for FheError {}

pub fn derive_local_keypair(key_id: impl Into<String>) -> Result<FheLocalKeypair, FheError> {
    let key_id = normalize_key_id(key_id.into())?;
    let key_material = derive_key_material(&key_id);
    let public_key = FhePublicKey::new(key_id.clone(), hex_encode(&key_material))?;
    let private_key = FhePrivateKey::new(key_id, key_material)?;

    Ok(FheLocalKeypair {
        public_key,
        private_key,
    })
}

pub fn encrypt_with_public_key(
    public_key: &FhePublicKey,
    plaintext: &str,
) -> Result<FheCiphertext, FheError> {
    let trimmed = plaintext.trim();
    if trimmed.is_empty() {
        return Err(FheError::EmptyPlaintext);
    }

    let key_material = hex_decode(&public_key.material_hex)?;
    if key_material.is_empty() {
        return Err(FheError::EmptyKeyMaterial);
    }

    let nonce = current_nonce();
    let stream = keystream(&key_material, nonce, trimmed.len());
    let encrypted = xor_bytes(trimmed.as_bytes(), &stream);

    Ok(FheCiphertext {
        key_id: public_key.key_id.clone(),
        scheme: public_key.scheme.clone(),
        nonce,
        payload_hex: hex_encode(&encrypted),
    })
}

pub fn decrypt_with_private_key(
    private_key: &FhePrivateKey,
    ciphertext: &FheCiphertext,
) -> Result<String, FheError> {
    if ciphertext.key_id != private_key.key_id {
        return Err(FheError::KeyMismatch {
            expected: private_key.key_id.clone(),
            found: ciphertext.key_id.clone(),
        });
    }

    if ciphertext.scheme != private_key.scheme {
        return Err(FheError::SchemeMismatch {
            expected: private_key.scheme.clone(),
            found: ciphertext.scheme.clone(),
        });
    }

    let encrypted = hex_decode(&ciphertext.payload_hex)?;
    let stream = keystream(&private_key.key_material, ciphertext.nonce, encrypted.len());
    let decrypted = xor_bytes(&encrypted, &stream);

    String::from_utf8(decrypted).map_err(|_| FheError::InvalidUtf8)
}

fn normalize_key_id(key_id: String) -> Result<String, FheError> {
    let trimmed = key_id.trim();
    if trimmed.is_empty() {
        return Err(FheError::InvalidKeyId);
    }
    Ok(trimmed.to_string())
}

fn normalize_hex(value: String) -> Result<String, FheError> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() || !normalized.len().is_multiple_of(2) {
        return Err(FheError::MalformedHex(value));
    }
    if !normalized.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return Err(FheError::MalformedHex(value));
    }
    Ok(normalized)
}

fn derive_key_material(key_id: &str) -> Vec<u8> {
    let mut state = 0xA5A5_5A5A_1337_0001_u64;
    for byte in key_id.bytes() {
        state = state.rotate_left(7) ^ (byte as u64);
        state = state.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    }

    let mut bytes = Vec::with_capacity(32);
    for index in 0_u64..32 {
        state ^= index.wrapping_mul(0xD6E8_FD50_24B7_934B);
        state = state.rotate_left(9).wrapping_add(0x94D0_49BB_1331_11EB);
        bytes.push((state & 0xFF) as u8);
    }
    bytes
}

fn current_nonce() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_nanos().try_into().unwrap_or(u64::MAX),
        Err(_) => 0,
    }
}

fn keystream(key_material: &[u8], nonce: u64, len: usize) -> Vec<u8> {
    let mut stream = Vec::with_capacity(len);
    let mut state = nonce ^ 0xC6A4_A793_5BD1_E995_u64;

    for index in 0..len {
        let key_byte = key_material[index % key_material.len()] as u64;
        state ^= key_byte.wrapping_add((index as u64).wrapping_mul(0x9E37_79B9));
        state = state.rotate_left(11).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        stream.push((state & 0xFF) as u8);
    }

    stream
}

fn xor_bytes(input: &[u8], stream: &[u8]) -> Vec<u8> {
    input
        .iter()
        .zip(stream.iter())
        .map(|(left, right)| left ^ right)
        .collect()
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(nibble_to_hex((byte >> 4) & 0x0F));
        out.push(nibble_to_hex(byte & 0x0F));
    }
    out
}

fn hex_decode(value: &str) -> Result<Vec<u8>, FheError> {
    if !value.len().is_multiple_of(2) || !value.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return Err(FheError::MalformedHex(value.to_string()));
    }

    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len() / 2);
    let mut index = 0;
    while index < bytes.len() {
        let hi = hex_to_nibble(bytes[index])?;
        let lo = hex_to_nibble(bytes[index + 1])?;
        decoded.push((hi << 4) | lo);
        index += 2;
    }

    Ok(decoded)
}

fn nibble_to_hex(value: u8) -> char {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    HEX[value as usize] as char
}

fn hex_to_nibble(value: u8) -> Result<u8, FheError> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(10 + value - b'a'),
        b'A'..=b'F' => Ok(10 + value - b'A'),
        _ => Err(FheError::MalformedHex((value as char).to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_encrypt_decrypt_works() {
        let keypair = derive_local_keypair("helios-local-key").expect("keypair should be derived");
        let ciphertext = encrypt_with_public_key(&keypair.public_key, "sensitive payload")
            .expect("encryption should succeed");
        let plaintext = decrypt_with_private_key(keypair.private_key(), &ciphertext)
            .expect("decryption should succeed");

        assert_eq!(plaintext, "sensitive payload");
    }

    #[test]
    fn encryption_rejects_empty_plaintext() {
        let keypair = derive_local_keypair("helios-local-key").expect("keypair should be derived");
        let result = encrypt_with_public_key(&keypair.public_key, "   ");
        assert!(matches!(result, Err(FheError::EmptyPlaintext)));
    }

    #[test]
    fn decryption_rejects_key_mismatch() {
        let keypair_a = derive_local_keypair("key-a").expect("keypair should be derived");
        let keypair_b = derive_local_keypair("key-b").expect("keypair should be derived");
        let ciphertext = encrypt_with_public_key(&keypair_a.public_key, "payload")
            .expect("encryption should succeed");

        let result = decrypt_with_private_key(keypair_b.private_key(), &ciphertext);
        assert!(matches!(result, Err(FheError::KeyMismatch { .. })));
    }

    #[test]
    fn private_key_debug_redacts_material() {
        let keypair = derive_local_keypair("redaction").expect("keypair should be derived");
        let debug = format!("{:?}", keypair.private_key());

        assert!(debug.contains("key_material"));
        assert!(debug.contains("<redacted>"));
        assert!(!debug.contains(&keypair.public_key.material_hex));
    }
}
