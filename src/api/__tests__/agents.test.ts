import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import {
  fetchUserAgents,
  fetchAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  fetchAvailableTools,
  fetchAgentStats,
  fetchBuiltinAgents,
  generateAgentPrompt,
} from "@/api/agents";
import type { AgentFormData } from "@/types/agents";

const mockedInvoke = vi.mocked(invoke);

const createForm = (overrides: Partial<AgentFormData> = {}): AgentFormData => ({
  name: "My Agent",
  description: "Handles project tasks",
  model: "gpt-4",
  reasoningEffort: "high",
  tools: ["read_file", "write_file"],
  prompt: "You are an expert assistant.",
  scope: "project",
  ...overrides,
});

describe("agents api", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("fetchUserAgents loads store via IPC and maps metadata tags", async () => {
    mockedInvoke.mockResolvedValueOnce({
      version: "1.0",
      agents: [
        {
          id: "custom-a",
          name: "Custom A",
          description: "desc",
          systemPrompt: "prompt",
          model: "gpt-4",
          isBuiltIn: false,
          createdAt: 1,
          updatedAt: 2,
          allowedTools: ["read_file"],
          tags: ["scope:project", "reasoning:low", "color:#ff0000"],
        },
        {
          id: "builtin-code",
          name: "Code Agent",
          description: "builtin",
          systemPrompt: "builtin prompt",
          model: "gpt-4",
          isBuiltIn: true,
          createdAt: 3,
          updatedAt: 4,
          tags: [],
        },
      ],
      history: [],
    });

    const result = await fetchUserAgents();

    expect(mockedInvoke).toHaveBeenCalledWith("agent_store_load");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "custom-a",
      name: "Custom A",
      scope: "project",
      reasoningEffort: "low",
      color: "#ff0000",
      tools: ["read_file"],
      prompt: "prompt",
    });
    expect(result[0].filePath).toContain(".agents/");
  });

  it("fetchAgent resolves custom agent from store", async () => {
    mockedInvoke.mockResolvedValueOnce({
      version: "1.0",
      agents: [
        {
          id: "agent-1",
          name: "Agent One",
          description: "desc",
          system_prompt: "system",
          model: "gpt-4",
          is_built_in: false,
          created_at: 10,
          updated_at: 20,
          allowed_tools: ["search_files"],
          tags: ["scope:user", "reasoning:medium"],
        },
      ],
      history: [],
    });

    const result = await fetchAgent("agent-1");

    expect(result).toMatchObject({
      id: "agent-1",
      scope: "user",
      reasoningEffort: "medium",
      tools: ["search_files"],
      prompt: "system",
    });
  });

  it("fetchAgent falls back to builtin definitions", async () => {
    mockedInvoke.mockResolvedValueOnce({ version: "1.0", agents: [], history: [] });

    const result = await fetchAgent("builtin-code");

    expect(result.scope).toBe("builtin");
    expect(result.name).toContain("Code");
  });

  it("createAgent maps form data into agent_store_save args", async () => {
    mockedInvoke.mockResolvedValueOnce({ version: "1.0", agents: [], history: [] });
    mockedInvoke.mockResolvedValueOnce(undefined);

    const created = await createAgent(createForm());

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "agent_store_load");
    expect(mockedInvoke).toHaveBeenNthCalledWith(
      2,
      "agent_store_save",
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({
            id: "My Agent",
            name: "My Agent",
            description: "Handles project tasks",
            model: "gpt-4",
            isBuiltIn: false,
            allowedTools: ["read_file", "write_file"],
            tags: expect.arrayContaining(["scope:project", "reasoning:high"]),
          }),
        ]),
        history: [],
      }),
    );
    expect(created.scope).toBe("project");
  });

  it("updateAgent updates matching record and preserves non-metadata tags", async () => {
    mockedInvoke.mockResolvedValueOnce({
      version: "1.0",
      agents: [
        {
          id: "old-id",
          name: "Old Name",
          description: "old",
          systemPrompt: "old prompt",
          model: "gpt-4",
          isBuiltIn: false,
          createdAt: 100,
          updatedAt: 100,
          allowedTools: ["read_file"],
          deniedTools: [],
          tags: ["scope:user", "reasoning:low", "team:alpha"],
          enabled: true,
          status: "idle",
          agentType: "custom",
          tokensUsed: 0,
          costUsd: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
        },
      ],
      history: [],
    });
    mockedInvoke.mockResolvedValueOnce(undefined);

    const updated = await updateAgent(
      "old-id",
      createForm({
        name: "New Name",
        reasoningEffort: "medium",
        scope: "project",
        tools: ["search_files"],
      }),
    );

    expect(mockedInvoke).toHaveBeenNthCalledWith(
      2,
      "agent_store_save",
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({
            id: "New Name",
            name: "New Name",
            allowedTools: ["search_files"],
            tags: expect.arrayContaining(["team:alpha", "scope:project", "reasoning:medium"]),
          }),
        ]),
      }),
    );
    expect(updated.name).toBe("New Name");
    expect(updated.scope).toBe("project");
  });

  it("deleteAgent removes the target agent before saving", async () => {
    mockedInvoke.mockResolvedValueOnce({
      version: "1.0",
      agents: [
        { id: "a", name: "A", isBuiltIn: false, tags: [], createdAt: 1, updatedAt: 1 },
        { id: "b", name: "B", isBuiltIn: false, tags: [], createdAt: 1, updatedAt: 1 },
      ],
      history: [],
    });
    mockedInvoke.mockResolvedValueOnce(undefined);

    await deleteAgent("a");

    expect(mockedInvoke).toHaveBeenNthCalledWith(
      2,
      "agent_store_save",
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ id: "b" })]),
        history: [],
      }),
    );
  });

  it("fetchAvailableTools maps tool definitions and categories", async () => {
    mockedInvoke.mockResolvedValueOnce([
      { name: "read_file", description: "Read a file" },
      { name: "search_files", description: "Search content" },
      { name: "run_command", description: "Execute shell command" },
      { name: "fetch_url", description: "HTTP request" },
      { name: "custom_tool", description: "Misc helper" },
    ]);

    const tools = await fetchAvailableTools();

    expect(mockedInvoke).toHaveBeenCalledWith("tools_list");
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "read_file", category: "file" }),
        expect.objectContaining({ id: "search_files", category: "search" }),
        expect.objectContaining({ id: "run_command", category: "execution" }),
        expect.objectContaining({ id: "fetch_url", category: "network" }),
        expect.objectContaining({ id: "custom_tool", category: "utility" }),
      ]),
    );
  });

  it("fetchAgentStats computes invocation metrics from store/history", async () => {
    mockedInvoke.mockResolvedValueOnce({
      version: "1.0",
      agents: [
        {
          id: "agent-stats",
          name: "Agent Stats",
          isBuiltIn: false,
          createdAt: 1,
          updatedAt: 10,
          lastActiveAt: 50,
          tokensUsed: 300,
          tasksCompleted: 2,
          tasksFailed: 1,
          tags: [],
        },
      ],
      history: [
        { id: "h1", agentId: "agent-stats", status: "completed", tokensUsed: 100, startedAt: 20, completedAt: 30 },
      ],
    });

    const stats = await fetchAgentStats("agent-stats");

    expect(stats.totalInvocations).toBe(3);
    expect(stats.averageTokensUsed).toBe(100);
    expect(stats.successRate).toBeCloseTo(66.666, 2);
    expect(stats.lastUsed).toBeDefined();
  });

  it("fetchBuiltinAgents returns fallback builtins when store has none", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("store unavailable"));

    const builtin = await fetchBuiltinAgents();

    expect(builtin.length).toBeGreaterThan(0);
    expect(builtin.every((agent) => agent.scope === "builtin")).toBe(true);
  });

  it("generateAgentPrompt invokes backend command and returns normalized form data", async () => {
    mockedInvoke.mockResolvedValueOnce("Generated prompt body");

    const result = await generateAgentPrompt(
      "help me review pull requests quickly",
      ["read_file", "search_files", "read_file"],
      "Reviewer",
    );

    expect(mockedInvoke).toHaveBeenCalledWith("agent_generate_prompt", {
      description: "help me review pull requests quickly",
    });
    expect(result).toEqual({
      name: "Reviewer",
      description: "help me review pull requests quickly",
      model: "gpt-4",
      reasoningEffort: "medium",
      tools: ["read_file", "search_files"],
      prompt: "Generated prompt body",
      scope: "user",
    });
  });

  it("generateAgentPrompt derives name when omitted", async () => {
    mockedInvoke.mockResolvedValueOnce("Prompt text");

    const result = await generateAgentPrompt("analyze api security and auth flows", []);

    expect(result.name).toBe("Analyze Api Security And");
  });
});