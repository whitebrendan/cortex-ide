//! Collaboration Tauri Commands
//!
//! Tauri command handlers for collaboration operations including
//! session management, cursor broadcasting, document sync,
//! server lifecycle, and invite token generation.

use tauri::{AppHandle, Emitter, State};
use tracing::info;

use super::CollabState;
use super::types::{
    CollabRoomResult, CollabRoomSummary, CollabServerInfo, CollabServerStatus, CursorPosition,
    SelectionRange,
};
use crate::LazyState;

/// Get the current collaboration server status
#[tauri::command]
pub async fn collab_get_server_status(
    state: State<'_, LazyState<CollabState>>,
) -> Result<CollabServerStatus, String> {
    let manager = state.get().0.lock().await;
    let running = manager.is_server_running();
    let port = if running {
        Some(manager.server_port())
    } else {
        None
    };
    Ok(CollabServerStatus {
        running,
        address: if running {
            Some(format!("127.0.0.1:{}", manager.server_port()))
        } else {
            None
        },
        port,
    })
}

/// Start the collaboration WebSocket server and return its status
#[tauri::command]
pub async fn collab_start_server(
    app: AppHandle,
    state: State<'_, LazyState<CollabState>>,
) -> Result<CollabServerStatus, String> {
    let mut manager = state.get().0.lock().await;
    let port = manager.ensure_server_running(app).await?;
    Ok(CollabServerStatus {
        running: true,
        address: Some(format!("127.0.0.1:{}", port)),
        port: Some(port),
    })
}

/// Start the collaboration server (alias used by `useCollabSync`)
#[tauri::command]
pub async fn start_collab_server(
    app: AppHandle,
    state: State<'_, LazyState<CollabState>>,
) -> Result<CollabServerInfo, String> {
    let mut manager = state.get().0.lock().await;
    let port = manager.ensure_server_running(app).await?;
    let session_count = manager.session_manager.session_count();
    Ok(CollabServerInfo {
        port,
        running: true,
        session_count,
    })
}

/// Stop the collaboration WebSocket server
#[tauri::command]
pub async fn stop_collab_server(state: State<'_, LazyState<CollabState>>) -> Result<(), String> {
    let mut manager = state.get().0.lock().await;
    manager.stop_server();
    Ok(())
}

/// Create a new collaboration session and start the WebSocket server
#[tauri::command]
pub async fn collab_create_session(
    app: AppHandle,
    state: State<'_, LazyState<CollabState>>,
    name: String,
    user_name: String,
) -> Result<CollabRoomResult, String> {
    let mut manager = state.get().0.lock().await;

    let port = manager.ensure_server_running(app.clone()).await?;

    let session_id = uuid::Uuid::new_v4().to_string();
    let user_id = uuid::Uuid::new_v4().to_string();
    let session_token = uuid::Uuid::new_v4().to_string();

    let session_info =
        manager
            .session_manager
            .create_session(&session_id, &name, &user_id, &user_name);

    let _ = app.emit("collab:session-created", &session_info);

    info!(
        "Created collaboration session '{}' (id: {}) on port {}",
        name, session_id, port
    );

    Ok(CollabRoomResult {
        room: CollabRoomSummary {
            id: session_info.id,
            name: session_info.name,
            host_id: session_info.host_id,
            participant_count: session_info.participants.len(),
            created_at: session_info.created_at,
        },
        user_id,
        session_token,
        ws_url: format!("ws://127.0.0.1:{}", port),
    })
}

/// Join an existing collaboration session
#[tauri::command]
pub async fn collab_join_session(
    app: AppHandle,
    state: State<'_, LazyState<CollabState>>,
    session_id: String,
    user_name: String,
) -> Result<CollabRoomResult, String> {
    let mut manager = state.get().0.lock().await;

    let port = manager.ensure_server_running(app.clone()).await?;

    let user_id = uuid::Uuid::new_v4().to_string();
    let session_token = uuid::Uuid::new_v4().to_string();

    let session_info = manager
        .session_manager
        .join_session(&session_id, &user_id, &user_name)?;

    let _ = app.emit("collab:user-joined", &session_info);

    info!(
        "User '{}' joined session '{}' (id: {})",
        user_name, session_info.name, session_id
    );

    Ok(CollabRoomResult {
        room: CollabRoomSummary {
            id: session_info.id,
            name: session_info.name,
            host_id: session_info.host_id,
            participant_count: session_info.participants.len(),
            created_at: session_info.created_at,
        },
        user_id,
        session_token,
        ws_url: format!("ws://127.0.0.1:{}", port),
    })
}

