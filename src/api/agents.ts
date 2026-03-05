import { invoke } from "@tauri-apps/api/core";

import type { Agent, AgentFormData, AgentStats, AvailableTool } from "@/types/agents";

type AgentScope = Extract<Agent["scope"], "project" | "user">;
type ReasoningEffort = NonNullable<Agent["reasoningEffort"]>;
type BackendAgentType = "custom" | "code" | "research" | "test" | "review";
type BackendAgentStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

interface StoredAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  agentType: BackendAgentType;
  status: BackendAgentStatus;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
  tokensUsed: number;
  costUsd: number;
  tasksCompleted: number;
  tasksFailed: number;
  lastActiveAt?: number;
  enabled: boolean;
  allowedTools?: string[];
  deniedTools: string[];
  tags: string[];
}

interface AgentHistoryEntry {
  id: string;
  agentId: string;
  prompt: string;
  result?: string;
  tokensUsed: number;
  costUsd: number;
  startedAt: number;
  completedAt?: number;
  status: BackendAgentStatus;
  error?: string;
}

interface AgentStoreData {
  version: string;
  agents: StoredAgent[];
  history: AgentHistoryEntry[];
}

interface ToolDefinition {
  name: string;
  description: string;
}

const DEFAULT_STORE: AgentStoreData = {
  version: "1.0",
  agents: [],
  history: [],
};

const SCOPE_TAG_PREFIX = "scope:";
const REASONING_TAG_PREFIX = "reasoning:";
const COLOR_TAG_PREFIX = "color:";
const METADATA_TAG_PREFIXES = [SCOPE_TAG_PREFIX, REASONING_TAG_PREFIX, COLOR_TAG_PREFIX] as const;

const BUILTIN_AGENT_DEFINITIONS = [
  {
    id: "builtin-code",
    name: "Code Agent",
    description: "Expert at writing, implementing, and modifying code",
    prompt: "You are an expert code agent. Write clean, production-ready code and explain trade-offs clearly.",
    tools: ["read_file", "write_file", "edit_file", "search_files", "run_command"],
    model: "gpt-4",
    reasoningEffort: "high" as ReasoningEffort,
  },
  {
    id: "builtin-research",
    name: "Research Agent",
    description: "Analyzes codebases, architecture, and implementation patterns",
    prompt: "You are a research agent. Analyze architecture, explain findings, and surface actionable insights.",
    tools: ["read_file", "search_files", "list_directory"],
    model: "gpt-4",
    reasoningEffort: "high" as ReasoningEffort,
  },
  {
    id: "builtin-test",
    name: "Test Agent",
    description: "Creates and improves automated tests",
    prompt: "You are a testing specialist. Create reliable test coverage for happy paths, failures, and edge cases.",
    tools: ["read_file", "write_file", "edit_file", "run_command"],
    model: "gpt-4",
    reasoningEffort: "medium" as ReasoningEffort,
  },
  {
    id: "builtin-review",
    name: "Review Agent",
    description: "Reviews changes for quality, maintainability, and security",
    prompt: "You are a code review specialist. Identify risks, propose fixes, and keep feedback concise and actionable.",
    tools: ["read_file", "search_files"],
    model: "gpt-4",
    reasoningEffort: "medium" as ReasoningEffort,
  },
] as const;

const BUILTIN_AGENT_IDS: ReadonlySet<string> = new Set(
  BUILTIN_AGENT_DEFINITIONS.map((agent) => agent.id),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  const value = pickValue(record, keys);
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback = 0): number {
  const value = pickValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function readOptionalNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  const value = pickValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  const value = pickValue(record, keys);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return fallback;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function normalizeToolList(values: readonly string[]): string[] {
  return uniqueStrings(values);
}

function readStringArray(
  record: Record<string, unknown>,
  keys: string[],
  fallback: string[] | undefined,
): string[] | undefined {
  const value = pickValue(record, keys);

  if (value === undefined || value === null) {
    return fallback;
  }

  if (Array.isArray(value)) {
    const out = value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
    return normalizeToolList(out);
  }

  if (typeof value === "string") {
    return normalizeToolList([value]);
  }

  return fallback;
}

function parseAgentType(value: string): BackendAgentType {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "custom"
    || normalized === "code"
    || normalized === "research"
    || normalized === "test"
    || normalized === "review"
  ) {
    return normalized;
  }
  return "custom";
}

