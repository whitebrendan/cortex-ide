//! Debugger state management
//!
//! This module contains the global state for managing debug sessions.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{RwLock, mpsc};

use super::super::{DebugSession, DebugSessionEvent};

/// Global state for managing debug sessions
pub struct DebuggerState {
    /// Active debug sessions by ID
    pub(crate) sessions: RwLock<HashMap<String, Arc<RwLock<DebugSession>>>>,
    /// Event channel for broadcasting debug events
    pub(crate) event_tx: RwLock<Option<mpsc::UnboundedSender<DebugSessionEvent>>>,
}

impl DebuggerState {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            event_tx: RwLock::new(None),
        }
    }

    /// Stop all debug sessions synchronously (for cleanup on exit)
    pub fn stop_all_sessions(&self) {
        // Check if we're already inside a tokio runtime. If so, we cannot
        // create a nested runtime — use block_in_place instead.
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            // We're inside a tokio context — use block_in_place to run
            // the async cleanup without creating a nested runtime.
            tokio::task::block_in_place(|| {
                handle.block_on(async {
                    self.stop_all_sessions_async().await;
                });
            });
        } else {
            // No runtime active — create a temporary one
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();

            if let Ok(rt) = rt {
                rt.block_on(async {
                    self.stop_all_sessions_async().await;
                });
            }
        }
    }

    /// Async implementation for stopping all sessions
    async fn stop_all_sessions_async(&self) {
        let mut sessions = self.sessions.write().await;
        for (session_id, session) in sessions.drain() {
            let mut session_guard = session.write().await;
            if let Err(e) = session_guard.stop(true).await {
                tracing::warn!("Failed to stop debug session {}: {}", session_id, e);
            } else {
                tracing::info!("Debug session {} stopped", session_id);
            }
        }
    }
}

impl Default for DebuggerState {
    fn default() -> Self {
        Self::new()
    }
}
