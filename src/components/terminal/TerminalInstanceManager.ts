/**
 * Terminal Instance Manager
 *
 * Encapsulates terminal lifecycle: creation, xterm initialization, event handling,
 * command markers, decorations, sticky scroll, and cleanup.
 */

import type { TerminalInfo } from "@/context/TerminalsContext";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { getTerminalTheme, getTerminalThemeFromCSS } from "@/lib/terminalThemes";
import { useTerminalDecorations } from "./TerminalDecorations";
import { useTerminalCommandTracker, type StickyScrollSettings, type CommandTrackerResult } from "../TerminalStickyScroll";
import { OutputStreamProcessor } from "./OutputStreamProcessor";
import { FilePathLinkProvider } from "./FilePathLinkProvider";
import {
  type TerminalInstance,
  type CommandMarker,
  type CommandMarkerState,
  SCROLLBACK_LINES,
  OUTPUT_CHUNK_SIZE,
  formatCommandDuration,
} from "./TerminalPanelTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let webglAddonModule: { WebglAddon: new () => any } | null = null;
let webglLoadAttempted = false;

export const loadWebglAddon = async (): Promise<boolean> => {
  if (webglLoadAttempted) return webglAddonModule !== null;
  webglLoadAttempted = true;
  try {
    const modulePath = "@xterm/addon-webgl";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webglAddonModule = await (import(/* @vite-ignore */ modulePath) as Promise<any>);
    return true;
  } catch {
    console.warn("[Terminal] WebGL addon not available, using canvas renderer");
    return false;
  }
};

export interface TerminalManagerConfig {
  state: { terminals: TerminalInfo[]; activeTerminalId: string | null; showPanel: boolean };
  writeToTerminal: (id: string, data: string) => Promise<void>;
  updateTerminalInfo: (id: string, info: Partial<TerminalInfo>) => Promise<void>;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
  subscribeToOutput: (cb: (output: { terminal_id: string; data: string }) => void) => () => void;
  terminalSettings: () => {
    colorScheme?: string;
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    cursorBlink?: boolean;
    cursorStyle?: string;
    scrollback?: number;
    wordSeparators?: string;
    accessibleViewEnabled?: boolean;
    screenReaderAnnounce?: boolean;
    bell?: string;
    decorations?: { enabled: boolean; showDuration: boolean; showExitCode: boolean };
  };
  openFile: (path: string) => Promise<void>;
  announceToScreenReader: (message: string, assertive?: boolean) => void;
  suggestions: {
    setCurrentInput: (input: string) => void;
    closeSuggestions: () => void;
    addToHistory: (cmd: string) => void;
    setCursorPosition: (pos: { x: number; y: number }) => void;
  };
  stickyScrollSettings: StickyScrollSettings;
  quickFixEnabled: () => boolean;
  scrollLocked: () => boolean;
  setScrollLocked: (v: boolean) => void;
  decorationSettings: () => { enabled: boolean; showDuration: boolean; showExitCode: boolean };
}

export class TerminalInstanceManager {
  readonly instances = new Map<string, TerminalInstance>();
  readonly terminalDecorations = new Map<string, ReturnType<typeof useTerminalDecorations>>();
  private readonly outputProcessors = new Map<string, OutputStreamProcessor>();
  private readonly stickyScrollTrackers = new Map<string, CommandTrackerResult>();
  private readonly inputBuffers = new Map<string, string>();
  private readonly terminalOutputs = new Map<string, string>();
  terminalContainerRef: HTMLDivElement | undefined;

  private config: TerminalManagerConfig;

  constructor(config: TerminalManagerConfig) {
    this.config = config;
  }

  getInputBuffer(terminalId: string): string {
    return this.inputBuffers.get(terminalId) || "";
  }

  setInputBufferValue(terminalId: string, value: string): void {
    this.inputBuffers.set(terminalId, value);
  }

