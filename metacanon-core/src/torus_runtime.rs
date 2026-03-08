use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaneKind {
    Watcher,
    Synthesis,
    Auditor,
}

impl LaneKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            LaneKind::Watcher => "watcher",
            LaneKind::Synthesis => "synthesis",
            LaneKind::Auditor => "auditor",
        }
    }

    pub const fn thread_name(self) -> &'static str {
        match self {
            LaneKind::Watcher => "lane-watcher",
            LaneKind::Synthesis => "lane-synthesis",
            LaneKind::Auditor => "lane-auditor",
        }
    }

    pub const fn required_lanes() -> [LaneKind; 3] {
        [LaneKind::Watcher, LaneKind::Synthesis, LaneKind::Auditor]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoundState {
    Open,
    Complete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaneRequest {
    pub round_id: String,
    pub lane: LaneKind,
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaneResponse {
    pub round_id: String,
    pub lane: LaneKind,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TorusRound {
    pub round_id: String,
    pub origin: String,
    pub prompt: String,
    pub created_at_ms: u128,
    pub state: RoundState,
    pub lane_requests: Vec<LaneRequest>,
    pub lane_responses: BTreeMap<LaneKind, String>,
}

#[derive(Debug, Clone, Default)]
pub struct TorusRuntime {
    rounds: BTreeMap<String, TorusRound>,
    next_sequence: u64,
}

impl TorusRuntime {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open_round(&mut self, origin: &str, prompt: &str) -> TorusRound {
        self.next_sequence = self.next_sequence.saturating_add(1);
        let round_id = format!("round-{}-{}", now_ms(), self.next_sequence);
        let lane_requests = LaneKind::required_lanes()
            .into_iter()
            .map(|lane| LaneRequest {
                round_id: round_id.clone(),
                lane,
                prompt: prompt.to_string(),
            })
            .collect::<Vec<_>>();

        let round = TorusRound {
            round_id: round_id.clone(),
            origin: origin.trim().to_string(),
            prompt: prompt.trim().to_string(),
            created_at_ms: now_ms(),
            state: RoundState::Open,
            lane_requests,
            lane_responses: BTreeMap::new(),
        };

        self.rounds.insert(round_id, round.clone());
        round
    }

    pub fn record_lane_response(&mut self, response: LaneResponse) -> Option<TorusRound> {
        let round = self.rounds.get_mut(&response.round_id)?;
        round
            .lane_responses
            .insert(response.lane, response.content.trim().to_string());

        let is_complete = LaneKind::required_lanes()
            .into_iter()
            .all(|lane| round.lane_responses.contains_key(&lane));
        if is_complete {
            round.state = RoundState::Complete;
        }
        Some(round.clone())
    }

    pub fn round(&self, round_id: &str) -> Option<&TorusRound> {
        self.rounds.get(round_id)
    }

    pub fn latest_round(&self) -> Option<&TorusRound> {
        self.rounds.values().last()
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{LaneKind, LaneResponse, RoundState, TorusRuntime};

    #[test]
    fn round_transitions_to_complete_after_all_lane_responses() {
        let mut runtime = TorusRuntime::new();
        let round = runtime.open_round("prism", "test prompt");

        for lane in LaneKind::required_lanes() {
            runtime.record_lane_response(LaneResponse {
                round_id: round.round_id.clone(),
                lane,
                content: format!("{} ok", lane.as_str()),
            });
        }

        let completed = runtime.round(&round.round_id).expect("round should exist");
        assert_eq!(completed.state, RoundState::Complete);
        assert_eq!(completed.lane_responses.len(), 3);
    }
}
