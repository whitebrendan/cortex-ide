/**
 * ExplorerTreeView - Section title + project header + virtualized scrollable tree view
 * Figma: file 4hKtI49khKHjribAGpFUkW, node 1060:33326
 *
 * Section title: "EXPLORER" 11px uppercase, weight 600, color #8C8D8F
 * Heading: 320×20, row, padding 0 16px, gap 62 (space-between)
 * Title: Figtree 16px/600, #E9E9EA, chevron 16×16 beside it, gap 2
 * Actions: row, gap 2, four 20×20 icon buttons (16×16 icons): new file, target, refresh, collapse
 * Tree area: virtualized scroll container rendering only visible items + buffer
 * Item height: 28px (CORTEX_ITEM_HEIGHT), indent 16px/level
 */

import { Component, JSX, createSignal, createMemo, onCleanup, For, Show } from "solid-js";
import { CortexIcon, CortexTooltip, CortexTreeItem, TreeItemData } from "../primitives";
import { CORTEX_ITEM_HEIGHT, CORTEX_OVERSCAN } from "../../explorer/types";

interface FlatTreeMeta {
  depth: number;
  isExpanded: boolean;
}

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
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(400);
  let resizeObserver: ResizeObserver | null = null;
  let scrollRafId: number | null = null;

  const setContainerRef = (el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) setContainerHeight(rect.height);

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });
    resizeObserver.observe(el);
  };

  onCleanup(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (scrollRafId !== null) {
      cancelAnimationFrame(scrollRafId);
    }
  });

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

  const flattenedData = createMemo(() => {
    const items = props.items;
    const expandedIds = props.expandedIds;
    const orderedItems: TreeItemData[] = [];
    const metaMap = new Map<TreeItemData, FlatTreeMeta>();

    const walk = (nodes: TreeItemData[], depth: number) => {
      for (const node of nodes) {
        const isExpanded = expandedIds.has(node.id) || (node.isExpanded ?? false);
        orderedItems.push(node);
        metaMap.set(node, { depth, isExpanded });

        if (node.type === "folder" && isExpanded && node.children) {
          walk(node.children, depth + 1);
        }
      }
    };

    walk(items, 0);
    return { orderedItems, metaMap };
  });

  const totalHeight = createMemo(() => flattenedData().orderedItems.length * CORTEX_ITEM_HEIGHT);

  const visibleRange = createMemo(() => {
    const total = flattenedData().orderedItems.length;
    const start = Math.max(0, Math.floor(scrollTop() / CORTEX_ITEM_HEIGHT) - CORTEX_OVERSCAN);
    const count = Math.ceil(containerHeight() / CORTEX_ITEM_HEIGHT) + CORTEX_OVERSCAN * 2;
    const end = Math.min(total, start + count);
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return flattenedData().orderedItems.slice(start, end);
  });

  const offsetY = createMemo(() => visibleRange().start * CORTEX_ITEM_HEIGHT);

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    "align-self": "stretch",
    flex: "1",
    "min-height": "0",
  });

  const sectionTitleStyle = (): JSX.CSSProperties => ({
    "font-family": "Figtree, var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": "11px",
    "font-weight": "600",
    "line-height": "1em",
    "text-transform": "uppercase",
    color: "#8C8D8F",
    padding: "0 16px",
    "margin-bottom": "12px",
    "flex-shrink": "0",
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
    "line-height": "1.25em",
    color: "#E9E9EA",
  });

  const actionsStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "row",
    "align-items": "center",
    gap: "2px",
  });

  return (
    <div style={containerStyle()}>
      <div style={sectionTitleStyle()}>EXPLORER</div>

      <div style={projectHeaderStyle()}>
        <div style={projectTitleStyle()}>
          <span style={projectTextStyle()}>{props.title || "Project"}</span>
          <CortexIcon name="chevron-down" size={16} color="#FFFFFF" />
        </div>

        <div style={actionsStyle()}>
          <ExplorerActionButton icon="plus" label="New File" onClick={props.onAdd} />
          <ExplorerActionButton icon="target-02" label="Search" onClick={props.onSearch} />
          <ExplorerActionButton icon="refresh" label="Refresh" onClick={props.onRefresh} />
          <ExplorerActionButton icon="chevron-up-double" label="Collapse All" onClick={props.onCollapseAll} />
        </div>
      </div>

      <Show
        when={flattenedData().orderedItems.length > 0}
        fallback={
          <div style={{
            padding: "16px",
            color: "#8C8D8F",
            "font-size": "13px",
            "text-align": "center",
          }}>
            No files
          </div>
        }
      >
        <div
          ref={setContainerRef}
          style={{
            flex: "1",
            "overflow-y": "auto",
            "overflow-x": "hidden",
            "min-height": "0",
            "align-self": "stretch",
          }}
          onScroll={handleScroll}
          role="tree"
          aria-label="File tree"
        >
          <div style={{ height: `${totalHeight()}px`, position: "relative" }}>
            <div style={{
              transform: `translateY(${offsetY()}px)`,
              padding: "0 16px",
            }}>
              <For each={visibleItems()}>
                {(item) => {
                  const meta = () => flattenedData().metaMap.get(item);
                  return (
                    <CortexTreeItem
                      item={item}
                      level={meta()?.depth ?? 0}
                      isSelected={props.selectedId === item.id}
                      isExpanded={meta()?.isExpanded ?? false}
                      onSelect={props.onSelect}
                      onToggle={props.onToggle}
                      onContextMenu={props.onContextMenu}
                      selectedId={props.selectedId}
                      expandedIds={props.expandedIds}
                    />
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ExplorerTreeView;