  cleanupStaleInstances(activeIds: string[]): void {
    const activeSet = new Set(activeIds);
    for (const [id, instance] of this.instances) {
      if (!activeSet.has(id)) {
        instance.unsubscribe();
        if (instance.scrollHandler && instance.viewportElement) {
          instance.viewportElement.removeEventListener("scroll", instance.scrollHandler);
          instance.scrollHandler = null;
          instance.viewportElement = null;
        }
        if (instance.resizeObserver) {
          instance.resizeObserver.disconnect();
          instance.resizeObserver = null;
        }
        if (instance.webglAddon && typeof (instance.webglAddon as { dispose?: () => void }).dispose === 'function') {
          try { (instance.webglAddon as { dispose: () => void }).dispose(); } catch { /* already disposed */ }
        }
        instance.outputBuffer.length = 0;
        instance.terminal?.dispose?.();
        this.instances.delete(id);

        const processor = this.outputProcessors.get(id);
        if (processor) { processor.dispose(); this.outputProcessors.delete(id); }
        this.stickyScrollTrackers.delete(id);
        this.terminalDecorations.delete(id);
        this.inputBuffers.delete(id);
        this.terminalOutputs.delete(id);
      }
    }
  }

  updateTerminalAppearance(): void {
    const ts = this.config.terminalSettings();
    const colorScheme = ts.colorScheme || "default-dark";
    const selectedTheme = colorScheme === "auto" || colorScheme.startsWith("default")
      ? getTerminalThemeFromCSS()
      : getTerminalTheme(colorScheme);

    this.instances.forEach((instance) => {
      const term = instance.terminal;
      term.options.theme = selectedTheme;
      term.options.fontFamily = ts.fontFamily;
      term.options.fontSize = ts.fontSize;
      term.options.lineHeight = ts.lineHeight;
      term.options.cursorBlink = ts.cursorBlink;
      term.options.cursorStyle = ts.cursorStyle === "bar" ? "bar" : ts.cursorStyle === "underline" ? "underline" : "block";
      term.options.wordSeparator = ts.wordSeparators || " ()[]{}',\"`─''";
      term.options.screenReaderMode = ts.accessibleViewEnabled;
      requestAnimationFrame(() => { instance.fitAddon.fit(); });
    });
  }

  clearTerminal(): void {
    const activeId = this.config.state.activeTerminalId;
    if (!activeId) return;
    const instance = this.instances.get(activeId);
    if (instance) {
      instance.terminal.clear();
      instance.outputBuffer.length = 0;
    }
  }

  selectAllTerminal(terminalId: string): void {
    const instance = this.instances.get(terminalId);
    if (instance?.terminal) instance.terminal.selectAll();
  }

  goToNextCommand(terminalId: string): void {
    const instance = this.instances.get(terminalId);
    if (!instance) return;
    const markers = instance.commandMarkers.markers;
    if (markers.length === 0) return;
    const currentLine = instance.terminal.buffer.active.viewportY;
    const nextMarker = markers.find(m => m.line > currentLine);
    if (nextMarker) {
      instance.terminal.scrollToLine(nextMarker.line);
      this.highlightMarker(nextMarker);
    } else if (markers.length > 0) {
      instance.terminal.scrollToLine(markers[0].line);
      this.highlightMarker(markers[0]);
    }
  }

  goToPrevCommand(terminalId: string): void {
    const instance = this.instances.get(terminalId);
    if (!instance) return;
    const markers = [...instance.commandMarkers.markers].reverse();
    if (markers.length === 0) return;
    const currentLine = instance.terminal.buffer.active.viewportY;
    const prevMarker = markers.find(m => m.line < currentLine);
    if (prevMarker) {
      instance.terminal.scrollToLine(prevMarker.line);
      this.highlightMarker(prevMarker);
    } else if (markers.length > 0) {
      const lastMarker = instance.commandMarkers.markers[instance.commandMarkers.markers.length - 1];
      instance.terminal.scrollToLine(lastMarker.line);
      this.highlightMarker(lastMarker);
    }
  }

  private highlightMarker(marker: CommandMarker): void {
    if (!marker.decoration?.element) return;
    const element = marker.decoration.element;
    element.classList.add('command-marker-highlight');
    setTimeout(() => { element.classList.remove('command-marker-highlight'); }, 600);
  }

  private getStickyScrollTracker(terminalId: string): CommandTrackerResult {
    let tracker = this.stickyScrollTrackers.get(terminalId);
    if (!tracker) {
      tracker = useTerminalCommandTracker({
        maxCommands: 50,
        enabled: this.config.stickyScrollSettings.enabled,
      });
      this.stickyScrollTrackers.set(terminalId, tracker);
    }
    return tracker;
  }

