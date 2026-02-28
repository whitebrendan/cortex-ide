/**
 * CortexTreeItem - Tree view item component for FileExplorer
 * Figma: file 4hKtI49khKHjribAGpFUkW, node 1060:33326
 *
 * Row height: 24px
 * Folder row: gap 8px between chevron and content
 *   - Chevron: 12×12 icon in 20×20 container
 *   - Folder icon: 16×16
 *   - Text: Figtree 13px 400, #FCFCFC
 * File row: gap 4px
 *   - File icon: 16×16
 *   - Text: Figtree 13px 400, #FCFCFC
 * Indent: 16px per level
 * Hover: bg #252628
 * Selected: bg #252628 + left 2px solid #B2FF22
 */

import { Component, JSX, splitProps, createSignal, Show, For } from "solid-js";
import { CortexIcon } from "./CortexIcon";

export interface TreeItemData {
  id: string;
  name: string;
  icon?: string;
  type: "file" | "folder";
  children?: TreeItemData[];
  isExpanded?: boolean;
}

export interface CortexTreeItemProps {
  item: TreeItemData;
  level?: number;
  isSelected?: boolean;
  isExpanded?: boolean;
  onSelect?: (item: TreeItemData) => void;
  onToggle?: (item: TreeItemData) => void;
  onContextMenu?: (item: TreeItemData, e: MouseEvent) => void;
  selectedId?: string | null;
  expandedIds?: Set<string>;
  class?: string;
  style?: JSX.CSSProperties;
}

const FILE_ICON_MAP: Record<string, string> = {
  "folder-default": "folder",
  "folder-open": "folder-open",
  ".ts": "file-code",
  ".tsx": "file-code",
  ".js": "file-code",
  ".jsx": "file-code",
  ".rs": "file-code",
  ".toml": "file-text",
  ".json": "file-text",
  ".md": "file-text",
  ".yml": "file-text",
  ".yaml": "file-text",
  ".lock": "lock",
  ".dockerfile": "file",
  "dockerfile": "file",
};

const getFileIcon = (name: string, type: "file" | "folder", customIcon?: string): string => {
  if (customIcon) return customIcon;

  if (type === "folder") {
    return "folder";
  }

  const ext = name.toLowerCase().includes(".")
    ? "." + name.split(".").pop()?.toLowerCase()
    : name.toLowerCase();

  return FILE_ICON_MAP[ext] || "file";
};

export const CortexTreeItem: Component<CortexTreeItemProps> = (props) => {
  const [local, others] = splitProps(props, [
    "item",
    "level",
    "isSelected",
    "isExpanded",
    "onSelect",
    "onToggle",
    "onContextMenu",
    "selectedId",
    "expandedIds",
    "class",
    "style",
  ]);

  const [isHovered, setIsHovered] = createSignal(false);
  const [isPressed, setIsPressed] = createSignal(false);
  const level = () => local.level || 0;
  const hasChildren = () => local.item.type === "folder" && local.item.children && local.item.children.length > 0;
  const isFolder = () => local.item.type === "folder";

  const indentPx = () => {
    if (isFolder()) {
      return level() * 16;
    }
    return 20 + level() * 16;
  };

  const rowStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "align-self": "stretch",
    gap: isFolder() ? "8px" : "4px",
    height: "24px",
    padding: isFolder() ? "0" : "2px 0",
    "padding-left": `${indentPx()}px`,
    "padding-right": "8px",
    cursor: "pointer",
    background: local.isSelected || isPressed()
      ? "#252628"
      : isHovered()
      ? "#252628"
      : "transparent",
    "border-left": local.isSelected ? "2px solid #B2FF22" : "2px solid transparent",
    transition: "background 100ms ease",
    "box-sizing": "border-box",
    outline: "none",
    ...local.style,
  });

  const chevronContainerStyle = (): JSX.CSSProperties => ({
    width: "20px",
    height: "20px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "flex-shrink": "0",
  });

  const folderContentStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    gap: "4px",
    flex: "1",
    "min-width": "0",
  });

  const fileContentStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    gap: "4px",
    flex: "1",
    "min-width": "0",
  });

  const textStyle = (): JSX.CSSProperties => ({
    "font-family": "Figtree, var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": "13px",
    "font-weight": "400",
    "line-height": "1em",
    color: "#FCFCFC",
    "white-space": "nowrap",
    overflow: "hidden",
    "text-overflow": "ellipsis",
  });

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();

    if (local.item.type === "folder") {
      local.onToggle?.(local.item);
    }

    local.onSelect?.(local.item);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    local.onContextMenu?.(local.item, e);
  };

  const icon = () => getFileIcon(local.item.name, local.item.type, local.item.icon);

  return (
    <>
      <div
        class={local.class}
        style={rowStyle()}
        tabIndex={0}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e as unknown as MouseEvent);
          }
        }}
        {...others}
      >
        <Show when={isFolder()} fallback={
          <div style={fileContentStyle()}>
            <CortexIcon name={icon()} size={16} color="#8C8D8F" />
            <span style={textStyle()}>{local.item.name}</span>
          </div>
        }>
          <div style={chevronContainerStyle()}>
            <CortexIcon
              name={local.isExpanded ? "chevron-down" : "chevron-right"}
              size={12}
              color="#8C8D8F"
            />
          </div>
          <div style={folderContentStyle()}>
            <CortexIcon
              name={local.isExpanded ? "folder-open" : "folder"}
              size={16}
              color="#8C8D8F"
            />
            <span style={textStyle()}>{local.item.name}</span>
          </div>
        </Show>
      </div>

      <Show when={local.isExpanded && hasChildren()}>
        <For each={local.item.children}>
          {(child) => (
            <CortexTreeItem
              item={child}
              level={level() + 1}
              isSelected={local.selectedId === child.id}
              isExpanded={local.expandedIds?.has(child.id) ?? child.isExpanded}
              onSelect={local.onSelect}
              onToggle={local.onToggle}
              onContextMenu={local.onContextMenu}
              selectedId={local.selectedId}
              expandedIds={local.expandedIds}
            />
          )}
        </For>
      </Show>
    </>
  );
};

/**
 * IndentGuide - Vertical indent guide lines
 */
export interface IndentGuideProps {
  level: number;
  height: number;
  style?: JSX.CSSProperties;
}

export const IndentGuide: Component<IndentGuideProps> = (props) => {
  const guideStyle = (): JSX.CSSProperties => ({
    position: "absolute",
    left: `${props.level * 16 + 10}px`,
    width: "1px",
    height: `${props.height}px`,
    background: "rgba(255, 255, 255, 0.1)",
    "pointer-events": "none",
    ...props.style,
  });

  return <div style={guideStyle()} />;
};

export default CortexTreeItem;
