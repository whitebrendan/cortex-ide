/**
 * Terminal Panel Types, Constants, and Utilities
 *
 * Shared types and helpers extracted from TerminalPanel for use across
 * terminal modules (TerminalInstanceManager, OutputStreamProcessor, etc.).
 */

import type { IMarker, IDecoration } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { useTerminalDecorations } from "./TerminalDecorations";

export const DEFAULT_PANEL_HEIGHT = 280;
export const SCROLLBACK_LINES = 10000;
export const WINDOW_RESIZE_DEBOUNCE_MS = 150;
export const OUTPUT_CHUNK_SIZE = 16384;
export const OUTPUT_FLUSH_DEBOUNCE_MS = 8;
export const ACK_BATCH_SIZE = 32768;

export interface CommandMarker {
  line: number;
  status: 'running' | 'success' | 'error';
  exitCode?: number;
  command?: string;
  startTime?: number;
  endTime?: number;
  marker?: IMarker;
  decoration?: IDecoration;
}

export interface CommandMarkerState {
  markers: CommandMarker[];
  currentMarker?: CommandMarker;
}

export interface TerminalInstance {
  terminal: XTerm;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  webglAddon: unknown | null;
  unsubscribe: () => void;
  outputBuffer: string[];
  commandMarkers: CommandMarkerState;
  scrollHandler?: (() => void) | null;
  viewportElement?: HTMLElement | null;
  resizeObserver?: ResizeObserver | null;
  containerElement?: HTMLElement | null;
  decorations?: ReturnType<typeof useTerminalDecorations>;
  currentDecorationId?: string | null;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  terminalId: string | null;
}

export type ShellType = "powershell" | "bash" | "zsh" | "cmd" | "fish" | "sh" | "unknown";

export interface ShellProfile {
  name: string;
  shell: string;
  icon: ShellType;
  args?: string[];
}

/**
 * Safely format duration from start and end timestamps.
 * Handles undefined/null values gracefully for robust Tauri integration.
 */
export function formatCommandDuration(startTime: number | undefined, endTime: number | undefined): string | null {
  if (startTime === undefined || endTime === undefined) return null;
  if (startTime <= 0 || endTime <= 0) return null;

  const duration = endTime - startTime;
  if (duration < 0) return null;

  if (duration < 1000) {
    return `${duration}ms`;
  } else if (duration < 60000) {
    return `${(duration / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(duration / 60000);
    const seconds = ((duration % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Create debounced function for window resize handling
 */
export function createDebouncedResize(
  callback: () => void,
  delay: number
): { call: () => void; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    call: () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback();
        timeoutId = null;
      }, delay);
    },
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}
