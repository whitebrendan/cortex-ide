/**
 * CortexActivityBar - Pixel-perfect activity bar matching Figma sidebar-container
 * Figma node: I1156:23695;885:19533 (sidebar-container)
 * Width: 40px, border-radius 12px, bg #1C1C1D, border 1px solid #2E2F31
 * Items: 32×32 containers, 16×16 icons, 4px gap, 8px button padding
 * Active state: #2E2F31 bg (border-default color) with white icon (#FCFCFC), border-radius 8px
 * Inactive: icon #8C8D8F, bg same as container (#1C1C1D)
 * Hover: icon #FCFCFC
 * Bottom section: settings (settings) + avatar circle (24×24) with green status dot
 */

import { Component, JSX, splitProps, createSignal, For, Show } from "solid-js";
import { CortexIcon, CortexTooltip, CortexToggle } from "./primitives";

export interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
  badge?: number;
}

export interface CortexActivityBarProps {
  items?: ActivityBarItem[];
  activeId?: string | null;
  onItemClick?: (id: string) => void;
  avatarUrl?: string;
  onAvatarClick?: () => void;
  onSettingsClick?: () => void;
  showToggle?: boolean;
  toggleValue?: boolean;
  onToggleChange?: (value: boolean) => void;
  class?: string;
  style?: JSX.CSSProperties;
}

const DEFAULT_ITEMS: ActivityBarItem[] = [
  { id: "home", icon: "home", label: "Home" },
  { id: "files", icon: "folder", label: "Explorer" },
  { id: "search", icon: "search", label: "Search" },
  { id: "git", icon: "git", label: "Source Control" },
  { id: "debug", icon: "play", label: "Run & Debug" },
  { id: "extensions", icon: "box", label: "Extensions" },
  { id: "agents", icon: "users", label: "AI Agents" },
  { id: "dashboard", icon: "dashboard", label: "Dashboard" },
  { id: "docs", icon: "book", label: "Documentation" },
  { id: "map", icon: "map", label: "Roadmap" },
  { id: "themes", icon: "draw", label: "Themes" },
];

export const CortexActivityBar: Component<CortexActivityBarProps> = (props) => {
  const [local, others] = splitProps(props, [
    "items", "activeId", "onItemClick", "avatarUrl", "onAvatarClick",
    "onSettingsClick", "showToggle", "toggleValue", "onToggleChange",
    "class", "style",
  ]);

  const items = () => local.items || DEFAULT_ITEMS;

  return (
    <>
      <style>{`.cortex-activity-bar-nav::-webkit-scrollbar { display: none; }`}</style>
      <aside
        class={local.class || ""}
        style={{
          display: "flex",
          "flex-direction": "column",
          width: "var(--cortex-space-10)",
          height: "100%",
          background: "var(--cortex-sidebar-bg)",
          "border-radius": "var(--cortex-sidebar-radius)",
          border: "1px solid var(--cortex-border-default)",
          padding: "var(--cortex-space-1)",
          "flex-shrink": "0",
          ...local.style,
        }}
        {...others}
      >
        <nav
          class="cortex-activity-bar-nav"
          style={{
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            padding: "0",
            gap: "var(--cortex-space-1)",
            flex: "1",
            "overflow-y": "auto",
            "overflow-x": "hidden",
          }}
        >
          <For each={items()}>
            {(item) => (
              <ActivityBarButton
                item={item}
                isActive={local.activeId === item.id}
                onClick={() => local.onItemClick?.(item.id)}
              />
            )}
          </For>
        </nav>

        <div style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          padding: "0",
          gap: "var(--cortex-space-1)",
        }}>
          <ActivityBarSettingsButton onClick={local.onSettingsClick} />
          <AvatarButton
            avatarUrl={local.avatarUrl}
            onClick={local.onAvatarClick}
          />
          <Show when={local.showToggle}>
            <CortexToggle
              checked={local.toggleValue}
              onChange={local.onToggleChange}
              size="sm"
            />
          </Show>
        </div>
      </aside>
    </>
  );
};

interface ActivityBarButtonProps {
  item: ActivityBarItem;
  isActive: boolean;
  onClick: () => void;
}

