import { Show, For } from "solid-js";
import { SidebarSkeleton } from "../ui/SidebarSkeleton";
import { ContextMenu, ContextMenuPresets } from "../ui/ContextMenu";
import { VirtualItem, SkeletonLoader } from "./VirtualItem";
import { DragConfirmDialog } from "./DragConfirmDialog";
import { LargeFileWarningDialog } from "./LargeFileWarningDialog";
import { FileOperationDialog } from "./FileOperationDialog";
import { useFileTree } from "./useFileTree";
import type { VirtualizedFileTreeProps } from "./types";

export function VirtualizedFileTree(props: VirtualizedFileTreeProps) {
  const tree = useFileTree(props);

  return (
    <div 
      class="virtualized-file-tree" 
      onKeyDown={tree.handleKeyDown} 
      onDragOver={tree.handleContainerDragOver}
      onDrop={tree.handleContainerDrop}
      onDragLeave={() => tree.setDragOverPath(null)}
      tabIndex={-1}
    >
      <Show when={tree.loading() && !tree.rootEntry()}>
        <SidebarSkeleton />
      </Show>

      <Show when={tree.error()}>
        <div class="file-explorer-error">
          <p>{tree.error()}</p>
          <button onClick={tree.loadRootDirectory} class="file-explorer-retry">
            Retry
          </button>
        </div>
      </Show>

      <Show when={tree.rootEntry() && !tree.error()}>
        <div 
          ref={tree.setContainerRef}
          class="virtual-scroll-container"
          classList={{ 
            "virtual-scroll-container--drag-over": tree.dragOverPath() === props.rootPath,
            "virtual-scroll-container--drag-copy": tree.dragOverPath() === props.rootPath && tree.isDragCopy(),
          }}
          onScroll={tree.handleScroll}
          role="tree"
          aria-label="File tree"
        >
          <div 
            class="virtual-scroll-spacer"
            style={{ height: `${tree.totalHeight()}px` }}
          >
            <div 
              class="virtual-scroll-content"
              style={{ transform: `translateY(${tree.offsetY()}px)` }}
            >
              <For each={tree.visibleItems()}>
                {(item) => {
                  const gitDecoration = tree.gitDecorationsMap().get(item.id);
                  const isEntering = item.parentPath !== null && tree.recentlyExpandedPaths().has(item.parentPath);
                  const isSelected = tree.selectedPathsSet().has(item.entry.path);

                  return (
                    <VirtualItem
                      item={item}
                      isSelected={isSelected}
                      focusedPath={tree.focusedPath()}
                      renamingPath={tree.renamingPath()}
                      dragOverPath={tree.dragOverPath()}
                      isDragCopy={tree.isDragCopy()}
                      isCut={tree.isCutFile(item.entry.path)}
                      gitDecoration={gitDecoration}
                      indentGuidesEnabled={props.indentGuidesEnabled}
                      enablePreview={props.enablePreview}
                      isEntering={isEntering}
                      onSelect={tree.handleSelect}
                      onOpen={tree.handleOpen}
                      onOpenPreview={tree.handleOpenPreview}
                      onToggleExpand={tree.handleToggleExpand}
                      onToggleNestedExpand={tree.handleToggleNestedExpand}
                      onContextMenu={tree.handleContextMenu}
                      onRename={tree.handleRename}
                      validateRename={tree.validateRename}
                      onDragStart={tree.handleDragStart}
                      onDragEnd={tree.handleDragEnd}
                      onDragOver={tree.handleDragOver}
                      onDrop={tree.handleDrop}
                      onFocus={tree.setFocusedPath}
                    />
                  );
                }}
              </For>
              
              <Show when={tree.loadingDirs().size > 0}>
                <SkeletonLoader depth={1} count={3} />
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <ContextMenu
        state={{
          visible: tree.contextMenu().visible,
          x: tree.contextMenu().x,
          y: tree.contextMenu().y,
          sections: tree.contextMenu().entry ? (
            tree.contextMenu().entry!.entry.isDir 
              ? ContextMenuPresets.folderItems({
                  hasClipboard: tree.clipboardFiles() !== null,
                  onNewFile: () => tree.handleContextAction("newFile"),
                  onNewFolder: () => tree.handleContextAction("newFolder"),
                  onCut: () => tree.handleContextAction("cut"),
                  onCopy: () => tree.handleContextAction("copy"),
                  onPaste: () => tree.handleContextAction("paste"),
                  onDuplicate: () => tree.handleContextAction("duplicate"),
                  onRename: () => tree.handleContextAction("rename"),
                  onDelete: () => tree.handleContextAction("delete"),
                  onCopyPath: () => tree.handleContextAction("copyPath"),
                  onCopyRelativePath: () => tree.handleContextAction("copyRelativePath"),
                  onReveal: () => tree.handleContextAction("reveal"),
                  onOpenInTerminal: () => {
                    const entry = tree.contextMenu().entry?.entry;
                    if (entry) {
                      window.dispatchEvent(new CustomEvent("terminal:open-at", { detail: { path: entry.path } }));
                    }
                    tree.handleCloseContextMenu();
                  },
                })
              : ContextMenuPresets.fileItems({
                  hasClipboard: tree.clipboardFiles() !== null,
                  onOpen: () => tree.handleContextAction("open"),
                  onOpenDefault: () => tree.handleContextAction("openDefault"),
                  onCut: () => tree.handleContextAction("cut"),
                  onCopy: () => tree.handleContextAction("copy"),
                  onPaste: () => tree.handleContextAction("paste"),
                  onDuplicate: () => tree.handleContextAction("duplicate"),
                  onRename: () => tree.handleContextAction("rename"),
                  onDelete: () => tree.handleContextAction("delete"),
                  onCopyPath: () => tree.handleContextAction("copyPath"),
                  onCopyRelativePath: () => tree.handleContextAction("copyRelativePath"),
                  onReveal: () => tree.handleContextAction("reveal"),
                })
          ) : [],
        }}
        onClose={tree.handleCloseContextMenu}
      />

      <DragConfirmDialog
        open={tree.pendingDropOperation() !== null}
        operation={tree.pendingDropOperation()?.isCopy ? "copy" : "move"}
        itemCount={tree.pendingDropOperation()?.sourcePaths.length || 0}
        targetName={tree.pendingDropOperation()?.targetName || ""}
        onConfirm={tree.handleConfirmDrop}
        onCancel={tree.handleCancelDrop}
      />

      <LargeFileWarningDialog
        open={tree.largeFileWarning() !== null}
        fileName={tree.largeFileWarning()?.fileName || ""}
        fileSizeMB={tree.largeFileWarning()?.fileSizeMB || 0}
        maxSizeMB={props.maxMemoryForLargeFilesMB}
        onConfirm={tree.handleLargeFileConfirm}
        onCancel={tree.handleLargeFileCancel}
      />

      <FileOperationDialog
        state={tree.fileOperationDialog()}
        onClose={() => tree.setFileOperationDialog(null)}
        onConfirmDelete={tree.handleConfirmDelete}
        onCreateItem={tree.handleCreateItem}
      />
    </div>
  );
}
