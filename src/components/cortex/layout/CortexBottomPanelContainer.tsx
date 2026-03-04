import { Show, Suspense, For, lazy, onMount, onCleanup, createSignal } from "solid-js";
import { BOTTOM_PANEL_TABS, BOTTOM_PANEL_TAB_ICONS, BOTTOM_PANEL_MIN_HEIGHT, BOTTOM_PANEL_MAX_HEIGHT, SidebarSkeleton } from "./types";
import type { BottomPanelTab } from "./types";
import { CortexIcon } from "../primitives";

const CortexOutputPanel = lazy(() => import("@/components/cortex/output/OutputPanel").then(m => ({ default: m.OutputPanel })));
const CortexDiagnosticsPanel = lazy(() => import("@/components/cortex/diagnostics/DiagnosticsPanel").then(m => ({ default: m.DiagnosticsPanel })));
const CortexDiffViewer = lazy(() => import("@/components/cortex/CortexDiffViewer").then(m => ({ default: m.CortexDiffViewer })));
const CortexGitHistory = lazy(() => import("@/components/cortex/CortexGitHistory").then(m => ({ default: m.CortexGitHistory })));
const CortexDebugConsole = lazy(() => import("@/components/debugger/DebugConsole").then(m => ({ default: m.DebugConsole })));

export interface CortexBottomPanelContainerProps {
  bottomPanelTab: BottomPanelTab;
  bottomPanelCollapsed: boolean;
  bottomPanelHeight: number;
  onTabChange: (tab: BottomPanelTab) => void;
  onCollapse: () => void;
  onHeightChange: (height: number) => void;
}

