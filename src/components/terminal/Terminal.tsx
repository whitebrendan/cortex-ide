/**
 * =============================================================================
 * TERMINAL - xterm.js wrapper component
 * =============================================================================
 *
 * Wraps xterm.js with Cortex IDE integration:
 * - Cortex IDE theme colors via terminalThemes
 * - FitAddon for responsive resizing
 * - WebLinksAddon for clickable URLs
 * - SearchAddon for in-terminal search
 * - Font matching editor settings
 * - PTY output streaming via Tauri events
 * - Terminal lifecycle cleanup
 *
 * Usage:
 *   <Terminal
 *     terminalInfo={info}
 *     isVisible={true}
 *     onReady={(instance) => { ... }}
 *     onDisposed={(id) => { ... }}
 *   />
 * =============================================================================
 */

import { onMount, onCleanup } from "solid-js";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import type { ILinkProvider, ILink, IBufferRange } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { tokens } from "@/design-system/tokens";
import type { TerminalInfo } from "@/types/terminal";

// =============================================================================
// TYPES
// =============================================================================

/** Terminal settings for appearance and behavior */
export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorBlink: boolean;
  cursorStyle: "block" | "bar" | "underline";
  scrollback?: number;
  wordSeparators?: string;
  accessibleViewEnabled?: boolean;
  bell?: "none" | "audible" | "visual";
  screenReaderAnnounce?: boolean;
}

/** Callbacks for terminal lifecycle events */
export interface TerminalCallbacks {
  onData: (terminalId: string, data: string) => void;
  onBinary: (terminalId: string, data: string) => void;
  onResize: (terminalId: string, cols: number, rows: number) => void;
  onOpenFile?: (path: string, line?: number, column?: number) => void;
}

/** xterm.js instance handle exposed to parent */
export interface TerminalHandle {
  terminal: XTerm;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  webglAddon: unknown | null;
  fit: () => void;
  focus: () => void;
  clear: () => void;
  selectAll: () => void;
  write: (data: string) => void;
  dispose: () => void;
}

export interface TerminalProps {
  terminalInfo: TerminalInfo;
  theme: ITheme;
  settings: TerminalSettings;
  callbacks: TerminalCallbacks;
  isVisible: boolean;
  onReady?: (handle: TerminalHandle) => void;
  onDisposed?: (terminalId: string) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_SCROLLBACK = 10000;

// =============================================================================
// WEBGL ADDON LOADER
// =============================================================================

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

// =============================================================================
// FILE PATH LINK PROVIDER
// =============================================================================

class FilePathLinkProvider implements ILinkProvider {
  private terminal: XTerm;
  private onOpenFile: (path: string, line?: number, column?: number) => void;
  private hoverTooltip: HTMLDivElement | null = null;

  constructor(
    terminal: XTerm,
    onOpenFile: (path: string, line?: number, column?: number) => void
  ) {
    this.terminal = terminal;
    this.onOpenFile = onOpenFile;
  }

  provideLinks(
    bufferLineNumber: number,
    callback: (links: ILink[] | undefined) => void
  ): void {
    const buffer = this.terminal.buffer.active;
    const line = buffer.getLine(bufferLineNumber);
    if (!line) {
      callback(undefined);
      return;
    }

    const lineText = line.translateToString();
    if (!lineText || lineText.trim().length === 0) {
      callback(undefined);
      return;
    }

    const links: ILink[] = [];
    const patterns = [
      /(?<path>\/(?:[\w\-.]|\/)+\.[\w]+)(?::(?<line>\d+)(?::(?<col>\d+))?|\((?<pline>\d+)(?:,(?<pcol>\d+))?\))?/g,
      /(?<path>[A-Za-z]:\\(?:[\w\-.]|\\)+\.[\w]+)(?::(?<line>\d+)(?::(?<col>\d+))?|\((?<pline>\d+)(?:,(?<pcol>\d+))?\))?/g,
      /(?<path>\.\.?\/(?:[\w\-.]|\/)+\.[\w]+)(?::(?<line>\d+)(?::(?<col>\d+))?|\((?<pline>\d+)(?:,(?<pcol>\d+))?\))?/g,
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(lineText)) !== null) {
        const matchText = match[0];
        const groups = match.groups;
        if (!groups?.path) continue;

        const filePath = groups.path;
        const lineNum = groups.line || groups.pline;
        const colNum = groups.col || groups.pcol;

        const startX = match.index + 1;
        const endX = match.index + matchText.length + 1;

        const range: IBufferRange = {
          start: { x: startX, y: bufferLineNumber + 1 },
          end: { x: endX, y: bufferLineNumber + 1 },
        };

        links.push({
          range,
          text: matchText,
          activate: (_event: MouseEvent, _text: string) => {
            this.onOpenFile(
              filePath,
              lineNum ? parseInt(lineNum, 10) : undefined,
              colNum ? parseInt(colNum, 10) : undefined
            );
          },
          hover: (event: MouseEvent, _text: string) => {
            this.showHoverTooltip(event, filePath, lineNum, colNum);
          },
          leave: (_event: MouseEvent, _text: string) => {
            this.hideHoverTooltip();
          },
          dispose: () => {
            this.hideHoverTooltip();
          },
        });
      }
    }

