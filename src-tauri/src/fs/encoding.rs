//! File Encoding - Encoding detection and conversion
//!
//! This module provides file encoding detection, line ending detection,
//! and conversion utilities.

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

use crate::fs::types::{
    DirectoryCache, ENCODING_SAMPLE_SIZE, FileContentCache, MAX_TEXT_FILE_SIZE,
};

// ============================================================================
// Line Ending Detection and Conversion
// ============================================================================

/// Detect the line ending style of a file
#[tauri::command]
pub async fn fs_detect_eol(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let metadata =
            std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
        if metadata.len() > MAX_TEXT_FILE_SIZE {
            return Err(format!(
                "File is too large for EOL detection ({:.1} MB, limit {:.0} MB)",
                metadata.len() as f64 / (1024.0 * 1024.0),
                MAX_TEXT_FILE_SIZE as f64 / (1024.0 * 1024.0),
            ));
        }
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file '{path}' for EOL detection: {e}"))?;

        // Count different line ending types
        let crlf_count = content.matches("\r\n").count();
        // LF count is total \n minus the ones that are part of \r\n
        let lf_count = content.matches('\n').count().saturating_sub(crlf_count);
        // CR count is total \r minus the ones that are part of \r\n
        let cr_count = content.matches('\r').count().saturating_sub(crlf_count);

        let eol = if crlf_count > 0 && lf_count == 0 && cr_count == 0 {
            "CRLF"
        } else if lf_count > 0 && crlf_count == 0 && cr_count == 0 {
            "LF"
        } else if cr_count > 0 && crlf_count == 0 && lf_count == 0 {
            "CR"
        } else if crlf_count == 0 && lf_count == 0 && cr_count == 0 {
            // No line endings found (single line file or empty)
            // Default to LF on Unix, CRLF on Windows
            #[cfg(windows)]
            {
                "CRLF"
            }
            #[cfg(not(windows))]
            {
                "LF"
            }
        } else {
            "Mixed"
        };

        Ok(eol.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Convert line endings of a file to the specified style
#[tauri::command]
pub async fn fs_convert_eol(
    app: AppHandle,
    path: String,
    target_eol: String,
) -> Result<(), String> {
    // Invalidate content cache since we're modifying the file
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&path);

    let path_clone = path.clone();
    let target_eol_clone = target_eol.clone();
    tokio::task::spawn_blocking(move || {
        let metadata = std::fs::metadata(&path_clone)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        if metadata.len() > MAX_TEXT_FILE_SIZE {
            return Err(format!(
                "File is too large for EOL conversion ({:.1} MB, limit {:.0} MB)",
                metadata.len() as f64 / (1024.0 * 1024.0),
                MAX_TEXT_FILE_SIZE as f64 / (1024.0 * 1024.0),
            ));
        }
        let content = std::fs::read_to_string(&path_clone)
            .map_err(|e| format!("Failed to read file '{path_clone}' for EOL conversion: {e}"))?;

        // Normalize to LF first by replacing all line endings
        let normalized = content
            .replace("\r\n", "\n") // CRLF -> LF
            .replace('\r', "\n"); // CR -> LF

        // Convert to target line ending
        let converted = match target_eol_clone.as_str() {
            "CRLF" => normalized.replace('\n', "\r\n"),
            "CR" => normalized.replace('\n', "\r"),
            _ => normalized, // LF (default)
        };

        std::fs::write(&path_clone, converted)
            .map_err(|e| format!("Failed to write converted EOL to '{path_clone}': {e}"))?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    info!("Converted line endings of {} to {}", path, target_eol);
    Ok(())
}

// ============================================================================
// File Encoding Detection and Conversion
// ============================================================================

/// Detect the encoding of a file.
///
/// For large files, only reads a sample (first 64 KB) to avoid loading
/// multi-GB files into memory.
#[tauri::command]
pub async fn fs_detect_encoding(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use std::io::Read;

        let metadata =
            std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
        let file_size = metadata.len() as usize;

        let bytes = if file_size > ENCODING_SAMPLE_SIZE {
            let mut file =
                std::fs::File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
            let mut buf = vec![0u8; ENCODING_SAMPLE_SIZE];
            let n = file
                .read(&mut buf)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            buf.truncate(n);
            buf
        } else {
            std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?
        };

        // Check for BOM first
        if let Some((encoding, _)) = encoding_rs::Encoding::for_bom(&bytes) {
            return Ok(encoding.name().to_string());
        }

        // Use chardetng for detection if no BOM
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(&bytes, true);
        let encoding = detector.guess(None, true);

        Ok(encoding.name().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Read a file with a specific encoding
#[tauri::command]
pub async fn fs_read_file_with_encoding(path: String, encoding: String) -> Result<String, String> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "File is too large to read ({:.1} MB, limit {:.0} MB): {}",
            metadata.len() as f64 / (1024.0 * 1024.0),
            MAX_TEXT_FILE_SIZE as f64 / (1024.0 * 1024.0),
            path
        ));
    }

    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let encoding_type =
        encoding_rs::Encoding::for_label(encoding.as_bytes()).unwrap_or(encoding_rs::UTF_8);

    let (content, _, had_errors) = encoding_type.decode(&bytes);

    if had_errors {
        warn!(
            "Encoding errors detected while reading file {} with encoding {}",
            path, encoding
        );
    }

    Ok(content.into_owned())
}

/// Write a file with a specific encoding
#[tauri::command]
pub async fn fs_write_file_with_encoding(
    app: AppHandle,
    path: String,
    content: String,
    encoding: String,
) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // Invalidate directory cache
        let cache = app.state::<Arc<DirectoryCache>>();
        cache.invalidate(&parent.to_string_lossy());
    }

    // Invalidate content cache before writing
    let content_cache = app.state::<Arc<FileContentCache>>();
    content_cache.invalidate(&path);

    let encoding_type =
        encoding_rs::Encoding::for_label(encoding.as_bytes()).unwrap_or(encoding_rs::UTF_8);

    let (bytes, _, had_errors) = encoding_type.encode(&content);

    if had_errors {
        warn!(
            "Encoding errors detected while writing file {} with encoding {}",
            path, encoding
        );
    }

    tokio::fs::write(&file_path, &*bytes)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    info!("Wrote file with encoding {}: {}", encoding, path);
    Ok(())
}

/// Get list of supported encodings
#[tauri::command]
pub async fn fs_get_supported_encodings() -> Result<Vec<String>, String> {
    Ok(vec![
        "UTF-8".to_string(),
        "UTF-16LE".to_string(),
        "UTF-16BE".to_string(),
        "windows-1252".to_string(),
        "ISO-8859-1".to_string(),
        "ISO-8859-2".to_string(),
        "ISO-8859-15".to_string(),
        "Shift_JIS".to_string(),
        "EUC-JP".to_string(),
        "ISO-2022-JP".to_string(),
        "GBK".to_string(),
        "gb18030".to_string(),
        "Big5".to_string(),
        "EUC-KR".to_string(),
        "KOI8-R".to_string(),
        "KOI8-U".to_string(),
        "macintosh".to_string(),
        "IBM866".to_string(),
        "windows-1250".to_string(),
        "windows-1251".to_string(),
        "windows-1253".to_string(),
        "windows-1254".to_string(),
        "windows-1255".to_string(),
        "windows-1256".to_string(),
        "windows-1257".to_string(),
        "windows-1258".to_string(),
    ])
}
