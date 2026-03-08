use crate::lanes::RuntimeLane;
use crate::torus_runtime::LaneKind;

#[derive(Debug, Clone, Copy, Default)]
pub struct AuditorLane;

impl RuntimeLane for AuditorLane {
    fn kind(&self) -> LaneKind {
        LaneKind::Auditor
    }

    fn build_prompt(&self, user_request: &str) -> String {
        format!(
            "Auditor lane trace. You are the traceability and attestation lane inside a sovereign torus round. Review the request below and return a concise audit note with these sections:\n1. Record: what should be captured in the runtime ledger.\n2. Evidence: what sources, confirmations, or state should be verified.\n3. Follow-up: any audit or monitoring actions Prism should preserve after responding.\n\nUser request:\n{}",
            user_request.trim()
        )
    }
}
