//! File System Module - High-Performance Parallel File Operations for Cortex Desktop
//!
//! This module provides Tauri commands for all file system operations with
//! optimizations including:
//! - Parallel directory reading with tokio JoinSet
//! - Thread-safe LRU caching with DashMap
//! - Rayon for CPU-bound sorting/filtering
//! - Semaphore-limited concurrency to prevent file handle exhaustion
//! - Shallow tree loading for lazy UI loading
//! - Background prefetching for cache warming
//! - Path traversal protection for all file operations
//!
//! # Module Structure
//!
//! - `types` - Data structures (FileEntry, FileMetadata, cache types, etc.)
//! - `security` - Path validation and traversal protection
//! - `utils` - Helper functions (hidden file detection, sorting, etc.)
//! - `operations` - File CRUD operations (read, write, copy, move, delete)
//! - `directory` - Directory operations and tree traversal
//! - `watcher` - File system change monitoring
//! - `search` - File name and content search
//! - `encoding` - File encoding detection and conversion
//! - `workspace_edit` - Text edit operations for refactoring

pub mod delta;
pub mod directory;
pub mod encoding;
pub mod operations;
pub mod search;
pub mod security;
pub mod types;
pub mod utils;
pub mod watcher;
pub mod workspace_edit;

// Re-export types for public use
pub use types::{DirectoryCache, FileContentCache, FileWatcherState, IoSemaphore};

// Re-export everything from submodules for Tauri command registration
// Note: Tauri's #[tauri::command] macro generates internal items that need to be accessible
// from the module path used in invoke_handler!, so we use glob re-exports.

// Operations module - file CRUD
pub use operations::*;

// Directory module - directory operations and tree traversal
pub use directory::*;

// Watcher module - file system monitoring
pub use watcher::*;

// Search module - file and content search
pub use search::*;

// Encoding module - encoding detection and conversion
pub use encoding::*;