    callback(links.length > 0 ? links : undefined);
  }

  private showHoverTooltip(
    event: MouseEvent,
    filePath: string,
    line?: string,
    column?: string
  ): void {
    this.hideHoverTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "xterm-hover terminal-file-link-tooltip";
    tooltip.style.cssText = `
      position: fixed;
      z-index: 1000;
      padding: ${tokens.spacing.sm} ${tokens.spacing.md};
      background: var(--jb-popup);
      border: 1px solid ${tokens.colors.border.divider};
      border-radius: ${tokens.radius.sm};
      font-size: var(--jb-text-muted-size);
      color: ${tokens.colors.text.primary};
      pointer-events: none;
      white-space: nowrap;
      box-shadow: var(--jb-shadow-popup);
    `;

    let tooltipText = "Click to open file";
    if (line) {
      tooltipText += ` at line ${line}`;
      if (column) {
        tooltipText += `:${column}`;
      }
    }

    const pathSpan = document.createElement("div");
    pathSpan.style.cssText = `
      font-size: var(--jb-text-header-size);
      color: ${tokens.colors.text.muted};
      margin-top: 2px;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    pathSpan.textContent = filePath;

    const actionSpan = document.createElement("div");
    actionSpan.textContent = tooltipText;

    tooltip.appendChild(actionSpan);
    tooltip.appendChild(pathSpan);

    const x = event.clientX + 10;
    const y = event.clientY + 10;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;

    const terminalElement = this.terminal.element;
    if (terminalElement) {
      terminalElement.appendChild(tooltip);
      this.hoverTooltip = tooltip;

      requestAnimationFrame(() => {
        const rect = tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          tooltip.style.left = `${event.clientX - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
          tooltip.style.top = `${event.clientY - rect.height - 10}px`;
        }
      });
    }
  }

  private hideHoverTooltip(): void {
    if (this.hoverTooltip) {
      this.hoverTooltip.remove();
      this.hoverTooltip = null;
    }
  }
}

// =============================================================================
// TERMINAL COMPONENT
// =============================================================================

