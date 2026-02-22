/**
 * MCP Tools Panel Component
 *
 * UI for managing the MCP bridge (Node.js workspace tools server).
 * Shows bridge status, available workspace tools, and allows
 * starting/stopping the bridge and invoking tools.
 */

import { createSignal, For, Show } from "solid-js";
import { Icon } from "../ui/Icon";
import { Button, IconButton, Textarea } from "@/components/ui";
import { invoke } from "@tauri-apps/api/core";

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface MCPToolsPanelProps {
  projectPath?: string;
  compact?: boolean;
}

export function MCPToolsPanel(props: MCPToolsPanelProps) {
  const [bridgeRunning, setBridgeRunning] = createSignal(false);
  const [tools, setTools] = createSignal<MCPTool[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedTool, setSelectedTool] = createSignal<MCPTool | null>(null);
  const [toolArgs, setToolArgs] = createSignal("{}");
  const [toolResult, setToolResult] = createSignal<string | null>(null);
  const [executingTool, setExecutingTool] = createSignal(false);

  const refreshTools = async () => {
    try {
      const response = await invoke<{ tools: MCPTool[] }>("mcp_bridge_list_tools");
      setTools(response.tools || []);
      setError(null);
    } catch (e) {
      setError(String(e));
      setTools([]);
    }
  };

  const startBridge = async () => {
    if (!props.projectPath) {
      setError("No project path specified");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await invoke("mcp_bridge_start", { projectPath: props.projectPath });
      setBridgeRunning(true);
      await refreshTools();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const stopBridge = async () => {
    setLoading(true);
    try {
      await invoke("mcp_bridge_stop");
      setBridgeRunning(false);
      setTools([]);
      setSelectedTool(null);
      setToolResult(null);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const executeTool = async () => {
    const tool = selectedTool();
    if (!tool) return;

    setExecutingTool(true);
    setToolResult(null);
    try {
      let args: Record<string, unknown> | undefined;
      const raw = toolArgs().trim();
      if (raw && raw !== "{}") {
        args = JSON.parse(raw);
      }
      const result = await invoke<unknown>("mcp_bridge_call_tool", {
        name: tool.name,
        arguments: args,
      });
      setToolResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setToolResult(`Error: ${String(e)}`);
    } finally {
      setExecutingTool(false);
    }
  };

  return (
    <div class="flex flex-col h-full text-sm">
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border">
        <div class="flex items-center gap-2">
          <Icon name="terminal" size={16} />
          <span class="font-medium">MCP Workspace Tools</span>
        </div>
        <div class="flex items-center gap-1">
          <Show when={bridgeRunning()}>
            <span class="text-xs text-green-500 mr-1">● Running</span>
            <IconButton
              icon="refresh-cw"
              size="sm"
              title="Refresh tools"
              onClick={refreshTools}
            />
            <IconButton
              icon="square"
              size="sm"
              title="Stop bridge"
              onClick={stopBridge}
              disabled={loading()}
            />
          </Show>
          <Show when={!bridgeRunning()}>
            <span class="text-xs text-muted-foreground mr-1">● Stopped</span>
            <IconButton
              icon="play"
              size="sm"
              title="Start bridge"
              onClick={startBridge}
              disabled={loading()}
            />
          </Show>
        </div>
      </div>

      {/* Error banner */}
      <Show when={error()}>
        <div class="px-3 py-1.5 text-xs text-red-400 bg-red-900/20 border-b border-border">
          {error()}
        </div>
      </Show>

      {/* Tool list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={tools().length > 0}
          fallback={
            <div class="px-3 py-4 text-xs text-muted-foreground text-center">
              <Show when={bridgeRunning()} fallback="Start the bridge to see workspace tools">
                No tools available
              </Show>
            </div>
          }
        >
          <For each={tools()}>
            {(tool) => (
              <div
                class={`px-3 py-2 border-b border-border/50 cursor-pointer hover:bg-accent/50 ${
                  selectedTool()?.name === tool.name ? "bg-accent" : ""
                }`}
                onClick={() => {
                  setSelectedTool(tool);
                  setToolArgs("{}");
                  setToolResult(null);
                }}
              >
                <div class="flex items-center gap-2">
                  <Icon name="wrench" size={14} class="text-muted-foreground" />
                  <span class="font-mono text-xs">{tool.name}</span>
                </div>
                <Show when={tool.description}>
                  <p class="mt-0.5 text-xs text-muted-foreground pl-5 line-clamp-2">
                    {tool.description}
                  </p>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* Tool invocation panel */}
      <Show when={selectedTool()}>
        <div class="border-t border-border p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-medium">{selectedTool()!.name}</span>
            <IconButton
              icon="x"
              size="sm"
              title="Close"
              onClick={() => {
                setSelectedTool(null);
                setToolResult(null);
              }}
            />
          </div>
          <Textarea
            value={toolArgs()}
            onInput={(e) => setToolArgs(e.currentTarget.value)}
            placeholder='{"key": "value"}'
            class="font-mono text-xs h-16 resize-none"
          />
          <Button
            size="sm"
            onClick={executeTool}
            disabled={executingTool()}
            class="w-full"
          >
            {executingTool() ? "Running…" : "Run Tool"}
          </Button>
          <Show when={toolResult()}>
            <pre class="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">
              {toolResult()}
            </pre>
          </Show>
        </div>
      </Show>
    </div>
  );
}
