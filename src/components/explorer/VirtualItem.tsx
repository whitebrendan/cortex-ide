import { createSignal, createEffect, createMemo, Show, For } from "solid-js";
import { Icon } from "../ui/Icon";
import { getFileIconSvg, getFileColor } from "./icons";
import { ITEM_HEIGHT, TREE_INDENT_SIZE, TREE_BASE_PADDING } from "./types";
import type { VirtualItemProps } from "./types";

export function VirtualItem(props: VirtualItemProps) {
  const [renameValue, setRenameValue] = createSignal("");
  let inputRef: HTMLInputElement | undefined;
  
  const isFocused = () => props.focusedPath === props.item.entry.path;
  const isRenaming = () => props.renamingPath === props.item.entry.path;
  const isDragOver = () => props.dragOverPath === props.item.entry.path;
  
  const displayName = createMemo(() => 
    props.item.entry.compactedName || props.item.entry.name
  );
  
  const fileIconPath = createMemo(() => 
    getFileIconSvg(props.item.entry.name, props.item.entry.isDir, props.item.isExpanded)
  );
  
  const fileColor = createMemo(() => 
    props.item.entry.isDir ? undefined : getFileColor(props.item.entry.name)
  );
  
  const compactedPaths = () => props.item.entry.compactedPaths;
  
  createEffect(() => {
    if (isRenaming()) {
      setRenameValue(props.item.entry.name);
      setTimeout(() => {
        inputRef?.focus();
        if (!props.item.entry.isDir) {
          const lastDot = props.item.entry.name.lastIndexOf(".");
          if (lastDot > 0) {
            inputRef?.setSelectionRange(0, lastDot);
          } else {
            inputRef?.select();
          }
        } else {
          inputRef?.select();
        }
      }, 10);
    }
  });
  
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    
    if (props.item.entry.isDir && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      props.onSelect(props.item.entry.path, e);
      props.onToggleExpand(props.item.entry.path, compactedPaths());
      return;
    }
    
    props.onSelect(props.item.entry.path, e);
    
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (props.item.isNestedParent && !props.item.entry.isDir) {
        if (props.enablePreview) {
          props.onOpenPreview(props.item.entry);
        } else {
          props.onOpen(props.item.entry);
        }
      } else {
        if (props.enablePreview) {
          props.onOpenPreview(props.item.entry);
        } else {
          props.onOpen(props.item.entry);
        }
      }
    }
  };
  
  const handleChevronClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.item.isNestedParent) {
      props.onToggleNestedExpand(props.item.entry.path);
    } else if (props.item.entry.isDir) {
      props.onToggleExpand(props.item.entry.path, compactedPaths());
    }
  };
  
  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!props.item.entry.isDir) {
      props.onOpen(props.item.entry);
    }
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (isRenaming()) {
      if (e.key === "Enter") {
        e.preventDefault();
        props.onRename(props.item.entry.path, renameValue());
      } else if (e.key === "Escape") {
        e.preventDefault();
        props.onRename(props.item.entry.path, props.item.entry.name);
      }
      return;
    }
    
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (props.item.entry.isDir) {
          props.onToggleExpand(props.item.entry.path, compactedPaths());
        } else {
          props.onOpen(props.item.entry);
        }
        break;
      case "ArrowRight":
        if (props.item.entry.isDir && !props.item.isExpanded) {
          e.preventDefault();
          props.onToggleExpand(props.item.entry.path, compactedPaths());
        }
        break;
      case "ArrowLeft":
        if (props.item.entry.isDir && props.item.isExpanded) {
          e.preventDefault();
          props.onToggleExpand(props.item.entry.path, compactedPaths());
        }
        break;
    }
  };
  
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!props.isSelected) {
      props.onSelect(props.item.entry.path);
    }
    props.onContextMenu(e, props.item);
  };
  
  const handleDragStart = (e: DragEvent) => {
    props.onDragStart(e, props.item.entry);
  };

  const handleDragEnd = () => {
    props.onDragEnd();
  };
  
  const handleDragOver = (e: DragEvent) => {
    props.onDragOver(e, props.item.entry);
  };
  
  const handleDrop = (e: DragEvent) => {
    props.onDrop(e, props.item.entry);
  };

  const showChevron = () => 
    props.item.entry.isDir || props.item.isNestedParent;
  
  const isExpandedOrNestedExpanded = () => 
    props.item.isNestedParent ? props.item.isNestedExpanded : props.item.isExpanded;

  const indentGuideDepths = createMemo(() => {
    const depth = props.item.depth;
    if (depth <= 0) return [];
    return Array.from({ length: depth }, (_, i) => i);
  });

  return (
    <div
      class="file-tree-item"
      classList={{
        "file-tree-item--selected": props.isSelected,
        "file-tree-item--focused": isFocused(),
        "file-tree-item--drag-over": isDragOver() && props.item.entry.isDir,
        "file-tree-item--drag-copy": isDragOver() && props.item.entry.isDir && props.isDragCopy,
        "file-tree-item--nested": !props.item.entry.isDir && !props.item.isNestedParent && props.item.depth > 0,
        "file-tree-item--entering": props.isEntering,
      }}
      data-depth={props.item.depth}
      style={{ 
        "padding-left": `${props.item.depth * TREE_INDENT_SIZE + TREE_BASE_PADDING}px`,
        height: `${ITEM_HEIGHT}px`,
        opacity: props.isCut ? 0.5 : 1,
      }}
      onClick={handleClick}
      onDblClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      onFocus={() => props.onFocus(props.item.entry.path)}
      draggable={!isRenaming()}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      tabIndex={0}
      role="treeitem"
      aria-expanded={props.item.entry.isDir ? props.item.isExpanded : undefined}
      aria-selected={props.isSelected}
    >
      <Show when={props.indentGuidesEnabled && props.item.depth > 0}>
        <div class="file-tree-indent-guides" aria-hidden="true">
          <For each={indentGuideDepths()}>
            {(level) => (
              <span 
                class="file-tree-indent-guide"
                style={{ left: `${level * 16 + 12}px` }}
              />
            )}
          </For>
        </div>
      </Show>

      <span 
        class="file-tree-chevron"
        classList={{ 
          "file-tree-chevron--expanded": isExpandedOrNestedExpanded(),
          "file-tree-chevron--hidden": !showChevron(),
        }}
        onClick={handleChevronClick}
      >
        <Show when={showChevron()}>
          <Show 
            when={!props.item.isLoading}
            fallback={<Icon name="spinner" size={12} class="animate-spin" />}
          >
            <Icon name="chevron-right" size={12} />
          </Show>
        </Show>
      </span>
      
      <img 
        src={fileIconPath()} 
        alt="" 
        class="file-tree-icon"
        style={{ 
          width: "16px", 
          height: "16px",
          "flex-shrink": "0",
        }}
        draggable={false}
      />
      
      <Show 
        when={isRenaming()}
        fallback={
          <span 
            class={`file-tree-name ${props.gitDecoration?.nameClass || ""}`}
            style={{ color: props.gitDecoration?.nameClass ? undefined : fileColor() }}
            title={props.item.entry.compactedName ? props.item.entry.path : undefined}
          >
            {displayName()}
          </span>
        }
      >
        <input
          ref={inputRef}
          type="text"
          class="file-tree-rename-input"
          value={renameValue()}
          onInput={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => props.onRename(props.item.entry.path, renameValue())}
          onClick={(e) => e.stopPropagation()}
        />
      </Show>
      
      <Show when={props.gitDecoration?.badge && props.gitDecoration?.badgeClass}>
        <span 
          class={props.gitDecoration!.badgeClass}
          title={`Git: ${props.gitDecoration!.status}`}
        >
          {props.gitDecoration!.badge}
        </span>
      </Show>
      
      <Show when={props.item.isNestedParent && props.item.nestedFiles}>
        <span class="file-tree-nested-badge" title={`${props.item.nestedFiles!.length} nested file(s)`}>
          {props.item.nestedFiles!.length}
        </span>
      </Show>
    </div>
  );
}

export function SkeletonLoader(props: { depth: number; count: number }) {
  return (
    <For each={Array(props.count).fill(0)}>
      {(_, index) => (
        <div 
          class="file-tree-skeleton"
          style={{ 
            "padding-left": `${props.depth * TREE_INDENT_SIZE + TREE_BASE_PADDING}px`,
            height: `${ITEM_HEIGHT}px`,
          }}
        >
          <span class="file-tree-skeleton-chevron" />
          <span class="file-tree-skeleton-icon" />
          <span 
            class="file-tree-skeleton-name" 
            style={{ width: `${60 + (index() % 3) * 20}px` }}
          />
        </div>
      )}
    </For>
  );
}
