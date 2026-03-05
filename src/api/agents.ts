/**
 * API functions for agent management
 */

import type { Agent, AgentFormData, AvailableTool, AgentStats } from "@/types/agents";

const API_BASE = "/api/v1";
const VALID_REASONING_EFFORTS: ReadonlySet<AgentFormData["reasoningEffort"]> = new Set([
  "low",
  "medium",
  "high",
]);
const VALID_AGENT_SCOPES: ReadonlySet<Agent["scope"]> = new Set([
  "project",
  "user",
  "builtin",
]);
const VALID_FORM_SCOPES: ReadonlySet<AgentFormData["scope"]> = new Set([
  "project",
  "user",
]);
const VALID_TOOL_CATEGORIES: ReadonlySet<AvailableTool["category"]> = new Set([
  "file",
  "search",
  "execution",
  "network",
  "utility",
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`Invalid ${fieldName}: expected a non-empty string`);
  }

  return value.trim();
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}: expected a string`);
  }

  return value;
}

function isReasoningEffort(value: unknown): value is AgentFormData["reasoningEffort"] {
  return typeof value === "string" && VALID_REASONING_EFFORTS.has(value as AgentFormData["reasoningEffort"]);
}

function isAgentScope(value: unknown): value is Agent["scope"] {
  return typeof value === "string" && VALID_AGENT_SCOPES.has(value as Agent["scope"]);
}

function isAgentFormScope(value: unknown): value is AgentFormData["scope"] {
  return typeof value === "string" && VALID_FORM_SCOPES.has(value as AgentFormData["scope"]);
}

function isToolCategory(value: unknown): value is AvailableTool["category"] {
  return typeof value === "string" && VALID_TOOL_CATEGORIES.has(value as AvailableTool["category"]);
}

function normalizeToolsArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: expected an array of strings`);
  }

  return value.map((tool, index) => {
    if (typeof tool !== "string" || tool.trim().length === 0) {
      throw new Error(`Invalid ${fieldName}[${index}]: expected a non-empty string`);
    }

    return tool.trim();
  });
}

function normalizeAgentId(agentId: string, action: string): string {
  return encodeURIComponent(requireNonEmptyString(agentId, `${action} agentId`));
}

function normalizeAgentFormData(data: AgentFormData, action: string): AgentFormData {
  if (!isRecord(data)) {
    throw new Error(`Invalid ${action} payload: expected an object`);
  }

  const normalizedData: AgentFormData = {
    name: requireNonEmptyString(data.name, `${action} payload.name`),
    description: requireString(data.description, `${action} payload.description`).trim(),
    model: requireNonEmptyString(data.model, `${action} payload.model`),
    reasoningEffort: (() => {
      if (!isReasoningEffort(data.reasoningEffort)) {
        throw new Error(
          `Invalid ${action} payload.reasoningEffort: expected one of low, medium, high`
        );
      }

      return data.reasoningEffort;
    })(),
    tools: normalizeToolsArray(data.tools, `${action} payload.tools`),
    prompt: requireString(data.prompt, `${action} payload.prompt`),
    scope: (() => {
      if (!isAgentFormScope(data.scope)) {
        throw new Error(`Invalid ${action} payload.scope: expected project or user`);
      }

      return data.scope;
    })(),
  };

  if (data.color !== undefined) {
    if (typeof data.color !== "string") {
      throw new Error(`Invalid ${action} payload.color: expected a string`);
    }

    const trimmedColor = data.color.trim();
    if (trimmedColor.length > 0) {
      normalizedData.color = trimmedColor;
    }
  }

  return normalizedData;
}

function isAgent(value: unknown): value is Agent {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    typeof value.description !== "string" ||
    !Array.isArray(value.tools) ||
    !value.tools.every((tool) => typeof tool === "string") ||
    typeof value.prompt !== "string" ||
    !isAgentScope(value.scope)
  ) {
    return false;
  }

  if (value.color !== undefined && typeof value.color !== "string") {
    return false;
  }

  if (value.model !== undefined && typeof value.model !== "string") {
    return false;
  }

  if (value.reasoningEffort !== undefined && !isReasoningEffort(value.reasoningEffort)) {
    return false;
  }

  if (value.filePath !== undefined && typeof value.filePath !== "string") {
    return false;
  }

  if (value.createdAt !== undefined && typeof value.createdAt !== "string") {
    return false;
  }

  if (value.updatedAt !== undefined && typeof value.updatedAt !== "string") {
    return false;
  }

  return true;
}

function isAvailableTool(value: unknown): value is AvailableTool {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.description === "string" &&
    isToolCategory(value.category)
  );
}

function isAgentStats(value: unknown): value is AgentStats {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidCoreFields =
    typeof value.totalInvocations === "number" &&
    Number.isFinite(value.totalInvocations) &&
    typeof value.averageTokensUsed === "number" &&
    Number.isFinite(value.averageTokensUsed) &&
    typeof value.successRate === "number" &&
    Number.isFinite(value.successRate);

  if (!hasValidCoreFields) {
    return false;
  }

  if (value.lastUsed !== undefined && typeof value.lastUsed !== "string") {
    return false;
  }

  return true;
}

