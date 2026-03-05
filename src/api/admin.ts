/**
 * API functions for admin panel
 */

import type {
  AdminSession,
  AdminSessionsResponse,
  SessionFilters,
  SessionStats,
  BulkAction,
  SessionStatus,
} from "@/types/admin";

const API_BASE = "/api/v1/admin";
export const ADMIN_API_REQUEST_TIMEOUT_MS = 15_000;

type AdminOperation =
  | "fetchAdminSessions"
  | "fetchSessionStats"
  | "deleteSession"
  | "archiveSession"
  | "restoreSession"
  | "bulkAction"
  | "exportSessions"
  | "fetchSessionDetails";

export type AdminApiErrorCode =
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class AdminApiError extends Error {
  readonly code: AdminApiErrorCode;
  readonly operation: AdminOperation;
  readonly url: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(options: {
    code: AdminApiErrorCode;
    message: string;
    operation: AdminOperation;
    url: string;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "AdminApiError";
    this.code = options.code;
    this.operation = options.operation;
    this.url = options.url;
    this.status = options.status;
    this.cause = options.cause;
  }
}

interface RequestContext {
  operation: AdminOperation;
  url: string;
  fallbackMessage: string;
}

const SESSION_STATUSES: SessionStatus[] = [
  "active",
  "completed",
  "archived",
  "deleted",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createInvalidResponseError(
  context: RequestContext,
  reason: string,
  cause?: unknown
): AdminApiError {
  return new AdminApiError({
    code: "INVALID_RESPONSE",
    message: `${context.fallbackMessage}: ${reason}`,
    operation: context.operation,
    url: context.url,
    cause,
  });
}

function expectRecord(
  value: unknown,
  context: RequestContext,
  fieldPath: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw createInvalidResponseError(context, `${fieldPath} must be an object`);
  }
  return value;
}

function expectString(
  record: Record<string, unknown>,
  key: string,
  context: RequestContext,
  fieldPath: string
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw createInvalidResponseError(context, `${fieldPath}.${key} must be a string`);
  }
  return value;
}

function expectOptionalString(
  record: Record<string, unknown>,
  key: string,
  context: RequestContext,
  fieldPath: string
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw createInvalidResponseError(
      context,
      `${fieldPath}.${key} must be a string when present`
    );
  }
  return value;
}

function expectNumber(
  record: Record<string, unknown>,
  key: string,
  context: RequestContext,
  fieldPath: string
): number {
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw createInvalidResponseError(
      context,
      `${fieldPath}.${key} must be a valid number`
    );
  }
  return value;
}

function expectBoolean(
  record: Record<string, unknown>,
  key: string,
  context: RequestContext,
  fieldPath: string
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw createInvalidResponseError(context, `${fieldPath}.${key} must be a boolean`);
  }
  return value;
}

function expectArray(
  record: Record<string, unknown>,
  key: string,
  context: RequestContext,
  fieldPath: string
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw createInvalidResponseError(context, `${fieldPath}.${key} must be an array`);
  }
  return value;
}

function parseSessionStatus(
  value: unknown,
  context: RequestContext,
  fieldPath: string
): SessionStatus {
  if (
    typeof value !== "string" ||
    !SESSION_STATUSES.includes(value as SessionStatus)
  ) {
    throw createInvalidResponseError(
      context,
      `${fieldPath}.status must be one of: ${SESSION_STATUSES.join(", ")}`
    );
  }
  return value as SessionStatus;
}

function parseAdminSessionPayload(
  value: unknown,
  context: RequestContext,
  fieldPath: string
): AdminSession {
  const record = expectRecord(value, context, fieldPath);

  return {
    id: expectString(record, "id", context, fieldPath),
    userId: expectString(record, "userId", context, fieldPath),
    userEmail: expectOptionalString(record, "userEmail", context, fieldPath),
    title: expectString(record, "title", context, fieldPath),
    status: parseSessionStatus(record.status, context, fieldPath),
    messageCount: expectNumber(record, "messageCount", context, fieldPath),
    createdAt: expectString(record, "createdAt", context, fieldPath),
    updatedAt: expectString(record, "updatedAt", context, fieldPath),
    lastActivityAt: expectString(record, "lastActivityAt", context, fieldPath),
    model: expectString(record, "model", context, fieldPath),
    totalTokens: expectNumber(record, "totalTokens", context, fieldPath),
    isShared: expectBoolean(record, "isShared", context, fieldPath),
    shareToken: expectOptionalString(record, "shareToken", context, fieldPath),
  };
}

