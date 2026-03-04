#!/usr/bin/env node
/**
 * Cortex Desktop MCP Server
 * 
 * Enables AI agents (Cursor, Claude Code, etc.) to interact with Cortex Desktop
 * via the Model Context Protocol (MCP).
 *
 * Provides two categories of tools:
 * 1. UI Automation tools — interact with the Cortex Desktop GUI via socket
 * 2. Workspace tools — read/write files, search code, run commands directly
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { socketClient } from "./client.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import { glob } from "glob";

interface TruncationConfig {
  enabled: boolean;
  maxLength?: number;
  maxLines?: number;
  truncateMessage?: string;
}

interface SocketCommandResponse {
  success: boolean;
  data?: unknown;
  error?: unknown;
}

const DEFAULT_TRUNCATION: TruncationConfig = {
  enabled: true,
  maxLength: 2000,
  maxLines: 100,
  truncateMessage: "... [truncated]",
};

const LARGE_TRUNCATION: TruncationConfig = {
  enabled: true,
  maxLength: 50000,
  maxLines: 500,
  truncateMessage: "... [truncated]",
};

const ERROR_TRUNCATION: TruncationConfig = {
  enabled: true,
  maxLength: 4000,
  maxLines: 120,
  truncateMessage: "... [truncated]",
};

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

function truncateText(text: unknown, config: TruncationConfig = DEFAULT_TRUNCATION): string {
  const source = normalizeText(text);
  if (!config.enabled || source.length === 0) {
    return source;
  }

  let result = source;
  const suffix = typeof config.truncateMessage === "string" ? config.truncateMessage : "";
  const maxLines =
    typeof config.maxLines === "number" && Number.isFinite(config.maxLines)
      ? Math.floor(config.maxLines)
      : undefined;
  const maxLength =
    typeof config.maxLength === "number" && Number.isFinite(config.maxLength)
      ? Math.floor(config.maxLength)
      : undefined;

  if (maxLines != null && maxLines > 0) {
    const lines = result.split("\n");
    if (lines.length > maxLines) {
      result = lines.slice(0, maxLines).join("\n");
      if (suffix) {
        result += `\n${suffix}`;
      }
    }
  }

  if (maxLength != null && maxLength > 0 && result.length > maxLength) {
    if (!suffix) {
      result = result.substring(0, maxLength);
    } else if (suffix.length >= maxLength) {
      result = suffix.substring(0, maxLength);
    } else {
      const cutAt = Math.max(0, maxLength - suffix.length);
      result = result.substring(0, cutAt) + suffix;
    }
  }

  return result;
}

// Workspace root from environment or cwd — normalized without trailing separator
const WORKSPACE_ROOT = path.resolve(process.env.CORTEX_WORKSPACE_ROOT || process.cwd());

// Create MCP server instance
const server = new McpServer({
  name: "cortex-desktop-mcp",
  version: "1.0.0",
});

// Helper: resolve a path relative to workspace root, preventing path traversal
function resolveSafePath(inputPath: string): string {
  if (typeof inputPath !== "string") {
    throw new Error("Invalid path: expected a string");
  }

  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error("Invalid path: cannot be empty");
  }

  if (trimmed.includes("\0")) {
    throw new Error("Invalid path: null byte is not allowed");
  }

  const resolved = path.resolve(WORKSPACE_ROOT, trimmed);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  const escapesWorkspace =
    relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

  if (escapesWorkspace) {
    throw new Error(`Path traversal denied: ${trimmed}`);
  }

  return resolved;
}

// Helper: detect MIME type from file extension
function mimeFromExt(filePath: unknown): string {
  if (typeof filePath !== "string" || !filePath) return "text/plain";

  const mimeMap: Record<string, string> = {
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".js": "text/javascript",
    ".jsx": "text/javascript",
    ".mjs": "text/javascript",
    ".cjs": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".rs": "text/x-rust",
    ".py": "text/x-python",
    ".toml": "text/x-toml",
    ".yaml": "text/x-yaml",
    ".yml": "text/x-yaml",
    ".xml": "text/xml",
    ".sh": "text/x-shellscript",
    ".sql": "text/x-sql",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".log": "text/plain",
  };

  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) {
      return "text/plain";
    }
    return mimeMap[ext] ?? "text/plain";
  } catch {
    return "text/plain";
  }
}

// Helper: format a caught error for tool responses
function errorText(e: unknown): string {
  if (e instanceof Error) {
    const message = e.message?.trim();
    if (message) {
      return message;
    }
    return e.name?.trim() || "Unknown error";
  }

  if (typeof e === "string") {
    const message = e.trim();
    return message || "Unknown error";
  }

  if (e && typeof e === "object") {
    const maybeMessage = (e as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
    try {
      const serialized = JSON.stringify(e);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      return "Unknown error";
    }
  }

  return "Unknown error";
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "null";
  }

  try {
    const json = JSON.stringify(value, null, 2);
    return json ?? "null";
  } catch (e) {
    return `"[Unserializable value: ${errorText(e)}]"`;
  }
}

function toolErrorResponse(toolName: string, cause: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: truncateText(`[${toolName}] ${errorText(cause)}`, ERROR_TRUNCATION),
    }],
    isError: true,
  };
}

function backendToolErrorResponse(toolName: string, response: SocketCommandResponse) {
  return toolErrorResponse(toolName, response.error ?? "Backend command failed");
}

function resourceErrorResponse(uri: URL, resourceName: string, cause: unknown) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: "text/plain",
      text: truncateText(`[${resourceName}] ${errorText(cause)}`, ERROR_TRUNCATION),
    }],
  };
}

// Register workspace resource templates
function registerResources() {
  server.resource(
    "workspace-file",
    new ResourceTemplate("cortex://workspace/{+filepath}", { list: undefined }),
    async (uri, params) => {
      try {
        const filepath = params.filepath;
        if (typeof filepath !== "string" || !filepath) {
          throw new Error("Invalid filepath parameter");
        }

        const safePath = resolveSafePath(filepath);
        const content = await fs.readFile(safePath, "utf-8");
        return {
          contents: [{
            uri: uri.href,
            mimeType: mimeFromExt(safePath),
            text: truncateText(content, LARGE_TRUNCATION),
          }],
        };
      } catch (e) {
        return resourceErrorResponse(uri, "workspace-file", e);
      }
    }
  );
}

// Register tools
function registerTools() {
  const toSocketResponse = (response: unknown): SocketCommandResponse => {
    if (!response || typeof response !== "object") {
      return {
        success: false,
        error: "Invalid backend response",
      };
    }

    const candidate = response as Partial<SocketCommandResponse>;
    return {
      success: candidate.success === true,
      data: candidate.data,
      error: candidate.error,
    };
  };

  // Ping - test connectivity
  server.tool(
    "ping",
    "Test connectivity to Cortex Desktop",
    {},
    async () => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("ping", {}));
        if (!response.success) {
          return backendToolErrorResponse("ping", response);
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(response.data), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("ping", e);
      }
    }
  );

  // Take Screenshot
  server.tool(
    "take_screenshot",
    "Capture a screenshot of the Cortex Desktop window. Supports compression to reduce file size.",
    {
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
      quality: z.number().min(1).max(100).optional().describe("JPEG quality 1-100 (default: 75). Lower = smaller file, more compression"),
      maxWidth: z.number().optional().describe("Maximum width in pixels. Images larger than this will be resized proportionally"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("takeScreenshot", {
          windowLabel: args.windowLabel || "main",
          quality: args.quality,
          maxWidth: args.maxWidth,
        }));

        if (!response.success) {
          return backendToolErrorResponse("take_screenshot", response);
        }

        const data = response.data as { data?: unknown; width?: unknown; height?: unknown };
        const rawImage = typeof data?.data === "string" ? data.data : "";
        if (!rawImage) {
          return toolErrorResponse("take_screenshot", "Screenshot payload missing image data");
        }

        const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, "");
        const width = typeof data?.width === "number" ? data.width : 0;
        const height = typeof data?.height === "number" ? data.height : 0;

        return {
          content: [
            {
              type: "image" as const,
              data: base64Data,
              mimeType: "image/jpeg",
            },
            {
              type: "text" as const,
              text: `Screenshot captured: ${width}x${height}`,
            },
          ],
        };
      } catch (e) {
        return toolErrorResponse("take_screenshot", e);
      }
    }
  );

  // Get DOM
  server.tool(
    "get_dom",
    "Get the HTML DOM content from Cortex Desktop",
    {
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
      selector: z.string().optional().describe("CSS selector to get specific element (optional)"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("getDom", {
          windowLabel: args.windowLabel || "main",
          selector: args.selector,
        }));

        if (!response.success) {
          return backendToolErrorResponse("get_dom", response);
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(response.data), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("get_dom", e);
      }
    }
  );

  // Execute JavaScript
  server.tool(
    "execute_js",
    "Execute JavaScript code in Cortex Desktop",
    {
      script: z.string().describe("JavaScript code to execute"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("executeJs", {
          windowLabel: args.windowLabel || "main",
          script: args.script,
        }));

        if (!response.success) {
          return backendToolErrorResponse("execute_js", response);
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(response.data), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("execute_js", e);
      }
    }
  );

  // Manage Window
  server.tool(
    "manage_window",
    "Control the Cortex Desktop window (minimize, maximize, move, resize, etc.)",
    {
      operation: z.string().describe("Operation: minimize, maximize, unmaximize, close, show, hide, focus, center, setPosition, setSize, toggleFullscreen"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
      x: z.number().optional().describe("X position (for setPosition)"),
      y: z.number().optional().describe("Y position (for setPosition)"),
      width: z.number().optional().describe("Width (for setSize)"),
      height: z.number().optional().describe("Height (for setSize)"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("manageWindow", {
          windowLabel: args.windowLabel || "main",
          operation: args.operation,
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        }));

        if (!response.success) {
          return backendToolErrorResponse("manage_window", response);
        }

        return {
          content: [{ type: "text" as const, text: `Window operation '${args.operation}' completed` }],
        };
      } catch (e) {
        return toolErrorResponse("manage_window", e);
      }
    }
  );

  // Text Input
  server.tool(
    "text_input",
    "Simulate keyboard text input",
    {
      text: z.string().describe("Text to type"),
      delayMs: z.number().optional().default(20).describe("Delay between keystrokes in milliseconds (default: 20)"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("textInput", {
          text: args.text,
          delayMs: args.delayMs || 20,
        }));

        if (!response.success) {
          return backendToolErrorResponse("text_input", response);
        }

        return {
          content: [{ type: "text" as const, text: `Typed ${args.text.length} characters` }],
        };
      } catch (e) {
        return toolErrorResponse("text_input", e);
      }
    }
  );

  // Mouse Movement
  server.tool(
    "mouse_action",
    "Simulate mouse actions (move, click, scroll)",
    {
      action: z.string().describe("Action: move, click, doubleClick, rightClick, scroll"),
      x: z.number().optional().describe("X coordinate (for move)"),
      y: z.number().optional().describe("Y coordinate (for move)"),
      scrollX: z.number().optional().describe("Horizontal scroll amount"),
      scrollY: z.number().optional().describe("Vertical scroll amount"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("mouseMovement", {
          action: args.action,
          x: args.x,
          y: args.y,
          scrollX: args.scrollX,
          scrollY: args.scrollY,
        }));

        if (!response.success) {
          return backendToolErrorResponse("mouse_action", response);
        }

        return {
          content: [{ type: "text" as const, text: `Mouse action '${args.action}' completed` }],
        };
      } catch (e) {
        return toolErrorResponse("mouse_action", e);
      }
    }
  );

  // LocalStorage
  server.tool(
    "local_storage",
    "Manage localStorage in Cortex Desktop",
    {
      operation: z.string().describe("Operation: get, set, remove, clear, keys"),
      key: z.string().optional().describe("Storage key (for get, set, remove)"),
      value: z.string().optional().describe("Value to set (for set operation)"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("manageLocalStorage", {
          windowLabel: args.windowLabel || "main",
          operation: args.operation,
          key: args.key,
          value: args.value,
        }));

        if (!response.success) {
          return backendToolErrorResponse("local_storage", response);
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(response.data), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("local_storage", e);
      }
    }
  );

  // Get Element Position
  server.tool(
    "get_element_position",
    "Get the screen position of a DOM element",
    {
      selector: z.string().describe("CSS selector for the element"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("getElementPosition", {
          windowLabel: args.windowLabel || "main",
          selector: args.selector,
        }));

        if (!response.success) {
          return backendToolErrorResponse("get_element_position", response);
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(response.data), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("get_element_position", e);
      }
    }
  );

  // Send Text to Element
  server.tool(
    "send_text_to_element",
    "Send text to a specific DOM element (focuses and sets value)",
    {
      selector: z.string().describe("CSS selector for the element"),
      text: z.string().describe("Text to send to the element"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("sendTextToElement", {
          windowLabel: args.windowLabel || "main",
          selector: args.selector,
          text: args.text,
        }));

        if (!response.success) {
          return backendToolErrorResponse("send_text_to_element", response);
        }

        return {
          content: [{ type: "text" as const, text: `Text sent to element '${args.selector}'` }],
        };
      } catch (e) {
        return toolErrorResponse("send_text_to_element", e);
      }
    }
  );

  // List Windows
  server.tool(
    "list_windows",
    "List all available windows in Cortex Desktop",
    {},
    async () => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("listWindows", {}));

        if (!response.success) {
          return backendToolErrorResponse("list_windows", response);
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(response.data), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("list_windows", e);
      }
    }
  );

  // ========================================================================
  // Workspace Tools — operate directly on the filesystem
  // ========================================================================

  // Read File
  server.tool(
    "read_file",
    "Read the contents of a file from the workspace. Supports optional line range.",
    {
      path: z.string().describe("File path (relative to workspace root or absolute)"),
      start_line: z.number().optional().default(1).describe("Starting line number (1-based, default: 1)"),
      max_lines: z.number().optional().describe("Maximum number of lines to read (omit for all)"),
    },
    async (args) => {
      try {
        const safePath = resolveSafePath(args.path);
        const raw = await fs.readFile(safePath, "utf-8");
        const allLines = raw.split("\n");
        const start = Math.max(0, (args.start_line ?? 1) - 1);
        const selected = args.max_lines != null
          ? allLines.slice(start, start + args.max_lines)
          : allLines.slice(start);
        const numbered = selected.map((line, i) => `${start + i + 1}: ${line}`);
        const text = truncateText(numbered.join("\n"), LARGE_TRUNCATION);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (e) {
        return toolErrorResponse("read_file", e);
      }
    }
  );

  // Write File
  server.tool(
    "write_file",
    "Write content to a file in the workspace. Creates parent directories if needed.",
    {
      path: z.string().describe("File path (relative to workspace root or absolute)"),
      content: z.string().describe("Content to write to the file"),
    },
    async (args) => {
      try {
        const safePath = resolveSafePath(args.path);
        const dir = path.dirname(safePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(safePath, args.content, "utf-8");
        return {
          content: [{ type: "text" as const, text: `Wrote ${args.content.length} bytes to ${args.path}` }],
        };
      } catch (e) {
        return toolErrorResponse("write_file", e);
      }
    }
  );

  // List Directory
  server.tool(
    "list_directory",
    "List files and directories at a given path in the workspace.",
    {
      path: z.string().default(".").describe("Directory path (relative to workspace root, default: '.')"),
      include_hidden: z.boolean().optional().default(false).describe("Include hidden files/directories (default: false)"),
    },
    async (args) => {
      try {
        const safePath = resolveSafePath(args.path);
        const entries = await fs.readdir(safePath, { withFileTypes: true });
        const results: Array<{ name: string; type: string; path: string }> = [];
        for (const entry of entries) {
          if (!args.include_hidden && entry.name.startsWith(".")) continue;
          results.push({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
            path: path.join(args.path, entry.name),
          });
        }
        results.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify({ entries: results }), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("list_directory", e);
      }
    }
  );

  // Search Code
  server.tool(
    "search_code",
    "Search for a regex pattern across files in the workspace. Returns matching lines with file paths and line numbers.",
    {
      pattern: z.string().describe("Regex pattern to search for"),
      directory: z.string().optional().default(".").describe("Directory to search in (relative to workspace root, default: '.')"),
      file_pattern: z.string().optional().describe("Glob pattern to filter files (e.g., '**/*.ts')"),
      max_results: z.number().optional().default(50).describe("Maximum number of matches to return (default: 50)"),
    },
    async (args) => {
      try {
        const searchDir = resolveSafePath(args.directory ?? ".");
        const globPattern = args.file_pattern || "**/*";
        const files = await glob(globPattern, {
          cwd: searchDir,
          nodir: true,
          ignore: ["**/node_modules/**", "**/target/**", "**/.git/**", "**/dist/**"],
          absolute: true,
        });

        const regex = new RegExp(args.pattern);
        const maxResults = args.max_results ?? 50;
        const results: Array<{ file: string; line: number; content: string }> = [];

        for (const filePath of files) {
          if (results.length >= maxResults) break;
          try {
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) break;
              if (regex.test(lines[i])) {
                results.push({
                  file: path.relative(WORKSPACE_ROOT, filePath),
                  line: i + 1,
                  content: lines[i].trim(),
                });
              }
            }
          } catch {
            // Skip binary/unreadable files
          }
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify({ results, total: results.length }), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("search_code", e);
      }
    }
  );

  // Run Terminal Command
  server.tool(
    "run_terminal_command",
    "Execute a shell command in the workspace. Returns stdout, stderr, and exit code.",
    {
      command: z.string().describe("Command to execute"),
      args: z.array(z.string()).optional().describe("Command arguments"),
      cwd: z.string().optional().describe("Working directory (relative to workspace root, default: workspace root)"),
      timeout_ms: z.number().optional().default(30000).describe("Timeout in milliseconds (default: 30000)"),
    },
    async (args) => {
      try {
        const cwd = args.cwd ? resolveSafePath(args.cwd) : WORKSPACE_ROOT;
        const timeout = args.timeout_ms ?? 30000;

        const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
          const proc = childProcess.spawn(args.command, args.args || [], {
            cwd,
            shell: true,
            timeout,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let stdout = "";
          let stderr = "";

          proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
          proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

          proc.on("close", (code) => {
            resolve({ stdout, stderr, exitCode: code });
          });

          proc.on("error", (err) => {
            reject(err);
          });
        });

        const output = truncateText(
          safeStringify({
            exit_code: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }),
          LARGE_TRUNCATION
        );

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (e) {
        return toolErrorResponse("run_terminal_command", e);
      }
    }
  );

  // Get Diagnostics (via Cortex Desktop socket)
  server.tool(
    "get_diagnostics",
    "Get diagnostics (errors, warnings) from the Cortex Desktop workspace. Requires Cortex Desktop to be running.",
    {
      file_path: z.string().optional().describe("Filter diagnostics by file path (optional)"),
      severity: z.enum(["error", "warning", "information", "hint"]).optional().describe("Filter by severity (optional)"),
    },
    async (args) => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("executeJs", {
          windowLabel: "main",
          script: `
            (function() {
              try {
                const store = window.__CORTEX_DIAGNOSTICS__;
                if (store) return JSON.stringify(store);
                return JSON.stringify({ error: "Diagnostics not available" });
              } catch(e) {
                return JSON.stringify({ error: e.message });
              }
            })()
          `,
        }));

        if (!response.success) {
          return backendToolErrorResponse("get_diagnostics", response);
        }

        let diagnostics = response.data;
        if (typeof diagnostics === "string") {
          try {
            diagnostics = JSON.parse(diagnostics);
          } catch {
            // Keep original string response
          }
        }

        const severityToLspNumber: Record<"error" | "warning" | "information" | "hint", number> = {
          error: 1,
          warning: 2,
          information: 3,
          hint: 4,
        };

        const normalizeDiagnosticPath = (entry: Record<string, unknown>): string => {
          const candidates = [entry.file_path, entry.filePath, entry.path, entry.uri];
          for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) {
              return candidate;
            }
          }
          return "";
        };

        const normalizeDiagnosticSeverity = (entry: Record<string, unknown>): string => {
          const raw = entry.severity;
          if (typeof raw === "number") {
            if (raw === 1) return "error";
            if (raw === 2) return "warning";
            if (raw === 3) return "information";
            if (raw === 4) return "hint";
            return "";
          }

          if (typeof raw === "string") {
            const normalized = raw.trim().toLowerCase();
            if (normalized === "info") {
              return "information";
            }
            return normalized;
          }

          return "";
        };

        const matchesFilters = (item: unknown): boolean => {
          if (!item || typeof item !== "object") {
            return false;
          }

          const entry = item as Record<string, unknown>;

          if (args.file_path) {
            const diagnosticPath = normalizeDiagnosticPath(entry);
            if (!diagnosticPath || !diagnosticPath.includes(args.file_path)) {
              return false;
            }
          }

          if (args.severity) {
            const diagnosticSeverity = normalizeDiagnosticSeverity(entry);
            if (diagnosticSeverity) {
              if (diagnosticSeverity !== args.severity) {
                return false;
              }
            } else {
              const rawSeverity = entry.severity;
              if (typeof rawSeverity === "number" && rawSeverity !== severityToLspNumber[args.severity]) {
                return false;
              }
              if (typeof rawSeverity !== "number") {
                return false;
              }
            }
          }

          return true;
        };

        if (Array.isArray(diagnostics)) {
          diagnostics = diagnostics.filter(matchesFilters);
        } else if (diagnostics && typeof diagnostics === "object") {
          const container = diagnostics as { diagnostics?: unknown };
          if (Array.isArray(container.diagnostics)) {
            diagnostics = {
              ...(diagnostics as Record<string, unknown>),
              diagnostics: container.diagnostics.filter(matchesFilters),
            };
          }
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(diagnostics), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("get_diagnostics", e);
      }
    }
  );

  // Get Open Files (via Cortex Desktop socket)
  server.tool(
    "get_open_files",
    "Get the list of currently open files in Cortex Desktop. Requires Cortex Desktop to be running.",
    {},
    async () => {
      try {
        const response = toSocketResponse(await socketClient.sendCommand("executeJs", {
          windowLabel: "main",
          script: `
            (function() {
              try {
                const store = window.__CORTEX_OPEN_FILES__;
                if (store) return JSON.stringify(store);
                return JSON.stringify({ error: "Open files list not available" });
              } catch(e) {
                return JSON.stringify({ error: e.message });
              }
            })()
          `,
        }));

        if (!response.success) {
          return backendToolErrorResponse("get_open_files", response);
        }

        let openFiles = response.data;
        if (typeof openFiles === "string") {
          try {
            openFiles = JSON.parse(openFiles);
          } catch {
            // Keep original string response
          }
        }

        return {
          content: [{ type: "text" as const, text: truncateText(safeStringify(openFiles), LARGE_TRUNCATION) }],
        };
      } catch (e) {
        return toolErrorResponse("get_open_files", e);
      }
    }
  );
}

// Main entry point
async function main() {
  registerResources();
  registerTools();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  socketClient.connect().catch((err) => {
    console.error(`[MCP Server] Could not connect to Cortex Desktop: ${errorText(err)}`);
  });

  const shutdown = () => {
    console.error("[MCP Server] Shutting down...");
    socketClient.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`[MCP Server] Fatal error: ${errorText(err)}`);
  socketClient.disconnect();
  process.exit(1);
});