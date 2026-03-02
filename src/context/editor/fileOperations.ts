import { batch } from "solid-js";
import { produce, type SetStoreFunction } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { fsWriteFile } from "../../utils/tauri-api";
import type { OpenFile } from "../../types";
import type { EditorState } from "./editorTypes";
import { detectLanguage, generateId } from "./languageDetection";
import { savePinnedTabs } from "./tabOperations";

/** Content cache for preloaded adjacent tabs */
const preloadCache = new Map<string, string>();

/** Maximum number of entries in the preload cache */
const PRELOAD_CACHE_MAX = 10;

/** Preload file content into cache using requestIdleCallback */
function preloadAdjacentTabs(
  state: EditorState,
  currentFileId: string,
): void {
  const group = state.groups.find((g) => g.fileIds.includes(currentFileId));
  if (!group) return;

  const currentIndex = group.fileIds.indexOf(currentFileId);
  if (currentIndex === -1) return;

  const adjacentIds: string[] = [];
  if (currentIndex > 0) adjacentIds.push(group.fileIds[currentIndex - 1]);
  if (currentIndex < group.fileIds.length - 1) adjacentIds.push(group.fileIds[currentIndex + 1]);

  const filesToPreload = adjacentIds
    .map((id) => state.openFiles.find((f) => f.id === id))
    .filter((f): f is OpenFile => f !== undefined && !f.path.startsWith("virtual://"))
    .filter((f) => !preloadCache.has(f.path));

  if (filesToPreload.length === 0) return;

  const schedulePreload = (cb: () => void) => {
    if ("requestIdleCallback" in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(cb, { timeout: 3000 });
    } else {
      setTimeout(cb, 200);
    }
  };

  for (const file of filesToPreload) {
    schedulePreload(() => {
      if (preloadCache.has(file.path)) return;
      invoke<string>("fs_read_file", { path: file.path })
        .then((content) => {
          preloadCache.set(file.path, content);
          if (preloadCache.size > PRELOAD_CACHE_MAX) {
            const firstKey = preloadCache.keys().next().value;
            if (firstKey) preloadCache.delete(firstKey);
          }
        })
        .catch(() => {});
    });
  }
}

/** Get content from preload cache, removing it on hit */
function getPreloadedContent(path: string): string | undefined {
  const content = preloadCache.get(path);
  if (content !== undefined) {
    preloadCache.delete(path);
  }
  return content;
}

