import { Component, createSignal, For } from "solid-js";
import { CortexIcon } from "./primitives/CortexIcon";

interface DocLink {
  title: string;
  description: string;
  url: string;
  icon: string;
}

const DOC_SECTIONS: DocLink[] = [
  {
    title: "Getting Started",
    description: "Set up your workspace and explore core features",
    url: "https://docs.cortex.dev/getting-started",
    icon: "rocket",
  },
  {
    title: "Editor Basics",
    description: "Navigation, editing, and keyboard shortcuts",
    url: "https://docs.cortex.dev/editor",
    icon: "code",
  },
  {
    title: "AI Agents",
    description: "Configure and orchestrate AI coding agents",
    url: "https://docs.cortex.dev/agents",
    icon: "users",
  },
  {
    title: "Terminal & Shell",
    description: "Integrated terminal, shell integration, and tasks",
    url: "https://docs.cortex.dev/terminal",
    icon: "terminal",
  },
  {
    title: "Git & Source Control",
    description: "Staging, commits, branches, and merge workflows",
    url: "https://docs.cortex.dev/git",
    icon: "git",
  },
  {
    title: "Extensions",
    description: "Install, manage, and develop extensions",
    url: "https://docs.cortex.dev/extensions",
    icon: "grid",
  },
  {
    title: "Debugging",
    description: "Breakpoints, variables, and debug configurations",
    url: "https://docs.cortex.dev/debugging",
    icon: "play",
  },
  {
    title: "MCP Servers",
    description: "Model Context Protocol server setup and usage",
    url: "https://docs.cortex.dev/mcp",
    icon: "data",
  },
];

interface ShortcutEntry {
  keys: string;
  action: string;
}

const KEY_SHORTCUTS: ShortcutEntry[] = [
  { keys: "Ctrl+Shift+P", action: "Command Palette" },
  { keys: "Ctrl+P", action: "Quick Open File" },
  { keys: "Ctrl+B", action: "Toggle Sidebar" },
  { keys: "Ctrl+J", action: "Toggle Panel" },
  { keys: "Ctrl+`", action: "Toggle Terminal" },
  { keys: "Ctrl+Shift+F", action: "Search in Files" },
  { keys: "Ctrl+Shift+G", action: "Source Control" },
  { keys: "Ctrl+Shift+D", action: "Debug Panel" },
  { keys: "Ctrl+,", action: "Open Settings" },
];

