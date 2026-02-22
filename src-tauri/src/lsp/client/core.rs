//! Core LSP client implementation
//!
//! This module contains the main LspClient struct and its core functionality
//! for process management, message passing, and basic operations.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::thread;

use anyhow::{Context, Result, anyhow};
use parking_lot::Mutex;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, error, info, warn};

use super::conversions::*;
use super::protocol_types::*;
use crate::lsp::types::*;

const JSON_RPC_VERSION: &str = "2.0";
const CONTENT_LENGTH_HEADER: &str = "Content-Length: ";
const MAX_CONTENT_LENGTH: usize = 64 * 1024 * 1024; // 64 MB sanity limit

/// Message sent to the writer thread
pub(super) enum OutgoingMessage {
    Request {
        id: i64,
        method: String,
        params: Value,
        response_tx: oneshot::Sender<Result<Value>>,
    },
    Notification {
        method: String,
        params: Value,
    },
    Shutdown,
}

/// Handler for incoming notifications
type NotificationHandler = Box<dyn Fn(String, Value) + Send + Sync>;

/// LSP Client for communicating with a language server
pub struct LspClient {
    pub(super) id: String,
    pub(super) name: String,
    /// Language server configuration
    pub config: LanguageServerConfig,
    pub(super) status: Arc<Mutex<ServerStatus>>,
    pub(super) capabilities: Arc<Mutex<Option<ServerCapabilities>>>,
    pub(super) next_request_id: AtomicI64,
    pub(super) outgoing_tx: mpsc::UnboundedSender<OutgoingMessage>,
    pub(super) pending_requests: Arc<Mutex<HashMap<i64, oneshot::Sender<Result<Value>>>>>,
    notification_handlers: Arc<Mutex<HashMap<String, NotificationHandler>>>,
    pub(super) process: Arc<Mutex<Option<Child>>>,
    pub(super) diagnostics_tx: Option<mpsc::UnboundedSender<DiagnosticsEvent>>,
    pub(super) semantic_tokens_legend: Arc<Mutex<Option<SemanticTokensLegend>>>,
    crash_tx: Option<mpsc::UnboundedSender<String>>,
}

impl LspClient {
    /// Create a new LSP client and start the language server process
    pub fn new(
        config: LanguageServerConfig,
        diagnostics_tx: Option<mpsc::UnboundedSender<DiagnosticsEvent>>,
    ) -> Result<Self> {
        Self::new_with_crash_notify(config, diagnostics_tx, None)
    }

