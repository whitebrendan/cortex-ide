import { Show, Suspense, For, lazy, onMount, onCleanup } from "solid-js";
import { BOTTOM_PANEL_TABS, BOTTOM_PANEL_MIN_HEIGHT, BOTTOM_PANEL_MAX_HEIGHT, SidebarSkeleton } from "./types";
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
  onMount(() => {
    const handler = () => {
      props.onTabChange("history" as BottomPanelTab);
    };
    window.addEventListener("cortex:git:history", handler);
    onCleanup(() => window.removeEventListener("cortex:git:history", handler));
  });

  return (
    <Show when={!props.bottomPanelCollapsed}>
      <div
        style={{
          height: "4px",
          width: "100%",
          cursor: "row-resize",
          background: "transparent",
          transition: "background 200ms ease-out",
          "flex-shrink": "0",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startHeight = props.bottomPanelHeight;
          const onMouseMove = (ev: MouseEvent) => {
            const delta = startY - ev.clientY;
            props.onHeightChange(Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.min(BOTTOM_PANEL_MAX_HEIGHT, startHeight + delta)));
          };
          const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          };
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--cortex-accent-primary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      />
      <div style={{
        height: `${props.bottomPanelHeight}px`,
        "flex-shrink": "0",
        display: "flex",
        "flex-direction": "column",
        background: "var(--cortex-bg-secondary)",
        "border-radius": "12px 12px 0 0",
      }}>
        <div style={{
          display: "flex",
          "align-items": "center",
          gap: "0",
          padding: "0 8px",
          height: "28px",
          "flex-shrink": "0",
          background: "var(--cortex-bg-secondary)",
          "border-bottom": "1px solid var(--cortex-border-default)",
        }}>
          <For each={BOTTOM_PANEL_TABS}>{(tab) => (
            <button
              style={{
                padding: "2px 10px",
                background: "transparent",
                border: "none",
                "border-bottom": props.bottomPanelTab === tab ? "2px solid var(--cortex-accent-primary)" : "2px solid transparent",
                color: props.bottomPanelTab === tab ? "var(--cortex-text-primary)" : "var(--cortex-text-muted)",
                "font-family": "var(--cortex-font-sans)",
                "font-size": "12px",
                cursor: "pointer",
                "text-transform": "capitalize",
                transition: "color 150ms ease-out, border-bottom-color 150ms ease-out",
              }}
              onClick={() => props.onTabChange(tab)}
            >
              {tab}
            </button>
          )}</For>
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
                color: "var(--cortex-text-muted)",
                cursor: "pointer",
              }}
              aria-label="New terminal"
              title="New Terminal"
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
                color: "var(--cortex-text-muted)",
                cursor: "pointer",
              }}
              aria-label="Split terminal"
              title="Split Terminal"
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
                color: "var(--cortex-text-muted)",
                cursor: "pointer",
              }}
              aria-label="Kill terminal"
              title="Kill Terminal"
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
              color: "var(--cortex-text-muted)",
              cursor: "pointer",
            }}
            onClick={() => props.onCollapse()}
            aria-label="Close panel"
          >
            <CortexIcon name="close" size="sm" />
          </button>
        </div>
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
                background: "var(--cortex-bg-secondary)",
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
