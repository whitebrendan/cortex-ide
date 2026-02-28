/**
 * CortexStatusBar - Pixel-perfect IDE footer matching Figma design
 *
 * Figma specs (node 1156:23808 "footer", component set 1125:18294):
 * - Container: flex row, space-between, gap 40px, padding 8px, no fixed height (hug)
 * - No background, no border-top (transparent)
 * - Left section (gap 4px): icon buttons for panel toggle, terminal, git branch, notifications
 * - Right section: Code Navigation Help button
 * - Button-icon: 32×32, padding 8px, border-radius 8px
 *   - Active: bg #1C1C1D, border 1px solid #2E2E31, icon #FCFCFC
 *   - Default: transparent, icon #8C8D8F
 * - Text: Figtree 14px weight 500
 */

import { Component, JSX, splitProps, Show, createSignal } from "solid-js";
import { CortexSvgIcon, type CortexIconName } from "./icons";
import { BranchStatusBarItem } from "@/components/git/BranchStatusBarItem";

export type CortexStatusBarVariant = "default" | "active";

export interface StatusBarItem {
  id: string;
  icon: string;
  label: string;
  onClick?: () => void;
}

export interface CortexStatusBarProps {
  variant?: CortexStatusBarVariant;
  branchName?: string | null;
  isSyncing?: boolean;
  hasChanges?: boolean;
  hasNotificationDot?: boolean;
  notificationCount?: number;
  languageName?: string;
  onBranchClick?: () => void;
  onNotificationClick?: () => void;
  onTogglePanel?: () => void;
  onToggleTerminal?: () => void;
  onSourceControl?: () => void;
  onCodeNavHelp?: () => void;
  leftItems?: StatusBarItem[];
  rightItems?: StatusBarItem[];
  class?: string;
  style?: JSX.CSSProperties;
}

export const CortexStatusBar: Component<CortexStatusBarProps> = (props) => {
  const [local] = splitProps(props, [
    "variant",
    "branchName",
    "isSyncing",
    "hasChanges",
    "hasNotificationDot",
    "notificationCount",
    "languageName",
    "onBranchClick",
    "onNotificationClick",
    "onTogglePanel",
    "onToggleTerminal",
    "onSourceControl",
    "onCodeNavHelp",
    "leftItems",
    "rightItems",
    "class",
    "style",
  ]);

  const isActive = () => local.variant === "active";

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "40px",
    padding: "8px",
    "flex-shrink": "0",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "14px",
    "font-weight": "500",
    color: "var(--cortex-text-secondary, #8C8D8F)",
    ...local.style,
  });

  const sectionStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "4px",
  };

  const showNotificationDot = () =>
    local.hasNotificationDot || (local.notificationCount ?? 0) > 0;

  return (
    <footer class={local.class} style={containerStyle()} data-testid="cortex-status-bar">
      {/* Left Section: Icon buttons */}
      <div style={sectionStyle}>
        <StatusBarIconButton
          iconName={"status-bar/layout-alt-04" as CortexIconName}
          onClick={local.onTogglePanel}
          title="Toggle Panel"
          active={isActive()}
        />

        <StatusBarIconButton
          iconName={"status-bar/terminal-square" as CortexIconName}
          onClick={local.onToggleTerminal}
          title="Toggle Terminal"
        />

        <BranchStatusBarItem />

        <StatusBarIconButton
          iconName={"status-bar/info-circle" as CortexIconName}
          onClick={local.onNotificationClick}
          title="Notifications"
          showDot={showNotificationDot()}
        />

        <Show when={local.leftItems}>
          {(items) => (
            <>
              {items().map((item) => (
                <StatusBarIconButton
                  iconName={item.icon as CortexIconName}
                  onClick={item.onClick}
                  title={item.label}
                />
              ))}
            </>
          )}
        </Show>
      </div>

      {/* Right Section: Code Navigation Help */}
      <div style={{ ...sectionStyle }}>
        <Show when={local.rightItems}>
          {(items) => (
            <>
              {items().map((item) => (
                <StatusBarIconButton
                  iconName={item.icon as CortexIconName}
                  onClick={item.onClick}
                  title={item.label}
                />
              ))}
            </>
          )}
        </Show>

        <button
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            gap: "4px",
            padding: "8px",
            border: "none",
            background: "transparent",
            color: "var(--cortex-text-on-surface, #FCFCFC)",
            "font-family": "inherit",
            "font-size": "inherit",
            "font-weight": "inherit",
            cursor: "pointer",
            height: "32px",
            "border-radius": "8px",
          }}
          onClick={() => local.onCodeNavHelp?.()}
          title="Code Navigation Help"
          aria-label="Code Navigation Help"
        >
          <CortexSvgIcon
            name={"navigation/chevron-left" as CortexIconName}
            size={16}
            color="var(--cortex-text-secondary, #8C8D8F)"
          />
          <span style={{ color: "var(--cortex-text-on-surface, #FCFCFC)" }}>Code Navigation Help</span>
        </button>
      </div>
    </footer>
  );
};

interface StatusBarIconButtonProps {
  iconName: CortexIconName;
  onClick?: (() => void) | undefined;
  title?: string;
  active?: boolean;
  showDot?: boolean;
}

const StatusBarIconButton: Component<StatusBarIconButtonProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const iconColor = () => {
    if (props.active || isHovered()) return "var(--cortex-text-on-surface, #FCFCFC)";
    return "var(--cortex-text-secondary, #8C8D8F)";
  };

  const buttonBg = () => {
    if (props.active) return "var(--cortex-bg-surface, #1C1C1D)";
    if (isHovered()) return "var(--cortex-surface-hover, rgba(255, 255, 255, 0.06))";
    return "transparent";
  };

  const buttonBorder = () => {
    if (props.active) return "1px solid var(--cortex-border-default, #2E2F31)";
    return "1px solid transparent";
  };

  return (
    <button
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        width: "32px",
        height: "32px",
        padding: "8px",
        cursor: props.onClick ? "pointer" : "default",
        background: buttonBg(),
        border: buttonBorder(),
        "border-radius": "8px",
        position: "relative",
        transition: "background 150ms ease, border-color 150ms ease",
      }}
      title={props.title}
      aria-label={props.title}
      onClick={() => props.onClick?.()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CortexSvgIcon
        name={props.iconName}
        size={16}
        color={iconColor()}
      />
      <Show when={props.showDot}>
        <span
          data-testid="notification-dot"
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            width: "6px",
            height: "6px",
            "border-radius": "50%",
            background: "var(--cortex-accent-primary, #0288D1)",
          }}
        />
      </Show>
    </button>
  );
};

export default CortexStatusBar;
