/**
 * Workspace Store — Zustand-based state management for workspace layout and files
 *
 * Manages the active project, open files, sidebar/panel visibility and sizing,
 * activity bar selection, and active panel tab. Uses solid-zustand for SolidJS
 * reactivity and zustand/immer for immutable state updates.
 *
 * @module store/workspace
 */

import { create } from "solid-zustand";
import { immer } from "zustand/middleware/immer";
import type { CursorPosition, Selection } from "@/types/editor";

// ============================================================================
// Types
// ============================================================================

/** State for a single open file in the editor */
export interface FileState {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  modified: boolean;
  cursorPosition?: CursorPosition;
  cursors?: CursorPosition[];
  selections?: Selection[];
}

/** Active panel tab identifiers */
export type PanelId =
  | "terminal"
  | "output"
  | "problems"
  | "debug-console"
  | "ports"
  | "comments"
  | "gitlens";

/** Activity bar item identifiers */
export type ActivityBarItem =
  | "explorer"
  | "search"
  | "git"
  | "debug"
  | "extensions"
  | "testing"
  | "remote"
  | "accounts"
  | "settings";

/** Workspace store state */
export interface WorkspaceState {
  activeProject: string | null;
  openFiles: Record<string, FileState>;
  activeFileId: string | null;
  sidebarWidth: number;
  sidebarVisible: boolean;
  panelHeight: number;
  panelVisible: boolean;
  activePanel: PanelId;
  activityBarSelection: ActivityBarItem;
}

/** Workspace store actions */
export interface WorkspaceActions {
  setActiveProject: (path: string | null) => void;
  openFile: (file: FileState) => void;
  closeFile: (fileId: string) => void;
  setActiveFile: (fileId: string | null) => void;
  updateFileContent: (fileId: string, content: string) => void;
  setFileModified: (fileId: string, modified: boolean) => void;
  updateFileCursor: (fileId: string, position: CursorPosition) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setPanelHeight: (height: number) => void;
  togglePanel: () => void;
  setPanelVisible: (visible: boolean) => void;
  setActivePanel: (panel: PanelId) => void;
  setActivityBarSelection: (item: ActivityBarItem) => void;
}

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_SIDEBAR_WIDTH = 260;
const DEFAULT_PANEL_HEIGHT = 200;

// ============================================================================
// Store
// ============================================================================

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  immer((set: (fn: (state: WorkspaceState & WorkspaceActions) => void) => void) => ({
    activeProject: null,
    openFiles: {},
    activeFileId: null,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    sidebarVisible: true,
    panelHeight: DEFAULT_PANEL_HEIGHT,
    panelVisible: false,
    activePanel: "terminal",
    activityBarSelection: "explorer",

    setActiveProject: (path: string | null) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.activeProject = path;
      }),

    openFile: (file: FileState) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.openFiles[file.id] = file;
        state.activeFileId = file.id;
      }),

    closeFile: (fileId: string) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        delete state.openFiles[fileId];
        if (state.activeFileId === fileId) {
          const remaining = Object.keys(state.openFiles);
          state.activeFileId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
      }),

    setActiveFile: (fileId: string | null) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.activeFileId = fileId;
      }),

    updateFileContent: (fileId: string, content: string) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        const file = state.openFiles[fileId];
        if (file) {
          file.content = content;
          file.modified = true;
        }
      }),

    setFileModified: (fileId: string, modified: boolean) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        const file = state.openFiles[fileId];
        if (file) {
          file.modified = modified;
        }
      }),

    updateFileCursor: (fileId: string, position: CursorPosition) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        const file = state.openFiles[fileId];
        if (file) {
          file.cursorPosition = position;
        }
      }),

    setSidebarWidth: (width: number) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.sidebarWidth = Math.max(150, Math.min(600, width));
      }),

    toggleSidebar: () =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.sidebarVisible = !state.sidebarVisible;
      }),

    setSidebarVisible: (visible: boolean) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.sidebarVisible = visible;
      }),

    setPanelHeight: (height: number) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.panelHeight = Math.max(100, Math.min(800, height));
      }),

    togglePanel: () =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.panelVisible = !state.panelVisible;
      }),

    setPanelVisible: (visible: boolean) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.panelVisible = visible;
      }),

    setActivePanel: (panel: PanelId) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.activePanel = panel;
        if (!state.panelVisible) {
          state.panelVisible = true;
        }
      }),

    setActivityBarSelection: (item: ActivityBarItem) =>
      set((state: WorkspaceState & WorkspaceActions) => {
        state.activityBarSelection = item;
        if (!state.sidebarVisible) {
          state.sidebarVisible = true;
        }
      }),
  }))
);
