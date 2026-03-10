/**
 * API functions for agent management
 */

import type { Agent, AgentFormData, AvailableTool, AgentStats } from "@/types/agents";
import {
  type RequestOptions,
  assertArray,
  assertEnum,
  assertNumber,
  assertOptionalString,
  assertRecord,
  assertString,
  encodePathSegment,
  optionalTrimmedString,
  requestJson,
  requestVoid,
  requireNonEmptyString,
  sanitizeStringList,
  toApiInputError,
} from "@/api/http";

const API_BASE = "/api/v1";
const AGENT_SCOPES = ["project", "user", "builtin"] as const;
const EDITABLE_SCOPES = ["project", "user"] as const;
const REASONING_EFFORTS = ["low", "medium", "high"] as const;
const TOOL_CATEGORIES = ["file", "search", "execution", "network", "utility"] as const;
const GENERATE_PROMPT_TIMEOUT_MS = 60_000;

/**
 * Fetch all user agents
 */
export async function fetchUserAgents(
  options: RequestOptions = {},
): Promise<Agent[]> {
  return requestJson(`${API_BASE}/agents`, {
    ...options,
    errorMessage: "Failed to fetch agents",
    statusMessages: {
      401: "Not authorized to view agents",
      403: "Not authorized to view agents",
    },
    parseResponse: (value) => parseAgentList(value, "agentsResponse"),
    validationErrorMessage: "Received an invalid agents response",
  });
}

/**
 * Fetch a single agent by ID
 */
export async function fetchAgent(
  agentId: string,
  options: RequestOptions = {},
): Promise<Agent> {
  return requestJson(`${API_BASE}/agents/${encodePathSegment(agentId, "agentId")}`, {
    ...options,
    errorMessage: "Failed to fetch agent",
    statusMessages: {
      401: "Not authorized to view agents",
      403: "Not authorized to view agents",
      404: "Agent not found",
    },
    parseResponse: (value) => parseAgent(value, "agentResponse"),
    validationErrorMessage: "Received an invalid agent response",
  });
}

/**
 * Create a new agent
 */
export async function createAgent(
  data: AgentFormData,
  options: RequestOptions = {},
): Promise<Agent> {
  return requestJson(`${API_BASE}/agents`, {
    ...options,
    method: "POST",
    json: sanitizeAgentFormData(data),
    errorMessage: "Failed to create agent",
    statusMessages: {
      401: "Not authorized to create agents",
      403: "Not authorized to create agents",
    },
    parseResponse: (value) => parseAgent(value, "agentResponse"),
    validationErrorMessage: "Received an invalid agent response",
  });
}

/**
 * Update an existing agent
 */
export async function updateAgent(
  agentId: string,
  data: AgentFormData,
  options: RequestOptions = {},
): Promise<Agent> {
  return requestJson(`${API_BASE}/agents/${encodePathSegment(agentId, "agentId")}`, {
    ...options,
    method: "PUT",
    json: sanitizeAgentFormData(data),
    errorMessage: "Failed to update agent",
    statusMessages: {
      401: "Not authorized to update agents",
      403: "Not authorized to update agents",
      404: "Agent not found",
    },
    parseResponse: (value) => parseAgent(value, "agentResponse"),
    validationErrorMessage: "Received an invalid agent response",
  });
}

/**
 * Delete an agent
 */
export async function deleteAgent(
  agentId: string,
  options: RequestOptions = {},
): Promise<void> {
  await requestVoid(`${API_BASE}/agents/${encodePathSegment(agentId, "agentId")}`, {
    ...options,
    method: "DELETE",
    errorMessage: "Failed to delete agent",
    statusMessages: {
      401: "Not authorized to delete agents",
      403: "Not authorized to delete agents",
      404: "Agent not found",
    },
  });
}

/**
 * Fetch available tools that can be assigned to agents
 */
export async function fetchAvailableTools(
  options: RequestOptions = {},
): Promise<AvailableTool[]> {
  return requestJson(`${API_BASE}/agents/tools`, {
    ...options,
    errorMessage: "Failed to fetch available tools",
    statusMessages: {
      401: "Not authorized to view available tools",
      403: "Not authorized to view available tools",
    },
    parseResponse: (value) => parseAvailableTools(value),
    validationErrorMessage: "Received an invalid available tools response",
  });
}

/**
 * Fetch agent statistics
 */
export async function fetchAgentStats(
  agentId: string,
  options: RequestOptions = {},
): Promise<AgentStats> {
  return requestJson(`${API_BASE}/agents/${encodePathSegment(agentId, "agentId")}/stats`, {
    ...options,
    errorMessage: "Failed to fetch agent statistics",
    statusMessages: {
      401: "Not authorized to view agent statistics",
      403: "Not authorized to view agent statistics",
      404: "Agent not found",
    },
    parseResponse: (value) => parseAgentStats(value),
    validationErrorMessage: "Received an invalid agent statistics response",
  });
}

/**
 * Fetch built-in agents
 */
export async function fetchBuiltinAgents(
  options: RequestOptions = {},
): Promise<Agent[]> {
  return requestJson(`${API_BASE}/agents/builtin`, {
    ...options,
    errorMessage: "Failed to fetch built-in agents",
    statusMessages: {
      401: "Not authorized to view agents",
      403: "Not authorized to view agents",
    },
    parseResponse: (value) => parseAgentList(value, "builtinAgentsResponse"),
    validationErrorMessage: "Received an invalid built-in agents response",
  });
}

/**
 * Generate agent prompt using AI
 */
