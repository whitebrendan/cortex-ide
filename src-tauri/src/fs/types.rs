//! File System Types - Data structures for file operations
//!
//! This module contains all data structures used throughout the fs module,
//! including file entries, metadata, and cache types.

use dashmap::DashMap;
use lru::LruCache;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::num::NonZeroUsize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

// ============================================================================
// Constants
// ============================================================================

/// Maximum concurrent file operations to prevent file handle exhaustion
pub const MAX_CONCURRENT_IO: usize = 100;

/// Maximum entries to process in a single batch
pub const BATCH_SIZE: usize = 50;

/// Cache TTL in seconds
pub const CACHE_TTL_SECS: u64 = 30;

/// Maximum cache entries
pub const MAX_CACHE_ENTRIES: usize = 500;

/// Maximum text file size to load into memory (50 MB)
pub const MAX_TEXT_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// Maximum binary file size to load into memory (512 MB)
pub const MAX_BINARY_FILE_SIZE: u64 = 512 * 1024 * 1024;

/// Sample size for encoding detection on large files (64 KB)
pub const ENCODING_SAMPLE_SIZE: usize = 64 * 1024;

/// Maximum total size of the file content cache (100 MB)
pub const MAX_CONTENT_CACHE_SIZE: usize = 100 * 1024 * 1024;

/// Maximum individual file size eligible for content caching (5 MB)
pub const MAX_CACHEABLE_FILE_SIZE: u64 = 5 * 1024 * 1024;

/// TTL for cached file content in seconds
pub const CONTENT_CACHE_TTL_SECS: u64 = 5;

/// File size threshold above which mmap is used instead of regular read (1 MB)
pub const MMAP_THRESHOLD: u64 = 1024 * 1024;

// ============================================================================
// Core Types
// ============================================================================

/// File system entry representing a file or directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(rename = "isHidden")]
    pub is_hidden: bool,
    #[serde(rename = "isSymlink")]
    pub is_symlink: bool,
    pub size: Option<u64>,
    #[serde(rename = "modifiedAt")]
    pub modified_at: Option<u64>,
    pub extension: Option<String>,
    pub children: Option<Vec<FileEntry>>,
}

/// File metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(rename = "isFile")]
    pub is_file: bool,
    #[serde(rename = "isSymlink")]
    pub is_symlink: bool,
    #[serde(rename = "isHidden")]
    pub is_hidden: bool,
    pub size: u64,
    #[serde(rename = "modifiedAt")]
    pub modified_at: Option<u64>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<u64>,
    #[serde(rename = "accessedAt")]
    pub accessed_at: Option<u64>,
    pub readonly: bool,
}

/// Event emitted when a watched file/directory changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub paths: Vec<String>,
    #[serde(rename = "watchId")]
    pub watch_id: String,
}

/// Project info for listing Cortex projects.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CortexProject {
    pub name: String,
    pub path: String,
    pub modified_at: i64,
}

// ============================================================================
// Cache Types
// ============================================================================

/// Cached directory entry with timestamp
#[derive(Debug, Clone)]
pub struct CachedEntry {
    pub entries: Vec<FileEntry>,
    pub timestamp: Instant,
}

/// Thread-safe directory cache using DashMap for concurrent access
pub struct DirectoryCache {
    cache: DashMap<String, CachedEntry>,
    lru_order: Mutex<LruCache<String, ()>>,
    ttl: Duration,
}

impl DirectoryCache {
    pub fn new() -> Self {
        // SAFETY: MAX_CACHE_ENTRIES is a compile-time constant > 0
        const CACHE_SIZE: NonZeroUsize = match NonZeroUsize::new(MAX_CACHE_ENTRIES) {
            Some(v) => v,
            None => unreachable!(),
        };
        Self {
            cache: DashMap::new(),
            lru_order: Mutex::new(LruCache::new(CACHE_SIZE)),
            ttl: Duration::from_secs(CACHE_TTL_SECS),
        }
    }

    pub fn get(&self, path: &str) -> Option<Vec<FileEntry>> {
        if let Some(entry) = self.cache.get(path) {
            if entry.timestamp.elapsed() < self.ttl {
                self.lru_order.lock().get(path);
                return Some(entry.entries.clone());
            }
            drop(entry);
            self.cache.remove(path);
        }
        None
    }

