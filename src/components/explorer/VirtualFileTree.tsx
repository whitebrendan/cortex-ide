/**
 * VirtualFileTree — high-performance virtualized file tree component.
 *
 * Provides a flattened tree model with virtual scrolling optimized for
 * trees with 10,000+ nodes.
 *
 * Key design decisions:
 * - Uses SolidJS fine-grained reactivity (not react-window, which is React-only)
 * - Flattened list model: the tree is pre-flattened into an array, and
 *   expand/collapse splices children in/out
 * - Virtual viewport: only DOM nodes within the visible range (plus overscan)
 *   are rendered
 * - Integrates with fileTreeCache for directory content caching
 */

import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
  batch,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { fileTreeCache, type CachedFileEntry } from "@/store/fileTreeCache";

export interface VirtualFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isHidden: boolean;
  isSymlink: boolean;
  size?: number;
  modifiedAt?: number;
  extension?: string;
  children?: VirtualFileEntry[];
}

export interface FlatNode {
  id: string;
  entry: VirtualFileEntry;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  hasChildren: boolean;
  parentPath: string | null;
}

export interface VirtualFileTreeProps {
  rootPath: string;
  itemHeight?: number;
  overscan?: number;
  showHidden?: boolean;
  onSelect?: (path: string) => void;
  onOpen?: (path: string) => void;
}

const DEFAULT_ITEM_HEIGHT = 20;
const DEFAULT_OVERSCAN = 10;
const LAZY_LOAD_DEPTH = 1;

