/**
 * API functions for session sharing
 */

import type {
  CreateShareResult,
  ReportShareResult,
  RevokeShareResult,
  SharedMessage,
  SharedSession,
  SharedToolCall,
  ShareMutationResult,
  ShareResponse,
  ShareSettings,
} from "@/types/share";

const API_BASE = "/api/v1";
const MAX_IDENTIFIER_LENGTH = 256;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._~-]+$/;

interface ShareApiResponse {
  response: Response;
  payload: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function sanitizePathIdentifier(value: string, label: string): string {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_IDENTIFIER_LENGTH ||
    !IDENTIFIER_PATTERN.test(trimmed)
  ) {
    throw new Error(`Invalid ${label}`);
  }

  return trimmed;
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  if (!isRecord(payload)) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message.trim();
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return null;
}

function mapHttpError(
  status: number,
  payload: unknown,
  statusMessages: Partial<Record<number, string>>,
  fallback: string
): string {
  return statusMessages[status] ?? extractErrorMessage(payload) ?? fallback;
}

function mutationError(error: string, status?: number): ShareMutationResult<never> {
  if (typeof status === "number") {
    return { success: false, error, status };
  }

  return { success: false, error };
}

async function parsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const raw = await response.text();
  if (raw.length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function requestShareEndpoint(path: string, init?: RequestInit): Promise<ShareApiResponse> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const payload = await parsePayload(response);
  return { response, payload };
}

interface MutationOptions<T> {
  path: string;
  init?: RequestInit;
  statusMessages: Partial<Record<number, string>>;
  fallbackError: string;
  successData: T;
  parseData?: (payload: unknown) => T | null;
  invalidDataError?: string;
}

async function runShareMutation<T>(options: MutationOptions<T>): Promise<ShareMutationResult<T>> {
  try {
    const { response, payload } = await requestShareEndpoint(options.path, options.init);

    if (!response.ok) {
      return mutationError(
        mapHttpError(response.status, payload, options.statusMessages, options.fallbackError),
        response.status
      );
    }

    if (!options.parseData) {
      return { success: true, data: options.successData };
    }

    const parsed = options.parseData(payload);
    if (!parsed) {
      return mutationError(options.invalidDataError ?? "Invalid response", response.status);
    }

    return { success: true, data: parsed };
  } catch (error) {
    return mutationError(normalizeError(error, options.fallbackError));
  }
}

function parseSharedToolCall(payload: unknown): SharedToolCall | null {
  if (!isRecord(payload)) {
    return null;
  }

  const { id, name, input, output } = payload;
  if (typeof id !== "string") return null;
  if (typeof name !== "string") return null;
  if (!isRecord(input)) return null;
  if (output !== undefined && typeof output !== "string") return null;

  return {
    id,
    name,
    input,
    output,
  };
}

function parseSharedMessage(payload: unknown): SharedMessage | null {
  if (!isRecord(payload)) {
    return null;
  }

  const { id, role, content, timestamp, toolCalls } = payload;

  if (typeof id !== "string") return null;
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  if (typeof content !== "string") return null;
  if (typeof timestamp !== "string") return null;
  if (toolCalls !== undefined && !Array.isArray(toolCalls)) return null;

  const parsedToolCalls: SharedToolCall[] | undefined = Array.isArray(toolCalls)
    ? toolCalls.map(parseSharedToolCall).filter((call): call is SharedToolCall => call !== null)
    : undefined;

  if (Array.isArray(toolCalls) && parsedToolCalls && parsedToolCalls.length !== toolCalls.length) {
    return null;
  }

  return {
    id,
    role,
    content,
    timestamp,
    toolCalls: parsedToolCalls,
  };
}

function parseSharedSession(payload: unknown): SharedSession | null {
  if (!isRecord(payload)) {
    return null;
  }

  const { id, title, createdAt, expiresAt, messages, viewCount, shareToken, isProtected } = payload;

  if (typeof id !== "string") return null;
  if (typeof title !== "string") return null;
  if (typeof createdAt !== "string") return null;
  if (expiresAt !== undefined && typeof expiresAt !== "string") return null;
  if (!Array.isArray(messages)) return null;
  if (typeof viewCount !== "number" || !Number.isFinite(viewCount)) return null;
  if (typeof shareToken !== "string") return null;
  if (typeof isProtected !== "boolean") return null;

  const parsedMessages = messages
    .map(parseSharedMessage)
    .filter((message): message is SharedMessage => message !== null);

  if (parsedMessages.length !== messages.length) {
    return null;
  }

  return {
    id,
    title,
    createdAt,
    expiresAt,
    messages: parsedMessages,
    viewCount,
    shareToken,
    isProtected,
  };
}

function parseShareResponse(payload: unknown): ShareResponse | null {
  if (!isRecord(payload)) {
    return null;
  }

  const { shareToken, shareUrl, expiresAt } = payload;

  if (typeof shareToken !== "string" || shareToken.length === 0) {
    return null;
  }

  if (typeof shareUrl !== "string" || shareUrl.length === 0) {
    return null;
  }

  if (expiresAt !== undefined && typeof expiresAt !== "string") {
    return null;
  }

  return {
    shareToken,
    shareUrl,
    expiresAt,
  };
}