export const CortexDocumentationPanel: Component = () => {
  const [activeSection, setActiveSection] = createSignal<"docs" | "shortcuts">("docs");

  const handleLinkClick = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <div style={{
      display: "flex",
      "flex-direction": "column",
      height: "100%",
      background: "var(--cortex-bg-secondary)",
      color: "var(--cortex-text-primary)",
      "font-family": "var(--cortex-font-sans)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        "border-bottom": "1px solid var(--cortex-border-default)",
        "font-weight": "500",
        "font-size": "13px",
      }}>
        Documentation
      </div>

      <div style={{
        display: "flex",
        gap: "0",
        "border-bottom": "1px solid var(--cortex-border-default)",
      }}>
        <button
          onClick={() => setActiveSection("docs")}
          style={{
            flex: "1",
            padding: "8px 12px",
            background: activeSection() === "docs" ? "var(--cortex-bg-tertiary)" : "transparent",
            border: "none",
            "border-bottom": activeSection() === "docs" ? "2px solid var(--cortex-accent-primary)" : "2px solid transparent",
            color: activeSection() === "docs" ? "var(--cortex-text-primary)" : "var(--cortex-text-inactive)",
            "font-family": "var(--cortex-font-sans)",
            "font-size": "12px",
            "font-weight": "500",
            cursor: "pointer",
          }}
        >
          Guides
        </button>
        <button
          onClick={() => setActiveSection("shortcuts")}
          style={{
            flex: "1",
            padding: "8px 12px",
            background: activeSection() === "shortcuts" ? "var(--cortex-bg-tertiary)" : "transparent",
            border: "none",
            "border-bottom": activeSection() === "shortcuts" ? "2px solid var(--cortex-accent-primary)" : "2px solid transparent",
            color: activeSection() === "shortcuts" ? "var(--cortex-text-primary)" : "var(--cortex-text-inactive)",
            "font-family": "var(--cortex-font-sans)",
            "font-size": "12px",
            "font-weight": "500",
            cursor: "pointer",
          }}
        >
          Shortcuts
        </button>
      </div>

      <div style={{
        flex: "1",
        "overflow-y": "auto",
        padding: "8px",
      }}>
        {activeSection() === "docs" ? (
          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <For each={DOC_SECTIONS}>
              {(doc) => (
                <button
                  onClick={() => handleLinkClick(doc.url)}
                  style={{
                    display: "flex",
                    "align-items": "flex-start",
                    gap: "12px",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    "border-radius": "var(--cortex-radius-md)",
                    cursor: "pointer",
                    "text-align": "left",
                    transition: "background 150ms",
                    color: "var(--cortex-text-primary)",
                    "font-family": "var(--cortex-font-sans)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--cortex-bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <div style={{
                    "flex-shrink": "0",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "border-radius": "var(--cortex-radius-sm)",
                    background: "var(--cortex-bg-tertiary)",
                    "margin-top": "2px",
                  }}>
                    <CortexIcon name={doc.icon} size={16} color="#8C8D8F" />
                  </div>
                  <div style={{ "min-width": "0" }}>
                    <div style={{
                      "font-size": "13px",
                      "font-weight": "500",
                      "margin-bottom": "2px",
                    }}>
                      {doc.title}
                    </div>
                    <div style={{
                      "font-size": "11px",
                      color: "var(--cortex-text-inactive)",
                      "line-height": "1.4",
                    }}>
                      {doc.description}
                    </div>
                  </div>
                </button>
              )}
            </For>

            <div style={{
              "margin-top": "12px",
              padding: "12px",
              "border-radius": "var(--cortex-radius-md)",
              background: "var(--cortex-bg-tertiary)",
            }}>
              <div style={{
                "font-size": "12px",
                "font-weight": "500",
                "margin-bottom": "8px",
              }}>
                Need Help?
              </div>
              <div style={{
                display: "flex",
                "flex-direction": "column",
                gap: "6px",
              }}>
                <button
                  onClick={() => window.open("https://discord.gg/cortexfoundation", "_blank")}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    padding: "6px 8px",
                    background: "transparent",
                    border: "none",
                    "border-radius": "var(--cortex-radius-sm)",
                    cursor: "pointer",
                    color: "var(--cortex-text-secondary, #BFBFC0)",
                    "font-family": "var(--cortex-font-sans)",
                    "font-size": "12px",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--cortex-sidebar-selected)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  Join Discord Community
                </button>
                <button
                  onClick={() => window.open("https://github.com/CortexLM/cortex-ide/issues", "_blank")}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    padding: "6px 8px",
                    background: "transparent",
                    border: "none",
                    "border-radius": "var(--cortex-radius-sm)",
                    cursor: "pointer",
                    color: "var(--cortex-text-secondary, #BFBFC0)",
                    "font-family": "var(--cortex-font-sans)",
                    "font-size": "12px",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--cortex-sidebar-selected)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  Report an Issue
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
            <div style={{
              padding: "8px 12px",
              "font-size": "11px",
              "font-weight": "600",
              "text-transform": "uppercase",
              "letter-spacing": "0.5px",
              color: "var(--cortex-text-inactive)",
            }}>
              Keyboard Shortcuts
            </div>
            <For each={KEY_SHORTCUTS}>
              {(shortcut) => (
                <div style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 12px",
                  "border-radius": "var(--cortex-radius-sm)",
                }}>
                  <span style={{ "font-size": "12px", color: "var(--cortex-text-primary)" }}>
                    {shortcut.action}
                  </span>
                  <kbd style={{
                    padding: "2px 6px",
                    background: "var(--cortex-bg-tertiary)",
                    "border-radius": "var(--cortex-radius-sm)",
                    "font-family": "var(--cortex-font-mono, monospace)",
                    "font-size": "11px",
                    color: "var(--cortex-text-secondary, #BFBFC0)",
                    border: "1px solid var(--cortex-border-default)",
                  }}>
                    {shortcut.keys}
                  </kbd>
                </div>
              )}
            </For>
            <div style={{
              "margin-top": "12px",
              padding: "8px 12px",
            }}>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("keyboard-shortcuts:show"))}
                style={{
                  padding: "6px 12px",
                  background: "var(--cortex-bg-tertiary)",
                  border: "1px solid var(--cortex-border-default)",
                  "border-radius": "var(--cortex-radius-md)",
                  "font-family": "var(--cortex-font-sans)",
                  "font-size": "12px",
                  color: "var(--cortex-text-primary)",
                  cursor: "pointer",
                }}
              >
                View All Shortcuts
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CortexDocumentationPanel;
