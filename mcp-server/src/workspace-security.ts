import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";

export const WORKSPACE_ROOT = path.resolve(process.env.CORTEX_WORKSPACE_ROOT || process.cwd());
const WORKSPACE_REAL_ROOT_PROMISE = fs.realpath(WORKSPACE_ROOT).catch(() => WORKSPACE_ROOT);

export const DEFAULT_RESOURCE_MAX_BYTES = 64 * 1024;
export const DEFAULT_READ_FILE_MAX_BYTES = 50_000;
export const DEFAULT_READ_FILE_MAX_LINES = 500;
export const DEFAULT_SEARCH_FILE_MAX_BYTES = 128 * 1024;
export const DEFAULT_SEARCH_MAX_RESULTS = 200;
export const DEFAULT_SEARCH_MAX_FILES = 2_000;
export const DEFAULT_COMMAND_STREAM_MAX_BYTES = 32 * 1024;

const DEFAULT_INTERNAL_ERROR = "Internal error";
const DEFAULT_TRUNCATION_MESSAGE = "... [truncated]";

export class UserVisibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserVisibleError";
  }
}

export interface WorkspaceRoots {
  workspaceRoot: string;
  workspaceRealRoot: string;
}

export interface ResolveSafePathOptions {
  roots?: WorkspaceRoots;
  allowMissing?: boolean;
}

export interface TextPreviewOptions {
  maxBytes?: number;
  truncationMessage?: string;
}

export interface TextPreviewResult {
  text: string;
  truncated: boolean;
  bytesRead: number;
}

export interface ReadTextLinesOptions {
  startLine?: number;
  maxLines?: number;
  maxBytes?: number;
  hardMaxLines?: number;
  includeLineNumbers?: boolean;
  truncationMessage?: string;
}

export interface ReadTextLinesResult {
  text: string;
  truncated: boolean;
  returnedLines: number;
}

export interface BoundedTextAccumulator {
  text: string;
  bytes: number;
  truncated: boolean;
}

export async function getWorkspaceRoots(workspaceRoot: string = WORKSPACE_ROOT): Promise<WorkspaceRoots> {
  const normalizedRoot = path.resolve(workspaceRoot);
  const workspaceRealRoot = normalizedRoot === WORKSPACE_ROOT
    ? await WORKSPACE_REAL_ROOT_PROMISE
    : await fs.realpath(normalizedRoot).catch(() => normalizedRoot);

  return {
    workspaceRoot: normalizedRoot,
    workspaceRealRoot,
  };
}

export async function ensureRegularFile(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new UserVisibleError("Expected a regular file");
  }
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  const stats = await fs.stat(dirPath);
  if (!stats.isDirectory()) {
    throw new UserVisibleError("Expected a directory");
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function getErrnoCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isWithinWorkspace(candidate: string, roots: WorkspaceRoots): boolean {
  return isPathInside(roots.workspaceRoot, candidate) || isPathInside(roots.workspaceRealRoot, candidate);
}

async function findClosestExistingPath(candidate: string): Promise<string> {
  let current = candidate;

  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }

    current = parent;
  }
}

function sliceUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  const buffer = Buffer.from(text, "utf8");
  return buffer.byteLength <= maxBytes ? text : buffer.subarray(0, maxBytes).toString("utf8");
}

function appendTruncationNotice(
  text: string,
  maxBytes: number,
  truncationMessage: string = DEFAULT_TRUNCATION_MESSAGE,
): string {
  if (!truncationMessage) {
    return sliceUtf8(text, maxBytes);
  }

  if (maxBytes <= 0) {
    return "";
  }

  if (!text) {
    return sliceUtf8(truncationMessage, maxBytes);
  }

  const suffix = `\n${truncationMessage}`;
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  if (suffixBytes >= maxBytes) {
    return sliceUtf8(truncationMessage, maxBytes);
  }

  const trimmed = sliceUtf8(text, maxBytes - suffixBytes);
  return trimmed ? `${trimmed}${suffix}` : sliceUtf8(truncationMessage, maxBytes);
}