function isValidShareSettings(settings: ShareSettings): boolean {
  if (!isRecord(settings)) {
    return false;
  }

  if (typeof settings.includeToolOutputs !== "boolean") {
    return false;
  }

  if (settings.title !== undefined && typeof settings.title !== "string") {
    return false;
  }

  if (
    settings.expiresInHours !== undefined &&
    settings.expiresInHours !== null &&
    (typeof settings.expiresInHours !== "number" || !Number.isFinite(settings.expiresInHours))
  ) {
    return false;
  }

  if (settings.password !== undefined && typeof settings.password !== "string") {
    return false;
  }

  if (
    settings.maxMessages !== undefined &&
    settings.maxMessages !== null &&
    (typeof settings.maxMessages !== "number" || !Number.isFinite(settings.maxMessages))
  ) {
    return false;
  }

  return true;
}

/**
 * Fetch a shared session by token
 */
export async function fetchSharedSession(token: string): Promise<SharedSession> {
  const safeToken = sanitizePathIdentifier(token, "share token");

  let apiResponse: ShareApiResponse;
  try {
    apiResponse = await requestShareEndpoint(`/share/${encodeURIComponent(safeToken)}`);
  } catch (error) {
    throw new Error(normalizeError(error, "Failed to fetch shared session"));
  }

  const { response, payload } = apiResponse;

  if (!response.ok) {
    throw new Error(
      mapHttpError(
        response.status,
        payload,
        {
          401: "Password required",
          403: "Access denied",
          404: "Session not found or expired",
        },
        "Failed to fetch shared session"
      )
    );
  }

  const session = parseSharedSession(payload);
  if (!session) {
    throw new Error("Invalid shared session response");
  }

  return session;
}

/**
 * Fetch a password-protected shared session
 */
export async function fetchProtectedSession(token: string, password: string): Promise<SharedSession> {
  const safeToken = sanitizePathIdentifier(token, "share token");

  if (password.length === 0) {
    throw new Error("Password is required");
  }

  let apiResponse: ShareApiResponse;
  try {
    apiResponse = await requestShareEndpoint(`/share/${encodeURIComponent(safeToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch (error) {
    throw new Error(normalizeError(error, "Failed to fetch shared session"));
  }

  const { response, payload } = apiResponse;

  if (!response.ok) {
    throw new Error(
      mapHttpError(
        response.status,
        payload,
        {
          401: "Invalid password",
          403: "Access denied",
          404: "Session not found or expired",
        },
        "Failed to fetch shared session"
      )
    );
  }

  const session = parseSharedSession(payload);
  if (!session) {
    throw new Error("Invalid shared session response");
  }

  return session;
}

/**
 * Create a new share for a session
 */
export async function createShare(sessionId: string, settings: ShareSettings): Promise<CreateShareResult> {
  let safeSessionId: string;

  try {
    safeSessionId = sanitizePathIdentifier(sessionId, "session id");
  } catch (error) {
    return mutationError(normalizeError(error, "Invalid session id"));
  }

  if (!isValidShareSettings(settings)) {
    return mutationError("Invalid share settings");
  }

  return runShareMutation<ShareResponse>({
    path: `/sessions/${encodeURIComponent(safeSessionId)}/share`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
    statusMessages: {
      401: "Unauthorized",
      403: "Access denied",
      404: "Session not found",
    },
    fallbackError: "Failed to create share",
    successData: { shareToken: "", shareUrl: "" },
    parseData: parseShareResponse,
    invalidDataError: "Invalid create share response",
  });
}

/**
 * Revoke a share
 */
export async function revokeShare(token: string): Promise<RevokeShareResult> {
  let safeToken: string;

  try {
    safeToken = sanitizePathIdentifier(token, "share token");
  } catch (error) {
    return mutationError(normalizeError(error, "Invalid share token"));
  }

  return runShareMutation<null>({
    path: `/share/${encodeURIComponent(safeToken)}`,
    init: {
      method: "DELETE",
    },
    statusMessages: {
      401: "Unauthorized",
      403: "Access denied",
      404: "Session not found or expired",
    },
    fallbackError: "Failed to revoke share",
    successData: null,
  });
}

/**
 * Report a shared session
 */
export async function reportShare(token: string, reason: string): Promise<ReportShareResult> {
  let safeToken: string;

  try {
    safeToken = sanitizePathIdentifier(token, "share token");
  } catch (error) {
    return mutationError(normalizeError(error, "Invalid share token"));
  }

  const normalizedReason = reason.trim();
  if (normalizedReason.length === 0) {
    return mutationError("Report reason is required");
  }

  return runShareMutation<null>({
    path: `/share/${encodeURIComponent(safeToken)}/report`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: normalizedReason }),
    },
    statusMessages: {
      401: "Unauthorized",
      403: "Access denied",
      404: "Session not found or expired",
    },
    fallbackError: "Failed to report share",
    successData: null,
  });
}
