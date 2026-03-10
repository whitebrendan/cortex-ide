import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgent,
  deleteAgent,
  fetchAgent,
  fetchAgentStats,
  fetchAvailableTools,
  fetchBuiltinAgents,
  fetchUserAgents,
  generateAgentPrompt,
  updateAgent,
} from "@/api/agents";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const sampleAgent = {
  id: "agent-1",
  name: "reviewer",
  description: "Reviews code",
  color: "#4caf50",
  tools: ["Read", "Grep"],
  model: "gpt-4o",
  reasoningEffort: "high",
  prompt: "Review the diff carefully",
  scope: "user",
  filePath: ".cortex/agents/reviewer.md",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
} as const;

describe("src/api/agents", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", originalFetch);
  });

  it("parses agent collections", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([sampleAgent]));

    const result = await fetchUserAgents();

    expect(result).toEqual([sampleAgent]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/agents",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("sanitizes create payloads before posting", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleAgent));

    await createAgent({
      name: " reviewer ",
      description: "  Reviews code  ",
      model: " gpt-4o ",
      reasoningEffort: "high",
      tools: [" Read ", "Read", "Grep", "   "],
      prompt: "  Review the diff carefully\n",
      color: "  #4caf50  ",
      scope: "user",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      name: "reviewer",
      description: "Reviews code",
      model: "gpt-4o",
      reasoningEffort: "high",
      tools: ["Read", "Grep"],
      prompt: "  Review the diff carefully\n",
      color: "#4caf50",
      scope: "user",
    });
  });

  it("rejects invalid editable scopes before sending requests", async () => {
    const promise = createAgent({
      name: "reviewer",
      description: "Reviews code",
      model: "gpt-4o",
      reasoningEffort: "high",
      tools: ["Read"],
      prompt: "Review the diff carefully",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: "builtin" as any,
    });

    await expect(promise).rejects.toMatchObject({
      name: "ApiError",
      message: "agentFormData.scope must be one of project, user",
      code: "INVALID_INPUT",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes agent ids for updates and deletes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ...sampleAgent, scope: "project" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await updateAgent("agent/one?draft=true", {
      name: "reviewer",
      description: "Reviews code",
      model: "gpt-4o",
      reasoningEffort: "high",
      tools: ["Read"],
      prompt: "Review",
      scope: "project",
    });
    await deleteAgent("agent/one?draft=true");

    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "/api/v1/agents/agent%2Fone%3Fdraft%3Dtrue",
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "/api/v1/agents/agent%2Fone%3Fdraft%3Dtrue",
    );
  });

  it("parses builtin agents and tool metadata", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ ...sampleAgent, scope: "builtin" }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "Read",
            name: "Read",
            description: "Read files",
            category: "file",
          },
        ]),
      );

    const builtinAgents = await fetchBuiltinAgents();
    const tools = await fetchAvailableTools();

    expect(builtinAgents[0].scope).toBe("builtin");
    expect(tools).toEqual([
      {
        id: "Read",
        name: "Read",
        description: "Read files",
        category: "file",
      },
    ]);
  });

  it("maps not-found errors for agent fetches", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "missing" }, { status: 404 }));

    await expect(fetchAgent("missing-agent")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Agent not found",
        status: 404,
      }),
    );
  });

  it("parses agent statistics", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        totalInvocations: 12,
        averageTokensUsed: 345.5,
        successRate: 0.98,
        lastUsed: "2025-01-02T00:00:00.000Z",
      }),
    );

    const result = await fetchAgentStats("agent-1");

    expect(result).toEqual({
      totalInvocations: 12,
      averageTokensUsed: 345.5,
      successRate: 0.98,
      lastUsed: "2025-01-02T00:00:00.000Z",
    });
  });

  it("uses the extended timeout for prompt generation and sanitizes payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: "generated-agent",
        description: "Generated description",
        model: "inherit",
        reasoningEffort: "medium",
        tools: ["Read", "Grep"],
        prompt: "Generated prompt",
        scope: "project",
      }),
    );

    const result = await generateAgentPrompt("  Generate something  ", [" Read ", "Read"], " helper ");

    expect(result).toEqual({
      name: "generated-agent",
      description: "Generated description",
      model: "inherit",
      reasoningEffort: "medium",
      tools: ["Read", "Grep"],
      prompt: "Generated prompt",
      scope: "project",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      description: "Generate something",
      tools: ["Read"],
      name: "helper",
    });
  });

  it("rejects malformed generated prompt payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: "generated-agent",
        description: "Generated description",
        model: "inherit",
        reasoningEffort: "medium",
        tools: ["Read"],
        prompt: 42,
        scope: "project",
      }),
    );

    const promise = generateAgentPrompt("Generate something");

    await expect(promise).rejects.toMatchObject({
      name: "ApiError",
      message: "Received an invalid generated agent prompt response",
      code: "INVALID_RESPONSE",
    });
  });
});