const ActivityBarButton: Component<ActivityBarButtonProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const bg = () => {
    if (props.isActive) return "var(--cortex-border-default)";
    if (isHovered()) return "var(--cortex-sidebar-selected)";
    return "transparent";
  };

  const iconColor = () => {
    if (props.isActive) return "var(--cortex-text-primary)";
    if (isHovered()) return "var(--cortex-text-primary)";
    return "var(--cortex-icon-inactive)";
  };

  return (
    <CortexTooltip content={props.item.label} position="right">
      <button
        style={{
          position: "relative",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          width: "var(--cortex-space-8)",
          height: "var(--cortex-space-8)",
          background: bg(),
          border: "none",
          "border-radius": "var(--cortex-radius-md)",
          cursor: "pointer",
          transition: "all var(--cortex-transition-fast)",
          padding: "var(--cortex-space-2)",
          "flex-shrink": "0",
        }}
        onClick={props.onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-pressed={props.isActive}
        aria-label={props.item.label}
      >
        <CortexIcon
          name={props.item.icon}
          size={16}
          color={iconColor()}
          style={{ transition: "color var(--cortex-transition-fast)" }}
        />
        <Show when={(props.item.badge ?? 0) > 0}>
          <span style={{
            position: "absolute",
            top: "var(--cortex-space-0-5)",
            right: "var(--cortex-space-0-5)",
            "min-width": "var(--cortex-space-3-5)",
            height: "var(--cortex-space-3-5)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            padding: "0 var(--cortex-space-1)",
            background: "var(--cortex-accent-primary)",
            color: "var(--cortex-icon-active)",
            "font-family": "var(--cortex-font-sans)",
            "font-size": "9px",
            "font-weight": "var(--cortex-font-semibold)",
            "border-radius": "var(--cortex-radius-md)",
            "line-height": "1",
          }}>
            {(props.item.badge ?? 0) > 99 ? "99+" : props.item.badge}
          </span>
        </Show>
      </button>
    </CortexTooltip>
  );
};

const ActivityBarSettingsButton: Component<{ onClick?: () => void }> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const handleClick = () => {
    if (props.onClick) props.onClick();
    else window.dispatchEvent(new CustomEvent("settings:open-tab"));
  };

  return (
    <CortexTooltip content="Settings" position="right">
      <button
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          width: "var(--cortex-space-8)",
          height: "var(--cortex-space-8)",
          background: isHovered() ? "var(--cortex-sidebar-selected)" : "transparent",
          border: "none",
          "border-radius": "var(--cortex-radius-md)",
          cursor: "pointer",
          transition: "all var(--cortex-transition-fast)",
          padding: "var(--cortex-space-2)",
        }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Settings"
      >
        <CortexIcon
          name="settings"
          size={16}
          color={isHovered() ? "var(--cortex-text-primary)" : "var(--cortex-icon-inactive)"}
          style={{ transition: "color var(--cortex-transition-fast)" }}
        />
      </button>
    </CortexTooltip>
  );
};

const AvatarButton: Component<{ avatarUrl?: string; onClick?: () => void }> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  return (
    <CortexTooltip content="Account" position="right">
      <button
        style={{
          position: "relative",
          width: "24px",
          height: "24px",
          "border-radius": "var(--cortex-radius-full)",
          background: "var(--cortex-bg-tertiary)",
          border: isHovered()
            ? "2px solid var(--cortex-accent-primary)"
            : "2px solid transparent",
          cursor: "pointer",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          overflow: "visible",
          transition: "border-color var(--cortex-transition-fast)",
          padding: "0",
        }}
        onClick={props.onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="User account"
      >
        <Show
          when={props.avatarUrl}
          fallback={
            <CortexIcon
              name="user"
              size={14}
              color="var(--cortex-icon-inactive)"
            />
          }
        >
          <img
            src={props.avatarUrl}
            alt="User avatar"
            style={{
              width: "100%",
              height: "100%",
              "object-fit": "cover",
              "border-radius": "var(--cortex-radius-full)",
            }}
          />
        </Show>
        <span style={{
          position: "absolute",
          bottom: "-1px",
          right: "-1px",
          width: "6px",
          height: "6px",
          "border-radius": "var(--cortex-radius-full)",
          background: "var(--cortex-palette-success-400)",
          border: "1px solid var(--cortex-sidebar-bg)",
        }} />
      </button>
    </CortexTooltip>
  );
};

export default CortexActivityBar;
