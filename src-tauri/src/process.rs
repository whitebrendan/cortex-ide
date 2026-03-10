//! Process management for Cortex Desktop
//!
//! This module provides backend support for process exploration and termination.

use serde::{Deserialize, Serialize};
use tauri::command;
use tracing::info;
use std::collections::HashSet;

use sysinfo::{Pid, System};
//! Process management for Cortex Desktop
//!
//! This module provides backend support for process exploration and termination.

use serde::{Deserialize, Serialize};
use tauri::command;
use tracing::info;

/// Process information structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
}

/// Terminate a Cortex-managed process
#[command]
pub async fn terminate_cortex_process(pid: u32, force: bool) -> Result<(), String> {
    info!("[Process] Terminating process {} (force: {})", pid, force);

    #[cfg(unix)]
    {
        let signal = if force { "SIGKILL" } else { "SIGTERM" };
        let _ = signal; // suppress unused warning

const MAX_PROCESS_ANCESTRY_DEPTH: usize = 64;

fn validate_managed_process_termination<F>(
    pid: u32,
    current_pid: u32,
    mut parent_of: F,
) -> Result<(), String>
where
    F: FnMut(u32) -> Option<u32>,
{
    if pid == 0 {
        return Err("PID 0 is not a valid Cortex-managed process".to_string());
    }

    if pid == current_pid {
        return Err("Refusing to terminate the active Cortex process".to_string());
    }

    let mut cursor = pid;
    let mut visited = HashSet::new();

    for _ in 0..MAX_PROCESS_ANCESTRY_DEPTH {
        if !visited.insert(cursor) {
            break;
        }

        let Some(parent_pid) = parent_of(cursor) else {
            break;
        };

        if parent_pid == current_pid {
            return Ok(());
        }

        if parent_pid == cursor || parent_pid == 0 {
            break;
        }

        cursor = parent_pid;
    }

    Err(format!(
        "Refusing to terminate unmanaged process {}. Only processes started by this Cortex instance can be terminated.",
        pid
    ))
}

    let current_pid = std::process::id();
    let system = System::new_all();
    let target_pid = Pid::from_u32(pid);

    if system.process(target_pid).is_none() {
        return Err(format!("Process not found: {}", pid));
    }

    validate_managed_process_termination(pid, current_pid, |candidate_pid| {
        system
            .process(Pid::from_u32(candidate_pid))
            .and_then(|process| process.parent())
            .map(|parent| parent.as_u32())
    })?;
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
}

/// Terminate a Cortex-managed process
#[command]
pub async fn terminate_cortex_process(pid: u32, force: bool) -> Result<(), String> {
    info!("[Process] Terminating process {} (force: {})", pid, force);

    #[cfg(unix)]
    {
        let signal = if force { "SIGKILL" } else { "SIGTERM" };
        let _ = signal; // suppress unused warning
        let result = crate::process_utils::command("kill")
            .args([if force { "-9" } else { "-15" }, &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to execute kill command: {}", e))?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            return Err(format!("Failed to terminate process {}: {}", pid, stderr));
        }
    }

    #[cfg(windows)]
    {
        let result = if force {
            crate::process_utils::command("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output()
        } else {
            crate::process_utils::command("taskkill")
                .args(["/PID", &pid.to_string()])
                .output()
        };

        match result {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Failed to terminate process {}: {}", pid, stderr));
                }
            }
            Err(e) => return Err(format!("Failed to execute taskkill: {}", e)),
        }
    }

    info!("[Process] Successfully terminated process {}", pid);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::validate_managed_process_termination;

    #[test]
    fn allows_descendant_processes() {
        let parents = HashMap::from([(200_u32, Some(150_u32)), (150, Some(100))]);

        let result = validate_managed_process_termination(200, 100, |pid| {
            parents.get(&pid).copied().flatten()
        });

        assert!(result.is_ok());
    }

    #[test]
    fn rejects_unmanaged_processes() {
        let parents = HashMap::from([(200_u32, Some(150_u32)), (150, Some(50))]);

        let result = validate_managed_process_termination(200, 100, |pid| {
            parents.get(&pid).copied().flatten()
        });

        assert!(result.is_err());
    }

    #[test]
    fn rejects_current_process() {
        let result = validate_managed_process_termination(100, 100, |_| None);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_cyclic_parent_graphs() {
        let parents = HashMap::from([(200_u32, Some(150_u32)), (150, Some(200))]);

        let result = validate_managed_process_termination(200, 100, |pid| {
            parents.get(&pid).copied().flatten()
        });

        assert!(result.is_err());
    }
}

    info!("[Process] Successfully terminated process {}", pid);
    Ok(())
}