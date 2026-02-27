import { Show, createSignal, createEffect, onMount, onCleanup, createMemo, type JSX } from "solid-js";
import { useTerminals, TerminalInfo } from "@/context/TerminalsContext";
import { useEditor } from "@/context/EditorContext";
import { useSettings } from "@/context/SettingsContext";
import { useAccessibility } from "@/context/AccessibilityContext";
import "@xterm/xterm/css/xterm.css";
import { loadStylesheet } from "@/utils/lazyStyles";
loadStylesheet("terminal");
import { useTerminalSuggestions } from "./TerminalSuggest";
import type { CommandDecoration, DecorationAction } from "./terminal/TerminalDecorations";
import { TerminalSplitView } from "./terminal/TerminalSplitView";
import { useTerminalSplits } from "./terminal/useTerminalSplits";
import { TerminalInstanceManager, loadWebglAddon } from "./terminal/TerminalInstanceManager";
import { TerminalPanelOverlays } from "./terminal/TerminalPanelOverlays";
import { handleSuggestionSelect } from "./terminal/TerminalSuggestionHandler";
import { DEFAULT_PANEL_HEIGHT, WINDOW_RESIZE_DEBOUNCE_MS, createDebouncedResize } from "./terminal/TerminalPanelTypes";
import { TERMINAL_STYLES } from "./terminal/TerminalStyles";
import { createKeydownHandler, createPaneResizeHandler, createTerminalEventHandlers } from "./terminal/TerminalEventHandlers";
import { type StickyScrollSettings } from "./TerminalStickyScroll";

