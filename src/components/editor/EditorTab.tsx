/**
 * EditorTab - Individual editor tab component
 *
 * Renders a single tab in the editor tab strip with:
 * - File icon (via FileIcon component)
 * - File name with optional parent directory for disambiguation
 * - Dirty indicator (dot) / close button
 * - Drag-and-drop support (HTML5 Drag API)
 * - Preview tab styling (italic text)
 * - Active/inactive visual states
 *
 * Styled with CortexTokens to match the Cortex IDE dark theme.
 */

import { createSignal, Show, type JSX } from "solid-js";
import { FileIcon } from "../ui/FileIcon";
import { Icon } from "../ui/Icon";
import { CortexTokens } from "@/design-system/tokens/cortex-tokens";

export interface EditorTabProps {
  fileId: string;
  fileName: string;
  filePath: string;
  isActive: boolean;
  isDirty: boolean;
  isPreview?: boolean;
  isPinned?: boolean;
  showParentDir?: boolean;
  dropPosition?: "left" | "right" | null;
  onSelect: () => void;
  onClose: (e: MouseEvent) => void;
  onMiddleClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
}

export function EditorTab(props: EditorTabProps) {
  const [isHovered, setIsHovered] = createSignal(false);

  const parentDir = () => {
    if (!props.showParentDir) return null;
    const parts = props.filePath.split(/[/\\]/);
    return parts.length >= 2 ? parts[parts.length - 2] : null;
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      props.onMiddleClick();
    }
  };

  const tabStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      display: "flex",
      "align-items": "center",
      gap: "6px",
      padding: "0 12px",
      height: "100%",
      cursor: "pointer",
      "user-select": "none",
      "white-space": "nowrap",
      "flex-shrink": "0",
      "font-size": "13px",
      "font-family": "var(--cortex-font-sans, Inter, system-ui, sans-serif)",
      transition: "background 100ms ease, color 100ms ease",
      position: "relative",
      "border-left": props.dropPosition === "left"
        ? "2px solid var(--cortex-accent-primary, #B2FF22)"
        : "none",
      "border-right": props.dropPosition === "right"
        ? "2px solid var(--cortex-accent-primary, #B2FF22)"
        : "none",
    };

    if (props.isActive) {
      base.background = CortexTokens.colors.bg.secondary;
      base.color = CortexTokens.colors.text.primary;
      base["border-bottom"] = "2px solid var(--cortex-accent-primary, #B2FF22)";
    } else {
      base.background = isHovered() ? CortexTokens.colors.bg.hover : "transparent";
      base.color = CortexTokens.colors.text.secondary;
      base["border-bottom"] = "2px solid transparent";
    }

    return base;
  };

  const labelStyle = (): JSX.CSSProperties => ({
    overflow: "hidden",
    "text-overflow": "ellipsis",
    "font-style": props.isPreview ? "italic" : "normal",
  });

  const parentDirStyle: JSX.CSSProperties = {
    color: CortexTokens.colors.text.muted,
    "font-size": "12px",
    "margin-right": "2px",
  };

  const closeButtonStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "18px",
    height: "18px",
    "border-radius": "var(--cortex-radius-xs, 4px)",
    border: "none",
    background: "transparent",
    color: CortexTokens.colors.text.muted,
    cursor: "pointer",
    padding: "0",
    "flex-shrink": "0",
    opacity: isHovered() || props.isActive ? "1" : "0",
    transition: "opacity 100ms ease, background 100ms ease",
  });

  const dirtyDotStyle: JSX.CSSProperties = {
    width: "8px",
    height: "8px",
    "border-radius": "var(--cortex-radius-full, 9999px)",
    background: CortexTokens.colors.text.secondary,
    "flex-shrink": "0",
  };

  const showDirtyDot = () => props.isDirty && !isHovered() && !props.isActive;
  const showCloseBtn = () => !showDirtyDot();

  return (
    <div
      style={tabStyle()}
      onClick={props.onSelect}
      onDblClick={props.onDoubleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={props.onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable={true}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      data-tab-id={props.fileId}
      role="tab"
      aria-selected={props.isActive}
    >
      <FileIcon filename={props.fileName} size={16} />

      <span style={labelStyle()}>
        <Show when={parentDir()}>
          <span style={parentDirStyle}>{parentDir()}/</span>
        </Show>
        {props.fileName}
      </span>

      <Show when={props.isPinned}>
        <Icon
          name="thumbtack"
          size={10}
          style={{
            color: CortexTokens.colors.text.muted,
            "flex-shrink": "0",
          }}
        />
      </Show>

      <Show when={!props.isPinned}>
        <Show when={showDirtyDot()}>
          <span style={dirtyDotStyle} title="Unsaved changes" />
        </Show>
        <Show when={showCloseBtn()}>
          <button
            style={closeButtonStyle()}
            onClick={(e) => {
              e.stopPropagation();
              props.onClose(e);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--cortex-interactive-hover, rgba(255,255,255,0.1))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            title="Close"
            aria-label={`Close ${props.fileName}`}
          >
            <Show when={props.isDirty && (isHovered() || props.isActive)}>
              <span style={dirtyDotStyle} />
            </Show>
            <Show when={!props.isDirty || (!isHovered() && !props.isActive)}>
              <Icon name="xmark" size={12} />
            </Show>
          </button>
        </Show>
      </Show>
    </div>
  );
}

export default EditorTab;
