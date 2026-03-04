import { Component, JSX, Show, Switch, Match } from "solid-js";

export interface SidebarProps {
  activeView: string | null;
  style?: JSX.CSSProperties;
}

const VIEW_LABELS: Record<string, string> = {
  explorer: "Explorer",
  search: "Search",
  scm: "Source Control",
  extensions: "Extensions",
  chat: "AI Chat",
  settings: "Settings",
};

const VIEW_ICONS: Record<string, () => JSX.Element> = {
  explorer: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1v-3" />
      <path d="M11 2h5a1 1 0 011 1v14a1 1 0 01-1 1H10a1 1 0 01-1-1V7" />
      <path d="M11 9h5" />
      <path d="M11 12h5" />
    </svg>
  ),
  search: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5l5 5" />
    </svg>
  ),
  scm: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="7" cy="5" r="2.5" />
      <circle cx="7" cy="19" r="2.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M7 7.5v9" />
      <path d="M17 11.5v-0.5c0-1.1-.9-2-2-2h-4c-1.1 0-2-.9-2-2V7.5" />
    </svg>
  ),
  extensions: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 3c1.8 0 3 1.2 3 2.5 0 .6-.2 1.1-.6 1.5-.3.4-.6.8-.6 1.5h5.2a1 1 0 011 1v4c.7 0 1.1-.3 1.5-.6.4-.4.9-.6 1.5-.6 1.3 0 2.5 1.2 2.5 3s-1.2 3-2.5 3c-.6 0-1.1-.2-1.5-.6-.4-.3-.8-.6-1.5-.6v5.3a1 1 0 01-1 1h-3.8c0-.7.3-1.1.6-1.5.4-.4.6-.9.6-1.5 0-1.8-1.2-3-3-3s-3 1.2-3 3c0 .6.2 1.1.6 1.5.3.4.6.8.6 1.5H4a1 1 0 01-1-1v-3.8c-.7 0-1.1.3-1.5.6" />
      <path d="M3 10V5a1 1 0 011-1h7.8" />
    </svg>
  ),
  chat: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  ),
  settings: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
    </svg>
  ),
};

export const Sidebar: Component<SidebarProps> = (props) => {
  return (
    <Show when={props.activeView}>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          height: "100%",
          background: "var(--cortex-sidebar-bg, #1C1C1D)",
          overflow: "hidden",
          ...props.style,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          "align-items": "center",
          height: "34px",
          "min-height": "34px",
          padding: "0 12px",
          "border-bottom": "1px solid var(--cortex-border-default, #2E2F31)",
          "font-family": "var(--cortex-font-sans)",
          "font-size": "11px",
          "font-weight": "600",
          "text-transform": "uppercase",
          "letter-spacing": "0.5px",
          color: "var(--cortex-text-secondary, #8C8D8F)",
          "user-select": "none",
        }}>
          {VIEW_LABELS[props.activeView!] ?? props.activeView}
        </div>

        {/* Content */}
        <div style={{
          flex: "1",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          padding: "24px",
          gap: "12px",
          color: "var(--cortex-text-muted, #666)",
          overflow: "auto",
        }}>
          <Switch fallback={
            <span style={{
              "font-family": "var(--cortex-font-sans)",
              "font-size": "13px",
            }}>
              {VIEW_LABELS[props.activeView!] ?? props.activeView}
            </span>
          }>
            <Match when={props.activeView === "explorer"}>
              {VIEW_ICONS.explorer()}
              <span style={{ "font-family": "var(--cortex-font-sans)", "font-size": "13px" }}>
                No folder opened
              </span>
            </Match>
            <Match when={props.activeView === "search"}>
              {VIEW_ICONS.search()}
              <span style={{ "font-family": "var(--cortex-font-sans)", "font-size": "13px" }}>
                Search across files
              </span>
            </Match>
            <Match when={props.activeView === "scm"}>
              {VIEW_ICONS.scm()}
              <span style={{ "font-family": "var(--cortex-font-sans)", "font-size": "13px" }}>
                No repository detected
              </span>
            </Match>
            <Match when={props.activeView === "extensions"}>
              {VIEW_ICONS.extensions()}
              <span style={{ "font-family": "var(--cortex-font-sans)", "font-size": "13px" }}>
                Browse extensions
              </span>
            </Match>
            <Match when={props.activeView === "chat"}>
              {VIEW_ICONS.chat()}
              <span style={{ "font-family": "var(--cortex-font-sans)", "font-size": "13px" }}>
                Start a conversation
              </span>
            </Match>
            <Match when={props.activeView === "settings"}>
              {VIEW_ICONS.settings()}
              <span style={{ "font-family": "var(--cortex-font-sans)", "font-size": "13px" }}>
                Preferences
              </span>
            </Match>
          </Switch>
        </div>
      </div>
    </Show>
  );
};
