import { Component, JSX, createSignal } from "solid-js";

export const WindowsLinuxWindowControls: Component<{
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
}> = (props) => {
  const buttonBase: JSX.CSSProperties = {
    width: "40px",
    height: "48px",
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "0",
    color: "var(--cortex-text-secondary)",
  };

  const [hoveredBtn, setHoveredBtn] = createSignal<string | null>(null);

  const btnStyle = (id: string, hoverBg: string): JSX.CSSProperties => ({
    ...buttonBase,
    background: hoveredBtn() === id ? hoverBg : "transparent",
    color: hoveredBtn() === id && id === "close" ? "#fff" : "var(--cortex-text-secondary)",
  });

  return (
    <div style={{ display: "flex", "align-items": "center" }}>
      <button
        type="button"
        style={btnStyle("min", "var(--cortex-bg-hover)")}
        onClick={props.onMinimize}
        onMouseEnter={() => setHoveredBtn("min")}
        onMouseLeave={() => setHoveredBtn(null)}
        aria-label="Minimize"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 8h8" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button
        type="button"
        style={btnStyle("max", "var(--cortex-bg-hover)")}
        onClick={props.onMaximize}
        onMouseEnter={() => setHoveredBtn("max")}
        onMouseLeave={() => setHoveredBtn(null)}
        aria-label="Maximize"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="4" y="4" width="8" height="8" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button
        type="button"
        style={btnStyle("close", "#c42b1c")}
        onClick={props.onClose}
        onMouseEnter={() => setHoveredBtn("close")}
        onMouseLeave={() => setHoveredBtn(null)}
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>
  );
};
