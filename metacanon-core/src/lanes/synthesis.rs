use crate::lanes::RuntimeLane;
use crate::torus_runtime::LaneKind;

#[derive(Debug, Clone, Copy, Default)]
pub struct SynthesisLane;

impl RuntimeLane for SynthesisLane {
    fn kind(&self) -> LaneKind {
        LaneKind::Synthesis
    }

    fn build_prompt(&self, user_request: &str) -> String {
        format!(
            "Synthesis lane reasoning. You are the constructive reasoning lane inside a sovereign torus round. Produce the best user-facing draft response for the request below. Keep it concrete, useful, and concise. Include:\n1. Direct answer or plan.\n2. Key assumptions if any.\n3. Immediate next steps when relevant.\nDo not discuss internal lane mechanics.\n\nUser request:\n{}",
            user_request.trim()
        )
    }
}