function parseAgentStatus(value: string): BackendAgentStatus {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "idle"
    || normalized === "running"
    || normalized === "completed"
    || normalized === "failed"
    || normalized === "cancelled"
  ) {
    return normalized;
  }
  return "idle";
}

function parseStoredAgent(raw: unknown): StoredAgent | null {
  if (!isRecord(raw)) {
    return null;
  }

  const now = Date.now();
  const name = readString(raw, ["name"]);
  if (!name) {
    return null;
  }

  const createdAt = readNumber(raw, ["createdAt", "created_at"], now);

  return {
    id: readString(raw, ["id"], name),
    name,
    description: readString(raw, ["description"]),
    systemPrompt: readString(raw, ["systemPrompt", "system_prompt", "prompt"]),
    model: readString(raw, ["model"], "gpt-4"),
    agentType: parseAgentType(readString(raw, ["agentType", "agent_type"], "custom")),
    status: parseAgentStatus(readString(raw, ["status"], "idle")),
    isBuiltIn: readBoolean(raw, ["isBuiltIn", "is_built_in"], false),
    createdAt,
    updatedAt: readNumber(raw, ["updatedAt", "updated_at"], createdAt),
    tokensUsed: readNumber(raw, ["tokensUsed", "tokens_used"], 0),
    costUsd: readNumber(raw, ["costUsd", "cost_usd"], 0),
    tasksCompleted: readNumber(raw, ["tasksCompleted", "tasks_completed"], 0),
    tasksFailed: readNumber(raw, ["tasksFailed", "tasks_failed"], 0),
    lastActiveAt: readOptionalNumber(raw, ["lastActiveAt", "last_active_at"]),
    enabled: readBoolean(raw, ["enabled"], true),
    allowedTools: readStringArray(raw, ["allowedTools", "allowed_tools"], undefined),
    deniedTools: readStringArray(raw, ["deniedTools", "denied_tools"], []) ?? [],
    tags: readStringArray(raw, ["tags"], []) ?? [],
  };
}

function parseHistoryEntry(raw: unknown): AgentHistoryEntry | null {
  if (!isRecord(raw)) {
    return null;
  }

  const agentId = readString(raw, ["agentId", "agent_id"]);
  if (!agentId) {
    return null;
  }

  const startedAt = readNumber(raw, ["startedAt", "started_at"], Date.now());

  return {
    id: readString(raw, ["id"], `${agentId}-${startedAt}`),
    agentId,
    prompt: readString(raw, ["prompt"]),
    result: readString(raw, ["result"]) || undefined,
    tokensUsed: readNumber(raw, ["tokensUsed", "tokens_used"], 0),
    costUsd: readNumber(raw, ["costUsd", "cost_usd"], 0),
    startedAt,
    completedAt: readOptionalNumber(raw, ["completedAt", "completed_at"]),
    status: parseAgentStatus(readString(raw, ["status"], "idle")),
    error: readString(raw, ["error"]) || undefined,
  };
}

function normalizeStore(raw: unknown): AgentStoreData {
  if (!isRecord(raw)) {
    return { ...DEFAULT_STORE };
  }

  const agentsRaw = pickValue(raw, ["agents"]);
  const historyRaw = pickValue(raw, ["history"]);

  return {
    version: readString(raw, ["version"], "1.0"),
    agents: Array.isArray(agentsRaw)
      ? agentsRaw
        .map((item) => parseStoredAgent(item))
        .filter((item): item is StoredAgent => item !== null)
      : [],
    history: Array.isArray(historyRaw)
      ? historyRaw
        .map((item) => parseHistoryEntry(item))
        .filter((item): item is AgentHistoryEntry => item !== null)
      : [],
  };
}

function parseScopeFromTags(tags: readonly string[]): AgentScope {
  const scopeTag = tags.find((tag) => tag.startsWith(SCOPE_TAG_PREFIX));
  if (!scopeTag) {
    return "user";
  }

  const value = scopeTag.slice(SCOPE_TAG_PREFIX.length).trim().toLowerCase();
  return value === "project" ? "project" : "user";
}

function parseReasoningFromTags(tags: readonly string[]): ReasoningEffort | undefined {
  const reasoningTag = tags.find((tag) => tag.startsWith(REASONING_TAG_PREFIX));
  if (!reasoningTag) {
    return undefined;
  }

  const value = reasoningTag.slice(REASONING_TAG_PREFIX.length).trim().toLowerCase();
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return undefined;
}