export function TerminalPanel() {
  const {
    state, writeToTerminal, updateTerminalInfo, resizeTerminal, subscribeToOutput,
    renameTerminal, setTerminalColor, getTerminalName, getTerminalColor,
    createTerminal, setActiveTerminal, closeTerminal,
  } = useTerminals();

  const editor = useEditor();
  const settings = useSettings();
  const terminalSettings = () => settings.effectiveSettings().terminal;
  const accessibility = useAccessibility();

  const splits = useTerminalSplits({
    terminals: () => state.terminals,
    activeTerminalId: () => state.activeTerminalId,
    onActiveChange: (id) => { if (id) setActiveTerminal(id); },
    enableKeyboardShortcuts: false,
  });

  const activeSplitGroup = createMemo(() => {
    const activeId = state.activeTerminalId;
    if (!activeId) return null;
    const group = splits.getGroupForTerminal(activeId);
    if (!group || group.terminalIds.length <= 1) return null;
    return group;
  });

  const hasSplits = () => activeSplitGroup() !== null;

  const handleSplitHorizontal = async () => {
    const activeId = state.activeTerminalId;
    if (!activeId) return;
    const newTerm = await createTerminal();
    splits.splitTerminal(activeId, "horizontal", newTerm.id);
    setActiveTerminal(newTerm.id);
  };

  const handleSplitVertical = async () => {
    const activeId = state.activeTerminalId;
    if (!activeId) return;
    const newTerm = await createTerminal();
    splits.splitTerminal(activeId, "vertical", newTerm.id);
    setActiveTerminal(newTerm.id);
  };

  const handleCloseSplitTerminal = async (terminalId: string) => {
    splits.closeSplitPane(terminalId);
    await closeTerminal(terminalId);
  };

  const handleFitTerminals = (terminalIds: string[]) => {
    for (const tid of terminalIds) {
      const instance = manager.instances.get(tid);
      if (instance) {
        requestAnimationFrame(() => {
          instance.fitAddon.fit();
          const dims = instance.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) resizeTerminal(tid, dims.cols, dims.rows).catch(console.error);
        });
      }
    }
  };

  let ariaLiveRegion: HTMLDivElement | undefined;
  const [panelHeight] = createSignal(DEFAULT_PANEL_HEIGHT);
  const [isFocused] = createSignal(false);
  const [scrollLocked, setScrollLocked] = createSignal(false);
  const [showFindWidget, setShowFindWidget] = createSignal(false);
  const [showRenameDialog, setShowRenameDialog] = createSignal(false);
  const [showColorPicker, setShowColorPicker] = createSignal(false);
  const [dialogTerminalId, setDialogTerminalId] = createSignal<string | null>(null);
  const [isEmbedded, setIsEmbedded] = createSignal(false);

  const decorationSettings = () => terminalSettings().decorations ?? { enabled: true, showDuration: true, showExitCode: true };
  const suggestions = useTerminalSuggestions({ enabled: true, debounceMs: 50 });
  const activeTerminal = createMemo(() => state.terminals.find(t => t.id === state.activeTerminalId));

  const announceToScreenReader = (message: string, assertive: boolean = false) => {
    const ts = terminalSettings();
    if (!ts.screenReaderAnnounce) return;
    if (accessibility.screenReaderMode()) {
      accessibility.announceToScreenReader(message, assertive ? "assertive" : "polite");
      return;
    }
    if (ariaLiveRegion) {
      ariaLiveRegion.setAttribute("aria-live", assertive ? "assertive" : "polite");
      ariaLiveRegion.textContent = "";
      requestAnimationFrame(() => { if (ariaLiveRegion) ariaLiveRegion.textContent = message; });
    }
  };

  const manager = new TerminalInstanceManager({
    state, writeToTerminal, updateTerminalInfo, resizeTerminal, subscribeToOutput,
    terminalSettings, openFile: (path: string) => editor.openFile(path), announceToScreenReader,
    suggestions: {
      setCurrentInput: suggestions.setCurrentInput, closeSuggestions: suggestions.closeSuggestions,
      addToHistory: suggestions.addToHistory, setCursorPosition: suggestions.setCursorPosition,
    },
    stickyScrollSettings: { enabled: true, maxCommands: 5 } as StickyScrollSettings,
    quickFixEnabled: () => true, scrollLocked, setScrollLocked, decorationSettings,
  });

  let windowResizeDebouncer: ReturnType<typeof createDebouncedResize> | null = null;

  const renderSplitTerminalPane = (terminal: TerminalInfo, _isActive: boolean): JSX.Element => {
    return (
      <div
        data-terminal-split-pane={terminal.id}
        style={{ width: "100%", height: "100%" }}
        ref={(el) => {
          if (!el) return;
          requestAnimationFrame(() => {
            const instance = manager.instances.get(terminal.id);
            if (instance) {
              instance.terminal.open(el);
              requestAnimationFrame(() => {
                instance.fitAddon.fit();
                if (state.activeTerminalId === terminal.id) instance.terminal.focus();
              });
            } else {
              manager.initializeTerminalInContainer(terminal, el);
            }
          });
        }}
      />
    );
  };

  createEffect(() => { manager.cleanupStaleInstances(state.terminals.map(t => t.id)); });
  createEffect(() => { terminalSettings(); manager.updateTerminalAppearance(); });

  onMount(async () => {
    const el = document.querySelector('[data-terminal-embed="true"]') as HTMLDivElement;
    if (el) { setIsEmbedded(true); manager.terminalContainerRef = el; }
    loadWebglAddon().catch(() => {});
  });

  onMount(() => {
    const check = () => {
      const el = document.querySelector('[data-terminal-embed="true"]') as HTMLDivElement;
      if (el) {
        if (manager.terminalContainerRef !== el) {
          manager.terminalContainerRef = el; setIsEmbedded(true);
          state.terminals.forEach(t => {
            const d = document.querySelector(`[data-terminal-id="${t.id}"]`) as HTMLDivElement;
            if (d && d.parentElement !== el) { el.appendChild(d); const i = manager.instances.get(t.id); if (i) requestAnimationFrame(() => { i.fitAddon.fit(); i.terminal.focus(); }); }
            else if (!d) manager.initializeTerminal(t);
          });
        }
      } else if (isEmbedded()) {
        setIsEmbedded(false); manager.terminalContainerRef = undefined;
        manager.instances.forEach((_, id) => { document.querySelector(`[data-terminal-id="${id}"]`)?.remove(); });
      }
    };
    const iv = setInterval(check, 50);
    onCleanup(() => clearInterval(iv));
  });

  createEffect(() => {
    const active = activeTerminal(); const terms = state.terminals || [];
    const eff = active || (terms.length > 0 ? terms[0] : null);
    if (!eff) return;
    if (hasSplits()) {
      const group = activeSplitGroup();
      if (group) {
        for (const tid of group.terminalIds) {
          const tInfo = state.terminals.find(t => t.id === tid);
          if (tInfo && !manager.instances.has(tid)) manager.initializeTerminal(tInfo);
        }
      }
      return;
    }
    if (isEmbedded() && !manager.terminalContainerRef) {
      const el = document.querySelector('[data-terminal-embed="true"]') as HTMLDivElement;
      if (el) manager.terminalContainerRef = el;
    }
    if (!manager.terminalContainerRef) return;
    if (!manager.instances.has(eff.id)) manager.initializeTerminal(eff);
    manager.instances.forEach((_, tid) => {
      const c = manager.terminalContainerRef?.querySelector(`[data-terminal-id="${tid}"]`) as HTMLElement;
      if (c) c.style.display = tid === eff.id ? "block" : "none";
    });
    const inst = manager.instances.get(eff.id);
    if (inst) requestAnimationFrame(() => { inst.fitAddon.fit(); inst.terminal.focus(); });
  });

  createEffect(() => {
    panelHeight(); const active = activeTerminal(); const terms = state.terminals || [];
    const eff = active || (terms.length > 0 ? terms[0] : null);
    if (!eff) return;
    const inst = manager.instances.get(eff.id);
    if (inst) requestAnimationFrame(() => inst.fitAddon.fit());
  });

  onMount(() => {
    const eventDeps = { state, manager, activeTerminal, isFocused, scrollLocked, setScrollLocked, showFindWidget, setShowFindWidget, setDialogTerminalId, setShowRenameDialog, setShowColorPicker, handleSplitHorizontal, resizeTerminal };
    const onKey = createKeydownHandler(eventDeps);
    const onPaneResize = createPaneResizeHandler(eventDeps);
    const { onSplit, onNext, onPrev, onSelAll, onRename, onColor } = createTerminalEventHandlers(eventDeps);
    window.addEventListener("keydown", onKey);
    window.addEventListener("terminal:split-current", onSplit);
    window.addEventListener("terminal:go-to-next-command", onNext);
    window.addEventListener("terminal:go-to-prev-command", onPrev);
    window.addEventListener("terminal:select-all", onSelAll);
    window.addEventListener("terminal:show-rename-dialog", onRename);
    window.addEventListener("terminal:show-color-picker", onColor);
    window.addEventListener("terminal:pane-resize", onPaneResize);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey); window.removeEventListener("terminal:split-current", onSplit);
      window.removeEventListener("terminal:go-to-next-command", onNext); window.removeEventListener("terminal:go-to-prev-command", onPrev);
      window.removeEventListener("terminal:select-all", onSelAll); window.removeEventListener("terminal:show-rename-dialog", onRename);
      window.removeEventListener("terminal:show-color-picker", onColor); window.removeEventListener("terminal:pane-resize", onPaneResize);
      manager.disposeAll(); windowResizeDebouncer?.cancel();
    });
  });

  onMount(() => {
    windowResizeDebouncer = createDebouncedResize(() => {
      const a = activeTerminal(); if (a) { const i = manager.instances.get(a.id); if (i) i.fitAddon.fit(); }
    }, WINDOW_RESIZE_DEBOUNCE_MS);
    const onResize = () => { windowResizeDebouncer?.call(); };
    window.addEventListener("resize", onResize);
    onCleanup(() => { window.removeEventListener("resize", onResize); windowResizeDebouncer?.cancel(); });
  });

  const activeDecorations = createMemo((): CommandDecoration[] => {
    const id = state.activeTerminalId; if (!id) return [];
    const d = manager.terminalDecorations.get(id); return d ? d.decorations() : [];
  });

  const scrollState = createMemo(() => {
    const id = state.activeTerminalId;
    if (!id) return { scrollOffset: 0, lineHeight: 18, visibleLines: 50 };
    const inst = manager.instances.get(id);
    if (!inst) return { scrollOffset: 0, lineHeight: 18, visibleLines: 50 };
    const buf = inst.terminal.buffer.active;
    return { scrollOffset: buf.viewportY, lineHeight: Math.round(inst.terminal.options.fontSize || 14) * (inst.terminal.options.lineHeight || 1.2), visibleLines: inst.terminal.rows };
  });

  const onDecAction = async (dec: CommandDecoration, action: DecorationAction) => {
    const id = state.activeTerminalId; if (!id) return;
    if (action === "copy-command") await navigator.clipboard.writeText(dec.command);
    else if (action === "copy-output" && dec.output) await navigator.clipboard.writeText(dec.output);
    else if (action === "rerun") await writeToTerminal(id, dec.command + "\r");
    else if (action === "show-output" && dec.output) await navigator.clipboard.writeText(dec.output);
  };

  return (
    <>
      <TerminalPanelOverlays
        ariaLiveRef={(el) => { ariaLiveRegion = el; }}
        splitToolbar={{ onSplitHorizontal: handleSplitHorizontal, onSplitVertical: handleSplitVertical, showToolbar: !!activeTerminal() }}
        suggest={{ visible: suggestions.showSuggestions(), input: suggestions.currentInput(), cursorPosition: suggestions.cursorPosition(), onSelect: (s) => handleSuggestionSelect(s, activeTerminal()?.id, manager, writeToTerminal, suggestions.closeSuggestions), onClose: suggestions.closeSuggestions, context: suggestions.context() }}
        decorations={{ enabled: decorationSettings().enabled, activeTerminal: !!activeTerminal(), terminalId: state.activeTerminalId || "", decorations: activeDecorations(), onDecorationClick: onDecAction, showDuration: decorationSettings().showDuration, showExitCode: decorationSettings().showExitCode, lineHeight: scrollState().lineHeight, scrollOffset: scrollState().scrollOffset, visibleLines: scrollState().visibleLines }}
        renameDialog={{ open: showRenameDialog(), currentName: getTerminalName(dialogTerminalId() || "") || "Terminal", onRename: (name) => { const id = dialogTerminalId(); if (id) renameTerminal(id, name); setShowRenameDialog(false); setDialogTerminalId(null); }, onCancel: () => { setShowRenameDialog(false); setDialogTerminalId(null); } }}
        colorPicker={{ open: showColorPicker(), currentColor: getTerminalColor(dialogTerminalId() || ""), onColorSelect: (color) => { const id = dialogTerminalId(); if (id && color) setTerminalColor(id, color); setShowColorPicker(false); setDialogTerminalId(null); }, onCancel: () => { setShowColorPicker(false); setDialogTerminalId(null); } }}
      />
      <Show when={hasSplits() && activeSplitGroup()}>
        {(group) => (
          <div data-terminal-split-container style={{ position: "absolute", top: "0", left: "0", right: "0", bottom: "0", "z-index": "40" }}>
            <TerminalSplitView
              group={{ id: group().id, terminalIds: group().terminalIds, direction: group().direction, ratios: group().ratios }}
              terminals={state.terminals} activeTerminalId={state.activeTerminalId}
              onSelectTerminal={setActiveTerminal}
              onCloseTerminal={handleCloseSplitTerminal}
              onSplitRatioChange={(groupId, index, ratio) => splits.updateSplitRatio(groupId, index, ratio)}
              onFitTerminals={handleFitTerminals}
              minPaneSize={100} showHeaders={true} renderTerminal={renderSplitTerminalPane}
            />
          </div>
        )}
      </Show>
      <style>{TERMINAL_STYLES}</style>
    </>
  );
}
