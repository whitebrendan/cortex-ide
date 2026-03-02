//! File Operations - Core file read/write/delete operations
//!
//! This module contains all file CRUD operations as Tauri commands,
//! including reading, writing, copying, moving, and deleting files.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::fs;
use tracing::{debug, info};

use crate::fs::security::{
    validate_path_for_delete, validate_path_for_read, validate_path_for_write,
};
use crate::fs::types::{
    DirectoryCache, FileContentCache, MAX_BINARY_FILE_SIZE, MAX_CACHEABLE_FILE_SIZE,
    MAX_TEXT_FILE_SIZE, MMAP_THRESHOLD,
};

// ============================================================================
// File Read Operations
// ============================================================================

/// Read a file as text using memory-mapped I/O for large files.
///
/// For files above `MMAP_THRESHOLD` (1 MB), uses `memmap2` for zero-copy
/// read access. Smaller files use regular `tokio::fs` async reads.
/// Results for files ≤ `MAX_CACHEABLE_FILE_SIZE` are cached in-memory.
#[tauri::command]
pub async fn fs_read_file(app: AppHandle, path: String) -> Result<String, String> {
    let start = std::time::Instant::now();
    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_read(&file_path)?;

    if !validated_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    if !validated_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    let metadata = fs::metadata(&validated_path)
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let file_size = metadata.len();
    if file_size > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "File is too large to open as text ({:.1} MB, limit {:.0} MB): {}",
            file_size as f64 / (1024.0 * 1024.0),
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
            "fs_read_file cache hit: {} ({:.1} KB, {:.1}ms)",
            path,
            file_size as f64 / 1024.0,
            start.elapsed().as_secs_f64() * 1000.0
        );
        return Ok(cached);
    }

    // Read the file — use mmap for large files, tokio::fs for small ones
    let content = if file_size >= MMAP_THRESHOLD {
        read_file_mmap(&validated_path).await?
    } else {
        read_file_async(&validated_path).await?
    };

    // Cache the result if within cacheable size
    if file_size <= MAX_CACHEABLE_FILE_SIZE {
        content_cache.insert(path.clone(), content.clone(), mtime);
    }

    debug!(
        "fs_read_file read: {} ({:.1} KB, mmap={}, {:.1}ms)",
        path,
        file_size as f64 / 1024.0,
        file_size >= MMAP_THRESHOLD,
        start.elapsed().as_secs_f64() * 1000.0
    );

    Ok(content)
}

/// Read a file as UTF-8 text using async I/O, with lossy fallback.
async fn read_file_async(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path).await {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
            let bytes = fs::read(path)
                .await
                .map_err(|e| format!("Failed to read file: {}", e))?;
            Ok(String::from_utf8_lossy(&bytes).into_owned())
        }
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

/// Read a file using memory-mapped I/O for efficient large file access.
///
/// Uses `memmap2::Mmap` for zero-copy read access. The mmap syscall and
/// string conversion are done inside `spawn_blocking` to avoid blocking
/// the async runtime.
async fn read_file_mmap(path: &Path) -> Result<String, String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
        // SAFETY: memmap2::Mmap is safe for read-only access as long as no other
        // process truncates the file while mapped. We accept this risk for
        // performance — the worst case is a SIGBUS which Tauri handles gracefully.
        #[allow(unsafe_code)]
        let mmap = unsafe {
            memmap2::Mmap::map(&file).map_err(|e| format!("Failed to mmap file: {}", e))?
        };
        match std::str::from_utf8(&mmap) {
            Ok(s) => Ok(s.to_string()),
            Err(_) => Ok(String::from_utf8_lossy(&mmap).into_owned()),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn fs_read_file_binary(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_read(&file_path)?;

    if !validated_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    let metadata = fs::metadata(&validated_path)
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_BINARY_FILE_SIZE {
        return Err(format!(
            "File is too large to read ({:.1} MB, limit {:.0} MB): {}",
            metadata.len() as f64 / (1024.0 * 1024.0),
            MAX_BINARY_FILE_SIZE as f64 / (1024.0 * 1024.0),
            path
        ));
    }

    let bytes = fs::read(&validated_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    use base64::{Engine, engine::general_purpose::STANDARD};
    Ok(STANDARD.encode(bytes))
}

// ============================================================================
// File Write Operations
// ============================================================================

#[tauri::command]
pub async fn fs_write_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_write(&file_path)?;

    if let Some(parent) = validated_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let cache = app.state::<Arc<DirectoryCache>>();
        cache.invalidate(&parent.to_string_lossy());
    }

    // Invalidate content cache before writing
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&path);

    fs::write(&validated_path, content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    info!("Wrote file: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn fs_write_file_binary(
    app: AppHandle,
    path: String,
    content: String,
) -> Result<(), String> {
    use base64::{Engine, engine::general_purpose::STANDARD};

    let bytes = STANDARD
        .decode(&content)
        .map_err(|e| format!("Invalid base64 content: {}", e))?;

    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_write(&file_path)?;

    if let Some(parent) = validated_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let cache = app.state::<Arc<DirectoryCache>>();
        cache.invalidate(&parent.to_string_lossy());
    }

    // Invalidate content cache before writing
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&path);

    fs::write(&validated_path, bytes)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    info!("Wrote binary file: {}", path);
    Ok(())
}

