/**
 * WelcomeTab - Welcome screen shown when no files are open
 *
 * Displays Cortex IDE branding and keyboard shortcut hints
 * to help users get started. Styled with CortexTokens.
 */

import { type JSX } from "solid-js";
import { Icon } from "../ui/Icon";
import { CortexTokens } from "@/design-system/tokens/cortex-tokens";

export interface WelcomeTabProps {
  class?: string;
  style?: JSX.CSSProperties;
}

export function WelcomeTab(props: WelcomeTabProps) {
  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    flex: "1",
    "flex-direction": "column",
    "align-items": "center",
    "justify-content": "center",
    gap: "32px",
    background: CortexTokens.colors.bg.primary,
    "min-height": "0",
    ...props.style,
  });

  const brandStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    gap: "12px",
  };

  const logoStyle: JSX.CSSProperties = {
    width: "48px",
    height: "48px",
    color: CortexTokens.colors.accent.primary,
    opacity: "0.6",
  };

  const titleStyle: JSX.CSSProperties = {
    margin: "0",
    "font-size": "20px",
    "font-weight": "600",
    color: CortexTokens.colors.text.primary,
    "font-family": "var(--cortex-font-sans, Inter, system-ui, sans-serif)",
    "letter-spacing": "-0.02em",
  };

  const subtitleStyle: JSX.CSSProperties = {
    margin: "0",
    "font-size": "14px",
    color: CortexTokens.colors.text.muted,
    "font-family": "var(--cortex-font-sans, Inter, system-ui, sans-serif)",
  };

  const shortcutsStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
  };

  const shortcutRowStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "12px",
    "font-size": "13px",
    color: CortexTokens.colors.text.secondary,
    "font-family": "var(--cortex-font-sans, Inter, system-ui, sans-serif)",
  };

  const kbdStyle: JSX.CSSProperties = {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    "min-width": "24px",
    padding: "2px 8px",
    "font-size": "12px",
    "font-family": "var(--cortex-font-mono, 'JetBrains Mono', monospace)",
    background: CortexTokens.colors.bg.elevated,
    border: `1px solid ${CortexTokens.colors.border.default}`,
    "border-radius": "var(--cortex-radius-xs, 4px)",
    color: CortexTokens.colors.text.primary,
    "white-space": "nowrap",
  };

  const shortcuts = [
    { keys: "Ctrl+P", label: "Quick Open File" },
    { keys: "Ctrl+N", label: "New File" },
    { keys: "Ctrl+O", label: "Open File" },
    { keys: "Ctrl+Shift+P", label: "Command Palette" },
  ];

  return (
    <div class={props.class} style={containerStyle()}>
      <div style={brandStyle}>
        <Icon name="brain" style={logoStyle} />
        <h2 style={titleStyle}>Cortex IDE</h2>
        <p style={subtitleStyle}>AI-Powered Development Environment</p>
      </div>

      <div style={shortcutsStyle}>
        {shortcuts.map((shortcut) => (
          <div style={shortcutRowStyle}>
            <kbd style={kbdStyle}>{shortcut.keys}</kbd>
            <span>{shortcut.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WelcomeTab;
