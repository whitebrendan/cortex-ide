/**
 * Settings Store — Zustand-based state management for user preferences
 *
 * Manages editor and UI settings including theme, font, tab behavior, word wrap,
 * minimap, auto-save, and keybindings. Uses solid-zustand for SolidJS reactivity
 * and zustand/immer for immutable state updates.
 *
 * @module store/settings
 */

import { create } from "solid-zustand";
import { immer } from "zustand/middleware/immer";

// ============================================================================
// Types
// ============================================================================

/** Theme mode options */
export type ThemeMode = "dark" | "light" | "system" | "high-contrast" | "high-contrast-light";

/** Word wrap mode options */
export type WordWrapMode = "off" | "on" | "wordWrapColumn" | "bounded";

/** Auto-save mode options */
export type AutoSaveMode = "off" | "afterDelay" | "onFocusChange" | "onWindowChange";

/** A single keybinding entry */
export interface Keybinding {
  command: string;
  key: string;
  when?: string;
}

/** Minimap settings */
export interface MinimapStoreSettings {
  enabled: boolean;
  side: "right" | "left";
  showSlider: "always" | "mouseover";
  renderCharacters: boolean;
  maxColumn: number;
  scale: number;
}

/** Settings store state */
export interface SettingsState {
  theme: ThemeMode;
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: WordWrapMode;
  minimap: MinimapStoreSettings;
  autoSave: AutoSaveMode;
  keybindings: Keybinding[];
}

/** Settings store actions */
export interface SettingsActions {
  setTheme: (theme: ThemeMode) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setTabSize: (size: number) => void;
  setWordWrap: (mode: WordWrapMode) => void;
  setMinimap: (settings: Partial<MinimapStoreSettings>) => void;
  setAutoSave: (mode: AutoSaveMode) => void;
  updateKeybinding: (command: string, key: string, when?: string) => void;
  removeKeybinding: (command: string) => void;
  resetSettings: () => void;
}

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_MINIMAP: MinimapStoreSettings = {
  enabled: true,
  side: "right",
  showSlider: "mouseover",
  renderCharacters: false,
  maxColumn: 80,
  scale: 1,
};

const DEFAULT_SETTINGS: SettingsState = {
  theme: "dark",
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  tabSize: 2,
  wordWrap: "off",
  minimap: { ...DEFAULT_MINIMAP },
  autoSave: "off",
  keybindings: [],
};

// ============================================================================
// Store
// ============================================================================

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  immer((set: (fn: (state: SettingsState & SettingsActions) => void) => void) => ({
    ...DEFAULT_SETTINGS,

    setTheme: (theme: ThemeMode) =>
      set((state: SettingsState & SettingsActions) => {
        state.theme = theme;
      }),

    setFontSize: (size: number) =>
      set((state: SettingsState & SettingsActions) => {
        state.fontSize = Math.max(8, Math.min(72, size));
      }),

    setFontFamily: (family: string) =>
      set((state: SettingsState & SettingsActions) => {
        state.fontFamily = family;
      }),

    setTabSize: (size: number) =>
      set((state: SettingsState & SettingsActions) => {
        state.tabSize = Math.max(1, Math.min(8, size));
      }),

    setWordWrap: (mode: WordWrapMode) =>
      set((state: SettingsState & SettingsActions) => {
        state.wordWrap = mode;
      }),

    setMinimap: (settings: Partial<MinimapStoreSettings>) =>
      set((state: SettingsState & SettingsActions) => {
        if (settings.enabled !== undefined) state.minimap.enabled = settings.enabled;
        if (settings.side !== undefined) state.minimap.side = settings.side;
        if (settings.showSlider !== undefined) state.minimap.showSlider = settings.showSlider;
        if (settings.renderCharacters !== undefined) state.minimap.renderCharacters = settings.renderCharacters;
        if (settings.maxColumn !== undefined) state.minimap.maxColumn = Math.max(1, Math.min(300, settings.maxColumn));
        if (settings.scale !== undefined) state.minimap.scale = Math.max(1, Math.min(3, settings.scale));
      }),

    setAutoSave: (mode: AutoSaveMode) =>
      set((state: SettingsState & SettingsActions) => {
        state.autoSave = mode;
      }),

    updateKeybinding: (command: string, key: string, when?: string) =>
      set((state: SettingsState & SettingsActions) => {
        const existingIndex = state.keybindings.findIndex((kb: Keybinding) => kb.command === command);
        if (existingIndex !== -1) {
          state.keybindings[existingIndex].key = key;
          state.keybindings[existingIndex].when = when;
        } else {
          state.keybindings.push({ command, key, when });
        }
      }),

    removeKeybinding: (command: string) =>
      set((state: SettingsState & SettingsActions) => {
        const index = state.keybindings.findIndex((kb: Keybinding) => kb.command === command);
        if (index !== -1) {
          state.keybindings.splice(index, 1);
        }
      }),

    resetSettings: () =>
      set((state: SettingsState & SettingsActions) => {
        state.theme = DEFAULT_SETTINGS.theme;
        state.fontSize = DEFAULT_SETTINGS.fontSize;
        state.fontFamily = DEFAULT_SETTINGS.fontFamily;
        state.tabSize = DEFAULT_SETTINGS.tabSize;
        state.wordWrap = DEFAULT_SETTINGS.wordWrap;
        state.minimap = { ...DEFAULT_MINIMAP };
        state.autoSave = DEFAULT_SETTINGS.autoSave;
        state.keybindings = [...DEFAULT_SETTINGS.keybindings];
      }),
  }))
);
