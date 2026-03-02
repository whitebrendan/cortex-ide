//! File System Commands — Unified IPC commands for file operations.
//!
//! This module provides additional Tauri commands that complement the
//! existing `fs` module. It adds:
//! - `read_file` — returns `FileContent` with encoding detection
//! - `delete_entry` — unified delete for files and directories
//!
//! The bulk of file system operations (`fs_read_file`, `fs_write_file`,
//! `fs_create_file`, `fs_create_directory`, `fs_rename`, `fs_get_metadata`,
//! `fs_watch_directory`, etc.) are defined in the `fs` module and registered
//! via `workspace_commands!`.

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tracing::{debug, info};

use crate::fs::security::{validate_path_for_delete, validate_path_for_read};
use crate::fs::types::{
    DirectoryCache, ENCODING_SAMPLE_SIZE, FileContentCache, MAX_CACHEABLE_FILE_SIZE,
    MAX_TEXT_FILE_SIZE, MMAP_THRESHOLD,
};
use crate::models::FileContent;

/// Read a file and return its content with encoding metadata.
///
/// Uses `chardetng` + `encoding_rs` to detect the file encoding and decode
/// the content accordingly. Returns a `FileContent` struct containing the
/// decoded text, detected encoding name, file size, and path.
/// Results for files ≤ `MAX_CACHEABLE_FILE_SIZE` are cached in-memory.
#[tauri::command]
pub async fn read_file(app: AppHandle, path: String) -> Result<FileContent, String> {
    let start = std::time::Instant::now();
    let file_path = PathBuf::from(&path);
    let validated_path = validate_path_for_read(&file_path)?;

    if !validated_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    if !validated_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    let metadata = tokio::fs::metadata(&validated_path)
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let size = metadata.len();

    if size > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "File is too large to open ({:.1} MB, limit {:.0} MB): {}",
            size as f64 / (1024.0 * 1024.0),
            MAX_TEXT_FILE_SIZE as f64 / (1024.0 * 1024.0),
            path
        ));
    }

    let mtime = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Check content cache first
    let content_cache = app.state::<Arc<FileContentCache>>();
    if let Some(cached) = content_cache.get(&path, mtime) {
        debug!(
            "read_file cache hit: {} ({:.1} KB, {:.1}ms)",
            path,
            size as f64 / 1024.0,
            start.elapsed().as_secs_f64() * 1000.0
        );
        // For cached content, detect encoding from the cached string
        // (it was already decoded, so it's effectively UTF-8)
        return Ok(FileContent {
            content: cached,
            encoding: "UTF-8".to_string(),
            size,
            path,
        });
    }

    // Read the file — use mmap for large files, tokio::fs for small ones
    let bytes = if size >= MMAP_THRESHOLD {
        let p = validated_path.clone();
        tokio::task::spawn_blocking(move || {
            let file =
                std::fs::File::open(&p).map_err(|e| format!("Failed to open file: {}", e))?;
            #[allow(unsafe_code)]
            let mmap = unsafe {
                memmap2::Mmap::map(&file).map_err(|e| format!("Failed to mmap file: {}", e))?
            };
            Ok::<Vec<u8>, String>(mmap.to_vec())
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??
    } else {
        tokio::fs::read(&validated_path)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?
    };

    // Detect encoding via BOM first, then chardetng (using sample for detection)
    let (encoding, content) = if let Some((enc, _bom_len)) = encoding_rs::Encoding::for_bom(&bytes)
    {
        let (decoded, _, _) = enc.decode(&bytes);
        (enc.name().to_string(), decoded.into_owned())
    } else {
        let sample_len = bytes.len().min(ENCODING_SAMPLE_SIZE);
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(&bytes[..sample_len], bytes.len() <= ENCODING_SAMPLE_SIZE);
        let enc = detector.guess(None, true);
        let (decoded, _, _) = enc.decode(&bytes);
        (enc.name().to_string(), decoded.into_owned())
    };

    // Cache the decoded content if within cacheable size
    if size <= MAX_CACHEABLE_FILE_SIZE {
        content_cache.insert(path.clone(), content.clone(), mtime);
    }

    debug!(
        "read_file read: {} ({:.1} KB, mmap={}, {:.1}ms)",
        path,
        size as f64 / 1024.0,
        size >= MMAP_THRESHOLD,
        start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(FileContent {
        content,
        encoding,
        size,
        path,
    })
}

/// Delete a file or directory at the given path.
///
/// For directories, performs a recursive delete. Invalidates the directory
/// cache for the parent path and (for directories) any cached subtrees.
#[tauri::command]
pub async fn delete_entry(app: AppHandle, path: String) -> Result<(), String> {
    let entry_path = PathBuf::from(&path);
    let validated_path = validate_path_for_delete(&entry_path)?;

    if !validated_path.exists() {
        return Ok(());
    }

    let cache = app.state::<Arc<DirectoryCache>>();
    let content_cache = app.state::<Arc<FileContentCache>>();

    if let Some(parent) = validated_path.parent() {
        cache.invalidate_dir(&parent.to_string_lossy());
    }

    if validated_path.is_dir() {
        cache.invalidate_prefix(&path);
        content_cache.invalidate_prefix(&path);
        tokio::fs::remove_dir_all(&validated_path)
            .await
            .map_err(|e| format!("Failed to delete directory: {}", e))?;
        info!("Deleted directory: {}", path);
    } else {
        content_cache.invalidate(&path);
        tokio::fs::remove_file(&validated_path)
            .await
            .map_err(|e| format!("Failed to delete file: {}", e))?;
        info!("Deleted file: {}", path);
    }

    Ok(())
}