  private formatCommandTooltip(marker: CommandMarker): string {
    const lines: string[] = [];
    if (marker.command) lines.push(`Command: ${marker.command}`);
    lines.push(`Status: ${marker.status}`);
    if (marker.exitCode !== undefined) lines.push(`Exit Code: ${marker.exitCode}`);
    const durationStr = formatCommandDuration(marker.startTime, marker.endTime);
    if (durationStr) lines.push(`Duration: ${durationStr}`);
    else if (marker.startTime && marker.status === 'running') lines.push('Running...');
    return lines.join('\n');
  }

  initializeTerminal(terminalInfo: TerminalInfo): void {
    if (!this.terminalContainerRef) return;

    const existingInstance = this.instances.get(terminalInfo.id);
    let container = this.terminalContainerRef.querySelector(`[data-terminal-id="${terminalInfo.id}"]`) as HTMLDivElement | null;

    if (!container) {
      container = document.createElement("div");
      container.setAttribute("data-terminal-id", terminalInfo.id);
      container.style.width = "100%";
      container.style.height = "100%";
      this.terminalContainerRef.appendChild(container);
    }

    container.style.display = terminalInfo.id === this.config.state.activeTerminalId ? "block" : "none";

    if (existingInstance) {
      existingInstance.terminal.open(container);
      requestAnimationFrame(() => { existingInstance.fitAddon.fit(); });
      return;
    }

    const ts = this.config.terminalSettings();
    const colorScheme = ts.colorScheme || "default-dark";
    const selectedTheme = colorScheme === "auto" || colorScheme.startsWith("default")
      ? getTerminalThemeFromCSS()
      : getTerminalTheme(colorScheme);

    const terminal = new XTerm({
      cursorBlink: ts.cursorBlink,
      cursorStyle: ts.cursorStyle === "bar" ? "bar" : ts.cursorStyle === "underline" ? "underline" : "block",
      fontSize: ts.fontSize,
      fontFamily: ts.fontFamily,
      lineHeight: ts.lineHeight,
      letterSpacing: 0,
      theme: selectedTheme,
      allowProposedApi: true,
      scrollback: ts.scrollback || SCROLLBACK_LINES,
      tabStopWidth: 4,
      convertEol: false,
      screenReaderMode: ts.accessibleViewEnabled,
      smoothScrollDuration: 0,
      wordSeparator: ts.wordSeparators || " ()[]{}',\"`─''",
      scrollSensitivity: 1,
      cursorInactiveStyle: "none",
      rescaleOverlappingGlyphs: true,
      drawBoldTextInBrightColors: false,
    });

    terminal.onBell(() => {
      const bellSetting = this.config.terminalSettings()?.bell ?? "none";
      if (bellSetting === "audible") {
        try {
          const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = 800;
          oscillator.type = "sine";
          gainNode.gain.value = 0.1;
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
          console.warn("[Terminal] Failed to play bell sound:", e);
        }
      } else if (bellSetting === "visual") {
        if (container) {
          container.classList.add("terminal-visual-bell");
          setTimeout(() => { container.classList.remove("terminal-visual-bell"); }, 150);
        }
      }
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const unicode11Addon = new Unicode11Addon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, "_blank");
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    const filePathLinkProvider = new FilePathLinkProvider(
      terminal,
      async (path: string, line?: number, column?: number) => {
        try {
          await this.config.openFile(path);
          if (line !== undefined) {
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("editor:goto-line", {
                  detail: { line, column: column || 1 },
                })
              );
            }, 100);
          }
        } catch (err) {
          console.error("[Terminal] Failed to open file:", path, err);
        }
      }
    );
    terminal.registerLinkProvider(filePathLinkProvider);

    const commandMarkersState: CommandMarkerState = {
      markers: [],
      currentMarker: undefined,
    };

    const decorationsManager = useTerminalDecorations({ maxDecorations: 100 });
    this.terminalDecorations.set(terminalInfo.id, decorationsManager);

    let pendingCommandLine: string | null = null;
    let currentDecorationId: string | null = null;
    let currentCwd: string | undefined = undefined;

    terminal.parser.registerOscHandler(633, (data) => {
      const parts = data.split(";");
      const type = parts[0];

      switch (type) {
        case "A":
          this.config.updateTerminalInfo(terminalInfo.id, { command_running: false }).catch(console.error);
          break;
        case "B":
          break;
        case "C": {
          this.config.updateTerminalInfo(terminalInfo.id, { command_running: true }).catch(console.error);
          const cursorLine = terminal.buffer.active.cursorY + terminal.buffer.active.baseY;
          const newMarker: CommandMarker = {
            line: cursorLine,
            status: 'running',
            startTime: Date.now(),
          };
          newMarker.marker = terminal.registerMarker(0);
          commandMarkersState.currentMarker = newMarker;
          commandMarkersState.markers.push(newMarker);

          if (commandMarkersState.markers.length > 100) {
            const removedMarker = commandMarkersState.markers.shift();
            if (removedMarker?.decoration) removedMarker.decoration.dispose();
            if (removedMarker?.marker && !removedMarker.marker.isDisposed) removedMarker.marker.dispose();
          }

          if (this.config.decorationSettings().enabled && pendingCommandLine) {
            currentDecorationId = decorationsManager.startCommand(
              cursorLine,
              pendingCommandLine,
              currentCwd
            );
            pendingCommandLine = null;
          }
          break;
        }
        case "D": {
          const exitCode = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
          const validExitCode = exitCode !== undefined && !isNaN(exitCode) ? exitCode : undefined;

          if (validExitCode !== undefined) {
            this.config.updateTerminalInfo(terminalInfo.id, {
              last_exit_code: validExitCode,
              command_running: false
            }).catch(console.error);
          } else {
            this.config.updateTerminalInfo(terminalInfo.id, { command_running: false }).catch(console.error);
          }

          if (commandMarkersState.currentMarker) {
            const marker = commandMarkersState.currentMarker;
            marker.endTime = Date.now();
            marker.exitCode = validExitCode;
            marker.status = validExitCode === 0 ? 'success' : 'error';

            if (ts.screenReaderAnnounce) {
              const durationStr = formatCommandDuration(marker.startTime, marker.endTime) ?? "unknown time";
              const commandName = marker.command ? `"${marker.command}"` : "Command";
              const statusMsg = marker.status === 'success'
                ? `${commandName} completed successfully in ${durationStr}`
                : `${commandName} failed with exit code ${validExitCode} after ${durationStr}`;
              this.config.announceToScreenReader(statusMsg, marker.status === 'error');
            }

            commandMarkersState.currentMarker = undefined;
          }

          if (currentDecorationId && this.config.decorationSettings().enabled) {
            decorationsManager.endCommand(currentDecorationId, validExitCode ?? 0);
            currentDecorationId = null;
          }
          break;
        }
        case "E":
          if (parts.length > 1) {
            const command = parts[1];
            this.config.updateTerminalInfo(terminalInfo.id, { last_command: command }).catch(console.error);
            pendingCommandLine = command;
            if (commandMarkersState.currentMarker) {
              commandMarkersState.currentMarker.command = command;
              if (commandMarkersState.currentMarker.decoration?.element) {
                commandMarkersState.currentMarker.decoration.element.title =
                  this.formatCommandTooltip(commandMarkersState.currentMarker);
                commandMarkersState.currentMarker.decoration.element.setAttribute('data-command', command);
              }
            }
          }
          break;
        case "P":
          if (parts.length > 1) {
            const property = parts[1];
            if (property.startsWith("Cwd=")) {
              const cwd = property.substring(4);
              currentCwd = cwd;
              this.config.updateTerminalInfo(terminalInfo.id, { cwd }).catch(console.error);
            }
          }
          break;
      }
      return true;
    });

    terminal.open(container);

    const isWindows = navigator.platform.toLowerCase().includes("win");
    if (isWindows) {
      let buildNumber = 19041;
      const match = navigator.userAgent.match(/Windows NT (\d+)\.(\d+)(?:\.(\d+))?/);
      if (match && match[3]) {
        buildNumber = parseInt(match[3], 10);
      } else {
        const osMatch = navigator.userAgent.match(/Windows NT \d+\.\d+/);
        if (osMatch) buildNumber = 22000;
      }
      terminal.options.windowsPty = { backend: 'conpty', buildNumber };
      terminal.parser.registerCsiHandler({ final: 'c' }, (params) => {
        if (params.length === 0 || (params.length === 1 && params[0] === 0)) {
          this.config.writeToTerminal(terminalInfo.id, '\x1b[?61;4c').catch(() => {});
          return true;
        }
        return false;
      });
    }

    let webglAddon: unknown = null;
    if (webglAddonModule) {
      try {
        webglAddon = new webglAddonModule.WebglAddon();
        terminal.loadAddon(webglAddon as Parameters<typeof terminal.loadAddon>[0]);
      } catch (e) {
        console.warn("[Terminal] Failed to enable WebGL renderer:", e);
        webglAddon = null;
      }
    }

    terminal.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowUp' && e.type === 'keydown') {
        this.goToPrevCommand(terminalInfo.id);
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'ArrowDown' && e.type === 'keydown') {
        this.goToNextCommand(terminalInfo.id);
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'a' && e.type === 'keydown') {
        terminal.selectAll();
        return false;
      }
      return true;
    });

    requestAnimationFrame(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        this.config.resizeTerminal(terminalInfo.id, dims.cols, dims.rows).catch(console.error);
      }
      terminal.write(`\x1b[1;34m[Cortex Terminal]\x1b[0m Connected to ${terminalInfo.shell}\r\n`);
      setTimeout(() => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddon.fit();
          const dims2 = fitAddon.proposeDimensions();
          if (dims2 && dims2.cols > 0 && dims2.rows > 0) {
            this.config.resizeTerminal(terminalInfo.id, dims2.cols, dims2.rows).catch(console.error);
          }
        }
      }, 100);
    });

    const outputProcessor = new OutputStreamProcessor(OUTPUT_CHUNK_SIZE);
    this.outputProcessors.set(terminalInfo.id, outputProcessor);

    terminal.onData((data) => {
      this.config.writeToTerminal(terminalInfo.id, data).catch(console.error);

      requestAnimationFrame(() => {
        const currentBuffer = this.inputBuffers.get(terminalInfo.id) || "";

        if (data === "\r" || data === "\n") {
          if (currentBuffer.trim()) this.config.suggestions.addToHistory(currentBuffer.trim());
          this.inputBuffers.set(terminalInfo.id, "");
          this.config.suggestions.closeSuggestions();
        } else if (data === "\x7f" || data === "\b") {
          const newBuffer = currentBuffer.slice(0, -1);
          this.inputBuffers.set(terminalInfo.id, newBuffer);
          this.config.suggestions.setCurrentInput(newBuffer);
        } else if (data === "\x03" || data === "\x15") {
          this.inputBuffers.set(terminalInfo.id, "");
          this.config.suggestions.closeSuggestions();
        } else if (data === "\t") {
          // Tab handled by suggestions
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
          const newBuffer = currentBuffer + data;
          this.inputBuffers.set(terminalInfo.id, newBuffer);
          this.config.suggestions.setCurrentInput(newBuffer);
          this.updateCursorPosition(terminalInfo.id);
        } else if (data.length > 1) {
          const newBuffer = currentBuffer + data;
          this.inputBuffers.set(terminalInfo.id, newBuffer);
          this.config.suggestions.setCurrentInput(newBuffer);
        }
      });
    });

    terminal.onBinary((data) => {
      this.config.writeToTerminal(terminalInfo.id, data).catch(console.error);
    });

    terminal.onResize(({ cols, rows }) => {
      this.config.resizeTerminal(terminalInfo.id, cols, rows).catch(console.error);
    });

    let isTerminalDisposed = false;

    const unsubscribe = this.config.subscribeToOutput((output) => {
      if (isTerminalDisposed) return;

      if (output.terminal_id === terminalInfo.id) {
        try {
          if (isTerminalDisposed) return;
          if (!terminal.element) { isTerminalDisposed = true; return; }
          if (terminal.element.classList.contains('disposed')) { isTerminalDisposed = true; return; }
          const instance = this.instances.get(terminalInfo.id);
          if (!instance) { isTerminalDisposed = true; return; }

          terminal.write(output.data);
        } catch (e) {
          isTerminalDisposed = true;
          console.debug(`[Terminal] Stream write failed for ${terminalInfo.id}:`, e);
          return;
        }

        if (this.config.quickFixEnabled() || this.config.stickyScrollSettings.enabled) {
          requestAnimationFrame(() => {
            if (isTerminalDisposed || !this.instances.has(terminalInfo.id)) return;

            if (this.config.quickFixEnabled()) {
              const prev = this.terminalOutputs.get(terminalInfo.id) || "";
              const newOutput = prev + output.data;
              this.terminalOutputs.set(terminalInfo.id, newOutput.length > 50000 ? newOutput.slice(-50000) : newOutput);
            }

            if (this.config.stickyScrollSettings.enabled) {
              try {
                const lines = output.data.split(/\r?\n/);
                const baseLineNumber = terminal.buffer.active.baseY + terminal.buffer.active.cursorY;
                lines.forEach((line, index) => {
                  if (line.trim()) {
                    const tracker = this.getStickyScrollTracker(terminalInfo.id);
                    tracker.processLine(baseLineNumber + index, line);
                  }
                });
              } catch (bufferError) {
                console.debug(`[Terminal] Buffer access failed for ${terminalInfo.id}:`, bufferError);
              }
            }
          });
        }
      }
    });

    const viewport = container.querySelector(".xterm-viewport") as HTMLElement;
    let scrollHandler: (() => void) | null = null;
    if (viewport) {
      scrollHandler = () => {
        const isAtBottom = Math.abs(
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        ) < 5;

        if (isAtBottom && this.config.scrollLocked()) {
          this.config.setScrollLocked(false);
        }

        if (this.config.stickyScrollSettings.enabled) {
          try {
            void terminal.buffer.active.viewportY;
            void terminal.buffer.active.length;
          } catch { /* terminal may be disposed */ }
        }
      };
      viewport.addEventListener("scroll", scrollHandler);
    }

    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (container.style.display !== 'none' &&
          container.offsetParent !== null &&
          container.offsetWidth > 0 &&
          container.offsetHeight > 0) {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          this.config.resizeTerminal(terminalInfo.id, dims.cols, dims.rows).catch(console.error);
        }
      }
    };

    resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => { handleResize(); }, 16);
    });

    resizeObserver.observe(container);
    if (this.terminalContainerRef) {
      resizeObserver.observe(this.terminalContainerRef);
    }

    this.instances.set(terminalInfo.id, {
      terminal,
      fitAddon,
      searchAddon,
      webglAddon,
      unsubscribe,
      outputBuffer: [],
      commandMarkers: commandMarkersState,
      scrollHandler,
      viewportElement: viewport,
      resizeObserver,
      containerElement: container,
      decorations: decorationsManager,
      currentDecorationId: null,
    });
  }

  /**
   * Initialize a terminal directly into a provided container element.
   * Used by split view panes where the container is managed by TerminalSplitView.
   */
  initializeTerminalInContainer(terminalInfo: TerminalInfo, container: HTMLElement): void {
    const savedRef = this.terminalContainerRef;
    this.terminalContainerRef = container.parentElement as HTMLDivElement || container as HTMLDivElement;
    this.initializeTerminal(terminalInfo);
    this.terminalContainerRef = savedRef;
  }

  private updateCursorPosition(terminalId: string): void {
    const instance = this.instances.get(terminalId);
    if (!instance || !this.terminalContainerRef) return;

    const terminal = instance.terminal;
    const cursorX = terminal.buffer.active.cursorX;
    const cursorY = terminal.buffer.active.cursorY;

    const container = this.terminalContainerRef.querySelector(`[data-terminal-id="${terminalId}"]`) as HTMLElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cellWidth = terminal.options.fontSize ? terminal.options.fontSize * 0.6 : 8;
    const cellHeight = terminal.options.fontSize ? terminal.options.fontSize * 1.2 : 16;

    const x = rect.left + cursorX * cellWidth + 8;
    const y = rect.top + cursorY * cellHeight + 8;

    this.config.suggestions.setCursorPosition({ x, y });
  }

  disposeAll(): void {
    this.instances.forEach((instance) => {
      instance.unsubscribe();
      if (instance.scrollHandler && instance.viewportElement) {
        instance.viewportElement.removeEventListener("scroll", instance.scrollHandler);
        instance.scrollHandler = null;
        instance.viewportElement = null;
      }
      if (instance.resizeObserver) {
        instance.resizeObserver.disconnect();
        instance.resizeObserver = null;
      }
      if (instance.webglAddon && typeof (instance.webglAddon as { dispose?: () => void }).dispose === 'function') {
        try { (instance.webglAddon as { dispose: () => void }).dispose(); } catch { /* ignore */ }
      }
      instance.outputBuffer.length = 0;
      instance.terminal?.dispose?.();
    });
    this.instances.clear();
    this.outputProcessors.forEach((p) => p.dispose());
    this.outputProcessors.clear();
    this.stickyScrollTrackers.clear();
    this.terminalDecorations.clear();
    this.inputBuffers.clear();
    this.terminalOutputs.clear();
  }
}
