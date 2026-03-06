import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { Show, Suspense } from "solid-js";
import { CortexBottomPanelContainer } from "../CortexBottomPanelContainer";
import type { CortexBottomPanelContainerProps } from "../CortexBottomPanelContainer";
import type { BottomPanelTab } from "../types";
import { BOTTOM_PANEL_TABS, BOTTOM_PANEL_MIN_HEIGHT, BOTTOM_PANEL_MAX_HEIGHT } from "../types";

vi.mock("@/components/cortex/output/OutputPanel", () => ({
  OutputPanel: (props: { onClose?: () => void }) => (
    <div data-testid="output-panel">
      Output
      <Show when={props.onClose}>
        <button data-testid="output-close" onClick={() => props.onClose!()}>Close</button>
      </Show>
    </div>
  ),
}));

vi.mock("@/components/cortex/diagnostics/DiagnosticsPanel", () => ({
  DiagnosticsPanel: () => <div data-testid="diagnostics-panel">Diagnostics</div>,
}));

vi.mock("@/components/cortex/CortexDiffViewer", () => ({
  CortexDiffViewer: () => <div data-testid="diff-viewer">Diff Viewer</div>,
}));

vi.mock("@/components/cortex/CortexGitHistory", () => ({
  CortexGitHistory: (props: { onClose?: () => void }) => (
    <div data-testid="git-history">
      Git History
      <Show when={props.onClose}>
        <button data-testid="history-close" onClick={() => props.onClose!()}>Close</button>
      </Show>
    </div>
  ),
}));

vi.mock("@/components/debugger/DebugConsole", () => ({
  DebugConsole: () => <div data-testid="debug-console">Debug Console</div>,
}));

vi.mock("@/components/cortex/primitives", () => ({
  CortexIcon: (props: { name: string; size?: string }) => (
    <span data-testid={`icon-${props.name}`} />
  ),
}));

function createDefaultProps(overrides: Partial<CortexBottomPanelContainerProps> = {}): CortexBottomPanelContainerProps {
  return {
    bottomPanelTab: "terminal",
    bottomPanelCollapsed: false,
    bottomPanelHeight: 200,
    onTabChange: vi.fn(),
    onCollapse: vi.fn(),
    onHeightChange: vi.fn(),
    ...overrides,
  };
}

function renderWithSuspense(props: CortexBottomPanelContainerProps) {
  return render(() => (
    <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
      <CortexBottomPanelContainer {...props} />
    </Suspense>
  ));
}

