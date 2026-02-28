/**
 * ExplorerHeader - Tab header for Explorer panel
 * Figma: pill-in-container tab switcher (file 4hKtI49khKHjribAGpFUkW, node 1060:33326)
 *
 * Outer frame: 320×48, padding 4 4 4 12
 * Tab bar: 312×32, bg #141415, border-radius 8px, padding 4, gap 4
 * Active button: 150×24, bg #1C1C1D, border-radius 4px
 * Inactive button: 150×24, bg transparent, border-radius 4px
 * Active text: Figtree 14px/500, #FCFCFC
 * Inactive text: Figtree 14px/500, #8C8C8F
 */

import { Component, JSX } from "solid-js";
import { CortexIcon } from "../primitives";

export type ExplorerTab = "explorer" | "ai-terminal";

export interface ExplorerHeaderProps {
  activeTab?: ExplorerTab;
  onTabChange?: (tab: ExplorerTab) => void;
}

export const ExplorerHeader: Component<ExplorerHeaderProps> = (props) => {
  const activeTab = () => props.activeTab ?? "explorer";

  const outerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    "align-self": "stretch",
    width: "100%",
    padding: "4px 4px 12px 4px",
    "flex-shrink": "0",
    "box-sizing": "border-box",
  });

  const barStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "row",
    "align-items": "center",
    gap: "4px",
    padding: "4px",
    background: "#141415",
    "border-radius": "8px",
    height: "32px",
    "box-sizing": "border-box",
  });

  const btnStyle = (isActive: boolean): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "row",
    "justify-content": "center",
    "align-items": "center",
    gap: "4px",
    padding: "4px",
    flex: "1",
    height: "24px",
    cursor: "pointer",
    background: isActive ? "#1C1C1D" : "transparent",
    border: "none",
    "border-radius": "4px",
    "box-sizing": "border-box",
  });

  const textStyle = (isActive: boolean): JSX.CSSProperties => ({
    "font-family": "Figtree, var(--cortex-font-sans, Inter, sans-serif)",
    "font-size": "14px",
    "font-weight": "500",
    "line-height": "1.15em",
    color: isActive ? "#FCFCFC" : "#8C8C8F",
    "white-space": "nowrap",
  });

  return (
    <div style={outerStyle()}>
      <div style={barStyle()}>
        <button
          style={btnStyle(activeTab() === "explorer")}
          onClick={() => props.onTabChange?.("explorer")}
          aria-label="Explorer"
          aria-selected={activeTab() === "explorer"}
          role="tab"
        >
          <CortexIcon name="folder" size={16} color={activeTab() === "explorer" ? "#FCFCFC" : "#8C8C8F"} />
          <span style={textStyle(activeTab() === "explorer")}>Explorer</span>
        </button>

        <button
          style={btnStyle(activeTab() === "ai-terminal")}
          onClick={() => props.onTabChange?.("ai-terminal")}
          aria-label="AI Terminal"
          aria-selected={activeTab() === "ai-terminal"}
          role="tab"
        >
          <CortexIcon name="star" size={16} color={activeTab() === "ai-terminal" ? "#FCFCFC" : "#8C8C8F"} />
          <span style={textStyle(activeTab() === "ai-terminal")}>AI Terminal</span>
        </button>
      </div>
    </div>
  );
};

export default ExplorerHeader;
