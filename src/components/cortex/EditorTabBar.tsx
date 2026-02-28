/**
 * EditorTabBar - Pixel-perfect editor tab bar matching Figma design
 *
 * Figma specs (node 1156:23692 tabs instance):
 * - Tab bar: row, align center, stretch, fill width, height 40px
 * - Container bg: #1C1C1D, border-bottom: 1px solid, padding 4px 8px 4px 4px
 * - Active tab: bg #252528, text #E9E9EA, border-radius 8px, height 32px
 * - Inactive tabs: transparent bg, text #8C8C8F
 * - Tab padding: 8px, gap 6px, font-weight 500
 * - Close button: 16×16, visible on hover/active
 */

import { Component, JSX, For, Show, createSignal, onCleanup } from "solid-js";
import { CortexIcon } from "./primitives";
import type { EditorTab } from "./CortexEditorTabs";

export interface EditorTabBarProps {
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

export const EditorTabBar: Component<EditorTabBarProps> = (props) => {
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
    height: "40px",
    padding: "4px 8px 4px 4px",
    background: "var(--cortex-bg-secondary)",
    "border-bottom": "1px solid var(--cortex-border-default)",
    overflow: "hidden",
    "flex-shrink": "0",
    position: "relative",
    ...props.style,
  });

  const scrollContainerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "overflow-x": "auto",
    "overflow-y": "hidden",
    flex: "1",
    height: "100%",
    "scrollbar-width": "none",
  });

  return (
    <div class={props.class} style={containerStyle()} role="tablist">
      <div style={scrollContainerStyle()} class="cortex-editor-tabbar-scroll">
        <For each={props.tabs}>
          {(tab) => (
            <TabItem
              tab={tab}
              isActive={props.activeTabId === tab.id}
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
          )}
        </For>
      </div>

      <Show when={contextMenuState().visible}>
        <TabBarContextMenu
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
        .cortex-editor-tabbar-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

interface TabItemProps {
  tab: EditorTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

const TabItem: Component<TabItemProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const tabStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    gap: "6px",
    height: "32px",
    padding: "8px",
    background: props.isActive ? "#252528" : "transparent",
    "border-radius": "8px",
    cursor: "pointer",
    transition: "background 100ms ease",
    "flex-shrink": "0",
    "user-select": "none",
  });

  const nameStyle = (): JSX.CSSProperties => ({
    "font-family": "'Figtree', sans-serif",
    "font-size": "14px",
    "font-weight": "500",
    "line-height": "1em",
    color: props.isActive ? "#E9E9EA" : "#8C8C8F",
    "white-space": "nowrap",
    "font-style": props.tab.isPreview ? "italic" : "normal",
  });

  const closeButtonStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "16px",
    height: "16px",
    "border-radius": "4px",
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
    "border-radius": "50%",
    background: "#8C8D8F",
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
      <TabFileIcon name={props.tab.name} size={16} />
      <span style={nameStyle()}>{props.tab.name}</span>
      <Show
        when={!props.tab.isModified || isHovered()}
        fallback={<span style={modifiedDotStyle()} />}
      >
        <button
          style={closeButtonStyle()}
          onClick={handleClose}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          title="Close"
        >
          <CortexIcon name="xmark" size={12} color="#8C8D8F" />
        </button>
      </Show>
    </div>
  );
};

interface TabFileIconProps {
  name: string;
  size?: number;
}

const TabFileIcon: Component<TabFileIconProps> = (props) => {
  const size = () => props.size || 16;
  const ext = props.name.split(".").pop()?.toLowerCase() || "";
  const filename = props.name.toLowerCase();

  if (ext === "tsx" || ext === "jsx") {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" fill="#61DAFB" />
        <ellipse cx="8" cy="8" rx="7" ry="2.5" stroke="#61DAFB" stroke-width="1" fill="none" />
        <ellipse cx="8" cy="8" rx="7" ry="2.5" stroke="#61DAFB" stroke-width="1" fill="none" transform="rotate(60 8 8)" />
        <ellipse cx="8" cy="8" rx="7" ry="2.5" stroke="#61DAFB" stroke-width="1" fill="none" transform="rotate(-60 8 8)" />
      </svg>
    );
  }

  if (ext === "ts") {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="2" fill="#3178C6" />
        <path d="M4 8h5M6.5 8v4.5" stroke="white" stroke-width="1.5" />
        <path d="M10 12.5c.5.3 1 .5 1.5.5.8 0 1.5-.4 1.5-1.2 0-.6-.4-1-1.2-1.2l-.6-.2c-.5-.1-.8-.3-.8-.6 0-.4.3-.6.8-.6.4 0 .8.1 1.2.4" stroke="white" stroke-width="1" />
      </svg>
    );
  }

  if (ext === "rs") {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="#DEA584" stroke-width="1.5" fill="none" />
        <circle cx="8" cy="8" r="2" fill="#DEA584" />
        <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="#DEA584" stroke-width="1.5" />
      </svg>
    );
  }

  if (filename === "cargo.toml" || ext === "toml") {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="#DEA584" stroke-width="1.5" fill="none" />
        <path d="M5 5h6M5 8h4M5 11h5" stroke="#DEA584" stroke-width="1" />
      </svg>
    );
  }

  if (ext === "json") {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <path d="M5 3c-1.5 0-2 1-2 2v2c0 1-1 1-1 1s1 0 1 1v2c0 1 .5 2 2 2" stroke="#CBCB41" stroke-width="1.5" fill="none" />
        <path d="M11 3c1.5 0 2 1 2 2v2c0 1 1 1 1 1s-1 0-1 1v2c0 1-.5 2-2 2" stroke="#CBCB41" stroke-width="1.5" fill="none" />
      </svg>
    );
  }

  if (ext === "md") {
    return (
      <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1" stroke="#519ABA" stroke-width="1" fill="none" />
        <path d="M3 10V6l2 2.5L7 6v4M10 10V7l1.5 2 1.5-2v3" stroke="#519ABA" stroke-width="1" />
      </svg>
    );
  }

  return (
    <svg width={size()} height={size()} viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="#8C8D8F" stroke-width="1.2" fill="none" />
      <path d="M9 2v4h4" stroke="#8C8D8F" stroke-width="1.2" fill="none" />
    </svg>
  );
};

interface TabBarContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onCopyPath: () => void;
  onDismiss: () => void;
}

const TabBarContextMenu: Component<TabBarContextMenuProps> = (props) => {
  const menuStyle = (): JSX.CSSProperties => ({
    position: "fixed",
    left: `${props.x}px`,
    top: `${props.y}px`,
    "z-index": "9999",
    background: "var(--cortex-bg-secondary)",
    border: "1px solid var(--cortex-border-default)",
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
    color: "#FCFCFC",
    "font-family": "'Figtree', 'Inter', sans-serif",
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
      <button style={itemStyle} onClick={handleClick(props.onClose)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
        Close
      </button>
      <button style={itemStyle} onClick={handleClick(props.onCloseOthers)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
        Close Others
      </button>
      <button style={itemStyle} onClick={handleClick(props.onCloseAll)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
        Close All
      </button>
      <div style={{ height: "1px", background: "var(--cortex-border-default)", margin: "4px 0" }} />
      <button style={itemStyle} onClick={handleClick(props.onCopyPath)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
        Copy Path
      </button>
    </div>
  );
};

export default EditorTabBar;
