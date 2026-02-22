//! MCP Bridge — spawns the Node.js MCP server and communicates via stdio JSON-RPC.
//!
//! The bridge manages a child `node` process running `mcp-server/dist/index.js`,
//! sends JSON-RPC requests over stdin, and reads responses from stdout.
//! It reuses the Content-Length framed protocol used by
//! [`crate::context_server::transport::AsyncStdioTransport`].

use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result, anyhow};
use serde_json::Value;
use tokio::sync::Mutex;
use tracing::info;

use crate::context_server::transport::AsyncStdioTransport;
use crate::context_server::types::{
    CallToolParams, CallToolResponse, InitializeParams, InitializeResponse, ToolsListResponse,
    LATEST_PROTOCOL_VERSION,
};

/// JSON-RPC version constant.
const JSON_RPC_VERSION: &str = "2.0";

/// Bridge to the Node.js MCP server.
pub struct McpBridge {
    transport: AsyncStdioTransport,
    next_id: AtomicI64,
}

impl McpBridge {
    /// Spawn the Node.js MCP server and perform the MCP `initialize` handshake.
    pub async fn start(project_path: &str) -> Result<Self> {
        let script = Self::resolve_server_script()?;

        let args = vec![script];
        let mut env = HashMap::new();
        env.insert(
            "CORTEX_WORKSPACE_ROOT".to_string(),
            project_path.to_string(),
        );

        let transport =
            AsyncStdioTransport::new("node", &args, Some(&env), Some(project_path)).await?;

        let bridge = Self {
            transport,
            next_id: AtomicI64::new(1),
        };

        bridge.initialize().await?;
        info!("[McpBridge] started for project {}", project_path);
        Ok(bridge)
    }

    /// Stop the child process.
    pub async fn stop(&self) -> Result<()> {
        self.transport.kill().await?;
        info!("[McpBridge] stopped");
        Ok(())
    }

    /// List available tools from the MCP server.
    pub async fn list_tools(&self) -> Result<ToolsListResponse> {
        let result = self
            .request::<(), ToolsListResponse>("tools/list", None)
            .await?;
        Ok(result)
    }

    /// Call a tool on the MCP server.
    pub async fn call_tool(&self, name: &str, arguments: Option<Value>) -> Result<CallToolResponse> {
        let params = CallToolParams {
            name: name.to_string(),
            arguments,
        };
        let result = self
            .request::<CallToolParams, CallToolResponse>("tools/call", Some(params))
            .await?;
        Ok(result)
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    /// Resolve the path to `mcp-server/dist/index.js` relative to the Tauri
    /// resource directory or the repo root (for development).
    fn resolve_server_script() -> Result<String> {
        // In development, look relative to the cargo manifest dir
        let dev_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../mcp-server/dist/index.js");
        if dev_path.exists() {
            return dev_path
                .canonicalize()
                .map(|p| p.to_string_lossy().to_string())
                .context("Failed to canonicalize mcp-server script path");
        }

        Err(anyhow!(
            "Could not locate mcp-server/dist/index.js. Run `npm run build` in mcp-server/ first."
        ))
    }

    /// Perform the MCP `initialize` + `initialized` handshake.
    async fn initialize(&self) -> Result<InitializeResponse> {
        let params = InitializeParams {
            protocol_version: LATEST_PROTOCOL_VERSION.to_string(),
            capabilities: Default::default(),
            client_info: crate::context_server::types::Implementation {
                name: "cortex-desktop".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
            meta: None,
        };

        let response: InitializeResponse = self
            .request("initialize", Some(params))
            .await
            .context("MCP initialize failed")?;

        // Send `initialized` notification (no response expected)
        self.notify::<()>("notifications/initialized", None)
            .await?;

        info!(
            "[McpBridge] initialized — server: {} v{}",
            response.server_info.name, response.server_info.version
        );

        Ok(response)
    }

    /// Send a JSON-RPC request and wait for the response.
    async fn request<P: serde::Serialize, R: serde::de::DeserializeOwned>(
        &self,
        method: &str,
        params: Option<P>,
    ) -> Result<R> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);

        let request = serde_json::json!({
            "jsonrpc": JSON_RPC_VERSION,
            "id": id,
            "method": method,
            "params": params,
        });
        let request_str = serde_json::to_string(&request)?;

        self.transport.send_async(&request_str).await?;
        let response_str = self.transport.receive_async().await?;

        let response: Value =
            serde_json::from_str(&response_str).context("Invalid JSON-RPC response")?;

        if let Some(err) = response.get("error") {
            let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            let message = err
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(anyhow!("MCP error {}: {}", code, message));
        }

        let result = response
            .get("result")
            .context("Missing result in JSON-RPC response")?;

        serde_json::from_value(result.clone()).context("Failed to deserialize response result")
    }

    /// Send a JSON-RPC notification (fire-and-forget).
    async fn notify<P: serde::Serialize>(
        &self,
        method: &str,
        params: Option<P>,
    ) -> Result<()> {
        let notification = serde_json::json!({
            "jsonrpc": JSON_RPC_VERSION,
            "method": method,
            "params": params,
        });
        let notification_str = serde_json::to_string(&notification)?;
        self.transport.send_async(&notification_str).await?;
        Ok(())
    }
}

/// Tauri-managed state wrapping an optional `McpBridge`.
pub struct McpBridgeState(pub Arc<Mutex<Option<McpBridge>>>);

impl McpBridgeState {
    /// Create a new empty bridge state.
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

impl Default for McpBridgeState {
    fn default() -> Self {
        Self::new()
    }
}
