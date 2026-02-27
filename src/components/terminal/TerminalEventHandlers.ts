import type { TerminalInstanceManager } from "./TerminalInstanceManager";
import type { TerminalInfo } from "@/context/TerminalsContext";
import { getPersistedSearchQuery } from "../TerminalFind";

export interface TerminalEventDeps {
  state: { showPanel: boolean; activeTerminalId: string | null };
  manager: TerminalInstanceManager;
  activeTerminal: () => TerminalInfo | undefined;
  isFocused: () => boolean;
  scrollLocked: () => boolean;
  setScrollLocked: (v: boolean) => void;
  showFindWidget: () => boolean;
  setShowFindWidget: (v: boolean) => void;
  setDialogTerminalId: (id: string | null) => void;
  setShowRenameDialog: (v: boolean) => void;
  setShowColorPicker: (v: boolean) => void;
  handleSplitHorizontal: () => void;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
}

export function createKeydownHandler(deps: TerminalEventDeps) {
  return (e: KeyboardEvent) => {
    if (!deps.state.showPanel) return;
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "f" && deps.isFocused()) { e.preventDefault(); e.stopPropagation(); deps.setShowFindWidget(true); return; }
    if (e.key === "F3" && deps.showFindWidget()) {
      e.preventDefault();
      const a = deps.activeTerminal(); const q = getPersistedSearchQuery();
      if (a && q) { const i = deps.manager.instances.get(a.id); if (i?.searchAddon) { e.shiftKey ? i.searchAddon.findPrevious(q) : i.searchAddon.findNext(q); } }
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === "L") {
      e.preventDefault(); const nl = !deps.scrollLocked(); deps.setScrollLocked(nl);
      if (!nl) { const a = deps.activeTerminal(); if (a) { const i = deps.manager.instances.get(a.id); if (i) i.terminal.scrollToBottom(); } }
      return;
    }
    if (e.ctrlKey && e.key === "l" && deps.isFocused()) { e.preventDefault(); deps.manager.clearTerminal(); }
  };
}

export function createPaneResizeHandler(deps: TerminalEventDeps) {
  return (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.terminalId) {
      const instance = deps.manager.instances.get(detail.terminalId);
      if (instance) {
        requestAnimationFrame(() => {
          instance.fitAddon.fit();
          const dims = instance.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) deps.resizeTerminal(detail.terminalId, dims.cols, dims.rows).catch(console.error);
        });
      }
    }
  };
}

export function createTerminalEventHandlers(deps: TerminalEventDeps) {
  return {
    onSplit: () => { deps.handleSplitHorizontal(); },
    onNext: () => { const a = deps.activeTerminal(); if (a) deps.manager.goToNextCommand(a.id); },
    onPrev: () => { const a = deps.activeTerminal(); if (a) deps.manager.goToPrevCommand(a.id); },
    onSelAll: () => { const a = deps.activeTerminal(); if (a) deps.manager.selectAllTerminal(a.id); },
    onRename: () => { const a = deps.activeTerminal(); if (a) { deps.setDialogTerminalId(a.id); deps.setShowRenameDialog(true); } },
    onColor: () => { const a = deps.activeTerminal(); if (a) { deps.setDialogTerminalId(a.id); deps.setShowColorPicker(true); } },
  };
}
