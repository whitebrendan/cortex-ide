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
        <path d="M3 5v10a2 2 0 002 2h10a2 2 0 002-2V8a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="9" r="5" />
        <path d="M13 13l4 4" />
      </svg>
    ),
  },
  {
    id: "scm",
    label: "Source Control",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="4" r="2" />
        <circle cx="10" cy="16" r="2" />
        <circle cx="16" cy="10" r="2" />
        <path d="M10 6v8" />
        <path d="M14 10h-2c-1.1 0-2-.9-2-2V6" />
      </svg>
    ),
  },
  {
    id: "extensions",
    label: "Extensions",
    icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
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
