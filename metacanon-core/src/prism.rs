use crate::torus_runtime::{LaneKind, TorusRound, TorusRuntime};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrismMessage {
    pub channel: String,
    pub content: String,
    pub force_deliberation: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrismRoute {
    Direct,
    Deliberate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrismDecision {
    pub route: PrismRoute,
    pub summary: String,
    pub required_lanes: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct PrismRuntime {
    torus: TorusRuntime,
}

impl PrismRuntime {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn inspect_message(&self, message: &PrismMessage) -> PrismDecision {
        let requires_deliberation = message.force_deliberation
            || message.content.lines().count() > 1
            || message.content.len() > 160;

        if requires_deliberation {
            PrismDecision {
                route: PrismRoute::Deliberate,
                summary: "Open a Torus round across Watcher, Synthesis, and Auditor.".to_string(),
                required_lanes: LaneKind::required_lanes()
                    .into_iter()
                    .map(|lane| lane.as_str().to_string())
                    .collect(),
            }
        } else {
            PrismDecision {
                route: PrismRoute::Direct,
                summary: "Respond directly through Prism without opening a Torus round.".to_string(),
                required_lanes: Vec::new(),
            }
        }
    }

    pub fn begin_round(&mut self, message: &PrismMessage) -> TorusRound {
        self.torus.open_round("prism", &message.content)
    }

    pub fn torus(&self) -> &TorusRuntime {
        &self.torus
    }

    pub fn torus_mut(&mut self) -> &mut TorusRuntime {
        &mut self.torus
    }
}

#[cfg(test)]
mod tests {
    use super::{PrismMessage, PrismRoute, PrismRuntime};

    #[test]
    fn long_messages_open_deliberation_rounds() {
        let runtime = PrismRuntime::new();
        let decision = runtime.inspect_message(&PrismMessage {
            channel: "telegram".to_string(),
            content: "line one\nline two".to_string(),
            force_deliberation: false,
        });

        assert_eq!(decision.route, PrismRoute::Deliberate);
        assert_eq!(decision.required_lanes.len(), 3);
    }
}