function parseAdminSessionsResponsePayload(
  value: unknown,
  context: RequestContext
): AdminSessionsResponse {
  const record = expectRecord(value, context, "response");
  const sessions = expectArray(record, "sessions", context, "response").map(
    (session, index) =>
      parseAdminSessionPayload(session, context, `response.sessions[${index}]`)
  );

  return {
    sessions,
    total: expectNumber(record, "total", context, "response"),
    page: expectNumber(record, "page", context, "response"),
    pageSize: expectNumber(record, "pageSize", context, "response"),
    totalPages: expectNumber(record, "totalPages", context, "response"),
  };
}

function parseSessionStatsPayload(
  value: unknown,
  context: RequestContext
): SessionStats {
  const record = expectRecord(value, context, "response");

  return {
    totalSessions: expectNumber(record, "totalSessions", context, "response"),
    activeSessions: expectNumber(record, "activeSessions", context, "response"),
    totalMessages: expectNumber(record, "totalMessages", context, "response"),
    totalTokens: expectNumber(record, "totalTokens", context, "response"),
    averageMessagesPerSession: expectNumber(
      record,
      "averageMessagesPerSession",
      context,
      "response"
    ),
    sessionsToday: expectNumber(record, "sessionsToday", context, "response"),
    sessionsThisWeek: expectNumber(
      record,
      "sessionsThisWeek",
      context,
      "response"
    ),
  };
}

function parseBulkActionPayload(
  value: unknown,
  context: RequestContext
): { success: number; failed: number } {
  const record = expectRecord(value, context, "response");

  return {
    success: expectNumber(record, "success", context, "response"),
    failed: expectNumber(record, "failed", context, "response"),
  };
}

function parseSessionDetailsPayload(
  value: unknown,
  context: RequestContext
): AdminSession & { messages: unknown[] } {
  const record = expectRecord(value, context, "response");
  const session = parseAdminSessionPayload(record, context, "response");
  const messages = expectArray(record, "messages", context, "response");

  return {
    ...session,
    messages,
  };
}

function getHttpErrorCode(status: number): AdminApiErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "VALIDATION";
    case 429:
      return "RATE_LIMITED";
    default:
      return status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR";
  }
}

function getDefaultHttpErrorMessage(
  status: number,
  fallbackMessage: string
): string {
  switch (status) {
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Resource not found";
    case 409:
      return "Conflict";
    case 422:
      return "Validation failed";
    case 429:
      return "Too many requests";
    default:
      return status >= 500 ? "Server error" : fallbackMessage;
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const direct = payload.message;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return undefined;
}

async function readHttpErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const rawText = await response.text();
    if (!rawText.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(rawText) as unknown;
      return extractErrorMessage(parsed) ?? rawText;
    } catch {
      return rawText;
    }
  } catch {
    return undefined;
  }
}

async function mapHttpError(
  response: Response,
  context: RequestContext
): Promise<AdminApiError> {
  const message =
    (await readHttpErrorMessage(response)) ??
    getDefaultHttpErrorMessage(response.status, context.fallbackMessage);

  return new AdminApiError({
    code: getHttpErrorCode(response.status),
    message,
    operation: context.operation,
    url: context.url,
    status: response.status,
  });
}

function mapTransportError(
  error: unknown,
  context: RequestContext,
  timedOut: boolean
): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new AdminApiError({
      code: timedOut ? "TIMEOUT" : "ABORTED",
      message: timedOut
        ? `${context.fallbackMessage}: request timed out`
        : `${context.fallbackMessage}: request was aborted`,
      operation: context.operation,
      url: context.url,
      cause: error,
    });
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new AdminApiError({
      code: timedOut ? "TIMEOUT" : "ABORTED",
      message: timedOut
        ? `${context.fallbackMessage}: request timed out`
        : `${context.fallbackMessage}: request was aborted`,
      operation: context.operation,
      url: context.url,
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    return new AdminApiError({
      code: "NETWORK_ERROR",
      message: `${context.fallbackMessage}: network error`,
      operation: context.operation,
      url: context.url,
      cause: error,
    });
  }

  return new AdminApiError({
    code: "NETWORK_ERROR",
    message: context.fallbackMessage,
    operation: context.operation,
    url: context.url,
    cause: error,
  });
}

