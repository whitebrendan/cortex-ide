//! Tauri commands for cross-platform sandboxed process execution.
//!
//! Provides commands to spawn, wait, kill, and query the status of
//! sandboxed processes across all supported platforms.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use dashmap::DashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{error, info};
use uuid::Uuid;

use super::{SandboxConfig, SandboxedProcess};
use crate::LazyState;
use std::path::Path;
use crate::fs::security::{validate_path_for_read, validate_path_for_write};

const MAX_SANDBOX_ARGS: usize = 128;
const MAX_SANDBOX_PATHS: usize = 64;
const MAX_SANDBOX_ENV_VARS: usize = 64;
const MAX_SANDBOX_STRING_LEN: usize = 4096;
const MAX_SANDBOX_ENV_KEY_LEN: usize = 128;
//! Tauri commands for cross-platform sandboxed process execution.
//!
//! Provides commands to spawn, wait, kill, and query the status of
//! sandboxed processes across all supported platforms.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use dashmap::DashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{error, info};
use uuid::Uuid;

use super::{SandboxConfig, SandboxedProcess};
use crate::LazyState;

/// State for tracking active sandboxed processes.
pub struct SandboxState(pub Arc<DashMap<String, Arc<Mutex<SandboxedProcess>>>>);

impl SandboxState {
    /// Create a new empty sandbox state.
    pub fn new() -> Self {
        Self(Arc::new(DashMap::new()))
    }

    /// Kill all active sandboxed processes (for cleanup on exit).
    pub fn kill_all(&self) {
        let keys: Vec<String> = self.0.iter().map(|e| e.key().clone()).collect();
        for key in &keys {
            if let Some(entry) = self.0.get(key) {
                let mut proc = entry.value().lock();
                if proc.is_running() {
                    if let Err(e) = proc.kill() {
                        error!("Failed to kill sandbox process {}: {}", key, e);
                    }
                }
            }
        }
        let count = keys.len();
        self.0.clear();
        if count > 0 {
            info!("Killed {} sandboxed processes", count);
        }
    }
}

/// Request payload for spawning a sandboxed process.
#[derive(Debug, Clone, Deserialize)]
pub struct SandboxSpawnRequest {
    /// Command to execute
    pub command: String,
    /// Arguments for the command
    #[serde(default)]
    pub args: Vec<String>,
    /// Working directory
    pub working_dir: Option<String>,
    /// Additional environment variables
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Block network access
    #[serde(default)]
    pub block_network: bool,
    /// Paths allowed for read-only access
    #[serde(default)]
    pub allowed_read_paths: Vec<PathBuf>,
    /// Paths allowed for read-write access
    #[serde(default)]
    pub allowed_write_paths: Vec<PathBuf>,
}

/// Response payload after spawning a sandboxed process.
#[derive(Debug, Clone, Serialize)]
pub struct SandboxSpawnResponse {
    /// Unique identifier for the spawned process
    pub process_id: String,
}

/// Spawn a new sandboxed process.
#[tauri::command]
pub async fn sandbox_spawn(
    state: State<'_, LazyState<SandboxState>>,
    config: SandboxSpawnRequest,
) -> Result<SandboxSpawnResponse, String> {

fn validate_command_string(command: &str) -> Result<(), String> {
fn validate_command_string(command: &str) -> Result<String, String> {

    let command_path = Path::new(trimmed);
    if command_path.is_absolute() || trimmed.contains('/') || trimmed.contains('\\') {
        let validated = validate_path_for_read(command_path)?;
        if !validated.is_file() {
            return Err(format!(
                "Sandbox command path is not an executable file: {}",
                validated.display()
            ));
        }

        return Ok(validated.to_string_lossy().to_string());
    }
    Ok(trimmed.to_string())
        return Err("Sandbox command cannot be empty".to_string());
    }
    if trimmed.len() > MAX_SANDBOX_STRING_LEN {
        return Err("Sandbox command is too long".to_string());
    }

    Ok(())
}

fn validate_arg(arg: &str) -> Result<(), String> {
    if arg.len() > MAX_SANDBOX_STRING_LEN {
        return Err("Sandbox argument is too long".to_string());
    }
    Ok(())
}

fn validate_env_key(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("Sandbox environment variable name cannot be empty".to_string());
    }
    if key.len() > MAX_SANDBOX_ENV_KEY_LEN {
        return Err(format!("Sandbox environment variable '{}' is too long", key));
    }
    if key.contains('=') {
        return Err(format!(
            "Sandbox environment variable '{}' cannot contain '='",
            key
        ));
    }
    if !key
        .chars()
        .all(|c| c == '_' || c.is_ascii_alphanumeric())
    {
        return Err(format!(
            "Sandbox environment variable '{}' contains invalid characters",
            key
        ));
    }

    Ok(())
}

