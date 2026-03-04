/**
 * CortexEditorTabs - Pixel-perfect editor tab bar matching Figma design
 *
 * Figma specs (node 1156:23697, file 4hKtI49khKHjribAGpFUkW):
 * - Tab bar height: 36px, bg #1C1C1D, padding 2px 8px 2px 4px
 * - Active tab: bg #252628, text #FCFCFC, border-radius 8px 8px 0 0
 * - Inactive tab: transparent bg, text #8C8D8F
 * - Tab height: 32px, padding 8px, gap 4px between elements
 * - Tab structure: file icon (16×16) + filename (Figtree Medium 13px) + close (16×16)
 * - Close button: visible on hover/active, hidden (opacity 0) on inactive
 * - Modified dot: 8px circle indicator
 * - Horizontal scrolling when tabs overflow, 4px gap between tabs
 * - Tab separator: 1px vertical divider between inactive tabs
 * - Drag-to-reorder tabs
 * - Right-click context menu (Close, Close Others, Close All, Copy Path)
 */

import { Component, JSX, For, Show, createSignal, onCleanup } from "solid-js";
import { CortexIcon } from "./primitives";
import { getFileIcon } from "@/utils/fileIcons";

export interface EditorTab {
  id: string;
  name: string;
  path?: string;
  isModified?: boolean;
  isPreview?: boolean;
}

export interface CortexEditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect?: (id: string) => void;
  onTabClose?: (id: string) => void;
  onTabCloseOthers?: (id: string) => void;
  onTabCloseAll?: () => void;
  onTabReorder?: (sourceId: string, targetId: string) => void;
  onNewTab?: () => void;
  class?: string;
  style?: JSX.CSSProperties;
}