// ============================================================================
// File Create/Delete Operations
// ============================================================================

#[tauri::command]
pub async fn fs_delete_file(app: AppHandle, path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_delete(&file_path)?;

    if !validated_path.exists() {
        return Ok(());
    }

    if !validated_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    if let Some(parent) = validated_path.parent() {
        let cache = app.state::<Arc<DirectoryCache>>();
        cache.invalidate(&parent.to_string_lossy());
    }

    // Invalidate content cache
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&path);

    fs::remove_file(&validated_path)
        .await
        .map_err(|e| format!("Failed to delete file: {}", e))?;

    info!("Deleted file: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn fs_create_file(app: AppHandle, path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_write(&file_path)?;

    if validated_path.exists() {
        return Err(format!("File already exists: {}", path));
    }

    if let Some(parent) = validated_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let cache = app.state::<Arc<DirectoryCache>>();
        cache.invalidate(&parent.to_string_lossy());
    }

    fs::write(&validated_path, "")
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    info!("Created file: {}", path);
    Ok(())
}

// ============================================================================
// File Copy/Move/Rename Operations
// ============================================================================

#[tauri::command]
pub async fn fs_rename(app: AppHandle, old_path: String, new_path: String) -> Result<(), String> {
    let from = PathBuf::from(&old_path);
    let to = PathBuf::from(&new_path);

    // Validate paths to prevent traversal attacks
    let validated_from = validate_path_for_write(&from)?;
    let validated_to = validate_path_for_write(&to)?;

    if !validated_from.exists() {
        return Err(format!("Source does not exist: {}", old_path));
    }

    if validated_to.exists() {
        return Err(format!("Destination already exists: {}", new_path));
    }

    if let Some(parent) = validated_to.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    let cache = app.state::<Arc<DirectoryCache>>();
    if let Some(parent) = validated_from.parent() {
        cache.invalidate(&parent.to_string_lossy());
    }
    if let Some(parent) = validated_to.parent() {
        cache.invalidate(&parent.to_string_lossy());
    }
    cache.invalidate_prefix(&old_path);

    // Invalidate content cache for the old path
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&old_path);

    fs::rename(&validated_from, &validated_to)
        .await
        .map_err(|e| format!("Failed to rename: {}", e))?;

    info!("Renamed {} to {}", old_path, new_path);
    Ok(())
}

#[tauri::command]
pub async fn fs_copy_file(
    app: AppHandle,
    source: String,
    destination: String,
) -> Result<(), String> {
    let from = PathBuf::from(&source);
    let to = PathBuf::from(&destination);

    // Validate paths to prevent traversal attacks
    let validated_from = validate_path_for_read(&from)?;
    let validated_to = validate_path_for_write(&to)?;

    if !validated_from.exists() {
        return Err(format!("Source file does not exist: {}", source));
    }

    if !validated_from.is_file() {
        return Err(format!("Source is not a file: {}", source));
    }

    if let Some(parent) = validated_to.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        let cache = app.state::<Arc<DirectoryCache>>();
        cache.invalidate(&parent.to_string_lossy());
    }

    fs::copy(&validated_from, &validated_to)
        .await
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    info!("Copied {} to {}", source, destination);
    Ok(())
}