export function Terminal(props: TerminalProps) {
  let containerRef: HTMLDivElement | undefined;
  let handle: TerminalHandle | undefined;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    if (!containerRef) return;

    const ts = props.settings;

    const terminal = new XTerm({
      cursorBlink: ts.cursorBlink,
      cursorStyle: ts.cursorStyle,
      fontSize: ts.fontSize,
      fontFamily: ts.fontFamily,
      lineHeight: ts.lineHeight,
      letterSpacing: 0,
      theme: props.theme,
      allowProposedApi: true,
      scrollback: ts.scrollback ?? DEFAULT_SCROLLBACK,
      tabStopWidth: 4,
      convertEol: false,
      screenReaderMode: ts.accessibleViewEnabled ?? false,
      smoothScrollDuration: 0,
      wordSeparator: ts.wordSeparators ?? " ()[]{}',\"`─''",
      scrollSensitivity: 1,
      cursorInactiveStyle: "none",
      rescaleOverlappingGlyphs: true,
      drawBoldTextInBrightColors: false,
    });

    // Bell handler
    terminal.onBell(() => {
      const bellSetting = props.settings.bell ?? "none";
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
      } else if (bellSetting === "visual" && containerRef) {
        containerRef.classList.add("terminal-visual-bell");
        setTimeout(() => {
          containerRef?.classList.remove("terminal-visual-bell");
        }, 150);
      }
    });

    // Load addons
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
    terminal.unicode.activeVersion = "11";

    // Register file path link provider
    if (props.callbacks.onOpenFile) {
      const onOpenFile = props.callbacks.onOpenFile;
      const filePathLinkProvider = new FilePathLinkProvider(
        terminal,
        (path: string, line?: number, column?: number) => {
          onOpenFile(path, line, column);
        }
      );
      terminal.registerLinkProvider(filePathLinkProvider);
    }

    // Open terminal in container
    terminal.open(containerRef);

    // Windows PTY compatibility
    const isWindows = navigator.platform.toLowerCase().includes("win");
    if (isWindows) {
      let buildNumber = 19041;
      const match = navigator.userAgent.match(/Windows NT (\d+)\.(\d+)(?:\.(\d+))?/);
      if (match && match[3]) {
        buildNumber = parseInt(match[3], 10);
      } else {
        const osMatch = navigator.userAgent.match(/Windows NT \d+\.\d+/);
        if (osMatch) {
          buildNumber = 22000;
        }
      }

      terminal.options.windowsPty = {
        backend: "conpty",
        buildNumber,
      };

      terminal.parser.registerCsiHandler({ final: "c" }, (params) => {
        if (params.length === 0 || (params.length === 1 && params[0] === 0)) {
          props.callbacks.onData(props.terminalInfo.id, "\x1b[?61;4c");
          return true;
        }
        return false;
      });
    }

    // Try WebGL addon
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

    // Fit after container is sized
    requestAnimationFrame(() => {
      fitAddon.fit();

      const dims = fitAddon.proposeDimensions();
      if (dims) {
        props.callbacks.onResize(props.terminalInfo.id, dims.cols, dims.rows);
      }

      terminal.write(
        `\x1b[1;34m[Cortex Terminal]\x1b[0m Connected to ${props.terminalInfo.shell}\r\n`
      );

      setTimeout(() => {
        if (containerRef && containerRef.offsetWidth > 0 && containerRef.offsetHeight > 0) {
          fitAddon.fit();
          const dims2 = fitAddon.proposeDimensions();
          if (dims2 && dims2.cols > 0 && dims2.rows > 0) {
            props.callbacks.onResize(props.terminalInfo.id, dims2.cols, dims2.rows);
          }
        }
      }, 100);
    });

    // Input handling
    terminal.onData((data) => {
      props.callbacks.onData(props.terminalInfo.id, data);
    });

    terminal.onBinary((data) => {
      props.callbacks.onBinary(props.terminalInfo.id, data);
    });

    terminal.onResize(({ cols, rows }) => {
      props.callbacks.onResize(props.terminalInfo.id, cols, rows);
    });

    // ResizeObserver for auto-fit
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (
        containerRef &&
        containerRef.style.display !== "none" &&
        containerRef.offsetParent !== null &&
        containerRef.offsetWidth > 0 &&
        containerRef.offsetHeight > 0
      ) {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          props.callbacks.onResize(props.terminalInfo.id, dims.cols, dims.rows);
        }
      }
    };

    resizeObserver = new ResizeObserver((entries) => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            handleResize();
          }
        }
      }, 16);
    });

    resizeObserver.observe(containerRef);

    // Build handle
    handle = {
      terminal,
      fitAddon,
      searchAddon,
      webglAddon,
      fit: () => {
        fitAddon.fit();
      },
      focus: () => {
        terminal.focus();
      },
      clear: () => {
        terminal.clear();
      },
      selectAll: () => {
        terminal.selectAll();
      },
      write: (data: string) => {
        terminal.write(data);
      },
      dispose: () => {
        if (webglAddon && typeof (webglAddon as { dispose?: () => void }).dispose === "function") {
          try {
            (webglAddon as { dispose: () => void }).dispose();
          } catch (err) {
            console.debug("WebGL addon disposal failed:", err);
          }
        }
        resizeObserver?.disconnect();
        resizeObserver = null;
        terminal.dispose();
        props.onDisposed?.(props.terminalInfo.id);
      },
    };

    props.onReady?.(handle);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (handle) {
      handle.dispose();
      handle = undefined;
    }
  });

  return (
    <div
      ref={containerRef}
      data-terminal-id={props.terminalInfo.id}
      style={{
        width: "100%",
        height: "100%",
        display: props.isVisible ? "block" : "none",
      }}
    />
  );
}
