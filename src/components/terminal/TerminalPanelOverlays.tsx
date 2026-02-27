import { Show } from "solid-js";
import { TerminalSuggest, type Suggestion, type SuggestionContext } from "../TerminalSuggest";
import { TerminalDecorations, type CommandDecoration, type DecorationAction } from "./TerminalDecorations";
import { TerminalRenameDialog } from "./TerminalRenameDialog";
import { TerminalColorPicker } from "./TerminalColorPicker";
import { SplitButton } from "./TerminalSplitView";

export interface TerminalPanelOverlaysProps {
  ariaLiveRef: (el: HTMLDivElement) => void;
  splitToolbar: {
    onSplitHorizontal: () => void;
    onSplitVertical: () => void;
    showToolbar: boolean;
  };
  suggest: {
    visible: boolean;
    input: string;
    cursorPosition: { x: number; y: number };
    onSelect: (s: Suggestion) => void;
    onClose: () => void;
    context: SuggestionContext;
  };
  decorations: {
    enabled: boolean;
    activeTerminal: boolean;
    terminalId: string;
    decorations: CommandDecoration[];
    onDecorationClick: (d: CommandDecoration, a: DecorationAction) => void;
    showDuration: boolean;
    showExitCode: boolean;
    lineHeight: number;
    scrollOffset: number;
    visibleLines: number;
  };
  renameDialog: {
    open: boolean;
    currentName: string;
    onRename: (name: string) => void;
    onCancel: () => void;
  };
  colorPicker: {
    open: boolean;
    currentColor: string | null;
    onColorSelect: (color: string | null) => void;
    onCancel: () => void;
  };
}

export function TerminalPanelOverlays(props: TerminalPanelOverlaysProps) {
  return (
    <>
      <div
        ref={props.ariaLiveRef}
        aria-live="polite"
        aria-atomic="true"
        role="status"
        class="sr-only"
        style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", "white-space": "nowrap", border: "0" }}
      />

      <TerminalSuggest
        visible={props.suggest.visible}
        input={props.suggest.input}
        cursorPosition={props.suggest.cursorPosition}
        onSelect={props.suggest.onSelect}
        onClose={props.suggest.onClose}
        context={props.suggest.context}
        maxSuggestions={10}
      />

      <Show when={props.decorations.enabled && props.decorations.activeTerminal}>
        <TerminalDecorations
          terminalId={props.decorations.terminalId}
          decorations={props.decorations.decorations}
          onDecorationClick={props.decorations.onDecorationClick}
          enabled={props.decorations.enabled}
          showDuration={props.decorations.showDuration}
          showExitCode={props.decorations.showExitCode}
          lineHeight={props.decorations.lineHeight}
          scrollOffset={props.decorations.scrollOffset}
          visibleLines={props.decorations.visibleLines}
        />
      </Show>

      <TerminalRenameDialog
        open={props.renameDialog.open}
        currentName={props.renameDialog.currentName}
        onRename={props.renameDialog.onRename}
        onCancel={props.renameDialog.onCancel}
      />

      <TerminalColorPicker
        open={props.colorPicker.open}
        currentColor={props.colorPicker.currentColor}
        onColorSelect={props.colorPicker.onColorSelect}
        onCancel={props.colorPicker.onCancel}
      />

      <Show when={props.splitToolbar.showToolbar}>
        <div
          data-terminal-split-toolbar
          style={{
            position: "absolute",
            top: "0",
            right: "0",
            "z-index": "50",
            display: "flex",
            "align-items": "center",
            gap: "4px",
            padding: "0 8px",
            height: "28px",
            "pointer-events": "auto",
          }}
        >
          <SplitButton
            onSplitHorizontal={props.splitToolbar.onSplitHorizontal}
            onSplitVertical={props.splitToolbar.onSplitVertical}
          />
        </div>
      </Show>
    </>
  );
}