/// Leave a collaboration session
#[tauri::command]
pub async fn collab_leave_session(
    app: AppHandle,
    state: State<'_, LazyState<CollabState>>,
    session_id: String,
    user_id: String,
) -> Result<(), String> {
    let mut manager = state.get().0.lock().await;

    let session_removed = manager
        .session_manager
        .leave_session(&session_id, &user_id)?;

    let _ = app.emit(
        "collab:user-left",
        serde_json::json!({
            "sessionId": session_id,
            "userId": user_id,
            "sessionRemoved": session_removed,
        }),
    );

    if session_removed && manager.session_manager.session_count() == 0 {
        manager.stop_server();
    }

    Ok(())
}

/// Broadcast cursor position to all peers in a session
#[tauri::command]
pub async fn collab_broadcast_cursor(
    state: State<'_, LazyState<CollabState>>,
    session_id: String,
    user_id: String,
    file_id: String,
    line: u32,
    column: u32,
) -> Result<(), String> {
    let mut manager = state.get().0.lock().await;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let cursor = CursorPosition {
        file_id,
        line,
        column,
        timestamp: now,
    };

    manager
        .session_manager
        .update_cursor(&session_id, &user_id, cursor)?;

    Ok(())
}

/// Sync a document update via the CRDT engine
#[tauri::command]
pub async fn collab_sync_document(
    state: State<'_, LazyState<CollabState>>,
    session_id: String,
    file_id: String,
    update: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let doc_store = {
        let manager = state.get().0.lock().await;
        manager
            .session_manager
            .get_document_store(&session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?
            .clone()
    };

    doc_store.apply_update(&file_id, &update).await?;

    let state_data = doc_store.encode_state(&file_id).await;

    Ok(state_data)
}

/// Initialize a CRDT document with content for a session
#[tauri::command]
pub async fn collab_init_document(
    state: State<'_, LazyState<CollabState>>,
    session_id: String,
    file_id: String,
    content: String,
) -> Result<(), String> {
    let doc_store = {
        let manager = state.get().0.lock().await;
        manager
            .session_manager
            .get_document_store(&session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?
            .clone()
    };

    let mut inner = doc_store.0.write().await;
    inner.get_or_create_with_text(&file_id, &content);
    drop(inner);

    info!(
        "Initialized CRDT document '{}' in session '{}'",
        file_id, session_id
    );

    Ok(())
}

/// Update text selection for a user in a session
#[tauri::command]
pub async fn collab_update_selection(
    state: State<'_, LazyState<CollabState>>,
    room_id: String,
    user_id: String,
    file_id: String,
    start_line: u32,
    start_column: u32,
    end_line: u32,
    end_column: u32,
) -> Result<(), String> {
    let mut manager = state.get().0.lock().await;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let selection = SelectionRange {
        file_id,
        start_line,
        start_column,
        end_line,
        end_column,
        timestamp: now,
    };

    manager
        .session_manager
        .update_selection(&room_id, &user_id, selection)?;

    Ok(())
}

/// Generate an invite token for a collaboration session
#[tauri::command]
pub async fn collab_create_invite(
    room_id: String,
    permission: Option<String>,
    expires_in_ms: Option<u64>,
    max_uses: Option<u32>,
) -> Result<String, String> {
    let _permission = permission.unwrap_or_else(|| "editor".to_string());
    let _expires_in_ms = expires_in_ms;
    let _max_uses = max_uses;

    let token = format!("{}:{}", room_id, uuid::Uuid::new_v4());

    info!(
        "Created invite token for room '{}' (permission: {})",
        room_id, _permission
    );

    Ok(token)
}
