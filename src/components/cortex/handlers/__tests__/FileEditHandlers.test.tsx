import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { OpenFile } from "@/types";
import { useEditor } from "@/context/editor/EditorProvider";
import { FileEditHandlers } from "../FileEditHandlers";

const { mockSafeSetItem, mockOpenDialog, mockLocation } = vi.hoisted(() => ({
  mockSafeSetItem: vi.fn(),
  mockOpenDialog: vi.fn().mockResolvedValue(null),
  mockLocation: { pathname: "/session" },
}));
const mockUpdateConfig = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/context/editor/EditorProvider", () => ({
  useEditor: vi.fn(),
}));

vi.mock("@/context/SDKContext", () => ({
  useSDK: () => ({
    updateConfig: mockUpdateConfig,
  }),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockOpenDialog,
  save: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/utils/tauri-api", () => ({
  fsWriteFile: vi.fn(),
}));

vi.mock("@/utils/windowStorage", () => ({
  getWindowLabel: vi.fn(() => "main"),
}));

vi.mock("@/utils/safeStorage", () => ({
  safeSetItem: mockSafeSetItem,
}));

describe("FileEditHandlers", () => {
  let activeFile: OpenFile;
  let mockEditor: {
    state: { openFiles: OpenFile[]; activeFileId: string | null };
    openVirtualFile: ReturnType<typeof vi.fn>;
    openFile: ReturnType<typeof vi.fn>;
    saveFile: ReturnType<typeof vi.fn>;
    closeFile: ReturnType<typeof vi.fn>;
    reloadFile: ReturnType<typeof vi.fn>;
  };

  const renderHandlers = () => {
    render(() => <FileEditHandlers />);
    vi.runAllTimers();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateConfig.mockReset();
    mockNavigate.mockReset();
    mockSafeSetItem.mockReset();
    mockOpenDialog.mockReset().mockResolvedValue(null);
    mockLocation.pathname = "/session";

    activeFile = {
      id: "file-1",
      path: "/workspace/app.ts",
      name: "app.ts",
      content: "const before = true;",
      language: "typescript",
      modified: true,
      cursors: [{ line: 1, column: 1 }],
      selections: [],
    };

    mockEditor = {
      state: {
        openFiles: [activeFile],
        activeFileId: activeFile.id,
      },
      openVirtualFile: vi.fn(),
      openFile: vi.fn(),
      saveFile: vi.fn(async (fileId: string) => {
        if (fileId === activeFile.id) {
          activeFile.modified = false;
        }
      }),
      closeFile: vi.fn(),
      reloadFile: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(useEditor).mockReturnValue(mockEditor as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("opens an unsaved changes dialog before closing a dirty editor", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:close"));
    await vi.runAllTimersAsync();

    expect(screen.getByText("Unsaved Changes")).toBeTruthy();
    expect(screen.getByText(/app\.ts/)).toBeTruthy();
    expect(mockEditor.closeFile).not.toHaveBeenCalled();
  });

  it("only closes after an explicit Don't Save action", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:close"));
    await vi.runAllTimersAsync();
    await fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));

    expect(mockEditor.saveFile).not.toHaveBeenCalled();
    expect(mockEditor.closeFile).toHaveBeenCalledWith("file-1");
  });

  it("saves before closing when Save is confirmed", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:close"));
    await vi.runAllTimersAsync();
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.runAllTimersAsync();

    expect(mockEditor.saveFile).toHaveBeenCalledWith("file-1");
    expect(mockEditor.closeFile).toHaveBeenCalledWith("file-1");
  });

  it("opens a reload confirmation that names the real file", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:revert"));
    await vi.runAllTimersAsync();

    const dialog = screen.getByRole("dialog", { name: "Reload File from Disk" });
    expect(screen.getByText("Reload File from Disk")).toBeTruthy();
    expect(dialog.textContent).toContain("Reload");
    expect(dialog.textContent).toContain("app.ts");
    expect(mockEditor.reloadFile).not.toHaveBeenCalled();
  });

  it("keeps reload cancel-safe across cancel, close, and Escape", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:revert"));
    await vi.runAllTimersAsync();
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    window.dispatchEvent(new CustomEvent("file:revert"));
    await vi.runAllTimersAsync();
    await fireEvent.click(screen.getByLabelText("Close modal"));

    window.dispatchEvent(new CustomEvent("file:revert"));
    await vi.runAllTimersAsync();
    const dialog = document.body.querySelector("[role='dialog']") as HTMLElement;
    await fireEvent.keyDown(dialog, { key: "Escape" });

    expect(mockEditor.reloadFile).not.toHaveBeenCalled();
  });

  it("reloads only after explicit confirmation", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:revert"));
    await vi.runAllTimersAsync();
    await fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await vi.runAllTimersAsync();

    expect(mockEditor.reloadFile).toHaveBeenCalledWith("file-1");
  });

  it("reload-request bypasses the confirmation for already-confirmed internal flows", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:reload-request", { detail: { path: "/workspace/app.ts" } }));
    await vi.runAllTimersAsync();

    expect(mockEditor.reloadFile).toHaveBeenCalledWith("file-1");
    expect(screen.queryByText("Reload File from Disk")).toBeNull();
  });

  it("opens an untitled file on the welcome route and converges to /session", async () => {
    mockLocation.pathname = "/welcome";
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:new"));
    await vi.runAllTimersAsync();

    expect(mockEditor.openVirtualFile).toHaveBeenCalledWith("Untitled", "", "plaintext");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_mode", "ide");
    expect(mockNavigate).toHaveBeenCalledWith("/session");
  });

  it("does not re-navigate when opening a new file from /session", async () => {
    renderHandlers();

    window.dispatchEvent(new CustomEvent("file:new"));
    await vi.runAllTimersAsync();

    expect(mockEditor.openVirtualFile).toHaveBeenCalledWith("Untitled", "", "plaintext");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("opens a selected folder and converges to the session workspace from welcome", async () => {
    mockLocation.pathname = "/welcome";
    mockOpenDialog.mockResolvedValueOnce("/workspace/demo");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderHandlers();
    window.dispatchEvent(new CustomEvent("folder:open"));
    await vi.runAllTimersAsync();

    expect(mockUpdateConfig).toHaveBeenCalledWith({ cwd: "/workspace/demo" });
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project_main", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("cortex_current_project", "/workspace/demo");
    expect(mockSafeSetItem).toHaveBeenCalledWith("figma_layout_mode", "ide");
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "workspace:open-folder", detail: { path: "/workspace/demo" } }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "folder:did-open" }));
    expect(mockNavigate).toHaveBeenCalledWith("/session");

    dispatchSpy.mockRestore();
  });

  it("does not navigate again when opening a folder from /session", async () => {
    mockOpenDialog.mockResolvedValueOnce("/workspace/demo");
    renderHandlers();

    window.dispatchEvent(new CustomEvent("folder:open"));
    await vi.runAllTimersAsync();

    expect(mockUpdateConfig).toHaveBeenCalledWith({ cwd: "/workspace/demo" });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
