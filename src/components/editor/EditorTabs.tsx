/**
 * EditorTabs - Tab strip container for the editor
 *
 * Composes EditorTab components into a scrollable tab bar with:
 * - Horizontal scroll on overflow (mouse wheel)
 * - Double-click on empty area to create new untitled file
 * - Drag-and-drop reordering with visual insertion indicator
 * - Context menu via ContextMenuPresets.tabItems
 * - New tab (+) button
 * - Duplicate filename detection for parent dir disambiguation
 *
 * Integrates with useEditor() context for all state management.
 */

import {
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type JSX,
} from "solid-js";
import { useEditor, type OpenFile } from "@/context/EditorContext";
import { ContextMenu, ContextMenuPresets } from "@/components/ui";
import { Icon } from "../ui/Icon";
import { CortexTokens } from "@/design-system/tokens/cortex-tokens";
import { EditorTab } from "./EditorTab";

export interface EditorTabsProps {
  files?: OpenFile[];
  activeFileId?: string | null;
  onFileSelect?: (fileId: string) => void;
  onFileClose?: (fileId: string) => void;
  onNewFile?: () => void;
  groupId?: string;
}

export function EditorTabs(props: EditorTabsProps) {
  const editor = useEditor();

  let containerRef: HTMLDivElement | undefined;

  const files = () => props.files ?? editor.state.openFiles;
  const activeFileId = () => props.activeFileId ?? editor.state.activeFileId;

  const [dragState, setDragState] = createSignal<{
    overId: string | null;
    position: "left" | "right" | null;
  }>({ overId: null, position: null });

  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    file: OpenFile;
  } | null>(null);

  const duplicateNames = createMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files()) {
      counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [name, count] of counts) {
      if (count > 1) dupes.add(name);
    }
    return dupes;
  });

  const pinnedTabs = () => editor.state.pinnedTabs ?? [];
  const isTabPinned = (fileId: string) => pinnedTabs().includes(fileId);

  const onFileSelect = (fileId: string) => {
    if (props.onFileSelect) {
      props.onFileSelect(fileId);
    } else {
      editor.setActiveFile(fileId);
    }
  };

  const onFileClose = (fileId: string) => {
    if (props.onFileClose) {
      props.onFileClose(fileId);
    } else {
      editor.closeFile(fileId);
    }
  };

  const handleWheel = (e: WheelEvent) => {
    if (!containerRef) return;
    e.preventDefault();
    containerRef.scrollLeft += e.deltaY;
  };

  const handleEmptyAreaDoubleClick = () => {
    if (props.onNewFile) {
      props.onNewFile();
    } else {
      window.dispatchEvent(
        new CustomEvent("editor:create-new-file", {
          detail: { groupId: props.groupId },
        })
      );
    }
  };

  const handleContextMenu = (e: MouseEvent, file: OpenFile) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleDragStart = (e: DragEvent, fileId: string) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", fileId);
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (
    e: DragEvent,
    fileId: string,
    tabElement: HTMLElement
  ) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    const rect = tabElement.getBoundingClientRect();
    const position: "left" | "right" =
      e.clientX < rect.left + rect.width / 2 ? "left" : "right";
    setDragState({ overId: fileId, position });
  };

  const handleDragLeave = () => {
    setDragState({ overId: null, position: null });
  };

  const handleDrop = (e: DragEvent, targetFileId: string) => {
    e.preventDefault();
    setDragState({ overId: null, position: null });
    const sourceFileId = e.dataTransfer?.getData("text/plain");
    if (!sourceFileId || sourceFileId === targetFileId) return;
    editor.reorderTabs(sourceFileId, targetFileId, props.groupId);
  };

  const handleDragEnd = () => {
    setDragState({ overId: null, position: null });
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (e) {
      console.error("Failed to copy path:", e);
    }
  };

  const handleCopyRelativePath = async (path: string) => {
    const relativePath = path.replace(/^.*?[/\\](?:src|lib|app)[/\\]/, "");
    try {
      await navigator.clipboard.writeText(relativePath);
    } catch (e) {
      console.error("Failed to copy path:", e);
    }
  };

  const handleRevealInExplorer = (path: string) => {
    window.dispatchEvent(
      new CustomEvent("explorer:reveal", { detail: { path } })
    );
  };

  onMount(() => {
    if (containerRef) {
      containerRef.addEventListener("wheel", handleWheel, { passive: false });
    }
    onCleanup(() => {
      containerRef?.removeEventListener("wheel", handleWheel);
    });
  });

  const containerStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "stretch",
    height: "36px",
    "min-height": "36px",
    background: CortexTokens.colors.bg.primary,
    "border-bottom": `1px solid ${CortexTokens.colors.border.subtle}`,
    "flex-shrink": "0",
  };

  const scrollAreaStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "stretch",
    flex: "1",
    "min-width": "0",
    "overflow-x": "auto",
    "scrollbar-width": "none",
  };

  const emptyAreaStyle: JSX.CSSProperties = {
    flex: "1",
    "min-width": "40px",
    height: "100%",
  };

  const newTabButtonStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "28px",
    height: "100%",
    color: CortexTokens.colors.text.muted,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    "flex-shrink": "0",
    padding: "0",
    transition: "color 100ms ease",
  };

  return (
    <div style={containerStyle} role="tablist">
      <div ref={containerRef} style={scrollAreaStyle}>
        <For each={files()}>
          {(file) => {
            const state = () => dragState();
            return (
              <div
                style={{ display: "contents" }}
                onDragOver={(e) => {
                  const tab = e.currentTarget.firstElementChild as HTMLElement;
                  if (tab) handleDragOver(e, file.id, tab);
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, file.id)}
              >
                <EditorTab
                  fileId={file.id}
                  fileName={file.name}
                  filePath={file.path}
                  isActive={activeFileId() === file.id}
                  isDirty={file.modified}
                  isPreview={editor.isPreviewTab(file.id)}
                  isPinned={isTabPinned(file.id)}
                  showParentDir={duplicateNames().has(file.name)}
                  dropPosition={
                    state().overId === file.id ? state().position : null
                  }
                  onSelect={() => onFileSelect(file.id)}
                  onClose={(e) => {
                    e.stopPropagation();
                    onFileClose(file.id);
                  }}
                  onMiddleClick={() => onFileClose(file.id)}
                  onDoubleClick={() =>
                    editor.promotePreviewToPermanent(file.id)
                  }
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  onDragStart={(e) => handleDragStart(e, file.id)}
                  onDragEnd={handleDragEnd}
                />
              </div>
            );
          }}
        </For>

        <div style={emptyAreaStyle} onDblClick={handleEmptyAreaDoubleClick} />
      </div>

      <button
        onClick={() => {
          if (props.onNewFile) {
            props.onNewFile();
          } else {
            window.dispatchEvent(
              new CustomEvent("editor:create-new-file", {
                detail: { groupId: props.groupId },
              })
            );
          }
        }}
        style={newTabButtonStyle}
        title="New File (Ctrl+N)"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = CortexTokens.colors.text.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = CortexTokens.colors.text.muted;
        }}
      >
        <Icon name="plus" size={16} />
      </button>

      <Show when={contextMenu()}>
        <ContextMenu
          state={{
            visible: true,
            x: contextMenu()!.x,
            y: contextMenu()!.y,
            sections: ContextMenuPresets.tabItems({
              isPinned: isTabPinned(contextMenu()!.file.id),
              onClose: () => {
                onFileClose(contextMenu()!.file.id);
                closeContextMenu();
              },
              onCloseOthers: () => {
                const keepId = contextMenu()!.file.id;
                files().forEach((f) => {
                  if (f.id !== keepId) onFileClose(f.id);
                });
                closeContextMenu();
              },
              onCloseAll: () => {
                editor.closeAllFiles(false);
                closeContextMenu();
              },
              onCloseToRight: () => {
                const idx = files().findIndex(
                  (f) => f.id === contextMenu()!.file.id
                );
                if (idx !== -1) {
                  files()
                    .slice(idx + 1)
                    .forEach((f) => onFileClose(f.id));
                }
                closeContextMenu();
              },
              onCloseToLeft: () => {
                const idx = files().findIndex(
                  (f) => f.id === contextMenu()!.file.id
                );
                if (idx > 0) {
                  files()
                    .slice(0, idx)
                    .forEach((f) => {
                      if (!isTabPinned(f.id)) onFileClose(f.id);
                    });
                }
                closeContextMenu();
              },
              onPin: () => {
                const fileId = contextMenu()!.file.id;
                if (isTabPinned(fileId)) {
                  editor.unpinTab(fileId);
                } else {
                  editor.pinTab(fileId);
                }
                closeContextMenu();
              },
              onCopyPath: () => {
                handleCopyPath(contextMenu()!.file.path);
                closeContextMenu();
              },
              onCopyRelativePath: () => {
                handleCopyRelativePath(contextMenu()!.file.path);
                closeContextMenu();
              },
              onReveal: () => {
                handleRevealInExplorer(contextMenu()!.file.path);
                closeContextMenu();
              },
            }),
          }}
          onClose={closeContextMenu}
        />
      </Show>
    </div>
  );
}

export default EditorTabs;
