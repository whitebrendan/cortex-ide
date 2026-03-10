//! Transport implementations for MCP servers
//!
//! Supports stdio, HTTP, and SSE transports for communicating with context servers.

use anyhow::{Context, Result, anyhow};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Stdio};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as TokioBufReader};
use tokio::sync::Mutex;
use url::Url;

use crate::cortex_engine::security::ssrf::{SsrfConfig, SsrfProtection};

/// Maximum message size to prevent DoS attacks (10 MB)
const MAX_MESSAGE_SIZE: usize = 10 * 1024 * 1024;

fn validate_context_server_endpoint_with_config(endpoint: &str, config: SsrfConfig) -> Result<Url> {
    let parsed = Url::parse(endpoint).map_err(|e| anyhow!("Invalid context server URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => {
            return Err(anyhow!(
                "Unsupported context server URL scheme '{}'. Only http and https are allowed.",
                scheme
            ));
        }
    }

    SsrfProtection::with_config(config)
        .validate_url(parsed.as_str())
        .map_err(|e| anyhow!("Unsafe context server URL: {e}"))
}

pub(crate) fn validate_context_server_endpoint(endpoint: &str) -> Result<Url> {
    validate_context_server_endpoint_with_config(endpoint, SsrfConfig::new().skip_dns_resolution())
}

pub(crate) async fn validate_context_server_endpoint_with_dns(endpoint: &str) -> Result<Url> {
    let endpoint = endpoint.to_string();
    tokio::task::spawn_blocking(move || {
        validate_context_server_endpoint_with_config(&endpoint, SsrfConfig::new())
    })
    .await
    .context("Context server URL validation task failed")?
}

/// Transport trait for MCP communication
pub trait Transport: Send + Sync {
    /// Send a message to the server
    fn send(&mut self, message: &str) -> Result<()>;

    /// Receive a message from the server
    fn receive(&mut self) -> Result<String>;
}

/// Stdio transport for local MCP servers
pub struct StdioTransport {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl StdioTransport {
    /// Create a new stdio transport by spawning a process
    pub fn new(
        command: &str,
        args: &[String],
        env: Option<&HashMap<String, String>>,
        working_dir: Option<&str>,
    ) -> Result<Self> {
        let mut cmd = crate::process_utils::command(command);

        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().context("Failed to spawn MCP server process")?;

        let stdin = child.stdin.take().context("Failed to open stdin")?;
        let stdout = child.stdout.take().context("Failed to open stdout")?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        })
    }

    /// Kill the underlying process
    pub fn kill(&mut self) -> Result<()> {
        self.child
            .kill()
            .context("Failed to kill MCP server process")
    }
}

impl Drop for StdioTransport {
    fn drop(&mut self) {
        let _ = self.kill();
    }
}

impl Transport for StdioTransport {
    fn send(&mut self, message: &str) -> Result<()> {
        // MCP uses Content-Length header like LSP
        let content_length = message.len();
        let header = format!("Content-Length: {}\r\n\r\n", content_length);

        self.stdin
            .write_all(header.as_bytes())
            .context("Failed to write header")?;
        self.stdin
            .write_all(message.as_bytes())
            .context("Failed to write message")?;
        self.stdin.flush().context("Failed to flush stdin")?;

        Ok(())
    }

    fn receive(&mut self) -> Result<String> {
        // Read headers
        let mut content_length: Option<usize> = None;
        loop {
            let mut line = String::new();
            self.stdout
                .read_line(&mut line)
                .context("Failed to read header line")?;

            let line = line.trim();
            if line.is_empty() {
                break;
            }

            if let Some(len_str) = line.strip_prefix("Content-Length: ") {
                content_length = Some(len_str.parse().context("Invalid Content-Length")?);
            }
        }

        let length = content_length.context("Missing Content-Length header")?;

        // Security: Prevent DoS via oversized messages
        if length > MAX_MESSAGE_SIZE {
            return Err(anyhow!(
                "Message too large: {} bytes (max: {} bytes)",
                length,
                MAX_MESSAGE_SIZE
            ));
        }

        // Read body
        let mut body = vec![0u8; length];
        std::io::Read::read_exact(&mut self.stdout, &mut body).context("Failed to read body")?;

        String::from_utf8(body).context("Invalid UTF-8 in response")
    }
}

// Note: Blocking HttpTransport has been removed in favor of AsyncHttpTransport
// All HTTP communication should use the async variant to avoid blocking the Tauri runtime