export async function resolveSafePath(inputPath: string, options: ResolveSafePathOptions = {}): Promise<string> {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0 || inputPath.includes("\0")) {
    throw new UserVisibleError("Invalid path");
  }

  const roots = options.roots ?? await getWorkspaceRoots();
  const candidate = path.resolve(roots.workspaceRoot, inputPath);

  if (!isWithinWorkspace(candidate, roots)) {
    throw new UserVisibleError("Access denied: path is outside the workspace");
  }

  const existingTarget = options.allowMissing ? await findClosestExistingPath(candidate) : candidate;
  const resolvedExistingTarget = await fs.realpath(existingTarget).catch((error) => {
    if (options.allowMissing && getErrnoCode(error) === "ENOENT") {
      return existingTarget;
    }

    throw error;
  });

  if (!isWithinWorkspace(resolvedExistingTarget, roots)) {
    throw new UserVisibleError("Access denied: path is outside the workspace");
  }

  return candidate;
}

export function sanitizeUserError(error: unknown, fallback: string = DEFAULT_INTERNAL_ERROR): string {
  if (error instanceof UserVisibleError) {
    return error.message;
  }

  switch (getErrnoCode(error)) {
    case "ENOENT":
      return "Path not found";
    case "EACCES":
    case "EPERM":
      return "Access denied";
    case "EISDIR":
      return "Expected a file but received a directory";
    case "ENOTDIR":
      return "Expected a directory";
    case "ELOOP":
      return "Symlink resolution failed";
    case "EMFILE":
    case "ENFILE":
      return "Resource limit exceeded";
    default:
      break;
  }

  if (error instanceof SyntaxError) {
    return "Invalid input";
  }

  return fallback;
}

export function formatToolError(action: string, error: unknown, fallback: string = DEFAULT_INTERNAL_ERROR): string {
  return `Error ${action}: ${sanitizeUserError(error, fallback)}`;
}

