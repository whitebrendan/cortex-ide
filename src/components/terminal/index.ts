/**
 * Terminal Components - Public API
 *
 * Exports all terminal-related components and hooks for split views and management.
 */

// Split view components
export {
  TerminalSplitView,
  SplitButton,
  type SplitDirection,
  type TerminalSplitGroup,
  type TerminalSplitViewProps,
} from "./TerminalSplitView";

// Split state management
export {
  useTerminalSplits,
  type TerminalSplitState,
  type UseTerminalSplitsOptions,
  type UseTerminalSplitsReturn,
} from "./useTerminalSplits";

// Integrated split panel
export {
  TerminalSplitPanel,
  type TerminalSplitPanelProps,
} from "./TerminalSplitPanel";

// Terminal decorations (command status in gutter)
export {
  TerminalDecorations,
  useTerminalDecorations,
  getDecorationStatus,
  formatDuration,
  truncateOutput,
  type CommandDecoration,
  type TerminalDecorationsProps,
  type DecorationAction,
  type DecorationStatus,
  type UseTerminalDecorationsOptions,
  type UseTerminalDecorationsReturn,
} from "./TerminalDecorations";

// Auto-reply functionality
export {
  AutoReplyManager,
  DEFAULT_AUTO_REPLIES,
  AUTO_REPLY_STORAGE_KEY,
  type AutoReplyRule,
} from "./TerminalAutoReplies";

// Kill process on port
export {
  KillPortDialog,
  type PortProcess,
} from "./KillPortDialog";

// Terminal tools commands registration
export {
  TerminalToolsCommands,
  openKillPortDialog,
  closeKillPortDialog,
  openKillPortDialogWithScan,
  openAutoRepliesDialog,
  closeAutoRepliesDialog,
} from "./TerminalToolsCommands";

// Terminal image rendering (iTerm2/Sixel/Kitty protocols)
export {
  TerminalImageRenderer,
  type TerminalImageRendererProps,
} from "./TerminalImageRenderer";

// Terminal rename dialog
export {
  TerminalRenameDialog,
  type TerminalRenameDialogProps,
} from "./TerminalRenameDialog";

// Terminal color picker
export {
  TerminalColorPicker,
  PRESET_COLORS,
  type TerminalColorPickerProps,
} from "./TerminalColorPicker";

// Terminal xterm.js wrapper component
export {
  Terminal,
  loadWebglAddon,
  type TerminalProps,
  type TerminalSettings as TerminalComponentSettings,
  type TerminalCallbacks,
  type TerminalHandle,
} from "./Terminal";

// Terminal link provider (URL, file path, error location detection)
export {
  useTerminalLinkProvider,
  detectLinks,
  handleLinkClick,
  createXtermLinkProvider,
  type TerminalLink,
  type LinkProviderOptions,
  type UseTerminalLinkProviderReturn,
} from "./TerminalLinkProvider";

// Terminal panel types and utilities
export {
  DEFAULT_PANEL_HEIGHT,
  SCROLLBACK_LINES,
  WINDOW_RESIZE_DEBOUNCE_MS,
  OUTPUT_CHUNK_SIZE,
  OUTPUT_FLUSH_DEBOUNCE_MS,
  ACK_BATCH_SIZE,
  formatCommandDuration,
  createDebouncedResize,
  type CommandMarker,
  type CommandMarkerState,
  type TerminalInstance,
  type ContextMenuState,
  type ShellType,
  type ShellProfile,
} from "./TerminalPanelTypes";

// Output stream processor
export { OutputStreamProcessor } from "./OutputStreamProcessor";

// File path link provider
export { FilePathLinkProvider } from "./FilePathLinkProvider";

// Terminal instance manager
export {
  TerminalInstanceManager,
  loadWebglAddon as loadWebglAddonFromManager,
  type TerminalManagerConfig,
} from "./TerminalInstanceManager";

// Terminal suggestion handler
export { handleSuggestionSelect } from "./TerminalSuggestionHandler";

// Terminal panel overlays
export {
  TerminalPanelOverlays,
  type TerminalPanelOverlaysProps,
} from "./TerminalPanelOverlays";

// Terminal styles
export { TERMINAL_STYLES } from "./TerminalStyles";

// Terminal event handlers
export {
  createKeydownHandler,
  createPaneResizeHandler,
  createTerminalEventHandlers,
  type TerminalEventDeps,
} from "./TerminalEventHandlers";

// Terminal quick fix (inline error suggestions)
export {
  TerminalQuickFixContainer,
  TerminalQuickFix,
  useTerminalQuickFixes,
  detectQuickFixes,
  type QuickFixType,
  type QuickFixAction,
  type QuickFix,
  type TerminalQuickFixProps,
  type TerminalQuickFixContainerProps,
  type QuickFixIndicatorProps,
  type QuickFixMenuProps,
  type UseTerminalQuickFixesOptions,
  type UseTerminalQuickFixesReturn,
} from "./TerminalQuickFix";