function parseColorFromTags(tags: readonly string[]): string | undefined {
  const colorTag = tags.find((tag) => tag.startsWith(COLOR_TAG_PREFIX));
  if (!colorTag) {
    return undefined;
  }

  const value = colorTag.slice(COLOR_TAG_PREFIX.length).trim();
  return value || undefined;
}

function toIsoTimestamp(timestamp: number | undefined): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function toAgentFilePath(name: string, scope: Agent["scope"]): string | undefined {
  if (scope !== "project") {
    return undefined;
  }
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `.agents/${slug || "agent"}.json`;
}

function mapStoredAgentToAgent(stored: StoredAgent): Agent {
  const scope: Agent["scope"] = stored.isBuiltIn ? "builtin" : parseScopeFromTags(stored.tags);

  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    color: parseColorFromTags(stored.tags),
    tools: stored.allowedTools ? [...stored.allowedTools] : [],
    model: stored.model,
    reasoningEffort: parseReasoningFromTags(stored.tags),
    prompt: stored.systemPrompt,
    scope,
    filePath: toAgentFilePath(stored.name, scope),
    createdAt: toIsoTimestamp(stored.createdAt),
    updatedAt: toIsoTimestamp(stored.updatedAt),
  };
}

function createMetadataTags(data: AgentFormData): string[] {
  const tags = [
    `${SCOPE_TAG_PREFIX}${data.scope}`,
    `${REASONING_TAG_PREFIX}${data.reasoningEffort}`,
  ];

  if (data.color?.trim()) {
    tags.push(`${COLOR_TAG_PREFIX}${data.color.trim()}`);
  }

  return uniqueStrings(tags);
}

function mergeMetadataTags(existingTags: readonly string[], data: AgentFormData): string[] {
  const preserved = existingTags.filter(
    (tag) => !METADATA_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix)),
  );

  return uniqueStrings([...preserved, ...createMetadataTags(data)]);
}

function getBuiltinAgents(): Agent[] {
  return BUILTIN_AGENT_DEFINITIONS.map((agent, index) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    tools: [...agent.tools],
    model: agent.model,
    reasoningEffort: agent.reasoningEffort,
    prompt: agent.prompt,
    scope: "builtin",
    createdAt: toIsoTimestamp(Date.now() - index * 1000),
    updatedAt: toIsoTimestamp(Date.now()),
  }));
}

function toActionError(action: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to ${action}: ${message}`);
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (args) {
    return invoke<T>(command, args);
  }
  return invoke<T>(command);
}

async function loadStore(): Promise<AgentStoreData> {
  const response = await invokeCommand<unknown>("agent_store_load");
  return normalizeStore(response);
}

async function saveStore(store: AgentStoreData): Promise<void> {
  await invokeCommand<void>("agent_store_save", {
    agents: store.agents,
    history: store.history,
  });
}

function findStoredAgentIndex(store: AgentStoreData, agentId: string): number {
  return store.agents.findIndex((agent) => agent.id === agentId || agent.name === agentId);
}

/**
 * Fetch all user agents.
 */
export async function fetchUserAgents(): Promise<Agent[]> {
  try {
    const store = await loadStore();
    return store.agents
      .filter((agent) => !agent.isBuiltIn)
      .map((agent) => mapStoredAgentToAgent(agent));
  } catch (error) {
    throw toActionError("fetch agents", error);
  }
}

/**
 * Fetch a single agent by ID.
 */
export async function fetchAgent(agentId: string): Promise<Agent> {
  const trimmedId = agentId.trim();
  if (!trimmedId) {
    throw new Error("Agent id is required");
  }

  try {
    const store = await loadStore();
    const storedAgent = store.agents.find((agent) => agent.id === trimmedId || agent.name === trimmedId);

    if (storedAgent) {
      return mapStoredAgentToAgent(storedAgent);
    }

    const builtinAgent = getBuiltinAgents().find((agent) => agent.id === trimmedId);
    if (builtinAgent) {
      return builtinAgent;
    }

    throw new Error(`Agent \"${trimmedId}\" not found`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      throw error;
    }
    throw toActionError("fetch agent", error);
  }
}

/**
 * Create a new agent.
 */
