use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::compute::{
    estimate_token_count, normalized_ascii_embedding, ComputeError, ComputeProvider, ComputeResult,
    GenerateRequest, GenerateResponse, ProviderHealth, ProviderKind, TokenUsage,
};
use crate::fhe::{
    decrypt_with_private_key, derive_local_keypair, encrypt_with_public_key, FheCiphertext,
    FheError, FhePrivateKey, FhePublicKey,
};

pub const MORPHEUS_PROVIDER_ID: &str = "morpheus";
pub const MORPHEUS_DEFAULT_MODEL: &str = "helios-morpheus-scaffold-v1";
pub const MORPHEUS_DEFAULT_ENDPOINT: &str = "https://morpheus.local/compute";
pub const MORPHEUS_DEFAULT_ROUTER_ID: &str = "helios-router-default";
pub const MORPHEUS_DEFAULT_KEY_ID: &str = "helios-local-key";

const VALIDATION_FINGERPRINT_KEY: &str = "helios_validation_fingerprint";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MorpheusConfig {
    pub router_id: String,
    pub endpoint: String,
    pub model: String,
    pub key_id: String,
    pub available: bool,
}

impl Default for MorpheusConfig {
    fn default() -> Self {
        Self {
            router_id: MORPHEUS_DEFAULT_ROUTER_ID.to_string(),
            endpoint: MORPHEUS_DEFAULT_ENDPOINT.to_string(),
            model: MORPHEUS_DEFAULT_MODEL.to_string(),
            key_id: MORPHEUS_DEFAULT_KEY_ID.to_string(),
            available: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MorpheusRemoteRequest {
    pub router_id: String,
    pub endpoint: String,
    pub encrypted_prompt: FheCiphertext,
    pub encrypted_system_prompt: Option<FheCiphertext>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MorpheusRemoteResponse {
    pub model: String,
    pub encrypted_output: FheCiphertext,
    pub finish_reason: Option<String>,
    pub latency_ms: u64,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ValidationTicket {
    prompt_fingerprint: u64,
}

/// Morpheus provider scaffolded for Helios:
/// validate locally, encrypt payload, dispatch ciphertext-only request,
/// decrypt locally, and return plaintext response.
#[derive(Debug)]
pub struct MorpheusProvider {
    config: MorpheusConfig,
    public_key: FhePublicKey,
    private_key: FhePrivateKey,
    dispatch_count: AtomicU64,
}

impl MorpheusProvider {
    pub fn new(
        config: MorpheusConfig,
        public_key: FhePublicKey,
        private_key: FhePrivateKey,
    ) -> ComputeResult<Self> {
        if public_key.key_id != private_key.key_id() {
            return Err(ComputeError::invalid_request(
                "morpheus key mismatch: public/private key IDs must match",
            ));
        }

        Ok(Self {
            config,
            public_key,
            private_key,
            dispatch_count: AtomicU64::new(0),
        })
    }

    pub fn from_local_keypair(config: MorpheusConfig) -> ComputeResult<Self> {
        let keypair = derive_local_keypair(config.key_id.clone())
            .map_err(|error| fhe_error("derive_local_keypair", error))?;
        let (public_key, private_key) = keypair.into_parts();

        Self::new(config, public_key, private_key)
    }

    pub fn config(&self) -> &MorpheusConfig {
        &self.config
    }

    pub fn mark_available(&mut self) {
        self.config.available = true;
    }

    pub fn mark_unavailable(&mut self) {
        self.config.available = false;
    }

    pub fn dispatch_count(&self) -> u64 {
        self.dispatch_count.load(Ordering::Relaxed)
    }

    fn ensure_available(&self, action: &str) -> ComputeResult<()> {
        if self.config.available {
            return Ok(());
        }

        Err(ComputeError::provider_unavailable(
            MORPHEUS_PROVIDER_ID,
            format!("morpheus runtime unavailable during {action}"),
        ))
    }

    fn validate_action(&self, req: &GenerateRequest) -> ComputeResult<ValidationTicket> {
        self.ensure_available("validate_action")?;

        let prompt = req.prompt.trim();
        if prompt.is_empty() {
            return Err(ComputeError::invalid_request(
                "prompt cannot be empty for morpheus generation",
            ));
        }

        Ok(ValidationTicket {
            prompt_fingerprint: stable_prompt_fingerprint(prompt),
        })
    }

    fn build_remote_request(
        &self,
        req: &GenerateRequest,
        ticket: ValidationTicket,
    ) -> ComputeResult<MorpheusRemoteRequest> {
        let encrypted_prompt = encrypt_with_public_key(&self.public_key, req.prompt.trim())
            .map_err(|error| fhe_error("encrypt_prompt", error))?;

        let encrypted_system_prompt = match req.system_prompt.as_deref() {
            Some(system_prompt) if !system_prompt.trim().is_empty() => Some(
                encrypt_with_public_key(&self.public_key, system_prompt.trim())
                    .map_err(|error| fhe_error("encrypt_system_prompt", error))?,
            ),
            _ => None,
        };

        let mut metadata = BTreeMap::new();
        metadata.insert(
            VALIDATION_FINGERPRINT_KEY.to_string(),
            format!("{:016x}", ticket.prompt_fingerprint),
        );
        metadata.insert("payload_format".to_string(), "fhe_ciphertext".to_string());
        metadata.insert("router_mode".to_string(), "helios_scaffold".to_string());

        Ok(MorpheusRemoteRequest {
            router_id: self.config.router_id.clone(),
            endpoint: self.config.endpoint.clone(),
            encrypted_prompt,
            encrypted_system_prompt,
            metadata,
        })
    }

    fn dispatch_remote_compute(
        &self,
        ticket: ValidationTicket,
        request: MorpheusRemoteRequest,
    ) -> ComputeResult<MorpheusRemoteResponse> {
        self.ensure_available("dispatch_remote_compute")?;

        let expected_fingerprint = format!("{:016x}", ticket.prompt_fingerprint);
        let observed_fingerprint = request
            .metadata
            .get(VALIDATION_FINGERPRINT_KEY)
            .map(String::as_str)
            .unwrap_or_default();
        if observed_fingerprint != expected_fingerprint {
            return Err(ComputeError::invalid_request(
                "dispatch blocked: request is missing validated Helios proof",
            ));
        }

        // Remote transport is ciphertext-only by contract.
        self.dispatch_count.fetch_add(1, Ordering::Relaxed);
        let mut metadata = BTreeMap::new();
        metadata.insert("remote_contract".to_string(), "ciphertext_only".to_string());
        metadata.insert("router_id".to_string(), request.router_id);

        Ok(MorpheusRemoteResponse {
            model: self.config.model.clone(),
            encrypted_output: request.encrypted_prompt,
            finish_reason: Some("stop".to_string()),
            latency_ms: 72,
            metadata,
        })
    }

    fn decrypt_remote_output(&self, response: &MorpheusRemoteResponse) -> ComputeResult<String> {
        decrypt_with_private_key(&self.private_key, &response.encrypted_output)
            .map_err(|error| fhe_error("decrypt_remote_output", error))
    }
}

impl Default for MorpheusProvider {
    fn default() -> Self {
        MorpheusProvider::from_local_keypair(MorpheusConfig::default())
            .expect("default morpheus provider config should be valid")
    }
}

impl ComputeProvider for MorpheusProvider {
    fn provider_id(&self) -> &'static str {
        MORPHEUS_PROVIDER_ID
    }

    fn kind(&self) -> ProviderKind {
        ProviderKind::Decentralized
    }

    fn health_check(&self) -> ComputeResult<ProviderHealth> {
        self.ensure_available("health_check")?;

        Ok(ProviderHealth::healthy(
            MORPHEUS_PROVIDER_ID,
            ProviderKind::Decentralized,
            Some(format!(
                "endpoint={}, router_id={}, key_id={}",
                self.config.endpoint,
                self.config.router_id,
                self.private_key.key_id()
            )),
        ))
    }

    fn get_embedding(&self, text: &str) -> ComputeResult<Vec<f64>> {
        self.ensure_available("get_embedding")?;

        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(ComputeError::invalid_request(
                "embedding text cannot be empty",
            ));
        }

        Ok(normalized_ascii_embedding(trimmed, 16, 0x6D_6F_72_70))
    }

    fn generate_response(&self, req: GenerateRequest) -> ComputeResult<GenerateResponse> {
        let ticket = self.validate_action(&req)?;
        let remote_request = self.build_remote_request(&req, ticket)?;
        let remote_response = self.dispatch_remote_compute(ticket, remote_request)?;
        let decrypted_prompt = self.decrypt_remote_output(&remote_response)?;

        let prompt_tokens = estimate_token_count(req.prompt.trim());
        let completion_tokens = estimate_token_count(&decrypted_prompt).max(1);
        let usage = TokenUsage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens.saturating_add(completion_tokens),
        };

        let mut metadata = BTreeMap::new();
        metadata.insert("helios_validation".to_string(), "passed".to_string());
        metadata.insert(
            "external_payload".to_string(),
            "fhe_ciphertext_only".to_string(),
        );
        metadata.insert("private_key_locality".to_string(), "local_only".to_string());
        metadata.insert("router_id".to_string(), self.config.router_id.clone());
        metadata.extend(remote_response.metadata.clone());

        Ok(GenerateResponse {
            provider_id: MORPHEUS_PROVIDER_ID.to_string(),
            model: remote_response.model,
            output_text: format!(
                "Morpheus (Helios scaffold) processed encrypted payload for: {}",
                decrypted_prompt
            ),
            finish_reason: remote_response.finish_reason,
            usage: Some(usage),
            metadata,
            latency_ms: remote_response.latency_ms,
        })
    }
}

fn fhe_error(action: &str, error: FheError) -> ComputeError {
    ComputeError::internal(
        MORPHEUS_PROVIDER_ID,
        format!("fhe error during {action}: {error}"),
    )
}

fn stable_prompt_fingerprint(prompt: &str) -> u64 {
    let mut state = 0x9E37_79B9_7F4A_7C15_u64;
    for (index, byte) in prompt.bytes().enumerate() {
        state ^= (byte as u64) << ((index % 8) * 8);
        state = state.rotate_left(9).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    }
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::ComputeErrorKind;

    #[test]
    fn default_health_check_reports_helios_contract_details() {
        let provider = MorpheusProvider::default();
        let health = provider.health_check().expect("health should pass");

        assert_eq!(health.provider_id, MORPHEUS_PROVIDER_ID);
        assert_eq!(health.kind, ProviderKind::Decentralized);
        assert!(health
            .detail
            .expect("detail should be present")
            .contains("key_id"));
    }

    #[test]
    fn empty_prompt_is_rejected_before_dispatch() {
        let provider = MorpheusProvider::default();
        let result = provider.generate_response(GenerateRequest::new("   "));

        assert!(result.is_err());
        let error = result.expect_err("empty prompt should fail");
        assert_eq!(error.kind, ComputeErrorKind::InvalidRequest);
        assert_eq!(provider.dispatch_count(), 0);
    }

    #[test]
    fn generation_uses_ciphertext_only_remote_contract() {
        let provider = MorpheusProvider::default();
        let response = provider
            .generate_response(GenerateRequest::new("route this"))
            .expect("generation should succeed");

        assert_eq!(response.provider_id, MORPHEUS_PROVIDER_ID);
        assert_eq!(
            response.metadata.get("external_payload"),
            Some(&"fhe_ciphertext_only".to_string())
        );
        assert_eq!(provider.dispatch_count(), 1);
    }

    #[test]
    fn unavailable_provider_blocks_generation() {
        let mut provider = MorpheusProvider::default();
        provider.mark_unavailable();

        let result = provider.generate_response(GenerateRequest::new("test"));
        assert!(result.is_err());
        let error = result.expect_err("generation should fail");
        assert_eq!(error.kind, ComputeErrorKind::ProviderUnavailable);
    }
}
