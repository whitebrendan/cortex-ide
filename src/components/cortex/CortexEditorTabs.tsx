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
import { ContextMenu, ContextMenuPresets } from "../ui/ContextMenu";

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

      <ContextMenu
        state={{
          visible: contextMenuState().visible,
          x: contextMenuState().x,
          y: contextMenuState().y,
          sections: contextMenuState().visible ? ContextMenuPresets.tabItems({
            onClose: () => {
              props.onTabClose?.(contextMenuState().tabId);
            },
            onCloseOthers: () => {
              props.onTabCloseOthers?.(contextMenuState().tabId);
            },
            onCloseAll: () => {
              props.onTabCloseAll?.();
            },
            onCopyPath: () => {
              const path = contextMenuState().tabPath;
              if (path && typeof navigator !== "undefined") {
                navigator.clipboard.writeText(path).catch(() => {});
              }
            },
          }) : [],
        }}
        onClose={closeContextMenu}
      />

      <style>{`
        .cortex-editor-tabs-scroll::-webkit-scrollbar { display: none; }
      `}</style>
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
  const ext = props.name.split('.').pop()?.toLowerCase() || '';
  const filename = props.name.toLowerCase();

  if (ext === 'tsx' || ext === 'jsx') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" fill="var(--cortex-info, #61DAFB)" />
        <ellipse cx="8" cy="8" rx="7" ry="2.5" stroke="var(--cortex-info, #61DAFB)" stroke-width="1" fill="none" transform="rotate(0 8 8)" />
        <ellipse cx="8" cy="8" rx="7" ry="2.5" stroke="var(--cortex-info, #61DAFB)" stroke-width="1" fill="none" transform="rotate(60 8 8)" />
        <ellipse cx="8" cy="8" rx="7" ry="2.5" stroke="var(--cortex-info, #61DAFB)" stroke-width="1" fill="none" transform="rotate(-60 8 8)" />
      </svg>
    );
  }

  if (ext === 'ts') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="var(--cortex-info, #3178C6)" />
        <path d="M4 8h5M6.5 8v4.5" stroke="white" stroke-width="1.5" />
        <path d="M10 12.5c.5.3 1 .5 1.5.5.8 0 1.5-.4 1.5-1.2 0-.6-.4-1-1.2-1.2l-.6-.2c-.5-.1-.8-.3-.8-.6 0-.4.3-.6.8-.6.4 0 .8.1 1.2.4" stroke="white" stroke-width="1" />
      </svg>
    );
  }

  if (ext === 'rs') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="var(--cortex-warning, #DEA584)" stroke-width="1.5" fill="none" />
        <circle cx="8" cy="8" r="2" fill="var(--cortex-warning, #DEA584)" />
        <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="var(--cortex-warning, #DEA584)" stroke-width="1.5" />
      </svg>
    );
  }

  if (filename === 'cargo.toml' || ext === 'toml') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="var(--cortex-warning, #DEA584)" stroke-width="1.5" fill="none" />
        <path d="M5 5h6M5 8h4M5 11h5" stroke="var(--cortex-warning, #DEA584)" stroke-width="1" />
      </svg>
    );
  }

  if (filename === 'cargo.lock' || ext === 'lock') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect x="3" y="7" width="10" height="7" rx="1" stroke="var(--cortex-warning, #DEA584)" stroke-width="1.5" fill="none" />
        <path d="M5 7V5a3 3 0 016 0v2" stroke="var(--cortex-warning, #DEA584)" stroke-width="1.5" fill="none" />
        <circle cx="8" cy="10.5" r="1" fill="var(--cortex-warning, #DEA584)" />
      </svg>
    );
  }

  if (ext === 'md') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1" stroke="var(--cortex-info, #519ABA)" stroke-width="1" fill="none" />
        <path d="M3 10V6l2 2.5L7 6v4M10 10V7l1.5 2 1.5-2v3" stroke="var(--cortex-info, #519ABA)" stroke-width="1" />
      </svg>
    );
  }

  if (ext === 'json') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <path d="M5 3c-1.5 0-2 1-2 2v2c0 1-1 1-1 1s1 0 1 1v2c0 1 .5 2 2 2" stroke="var(--cortex-warning, #CBCB41)" stroke-width="1.5" fill="none" />
        <path d="M11 3c1.5 0 2 1 2 2v2c0 1 1 1 1 1s-1 0-1 1v2c0 1-.5 2-2 2" stroke="var(--cortex-warning, #CBCB41)" stroke-width="1.5" fill="none" />
      </svg>
    );
  }

  if (ext === 'css' || ext === 'scss' || ext === 'less' || ext === 'sass') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#563D7C" />
        <path d="M5 5h6M5 8h4M5 11h5" stroke="white" stroke-width="1" />
      </svg>
    );
  }

  if (ext === 'html' || ext === 'htm') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#E34C26" />
        <path d="M5 5l-2 3 2 3M11 5l2 3-2 3M9 4l-2 8" stroke="white" stroke-width="1" />
      </svg>
    );
  }

  if (ext === 'py') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#3776AB" />
        <path d="M5 4v4c0 1 1 2 3 2s3-1 3-2V4M5 12v-4c0-1 1-2 3-2s3 1 3 2v4" stroke="white" stroke-width="1" />
      </svg>
    );
  }

  if (ext === 'go') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#00ADD8" />
        <path d="M4 8h8M4 5h6M4 11h5" stroke="white" stroke-width="1.5" />
      </svg>
    );
  }

  if (ext === 'yaml' || ext === 'yml') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#CB171E" />
        <path d="M4 4l3 4v4M12 4l-3 4" stroke="white" stroke-width="1.2" />
      </svg>
    );
  }

  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#4EAA25" />
        <path d="M4 5l4 3-4 3M9 11h4" stroke="white" stroke-width="1.2" />
      </svg>
    );
  }

  return (
    <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="var(--cortex-text-secondary, #8C8D8F)" stroke-width="1.2" fill="none" />
      <path d="M9 2v4h4" stroke="var(--cortex-text-secondary, #8C8D8F)" stroke-width="1.2" fill="none" />
    </svg>
  );
};

export default CortexEditorTabs;
