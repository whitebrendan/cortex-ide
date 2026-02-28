/**
 * CortexTreeItem - Tree view item component for FileExplorer
 * Figma: file 4hKtI49khKHjribAGpFUkW, node 1060:33326
 *
 * Item row: 288×20, row, center, stretch
 * Folder: chevron 20×20 + gap 8 + icon 16×16 + name (Figtree 14/400 #E9E9EA)
 * File: padding-left 28 + icon 16×16 + gap 4 + name (Figtree 14/400 #E9E9EA)
 * Indent per level: 26px
 * Item gap: 4px
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

  const indentPx = () => level() * 26;
<<<<<<< HEAD
  const isFolder = () => local.item.type === "folder";

  const getRowBackground = (): string => {
    if (isPressed()) return "var(--cortex-bg-active, rgba(255, 255, 255, 0.08))";
    if (local.isSelected) return "var(--cortex-interactive-selected, rgba(255, 255, 255, 0.05))";
    if (isHovered()) return "var(--cortex-interactive-hover, rgba(255, 255, 255, 0.03))";
    return "transparent";
  };
=======
>>>>>>> cf62f3c (fix: pixel-perfect sidebar container and file tree to match Figma design)

  const rowStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "align-self": "stretch",
<<<<<<< HEAD
    gap: isFolder() ? "8px" : "4px",
    height: "20px",
    padding: isFolder() ? `0 8px 0 ${indentPx()}px` : `0 8px 0 ${Math.max(0, level() - 1) * 26 + 28}px`,
    cursor: "pointer",
    background: getRowBackground(),
    "border-radius": local.isSelected || isPressed() ? "4px" : "0",
    transition: "background var(--cortex-transition-fast, 100ms ease)",
    outline: "none",
    "box-sizing": "border-box",
=======
    gap: "8px",
    height: "20px",
    padding: "0",
    "padding-left": `${indentPx()}px`,
    cursor: "pointer",
    background: local.isSelected
      ? "#2E2F31"
      : isHovered()
      ? "#2E2F31"
      : "transparent",
    "border-radius": "4px",
    transition: "background 100ms ease",
>>>>>>> cf62f3c (fix: pixel-perfect sidebar container and file tree to match Figma design)
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

  const textRowStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    gap: "4px",
    flex: "1",
    "min-width": "0",
  });

  const fileIconStyle = (): JSX.CSSProperties => ({
    width: "16px",
    height: "16px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "flex-shrink": "0",
  });

  const textStyle = (): JSX.CSSProperties => ({
    "font-family": "Figtree, var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": "14px",
    "font-weight": "400",
<<<<<<< HEAD
    "line-height": "16px",
    color: "#E9E9EA",
=======
    "line-height": "1em",
    color: local.item.type === "folder" ? "#E9E9EA" : "#E9E9EA",
>>>>>>> cf62f3c (fix: pixel-perfect sidebar container and file tree to match Figma design)
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
        <Show when={isFolder()}>
          <div style={chevronContainerStyle()}>
            <CortexIcon
              name={local.isExpanded ? "chevron-down" : "chevron-right"}
              size={16}
              color="#8C8D8F"
            />
          </div>
        </Show>

        <div style={textRowStyle()}>
          <div style={fileIconStyle()}>
            <CortexIcon
              name={local.isExpanded && isFolder() ? "folder-open" : icon()}
              size={16}
              color="#8C8D8F"
            />
          </div>
          <span style={textStyle()}>{local.item.name}</span>
        </div>
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
    left: `${props.level * 26 + 10}px`,
    width: "1px",
    height: `${props.height}px`,
    background: "rgba(255, 255, 255, 0.1)",
    "pointer-events": "none",
    ...props.style,
  });

  return <div style={guideStyle()} />;
};

export default CortexTreeItem;
