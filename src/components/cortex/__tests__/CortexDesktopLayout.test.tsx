import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";

const {
  mockSendMessage,
  mockInterrupt,
  mockOpenFile,
  mockOpenVirtualFile,
  mockSetShowCommandPalette,
  mockSetShowFileFinder,
  mockSetShowGoToLine,
  mockWindowOnResized,
  mockWindowOnMoved,
  mockWindowIsMaximized,
  mockWindowMinimize,
  mockWindowMaximize,
  mockWindowUnmaximize,
  mockWindowClose,
  mockGetCurrentWindow,
} = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue(undefined),
  mockInterrupt: vi.fn().mockResolvedValue(undefined),
  mockOpenFile: vi.fn(),
  mockOpenVirtualFile: vi.fn(),
  mockSetShowCommandPalette: vi.fn(),
  mockSetShowFileFinder: vi.fn(),
  mockSetShowGoToLine: vi.fn(),
  mockWindowOnResized: vi.fn().mockResolvedValue(() => {}),
  mockWindowOnMoved: vi.fn().mockResolvedValue(() => {}),
  mockWindowIsMaximized: vi.fn().mockResolvedValue(false),
  mockWindowMinimize: vi.fn().mockResolvedValue(undefined),
  mockWindowMaximize: vi.fn().mockResolvedValue(undefined),
  mockWindowUnmaximize: vi.fn().mockResolvedValue(undefined),
  mockWindowClose: vi.fn().mockResolvedValue(undefined),
  mockGetCurrentWindow: vi.fn(),
}));
const mockAppWindow = {
  onResized: mockWindowOnResized,
  onMoved: mockWindowOnMoved,
  isMaximized: mockWindowIsMaximized,
  minimize: mockWindowMinimize,
  maximize: mockWindowMaximize,
  unmaximize: mockWindowUnmaximize,
  close: mockWindowClose,
};

vi.mock("@/context/EditorContext", () => ({
  useEditor: () => ({
    state: { openFiles: [], activeFileId: null },
    openFile: mockOpenFile,
    openVirtualFile: mockOpenVirtualFile,
  }),
}));

vi.mock("@/context/SDKContext", () => ({
  useSDK: () => ({
    state: {
      messages: [],
      isStreaming: false,
      config: { model: "claude-sonnet", cwd: ".", sandboxMode: "workspace-write", approvalMode: "on-request" },
    },
    sendMessage: mockSendMessage,
    interrupt: mockInterrupt,
  }),
}));

vi.mock("@/context/ai/AIAgentContext", () => ({
  useAIAgent: () => ({
    agents: () => [],
  }),
}));

vi.mock("@/context/ai/AIProviderContext", () => ({
  useAIProvider: () => ({
    selectedModel: () => "claude-sonnet",
  }),
}));

vi.mock("@/context/MultiRepoContext", () => ({
  useMultiRepo: () => ({
    activeRepository: () => null,
  }),
}));

vi.mock("@/context/CommandContext", () => ({
  useCommands: () => ({
    setShowCommandPalette: mockSetShowCommandPalette,
    setShowFileFinder: mockSetShowFileFinder,
    setShowGoToLine: mockSetShowGoToLine,
  }),
}));

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mockGetCurrentWindow,
}));

vi.mock("@/utils/windowStorage", () => ({
  getWindowLabel: () => "main",
}));

vi.mock("../CortexTitleBar", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="cortex-title-bar" data-mode={props.mode as string} />
  ),
}));

vi.mock("../layout/CortexModeCarousel", () => ({
  CortexModeCarousel: (props: {
    mode: string;
    vibeContent: () => import("solid-js").JSX.Element;
    ideContent: () => import("solid-js").JSX.Element;
  }) => (
    <div data-testid="mode-carousel" data-mode={props.mode}>
      {props.mode === "vibe" ? props.vibeContent() : props.ideContent()}
    </div>
  ),
}));

vi.mock("../layout/CortexVibeLayout", () => ({
  CortexVibeLayout: (props: Record<string, unknown>) => (
    <div data-testid="vibe-layout" data-project={props.projectName as string} />
  ),
}));

