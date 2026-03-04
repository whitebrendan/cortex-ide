import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { createFileOperations } from "../fileOperations";
import type { EditorState } from "../editorTypes";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createInitialState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    openFiles: [],
    activeFileId: null,
    activeGroupId: "group-a",
    groups: [
      {
        id: "group-a",
        fileIds: [],
        activeFileId: null,
        splitRatio: 1,
      },
      {
        id: "group-b",
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
    ...overrides,
  };
}

function createHarness(overrides: Partial<EditorState> = {}) {
  let dispose = () => {};
  let state!: EditorState;
  let operations!: ReturnType<typeof createFileOperations>;

  createRoot((rootDispose) => {
    dispose = rootDispose;
    const [store, setStore] = createStore<EditorState>(createInitialState(overrides));
    state = store;
    operations = createFileOperations(store, setStore);
  });

  return { state, operations, dispose };
}

describe("fileOperations race conditions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates concurrent openFile calls for the same path", async () => {
    const invokeMock = vi.mocked(invoke);
    const fileDeferred = createDeferred<string>();

    invokeMock.mockImplementation((cmd, args) => {
      if (cmd === "fs_read_file" && (args as { path?: string }).path === "/workspace/app.ts") {
        return fileDeferred.promise as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });

    const { state, operations, dispose } = createHarness();

    const openA = operations.openFile("/workspace/app.ts", "group-a");
    const openB = operations.openFile("/workspace/app.ts", "group-a");

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(state.isOpening).toBe(true);

    fileDeferred.resolve("export const value = 1;");
    await Promise.all([openA, openB]);

    expect(state.openFiles).toHaveLength(1);
    expect(state.openFiles[0]?.path).toBe("/workspace/app.ts");
    expect(state.groups[0]?.fileIds).toHaveLength(1);
    expect(state.isOpening).toBe(false);

    dispose();
  });

  it("keeps isOpening true until all concurrent opens complete", async () => {
    const invokeMock = vi.mocked(invoke);
    const deferredA = createDeferred<string>();
    const deferredB = createDeferred<string>();

    invokeMock.mockImplementation((cmd, args) => {
      if (cmd !== "fs_read_file") {
        return Promise.resolve(undefined);
      }

      const path = (args as { path?: string }).path;
      if (path === "/workspace/a.ts") {
        return deferredA.promise as Promise<unknown>;
      }
      if (path === "/workspace/b.ts") {
        return deferredB.promise as Promise<unknown>;
      }
      return Promise.resolve("") as Promise<unknown>;
    });

    const { state, operations, dispose } = createHarness();

    const openA = operations.openFile("/workspace/a.ts", "group-a");
    const openB = operations.openFile("/workspace/b.ts", "group-a");

    expect(state.isOpening).toBe(true);

    deferredA.resolve("export const a = 1;");
    await Promise.resolve();
    await Promise.resolve();
    expect(state.isOpening).toBe(true);

    deferredB.resolve("export const b = 2;");
    await Promise.all([openA, openB]);

    expect(state.openFiles).toHaveLength(2);
    expect(state.isOpening).toBe(false);

    dispose();
  });

  it("attaches deduped open result to the later target group", async () => {
    const invokeMock = vi.mocked(invoke);
    const deferred = createDeferred<string>();

    invokeMock.mockImplementation((cmd, args) => {
      if (cmd === "fs_read_file" && (args as { path?: string }).path === "/workspace/shared.ts") {
        return deferred.promise as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });

    const { state, operations, dispose } = createHarness();

    const openInA = operations.openFile("/workspace/shared.ts", "group-a");
    const openInB = operations.openFile("/workspace/shared.ts", "group-b");

    deferred.resolve("export const shared = true;");
    await Promise.all([openInA, openInB]);

    const openedFileId = state.openFiles[0]?.id;
    expect(openedFileId).toBeTruthy();
    expect(state.groups.find((g) => g.id === "group-a")?.fileIds).toContain(openedFileId);
    expect(state.groups.find((g) => g.id === "group-b")?.fileIds).toContain(openedFileId);
    expect(state.activeGroupId).toBe("group-b");

    dispose();
  });
});