fn validate_env_value(value: &str) -> Result<(), String> {
    if value.len() > MAX_SANDBOX_STRING_LEN {
        return Err("Sandbox environment variable value is too long".to_string());
    }
    Ok(())
}

fn validate_read_paths(paths: Vec<PathBuf>) -> Result<Vec<PathBuf>, String> {
    if paths.len() > MAX_SANDBOX_PATHS {
        return Err(format!(
            "Too many sandbox read paths (max {})",
            MAX_SANDBOX_PATHS
        ));
    }

    paths.into_iter().map(|path| validate_path_for_read(&path)).collect()
}

fn validate_write_paths(paths: Vec<PathBuf>) -> Result<Vec<PathBuf>, String> {
    if paths.len() > MAX_SANDBOX_PATHS {
        return Err(format!(
            "Too many sandbox write paths (max {})",
            MAX_SANDBOX_PATHS
        ));
    }

    paths
        .into_iter()
        .map(|path| validate_path_for_write(&path))
        .collect()
}

fn validate_optional_working_dir(path: Option<String>) -> Result<Option<String>, String> {
    path.map(|dir| {
        if dir.len() > MAX_SANDBOX_STRING_LEN {
            return Err("Sandbox working directory is too long".to_string());
        }

        let validated = validate_path_for_read(Path::new(&dir))?;

        if !validated.is_dir() {
            return Err(format!(
                "Sandbox working directory is not a directory: {}",
                validated.display()
            ));
        }

        Ok(validated.to_string_lossy().to_string())
    })
    .transpose()
}

fn validate_spawn_request(config: SandboxSpawnRequest) -> Result<SandboxConfig, String> {
    let command = validate_command_string(&config.command)?;

    if config.args.len() > MAX_SANDBOX_ARGS {
        return Err(format!(
            "Too many sandbox arguments (max {})",
            MAX_SANDBOX_ARGS
        ));
    }

    for arg in &config.args {
        validate_arg(arg)?;
    }

    if config.env.len() > MAX_SANDBOX_ENV_VARS {
        return Err(format!(
            "Too many sandbox environment variables (max {})",
            MAX_SANDBOX_ENV_VARS
        ));
    }

    for (key, value) in &config.env {
        validate_env_key(key)?;
        validate_env_value(value)?;
    }

    Ok(SandboxConfig {
        command,
        args: config.args,
        working_dir: validate_optional_working_dir(config.working_dir)?,
        env: config.env,
        block_network: config.block_network,
        allowed_read_paths: validate_read_paths(config.allowed_read_paths)?,
        allowed_write_paths: validate_write_paths(config.allowed_write_paths)?,
    })
}
    let command_name = config.command.clone();
    let sandbox_config = validate_spawn_request(config)?;
    let process = tokio::task::spawn_blocking(move || SandboxedProcess::spawn(&sandbox_config))
        .await
        .map_err(|e| format!("Sandbox spawn task failed: {}", e))?
        .map_err(|e| {
            error!(error = %e, "Failed to spawn sandboxed process");
            e
        })?;

    let process_id = Uuid::new_v4().to_string();
    info!(
        process_id = %process_id,
        command = %command_name,
        "Sandboxed process spawned"
    );

    state
        .get()
        .0
        .insert(process_id.clone(), Arc::new(Mutex::new(process)));

    Ok(SandboxSpawnResponse { process_id })
}

/// Wait for a sandboxed process to exit and return its exit code.
#[tauri::command]
pub async fn sandbox_wait(
    state: State<'_, LazyState<SandboxState>>,
    process_id: String,
) -> Result<i32, String> {
    let process_mutex = state
        .get()
        .0
        .get(&process_id)
        .map(|entry| Arc::clone(entry.value()))
        .ok_or_else(|| format!("Process not found: {}", process_id))?;

    let pid = process_id.clone();
    let exit_code = tokio::task::spawn_blocking(move || {
        let mut process = process_mutex.lock();
        process.wait()
    })
    .await
    .map_err(|e| format!("Sandbox wait task failed: {}", e))?
    .map_err(|e| {
        error!(process_id = %pid, error = %e, "Failed to wait for sandboxed process");
        e
    })?;

    state.get().0.remove(&process_id);

    info!(
        process_id = %process_id,
        exit_code = exit_code,
        "Sandboxed process exited"
    );

    Ok(exit_code)
}

