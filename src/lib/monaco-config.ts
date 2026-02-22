/**
 * Centralized Monaco Editor configuration.
 *
 * Provides default editor options and a helper that merges user settings
 * (from {@link EditorSettings}) into a Monaco
 * `IStandaloneEditorConstructionOptions` object.  This avoids scattering
 * the same option-building logic across multiple components.
 */

import type * as Monaco from "monaco-editor";
import type { EditorSettings } from "@/context/SettingsContext";

// ============================================================================
// Default option values
// ============================================================================

const DEFAULT_FONT_FAMILY =
  "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace";
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_LINE_HEIGHT_MULTIPLIER = 1.5;
const DEFAULT_TAB_SIZE = 2;

// ============================================================================
// Editor options builder
// ============================================================================

/**
 * Build Monaco `IStandaloneEditorConstructionOptions` from the application's
 * {@link EditorSettings}.
 *
 * The returned object is suitable for passing directly to
 * `monaco.editor.create()` or `editor.updateOptions()`.
 *
 * @param settings  Resolved editor settings (may be language-specific).
 * @param overrides Additional option overrides applied last.
 */
export function buildEditorOptions(
  settings: EditorSettings,
  overrides?: Monaco.editor.IStandaloneEditorConstructionOptions,
): Monaco.editor.IStandaloneEditorConstructionOptions {
  const fontSize = settings.fontSize ?? DEFAULT_FONT_SIZE;
  const lineHeightMultiplier =
    settings.lineHeight ?? DEFAULT_LINE_HEIGHT_MULTIPLIER;

  const options: Monaco.editor.IStandaloneEditorConstructionOptions = {
    // -- Theme / layout -------------------------------------------------------
    theme: "cortex-dark",
    automaticLayout: true,
    padding: { top: 8, bottom: 8 },

    // -- Font -----------------------------------------------------------------
    fontSize,
    lineHeight: lineHeightMultiplier * fontSize,
    fontFamily: settings.fontFamily ?? DEFAULT_FONT_FAMILY,
    fontLigatures: settings.fontLigatures ?? true,

    // -- Indentation ----------------------------------------------------------
    tabSize: settings.tabSize ?? DEFAULT_TAB_SIZE,
    insertSpaces: settings.insertSpaces ?? true,
    detectIndentation: true,
    autoIndent: settings.autoIndent ? "full" : "none",

    // -- Line numbers / gutter ------------------------------------------------
    lineNumbers: settings.lineNumbers ?? "on",
    lineNumbersMinChars: 4,
    glyphMargin: true,

    // -- Folding --------------------------------------------------------------
    folding: settings.foldingEnabled ?? true,
    foldingHighlight: true,
    foldingStrategy: "indentation",
    showFoldingControls: settings.showFoldingControls ?? "mouseover",

    // -- Minimap --------------------------------------------------------------
    minimap: {
      enabled: settings.minimapEnabled ?? true,
      autohide: "mouseover",
      side: "right",
      showSlider: "mouseover",
      renderCharacters: false,
      maxColumn: settings.minimapWidth ?? 80,
      scale: 1,
      size: "proportional",
    },

    // -- Word wrap -------------------------------------------------------------
    wordWrap: settings.wordWrap ?? "off",
    wordWrapColumn: settings.wordWrapColumn ?? 80,

    // -- Scrolling ------------------------------------------------------------
    scrollBeyondLastLine: settings.scrollBeyondLastLine ?? false,
    smoothScrolling: settings.smoothScrolling ?? true,
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      useShadows: false,
    },

    // -- Cursor ---------------------------------------------------------------
    cursorBlinking: settings.cursorBlink ?? "smooth",
    cursorSmoothCaretAnimation: "on",
    cursorStyle: settings.cursorStyle ?? "line",
    cursorWidth: 2,

    // -- Rendering ------------------------------------------------------------
    renderLineHighlight: "line",
    renderWhitespace: settings.renderWhitespace ?? "selection",
    renderControlCharacters: settings.renderControlCharacters ?? false,
    roundedSelection: true,

    // -- Brackets & guides ----------------------------------------------------
    bracketPairColorization: {
      enabled: settings.bracketPairColorization ?? true,
      independentColorPoolPerBracketType: true,
    },
    matchBrackets: "always",
    autoClosingBrackets: settings.autoClosingBrackets ?? "always",
    autoClosingQuotes: "always",
    autoClosingDelete: "always",
    autoSurround: "languageDefined",
    guides: {
      bracketPairs: settings.guidesBracketPairs ?? true,
      bracketPairsHorizontal: true,
      highlightActiveBracketPair: true,
      indentation: settings.guidesIndentation ?? true,
      highlightActiveIndentation: true,
    },

    // -- Linked editing -------------------------------------------------------
    linkedEditing: settings.linkedEditing ?? true,

    // -- Multi-cursor ---------------------------------------------------------
    multiCursorModifier: "alt",
    multiCursorMergeOverlapping: true,
    columnSelection: false,

    // -- Drag & drop / clipboard ----------------------------------------------
    dragAndDrop: true,
    copyWithSyntaxHighlighting: true,

    // -- Highlights -----------------------------------------------------------
    occurrencesHighlight: "singleFile",
    selectionHighlight: true,

    // -- Find -----------------------------------------------------------------
    find: {
      addExtraSpaceOnTop: false,
      seedSearchStringFromSelection: "selection",
      autoFindInSelection: "multiline",
    },

    // -- Suggestions ----------------------------------------------------------
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: "on",

    // -- Misc -----------------------------------------------------------------
    links: true,
    contextmenu: true,
    formatOnType: settings.formatOnType ?? false,

    // -- Sticky scroll --------------------------------------------------------
    stickyScroll: {
      enabled: settings.stickyScrollEnabled ?? false,
      maxLineCount: settings.stickyScrollMaxLines ?? 5,
    },

    // -- Inlay hints ----------------------------------------------------------
    inlayHints: {
      enabled: settings.inlayHints?.enabled ? "on" : "off",
      fontSize: settings.inlayHints?.fontSize ?? 12,
      fontFamily:
        settings.inlayHints?.fontFamily ||
        "'JetBrains Mono', 'Fira Code', monospace",
      padding: settings.inlayHints?.padding ?? true,
    },

    // -- Code lens -------------------------------------------------------------
    codeLens: settings.codeLens?.enabled ?? true,
    codeLensFontFamily: settings.codeLens?.fontFamily || undefined,
    codeLensFontSize: settings.codeLens?.fontSize || 12,

    // -- Smart select ---------------------------------------------------------
    smartSelect: {
      selectLeadingAndTrailingWhitespace: false,
      selectSubwords: true,
    },

    // -- Unicode highlight ----------------------------------------------------
    unicodeHighlight: {
      ambiguousCharacters:
        settings.unicodeHighlight?.ambiguousCharacters ?? true,
      invisibleCharacters:
        settings.unicodeHighlight?.invisibleCharacters ?? true,
      nonBasicASCII: settings.unicodeHighlight?.nonBasicASCII ?? false,
      includeComments:
        settings.unicodeHighlight?.includeComments ?? "inUntrustedWorkspace",
      includeStrings: settings.unicodeHighlight?.includeStrings ?? true,
      allowedCharacters: (settings.unicodeHighlight?.allowedCharacters ??
        {}) as Record<string, true>,
      allowedLocales: (settings.unicodeHighlight?.allowedLocales ?? {
        _os: true,
        _vscode: true,
      }) as Record<string, true>,
    },

    // -- Performance ----------------------------------------------------------
    largeFileOptimizations: settings.largeFileOptimizations ?? true,
    maxTokenizationLineLength: settings.maxTokenizationLineLength ?? 20000,
  };

  if (overrides) {
    return { ...options, ...overrides };
  }

  return options;
}

// ============================================================================
// Diff editor options
// ============================================================================

/**
 * Build options for a Monaco *diff* editor.
 *
 * @param settings  Resolved editor settings.
 * @param overrides Additional option overrides applied last.
 */
export function buildDiffEditorOptions(
  settings: EditorSettings,
  overrides?: Monaco.editor.IDiffEditorConstructionOptions,
): Monaco.editor.IDiffEditorConstructionOptions {
  const fontSize = settings.fontSize ?? DEFAULT_FONT_SIZE;
  const lineHeightMultiplier =
    settings.lineHeight ?? DEFAULT_LINE_HEIGHT_MULTIPLIER;

  const options: Monaco.editor.IDiffEditorConstructionOptions = {
    automaticLayout: true,
    fontSize,
    lineHeight: lineHeightMultiplier * fontSize,
    fontFamily: settings.fontFamily ?? DEFAULT_FONT_FAMILY,
    fontLigatures: settings.fontLigatures ?? true,
    readOnly: false,
    renderSideBySide: true,
    enableSplitViewResizing: true,
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    originalEditable: false,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      useShadows: false,
    },
  };

  if (overrides) {
    return { ...options, ...overrides };
  }

  return options;
}
