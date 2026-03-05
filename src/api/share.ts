/**
 * API functions for session sharing
 */

import type {
  SharedMessage,
  SharedSession,
  SharedToolCall,
  ShareSettings,
  ShareResponse,
} from "@/types/share";

const API_BASE = "/api/v1";
const PAYLOAD_WRAPPERS = ["data", "session", "share", "payload", "result"];
const ERROR_MESSAGE_KEYS = ["error", "message", "detail", "reason", "description"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFirstDefined(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) {
      return source[key];
    }
  }

  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return undefined;
}

function toStringValue(value: unknown, fallback: string): string {
  return toOptionalString(value) ?? fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return fallback;
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function unwrapPayload(payload: unknown): unknown {
  let current = payload;
  let wrapped = true;

  while (wrapped && isRecord(current)) {
    wrapped = false;

    for (const wrapper of PAYLOAD_WRAPPERS) {
      if (current[wrapper] !== undefined) {
        current = current[wrapper];
        wrapped = true;
        break;
      }
    }
  }

  return current;
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  const unwrapped = unwrapPayload(payload);

  if (typeof unwrapped === "string") {
    const trimmed = unwrapped.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (!isRecord(unwrapped)) {
    return undefined;
  }

  for (const key of ERROR_MESSAGE_KEYS) {
    const candidate = unwrapped[key];
    const asString = toOptionalString(candidate);
    if (asString) {
      return asString;
    }

    if (isRecord(candidate)) {
      const nested = extractErrorMessage(candidate);
      if (nested) {
        return nested;
      }
    }
  }

  const errors = unwrapped.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    for (const entry of errors) {
      const nested = extractErrorMessage(entry);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function makeApiError(response: Response, fallbackMessage: string, payload: unknown): Error {
  const detail = extractErrorMessage(payload);
  if (detail) {
    return new Error(detail);
  }

  return new Error(`${fallbackMessage} (status ${response.status})`);
}

function normalizeToolCall(raw: unknown, index: number): SharedToolCall {
  const record = isRecord(raw) ? raw : {};
  const inputValue = getFirstDefined(record, ["input", "arguments", "args"]);
  const outputValue = getFirstDefined(record, ["output", "result"]);

  return {
    id: toStringValue(getFirstDefined(record, ["id", "callId", "call_id"]), `tool-${index}`),
    name: toStringValue(getFirstDefined(record, ["name", "toolName", "tool_name"]), "unknown"),
    input: isRecord(inputValue) ? inputValue : {},
    output:
      outputValue === undefined
        ? undefined
        : typeof outputValue === "string"
          ? outputValue
          : JSON.stringify(outputValue),
  };
}

function normalizeMessage(raw: unknown, index: number): SharedMessage {
  const record = isRecord(raw) ? raw : {};
  const roleValue = toStringValue(
    getFirstDefined(record, ["role", "authorRole", "author_role"]),
    "assistant",
  ).toLowerCase();

  const normalizedRole: SharedMessage["role"] =
    roleValue === "user" || roleValue === "assistant" || roleValue === "system"
      ? roleValue
      : "assistant";

  const toolCallsRaw = getFirstDefined(record, ["toolCalls", "tool_calls"]);
  const toolCalls = Array.isArray(toolCallsRaw)
    ? toolCallsRaw.map((toolCall, toolIndex) => normalizeToolCall(toolCall, toolIndex))
    : undefined;

  return {
    id: toStringValue(getFirstDefined(record, ["id", "messageId", "message_id"]), `message-${index}`),
    role: normalizedRole,
    content: toStringValue(getFirstDefined(record, ["content", "text", "message"]), ""),
    timestamp: toStringValue(
      getFirstDefined(record, ["timestamp", "createdAt", "created_at", "time"]),
      new Date().toISOString(),
    ),
    toolCalls,
  };
}

function normalizeSharedSessionPayload(payload: unknown, fallbackToken?: string): SharedSession {
  const unwrapped = unwrapPayload(payload);
  if (!isRecord(unwrapped)) {
    throw new Error("Invalid shared session response");
  }

  const messagesRaw = getFirstDefined(unwrapped, ["messages", "chat", "items", "conversation"]);
  const messages = Array.isArray(messagesRaw)
    ? messagesRaw.map((message, index) => normalizeMessage(message, index))
    : [];

  const id = toStringValue(getFirstDefined(unwrapped, ["id", "sessionId", "session_id"]), fallbackToken ?? "");
  const shareToken =
    toOptionalString(getFirstDefined(unwrapped, ["shareToken", "share_token", "token"])) ??
    fallbackToken ??
    id;

  return {
    id,
    title: toStringValue(getFirstDefined(unwrapped, ["title", "name"]), "Shared Session"),
    createdAt: toStringValue(
      getFirstDefined(unwrapped, ["createdAt", "created_at", "created", "time"]),
      new Date().toISOString(),
    ),
    expiresAt: toOptionalString(getFirstDefined(unwrapped, ["expiresAt", "expires_at"])),
    messages,
    viewCount: toNumber(getFirstDefined(unwrapped, ["viewCount", "view_count", "views"]), 0),
    shareToken,
    isProtected: toBoolean(
      getFirstDefined(unwrapped, ["isProtected", "is_protected", "passwordProtected", "password_protected"]),
      false,
    ),
  };
}

function inferTokenFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, baseOrigin);
    const match = parsed.pathname.match(/\/share\/([^/?#]+)/);
    return match?.[1];
  } catch {
    const match = url.match(/\/share\/([^/?#]+)/);
    return match?.[1];
  }
}

function buildShareUrl(token: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/share/${token}`;
  }

  return `/share/${token}`;
}

function normalizeShareResponsePayload(payload: unknown): ShareResponse {
  const unwrapped = unwrapPayload(payload);
  if (!isRecord(unwrapped)) {
    throw new Error("Invalid share response");
  }

  const shareUrl = toOptionalString(getFirstDefined(unwrapped, ["shareUrl", "share_url", "url", "link"]));
  const shareToken =
    toOptionalString(getFirstDefined(unwrapped, ["shareToken", "share_token", "token"])) ??
    inferTokenFromUrl(shareUrl);

  if (!shareToken) {
    throw new Error("Invalid share response");
  }

  return {
    shareToken,
    shareUrl: shareUrl ?? buildShareUrl(shareToken),
    expiresAt: toOptionalString(getFirstDefined(unwrapped, ["expiresAt", "expires_at"])),
  };
}

function buildCreateSharePayload(settings: ShareSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    includeToolOutputs: settings.includeToolOutputs,
    include_tool_outputs: settings.includeToolOutputs,
  };

  if (settings.title !== undefined) {
    payload.title = settings.title;
  }

  if (settings.password !== undefined) {
    payload.password = settings.password;
  }

  if (settings.expiresInHours !== undefined) {
    payload.expiresInHours = settings.expiresInHours;
    payload.expires_in_hours = settings.expiresInHours;
  }

  if (settings.maxMessages !== undefined) {
    payload.maxMessages = settings.maxMessages;
    payload.max_messages = settings.maxMessages;
  }

  return payload;
}

/**
 * Fetch a shared session by token
 */
export async function fetchSharedSession(token: string): Promise<SharedSession> {
  const response = await fetch(`${API_BASE}/share/${token}`);
  const payload = await parseResponsePayload(response);

  if (response.ok) {
    return normalizeSharedSessionPayload(payload, token);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Password required");
  }

  if (response.status === 404 || response.status === 410) {
    throw new Error("Session not found or expired");
  }

  throw makeApiError(response, "Failed to fetch shared session", payload);
}

/**
 * Fetch a password-protected shared session
 */
export async function fetchProtectedSession(
  token: string,
  password: string
): Promise<SharedSession> {
  const response = await fetch(`${API_BASE}/share/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const payload = await parseResponsePayload(response);

  if (response.ok) {
    return normalizeSharedSessionPayload(payload, token);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(extractErrorMessage(payload) ?? "Invalid password");
  }

  if (response.status === 404 || response.status === 410) {
    throw new Error("Session not found or expired");
  }

  throw makeApiError(response, "Failed to fetch shared session", payload);
}

/**
 * Create a new share for a session
 */
export async function createShare(
  sessionId: string,
  settings: ShareSettings
): Promise<ShareResponse> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCreateSharePayload(settings)),
  });

  const payload = await parseResponsePayload(response);

  if (response.ok) {
    return normalizeShareResponsePayload(payload);
  }

  if (response.status === 400) {
    throw new Error(extractErrorMessage(payload) ?? "Invalid share settings");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(extractErrorMessage(payload) ?? "Not authorized to share this session");
  }

  if (response.status === 404) {
    throw new Error("Session not found");
  }

  if (response.status === 409) {
    throw new Error(extractErrorMessage(payload) ?? "A share already exists for this session");
  }

  throw makeApiError(response, "Failed to create share", payload);
}

/**
 * Revoke a share
 */
export async function revokeShare(token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/share/${token}`, {
    method: "DELETE",
  });

  const payload = await parseResponsePayload(response);

  if (response.ok) {
    return;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(extractErrorMessage(payload) ?? "Not authorized to revoke share");
  }

  if (response.status === 404) {
    throw new Error("Share not found");
  }

  throw makeApiError(response, "Failed to revoke share", payload);
}

/**
 * Report a shared session
 */
export async function reportShare(
  token: string,
  reason: string
): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("Report reason is required");
  }

  const response = await fetch(`${API_BASE}/share/${token}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: trimmedReason }),
  });

  const payload = await parseResponsePayload(response);

  if (response.ok) {
    return;
  }

  if (response.status === 400) {
    throw new Error(extractErrorMessage(payload) ?? "Report reason is required");
  }

  if (response.status === 404) {
    throw new Error("Share not found");
  }

  if (response.status === 409) {
    throw new Error(extractErrorMessage(payload) ?? "Share has already been reported");
  }

  if (response.status === 429) {
    throw new Error(extractErrorMessage(payload) ?? "Too many reports. Please try again later.");
  }

  throw makeApiError(response, "Failed to report share", payload);
}