vi.mock("../layout/CortexIDELayout", () => ({
  CortexIDELayout: (props: Record<string, unknown>) => (
    <div
      data-testid="ide-layout"
      data-sidebar-tab={props.sidebarTab as string}
      data-sidebar-collapsed={String(props.sidebarCollapsed)}
      data-sidebar-width={String(props.sidebarWidth)}
      data-chat-state={props.chatState as string}
      data-bottom-panel-tab={props.bottomPanelTab as string}
      data-bottom-panel-collapsed={String(props.bottomPanelCollapsed)}
    >
      <button data-testid="nav-item-files" onClick={() => (props.onNavItemClick as (id: string) => void)("files")} />
      <button data-testid="nav-item-search" onClick={() => (props.onNavItemClick as (id: string) => void)("search")} />
      <button data-testid="nav-item-git" onClick={() => (props.onNavItemClick as (id: string) => void)("git")} />
      <button data-testid="nav-item-home" onClick={() => (props.onNavItemClick as (id: string) => void)("home")} />
      <button data-testid="nav-item-new" onClick={() => (props.onNavItemClick as (id: string) => void)("new")} />
      <button data-testid="nav-item-factory" onClick={() => (props.onNavItemClick as (id: string) => void)("factory")} />
      <button data-testid="bottom-tab-history" onClick={() => (props.onBottomPanelTabChange as (id: string) => void)("history")} />
    </div>
  ),
}));

vi.mock("../CortexNotifications", () => ({
  CortexNotifications: () => <div data-testid="cortex-notifications" />,
}));

vi.mock("@/components/ApprovalDialog", () => ({
  ApprovalDialog: () => <div data-testid="approval-dialog" />,
}));

vi.mock("../handlers/NotificationHandler", () => ({
  NotificationHandler: () => null,
}));

vi.mock("../handlers/FileEditHandlers", () => ({
  FileEditHandlers: () => null,
}));

vi.mock("../handlers/ViewNavigationHandlers", () => ({
  ViewNavigationHandlers: () => null,
}));

vi.mock("../CortexChatPanel", () => ({
  default: () => null,
}));

vi.mock("../CortexAgentSidebar", () => ({}));
vi.mock("../CortexChangesPanel", () => ({}));
vi.mock("../CortexConversationView", () => ({}));

vi.mock("../CortexAIModificationsPanel", () => ({
  CortexAIModificationsPanel: () => <div data-testid="ai-modifications" />,
}));

vi.mock("../CortexTokenLimitDisplay", () => ({
  CortexTokenLimitDisplay: () => <div data-testid="token-limit" />,
}));

vi.mock("../CortexUpdateFileView", () => ({
  CortexUpdateFileView: () => <div data-testid="update-file-view" />,
}));

import { CortexDesktopLayout } from "../CortexDesktopLayout";

async function waitForMount() {
  await new Promise((r) => setTimeout(r, 50));
}

