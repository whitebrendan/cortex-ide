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

type ToolTextContent = {
  type: "text";
  text: string;
};

type ToolImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

type ToolContent = ToolTextContent | ToolImageContent;

interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

interface ResourceTextResult {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

const DEFAULT_TRUNCATION: TruncationConfig = {
  enabled: true,
  maxLength: 2000,
  maxLines: 100,
  truncateMessage: "... [truncated]",
};

function normalizePositiveLimit(limit: number | undefined): number | undefined {
  if (limit == null || !Number.isFinite(limit)) {
    return undefined;
  }

  const normalized = Math.floor(limit);
  return normalized > 0 ? normalized : undefined;
}

function truncateText(text: string, config: TruncationConfig = DEFAULT_TRUNCATION): string {
  if (!config.enabled || !text) {
    return text;
  }

  const suffix = config.truncateMessage ?? "";
  const maxLines = normalizePositiveLimit(config.maxLines);
  const maxLength = normalizePositiveLimit(config.maxLength);

  let result = text;
  let wasLineTruncated = false;

  if (maxLines != null) {
    let lineCount = 1;
    let cutIndex = -1;

    for (let i = 0; i < result.length; i++) {
      if (result.charCodeAt(i) !== 10) {
        continue;
      }

      if (lineCount >= maxLines) {
        cutIndex = i;
        break;
      }

      lineCount += 1;
    }

    if (cutIndex >= 0) {
      result = result.slice(0, cutIndex);
      wasLineTruncated = true;
    }
  }

  if (wasLineTruncated && suffix) {
    result = `${result}\n${suffix}`;
  }

  if (maxLength != null && result.length > maxLength) {
    if (!suffix) {
      return result.slice(0, maxLength);
    }

    const available = maxLength - suffix.length;
    if (available <= 0) {
      return suffix.slice(0, maxLength);
    }

    return `${result.slice(0, available)}${suffix}`;
  }

  return result;
}

// Workspace root from environment or cwd — normalized without trailing separator
const WORKSPACE_ROOT = path.resolve(process.env.CORTEX_WORKSPACE_ROOT || process.cwd());
let workspaceRootRealPathPromise: Promise<string> | null = null;

// Create MCP server instance
const server = new McpServer({
  name: "cortex-desktop-mcp",
  version: "1.0.0",
});

// Helper: format a caught error for tool responses
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isPathInside(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function getWorkspaceRootRealPath(): Promise<string> {
  const realPathPromise = workspaceRootRealPathPromise ?? fs.realpath(WORKSPACE_ROOT).catch((e: unknown) => {
    throw new Error(`Workspace root is not accessible: ${errorText(e)}`);
  });

  workspaceRootRealPathPromise = realPathPromise;
  return realPathPromise;
}

async function resolveNearestExistingPath(targetPath: string): Promise<{ existingPath: string; remaining: string[] }> {
  const remaining: string[] = [];
  let currentPath = targetPath;

  while (true) {
    try {
      const existingPath = await fs.realpath(currentPath);
      remaining.reverse();
      return { existingPath, remaining };
    } catch (e) {
      const err = e as { code?: string };
      if (err.code !== "ENOENT") {
        throw e;
      }

      const parent = path.dirname(currentPath);
      if (parent === currentPath) {
        throw new Error(`Unable to resolve path: ${targetPath}`);
      }

      remaining.push(path.basename(currentPath));
      currentPath = parent;
    }
  }
}

// Helper: resolve a path relative to workspace root, preventing path traversal
async function resolveSafePath(inputPath: string): Promise<string> {
  if (typeof inputPath !== "string" || !inputPath) {
    throw new Error("Path must be a non-empty string");
  }

  if (inputPath.includes("\0")) {
    throw new Error("Path contains null bytes");
  }

  const resolved = path.resolve(WORKSPACE_ROOT, inputPath);
  if (!isPathInside(WORKSPACE_ROOT, resolved)) {
    throw new Error(`Path traversal denied: ${inputPath}`);
  }

  const workspaceRootRealPath = await getWorkspaceRootRealPath();
  const { existingPath, remaining } = await resolveNearestExistingPath(resolved);
  const canonicalTargetPath = path.resolve(existingPath, ...remaining);

  if (!isPathInside(workspaceRootRealPath, canonicalTargetPath)) {
    throw new Error(`Path escapes workspace root via symlink: ${inputPath}`);
  }

  return resolved;
}

// Helper: detect MIME type from file extension
function mimeFromExt(filePath: string): string {
  if (!filePath) return "application/octet-stream";

  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return "text/plain";

  const mimeMap: Record<string, string> = {
    ".ts": "text/typescript", ".tsx": "text/typescript",
    ".js": "text/javascript", ".jsx": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".html": "text/html", ".htm": "text/html",
    ".css": "text/css",
    ".rs": "text/x-rust",
    ".py": "text/x-python",
    ".toml": "text/x-toml",
    ".yaml": "text/x-yaml", ".yml": "text/x-yaml",
    ".xml": "text/xml",
    ".sh": "text/x-shellscript",
    ".sql": "text/x-sql",
    ".txt": "text/plain",
  };

  return mimeMap[ext] ?? "application/octet-stream";
}

function toolErrorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

type ToolSchemaShape = z.ZodRawShape;
type ToolArgs<TSchema extends ToolSchemaShape> = z.infer<z.ZodObject<TSchema>>;

function registerTool<TSchema extends ToolSchemaShape>(
  name: string,
  description: string,
  schema: TSchema,
  handler: (args: ToolArgs<TSchema>) => Promise<ToolResult>,
): void {
  const wrapped = async (args: ToolArgs<TSchema>): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (e) {
      return toolErrorResult(`Error: ${errorText(e)}`);
    }
  };

  (server.tool as any)(name, description, schema, wrapped);
}

function registerResource<TParams extends Record<string, unknown>>(
  name: string,
  template: ResourceTemplate,
  handler: (uri: URL, params: TParams) => Promise<ResourceTextResult>,
): void {
  const wrapped = async (uri: URL, params: TParams): Promise<ResourceTextResult> => {
    try {
      return await handler(uri, params);
    } catch (e) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `Error reading resource: ${errorText(e)}`,
        }],
      };
    }
  };

  (server.resource as any)(name, template, wrapped);
}


