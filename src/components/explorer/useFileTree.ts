import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  batch,
  untrack,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useFileOperations } from "@/context/FileOperationsContext";
import { generateUniquePath, basename as getBasename, joinPath } from "@/utils/fileUtils";
import { fsDeleteFile, fsDeleteDirectory } from "@/utils/tauri-api";
import { type ExplorerRevealPayload, addAppEventListener } from "@/utils/eventBus";
import { getFileIconSvg } from "./icons";
import { tokens } from "@/design-system/tokens";
import { safeGetItem, safeSetItem } from "@/utils/safeStorage";
import {
  sortEntries,
  filterEntries,
  compactFolderEntries,
  computeNestedGroups,
  hashString,
  debounce,
  getGitDecorationForStatus,
  getFolderDecoration,
  formatFileError,
} from "./utils";
import {
  ITEM_HEIGHT,
  OVERSCAN,
  DEBOUNCE_DELAY,
  LAZY_LOAD_DEPTH,
} from "./types";
import type {
  FileEntry,
  CompactedFileEntry,
  FlattenedItem,
  ContextMenuState,
  ClipboardState,
  GitDecoration,
  VirtualizedFileTreeProps,
  FileOperationDialogState,
} from "./types";
import { useToast } from "@/context/ToastContext";

export function useFileTree(props: VirtualizedFileTreeProps) {
  const fileOps = useFileOperations();
  const toast = useToast();
  
  const [directoryCache, setDirectoryCache] = createSignal<Map<string, FileEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = createSignal<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set());
  const [expandedNestedGroups, setExpandedNestedGroups] = createSignal<Set<string>>(new Set());
  const [rootEntry, setRootEntry] = createSignal<FileEntry | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [focusedPath, setFocusedPath] = createSignal<string | null>(null);
  const [renamingPath, setRenamingPath] = createSignal<string | null>(null);
  const [draggedPaths, setDraggedPaths] = createSignal<string[]>([]);
  const [dragOverPath, setDragOverPath] = createSignal<string | null>(null);
  const [isDragCopy, setIsDragCopy] = createSignal(false);
  const [lastSelectedPath, setLastSelectedPath] = createSignal<string | null>(null);
  const [watchId, setWatchId] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    entry: null,
  });
  const [clipboardFiles, setClipboardFiles] = createSignal<ClipboardState | null>(null);
  
  const [pendingDropOperation, setPendingDropOperation] = createSignal<{
    sourcePaths: string[];
    targetDir: string;
    targetName: string;
    isCopy: boolean;
  } | null>(null);
  
  const [largeFileWarning, setLargeFileWarning] = createSignal<{
    path: string;
    fileName: string;
    fileSizeMB: number;
    isPreview: boolean;
  } | null>(null);
  
  const [fileOperationDialog, setFileOperationDialog] = createSignal<FileOperationDialogState | null>(null);
  
  const [recentlyExpandedPaths, setRecentlyExpandedPaths] = createSignal<Set<string>>(new Set());
  
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(400);
  
  let containerRef: HTMLDivElement | undefined;
  let resizeObserverRef: ResizeObserver | null = null;
  let unlistenFn: UnlistenFn | null = null;
  
  const setContainerRef = (el: HTMLDivElement) => {
    containerRef = el;
    if (el && !resizeObserverRef) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) {
        setContainerHeight(rect.height);
      }
      
      resizeObserverRef = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.contentRect.height;
          if (height > 0) {
            setContainerHeight(height);
          }
        }
      });
      resizeObserverRef.observe(el);
    }
  };
  
  const debouncedRefresh = debounce(() => {
    batch(() => {
      loadRootDirectory();
      refreshExpandedDirectories();
    });
  }, DEBOUNCE_DELAY);
  
  const loadRootDirectory = async () => {
    if (!props.rootPath) return;

    setLoading(true);
    setError(null);

    try {
      const data = await invoke<FileEntry>("fs_get_file_tree", {
        path: props.rootPath,
        depth: LAZY_LOAD_DEPTH,
        showHidden: true,
        includeIgnored: false,
      });

      batch(() => {
        setRootEntry(data);
        if (data?.children) {
          setDirectoryCache(prev => {
            const next = new Map(prev);
            next.set(data.path, data.children!);
            return next;
          });
        }
        if (data?.path) {
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            next.add(data.path);
            return next;
          });
        }
      });
    } catch (e) {
      console.error("Failed to load file tree:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  
  const loadDirectoryChildren = async (dirPath: string): Promise<FileEntry[] | null> => {
    if (loadingDirs().has(dirPath)) return null;
    
    const cached = directoryCache().get(dirPath);
    if (cached) return cached;
    
    setLoadingDirs(prev => {
      const next = new Set(prev);
      next.add(dirPath);
      return next;
    });
    
    try {
      const data = await invoke<FileEntry>("fs_get_file_tree", {
        path: dirPath,
        depth: LAZY_LOAD_DEPTH,
        showHidden: true,
        includeIgnored: false,
      });
      
      batch(() => {
        if (data?.children) {
          setDirectoryCache(prev => {
            const next = new Map(prev);
            next.set(dirPath, data.children!);
            return next;
          });
        }
        setLoadingDirs(prev => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      });
      
      return data?.children || [];
    } catch (e) {
      console.error("Failed to load directory:", dirPath, e);
      setLoadingDirs(prev => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
      return null;
    }
  };
  
  const refreshExpandedDirectories = async () => {
    const expanded = expandedPaths();
    const expandedArray = Array.from(expanded);
    
    const results = await Promise.allSettled(
      expandedArray.map(async (dirPath) => {
        const data = await invoke<FileEntry>("fs_get_file_tree", {
          path: dirPath,
          depth: LAZY_LOAD_DEPTH,
          showHidden: true,
          includeIgnored: false,
        });
        return { dirPath, children: data?.children };
      })
    );
    
    const updates: Array<{ dirPath: string; children: FileEntry[] }> = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.children) {
        updates.push({ dirPath: result.value.dirPath, children: result.value.children });
      }
    }
    
    if (updates.length > 0) {
      setDirectoryCache(prev => {
        const next = new Map(prev);
        for (const { dirPath, children } of updates) {
          next.set(dirPath, children);
        }
        return next;
      });
    }
  };
  
  const flattenedItems = createMemo((): FlattenedItem[] => {
    const root = rootEntry();
    if (!root) return [];
    
    const cache = directoryCache();
    const expanded = expandedPaths();
    const loadingSet = loadingDirs();
    const nestedExpanded = expandedNestedGroups();
    const query = props.filterQuery;
    const showHidden = props.showHidden;
    const compactFolders = props.compactFolders;
    const nestingSettings = props.fileNestingSettings;
    const sortOrder = props.sortOrder;
    
    const items: FlattenedItem[] = [];
    
    const processEntries = (
      entries: FileEntry[],
      depth: number,
      parentPath: string | null
    ) => {
      const filtered = filterEntries(entries, query, showHidden);
      const sorted = sortEntries(filtered, sortOrder);
      const compacted = compactFolderEntries(sorted, compactFolders, showHidden);
      const { groups, standalone } = computeNestedGroups(compacted, nestingSettings);
      
      for (const entry of standalone) {
        const nestedGroup = groups.get(entry.path);
        
        if (nestedGroup && !entry.isDir) {
          const isNestedExpanded = nestedExpanded.has(entry.path);
          
          items.push({
            id: entry.path,
            entry: entry as CompactedFileEntry,
            depth,
            isExpanded: false,
            isLoading: false,
            hasChildren: false,
            parentPath,
            isNestedParent: true,
            nestedFiles: nestedGroup.nestedFiles,
            isNestedExpanded,
          });
          
          if (isNestedExpanded) {
            for (const nestedFile of nestedGroup.nestedFiles) {
              items.push({
                id: nestedFile.path,
                entry: nestedFile as CompactedFileEntry,
                depth: depth + 1,
                isExpanded: false,
                isLoading: false,
                hasChildren: false,
                parentPath: entry.path,
                isNestedParent: false,
              });
            }
          }
        } else {
          const isDir = entry.isDir;
          const isExpanded = expanded.has(entry.path);
          const isLoading = loadingSet.has(entry.path);
          const children = cache.get(entry.path);
          const hasChildren = isDir && (children ? children.length > 0 : true);
          
          items.push({
            id: entry.path,
            entry: entry as CompactedFileEntry,
            depth,
            isExpanded,
            isLoading,
            hasChildren,
            parentPath,
            isNestedParent: false,
          });
          
          if (isDir && isExpanded && children) {
            processEntries(children, depth + 1, entry.path);
          }
        }
      }
    };
    
    const rootChildren = cache.get(root.path) || root.children || [];
    processEntries(rootChildren, 0, root.path);
    
    return items;
  });
  
  const visibleRange = createMemo(() => {
    const totalItems = flattenedItems().length;
    const scrollPosition = scrollTop();
    const viewportHeight = containerHeight();
    
    const startIndex = Math.max(0, Math.floor(scrollPosition / ITEM_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / ITEM_HEIGHT) + OVERSCAN * 2;
    const endIndex = Math.min(totalItems, startIndex + visibleCount);
    
    return { startIndex, endIndex };
  });
  
  const visibleItems = createMemo(() => {
    const items = flattenedItems();
    const { startIndex, endIndex } = visibleRange();
    return items.slice(startIndex, endIndex);
  });
  
  const gitDecorationsMap = createMemo(() => {
    const decorations = new Map<string, GitDecoration>();
    const items = visibleItems();
    
    for (const item of items) {
      const normalizedPath = item.entry.path.replace(/\\/g, "/");
      
      if (item.entry.isDir) {
        const folderStatus = props.gitFolderStatusMap.get(normalizedPath);
        if (folderStatus) {
          decorations.set(item.id, getFolderDecoration(
            folderStatus.hasConflicts,
            folderStatus.hasAdded,
            folderStatus.hasModified
          ));
        } else {
          decorations.set(item.id, { nameClass: "", status: null } as GitDecoration);
        }
      } else {
        const status = props.gitStatusMap.get(normalizedPath) || null;
        decorations.set(item.id, getGitDecorationForStatus(status));
      }
    }
    
    return decorations;
  });
  
  const totalHeight = createMemo(() => flattenedItems().length * ITEM_HEIGHT);
  const offsetY = createMemo(() => visibleRange().startIndex * ITEM_HEIGHT);
  const selectedPathsSet = createMemo(() => new Set(props.selectedPaths));
  
  let scrollRafId: number | null = null;
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLDivElement;
    const newScrollTop = target.scrollTop;
    
    if (scrollRafId !== null) {
      cancelAnimationFrame(scrollRafId);
    }
    
    scrollRafId = requestAnimationFrame(() => {
      setScrollTop(newScrollTop);
      scrollRafId = null;
    });
  };
  
  onCleanup(() => {
    if (resizeObserverRef) {
      resizeObserverRef.disconnect();
      resizeObserverRef = null;
    }
    if (scrollRafId !== null) {
      cancelAnimationFrame(scrollRafId);
    }
  });
  
  let cleanupRevealListener: (() => void) | null = null;

  onCleanup(() => {
    if (cleanupRevealListener) {
      cleanupRevealListener();
      cleanupRevealListener = null;
    }
  });

  onMount(async () => {
    const storageKey = `file_explorer_expanded_${hashString(props.rootPath)}`;
    const stored = safeGetItem(storageKey);
    let restoredPaths: string[] = [];
    if (stored) {
      try {
        restoredPaths = JSON.parse(stored) as string[];
        setExpandedPaths(new Set<string>(restoredPaths));
      } catch {
        // Ignore parse errors
      }
    }
    
    await loadRootDirectory();
    
    if (restoredPaths.length > 0) {
      await Promise.all(
        restoredPaths.map(path => loadDirectoryChildren(path).catch(() => {
          setExpandedPaths(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }))
      );
    }

    const handleReveal = async (e: CustomEvent<ExplorerRevealPayload>) => {
      const targetPath = e.detail.path;
      const rootPath = props.rootPath;
      const sep = rootPath.includes("\\") ? "\\" : "/";
      const normalizedTarget = targetPath.replace(/\\/g, "/");
      const normalizedRoot = rootPath.replace(/\\/g, "/");
      
      if (normalizedTarget.startsWith(normalizedRoot)) {
        const relative = normalizedTarget.slice(normalizedRoot.length).replace(/^[/\\]/, "");
        const parts = relative.split("/");
        let current = rootPath;
        
        for (const part of parts) {
          if (!part) continue;
          
          const pathToBeExpanded = current;
          setExpandedPaths(prev => {
            const next = new Set(prev);
            next.add(pathToBeExpanded);
            return next;
          });
          
          if (!directoryCache().has(pathToBeExpanded)) {
            await loadDirectoryChildren(pathToBeExpanded);
          }
          
          current = `${current}${sep}${part}`;
        }
        
        props.onSelectPaths([targetPath]);
        setLastSelectedPath(targetPath);
        
        setTimeout(() => {
          const index = flattenedItems().findIndex(item => 
            item.entry.path === targetPath
          );
          if (index !== -1 && containerRef) {
            containerRef.scrollTop = index * ITEM_HEIGHT - containerHeight() / 3;
          }
        }, 100);
      }
    };

    cleanupRevealListener = addAppEventListener("explorer:reveal", handleReveal);
  });
  
  let saveExpandedPathsTimeout: ReturnType<typeof setTimeout> | null = null;
  createEffect(() => {
    const storageKey = `file_explorer_expanded_${hashString(props.rootPath)}`;
    const paths = expandedPaths();
    
    if (saveExpandedPathsTimeout) {
      clearTimeout(saveExpandedPathsTimeout);
    }
    saveExpandedPathsTimeout = setTimeout(() => {
      safeSetItem(storageKey, JSON.stringify([...paths]));
    }, 200);
  });

  onCleanup(() => {
    if (saveExpandedPathsTimeout) {
      clearTimeout(saveExpandedPathsTimeout);
      saveExpandedPathsTimeout = null;
    }
  });
  
  createEffect(() => {
    const rootPath = props.rootPath;
    if (!rootPath) return;

    const newWatchId = `watch_${hashString(rootPath)}`;

    if (watchId() === newWatchId) return;

    if (watchId()) {
      invoke("fs_unwatch_directory", { watchId: watchId(), path: rootPath }).catch(console.error);
    }

    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }

    const excludePatterns = [
      "**/target/**",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/__pycache__/**",
      "**/venv/**",
      "**/.venv/**",
      "**/vendor/**",
      "**/.cargo/**",
    ];
    
    invoke("fs_watch_directory", { path: rootPath, watchId: newWatchId, excludePatterns })
      .then(() => setWatchId(newWatchId))
      .catch((err) => console.warn("Failed to watch directory:", err));

    let listenCancelled = false;
    const listenPromise = listen<{ watchId: string; paths: string[]; type: string }>("fs:change", (event) => {
      if (event.payload.watchId === newWatchId) {
        debouncedRefresh.call();
      }
    });

    listenPromise.then((fn) => {
      if (listenCancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    }).catch((err) => {
      console.warn("Failed to listen for fs:change events:", err);
    });

    onCleanup(() => {
      listenCancelled = true;
      if (untrack(() => watchId())) {
        invoke("fs_unwatch_directory", { watchId: untrack(() => watchId()), path: rootPath }).catch(console.error);
      }
      if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
      }
      debouncedRefresh.cancel();
    });
  });

  onMount(() => {
    const handleToggleSearchEvent = () => {};
    const handleNewFileEvent = () => {
      const rootPath = props.rootPath;
      if (rootPath) {
        const siblings = directoryCache().get(rootPath) ?? [];
        setFileOperationDialog({
          mode: "new-file",
          targetName: "",
          targetPaths: [],
          itemCount: 0,
          existingNames: siblings.map(s => s.name),
          parentPath: rootPath,
        });
      }
    };
    const handleNewFolderEvent = () => {
      const rootPath = props.rootPath;
      if (rootPath) {
        const siblings = directoryCache().get(rootPath) ?? [];
        setFileOperationDialog({
          mode: "new-folder",
          targetName: "",
          targetPaths: [],
          itemCount: 0,
          existingNames: siblings.map(s => s.name),
          parentPath: rootPath,
        });
      }
    };
    const handleRefreshEvent = () => {
      loadRootDirectory();
    };
    const handleCollapseAllEvent = () => {
      setExpandedPaths(new Set<string>());
    };

    window.addEventListener("fileexplorer:toggle-search", handleToggleSearchEvent);
    window.addEventListener("fileexplorer:new-file", handleNewFileEvent);
    window.addEventListener("fileexplorer:new-folder", handleNewFolderEvent);
    window.addEventListener("fileexplorer:refresh", handleRefreshEvent);
    window.addEventListener("fileexplorer:collapse-all", handleCollapseAllEvent);

    onCleanup(() => {
      window.removeEventListener("fileexplorer:toggle-search", handleToggleSearchEvent);
      window.removeEventListener("fileexplorer:new-file", handleNewFileEvent);
      window.removeEventListener("fileexplorer:new-folder", handleNewFolderEvent);
      window.removeEventListener("fileexplorer:refresh", handleRefreshEvent);
      window.removeEventListener("fileexplorer:collapse-all", handleCollapseAllEvent);
    });
  });
  
  const handleToggleExpand = async (path: string, additionalPaths?: string[]) => {
    const isCurrentlyExpanded = expandedPaths().has(path);
    
    batch(() => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        
        if (isCurrentlyExpanded) {
          next.delete(path);
          if (additionalPaths) {
            for (const p of additionalPaths) {
              next.delete(p);
            }
          }
        } else {
          next.add(path);
          if (additionalPaths) {
            for (const p of additionalPaths) {
              next.add(p);
            }
          }
        }
        return next;
      });
      
      if (!isCurrentlyExpanded) {
        const pathsToAnimate = [path, ...(additionalPaths || [])];
        setRecentlyExpandedPaths((prev) => {
          const next = new Set(prev);
          for (const p of pathsToAnimate) {
            next.add(p);
          }
          return next;
        });
        
        setTimeout(() => {
          setRecentlyExpandedPaths((prev) => {
            const next = new Set(prev);
            for (const p of pathsToAnimate) {
              next.delete(p);
            }
            return next;
          });
        }, 200);
      }
    });
    
    if (!isCurrentlyExpanded) {
      const pathsToLoad = [path, ...(additionalPaths || [])];
      const pathsNeedingLoad = pathsToLoad.filter(p => !directoryCache().has(p));
      
      if (pathsNeedingLoad.length > 0) {
        await Promise.all(pathsNeedingLoad.map(p => loadDirectoryChildren(p)));
      }
    }
  };
  
  const handleToggleNestedExpand = (parentPath: string) => {
    setExpandedNestedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(parentPath)) {
        next.delete(parentPath);
      } else {
        next.add(parentPath);
      }
      return next;
    });
  };
  
  const handleSelect = (path: string, event?: MouseEvent) => {
    const items = flattenedItems();
    const currentSelected = props.selectedPaths;
    
    if (event && (event.ctrlKey || event.metaKey)) {
      if (currentSelected.includes(path)) {
        props.onSelectPaths(currentSelected.filter(p => p !== path));
      } else {
        props.onSelectPaths([...currentSelected, path]);
      }
      setLastSelectedPath(path);
      return;
    }
    
    if (event && event.shiftKey && lastSelectedPath()) {
      const lastPath = lastSelectedPath()!;
      const lastIndex = items.findIndex(item => item.entry.path === lastPath);
      const currentIndex = items.findIndex(item => item.entry.path === path);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIndex = Math.min(lastIndex, currentIndex);
        const endIndex = Math.max(lastIndex, currentIndex);
        
        const rangePaths = items
          .slice(startIndex, endIndex + 1)
          .map(item => item.entry.path);
        
        props.onSelectPaths(rangePaths);
        return;
      }
    }
    
    props.onSelectPaths([path]);
    setLastSelectedPath(path);
  };
  
  const checkFileSizeAndOpen = async (entry: FileEntry, isPreview: boolean) => {
    if (entry.isDir) return;
    
    const maxSizeMB = props.maxMemoryForLargeFilesMB;
    if (maxSizeMB > 0) {
      try {
        const metadata = await invoke<{ size: number }>("fs_get_metadata", { path: entry.path });
        const fileSizeMB = metadata.size / (1024 * 1024);
        
        if (fileSizeMB > maxSizeMB) {
          setLargeFileWarning({
            path: entry.path,
            fileName: entry.name,
            fileSizeMB,
            isPreview,
          });
          return;
        }
      } catch (e) {
        console.warn("Could not get file metadata:", e);
      }
    }
    
    if (isPreview) {
      if (props.onFilePreview) {
        props.onFilePreview(entry.path);
      } else if (props.onFileSelect) {
        props.onFileSelect(entry.path);
      }
    } else {
      if (props.onFileSelect) {
        props.onFileSelect(entry.path);
      }
    }
  };
  
  const handleOpen = (entry: FileEntry) => {
    if (!entry.isDir && props.onFileSelect) {
      checkFileSizeAndOpen(entry, false);
    }
  };
  
  const handleOpenPreview = (entry: FileEntry) => {
    if (!entry.isDir) {
      checkFileSizeAndOpen(entry, true);
    }
  };
  
  const handleLargeFileConfirm = () => {
    const warning = largeFileWarning();
    if (warning) {
      setLargeFileWarning(null);
      if (warning.isPreview) {
        if (props.onFilePreview) {
          props.onFilePreview(warning.path);
        } else if (props.onFileSelect) {
          props.onFileSelect(warning.path);
        }
      } else {
        if (props.onFileSelect) {
          props.onFileSelect(warning.path);
        }
      }
    }
  };
  
  const handleLargeFileCancel = () => {
    setLargeFileWarning(null);
  };
  
  const handleContextMenu = (e: MouseEvent, item: FlattenedItem) => {
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      entry: item,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handlePaste = async (targetDir: string) => {
    const clipboard = clipboardFiles();
    if (!clipboard) return;

    try {
      for (const sourcePath of clipboard.paths) {
        const fileName = getBasename(sourcePath);
        const initialDestPath = joinPath(targetDir, fileName);

        if (clipboard.operation === 'cut') {
          const destPath = await generateUniquePath(initialDestPath);
          await fileOps.moveWithUndo(sourcePath, destPath);
        } else {
          await fileOps.copyWithUndo(sourcePath, initialDestPath);
        }
      }

      if (clipboard.operation === 'cut') {
        setClipboardFiles(null);
      }

      setDirectoryCache(prev => {
        const next = new Map(prev);
        next.delete(targetDir);
        if (clipboard.operation === 'cut') {
          for (const sourcePath of clipboard.paths) {
            const sourceDir = sourcePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
            next.delete(sourceDir);
          }
        }
        return next;
      });
      await loadDirectoryChildren(targetDir);
      debouncedRefresh.call();
    } catch (e) {
      console.error("Failed to paste:", e);
      toast.error(`Failed to paste: ${formatFileError(e)}`);
    }
  };

  const handleContextAction = async (action: string) => {
    const item = contextMenu().entry;
    if (!item) return;
    
    const entry = item.entry;
    handleCloseContextMenu();

    switch (action) {
      case "open":
        handleOpen(entry);
        break;

      case "openDefault":
        try {
          await invoke("fs_open_with_default", { path: entry.path });
        } catch (e) {
          console.error("Failed to open file:", e);
        }
        break;

      case "rename":
        setRenamingPath(entry.path);
        break;

      case "delete":
        {
          const pathsToDelete = props.selectedPaths.length > 1 && props.selectedPaths.includes(entry.path)
            ? props.selectedPaths
            : [entry.path];
          
          if (props.confirmDelete) {
            setFileOperationDialog({
              mode: "confirm-delete",
              targetName: entry.name,
              targetPaths: [...pathsToDelete],
              itemCount: pathsToDelete.length,
              existingNames: [],
              parentPath: "",
            });
          } else {
            await executeDelete(pathsToDelete);
          }
        }
        break;

      case "newFile":
        {
          const siblings = directoryCache().get(entry.path) ?? [];
          setFileOperationDialog({
            mode: "new-file",
            targetName: "",
            targetPaths: [],
            itemCount: 0,
            existingNames: siblings.map(s => s.name),
            parentPath: entry.path,
          });
        }
        break;

      case "newFolder":
        {
          const siblings = directoryCache().get(entry.path) ?? [];
          setFileOperationDialog({
            mode: "new-folder",
            targetName: "",
            targetPaths: [],
            itemCount: 0,
            existingNames: siblings.map(s => s.name),
            parentPath: entry.path,
          });
        }
        break;

      case "copyPath":
        try {
          await writeText(entry.path);
        } catch (e) {
          console.error("Failed to copy path:", e);
        }
        break;

      case "copyRelativePath":
        {
          const relative = entry.path.replace(props.rootPath, "").replace(/^[/\\]/, "");
          try {
            await writeText(relative);
          } catch (e) {
            console.error("Failed to copy path:", e);
          }
        }
        break;

      case "reveal":
        try {
          await invoke("fs_reveal_in_explorer", { path: entry.path });
        } catch (e) {
          console.error("Failed to reveal:", e);
        }
        break;

      case "cut":
        setClipboardFiles({ paths: [entry.path], operation: 'cut' });
        break;

      case "copy":
        setClipboardFiles({ paths: [entry.path], operation: 'copy' });
        break;

      case "paste":
        await handlePaste(entry.isDir ? entry.path : item.parentPath || props.rootPath);
        break;

      case "duplicate":
        {
          const pathsToDuplicate = props.selectedPaths.length > 1 && props.selectedPaths.includes(entry.path)
            ? props.selectedPaths
            : [entry.path];
          
          try {
            const newPaths: string[] = [];
            for (const pathToDuplicate of pathsToDuplicate) {
              const items = flattenedItems();
              const itemToDuplicate = items.find(i => i.entry.path === pathToDuplicate);
              if (itemToDuplicate) {
                const newPath = await fileOps.duplicateWithUndo(pathToDuplicate, itemToDuplicate.entry.isDir);
                newPaths.push(newPath);
              }
            }
            if (newPaths.length > 0) {
              props.onSelectPaths(newPaths);
            }
            debouncedRefresh.call();
          } catch (e) {
            console.error("Failed to duplicate:", e);
            toast.error(`Failed to duplicate: ${formatFileError(e)}`);
          }
        }
        break;
    }
  };

  const executeDelete = async (pathsToDelete: string[]) => {
    try {
      for (const pathToDelete of pathsToDelete) {
        const items = flattenedItems();
        const itemToDelete = items.find(i => i.entry.path === pathToDelete);
        if (itemToDelete) {
          const isDir = itemToDelete.entry.isDir;
          
          if (props.enableTrash) {
            await fileOps.deleteWithUndo(pathToDelete, isDir);
          } else {
            if (isDir) {
              await fsDeleteDirectory(pathToDelete, true);
            } else {
              await fsDeleteFile(pathToDelete);
            }
          }
        }
      }
      props.onSelectPaths([]);
      debouncedRefresh.call();
    } catch (e) {
      console.error("Failed to delete:", e);
      toast.error(`Failed to delete: ${formatFileError(e)}`);
    }
  };

  const handleConfirmDelete = () => {
    const state = fileOperationDialog();
    if (state && state.mode === "confirm-delete") {
      const paths = [...state.targetPaths];
      setFileOperationDialog(null);
      executeDelete(paths);
    }
  };

  const handleCreateItem = async (name: string) => {
    const state = fileOperationDialog();
    if (!state) return;
    const parentPath = state.parentPath;
    const mode = state.mode;
    setFileOperationDialog(null);

    const newPath = `${parentPath}/${name}`.replace(/\\/g, "/");
    try {
      if (mode === "new-file") {
        await fileOps.createFileWithUndo(newPath);
      } else {
        await fileOps.createDirectoryWithUndo(newPath);
      }
      await loadDirectoryChildren(parentPath);
      setExpandedPaths((prev) => new Set([...prev, parentPath]));
      props.onSelectPaths([newPath]);
    } catch (e) {
      const itemType = mode === "new-file" ? "file" : "folder";
      console.error(`Failed to create ${itemType}:`, e);
      toast.error(`Failed to create ${itemType}: ${formatFileError(e)}`);
    }
  };
  
  const INVALID_NAME_CHARS = /[/\\:*?"<>|]/;
  const RESERVED_OS_NAMES = new Set([
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
  ]);

  const validateRename = (oldPath: string, newName: string): string | null => {
    if (!newName || !newName.trim()) {
      return "Name cannot be empty";
    }

    if (newName !== newName.trim()) {
      return "Name cannot start or end with whitespace";
    }

    const invalidMatch = newName.match(INVALID_NAME_CHARS);
    if (invalidMatch) {
      return `Name contains invalid character: ${invalidMatch[0]}`;
    }

    if (newName === "." || newName === "..") {
      return "Name is reserved";
    }

    if (newName.endsWith(".") || newName.endsWith(" ")) {
      return "Name cannot end with a dot or space";
    }

    const baseName = newName.includes(".") ? newName.substring(0, newName.lastIndexOf(".")) : newName;
    if (RESERVED_OS_NAMES.has(baseName.toUpperCase())) {
      return "Name is reserved by the operating system";
    }

    const parentPath = oldPath.replace(/[/\\][^/\\]+$/, "");
    const siblings = directoryCache().get(parentPath);
    if (siblings) {
      const currentName = oldPath.replace(/^.*[/\\]/, "");
      const duplicate = siblings.some(
        (entry) => entry.name === newName && entry.name !== currentName
      );
      if (duplicate) {
        return "A file or folder with that name already exists";
      }
    }

    return null;
  };

  const handleRename = async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    
    const items = flattenedItems();
    const item = items.find(i => i.entry.path === oldPath);
    if (!item || item.entry.name === newName) return;

    const error = validateRename(oldPath, newName);
    if (error) return;

    const parentPath = oldPath.replace(/[/\\][^/\\]+$/, "");
    const newPath = `${parentPath}/${newName}`.replace(/\\/g, "/");

    try {
      await fileOps.renameWithUndo(oldPath, newPath);
      setDirectoryCache(prev => {
        const next = new Map(prev);
        next.delete(parentPath);
        return next;
      });
      await loadDirectoryChildren(parentPath);
      props.onSelectPaths([newPath]);
    } catch (e) {
      console.error("Failed to rename:", e);
      toast.error(`Failed to rename: ${formatFileError(e)}`);
    }
  };
  
  let autoExpandTimeout: number | null = null;

  onCleanup(() => {
    if (autoExpandTimeout) {
      clearTimeout(autoExpandTimeout);
      autoExpandTimeout = null;
    }
  });

  const handleDragStart = (e: DragEvent, entry: FileEntry) => {
    const selected = props.selectedPaths;
    const pathsToDrag = selected.includes(entry.path) ? selected : [entry.path];
    
    setDraggedPaths(pathsToDrag);
    
    const isCopy = e.ctrlKey || e.metaKey;
    setIsDragCopy(isCopy);
    
    e.dataTransfer!.effectAllowed = isCopy ? "copy" : "all";
    
    const pathsJson = JSON.stringify(pathsToDrag);
    e.dataTransfer!.setData("text/plain", pathsJson);
    e.dataTransfer!.setData("application/x-cortex-paths", pathsJson);
    
    try {
      const fileUrls = pathsToDrag.map(p => {
        const normalized = p.replace(/\\/g, '/');
        const encoded = normalized.split('/').map(segment => encodeURIComponent(segment)).join('/');
        return `file://${encoded}`;
      }).join('\n');
      e.dataTransfer!.setData("text/uri-list", fileUrls);
    } catch (err) {
      console.warn("Failed to set uri-list data:", err);
    }

    const dragGhost = document.createElement("div");
    dragGhost.style.position = "absolute";
    dragGhost.style.top = "-1000px";
    dragGhost.style.left = "-1000px";
    dragGhost.style.display = "flex";
    dragGhost.style.alignItems = "center";
    dragGhost.style.gap = "6px";
    dragGhost.style.padding = `${tokens.spacing.sm} ${tokens.spacing.md}`;
    dragGhost.style.background = tokens.colors.surface.panel;
    dragGhost.style.color = tokens.colors.text.primary;
    dragGhost.style.border = `1px solid ${tokens.colors.border.default}`;
    dragGhost.style.borderRadius = tokens.radius.sm;
    dragGhost.style.fontSize = "var(--jb-text-muted-size)";
    dragGhost.style.whiteSpace = "nowrap";
    dragGhost.style.boxShadow = "var(--jb-shadow-popup)";
    dragGhost.style.zIndex = "9999";
    dragGhost.id = "drag-ghost-element";

    if (isCopy) {
      const copyIndicator = document.createElement("span");
      copyIndicator.innerText = "+";
      copyIndicator.style.fontWeight = "bold";
      copyIndicator.style.color = "var(--jb-icon-color-active)";
      copyIndicator.style.marginRight = "2px";
      dragGhost.appendChild(copyIndicator);
    }

    const icon = document.createElement("img");
    icon.src = getFileIconSvg(entry.name, entry.isDir, false);
    icon.style.width = "16px";
    icon.style.height = "16px";
    dragGhost.appendChild(icon);

    const name = document.createElement("span");
    name.innerText = pathsToDrag.length > 1 ? `${pathsToDrag.length} items` : entry.name;
    dragGhost.appendChild(name);

    document.body.appendChild(dragGhost);
    
    e.dataTransfer!.setDragImage(dragGhost, -10, -10);
    
    setTimeout(() => {
      if (document.body.contains(dragGhost)) {
        document.body.removeChild(dragGhost);
      }
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedPaths([]);
    setDragOverPath(null);
    setIsDragCopy(false);
    if (autoExpandTimeout) clearTimeout(autoExpandTimeout);
  };

  const handleDragOver = (e: DragEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();

    const dragged = draggedPaths();
    
    const isCopy = e.ctrlKey || e.metaKey;
    setIsDragCopy(isCopy);
    
    if (dragged.length === 0) {
      e.dataTransfer!.dropEffect = "copy";
      return;
    }

    const isValidInternalTarget = entry.isDir && !dragged.includes(entry.path) && !dragged.some(p => entry.path.startsWith(p + "/"));
    
    if (isValidInternalTarget) {
      e.dataTransfer!.dropEffect = isCopy ? "copy" : "move";
      if (dragOverPath() !== entry.path) {
        setDragOverPath(entry.path);
        
        if (autoExpandTimeout) clearTimeout(autoExpandTimeout);
        if (!expandedPaths().has(entry.path)) {
          autoExpandTimeout = window.setTimeout(() => {
            handleToggleExpand(entry.path);
          }, 800);
        }
      }
    } else {
      e.dataTransfer!.dropEffect = "copy";
      if (dragOverPath() !== null) setDragOverPath(null);
    }
  };

  const executeDropOperation = async (sourcePaths: string[], targetDir: string, isCopy: boolean) => {
    const operationPromises = sourcePaths.map(async (sourcePath) => {
      const name = getBasename(sourcePath);
      const initialPath = joinPath(targetDir, name);
      
      if (sourcePath === initialPath) return { status: "skipped" as const };
      if (targetDir.startsWith(sourcePath + "/")) return { status: "skipped" as const };

      if (isCopy) {
        const newPath = await fileOps.copyWithUndo(sourcePath, initialPath);
        return { status: "ok" as const, sourcePath, newPath };
      } else {
        const newPath = await generateUniquePath(initialPath);
        await fileOps.moveWithUndo(sourcePath, newPath);
        return { status: "ok" as const, sourcePath, newPath };
      }
    });

    const settled = await Promise.allSettled(operationPromises);

    const succeeded: Array<{ sourcePath: string; newPath: string }> = [];
    const failures: string[] = [];

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value.status === "ok") {
        succeeded.push(result.value);
      } else if (result.status === "rejected") {
        failures.push(formatFileError(result.reason));
      }
    }

    if (succeeded.length > 0) {
      batch(() => {
        const affectedDirs = new Set<string>([targetDir]);
        if (!isCopy) {
          succeeded.forEach(r => {
            const sourceParent = r.sourcePath.replace(/[/\\][^/\\]+$/, "");
            affectedDirs.add(sourceParent);
          });
        }

        setDirectoryCache(prev => {
          const next = new Map(prev);
          affectedDirs.forEach(dir => next.delete(dir));
          return next;
        });
        
        affectedDirs.forEach(dir => loadDirectoryChildren(dir));
      });

      const newSelected = succeeded.map(r => r.newPath);
      props.onSelectPaths(newSelected);
    }

    if (failures.length > 0) {
      const action = isCopy ? "copy" : "move";
      if (succeeded.length > 0) {
        toast.error(`Some files could not be ${action}d: ${failures.join(", ")}`);
      } else {
        toast.error(`Failed to ${action} files: ${failures.join(", ")}`);
      }
    }
  };

  const handleConfirmDrop = async () => {
    const pending = pendingDropOperation();
    if (pending) {
      await executeDropOperation(pending.sourcePaths, pending.targetDir, pending.isCopy);
      setPendingDropOperation(null);
    }
  };

  const handleCancelDrop = () => {
    setPendingDropOperation(null);
  };

  const handleDrop = async (e: DragEvent, targetEntry: FileEntry) => {
    e.preventDefault();
    const sourcePaths = draggedPaths();
    
    const isCopy = e.ctrlKey || e.metaKey;
    
    setDraggedPaths([]);
    setDragOverPath(null);
    setIsDragCopy(false);
    if (autoExpandTimeout) clearTimeout(autoExpandTimeout);

    if (sourcePaths.length === 0) return;

    const targetDir = targetEntry.isDir ? targetEntry.path : targetEntry.path.replace(/[/\\][^/\\]+$/, "");
    const targetName = targetDir.split(/[/\\]/).pop() || "folder";
    
    if (props.confirmDragAndDrop) {
      setPendingDropOperation({
        sourcePaths: [...sourcePaths],
        targetDir,
        targetName,
        isCopy,
      });
    } else {
      await executeDropOperation(sourcePaths, targetDir, isCopy);
    }
  };

  const handleContainerDragOver = (e: DragEvent) => {
    e.preventDefault();
    
    const isCopy = e.ctrlKey || e.metaKey;
    setIsDragCopy(isCopy);
    
    if (draggedPaths().length > 0) {
      e.dataTransfer!.dropEffect = isCopy ? "copy" : "move";
      setDragOverPath(props.rootPath);
    } else {
      e.dataTransfer!.dropEffect = "copy";
    }
  };

  const handleContainerDrop = async (e: DragEvent) => {
    if (props.rootPath) {
      await handleDrop(e, { path: props.rootPath, isDir: true, name: "root" } as FileEntry);
    }
  };

  const isCutFile = (path: string): boolean => {
    const clipboard = clipboardFiles();
    return clipboard?.operation === 'cut' && clipboard.paths.includes(path);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const selected = props.selectedPaths;
    if (selected.length === 0) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault();
      setClipboardFiles({ paths: [...selected], operation: 'cut' });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      setClipboardFiles({ paths: [...selected], operation: 'copy' });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      const clipboard = clipboardFiles();
      if (!clipboard) return;

      const firstSelected = selected[0];
      const items = flattenedItems();
      const selectedItem = items.find(item => item.entry.path === firstSelected);
      
      if (selectedItem) {
        const targetDir = selectedItem.entry.isDir 
          ? selectedItem.entry.path 
          : (selectedItem.parentPath || props.rootPath);
        handlePaste(targetDir);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      
      const items = flattenedItems();
      const duplicatePromises = selected.map(async (path) => {
        const item = items.find(i => i.entry.path === path);
        if (item) {
          return fileOps.duplicateWithUndo(path, item.entry.isDir);
        }
        return null;
      });
      
      Promise.all(duplicatePromises)
        .then((newPaths) => {
          const validPaths = newPaths.filter((p): p is string => p !== null);
          if (validPaths.length > 0) {
            props.onSelectPaths(validPaths);
          }
          debouncedRefresh.call();
        })
        .catch((err) => {
          console.error("Failed to duplicate:", err);
          toast.error(`Failed to duplicate: ${formatFileError(err)}`);
        });
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      const focusPath = focusedPath();
      if (focusPath) {
        const items = flattenedItems();
        const item = items.find(i => i.entry.path === focusPath);
        if (item) {
          setContextMenu({ visible: false, x: 0, y: 0, entry: item });
          handleContextAction("delete");
        }
      }
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      const focusPath = focusedPath();
      if (focusPath) {
        setRenamingPath(focusPath);
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const items = flattenedItems();
      if (items.length === 0) return;

      const currentFocus = focusedPath();
      const currentIndex = currentFocus
        ? items.findIndex(i => i.entry.path === currentFocus)
        : -1;

      let newIndex: number;
      switch (e.key) {
        case 'ArrowUp':
          newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
          break;
        case 'ArrowDown':
          newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : items.length - 1;
          break;
        case 'Home':
          newIndex = 0;
          break;
        case 'End':
          newIndex = items.length - 1;
          break;
        default:
          return;
      }

      const newItem = items[newIndex];
      if (newItem) {
        setFocusedPath(newItem.entry.path);
        props.onSelectPaths([newItem.entry.path]);
        setLastSelectedPath(newItem.entry.path);

        if (containerRef) {
          const itemTop = newIndex * ITEM_HEIGHT;
          const itemBottom = itemTop + ITEM_HEIGHT;
          const viewTop = containerRef.scrollTop;
          const viewBottom = viewTop + containerHeight();

          if (itemTop < viewTop) {
            containerRef.scrollTop = itemTop;
          } else if (itemBottom > viewBottom) {
            containerRef.scrollTop = itemBottom - containerHeight();
          }
        }
      }
      return;
    }
  };

  return {
    loading,
    error,
    rootEntry,
    loadRootDirectory,
    flattenedItems,
    visibleItems,
    visibleRange,
    gitDecorationsMap,
    totalHeight,
    offsetY,
    selectedPathsSet,
    handleScroll,
    setContainerRef,
    focusedPath,
    renamingPath,
    dragOverPath,
    isDragCopy,
    draggedPaths,
    recentlyExpandedPaths,
    loadingDirs,
    contextMenu,
    clipboardFiles,
    pendingDropOperation,
    largeFileWarning,
    handleToggleExpand,
    handleToggleNestedExpand,
    handleSelect,
    handleOpen,
    handleOpenPreview,
    handleContextMenu,
    handleCloseContextMenu,
    handleContextAction,
    validateRename,
    handleRename,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    handleContainerDragOver,
    handleContainerDrop,
    handleConfirmDrop,
    handleCancelDrop,
    handleLargeFileConfirm,
    handleLargeFileCancel,
    handleKeyDown,
    isCutFile,
    setFocusedPath,
    setDragOverPath,
    fileOperationDialog,
    setFileOperationDialog,
    handleConfirmDelete,
    handleCreateItem,
  };
}