export const CortexEditorTabs: Component<CortexEditorTabsProps> = (props) => {
  const [contextMenuState, setContextMenuState] = createSignal<{
    visible: boolean;
    x: number;
    y: number;
    tabId: string;
    tabPath?: string;
  }>({ visible: false, x: 0, y: 0, tabId: "", tabPath: undefined });

  const closeContextMenu = () => {
    setContextMenuState((prev) => ({ ...prev, visible: false }));
  };

  const handleGlobalClick = () => {
    if (contextMenuState().visible) closeContextMenu();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("click", handleGlobalClick);
    onCleanup(() => document.removeEventListener("click", handleGlobalClick));
  }

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "align-self": "stretch",
    height: "36px",
    background: "var(--cortex-bg-secondary, #1C1C1D)",
    padding: "2px 8px 2px 4px",
    overflow: "hidden",
    "flex-shrink": "0",
    position: "relative",
    ...props.style,
  });

  const scrollContainerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    gap: "0px",
    "overflow-x": "auto",
    "overflow-y": "hidden",
    flex: "1",
    "min-width": "0",
    "scrollbar-width": "none",
  });

  return (
    <div class={props.class} style={containerStyle()} role="tablist">
      <div
        style={scrollContainerStyle()}
        class="cortex-editor-tabs-scroll"
      >
        <For each={props.tabs}>
          {(tab, index) => {
            const isActive = () => props.activeTabId === tab.id;
            const nextTab = () => props.tabs[index() + 1];
            const isNextActive = () => nextTab() && props.activeTabId === nextTab()?.id;
            const isLast = () => index() === props.tabs.length - 1;
            const showSeparator = () => !isActive() && !isNextActive() && !isLast();

            return (
              <>
                <EditorTabItem
                  tab={tab}
                  isActive={isActive()}
                  onSelect={() => props.onTabSelect?.(tab.id)}
                  onClose={() => props.onTabClose?.(tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenuState({
                      visible: true,
                      x: e.clientX,
                      y: e.clientY,
                      tabId: tab.id,
                      tabPath: tab.path,
                    });
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer?.setData("text/plain", tab.id);
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId = e.dataTransfer?.getData("text/plain");
                    if (sourceId && sourceId !== tab.id) {
                      props.onTabReorder?.(sourceId, tab.id);
                    }
                  }}
                />
                <Show when={showSeparator()}>
                  <div
                    style={{
                      width: "1px",
                      height: "16px",
                      background: "var(--cortex-border-default, #2E2F31)",
                      "flex-shrink": "0",
                    }}
                  />
                </Show>
              </>
            );
          }}
        </For>
      </div>

      <div
        style={{
          flex: "0 0 auto",
          height: "100%",
          "min-width": "32px",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          cursor: "default",
        }}
        onClick={props.onNewTab}
      />

      <Show when={contextMenuState().visible}>
        <TabContextMenu
          x={contextMenuState().x}
          y={contextMenuState().y}
          onClose={() => props.onTabClose?.(contextMenuState().tabId)}
          onCloseOthers={() => props.onTabCloseOthers?.(contextMenuState().tabId)}
          onCloseAll={() => props.onTabCloseAll?.()}
          onCopyPath={() => {
            const path = contextMenuState().tabPath;
            if (path && typeof navigator !== "undefined") {
              navigator.clipboard.writeText(path).catch(() => {});
            }
          }}
          onDismiss={closeContextMenu}
        />
      </Show>

      <style>{`
        .cortex-editor-tabs-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

interface TabContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onCopyPath: () => void;
  onDismiss: () => void;
}

const TabContextMenu: Component<TabContextMenuProps> = (props) => {
  const menuStyle = (): JSX.CSSProperties => ({
    position: "fixed",
    left: `${props.x}px`,
    top: `${props.y}px`,
    "z-index": "9999",
    background: "var(--cortex-bg-elevated, #252628)",
    border: "1px solid var(--cortex-border-default, #2E2F31)",
    "border-radius": "8px",
    padding: "4px 0",
    "min-width": "160px",
    "box-shadow": "0 4px 16px rgba(0,0,0,0.4)",
  });

  const itemStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    width: "100%",
    padding: "6px 12px",
    background: "transparent",
    border: "none",
    color: "var(--cortex-text-primary, #FCFCFC)",
    "font-family": "var(--cortex-font-sans, 'Figtree', sans-serif)",
    "font-size": "12px",
    cursor: "pointer",
    "text-align": "left",
  };

  const handleClick = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
    props.onDismiss();
  };

  return (
    <div style={menuStyle()} onClick={(e) => e.stopPropagation()}>
      <button
        style={itemStyle}
        onClick={handleClick(props.onClose)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cortex-bg-hover, #2E2F31)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        Close
      </button>
      <button
        style={itemStyle}
        onClick={handleClick(props.onCloseOthers)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cortex-bg-hover, #2E2F31)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        Close Others
      </button>
      <button
        style={itemStyle}
        onClick={handleClick(props.onCloseAll)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cortex-bg-hover, #2E2F31)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        Close All
      </button>
      <div style={{ height: "1px", background: "var(--cortex-border-default, #2E2F31)", margin: "4px 0" }} />
      <button
        style={itemStyle}
        onClick={handleClick(props.onCopyPath)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--cortex-bg-hover, #2E2F31)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        Copy Path
      </button>
    </div>
  );
};

interface EditorTabItemProps {
  tab: EditorTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

const EditorTabItem: Component<EditorTabItemProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const tabStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    gap: "4px",
    height: "32px",
    padding: "8px",
    background: props.isActive ? "var(--cortex-bg-elevated, #252628)" : "transparent",
    "border-radius": props.isActive ? "8px 8px 0 0" : "8px",
    cursor: "pointer",
    transition: "background 100ms ease",
    "flex-shrink": "0",
    "user-select": "none",
  });

  const nameStyle = (): JSX.CSSProperties => ({
    "font-family": "var(--cortex-font-sans, 'Figtree', sans-serif)",
    "font-size": "13px",
    "font-weight": "500",
    "line-height": "115%",
    color: props.isActive ? "var(--cortex-text-primary, #FCFCFC)" : "var(--cortex-text-secondary, #8C8D8F)",
    "white-space": "nowrap",
    "font-style": props.tab.isPreview ? "italic" : "normal",
  });

  const closeButtonStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "16px",
    height: "16px",
    "border-radius": "var(--cortex-radius-sm, 4px)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    opacity: (isHovered() || props.isActive || props.tab.isModified) ? "1" : "0",
    transition: "opacity 100ms ease, background 100ms ease",
    padding: "0",
    "flex-shrink": "0",
  });

  const modifiedDotStyle = (): JSX.CSSProperties => ({
    width: "8px",
    height: "8px",
    "border-radius": "var(--cortex-radius-full, 50%)",
    background: "var(--cortex-text-secondary, #8C8D8F)",
    "flex-shrink": "0",
  });

  const handleClose = (e: MouseEvent) => {
    e.stopPropagation();
    props.onClose();
  };

  return (
    <div
      style={tabStyle()}
      onClick={props.onSelect}
      onContextMenu={props.onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable={true}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      role="tab"
      aria-selected={props.isActive}
    >
      <FileTypeIcon name={props.tab.name} size={16} />

      <span style={nameStyle()}>{props.tab.name}</span>

      <Show
        when={!props.tab.isModified || isHovered()}
        fallback={<span style={modifiedDotStyle()} />}
      >
        <button
          style={closeButtonStyle()}
          onClick={handleClose}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--cortex-bg-hover, #2E2F31)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          title="Close"
        >
          <CortexIcon
            name="xmark"
            size={10}
            color="var(--cortex-text-secondary, #8C8D8F)"
          />
        </button>
      </Show>
    </div>
  );
};

interface FileTypeIconProps {
  name: string;
  size?: number;
}

const FileTypeIcon: Component<FileTypeIconProps> = (props) => {
  const size = () => props.size || 16;
  const iconPath = () => getFileIcon(props.name, false);

  return (
    <img
      src={iconPath()}
      alt=""
      width={size()}
      height={size()}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "flex-shrink": "0",
        "object-fit": "contain",
      }}
      draggable={false}
    />
  );
};

export default CortexEditorTabs;