// Register workspace resource templates
function registerResources() {
  registerResource(
    "workspace-file",
    new ResourceTemplate("cortex://workspace/{+filepath}", { list: undefined }),
    async (uri, params) => {
      const filepath = params.filepath;
      if (typeof filepath !== "string" || !filepath) {
        throw new Error("Invalid filepath parameter");
      }

      const safePath = await resolveSafePath(filepath);
      const content = await fs.readFile(safePath, "utf-8");
      return {
        contents: [{
          uri: uri.href,
          mimeType: mimeFromExt(safePath),
          text: content,
        }],
      };
    }
  );
}

// Register tools
function registerTools() {
  // Ping - test connectivity
  registerTool(
    "ping",
    "Test connectivity to Cortex Desktop",
    {},
    async () => {
      try {
        const response = await socketClient.sendCommand("ping", {});
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Take Screenshot
  registerTool(
    "take_screenshot",
    "Capture a screenshot of the Cortex Desktop window. Supports compression to reduce file size.",
    {
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
      quality: z.number().min(1).max(100).optional().describe("JPEG quality 1-100 (default: 75). Lower = smaller file, more compression"),
      maxWidth: z.number().optional().describe("Maximum width in pixels. Images larger than this will be resized proportionally"),
    },
    async (args) => {
      try {
        const response = await socketClient.sendCommand("takeScreenshot", {
          windowLabel: args.windowLabel || "main",
          quality: args.quality,
          maxWidth: args.maxWidth,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        const data = response.data as { data: string; width: number; height: number };
        return {
          content: [
            {
              type: "image" as const,
              data: data.data.replace(/^data:image\/\w+;base64,/, ""),
              mimeType: "image/jpeg",
            },
            {
              type: "text" as const,
              text: `Screenshot captured: ${data.width}x${data.height}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Get DOM
  registerTool(
    "get_dom",
    "Get the HTML DOM content from Cortex Desktop",
    {
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
      selector: z.string().optional().describe("CSS selector to get specific element (optional)"),
    },
    async (args) => {
      try {
        const response = await socketClient.sendCommand("getDom", {
          windowLabel: args.windowLabel || "main",
          selector: args.selector,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Execute JavaScript
  registerTool(
    "execute_js",
    "Execute JavaScript code in Cortex Desktop",
    {
      script: z.string().describe("JavaScript code to execute"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = await socketClient.sendCommand("executeJs", {
          windowLabel: args.windowLabel || "main",
          script: args.script,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Manage Window
  registerTool(
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
        const response = await socketClient.sendCommand("manageWindow", {
          windowLabel: args.windowLabel || "main",
          operation: args.operation,
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: `Window operation '${args.operation}' completed` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Text Input
  registerTool(
    "text_input",
    "Simulate keyboard text input",
    {
      text: z.string().describe("Text to type"),
      delayMs: z.number().optional().default(20).describe("Delay between keystrokes in milliseconds (default: 20)"),
    },
    async (args) => {
      try {
        const response = await socketClient.sendCommand("textInput", {
          text: args.text,
          delayMs: args.delayMs || 20,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: `Typed ${args.text.length} characters` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Mouse Movement
  registerTool(
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
        const response = await socketClient.sendCommand("mouseMovement", {
          action: args.action,
          x: args.x,
          y: args.y,
          scrollX: args.scrollX,
          scrollY: args.scrollY,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: `Mouse action '${args.action}' completed` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // LocalStorage
  registerTool(
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
        const response = await socketClient.sendCommand("manageLocalStorage", {
          windowLabel: args.windowLabel || "main",
          operation: args.operation,
          key: args.key,
          value: args.value,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Get Element Position
  registerTool(
    "get_element_position",
    "Get the screen position of a DOM element",
    {
      selector: z.string().describe("CSS selector for the element"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = await socketClient.sendCommand("getElementPosition", {
          windowLabel: args.windowLabel || "main",
          selector: args.selector,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Send Text to Element
  registerTool(
    "send_text_to_element",
    "Send text to a specific DOM element (focuses and sets value)",
    {
      selector: z.string().describe("CSS selector for the element"),
      text: z.string().describe("Text to send to the element"),
      windowLabel: z.string().optional().default("main").describe("Window label (default: 'main')"),
    },
    async (args) => {
      try {
        const response = await socketClient.sendCommand("sendTextToElement", {
          windowLabel: args.windowLabel || "main",
          selector: args.selector,
          text: args.text,
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: `Text sent to element '${args.selector}'` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // List Windows
  registerTool(
    "list_windows",
    "List all available windows in Cortex Desktop",
    {},
    async () => {
      try {
        const response = await socketClient.sendCommand("listWindows", {});

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // ========================================================================
  // Workspace Tools — operate directly on the filesystem
  // ========================================================================

  // Read File
  registerTool(
    "read_file",
    "Read the contents of a file from the workspace. Supports optional line range.",
    {
      path: z.string().describe("File path (relative to workspace root or absolute)"),
      start_line: z.number().optional().default(1).describe("Starting line number (1-based, default: 1)"),
      max_lines: z.number().optional().describe("Maximum number of lines to read (omit for all)"),
    },
    async (args) => {
      try {
        const safePath = await resolveSafePath(args.path);
        const raw = await fs.readFile(safePath, "utf-8");
        const allLines = raw.split("\n");
        const start = Math.max(0, (args.start_line ?? 1) - 1);
        const selected = args.max_lines != null
          ? allLines.slice(start, start + args.max_lines)
          : allLines.slice(start);
        const numbered = selected.map((line: string, i: number) => `${start + i + 1}: ${line}`);
        const text = truncateText(numbered.join("\n"), { enabled: true, maxLength: 50000, maxLines: 500, truncateMessage: "... [truncated]" });
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error reading file: ${errorText(e)}` }],
          isError: true,
        };
      }
    }
  );

  // Write File
  registerTool(
    "write_file",
    "Write content to a file in the workspace. Creates parent directories if needed.",
    {
      path: z.string().describe("File path (relative to workspace root or absolute)"),
      content: z.string().describe("Content to write to the file"),
    },
    async (args) => {
      try {
        const safePath = await resolveSafePath(args.path);
        const dir = path.dirname(safePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(safePath, args.content, "utf-8");
        return {
          content: [{ type: "text" as const, text: `Wrote ${args.content.length} bytes to ${args.path}` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error writing file: ${errorText(e)}` }],
          isError: true,
        };
      }
    }
  );

  // List Directory
  registerTool(
    "list_directory",
    "List files and directories at a given path in the workspace.",
    {
      path: z.string().default(".").describe("Directory path (relative to workspace root, default: '.')"),
      include_hidden: z.boolean().optional().default(false).describe("Include hidden files/directories (default: false)"),
    },
    async (args) => {
      try {
        const safePath = await resolveSafePath(args.path);
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
          content: [{ type: "text" as const, text: JSON.stringify({ entries: results }, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error listing directory: ${errorText(e)}` }],
          isError: true,
        };
      }
    }
  );

  // Search Code
  registerTool(
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
        const searchDir = await resolveSafePath(args.directory ?? ".");
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
          content: [{ type: "text" as const, text: JSON.stringify({ results, total: results.length }, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error searching code: ${errorText(e)}` }],
          isError: true,
        };
      }
    }
  );

  // Run Terminal Command
  registerTool(
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
        const cwd = args.cwd ? await resolveSafePath(args.cwd) : WORKSPACE_ROOT;
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
          JSON.stringify({
            exit_code: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }, null, 2),
          { enabled: true, maxLength: 50000, maxLines: 500, truncateMessage: "... [truncated]" }
        );

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error running command: ${errorText(e)}` }],
          isError: true,
        };
      }
    }
  );

  // Get Diagnostics (via Cortex Desktop socket)
  registerTool(
    "get_diagnostics",
    "Get diagnostics (errors, warnings) from the Cortex Desktop workspace. Requires Cortex Desktop to be running.",
    {
      file_path: z.string().optional().describe("Filter diagnostics by file path (optional)"),
      severity: z.enum(["error", "warning", "information", "hint"]).optional().describe("Filter by severity (optional)"),
    },
    async () => {
      try {
        const response = await socketClient.sendCommand("executeJs", {
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
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error || "Failed to get diagnostics. Is Cortex Desktop running?"}` }],
            isError: true,
          };
        }

        let diagnostics = response.data;
        if (typeof diagnostics === "string") {
          try { diagnostics = JSON.parse(diagnostics); } catch { /* keep as string */ }
        }

        return {
          content: [{ type: "text" as const, text: truncateText(JSON.stringify(diagnostics, null, 2)) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error getting diagnostics: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );

  // Get Open Files (via Cortex Desktop socket)
  registerTool(
    "get_open_files",
    "Get the list of currently open files in Cortex Desktop. Requires Cortex Desktop to be running.",
    {},
    async () => {
      try {
        const response = await socketClient.sendCommand("executeJs", {
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
        });

        if (!response.success) {
          return {
            content: [{ type: "text" as const, text: `Error: ${response.error || "Failed to get open files. Is Cortex Desktop running?"}` }],
            isError: true,
          };
        }

        let openFiles = response.data;
        if (typeof openFiles === "string") {
          try { openFiles = JSON.parse(openFiles); } catch { /* keep as string */ }
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(openFiles, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error getting open files: ${errorText(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
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
