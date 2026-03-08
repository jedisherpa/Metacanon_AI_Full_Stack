use crate::lanes::RuntimeLane;
use crate::torus_runtime::LaneKind;

#[derive(Debug, Clone, Copy, Default)]
pub struct WatcherLane;

impl RuntimeLane for WatcherLane {
    fn kind(&self) -> LaneKind {
        LaneKind::Watcher
    }

    fn build_prompt(&self, user_request: &str) -> String {
        format!(
            "Watcher lane review. You are the constitutional and operational risk lane inside a sovereign torus round. Review the request below and return a concise structured assessment with these sections:\n1. Alignment: whether the request appears constitutionally and sovereignty aligned.\n2. Risks: concrete safety, privacy, compliance, or operational concerns.\n3. Guardrails: what constraints or checks must be preserved if Prism responds or acts.\n4. Decision: approve, approve_with_cautions, or escalate.\n\nUser request:\n{}",
            user_request.trim()
        )
    }
}
