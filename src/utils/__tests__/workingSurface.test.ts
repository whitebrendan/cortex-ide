import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSafeSetItem, mockSafeRemoveItem } = vi.hoisted(() => ({
  mockSafeSetItem: vi.fn(),
  mockSafeRemoveItem: vi.fn(),
}));

vi.mock("@/utils/safeStorage", () => ({
  safeSetItem: mockSafeSetItem,
  safeRemoveItem: mockSafeRemoveItem,
}));

vi.mock("@/utils/windowStorage", () => ({
  getWindowLabel: () => "main",
}));

import {
  closeWorkspaceSurface,
  isSessionRoute,
  openUntitledSurface,
  openWorkspaceSurface,
  persistCurrentProject,
  resetProjectScopedTransientState,
} from "../workingSurface";

describe("workingSurface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects supported session routes", () => {
    expect(isSessionRoute("/session")).toBe(true);
    expect(isSessionRoute("/session/123")).toBe(true);
    expect(isSessionRoute("/welcome")).toBe(false);
  });

  it("persists the current project across window-scoped and legacy storage keys", () => {
    persistCurrentProject("/workspace/demo");

    expect(mockSafeSetItem).toHaveBeenCalledWith("projectPath_main", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project_main", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("projectPath", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project", "/workspace/demo");
  });

  it("writes the cross-project shell baseline to storage", () => {
    resetProjectScopedTransientState();

    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_mode", "ide");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_sidebar_tab", "files");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_sidebar_collapsed", "false");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_chat_state", "minimized");
  });

  it("opens a workspace surface, emits workspace intents, resets shell state, and navigates to session when needed", () => {
    const navigate = vi.fn();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    openWorkspaceSurface("/workspace/demo", { pathname: "/welcome", navigate });

    expect(mockSafeSetItem).toHaveBeenCalledWith("projectPath_main", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project_main", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("projectPath", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_mode", "ide");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_sidebar_tab", "files");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_sidebar_collapsed", "false");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_chat_state", "minimized");
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workspace:open-folder", detail: { path: "/workspace/demo" } }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "folder:did-open" }));
    expect(navigate).toHaveBeenCalledWith("/session");

    dispatchSpy.mockRestore();
  });

  it("clears persisted project keys and returns to welcome when closing a workspace surface", () => {
    const navigate = vi.fn();

    closeWorkspaceSurface({ pathname: "/session", navigate });

    expect(mockSafeRemoveItem).toHaveBeenCalledWith("projectPath_main");
    expect(mockSafeRemoveItem).toHaveBeenCalledWith("cortex_current_project_main");
    expect(mockSafeRemoveItem).toHaveBeenCalledWith("projectPath");
    expect(mockSafeRemoveItem).toHaveBeenCalledWith("cortex_current_project");
    expect(navigate).toHaveBeenCalledWith("/welcome");
  });

  it("opens an untitled file in ide mode without re-navigating when already on session", () => {
    const navigate = vi.fn();
    const openVirtualFile = vi.fn();

    openUntitledSurface({ pathname: "/session", navigate, openVirtualFile });

    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_mode", "ide");
    expect(openVirtualFile).toHaveBeenCalledWith("Untitled", "", "plaintext");
    expect(navigate).not.toHaveBeenCalled();
  });
});
