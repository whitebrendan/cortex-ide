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
 *
 * Includes CortexOpenProjectDropdown with folder/file/clone actions
 * and WelcomeRecentFiles (conditional, when recent projects exist).
 */

import { type JSX, createSignal, Show } from "solid-js";
import { CortexOpenProjectDropdown } from "@/components/cortex/primitives/CortexOpenProjectDropdown";
import { WelcomeRecentFiles } from "@/components/cortex/WelcomeRecentFiles";
import { useRecentProjects, type RecentProject } from "@/context/RecentProjectsContext";

export interface WelcomeTabProps {
  class?: string;
  style?: JSX.CSSProperties;
  compact?: boolean;
}

export function WelcomeTab(props: WelcomeTabProps) {
  const recentProjects = useRecentProjects();
  const [inputValue, setInputValue] = createSignal("");
  const [inputFocused, setInputFocused] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);

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

  const handleOpenFolder = () => {
    setDropdownOpen(false);
    window.dispatchEvent(new CustomEvent("folder:open"));
  };

  const handleNewFile = () => {
    setDropdownOpen(false);
    window.dispatchEvent(new CustomEvent("file:new"));
  };

  const handleCloneRepo = () => {
    setDropdownOpen(false);
    window.dispatchEvent(new CustomEvent("git:clone"));
  };

  const handleOpenProject = (project: RecentProject) => {
    recentProjects.openProject(project);
  };

  const sortedProjects = () => {
    const pinned = recentProjects.pinnedProjects();
    const unpinned = recentProjects.unpinnedProjects();
    return [...pinned, ...unpinned];
  };

  const workspaceStyle = (): JSX.CSSProperties => ({
    display: "flex",
    flex: "1",
    "flex-direction": "column",
    "align-items": "center",
    "justify-content": "center",
    background: "var(--cortex-bg-primary)",
    "min-height": "0",
    "font-family": "var(--cortex-font-sans)",
    ...props.style,
  });

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    gap: "28px",
    "max-width": props.compact ? "none" : "922px",
    width: props.compact ? "auto" : "100%",
    padding: "40px 24px",
  });

  const titleStyle: JSX.CSSProperties = {
    margin: "0",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "32px",
    "font-weight": "500",
    "line-height": "40px",
    "letter-spacing": "0px",
    "text-align": "center",
    color: "var(--cortex-text-on-surface, #FCFCFC)",
    width: "100%",
  };

  const inputContainerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    width: props.compact ? "100%" : "686px",
    "max-width": "100%",
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

  const dropdownWrapperStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "8px",
  };

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

        <div style={dropdownWrapperStyle}>
          <CortexOpenProjectDropdown
            label="Open Project"
            isOpen={dropdownOpen()}
            onClick={() => setDropdownOpen(!dropdownOpen())}
          >
            <Show when={dropdownOpen()}>
              <DropdownMenu
                onOpenFolder={handleOpenFolder}
                onNewFile={handleNewFile}
                onCloneRepo={handleCloneRepo}
              />
            </Show>
          </CortexOpenProjectDropdown>
        </div>

        <Show when={sortedProjects().length > 0}>
          <WelcomeRecentFiles
            projects={sortedProjects()}
            onOpen={handleOpenProject}
          />
        </Show>
      </div>
    </div>
  );
}

interface DropdownMenuProps {
  onOpenFolder: () => void;
  onNewFile: () => void;
  onCloneRepo: () => void;
}

function DropdownMenu(props: DropdownMenuProps) {
  return (
    <div style={{
      position: "absolute",
      top: "calc(100% + 4px)",
      left: "0",
      "min-width": "200px",
      background: "var(--cortex-dropdown-bg)",
      border: "1px solid var(--cortex-dropdown-border)",
      "border-radius": "var(--cortex-radius-md)",
      "box-shadow": "var(--cortex-elevation-3)",
      "z-index": "var(--cortex-z-dropdown)",
      padding: "4px",
      "font-family": "var(--cortex-font-sans)",
    }}>
      <DropdownItem label="Open Folder" icon="folder" onClick={props.onOpenFolder} />
      <DropdownItem label="New File" icon="file" onClick={props.onNewFile} />
      <DropdownItem label="Clone Repository" icon="code-branch" onClick={props.onCloneRepo} />
    </div>
  );
}

function DropdownItem(itemProps: { label: string; icon: string; onClick: () => void }) {
  const [hovered, setHovered] = createSignal(false);
  return (
    <button
      onClick={itemProps.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        width: "100%",
        padding: "8px 12px",
        background: hovered() ? "var(--cortex-bg-hover)" : "transparent",
        border: "none",
        "border-radius": "var(--cortex-radius-xs)",
        color: "var(--cortex-text-primary)",
        "font-size": "13px",
        cursor: "pointer",
        "text-align": "left",
        "font-family": "var(--cortex-font-sans)",
        transition: "background var(--cortex-transition-fast)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--cortex-text-secondary)">
        <Show when={itemProps.icon === "folder"}>
          <path d="M14.5 3H7.71l-2-2H1.5A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 3z"/>
        </Show>
        <Show when={itemProps.icon === "file"}>
          <path d="M13.85 4.44l-3.29-3.29A1.5 1.5 0 0 0 9.5 0.75H3.5A1.5 1.5 0 0 0 2 2.25v11.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V5.5a1.5 1.5 0 0 0-.15-1.06z"/>
        </Show>
        <Show when={itemProps.icon === "code-branch"}>
          <path d="M11.75 5a1.25 1.25 0 1 0-1.5 1.22V7.5a.5.5 0 0 1-.5.5H6.25a.5.5 0 0 1-.5-.5V6.22a1.25 1.25 0 1 0-1 0v3.56a1.25 1.25 0 1 0 1 0V8.5a.5.5 0 0 1 .5-.5h3.5a1.5 1.5 0 0 0 1.5-1.5V6.22A1.25 1.25 0 0 0 11.75 5z"/>
        </Show>
      </svg>
      {itemProps.label}
    </button>
  );
}

export default WelcomeTab;