    pub fn insert(&self, path: String, entries: Vec<FileEntry>) {
        let mut lru = self.lru_order.lock();

        if lru.len() >= MAX_CACHE_ENTRIES {
            if let Some((evicted_key, _)) = lru.pop_lru() {
                self.cache.remove(&evicted_key);
            }
        }

        lru.put(path.clone(), ());
        self.cache.insert(
            path,
            CachedEntry {
                entries,
                timestamp: Instant::now(),
            },
        );
    }

    pub fn invalidate(&self, path: &str) {
        self.cache.remove(path);
        self.lru_order.lock().pop(path);
    }

    pub fn invalidate_dir(&self, path: &str) {
        self.invalidate(path);
        let variants = [
            format!("{}:true:false", path),
            format!("{}:true:true", path),
            format!("{}:false:false", path),
            format!("{}:false:true", path),
        ];
        for key in &variants {
            self.cache.remove(key.as_str());
            self.lru_order.lock().pop(key.as_str());
        }
    }

    pub fn invalidate_prefix(&self, prefix: &str) {
        let keys_to_remove: Vec<String> = self
            .cache
            .iter()
            .filter(|entry| entry.key().starts_with(prefix))
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            self.cache.remove(&key);
            self.lru_order.lock().pop(&key);
        }
    }

    pub fn clear(&self) {
        self.cache.clear();
        self.lru_order.lock().clear();
    }
}

impl Default for DirectoryCache {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Watcher State
// ============================================================================

/// State for managing file watchers with deduplication and debouncing
pub struct FileWatcherState {
    pub watchers: Mutex<HashMap<String, notify::RecommendedWatcher>>,
    watched_paths: Mutex<HashMap<String, HashSet<String>>>,
    last_events: Mutex<HashMap<String, Instant>>,
    debounce_ms: u64,
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            watched_paths: Mutex::new(HashMap::new()),
            last_events: Mutex::new(HashMap::new()),
            debounce_ms: 100,
        }
    }

    pub fn should_emit(&self, path: &str) -> bool {
        let mut last_events = self.last_events.lock();
        let now = Instant::now();

        if let Some(last) = last_events.get(path) {
            if now.duration_since(*last) < Duration::from_millis(self.debounce_ms) {
                return false;
            }
        }

        last_events.insert(path.to_string(), now);
        true
    }

    pub fn is_path_watched(&self, path: &str) -> bool {
        let watched = self.watched_paths.lock();
        watched.get(path).map(|s| !s.is_empty()).unwrap_or(false)
    }

    pub fn register_watch(&self, path: &str, watch_id: &str) {
        let mut watched = self.watched_paths.lock();
        watched
            .entry(path.to_string())
            .or_default()
            .insert(watch_id.to_string());
    }

    pub fn unregister_watch(&self, path: &str, watch_id: &str) {
        let mut watched = self.watched_paths.lock();
        if let Some(ids) = watched.get_mut(path) {
            ids.remove(watch_id);
            if ids.is_empty() {
                watched.remove(path);
            }
        }
    }

    pub fn get_watch_ids(&self, path: &str) -> Vec<String> {
        let watched = self.watched_paths.lock();
        watched
            .get(path)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn cleanup_debounce(&self) {
        let mut last_events = self.last_events.lock();
        let now = Instant::now();
        let threshold = Duration::from_secs(60);
        last_events.retain(|_, time| now.duration_since(*time) < threshold);
    }

    pub fn stop_all_watchers(&self) {
        let mut watchers = self.watchers.lock();
        let count = watchers.len();
        watchers.clear();
        self.watched_paths.lock().clear();
        self.last_events.lock().clear();
        if count > 0 {
            tracing::info!("Stopped {} file watchers", count);
        }
    }
}

impl Default for FileWatcherState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// IO Semaphore
// ============================================================================

/// Global IO semaphore for limiting concurrent file operations
pub struct IoSemaphore {
    semaphore: Arc<Semaphore>,
}

impl IoSemaphore {
    pub fn new() -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_IO)),
        }
    }

    pub fn get(&self) -> Arc<Semaphore> {
        Arc::clone(&self.semaphore)
    }
}