/// Async stdio transport for use with Tokio
pub struct AsyncStdioTransport {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    stdout: Arc<Mutex<TokioBufReader<tokio::process::ChildStdout>>>,
    child: Arc<Mutex<tokio::process::Child>>,
}

impl AsyncStdioTransport {
    /// Create a new async stdio transport
    pub async fn new(
        command: &str,
        args: &[String],
        env: Option<&HashMap<String, String>>,
        working_dir: Option<&str>,
    ) -> Result<Self> {
        let mut cmd = crate::process_utils::async_command(command);

        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().context("Failed to spawn MCP server process")?;

        let stdin = child.stdin.take().context("Failed to open stdin")?;
        let stdout = child.stdout.take().context("Failed to open stdout")?;

        Ok(Self {
            stdin: Arc::new(Mutex::new(stdin)),
            stdout: Arc::new(Mutex::new(TokioBufReader::new(stdout))),
            child: Arc::new(Mutex::new(child)),
        })
    }

    /// Send a message asynchronously
    pub async fn send_async(&self, message: &str) -> Result<()> {
        let content_length = message.len();
        let header = format!("Content-Length: {}\r\n\r\n", content_length);

        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(header.as_bytes())
            .await
            .context("Failed to write header")?;
        stdin
            .write_all(message.as_bytes())
            .await
            .context("Failed to write message")?;
        stdin.flush().await.context("Failed to flush stdin")?;

        Ok(())
    }

    /// Receive a message asynchronously
    pub async fn receive_async(&self) -> Result<String> {
        let mut stdout = self.stdout.lock().await;

        // Read headers
        let mut content_length: Option<usize> = None;
        loop {
            let mut line = String::new();
            stdout
                .read_line(&mut line)
                .await
                .context("Failed to read header line")?;

            let line = line.trim();
            if line.is_empty() {
                break;
            }

            if let Some(len_str) = line.strip_prefix("Content-Length: ") {
                content_length = Some(len_str.parse().context("Invalid Content-Length")?);
            }
        }

        let length = content_length.context("Missing Content-Length header")?;

        // Security: Prevent DoS via oversized messages
        if length > MAX_MESSAGE_SIZE {
            return Err(anyhow!(
                "Message too large: {} bytes (max: {} bytes)",
                length,
                MAX_MESSAGE_SIZE
            ));
        }

        // Read body
        let mut body = vec![0u8; length];
        tokio::io::AsyncReadExt::read_exact(&mut *stdout, &mut body)
            .await
            .context("Failed to read body")?;

        String::from_utf8(body).context("Invalid UTF-8 in response")
    }

    /// Kill the underlying process
    pub async fn kill(&self) -> Result<()> {
        let mut child = self.child.lock().await;
        child
            .kill()
            .await
            .context("Failed to kill MCP server process")
    }
}

/// Async HTTP transport using reqwest async
pub struct AsyncHttpTransport {
    endpoint: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
}

impl AsyncHttpTransport {
    pub fn new(endpoint: &str, headers: HashMap<String, String>) -> Result<Self> {
        let validated_endpoint = validate_context_server_endpoint(endpoint)?;
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self {
            endpoint: validated_endpoint.to_string(),
            headers,
            client,
        })
    }

    /// Make an async HTTP request
    pub async fn request(&self, message: &str) -> Result<String> {
        let mut request = self
            .client
            .post(&self.endpoint)
            .header("Content-Type", "application/json");

        for (key, value) in &self.headers {
            request = request.header(key, value);
        }

        let response = request
            .body(message.to_string())
            .send()
            .await
            .context("HTTP request failed")?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("HTTP error {}: {}", status, body));
        }

        response
            .text()
            .await
            .context("Failed to read response body")
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn validate_context_server_endpoint_accepts_https_url() {
        let parsed =
            validate_context_server_endpoint("https://mcp.example.com/api").expect("valid URL");
        assert_eq!(parsed.scheme(), "https");
    }

    #[test]
    fn validate_context_server_endpoint_rejects_localhost() {
        let error = validate_context_server_endpoint("http://127.0.0.1:8765")
            .expect_err("localhost should be blocked");
        assert!(
            error
                .to_string()
                .contains("localhost and local domains are not allowed")
        );
    }

    #[tokio::test]
    async fn validate_context_server_endpoint_with_dns_rejects_private_ip() {
        let error = validate_context_server_endpoint_with_dns("http://192.168.10.20:8765/sse")
            .await
            .expect_err("private IP should be blocked");
        assert!(
            error
                .to_string()
                .contains("private and reserved IP ranges are not allowed")
        );
    }
}
