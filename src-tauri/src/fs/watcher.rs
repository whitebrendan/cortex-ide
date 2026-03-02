//! File System Watcher - File change monitoring
//!
//! This module provides file system watching capabilities using the notify crate,
//! with debouncing and deduplication support.

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{error, info, warn};

use crate::fs::delta::FileTreeDelta;
use crate::fs::types::{DirectoryCache, FileChangeEvent, FileWatcherState};
use crate::fs::utils::matches_exclude_pattern;

// ============================================================================
// File Watcher Commands
// ============================================================================

#[tauri::command]
pub async fn fs_watch_directory(
    app: AppHandle,
    path: String,
    watch_id: String,
    exclude_patterns: Option<Vec<String>>,
) -> Result<(), String> {
    let watcher_state = app.state::<Arc<FileWatcherState>>();
    let dir_path = PathBuf::from(&path);

    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    let normalized_path = match dir_path.canonicalize() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(e) => {
            warn!(
                "Failed to canonicalize watch path '{}', using as-is: {}",
                path, e
            );
            dir_path.to_string_lossy().to_string()
        }
    };

    {
        let watchers = watcher_state.watchers.lock();
        if watchers.contains_key(&watch_id) {
            return Ok(());
        }
    }

    watcher_state.register_watch(&normalized_path, &watch_id);

    // Get exclude patterns, defaulting to empty if not provided
    let exclude = exclude_patterns.unwrap_or_default();

    let already_has_watcher = {
        let watchers = watcher_state.watchers.lock();
        watchers.keys().any(|existing_id| existing_id != &watch_id)
            && watcher_state.get_watch_ids(&normalized_path).len() > 1
    };

    if !already_has_watcher || watcher_state.get_watch_ids(&normalized_path).len() == 1 {
        let app_clone = app.clone();
        let watcher_state_clone = Arc::clone(&watcher_state);
        let normalized_path_clone = normalized_path.clone();
        let cache = app.state::<Arc<DirectoryCache>>();
        let cache_clone = Arc::clone(cache.inner());
        let exclude_clone = exclude.clone();

        let mut watcher = RecommendedWatcher::new(
            move |result: Result<notify::Event, notify::Error>| match result {
                Ok(event) => {
                    if matches!(event.kind, notify::EventKind::Access(_)) {
                        return;
                    }

                    // Check if any event path matches exclude patterns
                    let should_exclude = event
                        .paths
                        .iter()
                        .any(|p| matches_exclude_pattern(p, &exclude_clone));

                    if should_exclude {
                        return;
                    }

                    let event_type = match event.kind {
                        notify::EventKind::Create(_) => "create",
                        notify::EventKind::Modify(_) => "modify",
                        notify::EventKind::Remove(_) => "remove",
                        notify::EventKind::Any => "any",
                        notify::EventKind::Other => "other",
                        _ => return,
                    };

                    let first_path = event
                        .paths
                        .first()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();

                    if !watcher_state_clone.should_emit(&first_path) {
                        return;
                    }

                    let mut affected_dirs = Vec::new();
                    for event_path in &event.paths {
                        if let Some(parent) = event_path.parent() {
                            let parent_str = parent.to_string_lossy().to_string();
                            cache_clone.invalidate_dir(&parent_str);
                            if !affected_dirs.contains(&parent_str) {
                                affected_dirs.push(parent_str);
                            }
                        }
                    }

                    let paths: Vec<String> = event
                        .paths
                        .iter()
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();

                    let mut delta = FileTreeDelta {
                        added: Vec::new(),
                        removed: Vec::new(),
                        modified: Vec::new(),
                        affected_dirs,
                        watch_id: String::new(),
                    };

                    match event_type {
                        "create" => delta.added = paths.clone(),
                        "remove" => delta.removed = paths.clone(),
                        "modify" => delta.modified = paths.clone(),
                        _ => {}
                    }

                    let watch_ids = watcher_state_clone.get_watch_ids(&normalized_path_clone);

                    for wid in &watch_ids {
                        let change_event = FileChangeEvent {
                            event_type: event_type.to_string(),
                            paths: paths.clone(),
                            watch_id: wid.clone(),
                        };

                        if let Err(e) = app_clone.emit("fs:change", &change_event) {
                            error!("Failed to emit fs:change event: {}", e);
                        }

                        let mut wid_delta = delta.clone();
                        wid_delta.watch_id = wid.clone();
                        if let Err(e) = app_clone.emit("fs:tree-delta", &wid_delta) {
                            error!("Failed to emit fs:tree-delta event: {}", e);
                        }
                    }
                }
                Err(e) => {
                    warn!("Watch error (non-fatal): {}", e);
                }
            },
            Config::default()
                .with_poll_interval(Duration::from_secs(2))
                .with_compare_contents(false),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(&dir_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to start watching: {}", e))?;

        watcher_state
            .watchers
            .lock()
            .insert(watch_id.clone(), watcher);
        info!(
            "Started watching: {} (id: {}) with {} exclude patterns",
            path,
            watch_id,
            exclude.len()
        );
    } else {
        info!("Reusing existing watcher for: {} (id: {})", path, watch_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn fs_unwatch_directory(
    app: AppHandle,
    watch_id: String,
    path: Option<String>,
) -> Result<(), String> {
    let watcher_state = app.state::<Arc<FileWatcherState>>();

    if let Some(p) = &path {
        let normalized = match PathBuf::from(p).canonicalize() {
            Ok(canon) => canon.to_string_lossy().to_string(),
            Err(e) => {
                warn!(
                    "Failed to canonicalize unwatch path '{}', using as-is: {}",
                    p, e
                );
                p.clone()
            }
        };
        watcher_state.unregister_watch(&normalized, &watch_id);
    }

    if watcher_state.watchers.lock().remove(&watch_id).is_some() {
        info!("Stopped watching: {}", watch_id);
    }

    watcher_state.cleanup_debounce();

    Ok(())
}