export function logMcpError(context: string, error: unknown): void {
  const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[MCP Server] ${context}: ${details}`);
}

export async function readTextPreview(filePath: string, options: TextPreviewOptions = {}): Promise<TextPreviewResult> {
  const maxBytes = normalizePositiveInteger(options.maxBytes, DEFAULT_RESOURCE_MAX_BYTES);
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
    const truncated = bytesRead > maxBytes;
    const visibleBytes = Math.min(bytesRead, maxBytes);
    let text = buffer.subarray(0, visibleBytes).toString("utf8");

    if (truncated) {
      text = appendTruncationNotice(text, maxBytes, options.truncationMessage);
    }

    return {
      text,
      truncated,
      bytesRead: visibleBytes,
    };
  } finally {
    await handle.close();
  }
}

export async function readTextLines(filePath: string, options: ReadTextLinesOptions = {}): Promise<ReadTextLinesResult> {
  const startLine = normalizePositiveInteger(options.startLine, 1);
  const hardMaxLines = normalizePositiveInteger(options.hardMaxLines, DEFAULT_READ_FILE_MAX_LINES);
  const requestedMaxLines = options.maxLines == null
    ? hardMaxLines
    : Math.min(normalizePositiveInteger(options.maxLines, hardMaxLines), hardMaxLines);
  const maxBytes = normalizePositiveInteger(options.maxBytes, DEFAULT_READ_FILE_MAX_BYTES);
  const includeLineNumbers = options.includeLineNumbers ?? true;

  const stream = createReadStream(filePath, { highWaterMark: 16 * 1024 });
  const decoder = new StringDecoder("utf8");

  let currentLineNumber = 1;
  let currentLine = "";
  let outputText = "";
  let outputBytes = 0;
  let returnedLines = 0;
  let truncated = false;
  let stopped = false;

  const lineBudget = (): number => {
    const separatorBytes = outputText ? Buffer.byteLength("\n", "utf8") : 0;
    const prefixBytes = includeLineNumbers ? Buffer.byteLength(`${currentLineNumber}: `, "utf8") : 0;
    return Math.max(0, maxBytes - outputBytes - separatorBytes - prefixBytes);
  };

  const appendSelectedLine = (): boolean => {
    const isSelected = currentLineNumber >= startLine;
    if (isSelected) {
      if (returnedLines >= requestedMaxLines) {
        truncated = true;
        return false;
      }

      const rendered = includeLineNumbers ? `${currentLineNumber}: ${currentLine}` : currentLine;
      const prefix = outputText ? "\n" : "";
      const addition = `${prefix}${rendered}`;
      const additionBytes = Buffer.byteLength(addition, "utf8");

      if (outputBytes + additionBytes > maxBytes) {
        truncated = true;
        return false;
      }

      outputText += addition;
      outputBytes += additionBytes;
      returnedLines += 1;
    }

    currentLineNumber += 1;
    currentLine = "";
    return true;
  };

  const processText = (text: string): void => {
    let cursor = 0;

    while (cursor < text.length) {
      const newlineIndex = text.indexOf("\n", cursor);
      if (newlineIndex === -1) {
        if (currentLineNumber >= startLine) {
          currentLine += text.slice(cursor);
          if (Buffer.byteLength(currentLine, "utf8") > lineBudget()) {
            truncated = true;
            stopped = true;
          }
        }
        break;
      }

      if (currentLineNumber >= startLine) {
        currentLine += text.slice(cursor, newlineIndex);
        if (Buffer.byteLength(currentLine, "utf8") > lineBudget()) {
          truncated = true;
          stopped = true;
          break;
        }

        if (currentLine.endsWith("\r")) {
          currentLine = currentLine.slice(0, -1);
        }
      }

      if (!appendSelectedLine()) {
        stopped = true;
        break;
      }

      cursor = newlineIndex + 1;
    }
  };

  try {
    for await (const chunk of stream) {
      processText(decoder.write(chunk as Buffer));
      if (stopped) {
        break;
      }
    }

    if (!stopped) {
      const remaining = decoder.end();
      if (remaining) {
        processText(remaining);
      }
    } else {
      decoder.end();
    }
  } finally {
    stream.destroy();
  }

  if (!stopped && currentLine.length > 0) {
    if (currentLine.endsWith("\r")) {
      currentLine = currentLine.slice(0, -1);
    }

    if (!appendSelectedLine()) {
      truncated = true;
    }
  }

  if (truncated) {
    outputText = appendTruncationNotice(outputText, maxBytes, options.truncationMessage);
  }

  return {
    text: outputText,
    truncated,
    returnedLines,
  };
}

export function createBoundedTextAccumulator(): BoundedTextAccumulator {
  return {
    text: "",
    bytes: 0,
    truncated: false,
  };
}

export function appendToBoundedText(
  accumulator: BoundedTextAccumulator,
  chunk: Buffer | string,
  maxBytes: number = DEFAULT_COMMAND_STREAM_MAX_BYTES,
): void {
  const limit = normalizePositiveInteger(maxBytes, DEFAULT_COMMAND_STREAM_MAX_BYTES);
  if (accumulator.bytes >= limit) {
    accumulator.truncated = true;
    return;
  }

  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
  const remaining = limit - accumulator.bytes;

  if (buffer.byteLength <= remaining) {
    accumulator.text += buffer.toString("utf8");
    accumulator.bytes += buffer.byteLength;
    return;
  }

  accumulator.text += buffer.subarray(0, remaining).toString("utf8");
  accumulator.bytes += remaining;
  accumulator.truncated = true;
}

export function finalizeBoundedText(
  accumulator: BoundedTextAccumulator,
  maxBytes: number = DEFAULT_COMMAND_STREAM_MAX_BYTES,
  truncationMessage?: string,
): string {
  const limit = normalizePositiveInteger(maxBytes, DEFAULT_COMMAND_STREAM_MAX_BYTES);
  return accumulator.truncated
    ? appendTruncationNotice(accumulator.text, limit, truncationMessage)
    : accumulator.text;
}
