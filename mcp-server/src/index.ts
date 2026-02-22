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

const DEFAULT_TRUNCATION: TruncationConfig = {
  enabled: true,
  maxLength: 2000,
  maxLines: 100,
  truncateMessage: "... [truncated]",
};

function truncateText(text: string, config: TruncationConfig = DEFAULT_TRUNCATION): string {
  if (!config.enabled) {
    return text;
  }

  let result = text;

  if (config.maxLines && config.maxLines > 0) {
    const lines = result.split('\n');
    if (lines.length > config.maxLines) {
      result = lines.slice(0, config.maxLines).join('\n');
      if (config.truncateMessage) {
        result += '\n' + config.truncateMessage;
      }
    }
  }

  if (config.maxLength && config.maxLength > 0 && result.length > config.maxLength) {
    result = result.substring(0, config.maxLength);
    if (config.truncateMessage) {
      result += config.truncateMessage;
    }
  }

  return result;
}

// Workspace root from environment or cwd
const WORKSPACE_ROOT = process.env.CORTEX_WORKSPACE_ROOT || process.cwd();

// Create MCP server instance
const server = new McpServer({
  name: "cortex-desktop-mcp",
  version: "1.0.0",
});

const truncationSchema = z.object({
  enabled: z.boolean().optional().default(true).describe("Enable truncation (default: true)"),
  maxLength: z.number().optional().default(2000).describe("Maximum character length (default: 2000)"),
  maxLines: z.number().optional().default(100).describe("Maximum number of lines (default: 100)"),
  truncateMessage: z.string().optional().default("... [truncated]").describe("Message to append when truncated (default: '... [truncated]')"),
}).optional();

// Helper: resolve a path relative to workspace root, preventing path traversal
function resolveSafePath(inputPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, inputPath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Path traversal denied: ${inputPath}`);
  }
  return resolved;
}

// Helper: detect MIME type from file extension
function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
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
  return mimeMap[ext] || "text/plain";
}

// Register workspace resource templates
function registerResources() {
  server.resource(
    "workspace-file",
    new ResourceTemplate("cortex://workspace/{+filepath}", { list: undefined }),
    async (uri, params) => {
      const filepath = params.filepath as string;
      const safePath = resolveSafePath(filepath);
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
  server.tool(
    "ping",
    "Test connectivity to Cortex Desktop",
    {},
    async () => {
      const response = await socketClient.sendCommand("ping", {});
      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
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
      const response = await socketClient.sendCommand("takeScreenshot", {
        windowLabel: args.windowLabel || "main",
        quality: args.quality,
        maxWidth: args.maxWidth,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      const data = response.data as { data: string; width: number; height: number };
      return {
        content: [
          {
            type: "image",
            data: data.data.replace(/^data:image\/\w+;base64,/, ""),
            mimeType: "image/jpeg",
          },
          {
            type: "text",
            text: `Screenshot captured: ${data.width}x${data.height}`,
          },
        ],
      };
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
      const response = await socketClient.sendCommand("getDom", {
        windowLabel: args.windowLabel || "main",
        selector: args.selector,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
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
      const response = await socketClient.sendCommand("executeJs", {
        windowLabel: args.windowLabel || "main",
        script: args.script,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
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
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Window operation '${args.operation}' completed` }],
      };
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
      const response = await socketClient.sendCommand("textInput", {
        text: args.text,
        delayMs: args.delayMs || 20,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Typed ${args.text.length} characters` }],
      };
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
      const response = await socketClient.sendCommand("mouseMovement", {
        action: args.action,
        x: args.x,
        y: args.y,
        scrollX: args.scrollX,
        scrollY: args.scrollY,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Mouse action '${args.action}' completed` }],
      };
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
      const response = await socketClient.sendCommand("manageLocalStorage", {
        windowLabel: args.windowLabel || "main",
        operation: args.operation,
        key: args.key,
        value: args.value,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
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
      const response = await socketClient.sendCommand("getElementPosition", {
        windowLabel: args.windowLabel || "main",
        selector: args.selector,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
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
      const response = await socketClient.sendCommand("sendTextToElement", {
        windowLabel: args.windowLabel || "main",
        selector: args.selector,
        text: args.text,
      });

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Text sent to element '${args.selector}'` }],
      };
    }
  );

  // List Windows
  server.tool(
    "list_windows",
    "List all available windows in Cortex Desktop",
    {},
    async () => {
      const response = await socketClient.sendCommand("listWindows", {});

      if (!response.success) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      };
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
        const text = truncateText(numbered.join("\n"), { enabled: true, maxLength: 50000, maxLines: 500, truncateMessage: "... [truncated]" });
        return {
          content: [{ type: "text", text }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error reading file: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
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
          content: [{ type: "text", text: `Wrote ${args.content.length} bytes to ${args.path}` }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error writing file: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
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
          content: [{ type: "text", text: JSON.stringify({ entries: results }, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error listing directory: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
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
          content: [{ type: "text", text: JSON.stringify({ results, total: results.length }, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error searching code: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
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
          JSON.stringify({
            exit_code: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }, null, 2),
          { enabled: true, maxLength: 50000, maxLines: 500, truncateMessage: "... [truncated]" }
        );

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error running command: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
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
            content: [{ type: "text", text: `Error: ${response.error || "Failed to get diagnostics. Is Cortex Desktop running?"}` }],
            isError: true,
          };
        }

        let diagnostics = response.data;
        if (typeof diagnostics === "string") {
          try { diagnostics = JSON.parse(diagnostics); } catch { /* keep as string */ }
        }

        return {
          content: [{ type: "text", text: truncateText(JSON.stringify(diagnostics, null, 2)) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error getting diagnostics: ${e instanceof Error ? e.message : String(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
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
            content: [{ type: "text", text: `Error: ${response.error || "Failed to get open files. Is Cortex Desktop running?"}` }],
            isError: true,
          };
        }

        let openFiles = response.data;
        if (typeof openFiles === "string") {
          try { openFiles = JSON.parse(openFiles); } catch { /* keep as string */ }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(openFiles, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error getting open files: ${e instanceof Error ? e.message : String(e)}. Is Cortex Desktop running?` }],
          isError: true,
        };
      }
    }
  );
}

// Main entry point
async function main() {
  // Register resources and tools FIRST (before connecting transport)
  registerResources();
  registerTools();

  // Create and connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Connect to Cortex Desktop socket in background (don't block MCP initialization)
  socketClient.connect().catch(() => {
    // Silent fail - Cortex Desktop may not be running
  });
}

main();