// Workspace edit module - text edit operations
pub use workspace_edit::*;

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::types::FileEntry;
    use super::*;
    use std::path::Path;

    #[test]
    fn test_is_hidden() {
        use utils::is_hidden;
        assert!(is_hidden(".gitignore", Path::new(".gitignore")));
        assert!(is_hidden(".env", Path::new(".env")));
        assert!(!is_hidden("README.md", Path::new("README.md")));
    }

    #[test]
    fn test_should_ignore() {
        use utils::should_ignore;
        assert!(should_ignore("node_modules"));
        assert!(should_ignore("target"));
        assert!(should_ignore(".git"));
        assert!(!should_ignore("src"));
        assert!(!should_ignore("lib"));
    }

    #[test]
    fn test_get_extension() {
        use utils::get_extension;
        assert_eq!(get_extension("file.ts"), Some("ts".to_string()));
        assert_eq!(get_extension("file.test.tsx"), Some("tsx".to_string()));
        assert_eq!(get_extension("Makefile"), None);
    }

    #[test]
    fn test_directory_cache() {
        let cache = DirectoryCache::new();

        let entries = vec![FileEntry {
            name: "test.txt".to_string(),
            path: "/test/test.txt".to_string(),
            is_dir: false,
            is_hidden: false,
            is_symlink: false,
            size: Some(100),
            modified_at: Some(1234567890),
            extension: Some("txt".to_string()),
            children: None,
        }];

        cache.insert("/test".to_string(), entries.clone());

        let cached = cache.get("/test");
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().len(), 1);

        cache.invalidate("/test");
        assert!(cache.get("/test").is_none());
    }

    #[test]
    fn test_cache_key_consistency() {
        let cache = DirectoryCache::new();

        let entries = vec![FileEntry {
            name: "file.rs".to_string(),
            path: "/project/src/file.rs".to_string(),
            is_dir: false,
            is_hidden: false,
            is_symlink: false,
            size: Some(200),
            modified_at: None,
            extension: Some("rs".to_string()),
            children: None,
        }];

        let key = format!("{}:{}:{}", "/project/src", true, false);
        cache.insert(key.clone(), entries.clone());

        assert!(cache.get(&key).is_some());

        assert!(cache.get("/project/src").is_none());

        cache.invalidate(&key);
        assert!(cache.get(&key).is_none());
    }

    #[test]
    fn test_cache_prefix_invalidation_with_keys() {
        let cache = DirectoryCache::new();

        let entries = vec![FileEntry {
            name: "a.txt".to_string(),
            path: "/project/a.txt".to_string(),
            is_dir: false,
            is_hidden: false,
            is_symlink: false,
            size: Some(10),
            modified_at: None,
            extension: Some("txt".to_string()),
            children: None,
        }];

        cache.insert("/project:true:false".to_string(), entries.clone());
        cache.insert("/project:false:false".to_string(), entries.clone());
        cache.insert("/project/sub:true:false".to_string(), entries.clone());
        cache.insert("/other:true:false".to_string(), entries.clone());

        cache.invalidate_prefix("/project");

        assert!(cache.get("/project:true:false").is_none());
        assert!(cache.get("/project:false:false").is_none());
        assert!(cache.get("/project/sub:true:false").is_none());
        assert!(cache.get("/other:true:false").is_some());
    }

    #[test]
    fn test_file_tree_delta_serialization() {
        use super::delta::FileTreeDelta;

        let delta = FileTreeDelta {
            added: vec!["/project/new_file.rs".to_string()],
            removed: vec![],
            modified: vec![],
            affected_dirs: vec!["/project".to_string()],
            watch_id: "watch_abc123".to_string(),
        };

        let json = serde_json::to_string(&delta).unwrap();
        assert!(json.contains("\"affectedDirs\""));
        assert!(json.contains("\"watchId\""));
        assert!(json.contains("new_file.rs"));

        let deserialized: FileTreeDelta = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.added.len(), 1);
        assert_eq!(deserialized.watch_id, "watch_abc123");
    }

    #[test]
    fn test_invalidate_dir_clears_all_variants() {
        let cache = DirectoryCache::new();

        let entries = vec![FileEntry {
            name: "a.txt".to_string(),
            path: "/project/a.txt".to_string(),
            is_dir: false,
            is_hidden: false,
            is_symlink: false,
            size: Some(10),
            modified_at: None,
            extension: Some("txt".to_string()),
            children: None,
        }];

        cache.insert("/project".to_string(), entries.clone());
        cache.insert("/project:true:false".to_string(), entries.clone());
        cache.insert("/project:true:true".to_string(), entries.clone());
        cache.insert("/project:false:false".to_string(), entries.clone());
        cache.insert("/project:false:true".to_string(), entries.clone());
        cache.insert("/other:true:false".to_string(), entries.clone());

        cache.invalidate_dir("/project");

        assert!(cache.get("/project").is_none());
        assert!(cache.get("/project:true:false").is_none());
        assert!(cache.get("/project:true:true").is_none());
        assert!(cache.get("/project:false:false").is_none());
        assert!(cache.get("/project:false:true").is_none());
        assert!(cache.get("/other:true:false").is_some());
    }

    #[test]
    fn test_parallel_sort() {
        use utils::parallel_sort_entries;

        let mut entries = vec![
            FileEntry {
                name: "zebra.txt".to_string(),
                path: "/zebra.txt".to_string(),
                is_dir: false,
                is_hidden: false,
                is_symlink: false,
                size: Some(100),
                modified_at: None,
                extension: Some("txt".to_string()),
                children: None,
            },
            FileEntry {
                name: "src".to_string(),
                path: "/src".to_string(),
                is_dir: true,
                is_hidden: false,
                is_symlink: false,
                size: None,
                modified_at: None,
                extension: None,
                children: None,
            },
            FileEntry {
                name: "alpha.txt".to_string(),
                path: "/alpha.txt".to_string(),
                is_dir: false,
                is_hidden: false,
                is_symlink: false,
                size: Some(50),
                modified_at: None,
                extension: Some("txt".to_string()),
                children: None,
            },
        ];

        parallel_sort_entries(&mut entries);

        assert_eq!(entries[0].name, "src");
        assert_eq!(entries[1].name, "alpha.txt");
        assert_eq!(entries[2].name, "zebra.txt");
    }
}
