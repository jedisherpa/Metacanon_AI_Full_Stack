pub mod auditor;
pub mod synthesis;
pub mod watcher;

use crate::torus_runtime::LaneKind;

pub trait RuntimeLane {
    fn kind(&self) -> LaneKind;
    fn build_prompt(&self, user_request: &str) -> String;
}