describe("CortexDesktopLayout", () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>;
  let removeEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    localStorage.clear();
    mockGetCurrentWindow.mockResolvedValue(mockAppWindow);
    addEventSpy = vi.spyOn(window, "addEventListener");
    removeEventSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    cleanup();
    addEventSpy.mockRestore();
    removeEventSpy.mockRestore();
  });

  describe("Rendering", () => {
    it("should render without crashing", () => {
      const { container } = render(() => <CortexDesktopLayout />);
      expect(container.firstChild).toBeTruthy();
    });

    it("should render the title bar", () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("cortex-title-bar")).toBeTruthy();
    });

    it("should render the mode carousel", () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("mode-carousel")).toBeTruthy();
    });

    it("should render CortexNotifications", () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("cortex-notifications")).toBeTruthy();
    });

    it("should render ApprovalDialog", () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("approval-dialog")).toBeTruthy();
    });

    it("should render children", () => {
      const { queryByTestId } = render(() => (
        <CortexDesktopLayout>
          <div data-testid="child-element">Child Content</div>
        </CortexDesktopLayout>
      ));
      expect(queryByTestId("child-element")).toBeTruthy();
    });

    it("removes startup listeners even if the Tauri window resolves after unmount", async () => {
      let resolveWindow!: (value: typeof mockAppWindow) => void;
      mockGetCurrentWindow.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveWindow = resolve as (value: typeof mockAppWindow) => void;
          }),
      );

      const { unmount } = render(() => <CortexDesktopLayout />);

      unmount();
      resolveWindow(mockAppWindow);
      await Promise.resolve();
      await Promise.resolve();

      expect(addEventSpy).toHaveBeenCalledWith("view:git", expect.any(Function));
      expect(removeEventSpy).toHaveBeenCalledWith("view:git", expect.any(Function));
    });

    it("should have correct root container styling", () => {
      const { container } = render(() => <CortexDesktopLayout />);
      const root = container.firstChild as HTMLElement;
      const style = root.getAttribute("style") || "";
      expect(style).toContain("display:flex");
      expect(style).toContain("width:100vw");
      expect(style).toContain("height:100vh");
      expect(style).toContain("overflow:hidden");
    });
  });

  describe("Loading layout state from localStorage", () => {
    it("should default to vibe mode when no localStorage value", () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const carousel = queryByTestId("mode-carousel");
      expect(carousel?.getAttribute("data-mode")).toBe("vibe");
    });

    it("should load mode from localStorage", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const carousel = queryByTestId("mode-carousel");
      expect(carousel?.getAttribute("data-mode")).toBe("ide");
    });

    it("should default to files sidebar tab when no localStorage value", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-sidebar-tab")).toBe("files");
    });

    it("should load sidebarTab from localStorage", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_tab", "search");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-sidebar-tab")).toBe("search");
    });

    it("should load sidebarWidth from localStorage", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_width", "400");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-sidebar-width")).toBe("400");
    });

    it("should clamp sidebarWidth to min/max bounds", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_width", "50");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(Number(ideLayout?.getAttribute("data-sidebar-width"))).toBeGreaterThanOrEqual(200);
    });

    it("should load chatState from localStorage", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_chat_state", "expanded");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-chat-state")).toBe("expanded");
    });

    it("should default chatState to minimized when invalid value", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_chat_state", "invalid-state");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-chat-state")).toBe("minimized");
    });

    it("should ignore invalid mode values from localStorage", () => {
      localStorage.setItem("figma_layout_mode", "invalid-mode");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const carousel = queryByTestId("mode-carousel");
      expect(carousel?.getAttribute("data-mode")).toBe("vibe");
    });

    it("should force ide mode when a project is open", () => {
      localStorage.setItem("figma_layout_mode", "vibe");
      localStorage.setItem("cortex_current_project_main", "/home/user/project");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const carousel = queryByTestId("mode-carousel");
      expect(carousel?.getAttribute("data-mode")).toBe("ide");
    });
  });

  describe("VALID_SIDEBAR_TABS and factory handling", () => {
    it("should fall back to files when factory tab is in localStorage (factory removed)", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_tab", "factory");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-sidebar-tab")).toBe("files");
    });

    it("should fall back to agents when a legacy AI tab is in localStorage", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_tab", "assistant");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-sidebar-tab")).toBe("agents");
    });
  });

  describe("handleNavItemClick", () => {
    it("should toggle sidebar collapse when clicking active tab", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_tab", "files");
      localStorage.setItem("figma_layout_sidebar_collapsed", "false");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const ideLayout = queryByTestId("ide-layout");
      expect(ideLayout?.getAttribute("data-sidebar-tab")).toBe("files");
      expect(ideLayout?.getAttribute("data-sidebar-collapsed")).toBe("false");

      const filesBtn = queryByTestId("nav-item-files");
      filesBtn!.click();

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("true");
      });
    });

    it("should switch tab when clicking different tab with sidebar open", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_tab", "files");
      localStorage.setItem("figma_layout_sidebar_collapsed", "false");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const searchBtn = queryByTestId("nav-item-search");
      searchBtn!.click();

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("search");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should open sidebar and set tab when clicking different tab with sidebar collapsed", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_tab", "files");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const gitBtn = queryByTestId("nav-item-git");
      gitBtn!.click();

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("git");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should switch to vibe mode when home is clicked", async () => {
      localStorage.setItem("figma_layout_mode", "ide");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const homeBtn = queryByTestId("nav-item-home");
      homeBtn!.click();

      await vi.waitFor(() => {
        const carousel = document.querySelector('[data-testid="mode-carousel"]');
        expect(carousel?.getAttribute("data-mode")).toBe("vibe");
      });
    });

    it("should dispatch file:new event when new is clicked", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const newBtn = queryByTestId("nav-item-new");
      newBtn!.click();

      const fileNewEvent = dispatchSpy.mock.calls.find(
        (call) => (call[0] as CustomEvent).type === "file:new"
      );
      expect(fileNewEvent).toBeTruthy();

      dispatchSpy.mockRestore();
    });
  });

  describe("Mode switching", () => {
    it("should render vibe layout in vibe mode", () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("vibe-layout")).toBeTruthy();
      expect(queryByTestId("ide-layout")).toBeFalsy();
    });

    it("should render ide layout in ide mode", () => {
      localStorage.setItem("figma_layout_mode", "ide");
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("ide-layout")).toBeTruthy();
      expect(queryByTestId("vibe-layout")).toBeFalsy();
    });

    it("should switch from vibe to ide via viewmode:change event", async () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("mode-carousel")?.getAttribute("data-mode")).toBe("vibe");

      await waitForMount();

      window.dispatchEvent(
        new CustomEvent("viewmode:change", { detail: { mode: "ide" } })
      );

      await vi.waitFor(() => {
        const carousel = document.querySelector('[data-testid="mode-carousel"]');
        expect(carousel?.getAttribute("data-mode")).toBe("ide");
      });
    });

    it("should switch to ide mode on folder:did-open event", async () => {
      const { queryByTestId } = render(() => <CortexDesktopLayout />);
      expect(queryByTestId("mode-carousel")?.getAttribute("data-mode")).toBe("vibe");

      await waitForMount();

      window.dispatchEvent(new CustomEvent("folder:did-open"));

      await vi.waitFor(() => {
        const carousel = document.querySelector('[data-testid="mode-carousel"]');
        expect(carousel?.getAttribute("data-mode")).toBe("ide");
      });
    });

    it("should set sidebar to files and uncollapse on folder:did-open", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");
      localStorage.setItem("figma_layout_sidebar_tab", "search");

      render(() => <CortexDesktopLayout />);

      await waitForMount();

      window.dispatchEvent(new CustomEvent("folder:did-open"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("files");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });
  });

  describe("Saving layout state to localStorage", () => {
    it("should save mode to localStorage", async () => {
      render(() => <CortexDesktopLayout />);

      await waitForMount();

      window.dispatchEvent(
        new CustomEvent("viewmode:change", { detail: { mode: "ide" } })
      );

      await vi.waitFor(() => {
        expect(localStorage.getItem("figma_layout_mode")).toBe("ide");
      });
    });

    it("should normalize chat state when mode changes via events", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_chat_state", "expanded");

      render(() => <CortexDesktopLayout />);

      await waitForMount();

      window.dispatchEvent(
        new CustomEvent("viewmode:change", { detail: { mode: "vibe" } })
      );

      await vi.waitFor(() => {
        expect(localStorage.getItem("figma_layout_mode")).toBe("vibe");
        expect(localStorage.getItem("figma_layout_chat_state")).toBe("home");
      });

      window.dispatchEvent(
        new CustomEvent("viewmode:change", { detail: { mode: "ide" } })
      );

      await vi.waitFor(() => {
        expect(localStorage.getItem("figma_layout_mode")).toBe("ide");
        expect(localStorage.getItem("figma_layout_chat_state")).toBe("minimized");
      });
    });

    it("should save sidebarTab to localStorage on change", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "false");
      localStorage.setItem("figma_layout_sidebar_tab", "files");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const searchBtn = queryByTestId("nav-item-search");
      searchBtn!.click();

      await vi.waitFor(() => {
        expect(localStorage.getItem("figma_layout_sidebar_tab")).toBe("search");
      });
    });

    it("should save sidebarCollapsed to localStorage on toggle", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "false");
      localStorage.setItem("figma_layout_sidebar_tab", "files");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const filesBtn = queryByTestId("nav-item-files");
      filesBtn!.click();

      await vi.waitFor(() => {
        expect(localStorage.getItem("figma_layout_sidebar_collapsed")).toBe("true");
      });
    });

    it("should uncollapse the bottom panel when selecting a bottom tab", async () => {
      localStorage.setItem("figma_layout_mode", "ide");

      const { queryByTestId } = render(() => <CortexDesktopLayout />);

      const historyTab = queryByTestId("bottom-tab-history");
      historyTab!.click();

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-bottom-panel-tab")).toBe("history");
        expect(layout?.getAttribute("data-bottom-panel-collapsed")).toBe("false");
      });
    });
  });

  describe("Event listeners", () => {
    it("should register event listeners on mount", async () => {
      render(() => <CortexDesktopLayout />);

      await waitForMount();

      const registeredEvents = addEventSpy.mock.calls.map((call: any) => call[0]);
      expect(registeredEvents).toContain("viewmode:change");
      expect(registeredEvents).toContain("chat:toggle");
      expect(registeredEvents).toContain("folder:did-open");
      expect(registeredEvents).toContain("settings:open-tab");
      expect(registeredEvents).toContain("view:explorer");
      expect(registeredEvents).toContain("view:search");
      expect(registeredEvents).toContain("view:git");
      expect(registeredEvents).toContain("view:agents");
      expect(registeredEvents).toContain("view:extensions");
      expect(registeredEvents).toContain("layout:focus-explorer");
      expect(registeredEvents).toContain("layout:focus-debug");
      expect(registeredEvents).toContain("layout:focus-view");
      expect(registeredEvents).toContain("sidebar:toggle");
      expect(registeredEvents).toContain("layout:toggle-sidebar");
      expect(registeredEvents).toContain("selection:select-all");
      expect(registeredEvents).toContain("help:docs");
      expect(registeredEvents).toContain("terminal:toggle");
      expect(registeredEvents).toContain("layout:toggle-panel");
      expect(registeredEvents).toContain("ai:modifications:toggle");
      expect(registeredEvents).toContain("file:update-view");
    });

    it("should clean up event listeners on unmount", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      const { unmount, queryByTestId } = render(() => <CortexDesktopLayout />);

      await waitForMount();

      window.dispatchEvent(new CustomEvent("sidebar:toggle"));
      await vi.waitFor(() => {
        expect(queryByTestId("ide-layout")?.getAttribute("data-sidebar-collapsed")).toBe("true");
      });

      unmount();

      const spyCalls = addEventSpy.mock.calls;
      const registeredEvents = spyCalls.map((c: any) => c[0] as string);
      expect(registeredEvents).toContain("viewmode:change");
      expect(registeredEvents).toContain("sidebar:toggle");

      const addCountBefore = spyCalls.length;

      window.dispatchEvent(new CustomEvent("sidebar:toggle"));
      await new Promise((r) => setTimeout(r, 20));

      expect(addEventSpy.mock.calls.length).toBe(addCountBefore);
    });

    it("should handle view:explorer event by opening files sidebar", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");
      localStorage.setItem("figma_layout_sidebar_tab", "git");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("view:explorer");
      });

      window.dispatchEvent(new CustomEvent("view:explorer"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("files");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should handle view:search event by opening search sidebar", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("view:search");
      });

      window.dispatchEvent(new CustomEvent("view:search"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("search");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should handle view:git event by opening git sidebar", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("view:git");
      });

      window.dispatchEvent(new CustomEvent("view:git"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("git");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should handle view:extensions event by opening extensions sidebar", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("view:extensions");
      });

      window.dispatchEvent(new CustomEvent("view:extensions"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("extensions");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should handle layout:focus-view by switching to the mapped mounted sidebar in ide mode", async () => {
      localStorage.setItem("figma_layout_mode", "vibe");
      localStorage.setItem("figma_layout_chat_state", "expanded");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("layout:focus-view");
      });

      window.dispatchEvent(new CustomEvent("layout:focus-view", { detail: { view: "scm" } }));

      await vi.waitFor(() => {
        const carousel = document.querySelector('[data-testid="mode-carousel"]');
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(carousel?.getAttribute("data-mode")).toBe("ide");
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("git");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
        expect(layout?.getAttribute("data-chat-state")).toBe("minimized");
      });
    });

    it("should handle layout:focus-explorer by opening the files sidebar", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "true");
      localStorage.setItem("figma_layout_sidebar_tab", "git");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("layout:focus-explorer");
      });

      window.dispatchEvent(new CustomEvent("layout:focus-explorer"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-tab")).toBe("files");
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("false");
      });
    });

    it("should handle sidebar:toggle event by toggling sidebar collapsed", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "false");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("sidebar:toggle");
      });

      window.dispatchEvent(new CustomEvent("sidebar:toggle"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("true");
      });
    });

    it("should handle layout:toggle-sidebar event by toggling sidebar collapsed", async () => {
      localStorage.setItem("figma_layout_mode", "ide");
      localStorage.setItem("figma_layout_sidebar_collapsed", "false");

      render(() => <CortexDesktopLayout />);

      await vi.waitFor(() => {
        const events = addEventSpy.mock.calls.map((c: any) => c[0]);
        expect(events).toContain("layout:toggle-sidebar");
      });

      window.dispatchEvent(new CustomEvent("layout:toggle-sidebar"));

      await vi.waitFor(() => {
        const layout = document.querySelector('[data-testid="ide-layout"]');
        expect(layout?.getAttribute("data-sidebar-collapsed")).toBe("true");
      });
    });
  });
});