export async function createAgent(data: AgentFormData): Promise<Agent> {
  const name = data.name.trim();
  if (!name) {
    throw new Error("Agent name is required");
  }

  try {
    const store = await loadStore();

    const alreadyExists = store.agents.some((agent) => agent.id === name || agent.name === name);
    if (alreadyExists) {
      throw new Error(`Agent \"${name}\" already exists`);
    }

    const now = Date.now();
    const allowedTools = normalizeToolList(data.tools);

    const storedAgent: StoredAgent = {
      id: name,
      name,
      description: data.description.trim(),
      systemPrompt: data.prompt.trim(),
      model: data.model.trim() || "gpt-4",
      agentType: "custom",
      status: "idle",
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
      tokensUsed: 0,
      costUsd: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      enabled: true,
      allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
      deniedTools: [],
      tags: createMetadataTags(data),
    };

    store.agents.push(storedAgent);
    await saveStore(store);

    return mapStoredAgentToAgent(storedAgent);
  } catch (error) {
    throw toActionError("create agent", error);
  }
}

/**
 * Update an existing agent.
 */
export async function updateAgent(agentId: string, data: AgentFormData): Promise<Agent> {
  const trimmedId = agentId.trim();
  if (!trimmedId) {
    throw new Error("Agent id is required");
  }

  try {
    const store = await loadStore();
    const agentIndex = findStoredAgentIndex(store, trimmedId);

    if (agentIndex < 0) {
      throw new Error(`Agent \"${trimmedId}\" not found`);
    }

    const existingAgent = store.agents[agentIndex];
    if (existingAgent.isBuiltIn || BUILTIN_AGENT_IDS.has(trimmedId)) {
      throw new Error("Built-in agents cannot be updated");
    }

    const nextName = data.name.trim() || existingAgent.name;
    const duplicateName = store.agents.some(
      (agent, index) => index !== agentIndex && (agent.id === nextName || agent.name === nextName),
    );

    if (duplicateName) {
      throw new Error(`Agent \"${nextName}\" already exists`);
    }

    const allowedTools = normalizeToolList(data.tools);

    const updatedAgent: StoredAgent = {
      ...existingAgent,
      id: nextName,
      name: nextName,
      description: data.description.trim(),
      systemPrompt: data.prompt.trim(),
      model: data.model.trim() || existingAgent.model || "gpt-4",
      updatedAt: Date.now(),
      allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
      tags: mergeMetadataTags(existingAgent.tags, data),
    };

    store.agents[agentIndex] = updatedAgent;
    await saveStore(store);

    return mapStoredAgentToAgent(updatedAgent);
  } catch (error) {
    throw toActionError("update agent", error);
  }
}

/**
 * Delete an agent.
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const trimmedId = agentId.trim();
  if (!trimmedId) {
    throw new Error("Agent id is required");
  }

  if (BUILTIN_AGENT_IDS.has(trimmedId)) {
    throw new Error("Built-in agents cannot be deleted");
  }

  try {
    const store = await loadStore();
    const agentIndex = findStoredAgentIndex(store, trimmedId);

    if (agentIndex < 0) {
      throw new Error(`Agent \"${trimmedId}\" not found`);
    }

    if (store.agents[agentIndex].isBuiltIn) {
      throw new Error("Built-in agents cannot be deleted");
    }

    store.agents.splice(agentIndex, 1);
    await saveStore(store);
  } catch (error) {
    throw toActionError("delete agent", error);
  }
}

function categorizeTool(name: string, description: string): AvailableTool["category"] {
  const probe = `${name} ${description}`.toLowerCase();

  if (/(search|grep|find)/.test(probe)) {
    return "search";
  }
  if (/(read|write|edit|file|directory|tree)/.test(probe)) {
    return "file";
  }
  if (/(run|command|shell|terminal|execute)/.test(probe)) {
    return "execution";
  }
  if (/(fetch|http|network|url|request|web)/.test(probe)) {
    return "network";
  }

  return "utility";
}

function parseToolDefinition(raw: unknown): ToolDefinition | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = readString(raw, ["name"]);
  if (!name) {
    return null;
  }

  return {
    name,
    description: readString(raw, ["description"], "No description available"),
  };
}

/**
 * Fetch available tools that can be assigned to agents.
 */
