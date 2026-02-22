//! MCP Tauri Commands
//!
//! Exposes MCP functionality to the frontend via Tauri commands.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use super::McpState;
use super::bridge::McpBridgeState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub socket_type: String,
    pub socket_path: Option<String>,
}

/// Get MCP server status
#[tauri::command]
pub async fn mcp_get_status<R: Runtime>(app: AppHandle<R>) -> Result<McpStatus, String> {
    let state = app.state::<McpState<R>>();

    let (socket_type, socket_path) = match &state.config.socket_type {
        super::SocketType::Ipc { path } => {
            let p = path.clone().unwrap_or_else(super::get_default_socket_path);
            ("ipc".to_string(), Some(p.to_string_lossy().to_string()))
        }
        super::SocketType::Tcp { host, port } => {
            ("tcp".to_string(), Some(format!("{}:{}", host, port)))
        }
    };

    Ok(McpStatus {
        running: state.is_running(),
        socket_type,
        socket_path,
    })
}

/// Start the MCP server
#[tauri::command]
pub async fn mcp_start<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<McpState<R>>();
    state.start(&app)
}

/// Stop the MCP server
#[tauri::command]
pub async fn mcp_stop<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<McpState<R>>();
    state.stop()
}

// =====================================================================
// MCP Bridge commands — manage the Node.js workspace MCP server
// =====================================================================

/// Start the MCP bridge (Node.js workspace tools server)
#[tauri::command]
pub async fn mcp_bridge_start(
    app: AppHandle<impl Runtime>,
    project_path: String,
) -> Result<(), String> {
    let state = app.state::<McpBridgeState>();
    let mut guard = state.0.lock().await;
    if guard.is_some() {
        return Ok(()); // already running
    }
    let bridge = super::bridge::McpBridge::start(&project_path)
        .await
        .map_err(|e| format!("Failed to start MCP bridge: {e}"))?;
    *guard = Some(bridge);
    Ok(())
}

/// Stop the MCP bridge
#[tauri::command]
pub async fn mcp_bridge_stop(app: AppHandle<impl Runtime>) -> Result<(), String> {
    let state = app.state::<McpBridgeState>();
    let mut guard = state.0.lock().await;
    if let Some(bridge) = guard.take() {
        bridge
            .stop()
            .await
            .map_err(|e| format!("Failed to stop MCP bridge: {e}"))?;
    }
    Ok(())
}

/// List tools exposed by the MCP bridge
#[tauri::command]
pub async fn mcp_bridge_list_tools(
    app: AppHandle<impl Runtime>,
) -> Result<Value, String> {
    let state = app.state::<McpBridgeState>();
    let guard = state.0.lock().await;
    let bridge = guard
        .as_ref()
        .ok_or_else(|| "MCP bridge is not running".to_string())?;
    let tools = bridge
        .list_tools()
        .await
        .map_err(|e| format!("Failed to list tools: {e}"))?;
    serde_json::to_value(tools).map_err(|e| format!("Serialization error: {e}"))
}

/// Call a tool on the MCP bridge
#[tauri::command]
pub async fn mcp_bridge_call_tool(
    app: AppHandle<impl Runtime>,
    name: String,
    arguments: Option<Value>,
) -> Result<Value, String> {
    let state = app.state::<McpBridgeState>();
    let guard = state.0.lock().await;
    let bridge = guard
        .as_ref()
        .ok_or_else(|| "MCP bridge is not running".to_string())?;
    let result = bridge
        .call_tool(&name, arguments)
        .await
        .map_err(|e| format!("Tool call failed: {e}"))?;
    serde_json::to_value(result).map_err(|e| format!("Serialization error: {e}"))
}

/// Get MCP configuration info for AI agents
#[tauri::command]
pub async fn mcp_get_config<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    let state = app.state::<McpState<R>>();

    let (connection_type, connection_info) = match &state.config.socket_type {
        super::SocketType::Ipc { path } => {
            let p = path.clone().unwrap_or_else(super::get_default_socket_path);
            (
                "ipc",
                serde_json::json!({
                    "path": p.to_string_lossy().to_string()
                }),
            )
        }
        super::SocketType::Tcp { host, port } => (
            "tcp",
            serde_json::json!({
                "host": host,
                "port": port
            }),
        ),
    };

    Ok(serde_json::json!({
        "applicationName": state.config.application_name,
        "connectionType": connection_type,
        "connectionInfo": connection_info,
        "running": state.is_running(),
        "tools": [
            "ping",
            "takeScreenshot",
            "getDom",
            "executeJs",
            "manageWindow",
            "textInput",
            "mouseMovement",
            "manageLocalStorage",
            "getElementPosition",
            "sendTextToElement",
            "listWindows"
        ]
    }))
}
