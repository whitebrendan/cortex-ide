import { Component, For, Show, createSignal } from "solid-js";
import type { RecentProject } from "@/context/RecentProjectsContext";

function formatPath(path: string, maxLength: number = 60): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.length <= maxLength) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return "~/" + parts.slice(-2).join("/");
}

interface WelcomeRecentFilesProps {
  projects: RecentProject[];
  onOpen: (project: RecentProject) => void;
}

export const WelcomeRecentFiles: Component<WelcomeRecentFilesProps> = (props) => {
  return (
    <div style={{
      display: "flex",
      "flex-direction": "column",
      width: "100%",
    }}>
      <div style={{
        "font-size": "14px",
        "font-weight": "600",
        color: "#8C8D8F",
        "margin-bottom": "8px",
        "font-family": "'Figtree', var(--cortex-font-sans)",
      }}>
        Recent
      </div>
      <div style={{
        display: "flex",
        "flex-direction": "column",
        gap: "1px",
      }}>
        <For each={props.projects.slice(0, 8)}>
          {(project) => (
            <RecentFileItem
              project={project}
              onOpen={() => props.onOpen(project)}
            />
          )}
        </For>
      </div>
    </div>
  );
};

interface RecentFileItemProps {
  project: RecentProject;
  onOpen: () => void;
}

const RecentFileItem: Component<RecentFileItemProps> = (props) => {
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      onClick={props.onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "4px 0",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        width: "100%",
        "text-align": "left",
        transition: "opacity 0.15s ease",
        opacity: hovered() ? "0.85" : "1",
      }}
    >
      <div style={{
        display: "flex",
        "align-items": "baseline",
        gap: "8px",
        "min-width": "0",
        flex: "1",
        overflow: "hidden",
      }}>
        <span style={{
          "font-size": "14px",
          "font-weight": "400",
          color: "#B2FF22",
          "white-space": "nowrap",
          "flex-shrink": "0",
          "font-family": "'Figtree', var(--cortex-font-sans)",
        }}>
          {props.project.name}
        </span>
        <span style={{
          "font-size": "13px",
          color: "#8C8D8F",
          "white-space": "nowrap",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "font-family": "'Figtree', var(--cortex-font-sans)",
        }}>
          {formatPath(props.project.path)}
        </span>
      </div>
      <Show when={props.project.pinned}>
        <div style={{
          width: "6px",
          height: "6px",
          "border-radius": "50%",
          background: "#B2FF22",
          "flex-shrink": "0",
        }} />
      </Show>
    </button>
  );
};

export default WelcomeRecentFiles;
