/**
 * File Tree Cache — centralized caching for directory contents.
 *
 * Stores directory listings with time-to-live, expanded-path sets
 * per workspace root, and listens to Rust fs:change events for
 * automatic invalidation.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface CachedFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isHidden: boolean;
  isSymlink: boolean;
  size?: number;
  modifiedAt?: number;
  extension?: string;
  children?: CachedFileEntry[];
}

export interface FileTreeDeltaPayload {
  added: string[];
  removed: string[];
  modified: string[];
  affectedDirs: string[];
  watchId: string;
}

interface CacheEntry {
  entries: CachedFileEntry[];
  timestamp: number;
}

const DEFAULT_TTL = 30_000;
const MAX_ENTRIES = 2000;
const EXPANDED_STORAGE_PREFIX = "file_tree_expanded_";

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

class FileTreeCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;
  private unlistenFn: UnlistenFn | null = null;

  constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
  }

  private unlistenDeltaFn: UnlistenFn | null = null;
  private deltaListeners = new Set<(delta: FileTreeDeltaPayload) => void>();

  async startWatching(): Promise<void> {
    if (this.unlistenFn) return;
    try {
      this.unlistenFn = await listen<{ watchId: string; paths: string[]; type: string }>(
        "fs:change",
        (event) => {
          const changed = event.payload.paths;
          for (const p of changed) {
            const normalized = p.replace(/\\/g, "/");
            this.invalidate(normalized);
            const parent = normalized.substring(0, normalized.lastIndexOf("/"));
            if (parent) this.invalidate(parent);
          }
        },
      );
      this.unlistenDeltaFn = await listen<FileTreeDeltaPayload>(
        "fs:tree-delta",
        (event) => {
          const delta = event.payload;
          for (const dir of delta.affectedDirs) {
            const normalized = dir.replace(/\\/g, "/");
            this.invalidate(normalized);
          }
          for (const listener of this.deltaListeners) {
            listener(delta);
          }
        },
      );
    } catch {
      // Not in Tauri context (browser dev)
    }
  }

  stopWatching(): void {
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
    }
    if (this.unlistenDeltaFn) {
      this.unlistenDeltaFn();
      this.unlistenDeltaFn = null;
    }
  }

  onDelta(listener: (delta: FileTreeDeltaPayload) => void): () => void {
    this.deltaListeners.add(listener);
    return () => {
      this.deltaListeners.delete(listener);
    };
  }

  get(dirPath: string): CachedFileEntry[] | undefined {
    const entry = this.cache.get(dirPath);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(dirPath);
      return undefined;
    }
    return entry.entries;
  }

  set(dirPath: string, entries: CachedFileEntry[]): void {
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(dirPath, { entries, timestamp: Date.now() });
  }

  invalidate(dirPath: string): void {
    this.cache.delete(dirPath);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  saveExpandedPaths(rootPath: string, paths: Set<string>): void {
    const key = EXPANDED_STORAGE_PREFIX + hashString(rootPath);
    try {
      localStorage.setItem(key, JSON.stringify([...paths]));
    } catch {
      // localStorage full or unavailable
    }
  }

  loadExpandedPaths(rootPath: string): Set<string> {
    const key = EXPANDED_STORAGE_PREFIX + hashString(rootPath);
    try {
      const raw = localStorage.getItem(key);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // ignore
    }
    return new Set();
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const fileTreeCache = new FileTreeCache();

export default fileTreeCache;