export function createFileOperations(
  state: EditorState,
  setState: SetStoreFunction<EditorState>,
) {
  const openFile = async (path: string, groupId?: string) => {
    const perfStart = performance.now();
    const targetGroupId = groupId || state.activeGroupId;
    
    const existing = state.openFiles.find((f) => f.path === path);
    if (existing) {
      batch(() => {
        setState("activeFileId", existing.id);
        setState("activeGroupId", targetGroupId);
        setState(
          "groups",
          (g) => g.id === targetGroupId,
          produce((group) => {
            if (!group.fileIds.includes(existing.id)) {
              group.fileIds.push(existing.id);
            }
            group.activeFileId = existing.id;
          })
        );
      });
      console.debug(`[EditorContext] openFile (existing): ${(performance.now() - perfStart).toFixed(1)}ms`);
      preloadAdjacentTabs(state, existing.id);
      return;
    }

    setState("isOpening", true);
    try {
      const readStart = performance.now();
      const cached = getPreloadedContent(path);
      const content = cached ?? await invoke<string>("fs_read_file", { path });
      console.debug(`[EditorContext] ${cached ? "preload-hit" : "fs_read_file"}: ${(performance.now() - readStart).toFixed(1)}ms (${(content.length / 1024).toFixed(1)}KB)`);
      
      const name = path.split(/[/\\]/).pop() || path;
      const id = `file-${generateId()}`;

      const newFile: OpenFile = {
        id,
        path,
        name,
        content,
        language: detectLanguage(name),
        modified: false,
        cursors: [{ line: 1, column: 1 }],
        selections: [],
      };

      const batchStart = performance.now();
      batch(() => {
        setState("openFiles", (files) => [...files, newFile]);
        setState("activeFileId", id);
        setState("activeGroupId", targetGroupId);
        setState(
          "groups",
          (g) => g.id === targetGroupId,
          produce((group) => {
            group.fileIds.push(id);
            group.activeFileId = id;
          })
        );
      });
      console.debug(`[EditorContext] batch setState: ${(performance.now() - batchStart).toFixed(1)}ms`);
      console.debug(`[EditorContext] openFile (new) TOTAL: ${(performance.now() - perfStart).toFixed(1)}ms`);

      preloadAdjacentTabs(state, id);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Failed to open file:", errorMessage);
      
      window.dispatchEvent(
        new CustomEvent("notification", {
          detail: {
            type: "error",
            title: "Failed to open file",
            message: `Could not open "${path.split("/").pop() || path.split("\\").pop() || path}": ${errorMessage}`,
          },
        })
      );
    } finally {
      setState("isOpening", false);
    }
  };

  const openVirtualFile = async (name: string, content: string, language?: string) => {
    const targetGroupId = state.activeGroupId;
    const path = `virtual:///${name}`;

    const existing = state.openFiles.find((f) => f.path === path);
    if (existing) {
      batch(() => {
        setState("activeFileId", existing.id);
        setState("activeGroupId", targetGroupId);
        setState(
          "groups",
          (g) => g.id === targetGroupId,
          produce((group) => {
            if (!group.fileIds.includes(existing.id)) {
              group.fileIds.push(existing.id);
            }
            group.activeFileId = existing.id;
          })
        );
      });
      return;
    }

    const id = `virtual-${generateId()}`;

    const newFile: OpenFile = {
      id,
      path,
      name,
      content,
      language: language || detectLanguage(name),
      modified: false,
      cursors: [{ line: 1, column: 1 }],
      selections: [],
    };

    batch(() => {
      setState("openFiles", (files) => [...files, newFile]);
      setState("activeFileId", id);
      setState("activeGroupId", targetGroupId);
      setState(
        "groups",
        (g) => g.id === targetGroupId,
        produce((group) => {
          group.fileIds.push(id);
          group.activeFileId = id;
        })
      );
    });
  };

  const closeFile = (fileId: string) => {
    const fileIndex = state.openFiles.findIndex((f) => f.id === fileId);
    if (fileIndex === -1) return;

    const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
    const fileIdIndexInGroup = activeGroup?.fileIds.indexOf(fileId) ?? -1;
    const remainingFileIds = activeGroup?.fileIds.filter((id) => id !== fileId) || [];
    const nextActiveFileId = state.activeFileId === fileId 
      ? (remainingFileIds[Math.max(0, fileIdIndexInGroup - 1)] || null)
      : state.activeFileId;

    window.dispatchEvent(new CustomEvent("editor:file-closing", { 
      detail: { fileId } 
    }));

    setTimeout(() => {
      batch(() => {
        if (state.activeFileId === fileId) {
          setState("activeFileId", nextActiveFileId);
        }

        setState("groups", (groups) =>
          groups.map((group) => {
            const groupFileIdIndex = group.fileIds.indexOf(fileId);
            if (groupFileIdIndex === -1) return group;
            
            const newFileIds = group.fileIds.filter((id) => id !== fileId);
            let newActiveFileId = group.activeFileId;
            
            if (group.activeFileId === fileId) {
              newActiveFileId = newFileIds[Math.max(0, groupFileIdIndex - 1)] || null;
            }
            
            return {
              ...group,
              fileIds: newFileIds,
              activeFileId: newActiveFileId,
            };
          })
        );

        setState("openFiles", (files) => files.filter((f) => f.id !== fileId));
      });
    }, 16);
  };

  const setActiveFile = (fileId: string) => {
    const containingGroup = state.groups.find((g) => g.fileIds.includes(fileId));
    
    batch(() => {
      setState("activeFileId", fileId);
      if (containingGroup) {
        setState("activeGroupId", containingGroup.id);
        setState(
          "groups",
          (g) => g.id === containingGroup.id,
          "activeFileId",
          fileId
        );
      }
    });
  };

  const updateFileContent = (fileId: string, content: string) => {
    batch(() => {
      setState(
        "openFiles",
        (f) => f.id === fileId,
        "content",
        content
      );
      setState(
        "openFiles",
        (f) => f.id === fileId,
        "modified",
        true
      );
      
      if (state.previewTab === fileId) {
        setState("previewTab", null);
      }
    });
  };

  const saveFile = async (fileId: string) => {
    const file = state.openFiles.find((f) => f.id === fileId);
    if (!file) return;

    try {
      await fsWriteFile(file.path, file.content);

      setState(
        "openFiles",
        (f) => f.id === fileId,
        "modified",
        false
      );
      
      window.dispatchEvent(
        new CustomEvent("cortex:file-saved", {
          detail: { path: file.path, fileId: file.id },
        })
      );
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  };

  const closeAllFiles = (includePinned: boolean = false) => {
    batch(() => {
      if (includePinned) {
        setState("openFiles", []);
        setState("activeFileId", null);
        setState("pinnedTabs", []);
        savePinnedTabs([]);
        setState("groups", (groups) =>
          groups.map((group) => ({
            ...group,
            fileIds: [],
            activeFileId: null,
          }))
        );
      } else {
        const pinnedSet = new Set(state.pinnedTabs);
        const remainingFiles = state.openFiles.filter((f) => pinnedSet.has(f.id));
        const remainingFileIds = remainingFiles.map((f) => f.id);
        
        setState("openFiles", remainingFiles);
        
        if (state.activeFileId && !pinnedSet.has(state.activeFileId)) {
          setState("activeFileId", remainingFileIds[0] || null);
        }
        
        setState("groups", (groups) =>
          groups.map((group) => {
            const newFileIds = group.fileIds.filter((id) => pinnedSet.has(id));
            const newActiveFileId = group.activeFileId && pinnedSet.has(group.activeFileId)
              ? group.activeFileId
              : newFileIds[0] || null;
            return {
              ...group,
              fileIds: newFileIds,
              activeFileId: newActiveFileId,
            };
          })
        );
      }
    });
  };

  return {
    openFile,
    openVirtualFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    saveFile,
    closeAllFiles,
  };
}
