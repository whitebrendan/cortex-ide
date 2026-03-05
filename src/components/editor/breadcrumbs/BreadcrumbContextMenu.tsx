import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../../ui/Icon";
import type { BreadcrumbContextMenuProps } from "./breadcrumbTypes";

const menuButtonStyle = {
  width: "100%",
  height: "26px",
  padding: "0 26px",
  display: "flex",
  "align-items": "center",
  gap: "8px",
  cursor: "pointer",
  color: "var(--cortex-menu-foreground-color, #cccccc)",
  "font-size": "13px",
  border: "none",
  background: "transparent",
  "text-align": "left",
  "white-space": "nowrap",
} as const;

const menuIconStyle = {
  width: "16px",
  height: "16px",
  "flex-shrink": "0",
  color: "var(--cortex-text-muted, rgba(204, 204, 204, 0.6))",
} as const;

const handleMouseEnter = (e: MouseEvent) => {
  (e.currentTarget as HTMLElement).style.background = "var(--cortex-menu-selection-background-color, #04395e)";
  (e.currentTarget as HTMLElement).style.color = "var(--cortex-menu-selection-foreground-color, #ffffff)";
};

const handleMouseLeave = (e: MouseEvent) => {
  (e.currentTarget as HTMLElement).style.background = "transparent";
  (e.currentTarget as HTMLElement).style.color = "var(--cortex-menu-foreground-color, #cccccc)";
};

function calculatePosition(pos: { x: number; y: number }) {
  const padding = 8;
  const menuWidth = 220;
  const menuHeight = 120;

  let x = pos.x;
  let y = pos.y;

  if (x + menuWidth > window.innerWidth - padding) {
    x = window.innerWidth - menuWidth - padding;
  }
  if (y + menuHeight > window.innerHeight - padding) {
    y = window.innerHeight - menuHeight - padding;
  }

  x = Math.max(padding, x);
  y = Math.max(padding, y);

  return { x, y };
}

export function BreadcrumbContextMenu(props: BreadcrumbContextMenuProps) {
  return (
    <Show when={props.contextMenuPos}>
      <Portal>
        <div
          ref={(el) => props.setContextMenuRef(el)}
          class="breadcrumb-dropdown"
          style={{
            position: "fixed",
            left: `${calculatePosition(props.contextMenuPos!).x}px`,
            top: `${calculatePosition(props.contextMenuPos!).y}px`,
            "min-width": "180px",
            background: "var(--cortex-menu-background-color, #1e1e1e)",
            border: "1px solid var(--cortex-menu-border-color, #454545)",
            "border-radius": "var(--cortex-menu-border-radius, 6px)",
            "box-shadow": "0 2px 8px var(--cortex-menu-shadow-color, rgba(0, 0, 0, 0.36))",
            padding: "4px 0",
            "z-index": "2575",
          }}
        >
          <button
            class="breadcrumb-dropdown-item"
            style={menuButtonStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={props.onCopyPath}
          >
            <Icon name="clipboard" style={menuIconStyle} />
            <span>Copy Path</span>
          </button>
          <button
            class="breadcrumb-dropdown-item"
            style={menuButtonStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={props.onCopyRelativePath}
          >
            <Icon name="clipboard" style={menuIconStyle} />
            <span>Copy Relative Path</span>
          </button>
          <div
            style={{
              height: "1px",
              background: "var(--cortex-menu-separator-color, #454545)",
              margin: "4px 0",
            }}
          />
          <button
            class="breadcrumb-dropdown-item"
            style={menuButtonStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={props.onRevealInExplorer}
          >
            <Icon name="arrow-up-right-from-square" style={menuIconStyle} />
            <span>Reveal in File Explorer</span>
          </button>
        </div>
      </Portal>
    </Show>
  );
}
