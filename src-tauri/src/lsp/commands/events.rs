//! LSP event handling
//!
//! Setup and handling of LSP diagnostic events and crash notifications.

use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, warn};

use super::state::LspState;

/// Setup LSP event listeners
pub fn setup_lsp_events(app: &AppHandle) {
    let state = app.state::<LspState>();

    if let Some(mut rx) = state.take_diagnostics_receiver() {
        let app = app.clone();
        let _diag_handle = tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                // Emit diagnostics to the frontend
                if let Err(e) = app.emit("lsp:diagnostics", &event) {
                    error!("Failed to emit diagnostics event: {}", e);
                }
            }
        });
    }

    if let Some(mut rx) = state.take_crash_receiver() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(server_id) = rx.recv().await {
                warn!("LSP server crashed: {}", server_id);

                // Get the server name before cleanup
                let server_name = {
                    let lsp_state = app.state::<LspState>();
                    let clients = lsp_state.clients.lock();
                    clients
                        .get(&server_id)
                        .map(|c| c.name().to_string())
                        .unwrap_or_else(|| server_id.clone())
                };

                // Emit crash event to the frontend
                if let Err(e) = app.emit(
                    "lsp:server-crashed",
                    serde_json::json!({
                        "server_id": server_id,
                        "server_name": server_name,
                    }),
                ) {
                    error!("Failed to emit server crash event: {}", e);
                }
            }
        });
    }
}