#[tauri::command]
pub async fn fs_move(app: AppHandle, source: String, destination: String) -> Result<(), String> {
    let from = PathBuf::from(&source);
    let to = PathBuf::from(&destination);

    // Validate paths to prevent traversal attacks
    let validated_from = validate_path_for_delete(&from)?;
    let validated_to = validate_path_for_write(&to)?;

    if !validated_from.exists() {
        return Err(format!("Source does not exist: {}", source));
    }

    if validated_to.exists() {
        return Err(format!("Destination already exists: {}", destination));
    }

    if let Some(parent) = validated_to.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    let cache = app.state::<Arc<DirectoryCache>>();
    if let Some(parent) = validated_from.parent() {
        cache.invalidate(&parent.to_string_lossy());
    }
    if let Some(parent) = validated_to.parent() {
        cache.invalidate(&parent.to_string_lossy());
    }
    cache.invalidate_prefix(&source);

    // Invalidate content cache for the source path
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&source);
    content_cache.invalidate_prefix(&source);

    match fs::rename(&validated_from, &validated_to).await {
        Ok(_) => {}
        Err(_) => {
            if validated_from.is_file() {
                fs::copy(&validated_from, &validated_to)
                    .await
                    .map_err(|e| format!("Failed to copy file: {}", e))?;
                fs::remove_file(&validated_from)
                    .await
                    .map_err(|e| format!("Failed to remove source: {}", e))?;
            } else {
                copy_dir_recursive(&validated_from, &validated_to).await?;
                fs::remove_dir_all(&validated_from)
                    .await
                    .map_err(|e| format!("Failed to remove source directory: {}", e))?;
            }
        }
    }

    info!("Moved {} to {}", source, destination);
    Ok(())
}

/// Recursively copy a directory, skipping symlinks to prevent infinite loops
pub async fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let mut entries = fs::read_dir(src)
        .await
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to read entry: {}", e))?
    {
        let entry_path = entry.path();
        let dest_path = dst.join(entry.file_name());

        let file_type = entry
            .file_type()
            .await
            .map_err(|e| format!("Failed to get file type: {}", e))?;

        if file_type.is_symlink() {
            tracing::warn!("Skipping symlink during copy: {}", entry_path.display());
            continue;
        }

        if file_type.is_dir() {
            Box::pin(copy_dir_recursive(&entry_path, &dest_path)).await?;
        } else if file_type.is_file() {
            fs::copy(&entry_path, &dest_path)
                .await
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
        // Skip special files (sockets, pipes, device files)
    }

    Ok(())
}

// ============================================================================
// Trash Operations
// ============================================================================

#[tauri::command]
pub async fn fs_trash(app: AppHandle, path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Validate path to prevent traversal attacks
    let validated_path = validate_path_for_delete(&file_path)?;

    if !validated_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let cache = app.state::<Arc<DirectoryCache>>();
    if let Some(parent) = validated_path.parent() {
        cache.invalidate(&parent.to_string_lossy());
    }
    if validated_path.is_dir() {
        cache.invalidate_prefix(&path);
    }

    // Invalidate content cache
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&path);
    if validated_path.is_dir() {
        content_cache.invalidate_prefix(&path);
    }

    trash::delete(&validated_path).map_err(|e| format!("Failed to trash: {}", e))?;

    info!("Trashed: {}", path);
    Ok(())
}

// ============================================================================
// Shell/Explorer Operations
// ============================================================================

#[tauri::command]
pub async fn fs_reveal_in_explorer(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        crate::process_utils::command("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        crate::process_utils::command("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = file_path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        crate::process_utils::command("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    info!("Revealed in explorer: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn fs_open_with_default(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    info!("Opened with default app: {}", path);
    Ok(())
}

/// Open a path with the system shell or default application
/// This is an alias for fs_open_with_default for terminal link compatibility
#[tauri::command]
pub async fn shell_open(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open: {}", e))?;
    info!("Shell opened: {}", path);
    Ok(())
}
