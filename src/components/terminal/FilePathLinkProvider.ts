/**
 * File path link provider for terminal.
 * Detects local file paths in terminal output and makes them clickable.
 */

import type { ILinkProvider, ILink, IBufferRange } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";
import { tokens } from "@/design-system/tokens";

export class FilePathLinkProvider implements ILinkProvider {
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
