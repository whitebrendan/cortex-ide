//! File Tree Delta Events — Structured change events for incremental UI updates
//!
//! Instead of forcing a full tree refresh on every file system change,
//! delta events tell the frontend exactly which paths were added, removed,
//! or modified so it can surgically update only the affected directories.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeDelta {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub modified: Vec<String>,
    #[serde(rename = "affectedDirs")]
    pub affected_dirs: Vec<String>,
    #[serde(rename = "watchId")]
    pub watch_id: String,
}
