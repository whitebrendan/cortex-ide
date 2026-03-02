//! Settings file storage and persistence
//!
//! This module handles the file system operations for settings:
//! - Path management (settings directory and file locations)
//! - Loading settings from disk
//! - Saving settings to disk
//! - File permissions management

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::AppHandle;
use tracing::{info, warn};

use super::secure_store::SecureApiKeyStore;
use super::types::CortexSettings;

/// State wrapper for settings
#[derive(Clone)]
pub struct SettingsState(pub Arc<Mutex<CortexSettings>>);

impl SettingsState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(CortexSettings::default())))
    }
}

impl SettingsState {
    pub fn flush(&self) {
        let settings = match self.0.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => {
                warn!("Failed to acquire settings lock for flush");
                return;
            }
        };
        if let Ok(path) = get_settings_path() {
            if let Err(e) = ensure_settings_dir() {
                warn!("Failed to ensure settings dir on flush: {}", e);
                return;
            }
            match serde_json::to_string_pretty(&settings) {
                Ok(content) => {
                    if let Err(e) = std::fs::write(&path, content) {
                        warn!("Failed to write settings on flush: {}", e);
                    } else {
                        let _ = set_file_permissions(&path);
                        info!("Settings flushed to disk");
                    }
                }
                Err(e) => {
                    warn!("Failed to serialize settings on flush: {}", e);
                }
            }
        }
    }
}

impl Default for SettingsState {
    fn default() -> Self {
        Self::new()
    }
}

/// Get the settings file path
pub fn get_settings_path() -> Result<PathBuf, String> {
    let app_data = dirs::data_dir().ok_or("Could not find app data directory")?;
    let cortex_dir = app_data.join("Cortex");
    Ok(cortex_dir.join("settings.json"))
}

/// Ensure the settings directory exists
pub fn ensure_settings_dir() -> Result<PathBuf, String> {
    let app_data = dirs::data_dir().ok_or("Could not find app data directory")?;
    let cortex_dir = app_data.join("Cortex");

    if !cortex_dir.exists() {
        fs::create_dir_all(&cortex_dir)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }

    Ok(cortex_dir)
}

/// Set restrictive file permissions (0600 on Unix)
pub fn set_file_permissions(path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }

    #[cfg(not(unix))]
    {
        let _ = path; // Suppress unused warning on Windows
    }

    Ok(())
}

/// Create a backup of a corrupted settings file so users can recover manually.
///
/// The backup is written to `settings.json.bak` next to the original file.
pub fn create_backup(path: &PathBuf) -> Result<PathBuf, String> {
    let backup_path = path.with_extension("json.bak");
    fs::copy(path, &backup_path).map_err(|e| format!("Failed to create settings backup: {}", e))?;
    Ok(backup_path)
}

/// Attempt to recover a settings JSON string that has minor syntax issues.
///
/// Strips single-line comments (`//`), block comments (`/* */`), and trailing
/// commas before arrays/object closing brackets — the same issues the frontend
/// `parseSettingsJSON` handles.  Returns `None` if recovery still fails.
pub fn try_recover_json(content: &str) -> Option<CortexSettings> {
    // 1. Strip single-line comments
    let mut cleaned = String::with_capacity(content.len());
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") {
            cleaned.push('\n');
        } else {
            cleaned.push_str(line);
            cleaned.push('\n');
        }
    }

    // 2. Strip block comments (non-greedy)
    while let (Some(start), Some(end)) = (cleaned.find("/*"), cleaned.find("*/")) {
        if end > start {
            cleaned.replace_range(start..end + 2, "");
        } else {
            break;
        }
    }

    // 3. Remove trailing commas before } or ]
    let re_trailing = regex::Regex::new(r",\s*([}\]])").ok()?;
    let cleaned = re_trailing.replace_all(&cleaned, "$1");

    serde_json::from_str::<CortexSettings>(&cleaned).ok()
}

/// Finalize loaded settings: run migration, validate fields, and sync keyring flags.
fn finalize_loaded_settings(settings: &mut CortexSettings) {
    settings.migrate();
    settings.validate_fields();

    // Update API key presence flags from keyring
    settings.ai.has_supermaven_api_key =
        SecureApiKeyStore::has_api_key("supermaven_api_key").unwrap_or(false);
    settings.http.has_proxy_authorization =
        SecureApiKeyStore::has_api_key("proxy_authorization").unwrap_or(false);
}

