//! Git repository watcher

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tracing::{info, warn};

/// Registry of active git watchers so they can be stopped.
static GIT_WATCHERS: std::sync::LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

// ============================================================================
// Repository Watcher
// ============================================================================

/// Watch a git repository's .git directory for changes
/// Emits "git:repository-changed" events when changes are detected
#[tauri::command]
pub async fn git_watch_repository(
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let watch_id = format!(
        "watch-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let git_dir = std::path::Path::new(&path).join(".git");

    if !git_dir.exists() {
        return Err("Not a git repository: .git directory not found".to_string());
    }

    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();

    {
        let mut watchers = GIT_WATCHERS
            .lock()
            .map_err(|e| format!("Failed to acquire watcher lock: {}", e))?;
        watchers.insert(watch_id.clone(), running);
    }

    let watch_id_clone = watch_id.clone();
    let path_clone = path.clone();

    // Spawn watcher in background thread
    let wid_for_log = watch_id.clone();
    std::thread::spawn(move || {
        if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        let mut last_emit = std::time::Instant::now();
        let debounce_duration = Duration::from_millis(500);

        // Simple polling-based watcher for .git directory
        // Check for modifications every 500ms
        while running_clone.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(500));

            // Check if HEAD, index, or refs changed
            let head_path = git_dir.join("HEAD");
            let index_path = git_dir.join("index");

            let should_emit = if let (Ok(head_meta), Ok(index_meta)) = (
                std::fs::metadata(&head_path),
                std::fs::metadata(&index_path),
            ) {
                // Check if modified recently (within last second)
                if let (Ok(head_modified), Ok(index_modified)) =
                    (head_meta.modified(), index_meta.modified())
                {
                    let now = std::time::SystemTime::now();
                    let one_sec = Duration::from_secs(1);

                    now.duration_since(head_modified)
                        .map(|d| d < one_sec)
                        .unwrap_or(false)
                        || now
                            .duration_since(index_modified)
                            .map(|d| d < one_sec)
                            .unwrap_or(false)
                } else {
                    false
                }
            } else {
                false
            };

            if should_emit && last_emit.elapsed() > debounce_duration {
                if let Err(e) = app_handle.emit("git:repository-changed", &path_clone) {
                    warn!("Failed to emit git:repository-changed event: {}", e);
                }
                last_emit = std::time::Instant::now();
            }
        }

        info!("Git watcher {} stopped", watch_id_clone);
        })) {
            warn!("Git watcher {} panicked: {:?}", wid_for_log, e);
        }
    });

    info!("Started git watcher {} for {}", watch_id.clone(), path);
    Ok(watch_id)
}

/// Stop a git repository watcher by its watch ID
#[tauri::command]
pub async fn git_unwatch_repository(watch_id: String) -> Result<(), String> {
    let mut watchers = GIT_WATCHERS
        .lock()
        .map_err(|e| format!("Failed to acquire watcher lock: {}", e))?;

    if let Some(running) = watchers.remove(&watch_id) {
        running.store(false, Ordering::Relaxed);
        info!("Stopping git watcher {}", watch_id);
        Ok(())
    } else {
        Err(format!("Git watcher '{}' not found", watch_id))
    }
}

/// Stop all git watchers (called on app exit)
pub fn stop_all_git_watchers() {
    if let Ok(mut watchers) = GIT_WATCHERS.lock() {
        for (id, running) in watchers.drain() {
            running.store(false, Ordering::Relaxed);
            info!("Stopping git watcher {} on shutdown", id);
        }
    }
}