async function requestAdmin(
  context: RequestContext,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ADMIN_API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(context.url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await mapHttpError(response, context);
    }

    return response;
  } catch (error) {
    throw mapTransportError(error, context, timedOut);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseJsonResponse(
  response: Response,
  context: RequestContext
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw createInvalidResponseError(
      context,
      "response body is not valid JSON",
      error
    );
  }
}

function toSessionPath(sessionId: string): string {
  return `${API_BASE}/sessions/${encodeURIComponent(sessionId)}`;
}

/**
 * Fetch paginated sessions for admin view
 */
export async function fetchAdminSessions(
  filters: SessionFilters
): Promise<AdminSessionsResponse> {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.dateRange !== "all") params.set("dateRange", filters.dateRange);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  params.set("page", filters.page.toString());
  params.set("pageSize", filters.pageSize.toString());
  params.set("sortBy", filters.sortBy);
  params.set("sortOrder", filters.sortOrder);

  const context: RequestContext = {
    operation: "fetchAdminSessions",
    url: `${API_BASE}/sessions?${params.toString()}`,
    fallbackMessage: "Failed to fetch sessions",
  };

  const response = await requestAdmin(context);
  const payload = await parseJsonResponse(response, context);
  return parseAdminSessionsResponsePayload(payload, context);
}

/**
 * Get session statistics
 */
export async function fetchSessionStats(): Promise<SessionStats> {
  const context: RequestContext = {
    operation: "fetchSessionStats",
    url: `${API_BASE}/sessions/stats`,
    fallbackMessage: "Failed to fetch statistics",
  };

  const response = await requestAdmin(context);
  const payload = await parseJsonResponse(response, context);
  return parseSessionStatsPayload(payload, context);
}

/**
 * Delete a single session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const context: RequestContext = {
    operation: "deleteSession",
    url: toSessionPath(sessionId),
    fallbackMessage: "Failed to delete session",
  };

  await requestAdmin(context, {
    method: "DELETE",
  });
}

/**
 * Archive a single session
 */
export async function archiveSession(sessionId: string): Promise<void> {
  const context: RequestContext = {
    operation: "archiveSession",
    url: `${toSessionPath(sessionId)}/archive`,
    fallbackMessage: "Failed to archive session",
  };

  await requestAdmin(context, {
    method: "POST",
  });
}

/**
 * Restore a single session from archive
 */
export async function restoreSession(sessionId: string): Promise<void> {
  const context: RequestContext = {
    operation: "restoreSession",
    url: `${toSessionPath(sessionId)}/restore`,
    fallbackMessage: "Failed to restore session",
  };

  await requestAdmin(context, {
    method: "POST",
  });
}

/**
 * Perform bulk action on sessions
 */
export async function bulkAction(
  sessionIds: string[],
  action: BulkAction
): Promise<{ success: number; failed: number }> {
  const context: RequestContext = {
    operation: "bulkAction",
    url: `${API_BASE}/sessions/bulk`,
    fallbackMessage: `Failed to ${action} sessions`,
  };

  const response = await requestAdmin(context, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionIds, action }),
  });

  const payload = await parseJsonResponse(response, context);
  return parseBulkActionPayload(payload, context);
}

/**
 * Export sessions to CSV
 */
export async function exportSessions(
  sessionIds: string[]
): Promise<Blob> {
  const context: RequestContext = {
    operation: "exportSessions",
    url: `${API_BASE}/sessions/export`,
    fallbackMessage: "Failed to export sessions",
  };

  const response = await requestAdmin(context, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionIds }),
  });

  try {
    return await response.blob();
  } catch (error) {
    throw createInvalidResponseError(
      context,
      "response body could not be read as a file",
      error
    );
  }
}

/**
 * Get session details for admin view
 */
export async function fetchSessionDetails(
  sessionId: string
): Promise<AdminSession & { messages: unknown[] }> {
  const context: RequestContext = {
    operation: "fetchSessionDetails",
    url: toSessionPath(sessionId),
    fallbackMessage: "Failed to fetch session details",
  };

  const response = await requestAdmin(context);
  const payload = await parseJsonResponse(response, context);
  return parseSessionDetailsPayload(payload, context);
}
