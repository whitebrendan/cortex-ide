import { createSignal, onMount, onCleanup } from "solid-js";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { useNavigate, useLocation } from "@solidjs/router";

import { useEditor } from "@/context/editor/EditorProvider";
import { useSDK } from "@/context/SDKContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DestructiveActionDialog } from "@/components/ui/DestructiveActionDialog";
import { fsWriteFile } from "@/utils/tauri-api";
import { createLogger } from "@/utils/logger";
import { openUntitledSurface, openWorkspaceSurface } from "@/utils/workingSurface";

const logger = createLogger("FileEditHandlers");

let _monacoMgr: typeof import("@/utils/monacoManager") | null = null;

function getActiveMonacoEditor() {
  if (!_monacoMgr) {
    import("@/utils/monacoManager").then(m => { _monacoMgr = m; });
    return null;
  }
  const monaco = _monacoMgr.MonacoManager.getInstance().getMonacoOrNull();
  if (!monaco) return null;
  const editors = monaco.editor.getEditors();
  for (const ed of editors) {
    if (ed.hasTextFocus()) return ed;
  }
  return editors[0] ?? null;
}

export function FileEditHandlers() {
  const editor = useEditor();
  const sdk = useSDK();
  const navigate = useNavigate();
  const location = useLocation();
  const [dirtyCloseState, setDirtyCloseState] = createSignal<{ fileId: string; fileName: string } | null>(null);
  const [reloadState, setReloadState] = createSignal<{ fileId: string; fileName: string } | null>(null);

  const getFileById = (fileId: string) => editor.state.openFiles.find((file) => file.id === fileId);
  const getFileByPath = (path: string) => editor.state.openFiles.find((file) => file.path === path);

  const requestFileClose = (fileId: string) => {
    const file = getFileById(fileId);
    if (!file) return;

    if (file.modified) {
      setDirtyCloseState({ fileId: file.id, fileName: file.name });
      return;
    }

    editor.closeFile(fileId);
  };

  const performReload = async (fileId: string) => {
    const reloaded = await editor.reloadFile(fileId);
    if (reloaded) {
      setReloadState(null);
    }
  };

  const requestFileReload = (fileId: string) => {
    const file = getFileById(fileId);
    if (!file || !file.path || file.path.startsWith("virtual://")) {
      return;
    }

    if (file.modified) {
      setReloadState({ fileId: file.id, fileName: file.name });
      return;
    }

    void performReload(fileId);
  };

  const handleSaveAndClose = async () => {
    const state = dirtyCloseState();
    if (!state) return;

    await editor.saveFile(state.fileId);

    const file = getFileById(state.fileId);
    if (file && !file.modified) {
      editor.closeFile(state.fileId);
      setDirtyCloseState(null);
    }
  };

  const handleDontSave = () => {
    const state = dirtyCloseState();
    if (!state) return;

    editor.closeFile(state.fileId);
    setDirtyCloseState(null);
  };

  onMount(() => {
    const handlers: Record<string, EventListener> = {
      "file:new": (() => {
        openUntitledSurface({
          pathname: location.pathname,
          navigate,
          openVirtualFile: editor.openVirtualFile,
        });
      }) as EventListener,

      "file:open": (() => {
        if ((window as any).__fileOpenPending) return;
        (window as any).__fileOpenPending = true;
        openDialog({
          directory: false,
          multiple: false,
          title: "Open File",
        }).then((selected) => {
          if (selected) editor.openFile(selected as string);
        }).catch((e) => {
          logger.error("Failed to open file:", e);
        }).finally(() => {
          (window as any).__fileOpenPending = false;
        });
      }) as EventListener,

      "file:save": (() => {
        const id = editor.state.activeFileId;
        if (id) editor.saveFile(id);
      }) as EventListener,

      "file:save-as": (async () => {
        try {
          const file = editor.state.openFiles.find(
            (f) => f.id === editor.state.activeFileId,
          );
          if (!file) return;

          const selected = await saveDialog({
            title: "Save As",
            defaultPath: file.name,
          });
          if (!selected) return;

          await fsWriteFile(selected, file.content);
          editor.openFile(selected);
        } catch (e) {
          logger.error("Failed to save file as:", e);
        }
      }) as EventListener,

      "file:save-all": (() => {
        editor.state.openFiles.forEach((f) => {
          if (f.modified) editor.saveFile(f.id);
        });
      }) as EventListener,

      "file:close": (() => {
        const id = editor.state.activeFileId;
        if (id) requestFileClose(id);
      }) as EventListener,

      "file:revert": (() => {
        const id = editor.state.activeFileId;
        if (id) requestFileReload(id);
      }) as EventListener,

      "file:reload-request": ((event: CustomEvent<{ path?: string }>) => {
        const path = event.detail?.path;
        if (!path) return;
        const file = getFileByPath(path);
        if (file) {
          void performReload(file.id);
        }
      }) as unknown as EventListener,

      "folder:open": (() => {
        if ((window as any).__folderOpenPending) return;
        (window as any).__folderOpenPending = true;
        openDialog({
          directory: true,
          multiple: false,
          title: "Open Folder",
        }).then((selected) => {
          if (selected) {
            const path = selected as string;
            sdk.updateConfig({ cwd: path });
            openWorkspaceSurface(path, {
              pathname: location.pathname,
              navigate,
            });
          }
        }).catch((e) => {
          logger.error("Failed to open folder:", e);
        }).finally(() => {
          (window as any).__folderOpenPending = false;
        });
      }) as EventListener,

      "folder:close": (() => {
        sdk.updateConfig({ cwd: "." });
      }) as EventListener,

      "window:new": (async () => {
        try {
          await invoke("create_new_window", {});
        } catch (e) {
          logger.error("Failed to create new window:", e);
        }
      }) as EventListener,

      "edit:undo": (() => {
        const ed = getActiveMonacoEditor();
        if (ed) {
          ed.trigger("menu", "undo", null);
        } else {
          document.execCommand("undo");
        }
      }) as EventListener,

      "edit:redo": (() => {
        const ed = getActiveMonacoEditor();
        if (ed) {
          ed.trigger("menu", "redo", null);
        } else {
          document.execCommand("redo");
        }
      }) as EventListener,

      "edit:cut": (() => {
        const ed = getActiveMonacoEditor();
        if (ed) {
          ed.trigger("menu", "editor.action.clipboardCutAction", null);
        } else {
          document.execCommand("cut");
        }
      }) as EventListener,

      "edit:copy": (() => {
        const ed = getActiveMonacoEditor();
        if (ed) {
          ed.trigger("menu", "editor.action.clipboardCopyAction", null);
        } else {
          document.execCommand("copy");
        }
      }) as EventListener,

      "edit:paste": (() => {
        document.execCommand("paste");
      }) as EventListener,

      "edit:find": (() => {
        const ed = getActiveMonacoEditor();
        if (ed) ed.trigger("menu", "actions.find", null);
      }) as EventListener,

      "edit:replace": (() => {
        const ed = getActiveMonacoEditor();
        if (ed)
          ed.trigger("menu", "editor.action.startFindReplaceAction", null);
      }) as EventListener,
    };

    for (const [ev, fn] of Object.entries(handlers)) {
      window.addEventListener(ev, fn);
    }

    onCleanup(() => {
      for (const [ev, fn] of Object.entries(handlers)) {
        window.removeEventListener(ev, fn);
      }
    });
  });

  return (
    <>
      <ConfirmDialog
        open={dirtyCloseState() !== null}
        fileName={dirtyCloseState()?.fileName ?? ""}
        onSave={handleSaveAndClose}
        onDontSave={handleDontSave}
        onCancel={() => setDirtyCloseState(null)}
      />

      <DestructiveActionDialog
        open={reloadState() !== null}
        title="Reload File from Disk"
        message={
          <>
            Reload <strong>{reloadState()?.fileName}</strong> from disk and discard your unsaved changes?
          </>
        }
        detail="Your editor contents will be replaced with the version currently on disk."
        confirmLabel="Reload"
        onConfirm={() => {
          const state = reloadState();
          if (state) {
            void performReload(state.fileId);
          }
        }}
        onCancel={() => setReloadState(null)}
      />
    </>
  );
}

export default FileEditHandlers;