impl Default for IoSemaphore {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// File Content Cache
// ============================================================================

/// Cached file content with metadata for staleness detection
#[derive(Debug, Clone)]
pub struct CachedFileContent {
    pub content: String,
    pub size: usize,
    pub mtime: u64,
    pub timestamp: Instant,
}

/// Thread-safe file content cache with size-based eviction.
///
/// Caches recently read file contents to avoid repeated disk I/O for
/// files that are accessed multiple times (common in IDE workflows).
/// Uses DashMap for concurrent access and evicts entries when total
/// cached size exceeds `MAX_CONTENT_CACHE_SIZE`.
pub struct FileContentCache {
    cache: DashMap<String, CachedFileContent>,
    total_size: std::sync::atomic::AtomicUsize,
    ttl: Duration,
}

impl FileContentCache {
    pub fn new() -> Self {
        Self {
            cache: DashMap::new(),
            total_size: std::sync::atomic::AtomicUsize::new(0),
            ttl: Duration::from_secs(CONTENT_CACHE_TTL_SECS),
        }
    }

    /// Get cached content if it exists, is not expired, and mtime matches.
    pub fn get(&self, path: &str, current_mtime: u64) -> Option<String> {
        if let Some(entry) = self.cache.get(path) {
            if entry.timestamp.elapsed() < self.ttl && entry.mtime == current_mtime {
                return Some(entry.content.clone());
            }
            // Stale entry — drop the ref before removing
            drop(entry);
            self.remove(path);
        }
        None
    }

    /// Insert file content into the cache. Only caches files within size limits.
    pub fn insert(&self, path: String, content: String, mtime: u64) {
        let size = content.len();
        if size as u64 > MAX_CACHEABLE_FILE_SIZE {
            return;
        }

        // Evict entries if we'd exceed the total size budget
        while self.total_size.load(std::sync::atomic::Ordering::Relaxed) + size
            > MAX_CONTENT_CACHE_SIZE
        {
            if !self.evict_oldest() {
                break;
            }
        }

        // If replacing an existing entry, subtract its old size
        if let Some(old) = self.cache.get(path.as_str()) {
            self.total_size
                .fetch_sub(old.size, std::sync::atomic::Ordering::Relaxed);
        }

        self.cache.insert(
            path,
            CachedFileContent {
                content,
                size,
                mtime,
                timestamp: Instant::now(),
            },
        );
        self.total_size
            .fetch_add(size, std::sync::atomic::Ordering::Relaxed);
    }

    /// Invalidate a specific path.
    pub fn invalidate(&self, path: &str) {
        self.remove(path);
    }

    /// Invalidate all paths starting with the given prefix.
    pub fn invalidate_prefix(&self, prefix: &str) {
        let keys_to_remove: Vec<String> = self
            .cache
            .iter()
            .filter(|entry| entry.key().starts_with(prefix))
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            self.remove(&key);
        }
    }

    /// Clear all cached content.
    pub fn clear(&self) {
        self.cache.clear();
        self.total_size
            .store(0, std::sync::atomic::Ordering::Relaxed);
    }

    /// Remove a single entry and update total size.
    fn remove(&self, path: &str) {
        if let Some((_, entry)) = self.cache.remove(path) {
            self.total_size
                .fetch_sub(entry.size, std::sync::atomic::Ordering::Relaxed);
        }
    }

    /// Evict the oldest (by timestamp) entry. Returns true if an entry was evicted.
    fn evict_oldest(&self) -> bool {
        let oldest = self
            .cache
            .iter()
            .min_by_key(|entry| entry.timestamp)
            .map(|entry| entry.key().clone());

        if let Some(key) = oldest {
            self.remove(&key);
            true
        } else {
            false
        }
    }
}

impl Default for FileContentCache {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Search Types
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct SearchMatch {
    pub line: u32,
    pub column: u32,
    pub text: String,
    #[serde(rename = "matchStart")]
    pub match_start: u32,
    #[serde(rename = "matchEnd")]
    pub match_end: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub file: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentSearchResponse {
    pub results: Vec<SearchResult>,
    #[serde(rename = "totalMatches")]
    pub total_matches: u32,
    #[serde(rename = "filesSearched")]
    pub files_searched: u32,
}

// ============================================================================
// Line Ending Types
// ============================================================================

/// Line ending types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[allow(clippy::upper_case_acronyms)]
pub enum LineEnding {
    LF,
    CRLF,
    CR,
    Mixed,
}

// ============================================================================
// Workspace Edit Types
// ============================================================================

/// A text edit range with line/character positions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEditPosition {
    pub line: u32,
    pub character: u32,
}

/// A range defined by start and end positions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEditRange {
    pub start: TextEditPosition,
    pub end: TextEditPosition,
}

/// A single text edit operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEdit {
    pub range: TextEditRange,
    pub new_text: String,
}