function isAgentFormData(value: unknown): value is AgentFormData {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !isNonEmptyString(value.name) ||
    typeof value.description !== "string" ||
    !isNonEmptyString(value.model) ||
    !isReasoningEffort(value.reasoningEffort) ||
    !Array.isArray(value.tools) ||
    !value.tools.every((tool) => typeof tool === "string") ||
    typeof value.prompt !== "string" ||
    !isAgentFormScope(value.scope)
  ) {
    return false;
  }

  if (value.color !== undefined && typeof value.color !== "string") {
    return false;
  }

  return true;
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const details: string[] = [];

  for (const key of ["message", "error", "detail", "reason"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      details.push(value.trim());
    }
  }

  const errors = payload.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      if (typeof error === "string" && error.trim().length > 0) {
        details.push(error.trim());
      }
    }
  }

  return details.length > 0 ? details.join(" | ") : null;
}

async function parseErrorDetail(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      return extractErrorMessage(payload);
    } catch {
      return null;
    }
  }

  try {
    const text = (await response.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function request(endpoint: string, action: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE}${endpoint}`, init);

  if (response.ok) {
    return response;
  }

  const detail = await parseErrorDetail(response);
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const baseMessage = `${action} failed (${response.status}${statusText})`;

  throw new Error(detail ? `${baseMessage}: ${detail}` : baseMessage);
}

async function parseJsonResponse(response: Response, action: string): Promise<unknown> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(`${action} failed: invalid JSON response`);
  }

  if (payload === null || payload === undefined) {
    throw new Error(`${action} failed: response body was empty`);
  }

  return payload;
}

async function requestJson(
  endpoint: string,
  action: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await request(endpoint, action, init);
  return parseJsonResponse(response, action);
}

function parseArrayResponse<T>(
  payload: unknown,
  action: string,
  validator: (value: unknown) => value is T
): T[] {
  if (!Array.isArray(payload)) {
    throw new Error(`${action} failed: expected an array response`);
  }

  for (let index = 0; index < payload.length; index += 1) {
    if (!validator(payload[index])) {
      throw new Error(`${action} failed: invalid item at index ${index}`);
    }
  }

  return payload as T[];
}

function parseObjectResponse<T>(
  payload: unknown,
  action: string,
  validator: (value: unknown) => value is T
): T {
  if (!validator(payload)) {
    throw new Error(`${action} failed: invalid response payload`);
  }

  return payload;
}

/**
 * Fetch all user agents
 */
export async function fetchUserAgents(): Promise<Agent[]> {
  const payload = await requestJson("/agents", "Fetch agents");
  return parseArrayResponse(payload, "Fetch agents", isAgent);
}

/**
 * Fetch a single agent by ID
 */
export async function fetchAgent(agentId: string): Promise<Agent> {
  const normalizedAgentId = normalizeAgentId(agentId, "fetchAgent");
  const payload = await requestJson(`/agents/${normalizedAgentId}`, "Fetch agent");
  return parseObjectResponse(payload, "Fetch agent", isAgent);
}

/**
 * Create a new agent
 */
export async function createAgent(data: AgentFormData): Promise<Agent> {
  const payloadData = normalizeAgentFormData(data, "createAgent");
  const payload = await requestJson("/agents", "Create agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadData),
  });

  return parseObjectResponse(payload, "Create agent", isAgent);
}

/**
 * Update an existing agent
 */
export async function updateAgent(
  agentId: string,
  data: AgentFormData
): Promise<Agent> {
  const normalizedAgentId = normalizeAgentId(agentId, "updateAgent");
  const payloadData = normalizeAgentFormData(data, "updateAgent");
  const payload = await requestJson(`/agents/${normalizedAgentId}`, "Update agent", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadData),
  });

  return parseObjectResponse(payload, "Update agent", isAgent);
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const normalizedAgentId = normalizeAgentId(agentId, "deleteAgent");
  await request(`/agents/${normalizedAgentId}`, "Delete agent", {
    method: "DELETE",
  });
}

/**
 * Fetch available tools that can be assigned to agents
 */
export async function fetchAvailableTools(): Promise<AvailableTool[]> {
  const payload = await requestJson("/agents/tools", "Fetch available tools");
  return parseArrayResponse(payload, "Fetch available tools", isAvailableTool);
}

/**
 * Fetch agent statistics
 */
export async function fetchAgentStats(agentId: string): Promise<AgentStats> {
  const normalizedAgentId = normalizeAgentId(agentId, "fetchAgentStats");
  const payload = await requestJson(
    `/agents/${normalizedAgentId}/stats`,
    "Fetch agent statistics"
  );

  return parseObjectResponse(payload, "Fetch agent statistics", isAgentStats);
}

/**
 * Fetch built-in agents
 */
export async function fetchBuiltinAgents(): Promise<Agent[]> {
  const payload = await requestJson("/agents/builtin", "Fetch built-in agents");
  return parseArrayResponse(payload, "Fetch built-in agents", isAgent);
}

/**
 * Generate agent prompt using AI
 */
export async function generateAgentPrompt(
  description: string,
  tools?: string[],
  name?: string
): Promise<AgentFormData> {
  const normalizedDescription = requireNonEmptyString(
    description,
    "generateAgentPrompt description"
  );
  const normalizedTools =
    tools === undefined
      ? undefined
      : normalizeToolsArray(tools, "generateAgentPrompt tools");
  const normalizedName =
    name === undefined ? undefined : requireNonEmptyString(name, "generateAgentPrompt name");

  const requestBody: {
    description: string;
    tools?: string[];
    name?: string;
  } = {
    description: normalizedDescription,
  };

  if (normalizedTools !== undefined) {
    requestBody.tools = normalizedTools;
  }

  if (normalizedName !== undefined) {
    requestBody.name = normalizedName;
  }

  const payload = await requestJson("/agents/generate-prompt", "Generate agent prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  return parseObjectResponse(payload, "Generate agent prompt", isAgentFormData);
}