export async function fetchAvailableTools(): Promise<AvailableTool[]> {
  try {
    const rawTools = await invokeCommand<unknown[]>("tools_list");

    if (!Array.isArray(rawTools)) {
      return [];
    }

    return rawTools
      .map((tool) => parseToolDefinition(tool))
      .filter((tool): tool is ToolDefinition => tool !== null)
      .map((tool) => ({
        id: tool.name,
        name: tool.name,
        description: tool.description,
        category: categorizeTool(tool.name, tool.description),
      }));
  } catch (error) {
    throw toActionError("fetch available tools", error);
  }
}

/**
 * Fetch agent statistics.
 */
export async function fetchAgentStats(agentId: string): Promise<AgentStats> {
  const trimmedId = agentId.trim();
  if (!trimmedId) {
    throw new Error("Agent id is required");
  }

  try {
    const store = await loadStore();
    const storedAgent = store.agents.find((agent) => agent.id === trimmedId || agent.name === trimmedId);

    if (!storedAgent) {
      if (BUILTIN_AGENT_IDS.has(trimmedId)) {
        return {
          totalInvocations: 0,
          averageTokensUsed: 0,
          successRate: 0,
        };
      }
      throw new Error(`Agent \"${trimmedId}\" not found`);
    }

    const history = store.history.filter(
      (entry) => entry.agentId === storedAgent.id || entry.agentId === storedAgent.name,
    );

    const historySuccesses = history.filter((entry) => entry.status === "completed").length;
    const historyFailures = history.filter(
      (entry) => entry.status === "failed" || entry.status === "cancelled",
    ).length;

    const completedCount = storedAgent.tasksCompleted > 0 ? storedAgent.tasksCompleted : historySuccesses;
    const failedCount = storedAgent.tasksFailed > 0 ? storedAgent.tasksFailed : historyFailures;

    const totalInvocations = completedCount + failedCount > 0
      ? completedCount + failedCount
      : history.length;

    const historyTokens = history.reduce((sum, entry) => sum + entry.tokensUsed, 0);
    const totalTokens = storedAgent.tokensUsed > 0 ? storedAgent.tokensUsed : historyTokens;

    const averageTokensUsed = totalInvocations > 0 ? totalTokens / totalInvocations : 0;
    const successRate = totalInvocations > 0 ? (completedCount / totalInvocations) * 100 : 0;

    const lastUsedCandidates = [
      storedAgent.lastActiveAt,
      storedAgent.updatedAt,
      ...history.flatMap((entry) => [entry.completedAt, entry.startedAt]),
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    const lastUsed = lastUsedCandidates.length > 0
      ? toIsoTimestamp(Math.max(...lastUsedCandidates))
      : undefined;

    return {
      totalInvocations,
      averageTokensUsed,
      successRate,
      lastUsed,
    };
  } catch (error) {
    throw toActionError("fetch agent statistics", error);
  }
}

/**
 * Fetch built-in agents.
 */
export async function fetchBuiltinAgents(): Promise<Agent[]> {
  try {
    const store = await loadStore();
    const builtInFromStore = store.agents
      .filter((agent) => agent.isBuiltIn)
      .map((agent) => ({ ...mapStoredAgentToAgent(agent), scope: "builtin" as const }));

    if (builtInFromStore.length > 0) {
      return builtInFromStore;
    }
  } catch {
    // Ignore store loading errors and fall back to local built-ins.
  }

  return getBuiltinAgents();
}

function capitalizeWord(word: string): string {
  if (!word) {
    return "";
  }
  return `${word[0].toUpperCase()}${word.slice(1)}`;
}

function deriveAgentName(description: string): string {
  const sentence = description
    .trim()
    .split(/[.!?]/)[0]
    ?.trim() ?? "";

  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) {
    return "Custom Agent";
  }

  return words.map((word) => capitalizeWord(word.toLowerCase())).join(" ");
}

/**
 * Generate an agent prompt using AI.
 */
export async function generateAgentPrompt(
  description: string,
  tools?: string[],
  name?: string,
): Promise<AgentFormData> {
  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    throw new Error("Description is required to generate a prompt");
  }

  try {
    const prompt = await invokeCommand<string>("agent_generate_prompt", {
      description: trimmedDescription,
    });

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new Error("Prompt generation returned empty content");
    }

    return {
      name: name?.trim() || deriveAgentName(trimmedDescription),
      description: trimmedDescription,
      model: "gpt-4",
      reasoningEffort: "medium",
      tools: normalizeToolList(tools ?? []),
      prompt: prompt.trim(),
      scope: "user",
    };
  } catch (error) {
    throw toActionError("generate agent prompt", error);
  }
}