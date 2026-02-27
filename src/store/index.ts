/**
 * Store barrel exports
 *
 * Re-exports all Zustand stores and their associated types for convenient
 * single-import access throughout the application.
 *
 * @module store
 */

// ============================================================================
// Workspace Store
// ============================================================================

export {
  useWorkspaceStore,
  type FileState,
  type PanelId,
  type ActivityBarItem,
  type WorkspaceState,
  type WorkspaceActions,
} from "./workspace";

// ============================================================================
// Settings Store
// ============================================================================

export {
  useSettingsStore,
  type ThemeMode,
  type WordWrapMode,
  type AutoSaveMode,
  type Keybinding,
  type MinimapStoreSettings,
  type SettingsState,
  type SettingsActions,
} from "./settings";

// ============================================================================
// UI Store
// ============================================================================

export {
  useUIStore,
  type ContextMenuItem,
  type ContextMenuState,
  type NotificationSeverity,
  type Notification,
  type Modal,
  type UIState,
  type UIActions,
} from "./ui";