    /// Create a new LSP client with an optional crash notification channel
    pub fn new_with_crash_notify(
        config: LanguageServerConfig,
        diagnostics_tx: Option<mpsc::UnboundedSender<DiagnosticsEvent>>,
        crash_tx: Option<mpsc::UnboundedSender<String>>,
    ) -> Result<Self> {
        let id = config.id.clone();
        let name = config.name.clone();

        info!("Starting language server: {} ({})", name, config.command);

        // Spawn the language server process
        let mut process = crate::process_utils::command(&config.command)
            .args(&config.args)
            .current_dir(&config.root_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("Failed to spawn language server: {}", config.command))?;

        let stdin = process
            .stdin
            .take()
            .ok_or_else(|| anyhow!("Failed to open stdin"))?;
        let stdout = process
            .stdout
            .take()
            .ok_or_else(|| anyhow!("Failed to open stdout"))?;
        let stderr = process
            .stderr
            .take()
            .ok_or_else(|| anyhow!("Failed to open stderr"))?;

        let (outgoing_tx, outgoing_rx) = mpsc::unbounded_channel();
        let pending_requests: Arc<Mutex<HashMap<i64, oneshot::Sender<Result<Value>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let notification_handlers: Arc<Mutex<HashMap<String, NotificationHandler>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let status = Arc::new(Mutex::new(ServerStatus::Starting));

        let client = Self {
            id: id.clone(),
            name: name.clone(),
            config,
            status: status.clone(),
            capabilities: Arc::new(Mutex::new(None)),
            next_request_id: AtomicI64::new(1),
            outgoing_tx,
            pending_requests: pending_requests.clone(),
            notification_handlers: notification_handlers.clone(),
            process: Arc::new(Mutex::new(Some(process))),
            diagnostics_tx,
            semantic_tokens_legend: Arc::new(Mutex::new(None)),
            crash_tx,
        };

        // Start the writer thread
        let writer_pending = pending_requests.clone();
        let writer_id = id.clone();
        thread::spawn(move || {
            if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                Self::writer_thread(stdin, outgoing_rx, writer_pending);
            })) {
                tracing::error!("LSP writer thread for '{}' panicked: {:?}", writer_id, e);
            }
        });

        // Start the reader thread
        let reader_pending = pending_requests;
        let reader_handlers = notification_handlers;
        let server_id = id.clone();
        let diag_tx = client.diagnostics_tx.clone();
        let reader_status = status.clone();
        let reader_crash_tx = client.crash_tx.clone();
        let reader_server_name = name.clone();
        let reader_id = id.clone();
        thread::spawn(move || {
            if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                Self::reader_thread(
                    stdout,
                    reader_pending.clone(),
                    reader_handlers,
                    server_id.clone(),
                    diag_tx,
                );
                // Reader exited — the LSP process stdout is closed.
                // If status is still Running, the server crashed.
                let current_status = reader_status.lock().clone();
                if current_status == ServerStatus::Running {
                    error!("Language server {} exited unexpectedly", reader_server_name);
                    *reader_status.lock() = ServerStatus::Crashed;

                    // Drain all pending requests so callers don't hang
                    let pending: Vec<_> = reader_pending.lock().drain().collect();
                    for (_, tx) in pending {
                        let _ = tx.send(Err(anyhow!("Language server crashed")));
                    }

                    // Notify crash channel
                    if let Some(ref tx) = reader_crash_tx {
                        let _ = tx.send(server_id);
                    }
                }
            })) {
                tracing::error!("LSP reader thread for '{}' panicked: {:?}", reader_id, e);
            }
        });

        // Start stderr reader thread
        let server_name = name;
        let stderr_id = id.clone();
        thread::spawn(move || {
            if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                Self::stderr_thread(stderr, server_name);
            })) {
                tracing::error!("LSP stderr thread for '{}' panicked: {:?}", stderr_id, e);
            }
        });

        Ok(client)
    }

    /// Writer thread that sends messages to the language server
    fn writer_thread(
        mut stdin: std::process::ChildStdin,
        mut rx: mpsc::UnboundedReceiver<OutgoingMessage>,
        pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Result<Value>>>>>,
    ) {
        while let Some(msg) = rx.blocking_recv() {
            match msg {
                OutgoingMessage::Request {
                    id,
                    method,
                    params,
                    response_tx,
                } => {
                    let request = json!({
                        "jsonrpc": JSON_RPC_VERSION,
                        "id": id,
                        "method": method,
                        "params": params,
                    });

                    pending.lock().insert(id, response_tx);

                    if let Err(e) = Self::write_message(&mut stdin, &request) {
                        error!("Failed to write request: {}", e);
                        if let Some(tx) = pending.lock().remove(&id) {
                            let _ = tx.send(Err(anyhow!("Failed to send request: {}", e)));
                        }
                    }
                }
                OutgoingMessage::Notification { method, params } => {
                    let notification = json!({
                        "jsonrpc": JSON_RPC_VERSION,
                        "method": method,
                        "params": params,
                    });

                    if let Err(e) = Self::write_message(&mut stdin, &notification) {
                        error!("Failed to write notification: {}", e);
                    }
                }
                OutgoingMessage::Shutdown => {
                    debug!("Writer thread shutting down");
                    break;
                }
            }
        }
        // stdin is dropped here, closing the pipe to the LSP process
    }

    /// Write a JSON-RPC message to the output stream
    fn write_message(writer: &mut impl Write, message: &Value) -> Result<()> {
        let content = serde_json::to_string(message)?;
        let header = format!("{}{}\r\n\r\n", CONTENT_LENGTH_HEADER, content.len());

        debug!("Sending LSP message: {}", content);

        writer.write_all(header.as_bytes())?;
        writer.write_all(content.as_bytes())?;
        writer.flush()?;

        Ok(())
    }

    /// Reader thread that receives messages from the language server
    fn reader_thread(
        stdout: std::process::ChildStdout,
        pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Result<Value>>>>>,
        handlers: Arc<Mutex<HashMap<String, NotificationHandler>>>,
        server_id: String,
        diagnostics_tx: Option<mpsc::UnboundedSender<DiagnosticsEvent>>,
    ) {
        let mut reader = BufReader::new(stdout);
        let mut header_buf = String::new();

        loop {
            header_buf.clear();

            // Read headers
            let content_length = match Self::read_headers(&mut reader, &mut header_buf) {
                Ok(len) => len,
                Err(e) => {
                    if e.to_string().contains("EOF") {
                        debug!("Language server closed stdout");
                    } else {
                        error!("Failed to read headers: {}", e);
                    }
                    break;
                }
            };

            // Reject absurdly large messages to prevent OOM
            if content_length > MAX_CONTENT_LENGTH {
                error!(
                    "LSP message content length {} exceeds maximum {}, skipping",
                    content_length, MAX_CONTENT_LENGTH
                );
                // Try to skip the bytes
                let mut discard = vec![0u8; std::cmp::min(content_length, 4096)];
                let mut remaining = content_length;
                while remaining > 0 {
                    let to_read = std::cmp::min(remaining, discard.len());
                    if std::io::Read::read_exact(&mut reader, &mut discard[..to_read]).is_err() {
                        break;
                    }
                    remaining -= to_read;
                }
                continue;
            }

            // Read content
            let mut content = vec![0u8; content_length];
            if let Err(e) = std::io::Read::read_exact(&mut reader, &mut content) {
                error!("Failed to read content: {}", e);
                break;
            }

            let content_str = match String::from_utf8(content) {
                Ok(s) => s,
                Err(e) => {
                    error!("Invalid UTF-8 in LSP message: {}", e);
                    continue;
                }
            };

            debug!("Received LSP message: {}", content_str);

            // Parse the message
            let message: Value = match serde_json::from_str(&content_str) {
                Ok(v) => v,
                Err(e) => {
                    error!("Failed to parse LSP message: {}", e);
                    continue;
                }
            };

            // Handle the message
            if let Some(id) = message.get("id") {
                // Check if this is a response (has "result" or "error") vs a server request
                if message.get("result").is_some() || message.get("error").is_some() {
                    // This is a response to one of our requests
                    let id_i64 = match id {
                        Value::Number(n) => n.as_i64(),
                        Value::String(s) => s.parse::<i64>().ok(),
                        _ => None,
                    };
                    if let Some(id_val) = id_i64 {
                        if let Some(tx) = pending.lock().remove(&id_val) {
                            if let Some(error) = message.get("error") {
                                let error_msg = error
                                    .get("message")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or("Unknown LSP error");
                                let _ = tx.send(Err(anyhow!("{}", error_msg)));
                            } else {
                                let result = message.get("result").cloned().unwrap_or(Value::Null);
                                let _ = tx.send(Ok(result));
                            }
                        } else {
                            warn!("Received response for unknown request id {}", id_val);
                        }
                    } else {
                        warn!("Received response with non-numeric id: {}", id);
                    }
                } else if let Some(method) = message.get("method").and_then(|m| m.as_str()) {
                    // Server-initiated request (has id + method but no result/error)
                    debug!("Received server request: {} (id: {})", method, id);
                    let params = message.get("params").cloned().unwrap_or(Value::Null);
                    if let Some(handler) = handlers.lock().get(method) {
                        handler(method.to_string(), params);
                    }
                }
            } else if let Some(method) = message.get("method").and_then(|m| m.as_str()) {
                // This is a notification (no id)
                let params = message.get("params").cloned().unwrap_or(Value::Null);

                // Handle diagnostics specially
                if method == "textDocument/publishDiagnostics" {
                    if let Some(ref tx) = diagnostics_tx {
                        if let Ok(params) =
                            serde_json::from_value::<PublishDiagnosticsParams>(params.clone())
                        {
                            let event = DiagnosticsEvent {
                                server_id: server_id.clone(),
                                uri: params.uri,
                                diagnostics: params
                                    .diagnostics
                                    .into_iter()
                                    .map(convert_diagnostic)
                                    .collect(),
                            };
                            let _ = tx.send(event);
                        }
                    }
                }

                // Call registered handlers
                if let Some(handler) = handlers.lock().get(method) {
                    handler(method.to_string(), params);
                }
            }
        }
    }

    /// Read LSP message headers and return the content length
    fn read_headers(
        reader: &mut BufReader<std::process::ChildStdout>,
        buf: &mut String,
    ) -> Result<usize> {
        let mut content_length: Option<usize> = None;

        loop {
            buf.clear();
            let bytes_read = reader.read_line(buf)?;
            if bytes_read == 0 {
                return Err(anyhow!("EOF while reading headers"));
            }

            let line = buf.trim();
            if line.is_empty() {
                break;
            }

            if let Some(len_str) = line.strip_prefix(CONTENT_LENGTH_HEADER) {
                content_length = Some(
                    len_str
                        .trim()
                        .parse()
                        .map_err(|e| anyhow!("Invalid Content-Length value: {}", e))?,
                );
            }
        }

        content_length.ok_or_else(|| anyhow!("Missing Content-Length header"))
    }

    /// Stderr reader thread
    fn stderr_thread(stderr: std::process::ChildStderr, server_name: String) {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    warn!("[{}] stderr: {}", server_name, line);
                }
                Err(e) => {
                    debug!("[{}] stderr closed: {}", server_name, e);
                    break;
                }
            }
        }
    }

    /// Send a request to the language server and wait for a response
    pub async fn request<P: Serialize, R: DeserializeOwned>(
        &self,
        method: &str,
        params: P,
    ) -> Result<R> {
        let id = self.next_request_id.fetch_add(1, Ordering::SeqCst);
        let params = serde_json::to_value(params)?;

        let (response_tx, response_rx) = oneshot::channel();

        self.outgoing_tx
            .send(OutgoingMessage::Request {
                id,
                method: method.to_string(),
                params,
                response_tx,
            })
            .map_err(|_| anyhow!("Failed to send request: writer thread closed"))?;

        let result = response_rx
            .await
            .map_err(|_| anyhow!("Request cancelled"))??;
        let response: R = serde_json::from_value(result)?;
        Ok(response)
    }

    /// Send a notification to the language server (no response expected)
    pub fn notify<P: Serialize>(&self, method: &str, params: P) -> Result<()> {
        let params = serde_json::to_value(params)?;

        self.outgoing_tx
            .send(OutgoingMessage::Notification {
                method: method.to_string(),
                params,
            })
            .map_err(|_| anyhow!("Failed to send notification: writer thread closed"))?;

        Ok(())
    }

    /// Initialize the language server
    pub async fn initialize(&self) -> Result<()> {
        let params = InitializeParams {
            process_id: Some(std::process::id() as i32),
            root_uri: Some(format!(
                "file://{}",
                self.config.root_path.replace('\\', "/")
            )),
            capabilities: ClientCapabilities::default(),
        };

        let result: InitializeResult = self.request("initialize", params).await?;

        // Store capabilities
        let caps = convert_server_capabilities(&result.capabilities);
        *self.capabilities.lock() = Some(caps);

        // Extract and store semantic tokens legend from server capabilities
        if let Some(ref provider) = result.capabilities.semantic_tokens_provider {
            let legend = provider.get("legend").and_then(|l| {
                let token_types = l
                    .get("tokenTypes")?
                    .as_array()?
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                let token_modifiers = l
                    .get("tokenModifiers")?
                    .as_array()?
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                Some(SemanticTokensLegend {
                    token_types,
                    token_modifiers,
                })
            });
            *self.semantic_tokens_legend.lock() = legend;
        }

        *self.status.lock() = ServerStatus::Running;

        // Send initialized notification
        self.notify("initialized", json!({}))?;

        info!("Language server {} initialized successfully", self.name);
        Ok(())
    }

    /// Shutdown the language server
    pub async fn shutdown(&self) -> Result<()> {
        *self.status.lock() = ServerStatus::Stopped;

        // Send shutdown request
        let _: Option<()> = self.request("shutdown", json!(null)).await.ok();

        // Send exit notification
        let _ = self.notify("exit", json!(null));

        // Signal writer thread to stop
        let _ = self.outgoing_tx.send(OutgoingMessage::Shutdown);

        // Drain pending requests so callers don't hang
        let pending: Vec<_> = self.pending_requests.lock().drain().collect();
        for (_, tx) in pending {
            let _ = tx.send(Err(anyhow!("Language server shutting down")));
        }

        // Kill the process and wait for it to avoid zombies
        if let Some(mut process) = self.process.lock().take() {
            let _ = process.kill();
            let _ = process.wait();
        }

        info!("Language server {} shut down", self.name);
        Ok(())
    }

    /// Get server ID
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Get server name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get server status
    pub fn status(&self) -> ServerStatus {
        self.status.lock().clone()
    }

    /// Get server capabilities
    pub fn capabilities(&self) -> Option<ServerCapabilities> {
        self.capabilities.lock().clone()
    }

    /// Get the semantic tokens legend from server capabilities
    pub fn semantic_tokens_legend(&self) -> Option<SemanticTokensLegend> {
        self.semantic_tokens_legend.lock().clone()
    }

    /// Get server info
    pub fn info(&self) -> ServerInfo {
        ServerInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            status: self.status(),
            capabilities: self.capabilities(),
        }
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        let _ = self.outgoing_tx.send(OutgoingMessage::Shutdown);

        // Drain pending requests so callers don't hang
        let pending: Vec<_> = self.pending_requests.lock().drain().collect();
        for (_, tx) in pending {
            let _ = tx.send(Err(anyhow!("Language server dropped")));
        }

        if let Some(mut process) = self.process.lock().take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
}