/// Load settings from disk (internal async helper)
pub async fn load_settings_from_disk() -> Result<CortexSettings, String> {
    let settings_path = get_settings_path()?;

    if settings_path.exists() {
        let content = tokio::fs::read_to_string(&settings_path)
            .await
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        match serde_json::from_str::<CortexSettings>(&content) {
            Ok(mut loaded) => {
                finalize_loaded_settings(&mut loaded);
                Ok(loaded)
            }
            Err(e) => {
                warn!("Failed to parse settings file: {}", e);

                // Try recovering from common JSON issues (comments, trailing commas)
                if let Some(mut recovered) = try_recover_json(&content) {
                    info!("Recovered settings after stripping comments/trailing commas");
                    finalize_loaded_settings(&mut recovered);
                    return Ok(recovered);
                }

                // Recovery failed — back up the corrupted file so the user can inspect it
                match create_backup(&settings_path) {
                    Ok(backup_path) => {
                        warn!(
                            "Corrupted settings backed up to {:?}, using defaults",
                            backup_path
                        );
                    }
                    Err(backup_err) => {
                        warn!("Could not back up corrupted settings: {}", backup_err);
                    }
                }

                Ok(CortexSettings::default())
            }
        }
    } else {
        info!("No settings file found, using defaults");
        Ok(CortexSettings::default())
    }
}

/// Preload settings at startup (called from lib.rs setup)
pub async fn preload_settings(app: &AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let t = std::time::Instant::now();
    let settings_state = app.state::<SettingsState>();
    let settings = load_settings_from_disk().await?;

    if let Ok(mut guard) = settings_state.0.lock() {
        *guard = settings;
    }

    info!(
        target: "startup",
        elapsed_ms = format_args!("{:.1}", t.elapsed().as_secs_f64() * 1000.0),
        "Settings preloaded from disk"
    );
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn get_settings_path_ends_with_settings_json() {
        let path = get_settings_path().unwrap();
        assert!(path.ends_with("settings.json"));
    }

    #[test]
    fn get_settings_path_contains_cortex() {
        let path = get_settings_path().unwrap();
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("Cortex"));
    }

    #[test]
    fn ensure_settings_dir_creates_directory() {
        let dir = ensure_settings_dir().unwrap();
        assert!(dir.exists());
        assert!(dir.is_dir());
        assert!(dir.to_string_lossy().contains("Cortex"));
    }

    #[test]
    fn ensure_settings_dir_idempotent() {
        let dir1 = ensure_settings_dir().unwrap();
        let dir2 = ensure_settings_dir().unwrap();
        assert_eq!(dir1, dir2);
    }

    #[test]
    fn settings_state_new_creates_default() {
        let state = SettingsState::new();
        let guard = state.0.lock().unwrap();
        assert_eq!(guard.version, crate::settings::SETTINGS_VERSION);
    }

    #[test]
    fn settings_state_default_matches_new() {
        let state = SettingsState::default();
        let guard = state.0.lock().unwrap();
        assert_eq!(guard.version, crate::settings::SETTINGS_VERSION);
    }

    #[test]
    fn settings_state_mutex_is_lockable() {
        let state = SettingsState::new();
        let guard = state.0.lock();
        assert!(guard.is_ok());
    }

    #[test]
    fn settings_state_clone() {
        let state = SettingsState::new();
        let cloned = state.clone();
        let guard = cloned.0.lock().unwrap();
        assert_eq!(guard.version, crate::settings::SETTINGS_VERSION);
    }

    #[test]
    fn set_file_permissions_on_temp_file() {
        let dir = std::env::temp_dir();
        let path = dir.join("cortex_test_perms.tmp");
        fs::write(&path, "test").unwrap();
        let result = set_file_permissions(&path);
        assert!(result.is_ok());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn try_recover_json_trailing_comma() {
        let input = r#"{"version": 2, "vimEnabled": false,}"#;
        let result = try_recover_json(input);
        assert!(result.is_some());
        assert_eq!(result.unwrap().version, 2);
    }

    #[test]
    fn try_recover_json_line_comments() {
        let input = r#"{
            // This is a comment
            "version": 2,
            "vimEnabled": false
        }"#;
        let result = try_recover_json(input);
        assert!(result.is_some());
    }

    #[test]
    fn try_recover_json_block_comments() {
        let input = r#"{
            /* block comment */
            "version": 2,
            "vimEnabled": false
        }"#;
        let result = try_recover_json(input);
        assert!(result.is_some());
    }

    #[test]
    fn try_recover_json_truly_invalid() {
        let input = "this is not json at all {{{";
        let result = try_recover_json(input);
        assert!(result.is_none());
    }

    #[test]
    fn create_backup_creates_file() {
        let dir = std::env::temp_dir();
        let path = dir.join("cortex_test_backup.json");
        fs::write(&path, r#"{"broken":}"#).unwrap();

        let backup_path = create_backup(&path).unwrap();
        assert!(backup_path.exists());
        assert_eq!(fs::read_to_string(&backup_path).unwrap(), r#"{"broken":}"#);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&backup_path);
    }
}
