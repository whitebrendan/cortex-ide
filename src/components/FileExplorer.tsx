import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import { Icon } from "./ui/Icon";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  useSettings,
  type FileNestingSettings,
  type ExplorerSortOrder,
} from "../context/SettingsContext";
import { useMultiRepo, type GitFileStatus } from "../context/MultiRepoContext";

import { tokens } from "@/design-system/tokens";
import { loadStylesheet } from "@/utils/lazyStyles";
loadStylesheet("tree");

import { ExplorerWelcome } from "./WelcomeView";

import { VirtualizedFileTree } from "./explorer/VirtualizedFileTree";
import { WorkspaceFolderHeader } from "./explorer/WorkspaceFolderHeader";
import { clearFileExplorerCaches } from "./explorer/icons";
import { extractProjectName } from "./explorer/utils";
import type { FileExplorerProps } from "./explorer/types";

export { clearFileExplorerCaches };

export function FileExplorer(props: FileExplorerProps) {
  let workspace: ReturnType<typeof useWorkspace> | null = null;
  try {
    workspace = useWorkspace();
  } catch {
    // Workspace context not available
  }

  let settingsContext: ReturnType<typeof useSettings> | null = null;
  try {
    settingsContext = useSettings();
  } catch {
    // Settings context not available
  }

  let multiRepo: ReturnType<typeof useMultiRepo> | null = null;
  try {
    multiRepo = useMultiRepo();
  } catch {
    // Git context not available
  }
  
  const compactFolders = createMemo(() => 
    settingsContext?.state.settings.explorer?.compactFolders ?? true
  );

  const fileNestingSettings = createMemo((): FileNestingSettings => 
    settingsContext?.state.settings.explorer?.fileNesting ?? {
      enabled: true,
      patterns: {
        "*.ts": "${basename}.js, ${basename}.d.ts, ${basename}.map, ${basename}.js.map",
        "*.tsx": "${basename}.js, ${basename}.d.ts, ${basename}.map, ${basename}.js.map",
        "package.json": "package-lock.json, yarn.lock, pnpm-lock.yaml, .npmrc, .yarnrc, .yarnrc.yml",
        "tsconfig.json": "tsconfig.*.json",
        ".env": ".env.*, .env.local, .env.development, .env.production, .env.test",
      },
    }
  );

  const confirmDragAndDrop = createMemo(() => 
    settingsContext?.state.settings.files?.confirmDragAndDrop ?? true
  );

  const confirmDelete = createMemo(() => 
    settingsContext?.state.settings.files?.confirmDelete ?? true
  );

  const enableTrash = createMemo(() => 
    settingsContext?.state.settings.files?.enableTrash ?? true
  );

  const maxMemoryForLargeFilesMB = createMemo(() => 
    settingsContext?.state.settings.files?.maxMemoryForLargeFilesMB ?? 4096
  );

  const indentGuidesEnabled = createMemo(() => 
    settingsContext?.state.settings.explorer?.indentGuidesEnabled ?? true
  );

  const sortOrder = createMemo((): ExplorerSortOrder => 
    settingsContext?.state.settings.explorer?.sortOrder ?? "default"
  );

  const enablePreview = createMemo(() => 
    settingsContext?.state.settings.editor?.enablePreview ?? true
  );

  const gitStatusMap = createMemo(() => {
    const statusMap = new Map<string, GitFileStatus>();
    if (!multiRepo) return statusMap;
    
    const repositories = multiRepo.repositories();
    for (const repo of repositories) {
      for (const file of repo.stagedFiles) {
        const normalizedPath = file.path.replace(/\\/g, "/");
        statusMap.set(normalizedPath, file.status);
      }
      for (const file of repo.unstagedFiles) {
        const normalizedPath = file.path.replace(/\\/g, "/");
        statusMap.set(normalizedPath, file.status);
      }
      for (const file of repo.conflictFiles) {
        const normalizedPath = file.path.replace(/\\/g, "/");
        statusMap.set(normalizedPath, file.status);
      }
    }
    return statusMap;
  });

  const [gitFolderStatusMap, setGitFolderStatusMap] = createSignal<Map<string, { hasConflicts: boolean; hasAdded: boolean; hasModified: boolean }>>(new Map());
  
  let folderStatusTimeoutId: ReturnType<typeof setTimeout> | null = null;
  
  createEffect(() => {
    const statusMap = gitStatusMap();
    
    if (folderStatusTimeoutId) {
      clearTimeout(folderStatusTimeoutId);
    }
    
    folderStatusTimeoutId = setTimeout(() => {
      const compute = () => {
        const folderMap = new Map<string, { hasConflicts: boolean; hasAdded: boolean; hasModified: boolean }>();
        const propagated = new Set<string>();
        
        for (const [filePath, status] of statusMap) {
          let currentPath = filePath;
          let lastSlash = currentPath.lastIndexOf("/");
          
          while (lastSlash > 0) {
            currentPath = currentPath.slice(0, lastSlash);
            
            const key = `${currentPath}:${status}`;
            if (propagated.has(key)) break;
            propagated.add(key);
            
            let existing = folderMap.get(currentPath);
            if (!existing) {
              existing = { hasConflicts: false, hasAdded: false, hasModified: false };
              folderMap.set(currentPath, existing);
            }
            
            if (status === "conflict") {
              existing.hasConflicts = true;
            } else if (status === "added" || status === "untracked") {
              existing.hasAdded = true;
            } else if (status === "modified" || status === "deleted" || status === "renamed") {
              existing.hasModified = true;
            }
            
            lastSlash = currentPath.lastIndexOf("/");
          }
        }
        
        setGitFolderStatusMap(folderMap);
      };
      
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(compute, { timeout: 100 });
      } else {
        compute();
      }
    }, 50);
  });

  onCleanup(() => {
    if (folderStatusTimeoutId) {
      clearTimeout(folderStatusTimeoutId);
      folderStatusTimeoutId = null;
    }
  });

  const [showHidden, _setShowHidden] = createSignal(false);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [showSearch, setShowSearch] = createSignal(false);
  const [showSortMenu, setShowSortMenu] = createSignal(false);
  const [selectedPaths, setSelectedPaths] = createSignal<string[]>([]);
  const [expandedFolders, setExpandedFolders] = createSignal<Set<string>>(new Set());
  const [draggingFolderIndex, setDraggingFolderIndex] = createSignal<number | null>(null);

  let containerRef: HTMLDivElement | undefined;
  let sortMenuRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (showSortMenu()) {
      const handleClickOutside = (e: MouseEvent) => {
        if (sortMenuRef && !sortMenuRef.contains(e.target as Node)) {
          setShowSortMenu(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
    }
  });

  const displayFolders = createMemo(() => {
    if (workspace && workspace.folders().length > 0) {
      return workspace.folders();
    }
    if (props.rootPath) {
      return [{
        path: props.rootPath,
        name: extractProjectName(props.rootPath),
      }];
    }
    return [];
  });

  const isFolderExpanded = (path: string) => expandedFolders().has(path);

  const toggleFolderExpanded = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  onMount(() => {
    const folders = displayFolders();
    if (folders.length > 0) {
      setExpandedFolders(new Set(folders.map(f => f.path)));
    }
  });

  createEffect(() => {
    const folders = displayFolders();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const folder of folders) {
        if (!next.has(folder.path)) {
          next.add(folder.path);
        }
      }
      return next;
    });
  });

  const handleFolderDragStart = (e: DragEvent, index: number) => {
    setDraggingFolderIndex(index);
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", String(index));
  };

  const handleFolderDragOver = (e: DragEvent, index: number) => {
    const dragIndex = draggingFolderIndex();
    if (dragIndex !== null && dragIndex !== index) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    }
  };

  const handleFolderDrop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = draggingFolderIndex();
    if (sourceIndex !== null && sourceIndex !== targetIndex && workspace) {
      workspace.reorderFolders(sourceIndex, targetIndex);
    }
    setDraggingFolderIndex(null);
  };

  const handleFolderDragEnd = () => {
    setDraggingFolderIndex(null);
  };

  const handleOpenFolder = () => {
    window.dispatchEvent(new CustomEvent('folder:open'));
  };

  const handleAddFolder = async () => {
    if (workspace) {
      await workspace.addFolderWithPicker();
    } else {
      await handleOpenFolder();
    }
  };

  const explorerTitle = createMemo(() => {
    const folders = displayFolders();
    if (folders.length === 0) return "Explorer";
    if (folders.length === 1) return folders[0].name;
    return "Project";
  });

  return (
    <div
      ref={containerRef}
      class="file-explorer"
      tabIndex={-1}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      }}
    >
      {/* Header with title and action buttons */}
      <div
        class="file-explorer-header"
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          padding: "0 16px",
          height: "20px",
          "flex-shrink": "0",
          background: "transparent",
          border: "none",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
          <span
            style={{
              "font-family": "'Figtree', var(--cortex-font-sans, 'DM Sans', sans-serif)",
              "font-size": "16px",
              "font-weight": "600",
              "line-height": "20px",
              color: "var(--cortex-text-primary)",
            }}
          >
            {explorerTitle()}
          </span>
          <Icon name="chevron-down" size={16} color="var(--cortex-text-muted, var(--cortex-text-inactive))" />
        </div>

        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <button
            onClick={() => setShowSearch(!showSearch())}
            title="Search (Ctrl+Shift+F)"
            style={{
              width: "20px",
              height: "20px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0",
              color: "var(--cortex-text-muted, var(--cortex-text-inactive))",
            }}
          >
            <Icon name="magnifying-glass" size={16} />
          </button>
          <button
            onClick={handleAddFolder}
            title="New File"
            style={{
              width: "20px",
              height: "20px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0",
              color: "var(--cortex-text-muted, var(--cortex-text-inactive))",
            }}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("explorer:refresh"))}
            title="Refresh"
            style={{
              width: "20px",
              height: "20px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0",
              color: "var(--cortex-text-muted, var(--cortex-text-inactive))",
            }}
          >
            <Icon name="arrows-rotate" size={16} />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("explorer:collapse-all"))}
            title="Collapse All"
            style={{
              width: "20px",
              height: "20px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0",
              color: "var(--cortex-text-muted, var(--cortex-text-inactive))",
            }}
          >
            <Icon name="chevrons-up" size={16} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <Show when={showSearch()}>
        <div
          style={{
            padding: `${tokens.spacing.sm} ${tokens.spacing.sm} 0 ${tokens.spacing.sm}`,
            "margin-bottom": tokens.spacing.sm,
            background: tokens.colors.surface.panel,
          }}
        >
          <div
            class="file-explorer-search-wrapper"
            style={{
              display: "flex",
              "align-items": "center",
              width: "100%",
              padding: `6px ${tokens.spacing.lg}`,
              background: tokens.colors.surface.canvas,
              border: `1px solid ${tokens.colors.border.default}`,
              "border-radius": tokens.radius.sm,
            }}
          >
            <Icon
              name="magnifying-glass"
              size={14}
              style={{ color: tokens.colors.icon.default, "margin-right": tokens.spacing.md, "flex-shrink": "0" }}
            />
            <input
              type="text"
              placeholder="Filter files..."
              value={filterQuery()}
              onInput={(e) => setFilterQuery(e.currentTarget.value)}
              style={{
                flex: "1",
                padding: "0",
                "font-size": "var(--jb-text-body-size)",
                color: tokens.colors.text.primary,
                background: "transparent",
                border: "none",
                outline: "none",
              }}
              onFocus={(e) => {
                const wrapper = e.currentTarget.parentElement;
                if (wrapper) wrapper.style.borderColor = tokens.colors.semantic.primary;
              }}
              onBlur={(e) => {
                const wrapper = e.currentTarget.parentElement;
                if (wrapper) wrapper.style.borderColor = tokens.colors.border.default;
              }}
              autofocus
            />
            <Show when={filterQuery()}>
              <button
                onClick={() => setFilterQuery("")}
                title="Clear filter"
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  width: "16px",
                  height: "16px",
                  "margin-left": tokens.spacing.sm,
                  "border-radius": "var(--cortex-radius-full)",
                  "font-size": "14px",
                  color: tokens.colors.icon.default,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </Show>
          </div>
        </div>
      </Show>

      {/* Content */}
      <div 
        class="file-explorer-content" 
        role="tree" 
        aria-label="File explorer"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = "copy";
        }}
      >
        {/* No folder open - Welcome View */}
        <Show when={displayFolders().length === 0}>
          <ExplorerWelcome
            onOpenFolder={handleOpenFolder}
            onCloneRepo={() => {
              const url = prompt("Enter Git repository URL:");
              if (url) {
                window.dispatchEvent(new CustomEvent("git:clone", { detail: { url } }));
              }
            }}
            recentWorkspaces={workspace?.recentWorkspaces().map(r => ({
              name: r.name,
              path: r.path,
              type: r.isWorkspaceFile ? "workspace" : "folder" as const,
            }))}
            onOpenRecent={(path, type) => {
              if (type === "folder") {
                workspace?.addFolder(path);
              } else {
                workspace?.openWorkspaceFile();
              }
            }}
          />
        </Show>

        {/* Multi-root workspace folders */}
        <Show when={displayFolders().length > 0}>
          <For each={displayFolders()}>
            {(folder, index) => (
              <div class="workspace-folder-section">
                <Show when={displayFolders().length > 1}>
                  <WorkspaceFolderHeader
                    folder={folder}
                    isExpanded={isFolderExpanded(folder.path)}
                    isActive={workspace?.activeFolder() === folder.path}
                    folderIndex={index()}
                    totalFolders={displayFolders().length}
                    onToggle={() => toggleFolderExpanded(folder.path)}
                    onRemove={() => workspace?.removeFolder(folder.path)}
                    onSetActive={() => workspace?.setActiveFolder(folder.path)}
                    onRename={(name) => workspace?.setFolderName(folder.path, name)}
                    onSetColor={(color) => workspace?.setFolderColor(folder.path, color)}
                    onDragStart={(e) => handleFolderDragStart(e, index())}
                    onDragOver={(e) => handleFolderDragOver(e, index())}
                    onDrop={(e) => handleFolderDrop(e, index())}
                    onDragEnd={handleFolderDragEnd}
                  />
                </Show>

                <Show when={isFolderExpanded(folder.path) || displayFolders().length === 1}>
                  <div 
                    class="workspace-folder-contents"
                    classList={{ "workspace-folder-contents--indented": displayFolders().length > 1 }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer!.dropEffect = "copy";
                    }}
                  >
                    <VirtualizedFileTree
                      rootPath={folder.path}
                      onFileSelect={props.onFileSelect}
                      onFilePreview={props.onFilePreview}
                      enablePreview={enablePreview()}
                      selectedPaths={selectedPaths()}
                      onSelectPaths={setSelectedPaths}
                      showHidden={showHidden()}
                      filterQuery={filterQuery()}
                      compactFolders={compactFolders()}
                      fileNestingSettings={fileNestingSettings()}
                      confirmDragAndDrop={confirmDragAndDrop()}
                      indentGuidesEnabled={indentGuidesEnabled()}
                      sortOrder={sortOrder()}
                      gitStatusMap={gitStatusMap()}
                      gitFolderStatusMap={gitFolderStatusMap()}
                      confirmDelete={confirmDelete()}
                      enableTrash={enableTrash()}
                      maxMemoryForLargeFilesMB={maxMemoryForLargeFilesMB()}
                    />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
