import { Component, Show, createSignal } from "solid-js";
import { useRecentProjects, type RecentProject } from "@/context/RecentProjectsContext";
import { WelcomeRecentFiles } from "@/components/cortex/WelcomeRecentFiles";

interface StartActionProps {
  label: string;
  onClick: () => void;
}

function StartActionItem(props: StartActionProps) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        "align-items": "center",
        padding: "4px 0",
        background: "transparent",
        border: "none",
        color: hovered() ? "#d4ff70" : "#B2FF22",
        "font-size": "14px",
        "font-weight": "400",
        cursor: "pointer",
        "font-family": "'Figtree', var(--cortex-font-sans)",
        transition: "color 0.15s ease",
        "text-align": "left",
      }}
    >
      {props.label}
    </button>
  );
}

const Welcome: Component = () => {
  const recentProjects = useRecentProjects();

  const handleNewFile = () => {
    window.dispatchEvent(new CustomEvent("file:new"));
  };

  const handleOpenFile = () => {
    window.dispatchEvent(new CustomEvent("file:open"));
  };

  const handleOpenFolder = () => {
    window.dispatchEvent(new CustomEvent("folder:open"));
  };

  const handleCloneRepo = () => {
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

  return (
    <div
      data-testid="welcome-page"
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        width: "100%",
        height: "100%",
        "min-height": "0",
        background: "#141415",
        overflow: "auto",
        "font-family": "'Figtree', var(--cortex-font-sans)",
      }}
    >
      <div style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "max-width": "560px",
        width: "100%",
        padding: "40px 24px",
        gap: "28px",
      }}>
        {/* Branding */}
        <div style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          gap: "12px",
        }}>
          <img
            src="/assets/abstract-design.svg"
            alt="Cortex"
            style={{
              width: "100%",
              "max-width": "280px",
              height: "auto",
              opacity: "0.6",
            }}
          />
          <h1 style={{
            "font-size": "24px",
            "font-weight": "600",
            color: "#FCFCFC",
            margin: "0",
            "font-family": "'Figtree', var(--cortex-font-sans)",
            "letter-spacing": "-0.01em",
          }}>
            Welcome to Cortex
          </h1>
        </div>

        {/* Start */}
        <div style={{
          display: "flex",
          "flex-direction": "column",
          gap: "2px",
          width: "100%",
        }}>
          <div style={{
            "font-size": "14px",
            "font-weight": "600",
            color: "#8C8D8F",
            "margin-bottom": "4px",
            "font-family": "'Figtree', var(--cortex-font-sans)",
          }}>
            Start
          </div>
          <StartActionItem label="New File" onClick={handleNewFile} />
          <StartActionItem label="Open File" onClick={handleOpenFile} />
          <StartActionItem label="Open Folder" onClick={handleOpenFolder} />
          <StartActionItem label="Clone Git Repository" onClick={handleCloneRepo} />
        </div>

        {/* Recent Projects */}
        <Show when={sortedProjects().length > 0}>
          <WelcomeRecentFiles
            projects={sortedProjects()}
            onOpen={handleOpenProject}
          />
        </Show>
      </div>
    </div>
  );
};

export default Welcome;