export async function generateAgentPrompt(
  description: string,
  tools?: string[],
  name?: string,
  options: RequestOptions = {},
): Promise<AgentFormData> {
  const payload = sanitizeGeneratePromptPayload({ description, tools, name });

  return requestJson(`${API_BASE}/agents/generate-prompt`, {
    ...options,
    method: "POST",
    timeoutMs: options.timeoutMs ?? GENERATE_PROMPT_TIMEOUT_MS,
    json: payload,
    errorMessage: "Failed to generate agent prompt",
    statusMessages: {
      401: "Not authorized to generate agent prompts",
      403: "Not authorized to generate agent prompts",
      429: "Agent prompt generation is temporarily rate limited",
    },
    parseResponse: (value) => parseAgentFormData(value, "generatedAgentPrompt"),
    validationErrorMessage: "Received an invalid generated agent prompt response",
  });
}

function sanitizeAgentFormData(value: AgentFormData): AgentFormData {
  try {
    return parseEditableAgentFormData(value, "agentFormData");
  } catch (error) {
    throw toApiInputError(error, "Invalid agent form data");
  }
}

function sanitizeGeneratePromptPayload(value: {
  description: string;
  tools?: string[];
  name?: string;
}): { description: string; tools?: string[]; name?: string } {
  try {
    const record = assertRecord(value as unknown, "generatePromptPayload");
    const description = requireNonEmptyString(
      record.description,
      "generatePromptPayload.description",
    );
    const tools = record.tools === undefined
      ? undefined
      : sanitizeStringList(record.tools, "generatePromptPayload.tools", { allowEmpty: true });
    const name = optionalTrimmedString(record.name, "generatePromptPayload.name");

    return {
      description,
      ...(tools ? { tools } : {}),
      ...(name ? { name } : {}),
    };
  } catch (error) {
    throw toApiInputError(error, "Invalid generate prompt payload");
  }
}

function parseAgentList(value: unknown, label: string): Agent[] {
  return assertArray(value, label).map((entry, index) => parseAgent(entry, `${label}[${index}]`));
}

function parseAgent(value: unknown, label: string): Agent {
  const record = assertRecord(value, label);

  return {
    id: assertString(record.id, `${label}.id`),
    name: assertString(record.name, `${label}.name`),
    description: assertString(record.description, `${label}.description`),
    color: assertOptionalString(record.color, `${label}.color`),
    tools: sanitizeStringList(record.tools, `${label}.tools`, { allowEmpty: true }),
    model: assertOptionalString(record.model, `${label}.model`),
    reasoningEffort: parseOptionalEnum(
      record.reasoningEffort,
      `${label}.reasoningEffort`,
      REASONING_EFFORTS,
    ),
    prompt: assertString(record.prompt, `${label}.prompt`),
    scope: assertEnum(record.scope, `${label}.scope`, AGENT_SCOPES),
    filePath: assertOptionalString(record.filePath, `${label}.filePath`),
    createdAt: assertOptionalString(record.createdAt, `${label}.createdAt`),
    updatedAt: assertOptionalString(record.updatedAt, `${label}.updatedAt`),
  };
}

function parseAgentFormData(value: unknown, label: string): AgentFormData {
  const record = assertRecord(value, label);

  return {
    name: requireNonEmptyString(record.name, `${label}.name`),
    description: requireNonEmptyString(record.description, `${label}.description`),
    model: requireNonEmptyString(record.model, `${label}.model`),
    reasoningEffort: assertEnum(
      record.reasoningEffort,
      `${label}.reasoningEffort`,
      REASONING_EFFORTS,
    ),
    tools: sanitizeStringList(record.tools, `${label}.tools`, { allowEmpty: true }),
    prompt: assertString(record.prompt, `${label}.prompt`),
    color: optionalTrimmedString(record.color, `${label}.color`),
    scope: assertEnum(record.scope, `${label}.scope`, EDITABLE_SCOPES),
  };
}

function parseEditableAgentFormData(value: unknown, label: string): AgentFormData {
  const record = assertRecord(value, label);

  return {
    name: requireNonEmptyString(record.name, `${label}.name`),
    description: requireNonEmptyString(record.description, `${label}.description`),
    model: requireNonEmptyString(record.model, `${label}.model`),
    reasoningEffort: assertEnum(
      record.reasoningEffort,
      `${label}.reasoningEffort`,
      REASONING_EFFORTS,
    ),
    tools: sanitizeStringList(record.tools, `${label}.tools`, { allowEmpty: true }),
    prompt: assertString(record.prompt, `${label}.prompt`),
    color: optionalTrimmedString(record.color, `${label}.color`),
    scope: assertEnum(record.scope, `${label}.scope`, EDITABLE_SCOPES),
  };
}

function parseAvailableTools(value: unknown): AvailableTool[] {
  return assertArray(value, "availableToolsResponse").map((entry, index) => {
    const label = `availableToolsResponse[${index}]`;
    const record = assertRecord(entry, label);

    return {
      id: assertString(record.id, `${label}.id`),
      name: assertString(record.name, `${label}.name`),
      description: assertString(record.description, `${label}.description`),
      category: assertEnum(record.category, `${label}.category`, TOOL_CATEGORIES),
    };
  });
}

function parseAgentStats(value: unknown): AgentStats {
  const record = assertRecord(value, "agentStatsResponse");

  return {
    totalInvocations: assertNumber(record.totalInvocations, "agentStatsResponse.totalInvocations"),
    averageTokensUsed: assertNumber(
      record.averageTokensUsed,
      "agentStatsResponse.averageTokensUsed",
    ),
    successRate: assertNumber(record.successRate, "agentStatsResponse.successRate"),
    lastUsed: assertOptionalString(record.lastUsed, "agentStatsResponse.lastUsed"),
  };
}

function parseOptionalEnum<T extends string>(
  value: unknown,
  label: string,
  allowedValues: readonly T[],
): T | undefined {
  if (value == null) {
    return undefined;
  }

  return assertEnum(value, label, allowedValues);
}
