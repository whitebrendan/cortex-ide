import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSafeSetItem } = vi.hoisted(() => ({
  mockSafeSetItem: vi.fn(),
}));

vi.mock("@/utils/safeStorage", () => ({
  safeSetItem: mockSafeSetItem,
}));

vi.mock("@/utils/windowStorage", () => ({
  getWindowLabel: () => "main",
}));

import {
  isSessionRoute,
  openUntitledSurface,
  openWorkspaceSurface,
  persistCurrentProject,
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

  it("persists the current project for the active window and legacy main key", () => {
    persistCurrentProject("/workspace/demo");

    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project_main", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project", "/workspace/demo");
  });

  it("opens a workspace surface, emits workspace intents, and navigates to session when needed", () => {
    const navigate = vi.fn();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    openWorkspaceSurface("/workspace/demo", { pathname: "/welcome", navigate });

    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_mode", "ide");
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workspace:open-folder", detail: { path: "/workspace/demo" } }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "folder:did-open" }));
    expect(navigate).toHaveBeenCalledWith("/session");

    dispatchSpy.mockRestore();
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