export function CortexBottomPanelContainer(props: CortexBottomPanelContainerProps) {
  const [hoveredTab, setHoveredTab] = createSignal<BottomPanelTab | null>(null);
  const [isResizing, setIsResizing] = createSignal(false);

  onMount(() => {
    const handler = () => {
      props.onTabChange("history" as BottomPanelTab);
    };
    window.addEventListener("cortex:git:history", handler);
    onCleanup(() => window.removeEventListener("cortex:git:history", handler));
  });

  return (
    <Show when={!props.bottomPanelCollapsed}>
      {/* Resize handle */}
      <div
        style={{
          height: "6px",
          width: "100%",
          cursor: "row-resize",
          background: "transparent",
          transition: "background 150ms ease-out",
          "flex-shrink": "0",
          position: "relative",
          "z-index": "5",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
          const startY = e.clientY;
          const startHeight = props.bottomPanelHeight;
          const onMouseMove = (ev: MouseEvent) => {
            const delta = startY - ev.clientY;
            props.onHeightChange(Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.min(BOTTOM_PANEL_MAX_HEIGHT, startHeight + delta)));
          };
          const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
          };
          document.body.style.cursor = "row-resize";
          document.body.style.userSelect = "none";
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--cortex-accent-primary)";
        }}
        onMouseLeave={(e) => {
          if (!isResizing()) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }
        }}
      >
        {/* Visual grip indicator */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "36px",
          height: "4px",
          "border-radius": "2px",
          background: "var(--cortex-border-default)",
          opacity: "0.6",
          transition: "opacity 150ms ease-out",
          "pointer-events": "none",
        }} />
      </div>

      {/* Panel container */}
      <div style={{
        height: `${props.bottomPanelHeight}px`,
        "flex-shrink": "0",
        display: "flex",
        "flex-direction": "column",
        background: "var(--cortex-bg-secondary)",
        "border-radius": "var(--cortex-sidebar-radius) var(--cortex-sidebar-radius) 0 0",
        border: "1px solid var(--cortex-border-default)",
        "border-bottom": "none",
        overflow: "hidden",
        transition: "height 50ms ease-out",
      }}>
        {/* Tab bar */}
        <div style={{
          display: "flex",
          "align-items": "center",
          gap: "0",
          padding: "0 8px",
          height: "32px",
          "flex-shrink": "0",
          background: "var(--cortex-bg-secondary)",
          "border-bottom": "1px solid var(--cortex-border-default)",
        }}>
          <For each={BOTTOM_PANEL_TABS}>{(tab) => {
            const isActive = () => props.bottomPanelTab === tab;
            const isHovered = () => hoveredTab() === tab;

            return (
              <button
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "5px",
                  padding: "4px 10px",
                  height: "100%",
                  background: isActive() ? "var(--cortex-bg-tertiary, rgba(255,255,255,0.04))" : "transparent",
                  border: "none",
                  "border-bottom": isActive() ? "2px solid var(--cortex-accent-primary)" : "2px solid transparent",
                  color: isActive() ? "var(--cortex-text-primary)" : isHovered() ? "var(--cortex-text-secondary)" : "var(--cortex-text-muted)",
                  "font-family": "var(--cortex-font-sans)",
                  "font-size": "12px",
                  "font-weight": isActive() ? "500" : "400",
                  cursor: "pointer",
                  "text-transform": "capitalize",
                  transition: "color 150ms ease-out, border-bottom-color 150ms ease-out, background 150ms ease-out",
                  "box-sizing": "border-box",
                }}
                onClick={() => props.onTabChange(tab)}
                onMouseEnter={() => setHoveredTab(tab)}
                onMouseLeave={() => setHoveredTab(null)}
              >
                <CortexIcon
                  name={BOTTOM_PANEL_TAB_ICONS[tab]}
                  size={14}
                  style={{
                    opacity: isActive() ? "1" : "0.7",
                    transition: "opacity 150ms ease-out",
                  }}
                />
                {tab}
              </button>
            );
          }}</For>
          <div style={{ flex: "1" }} />
          <Show when={props.bottomPanelTab === "terminal"}>
            <button
              style={{
                width: "24px",
                height: "24px",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                background: "transparent",
                border: "none",
                "border-radius": "var(--cortex-radius-sm, 4px)",
                color: "var(--cortex-text-muted)",
                cursor: "pointer",
                transition: "background 150ms ease-out, color 150ms ease-out",
              }}
              aria-label="New terminal"
              title="New Terminal"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-muted)";
              }}
            >
              <CortexIcon name="plus" size="sm" />
            </button>
            <button
              style={{
                width: "24px",
                height: "24px",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                background: "transparent",
                border: "none",
                "border-radius": "var(--cortex-radius-sm, 4px)",
                color: "var(--cortex-text-muted)",
                cursor: "pointer",
                transition: "background 150ms ease-out, color 150ms ease-out",
              }}
              aria-label="Split terminal"
              title="Split Terminal"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-muted)";
              }}
            >
              <CortexIcon name="columns" size="sm" />
            </button>
            <button
              style={{
                width: "24px",
                height: "24px",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                background: "transparent",
                border: "none",
                "border-radius": "var(--cortex-radius-sm, 4px)",
                color: "var(--cortex-text-muted)",
                cursor: "pointer",
                transition: "background 150ms ease-out, color 150ms ease-out",
              }}
              aria-label="Kill terminal"
              title="Kill Terminal"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-muted)";
              }}
            >
              <CortexIcon name="trash" size="sm" />
            </button>
          </Show>
          <button
            style={{
              width: "24px",
              height: "24px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "transparent",
              border: "none",
              "border-radius": "var(--cortex-radius-sm, 4px)",
              color: "var(--cortex-text-muted)",
              cursor: "pointer",
              transition: "background 150ms ease-out, color 150ms ease-out",
            }}
            onClick={() => props.onCollapse()}
            aria-label="Close panel"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--cortex-text-muted)";
            }}
          >
            <CortexIcon name="close" size="sm" />
          </button>
        </div>

        {/* Panel content */}
        <div style={{ flex: "1", overflow: "hidden" }}>
          <Show when={props.bottomPanelTab === "output"}>
            <Suspense fallback={<SidebarSkeleton />}>
              <CortexOutputPanel onClose={() => props.onCollapse()} />
            </Suspense>
          </Show>
          <Show when={props.bottomPanelTab === "problems"}>
            <Suspense fallback={<SidebarSkeleton />}>
              <CortexDiagnosticsPanel />
            </Suspense>
          </Show>
          <Show when={props.bottomPanelTab === "terminal"}>
            <div
              data-terminal-embed="true"
              style={{
                flex: "1",
                height: "100%",
                display: "flex",
                overflow: "hidden",
                background: "var(--cortex-bg-primary, #18181a)",
              }}
            />
          </Show>
          <Show when={props.bottomPanelTab === "debug console"}>
            <Suspense fallback={<SidebarSkeleton />}>
              <CortexDebugConsole />
            </Suspense>
          </Show>
          <Show when={props.bottomPanelTab === "diff"}>
            <Suspense fallback={<SidebarSkeleton />}>
              <CortexDiffViewer />
            </Suspense>
          </Show>
          <Show when={props.bottomPanelTab === "history"}>
            <Suspense fallback={<SidebarSkeleton />}>
              <CortexGitHistory onClose={() => props.onCollapse()} />
            </Suspense>
          </Show>
        </div>
      </div>
    </Show>
  );
}
