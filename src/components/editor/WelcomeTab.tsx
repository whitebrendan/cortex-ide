/**
 * WelcomeTab - Welcome/Start screen shown when no files are open
 *
 * Pixel-perfect implementation matching Figma screens:
 *   - 1027:23374 (IDE start screen with sidebar expanded)
 *   - 645:12763  (start screen with sidebar collapsed)
 *   - 1125:18513 (start screen no sidebar)
 *   - 1239:21482 (compact option)
 *
 * Layout: centered container with title text + AI prompt input
 * Typography: Figtree 32px/40px weight 500 for title
 * Input: bg #1C1C1D, border 1px #2E2F31, border-radius 16px
 */

import { type JSX, createSignal } from "solid-js";

export interface WelcomeTabProps {
  class?: string;
  style?: JSX.CSSProperties;
  compact?: boolean;
}

export function WelcomeTab(props: WelcomeTabProps) {
  const [inputValue, setInputValue] = createSignal("");
  const [inputFocused, setInputFocused] = createSignal(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const value = inputValue().trim();
      if (value) {
        window.dispatchEvent(
          new CustomEvent("chat:submit", { detail: { message: value } })
        );
        setInputValue("");
      }
    }
  };

  const handleSendClick = () => {
    const value = inputValue().trim();
    if (value) {
      window.dispatchEvent(
        new CustomEvent("chat:submit", { detail: { message: value } })
      );
      setInputValue("");
    }
  };

  const workspaceStyle = (): JSX.CSSProperties => ({
    display: "flex",
    flex: "1",
    "flex-direction": "column",
    "align-items": "center",
    "justify-content": "center",
    background: "var(--cortex-bg-primary)",
    "min-height": "0",
    ...props.style,
  });

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    gap: "28px",
    "max-width": props.compact ? "none" : "922px",
    width: props.compact ? "auto" : "100%",
  });

  const titleStyle: JSX.CSSProperties = {
    margin: "0",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "32px",
    "font-weight": "500",
    "line-height": "40px",
    "letter-spacing": "0px",
    "text-align": "center",
    color: "#FCFCFC",
    width: "100%",
  };

  const inputContainerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    width: props.compact ? "100%" : "686px",
    background: "#1C1C1D",
    border: inputFocused()
      ? "1px solid var(--cortex-accent-primary)"
      : "1px solid #2E2F31",
    "border-radius": "16px",
    overflow: "hidden",
    transition: "border-color 150ms ease",
  });

  const typeAreaStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "8px",
    padding: "16px",
    height: "48px",
    "box-sizing": "border-box",
  };

  const inputStyle: JSX.CSSProperties = {
    flex: "1",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#FCFCFC",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "14px",
    "font-weight": "400",
    "line-height": "16px",
    padding: "0",
    margin: "0",
  };

  const actionAreaStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    padding: "0 16px 16px 16px",
    height: "44px",
    "box-sizing": "border-box",
  };

  const attachButtonStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "28px",
    height: "28px",
    background: "transparent",
    border: "none",
    "border-radius": "8px",
    cursor: "pointer",
    padding: "0",
    color: "#8C8D8F",
  };

  const actionsRightStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "12px",
  };

  const pillButtonStyle: JSX.CSSProperties = {
    display: "inline-flex",
    "align-items": "center",
    gap: "4px",
    padding: "6px",
    background: "transparent",
    border: "none",
    "border-radius": "8px",
    cursor: "pointer",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "14px",
    "font-weight": "500",
    "line-height": "16px",
    color: "#FCFCFC",
    "white-space": "nowrap",
  };

  const sendButtonStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "28px",
    height: "28px",
    background: inputValue().trim() ? "#4C4C4D" : "#2E2F31",
    border: "none",
    "border-radius": "999px",
    cursor: inputValue().trim() ? "pointer" : "default",
    padding: "0",
    transition: "background 100ms ease",
  });

  return (
    <div class={props.class} style={workspaceStyle()}>
      <div style={containerStyle()}>
        <h2 style={titleStyle}>
          Hey, start building or open your project.
        </h2>

        <div style={inputContainerStyle()}>
          {/* Type area */}
          <div style={typeAreaStyle}>
            <input
              type="text"
              value={inputValue()}
              placeholder="Ask Cortex anything..."
              style={inputStyle}
              onInput={(e) => setInputValue(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </div>

          {/* Action area */}
          <div style={actionAreaStyle}>
            <button style={attachButtonStyle} aria-label="Attach file">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M14.1667 7.36666L8.18 13.3533C7.31222 14.2211 6.13777 14.7088 4.91333 14.7088C3.6889 14.7088 2.51445 14.2211 1.64667 13.3533C0.778889 12.4856 0.291199 11.3111 0.291199 10.0867C0.291199 8.86222 0.778889 7.68777 1.64667 6.82L7.63333 0.833328C8.21222 0.254438 9.00222 -0.0722656 9.82667 -0.0722656C10.6511 -0.0722656 11.4411 0.254438 12.02 0.833328C12.5989 1.41222 12.9256 2.20222 12.9256 3.02667C12.9256 3.85111 12.5989 4.64111 12.02 5.22L5.98 11.2067C5.69056 11.4961 5.29556 11.6594 4.88333 11.6594C4.47111 11.6594 4.07611 11.4961 3.78667 11.2067C3.49722 10.9172 3.33389 10.5222 3.33389 10.11C3.33389 9.69778 3.49722 9.30278 3.78667 9.01333L9.22 3.58"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <div style={actionsRightStyle}>
              <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                <button style={pillButtonStyle}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M8 1L10 5L14.5 5.5L11.25 8.5L12 13L8 10.5L4 13L4.75 8.5L1.5 5.5L6 5L8 1Z"
                      fill="#FF4081"
                    />
                  </svg>
                  <span>Build</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="#8C8D8F"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>

                <button style={pillButtonStyle}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="8" cy="8" r="6" fill="#D97757" />
                  </svg>
                  <span>Claude-Opus-4.5</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="#8C8D8F"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <button
                style={sendButtonStyle()}
                onClick={handleSendClick}
                aria-label="Send message"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M14.5 1.5L7.5 8.5M14.5 1.5L10 14.5L7.5 8.5M14.5 1.5L1.5 6L7.5 8.5"
                    stroke={inputValue().trim() ? "#0D0D0E" : "#8C8D8F"}
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomeTab;
