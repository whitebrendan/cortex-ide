import { getFileIcon as getFileIconPath, getFolderIcon } from "@/utils/fileIcons";
import { tokens } from "@/design-system/tokens";

const FILE_COLORS: Record<string, string> = {};

const ICON_CACHE_MAX_SIZE = 500;
const COLOR_CACHE_MAX_SIZE = 200;

class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const iconCache = new LRUCache<string, string>(ICON_CACHE_MAX_SIZE);
const colorCache = new LRUCache<string, string>(COLOR_CACHE_MAX_SIZE);

export function clearFileExplorerCaches(): void {
  iconCache.clear();
  colorCache.clear();
}

export function getFileIconSvg(name: string, isDir: boolean, _isExpanded: boolean): string {
  if (isDir) {
    return getFolderIcon(name);
  }
  const cacheKey = name;
  const cached = iconCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const iconPath = getFileIconPath(name, false);
  iconCache.set(cacheKey, iconPath);
  return iconPath;
}

export function getFileColor(name: string): string {
  const cached = colorCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const color = FILE_COLORS[ext] || tokens.colors.text.primary;
  colorCache.set(name, color);
  return color;
}
