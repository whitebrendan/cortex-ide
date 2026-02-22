import { Component, JSX, onMount, onCleanup, createSignal, Show } from "solid-js";
import { WindowControls } from "@/components/cortex/titlebar/WindowControls";
import { detectPlatform } from "@/components/cortex/titlebar/platformDetect";

export interface TitleBarProps {
  projectName?: string;
  style?: JSX.CSSProperties;
}

type WindowHandle = {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  close: () => Promise<void>;
};

const MENU_ITEMS = [
  { label: "File", event: "file:new" },
  { label: "Edit", event: "edit:find" },
  { label: "View", event: "view:explorer" },
  { label: "Terminal", event: "terminal:toggle" },
  { label: "Help", event: "help:docs" },
] as const;

export const TitleBar: Component<TitleBarProps> = (props) => {
  const isMac = detectPlatform() === "macos";
  let windowHandle: WindowHandle | null = null;
  const [hoveredMenu, setHoveredMenu] = createSignal<string | null>(null);

  onMount(() => {
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (!cancelled) windowHandle = getCurrentWindow();
      } catch {
        // Not in Tauri context
      }
    })();

    onCleanup(() => { cancelled = true; });
  });

  const handleMinimize = async () => {
    if (windowHandle) await windowHandle.minimize();
  };
  const handleMaximize = async () => {
    if (windowHandle) {
      const isMax = await windowHandle.isMaximized();
      if (isMax) await windowHandle.unmaximize();
      else await windowHandle.maximize();
    }
  };
  const handleClose = async () => {
    if (windowHandle) await windowHandle.close();
  };

  const windowControlsEl = () => (
    <WindowControls
      onMinimize={handleMinimize}
      onMaximize={handleMaximize}
      onClose={handleClose}
    />
  );

  const menuBtnStyle = (label: string): JSX.CSSProperties => ({
    background: hoveredMenu() === label ? "var(--cortex-bg-hover, #2A2A2A)" : "transparent",
    border: "none",
    color: "var(--cortex-text-secondary, #8C8D8F)",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "12px",
    "font-weight": "500",
    padding: "2px 8px",
    "border-radius": "4px",
    cursor: "pointer",
    "-webkit-app-region": "no-drag",
    "line-height": "1",
  });

  return (
    <header
      data-tauri-drag-region
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        height: "32px",
        "min-height": "32px",
        padding: "0 8px",
        background: "transparent",
        "-webkit-app-region": "drag",
        "user-select": "none",
        "grid-column": "1 / -1",
        ...props.style,
      }}
    >
      {/* Left section */}
      <div style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        "-webkit-app-region": "no-drag",
      }}>
        <Show when={isMac}>
          {windowControlsEl()}
        </Show>

        {/* App icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ "flex-shrink": "0" }}>
          <circle cx="8" cy="8" r="7" stroke="var(--cortex-accent-primary, #BFFF00)" stroke-width="1.5" fill="none" />
          <circle cx="8" cy="8" r="3" fill="var(--cortex-accent-primary, #BFFF00)" />
        </svg>

        {/* Menu items */}
        <nav style={{ display: "flex", "align-items": "center", gap: "2px" }}>
          {MENU_ITEMS.map((item) => (
            <button
              style={menuBtnStyle(item.label)}
              onMouseEnter={() => setHoveredMenu(item.label)}
              onMouseLeave={() => setHoveredMenu(null)}
              onClick={() => window.dispatchEvent(new CustomEvent(item.event))}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: project name */}
      <div style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        "font-family": "var(--cortex-font-sans)",
        "font-size": "12px",
        "font-weight": "500",
        color: "var(--cortex-text-secondary, #8C8D8F)",
        "white-space": "nowrap",
        overflow: "hidden",
        "text-overflow": "ellipsis",
        "max-width": "200px",
        "pointer-events": "none",
      }}>
        {props.projectName ?? "Cortex"}
      </div>

      {/* Right section */}
      <div style={{
        display: "flex",
        "align-items": "center",
        "-webkit-app-region": "no-drag",
      }}>
        <Show when={!isMac}>
          {windowControlsEl()}
        </Show>
      </div>
    </header>
  );
};
