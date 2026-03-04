import { Component, JSX, For, createSignal } from "solid-js";

export interface ActivityBarProps {
  activeView: string | null;
  onSelect: (viewId: string) => void;
  style?: JSX.CSSProperties;
}

interface ActivityItem {
  id: string;
  label: string;
  icon: () => JSX.Element;
}

const ITEMS: ActivityItem[] = [
  {
    id: "explorer",
    label: "Explorer",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1v-2" />
        <path d="M9 1h4a1 1 0 011 1v12a1 1 0 01-1 1H8a1 1 0 01-1-1V6" />
        <path d="M9 7h4" />
        <path d="M9 10h4" />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.5 12.5l4.5 4.5" />
      </svg>
    ),
  },
  {
    id: "scm",
    label: "Source Control",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="4" r="2" />
        <circle cx="6" cy="16" r="2" />
        <circle cx="14" cy="8" r="2" />
        <path d="M6 6v10" />
        <path d="M14 10v-0.5c0-1.1-.9-2-2-2H8c-1.1 0-2-.9-2-2V6" />
      </svg>
    ),
  },
  {
    id: "extensions",
    label: "Extensions",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <rect x="2" y="2" width="6" height="6" rx="1" />
        <rect x="12" y="4" width="5" height="5" rx="1" transform="rotate(-10 14.5 6.5)" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "AI Chat",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h12a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    ),
  },
];

export const ActivityBar: Component<ActivityBarProps> = (props) => {
  return (
    <aside
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        width: "48px",
        "min-width": "48px",
        background: "var(--cortex-sidebar-bg, #1C1C1D)",
        "border-right": "1px solid var(--cortex-border-default, #2E2F31)",
        padding: "8px 0",
        gap: "4px",
        overflow: "hidden",
        ...props.style,
      }}
    >
      <For each={ITEMS}>
        {(item) => (
          <ActivityBarButton
            item={item}
            isActive={props.activeView === item.id}
            onClick={() => props.onSelect(item.id)}
          />
        )}
      </For>

      {/* Spacer to push settings to bottom */}
      <div style={{ "margin-top": "auto" }} />

      {/* Settings gear at bottom */}
      <ActivityBarButton
        item={{ id: "settings", label: "Settings", icon: () => (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 1.5v2M10 16.5v2M3.4 3.4l1.4 1.4M15.2 15.2l1.4 1.4M1.5 10h2M16.5 10h2M3.4 16.6l1.4-1.4M15.2 4.8l1.4-1.4" />
          </svg>
        )}}
        isActive={props.activeView === "settings"}
        onClick={() => props.onSelect("settings")}
      />
    </aside>
  );
};

const ActivityBarButton: Component<{
  item: ActivityItem;
  isActive: boolean;
  onClick: () => void;
}> = (props) => {
  const [hovered, setHovered] = createSignal(false);

  const bg = () => {
    if (props.isActive) return "var(--cortex-accent-primary, #BFFF00)";
    if (hovered()) return "var(--cortex-bg-hover, #2A2A2A)";
    return "transparent";
  };

  const color = () => {
    if (props.isActive) return "var(--cortex-icon-active)";
    if (hovered()) return "var(--cortex-text-primary)";
    return "var(--cortex-icon-inactive)";
  };

  return (
    <button
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        width: "36px",
        height: "36px",
        background: bg(),
        border: "none",
        "border-radius": "8px",
        cursor: "pointer",
        color: color(),
        transition: "all 150ms ease",
        padding: "0",
        "flex-shrink": "0",
      }}
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={props.isActive}
      aria-label={props.item.label}
      title={props.item.label}
    >
      {props.item.icon()}
    </button>
  );
};
