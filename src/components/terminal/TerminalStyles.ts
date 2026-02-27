/**
 * Terminal CSS styles injected as a <style> block.
 * Extracted from TerminalPanel to keep it under 300 lines.
 */
export const TERMINAL_STYLES = `
.xterm { height: 100%; padding-left: var(--terminal-gutter-padding, 20px); user-select: none; -webkit-user-select: none; cursor: text; }
.xterm .xterm-screen { cursor: text; z-index: 31; }
.xterm .xterm-scrollable-element { margin-left: calc(-1 * var(--terminal-gutter-padding, 20px)); padding-left: var(--terminal-gutter-padding, 20px); }
.xterm-viewport { overflow-y: auto !important; z-index: 30; }
.xterm-viewport::-webkit-scrollbar { width: 8px; }
.xterm-viewport::-webkit-scrollbar-track { background: transparent; }
.xterm-viewport::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, var(--jb-scrollbar-thumb)); border-radius: var(--cortex-radius-sm); }
.xterm-viewport::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground, var(--jb-scrollbar-thumb-hover)); }
.xterm-viewport::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground, var(--jb-scrollbar-thumb-active)); }
.xterm.enable-mouse-events, .xterm.enable-mouse-events .xterm-screen { cursor: default; }
.xterm.xterm-cursor-pointer, .xterm .xterm-cursor-pointer { cursor: pointer !important; }
.xterm.column-select.focus, .xterm.column-select.focus .xterm-screen { cursor: crosshair; }
.terminal-groups-container.alt-active .xterm { cursor: default; }
.xterm .xterm-scrollable-element > .visible { opacity: 1; background: transparent; transition: opacity 100ms linear; z-index: 11; }
.xterm .xterm-scrollable-element > .invisible { opacity: 0; pointer-events: none; }
.xterm .xterm-scrollable-element > .invisible.fade { transition: opacity 800ms linear; }
.xterm-underline-1 { text-decoration: underline; } .xterm-underline-2 { text-decoration: double underline; }
.xterm-underline-3 { text-decoration: wavy underline; } .xterm-underline-4 { text-decoration: dotted underline; }
.xterm-underline-5 { text-decoration: dashed underline; } .xterm-overline { text-decoration: overline; }
.xterm-strikethrough { text-decoration: line-through; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }
.cortex-terminal-panel.high-contrast .xterm.focus::before, .cortex-terminal-panel.high-contrast .xterm:focus::before {
  display: block; content: ""; border: 1px solid var(--vscode-contrastActiveBorder, var(--cortex-warning));
  position: absolute; left: 0; top: 0; right: 0; bottom: 0; z-index: 32; pointer-events: none;
}
.xterm-find-active-result-decoration { outline-style: solid !important; outline-width: 2px !important; z-index: 7 !important; }
.high-contrast .xterm-find-result-decoration { outline-style: solid !important; }
`;