export function VirtualFileTree(props: VirtualFileTreeProps) {
  const itemHeight = () => props.itemHeight ?? DEFAULT_ITEM_HEIGHT;
  const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;

  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set());
  const [directoryCache, setDirectoryCache] = createSignal<Map<string, VirtualFileEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = createSignal<Set<string>>(new Set());
  const [rootEntry, setRootEntry] = createSignal<VirtualFileEntry | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(400);
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);

  let resizeObserver: ResizeObserver | null = null;

  onMount(async () => {
    const restored = fileTreeCache.loadExpandedPaths(props.rootPath);
    if (restored.size > 0) setExpandedPaths(restored);

    await fileTreeCache.startWatching();
    await loadRoot();

    if (restored.size > 0) {
      await Promise.allSettled(
        [...restored].map((p) => loadChildren(p)),
      );
    }
  });

  onCleanup(() => {
    if (resizeObserver) resizeObserver.disconnect();
    if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
    fileTreeCache.stopWatching();
  });

  createEffect(() => {
    fileTreeCache.saveExpandedPaths(props.rootPath, expandedPaths());
  });

  const setRef = (el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) setContainerHeight(rect.height);
    resizeObserver = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.height > 0) setContainerHeight(e.contentRect.height);
      }
    });
    resizeObserver.observe(el);
  };

  const loadRoot = async () => {
    try {
      const data = await invoke<VirtualFileEntry>("fs_get_file_tree", {
        path: props.rootPath,
        depth: LAZY_LOAD_DEPTH,
        showHidden: true,
        includeIgnored: false,
      });
      batch(() => {
        setRootEntry(data);
        if (data?.children) {
          setDirectoryCache((prev) => {
            const next = new Map(prev);
            next.set(data.path, data.children!);
            return next;
          });
          fileTreeCache.set(data.path, data.children as CachedFileEntry[]);
        }
      });
    } catch (err) {
      console.error("[VirtualFileTree] Failed to load root:", err);
    }
  };

  const loadChildren = async (dirPath: string) => {
    if (loadingDirs().has(dirPath)) return;

    const cached = fileTreeCache.get(dirPath);
    if (cached) {
      setDirectoryCache((prev) => {
        const next = new Map(prev);
        next.set(dirPath, cached as VirtualFileEntry[]);
        return next;
      });
      return;
    }

    setLoadingDirs((prev) => { const s = new Set(prev); s.add(dirPath); return s; });
    try {
      const data = await invoke<VirtualFileEntry>("fs_get_file_tree", {
        path: dirPath,
        depth: LAZY_LOAD_DEPTH,
        showHidden: true,
        includeIgnored: false,
      });
      batch(() => {
        if (data?.children) {
          setDirectoryCache((prev) => {
            const next = new Map(prev);
            next.set(dirPath, data.children!);
            return next;
          });
          fileTreeCache.set(dirPath, data.children as CachedFileEntry[]);
        }
        setLoadingDirs((prev) => { const s = new Set(prev); s.delete(dirPath); return s; });
      });
    } catch {
      setLoadingDirs((prev) => { const s = new Set(prev); s.delete(dirPath); return s; });
    }
  };

  const flattenedItems = createMemo((): FlatNode[] => {
    const root = rootEntry();
    if (!root) return [];
    const cache = directoryCache();
    const expanded = expandedPaths();
    const loading = loadingDirs();
    const showHidden = props.showHidden ?? false;
    const items: FlatNode[] = [];

    const walk = (entries: VirtualFileEntry[], depth: number, parentPath: string | null) => {
      const sorted = [...entries].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

      for (const entry of sorted) {
        if (!showHidden && entry.isHidden) continue;
        const isExp = expanded.has(entry.path);
        const children = cache.get(entry.path);
        items.push({
          id: entry.path,
          entry,
          depth,
          isExpanded: isExp,
          isLoading: loading.has(entry.path),
          hasChildren: entry.isDir && (children ? children.length > 0 : true),
          parentPath,
        });
        if (entry.isDir && isExp && children) {
          walk(children, depth + 1, entry.path);
        }
      }
    };

    const rootChildren = cache.get(root.path) || root.children || [];
    walk(rootChildren, 0, root.path);
    return items;
  });

  const visibleRange = createMemo(() => {
    const total = flattenedItems().length;
    const h = itemHeight();
    const o = overscan();
    const start = Math.max(0, Math.floor(scrollTop() / h) - o);
    const count = Math.ceil(containerHeight() / h) + o * 2;
    const end = Math.min(total, start + count);
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return flattenedItems().slice(start, end);
  });

  const totalHeight = createMemo(() => flattenedItems().length * itemHeight());
  const offsetY = createMemo(() => visibleRange().start * itemHeight());

  let scrollRaf: number | null = null;
  const handleScroll = (e: Event) => {
    const t = (e.target as HTMLDivElement).scrollTop;
    if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => { setScrollTop(t); scrollRaf = null; });
  };

  const toggleExpand = async (path: string) => {
    const expanded = expandedPaths();
    if (expanded.has(path)) {
      setExpandedPaths((prev) => { const s = new Set(prev); s.delete(path); return s; });
    } else {
      setExpandedPaths((prev) => { const s = new Set(prev); s.add(path); return s; });
      if (!directoryCache().has(path)) {
        await loadChildren(path);
      }
    }
  };

  const handleClick = (node: FlatNode) => {
    setSelectedPath(node.entry.path);
    if (node.entry.isDir) {
      toggleExpand(node.entry.path);
    } else {
      props.onSelect?.(node.entry.path);
    }
  };

  const handleDoubleClick = (node: FlatNode) => {
    if (!node.entry.isDir) {
      props.onOpen?.(node.entry.path);
    }
  };

  return (
    <div
      ref={setRef}
      style={{
        overflow: "auto",
        height: "100%",
        width: "100%",
        "font-size": "var(--tree-font-size, 11px)",
        "font-family": "var(--cortex-font-sans, system-ui)",
      }}
      onScroll={handleScroll}
      role="tree"
      aria-label="File tree"
    >
      <div style={{ height: `${totalHeight()}px`, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY()}px)` }}>
          <For each={visibleItems()}>
            {(node) => (
              <div
                role="treeitem"
                aria-expanded={node.entry.isDir ? node.isExpanded : undefined}
                aria-selected={selectedPath() === node.entry.path}
                style={{
                  height: `${itemHeight()}px`,
                  display: "flex",
                  "align-items": "center",
                  "padding-left": `${12 + node.depth * 16}px`,
                  cursor: "pointer",
                  "white-space": "nowrap",
                  overflow: "hidden",
                  background: selectedPath() === node.entry.path
                    ? "var(--list-active-selection-background, rgba(255,255,255,0.08))"
                    : "transparent",
                  color: "var(--cortex-text-primary, #ccc)",
                }}
                onClick={() => handleClick(node)}
                onDblClick={() => handleDoubleClick(node)}
              >
                <Show when={node.entry.isDir}>
                  <span style={{
                    width: "16px",
                    "flex-shrink": "0",
                    display: "inline-flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "font-size": "8px",
                    color: "var(--cortex-text-secondary, #888)",
                    transform: node.isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.1s",
                  }}>
                    ▶
                  </span>
                </Show>
                <Show when={!node.entry.isDir}>
                  <span style={{ width: "16px", "flex-shrink": "0" }} />
                </Show>
                <span style={{
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "font-weight": node.entry.isDir ? "500" : "normal",
                }}>
                  {node.entry.name}
                </span>
                <Show when={node.isLoading}>
                  <span style={{
                    "margin-left": "8px",
                    "font-size": "9px",
                    color: "var(--cortex-text-tertiary, #666)",
                    animation: "spin 0.8s linear infinite",
                  }}>
                    ⟳
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export default VirtualFileTree;