/// Kill a sandboxed process.
#[tauri::command]
pub async fn sandbox_kill(
    state: State<'_, LazyState<SandboxState>>,
    process_id: String,
) -> Result<(), String> {
    let process_mutex = state
        .get()
        .0
        .get(&process_id)
        .map(|entry| Arc::clone(entry.value()))
        .ok_or_else(|| format!("Process not found: {}", process_id))?;

    let pid = process_id.clone();
    tokio::task::spawn_blocking(move || {
        let mut process = process_mutex.lock();
        process.kill()
    })
    .await
    .map_err(|e| format!("Sandbox kill task failed: {}", e))?
    .map_err(|e| {
        error!(process_id = %pid, error = %e, "Failed to kill sandboxed process");
        e
    })?;

    state.get().0.remove(&process_id);

    info!(process_id = %process_id, "Sandboxed process killed");

    Ok(())
}

/// Check if a sandboxed process is still running.
#[tauri::command]
pub async fn sandbox_status(
    state: State<'_, LazyState<SandboxState>>,
    process_id: String,
) -> Result<bool, String> {
    let process_mutex = state
        .get()
        .0
        .get(&process_id)
        .map(|entry| Arc::clone(entry.value()))
        .ok_or_else(|| format!("Process not found: {}", process_id))?;

    let mut process = process_mutex.lock();
    Ok(process.is_running())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn validates_spawn_request_paths_and_env() {
        let temp = tempfile::tempdir().unwrap();
        let request = SandboxSpawnRequest {
        let command_path = temp.path().join("sandbox-command");
        std::fs::write(&command_path, "#!/bin/sh\nexit 0\n").unwrap();
            command: command_path.to_string_lossy().to_string(),
            args: vec!["hello".to_string()],
            working_dir: Some(temp.path().to_string_lossy().to_string()),
            env: HashMap::from([("SAFE_KEY".to_string(), "value".to_string())]),
            block_network: true,
            allowed_read_paths: vec![temp.path().to_path_buf()],
            allowed_write_paths: vec![temp.path().join("output.txt")],
        };

        let validated = validate_spawn_request(request).unwrap();

        assert_eq!(validated.command, command_path.to_string_lossy().to_string());
        assert_eq!(validated.args, vec!["hello".to_string()]);
        assert_eq!(validated.env.get("SAFE_KEY").unwrap(), "value");
        assert!(validated
            .working_dir
            .as_deref()
            .unwrap()
            .contains(temp.path().to_string_lossy().as_ref()));
        assert_eq!(validated.allowed_read_paths.len(), 1);
        assert_eq!(validated.allowed_write_paths.len(), 1);
    }

    #[test]
    fn rejects_invalid_env_names() {
        let request = SandboxSpawnRequest {
            command: "echo".to_string(),
            args: Vec::new(),
            working_dir: None,
            env: HashMap::from([("BAD-NAME".to_string(), "value".to_string())]),
            block_network: true,
            allowed_read_paths: Vec::new(),
            allowed_write_paths: Vec::new(),
        };

        let err = validate_spawn_request(request).unwrap_err();
        assert!(err.contains("invalid characters"));
    }

        let temp = tempfile::tempdir().unwrap();
            command: "echo".to_string(),
            working_dir: Some(temp.path().join("missing").to_string_lossy().to_string()),
        let request = SandboxSpawnRequest {
            command: "/bin/echo".to_string(),
            args: Vec::new(),
            working_dir: Some("/path/that/does/not/exist".to_string()),
            env: HashMap::new(),
            block_network: true,
            allowed_read_paths: Vec::new(),
            allowed_write_paths: Vec::new(),
        };

        assert!(validate_spawn_request(request).is_err());
    }

    #[test]
    fn rejects_empty_commands() {
        let request = SandboxSpawnRequest {
            command: "   ".to_string(),
            args: Vec::new(),
            working_dir: None,
            env: HashMap::new(),
            block_network: true,
            allowed_read_paths: Vec::new(),
            allowed_write_paths: Vec::new(),
        };

        let err = validate_spawn_request(request).unwrap_err();
        assert!(err.contains("cannot be empty"));
    }
}

    let mut process = process_mutex.lock();
    Ok(process.is_running())
}