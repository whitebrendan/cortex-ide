/**
 * UI Store — Zustand-based state management for transient UI state
 *
 * Manages command palette visibility, context menus, notifications, and modals.
 * Uses solid-zustand for SolidJS reactivity and zustand/immer for immutable
 * state updates.
 *
 * @module store/ui
 */

import { create } from "solid-zustand";
import { immer } from "zustand/middleware/immer";

// ============================================================================
// Types
// ============================================================================

/** Context menu item */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

/** Context menu state */
export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Notification severity levels */
export type NotificationSeverity = "info" | "warning" | "error" | "success";

/** A notification entry */
export interface Notification {
  id: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: number;
  source?: string;
  actions?: Array<{ label: string; action: () => void }>;
}

/** A modal entry */
export interface Modal {
  id: string;
  title: string;
  component: string;
  props?: Record<string, unknown>;
}

/** UI store state */
export interface UIState {
  commandPaletteOpen: boolean;
  contextMenu: ContextMenuState;
  notifications: Notification[];
  modals: Modal[];
}

/** UI store actions */
export interface UIActions {
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  hideContextMenu: () => void;
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  openModal: (modal: Omit<Modal, "id">) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const MAX_NOTIFICATIONS = 50;

let notificationCounter = 0;
let modalCounter = 0;

function generateNotificationId(): string {
  return `notification-${Date.now()}-${++notificationCounter}`;
}

function generateModalId(): string {
  return `modal-${Date.now()}-${++modalCounter}`;
}

// ============================================================================
// Store
// ============================================================================

export const useUIStore = create<UIState & UIActions>()(
  immer((set: (fn: (state: UIState & UIActions) => void) => void) => ({
    commandPaletteOpen: false,
    contextMenu: {
      visible: false,
      x: 0,
      y: 0,
      items: [],
    },
    notifications: [],
    modals: [],

    openCommandPalette: () =>
      set((state: UIState & UIActions) => {
        state.commandPaletteOpen = true;
      }),

    closeCommandPalette: () =>
      set((state: UIState & UIActions) => {
        state.commandPaletteOpen = false;
      }),

    toggleCommandPalette: () =>
      set((state: UIState & UIActions) => {
        state.commandPaletteOpen = !state.commandPaletteOpen;
      }),

    showContextMenu: (x: number, y: number, items: ContextMenuItem[]) =>
      set((state: UIState & UIActions) => {
        state.contextMenu = { visible: true, x, y, items };
      }),

    hideContextMenu: () =>
      set((state: UIState & UIActions) => {
        state.contextMenu.visible = false;
        state.contextMenu.items = [];
      }),

    addNotification: (notification: Omit<Notification, "id" | "timestamp">) =>
      set((state: UIState & UIActions) => {
        state.notifications.push({
          ...notification,
          id: generateNotificationId(),
          timestamp: Date.now(),
        });
        if (state.notifications.length > MAX_NOTIFICATIONS) {
          state.notifications = state.notifications.slice(-MAX_NOTIFICATIONS);
        }
      }),

    removeNotification: (id: string) =>
      set((state: UIState & UIActions) => {
        const index = state.notifications.findIndex((n: Notification) => n.id === id);
        if (index !== -1) {
          state.notifications.splice(index, 1);
        }
      }),

    clearNotifications: () =>
      set((state: UIState & UIActions) => {
        state.notifications = [];
      }),

    openModal: (modal: Omit<Modal, "id">) =>
      set((state: UIState & UIActions) => {
        state.modals.push({
          ...modal,
          id: generateModalId(),
        });
      }),

    closeModal: (id: string) =>
      set((state: UIState & UIActions) => {
        const index = state.modals.findIndex((m: Modal) => m.id === id);
        if (index !== -1) {
          state.modals.splice(index, 1);
        }
      }),

    closeAllModals: () =>
      set((state: UIState & UIActions) => {
        state.modals = [];
      }),
  }))
);
