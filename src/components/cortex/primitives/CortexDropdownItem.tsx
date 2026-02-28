/**
 * CortexDropdownItem - Pixel-perfect dropdown menu item for Cortex UI Design System
 * Figma "Dropdown Item": supports default and recent file variants
 */

import { Component, JSX, splitProps, createSignal, Show } from "solid-js";
import { CortexIcon } from "./CortexIcon";

export interface CortexDropdownItemProps {
  label: string;
  shortcut?: string;
  iconRight?: string;
  showShortcut?: boolean;
  showIconRight?: boolean;
  onClick?: (e: MouseEvent) => void;
  class?: string;
  style?: JSX.CSSProperties;
  isRecentFile?: boolean;
}

export const CortexDropdownItem: Component<CortexDropdownItemProps> = (props) => {
  const [local, others] = splitProps(props, [
    "label",
    "shortcut",
    "iconRight",
    "showShortcut",
    "showIconRight",
    "onClick",
    "class",
    "style",
    "isRecentFile",
  ]);

  const [hovered, setHovered] = createSignal(false);
  const [pressed, setPressed] = createSignal(false);
  const [focused, setFocused] = createSignal(false);

  const getItemBackground = (): string => {
    if (pressed()) return "var(--cortex-dropdown-item-active, var(--cortex-bg-active, #2A2B2E))";
    if (hovered() || focused()) return "var(--cortex-dropdown-item-hover, #252628)";
    return "transparent";
  };

  const baseStyle = (): JSX.CSSProperties => {
    if (local.isRecentFile) {
      return {
        display: "flex",
        "flex-direction": "column",
        "align-self": "stretch",
        padding: "8px",
        gap: "8px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        transition: "all var(--cortex-transition-normal, 150ms ease)",
        "text-align": "left",
        width: "100%",
        outline: "none",
        ...local.style,
      };
    }

    const isHighlighted = hovered() || focused() || pressed();
    return {
      display: "flex",
      "flex-direction": "row",
      "align-items": "center",
      "justify-content": "space-between",
      "align-self": "stretch",
      padding: "4px 8px",
      gap: "8px",
      background: getItemBackground(),
      "border-radius": isHighlighted ? "4px" : "0",
      border: "none",
      cursor: "pointer",
      transition: "all var(--cortex-transition-normal, 150ms ease)",
      "text-align": "left",
      width: "100%",
      outline: "none",
      ...local.style,
    };
  };

  const labelStyle = (): JSX.CSSProperties => ({
    "font-family": "'Figtree', var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": local.isRecentFile ? "16px" : "12px",
    "font-weight": local.isRecentFile ? "500" : "400",
    "line-height": "1em",
    color: "var(--cortex-text-primary, #FCFCFC)",
    "white-space": "nowrap",
    overflow: "hidden",
    "text-overflow": "ellipsis",
  });

  const shortcutStyle = (): JSX.CSSProperties => ({
    "font-family": "'Figtree', var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": "12px",
    "font-weight": "400",
    "line-height": "1em",
    color: "#8C8D8F",
    "white-space": "nowrap",
    "flex-shrink": "0",
  });

  const handleMouseEnter = () => {
    if (!local.isRecentFile) setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setPressed(false);
  };

  const handleMouseDown = () => {
    if (!local.isRecentFile) setPressed(true);
  };

  const handleMouseUp = () => {
    setPressed(false);
  };

  const handleFocus = () => {
    if (!local.isRecentFile) setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      local.onClick?.(e as unknown as MouseEvent);
    }
  };

  const handleClick = (e: MouseEvent) => {
    local.onClick?.(e);
  };

  return (
    <button
      type="button"
      role="menuitem"
      tabindex="0"
      class={local.class}
      style={baseStyle()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      {...others}
    >
      <span style={labelStyle()}>{local.label}</span>
      <Show when={!local.isRecentFile && local.showShortcut && local.shortcut}>
        <span style={shortcutStyle()}>{local.shortcut}</span>
      </Show>
      <Show when={!local.isRecentFile && local.showIconRight && local.iconRight}>
        <CortexIcon name={local.iconRight!} size={16} />
      </Show>
    </button>
  );
};

export default CortexDropdownItem;
