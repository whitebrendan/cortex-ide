import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupEventHandlers } from "../eventHandlers";
import type { EditorState } from "../editorTypes";

function createState(): EditorState {
  return {
    openFiles: [],
    activeFileId: null,
    activeGroupId: "group-default",
    groups: [
      {
        id: "group-default",
        fileIds: [],
        activeFileId: null,
        splitRatio: 1,
      },
    ],
    splits: [],
    cursorCount: 1,
    selectionCount: 0,
    isOpening: false,
    pinnedTabs: [],
    previewTab: null,
    gridState: null,
    useGridLayout: false,
    minimapSettings: {
      enabled: true,
      side: "right",
      showSlider: "mouseover",
      renderCharacters: false,
      maxColumn: 80,
      scale: 1,
      sizeMode: "proportional",
    },
    breadcrumbSymbolPath: [],
    groupLockState: {},
    groupNames: {},
    recentlyClosedStack: [],
  };
}

describe("eventHandlers race conditions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches goto-line only for the latest rapid open-file event", async () => {
    const state = createState();
    const operations = {
      splitEditorInGrid: vi.fn(),
      splitEditor: vi.fn(),
      setActiveFile: vi.fn(),
      openFile: vi.fn().mockResolvedValue(undefined),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    let dispose = () => {};
    createRoot((rootDispose) => {
      dispose = rootDispose;
      setupEventHandlers(state, operations);
    });

    window.dispatchEvent(
      new CustomEvent("editor:open-file", {
        detail: { path: "/workspace/first.ts", line: 10, column: 2 },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("editor:open-file", {
        detail: { path: "/workspace/second.ts", line: 20, column: 4 },
      }),
    );

    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60);

    const gotoEvents = dispatchSpy.mock.calls
      .map(([evt]) => evt)
      .filter((evt): evt is CustomEvent<{ line: number; column: number }> => evt.type === "editor:goto-line");

    expect(operations.openFile).toHaveBeenCalledTimes(2);
    expect(gotoEvents).toHaveLength(1);
    expect(gotoEvents[0]?.detail).toEqual({ line: 20, column: 4 });

    dispose();
  });

  it("clears pending goto timeout during cleanup", async () => {
    const state = createState();
    const operations = {
      splitEditorInGrid: vi.fn(),
      splitEditor: vi.fn(),
      setActiveFile: vi.fn(),
      openFile: vi.fn().mockResolvedValue(undefined),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    let dispose = () => {};
    createRoot((rootDispose) => {
      dispose = rootDispose;
      setupEventHandlers(state, operations);
    });

    window.dispatchEvent(
      new CustomEvent("editor:goto", {
        detail: { path: "/workspace/cleanup.ts", line: 7, column: 3 },
      }),
    );

    await Promise.resolve();
    dispose();
    await vi.advanceTimersByTimeAsync(60);

    const gotoEvents = dispatchSpy.mock.calls
      .map(([evt]) => evt)
      .filter((evt) => evt.type === "editor:goto-line");

    expect(gotoEvents).toHaveLength(0);
  });
});
