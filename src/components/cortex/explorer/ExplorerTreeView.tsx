/**
 * ExplorerTreeView - Project header + scrollable tree view
 * Figma: file 4hKtI49khKHjribAGpFUkW, node 1060:33326
 *
 * Heading: 320×20, row, padding 0 16px, gap 62 (space-between)
 * Title: Figtree 16px/600, #E9E9EA, chevron 20×20 beside it, gap 2
 * Actions: row, gap 2, four 20×20 icon buttons
 * Tree area: column, gap 4, padding 16px top/bottom (sections), 16px left/right
 * Item height: 20px, item gap: 4px
 */

import { Component, JSX, createSignal, For } from "solid-js";
import { CortexIcon, CortexTooltip, CortexTreeItem, TreeItemData } from "../primitives";

export interface ExplorerTreeViewProps {
  title?: string;
  items: TreeItemData[];
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (item: TreeItemData) => void;
  onToggle: (item: TreeItemData) => void;
  onContextMenu?: (item: TreeItemData, e: MouseEvent) => void;
  onSearch?: () => void;
  onAdd?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
}

const ExplorerActionButton: Component<{
  icon: string;
  label: string;
  onClick?: () => void;
}> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const buttonStyle = (): JSX.CSSProperties => ({
    width: "20px",
    height: "20px",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "0",
    color: isHovered() ? "#FCFCFC" : "#8C8D8F",
    transition: "color 100ms ease",
  });

  return (
    <CortexTooltip content={props.label} position="bottom">
      <button
        style={buttonStyle()}
        onClick={props.onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={props.label}
      >
        <CortexIcon name={props.icon} size={16} />
      </button>
    </CortexTooltip>
  );
};

export const ExplorerTreeView: Component<ExplorerTreeViewProps> = (props) => {
  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    "align-self": "stretch",
    flex: "1",
    "min-height": "0",
  });

  const projectHeaderStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "row",
    "justify-content": "space-between",
    "align-items": "center",
    "align-self": "stretch",
    height: "20px",
    padding: "0 16px",
    "flex-shrink": "0",
  });

  const projectTitleStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "row",
    "align-items": "center",
    gap: "2px",
    cursor: "pointer",
  });

  const projectTextStyle = (): JSX.CSSProperties => ({
    "font-family": "Figtree, var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": "16px",
    "font-weight": "600",
<<<<<<< HEAD
    "line-height": "20px",
=======
    "line-height": "1em",
>>>>>>> cf62f3c (fix: pixel-perfect sidebar container and file tree to match Figma design)
    color: "#E9E9EA",
  });

  const actionsStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "row",
    "align-items": "center",
    gap: "2px",
  });

  const treeContainerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    "align-self": "stretch",
    gap: "4px",
<<<<<<< HEAD
    padding: "16px",
=======
    padding: "0 16px",
>>>>>>> cf62f3c (fix: pixel-perfect sidebar container and file tree to match Figma design)
    flex: "1",
    "overflow-y": "auto",
    "overflow-x": "hidden",
    "min-height": "0",
  });

  return (
    <div style={containerStyle()}>
      <div style={projectHeaderStyle()}>
        <div style={projectTitleStyle()}>
          <span style={projectTextStyle()}>{props.title || "Project"}</span>
          <CortexIcon name="chevron-down" size={20} color="#FFFFFF" />
        </div>

        <div style={actionsStyle()}>
          <ExplorerActionButton icon="search" label="Search (Ctrl+Shift+F)" onClick={props.onSearch} />
          <ExplorerActionButton icon="plus" label="New File" onClick={props.onAdd} />
          <ExplorerActionButton icon="refresh" label="Refresh" onClick={props.onRefresh} />
          <ExplorerActionButton icon="chevron-up-double" label="Collapse All" onClick={props.onCollapseAll} />
        </div>
      </div>

      <div style={treeContainerStyle()}>
        <For each={props.items}>
          {(item) => (
            <CortexTreeItem
              item={item}
              level={0}
              isSelected={props.selectedId === item.id}
              isExpanded={props.expandedIds.has(item.id)}
              onSelect={props.onSelect}
              onToggle={props.onToggle}
              onContextMenu={props.onContextMenu}
              selectedId={props.selectedId}
              expandedIds={props.expandedIds}
            />
          )}
        </For>
      </div>
    </div>
  );
};

export default ExplorerTreeView;