describe("CortexBottomPanelContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  describe("Collapsed State", () => {
    it("should not render anything when collapsed", () => {
      const props = createDefaultProps({ bottomPanelCollapsed: true });
      const { container } = renderWithSuspense(props);

      expect(container.querySelector('[style*="row-resize"]')).toBeNull();
      expect(container.querySelector("button")).toBeNull();
    });

    it("should render panel content when not collapsed", () => {
      const props = createDefaultProps({ bottomPanelCollapsed: false });
      const { container } = renderWithSuspense(props);

      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  describe("Tab Rendering", () => {
    it("should render tab buttons for all bottom panel tabs", () => {
      const props = createDefaultProps();
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const tabButtonTexts = Array.from(buttons)
        .map((b) => b.textContent?.trim().toLowerCase())
        .filter((t) => BOTTOM_PANEL_TABS.includes(t as BottomPanelTab));

      expect(tabButtonTexts).toHaveLength(BOTTOM_PANEL_TABS.length);
      for (const tab of BOTTOM_PANEL_TABS) {
        expect(tabButtonTexts).toContain(tab);
      }
    });

    it("should render terminal embed div when terminal tab is active", () => {
      const props = createDefaultProps({ bottomPanelTab: "terminal" });
      const { container } = renderWithSuspense(props);

      const terminalEmbed = container.querySelector('[data-terminal-embed="true"]');
      expect(terminalEmbed).toBeTruthy();
    });

    it("should render output panel when output tab is active", async () => {
      const props = createDefaultProps({ bottomPanelTab: "output" });
      const { findByTestId } = renderWithSuspense(props);

      expect(await findByTestId("output-panel")).toBeTruthy();
    });

    it("should render diagnostics panel when problems tab is active", async () => {
      const props = createDefaultProps({ bottomPanelTab: "problems" });
      const { findByTestId } = renderWithSuspense(props);

      expect(await findByTestId("diagnostics-panel")).toBeTruthy();
    });

    it("should not render terminal embed when output tab is active", () => {
      const props = createDefaultProps({ bottomPanelTab: "output" });
      const { container } = renderWithSuspense(props);

      const terminalEmbed = container.querySelector('[data-terminal-embed="true"]');
      expect(terminalEmbed).toBeNull();
    });

    it("should not render terminal embed when problems tab is active", () => {
      const props = createDefaultProps({ bottomPanelTab: "problems" });
      const { container } = renderWithSuspense(props);

      const terminalEmbed = container.querySelector('[data-terminal-embed="true"]');
      expect(terminalEmbed).toBeNull();
    });

    it("should render diff viewer when diff tab is active", async () => {
      const props = createDefaultProps({ bottomPanelTab: "diff" });
      const { findByTestId } = renderWithSuspense(props);

      expect(await findByTestId("diff-viewer")).toBeTruthy();
    });

    it("should render git history when history tab is active", async () => {
      const props = createDefaultProps({ bottomPanelTab: "history" });
      const { findByTestId } = renderWithSuspense(props);

      expect(await findByTestId("git-history")).toBeTruthy();
    });

    it("should render debug console when debug console tab is active", async () => {
      const props = createDefaultProps({ bottomPanelTab: "debug console" });
      const { findByTestId } = renderWithSuspense(props);

      expect(await findByTestId("debug-console")).toBeTruthy();
    });
  });

  describe("Tab Switching", () => {
    it("should call onTabChange when clicking a tab button", () => {
      const onTabChange = vi.fn();
      const props = createDefaultProps({ bottomPanelTab: "terminal", onTabChange });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const outputButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "output",
      );
      expect(outputButton).toBeTruthy();
      fireEvent.click(outputButton!);

      expect(onTabChange).toHaveBeenCalledWith("output");
    });

    it("should call onTabChange with 'problems' when clicking problems tab", () => {
      const onTabChange = vi.fn();
      const props = createDefaultProps({ bottomPanelTab: "terminal", onTabChange });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const problemsButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "problems",
      );
      expect(problemsButton).toBeTruthy();
      fireEvent.click(problemsButton!);

      expect(onTabChange).toHaveBeenCalledWith("problems");
    });

    it("should call onTabChange with 'terminal' when clicking terminal tab", () => {
      const onTabChange = vi.fn();
      const props = createDefaultProps({ bottomPanelTab: "output", onTabChange });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const terminalButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "terminal",
      );
      expect(terminalButton).toBeTruthy();
      fireEvent.click(terminalButton!);

      expect(onTabChange).toHaveBeenCalledWith("terminal");
    });

    it("should switch to history when the mounted git history event is dispatched", async () => {
      const onTabChange = vi.fn();
      const props = createDefaultProps({ bottomPanelCollapsed: true, onTabChange });

      renderWithSuspense(props);

      window.dispatchEvent(new CustomEvent("cortex:git:history"));
      await Promise.resolve();

      expect(onTabChange).toHaveBeenCalledWith("history");
    });
  });

  describe("Active Tab Highlighting", () => {
    it("should apply accent border to the active tab", () => {
      const props = createDefaultProps({ bottomPanelTab: "output" });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const outputButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "output",
      );
      expect(outputButton).toBeTruthy();
      expect(outputButton!.style.borderBottom).toContain("var(--cortex-accent-primary)");
    });

    it("should apply transparent border to inactive tabs", () => {
      const props = createDefaultProps({ bottomPanelTab: "output" });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const terminalButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "terminal",
      );
      expect(terminalButton).toBeTruthy();
      expect(terminalButton!.style.borderBottom).toContain("transparent");
    });

    it("should apply primary text color to the active tab", () => {
      const props = createDefaultProps({ bottomPanelTab: "problems" });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const problemsButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "problems",
      );
      expect(problemsButton).toBeTruthy();
      expect(problemsButton!.style.color).toBe("var(--cortex-text-primary)");
    });

    it("should apply muted text color to inactive tabs", () => {
      const props = createDefaultProps({ bottomPanelTab: "problems" });
      const { container } = renderWithSuspense(props);

      const buttons = container.querySelectorAll("button");
      const terminalButton = Array.from(buttons).find(
        (b) => b.textContent?.trim().toLowerCase() === "terminal",
      );
      expect(terminalButton).toBeTruthy();
      expect(terminalButton!.style.color).toBe("var(--cortex-text-muted)");
    });
  });

  describe("Close Button", () => {
    it("should render a close button", () => {
      const props = createDefaultProps();
      const { container } = renderWithSuspense(props);

      const closeButton = container.querySelector('[aria-label="Close panel"]');
      expect(closeButton).toBeTruthy();
    });

    it("should call onCollapse when close button is clicked", () => {
      const onCollapse = vi.fn();
      const props = createDefaultProps({ onCollapse });
      const { container } = renderWithSuspense(props);

      const closeButton = container.querySelector('[aria-label="Close panel"]');
      expect(closeButton).toBeTruthy();
      fireEvent.click(closeButton!);

      expect(onCollapse).toHaveBeenCalledOnce();
    });
  });

  describe("Panel Height", () => {
    it("should apply bottomPanelHeight to the panel container", () => {
      const props = createDefaultProps({ bottomPanelHeight: 300 });
      const { container } = renderWithSuspense(props);

      const panelDiv = container.querySelector('[style*="300px"]');
      expect(panelDiv).toBeTruthy();
    });

    it("should apply different height values correctly", () => {
      const props = createDefaultProps({ bottomPanelHeight: 150 });
      const { container } = renderWithSuspense(props);

      const panelDiv = container.querySelector('[style*="150px"]');
      expect(panelDiv).toBeTruthy();
    });
  });

  describe("Resize Handle", () => {
    function getResizeHandle(container: HTMLElement): HTMLElement {
      const handle = container.querySelector('[style*="row-resize"]') as HTMLElement;
      expect(handle).toBeTruthy();
      return handle;
    }

    it("should render a resize handle when not collapsed", () => {
      const props = createDefaultProps();
      const { container } = renderWithSuspense(props);

      const handle = getResizeHandle(container);
      expect(handle).toBeTruthy();
    });

    it("should not render a resize handle when collapsed", () => {
      const props = createDefaultProps({ bottomPanelCollapsed: true });
      const { container } = renderWithSuspense(props);

      const handle = container.querySelector('[style*="row-resize"]');
      expect(handle).toBeNull();
    });

    it("should call onHeightChange on mousemove during resize", async () => {
      const onHeightChange = vi.fn();
      const props = createDefaultProps({
        bottomPanelHeight: 200,
        onHeightChange,
      });
      const { container } = renderWithSuspense(props);

      const handle = getResizeHandle(container);
      await fireEvent.mouseDown(handle, { clientY: 400 });

      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 350, bubbles: true }));

      expect(onHeightChange).toHaveBeenCalledWith(250);
    });

    it("should remove event listeners after mouseup", async () => {
      const onHeightChange = vi.fn();
      const props = createDefaultProps({
        bottomPanelHeight: 200,
        onHeightChange,
      });
      const { container } = renderWithSuspense(props);

      const handle = getResizeHandle(container);
      await fireEvent.mouseDown(handle, { clientY: 400 });

      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      onHeightChange.mockClear();
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 300, bubbles: true }));

      expect(onHeightChange).not.toHaveBeenCalled();
    });

    it("should handle full resize sequence: mousedown → mousemove → mouseup", async () => {
      const onHeightChange = vi.fn();
      const props = createDefaultProps({
        bottomPanelHeight: 200,
        onHeightChange,
      });
      const { container } = renderWithSuspense(props);

      const handle = getResizeHandle(container);

      await fireEvent.mouseDown(handle, { clientY: 400 });

      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 370, bubbles: true }));
      expect(onHeightChange).toHaveBeenCalledWith(230);

      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 340, bubbles: true }));
      expect(onHeightChange).toHaveBeenCalledWith(260);

      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      onHeightChange.mockClear();
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 300, bubbles: true }));
      expect(onHeightChange).not.toHaveBeenCalled();
    });
  });

  describe("Height Constraints", () => {
    it("should clamp height to BOTTOM_PANEL_MIN_HEIGHT when dragging down", async () => {
      const onHeightChange = vi.fn();
      const props = createDefaultProps({
        bottomPanelHeight: 200,
        onHeightChange,
      });
      const { container } = renderWithSuspense(props);

      const handle = container.querySelector('[style*="row-resize"]') as HTMLElement;
      await fireEvent.mouseDown(handle, { clientY: 400 });

      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 600, bubbles: true }));

      expect(onHeightChange).toHaveBeenCalledWith(BOTTOM_PANEL_MIN_HEIGHT);
    });

    it("should clamp height to BOTTOM_PANEL_MAX_HEIGHT when dragging up", async () => {
      const onHeightChange = vi.fn();
      const props = createDefaultProps({
        bottomPanelHeight: 200,
        onHeightChange,
      });
      const { container } = renderWithSuspense(props);

      const handle = container.querySelector('[style*="row-resize"]') as HTMLElement;
      await fireEvent.mouseDown(handle, { clientY: 400 });

      document.dispatchEvent(new MouseEvent("mousemove", { clientY: -500, bubbles: true }));

      expect(onHeightChange).toHaveBeenCalledWith(BOTTOM_PANEL_MAX_HEIGHT);
    });

    it("should allow height within valid range", async () => {
      const onHeightChange = vi.fn();
      const props = createDefaultProps({
        bottomPanelHeight: 200,
        onHeightChange,
      });
      const { container } = renderWithSuspense(props);

      const handle = container.querySelector('[style*="row-resize"]') as HTMLElement;
      await fireEvent.mouseDown(handle, { clientY: 400 });

      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 350, bubbles: true }));

      expect(onHeightChange).toHaveBeenCalledWith(250);
    });

    it("should respect BOTTOM_PANEL_MIN_HEIGHT constant value", () => {
      expect(BOTTOM_PANEL_MIN_HEIGHT).toBe(100);
    });

    it("should respect BOTTOM_PANEL_MAX_HEIGHT constant value", () => {
      expect(BOTTOM_PANEL_MAX_HEIGHT).toBe(500);
    });
  });

  describe("Output Panel Integration", () => {
    it("should pass onClose callback to OutputPanel that calls onCollapse", async () => {
      const onCollapse = vi.fn();
      const props = createDefaultProps({ bottomPanelTab: "output", onCollapse });
      const { findByTestId } = renderWithSuspense(props);

      const closeBtn = await findByTestId("output-close");
      fireEvent.click(closeBtn);

      expect(onCollapse).toHaveBeenCalledOnce();
    });
  });

  describe("Resize Handle Hover", () => {
    it("should change background on mouse enter", async () => {
      const props = createDefaultProps();
      const { container } = renderWithSuspense(props);

      const handle = container.querySelector('[style*="row-resize"]') as HTMLElement;
      await fireEvent.mouseEnter(handle);

      expect(handle.style.background).toBe("var(--cortex-accent-primary)");
    });

    it("should reset background on mouse leave", async () => {
      const props = createDefaultProps();
      const { container } = renderWithSuspense(props);

      const handle = container.querySelector('[style*="row-resize"]') as HTMLElement;
      await fireEvent.mouseEnter(handle);
      await fireEvent.mouseLeave(handle);

      expect(handle.style.background).toBe("transparent");
    });
  });
});
