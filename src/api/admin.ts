/**
 * API functions for admin panel
 */

import type {
  AdminSession,
  AdminSessionsResponse,
  SessionFilters,
  SessionStats,
  BulkAction,
} from "@/types/admin";
import {
  ApiError,
  type RequestOptions,
  assertArray,
  assertBoolean,
  assertEnum,
  assertNumber,
  assertOptionalString,
  assertRecord,
  assertString,
  encodePathSegment,
  optionalTrimmedString,
  requestBlob,
  requestJson,
  requestVoid,
  sanitizeStringList,
} from "@/api/http";

const API_BASE = "/api/v1/admin";
const DATE_RANGES = ["all", "today", "week", "month", "custom"] as const;
const SESSION_STATUSES = ["active", "completed", "archived", "deleted"] as const;
const FILTER_STATUSES = [...SESSION_STATUSES, "all"] as const;
const SORT_FIELDS = ["createdAt", "updatedAt", "messageCount", "totalTokens"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;
const BULK_ACTIONS = ["delete", "archive", "restore", "export"] as const;
const MAX_PAGE_SIZE = 100;

interface SessionDetailResponse extends AdminSession {
  messages: unknown[];
}

/**
 * Fetch paginated sessions for admin view
 */
export async function fetchAdminSessions(
  filters: SessionFilters,
  options: RequestOptions = {},
): Promise<AdminSessionsResponse> {
  const params = buildSessionFilters(filters);

  return requestJson(`${API_BASE}/sessions?${params.toString()}`, {
    ...options,
    errorMessage: "Failed to fetch sessions",
    statusMessages: {
      401: "Not authorized to view admin sessions",
      403: "Not authorized to view admin sessions",
    },
    parseResponse: (value) => parseAdminSessionsResponse(value),
    validationErrorMessage: "Received an invalid admin sessions response",
  });
}

/**
 * Get session statistics
 */
export async function fetchSessionStats(
  options: RequestOptions = {},
): Promise<SessionStats> {
  return requestJson(`${API_BASE}/sessions/stats`, {
    ...options,
    errorMessage: "Failed to fetch statistics",
    statusMessages: {
      401: "Not authorized to view admin statistics",
      403: "Not authorized to view admin statistics",
    },
    parseResponse: (value) => parseSessionStats(value),
    validationErrorMessage: "Received an invalid admin statistics response",
  });
}

/**
 * Delete a single session
 */
export async function deleteSession(
  sessionId: string,
  options: RequestOptions = {},
): Promise<void> {
  await requestVoid(`${API_BASE}/sessions/${encodePathSegment(sessionId, "sessionId")}`, {
    ...options,
    method: "DELETE",
    errorMessage: "Failed to delete session",
    statusMessages: {
      401: "Not authorized to delete sessions",
      403: "Not authorized to delete sessions",
      404: "Session not found",
    },
  });
}

/**
 * Archive a single session
 */
export async function archiveSession(
  sessionId: string,
  options: RequestOptions = {},
): Promise<void> {
  await requestVoid(
    `${API_BASE}/sessions/${encodePathSegment(sessionId, "sessionId")}/archive`,
    {
      ...options,
      method: "POST",
      errorMessage: "Failed to archive session",
      statusMessages: {
        401: "Not authorized to archive sessions",
        403: "Not authorized to archive sessions",
        404: "Session not found",
      },
    },
  );
}

/**
 * Restore a single session from archive
 */
export async function restoreSession(
  sessionId: string,
  options: RequestOptions = {},
): Promise<void> {
  await requestVoid(
    `${API_BASE}/sessions/${encodePathSegment(sessionId, "sessionId")}/restore`,
    {
      ...options,
      method: "POST",
      errorMessage: "Failed to restore session",
      statusMessages: {
        401: "Not authorized to restore sessions",
        403: "Not authorized to restore sessions",
        404: "Session not found",
      },
    },
  );
}

/**
 * Perform bulk action on sessions
 */
export async function bulkAction(
  sessionIds: string[],
  action: BulkAction,
  options: RequestOptions = {},
): Promise<{ success: number; failed: number }> {
  const sanitizedSessionIds = sanitizeStringList(sessionIds, "sessionIds");
  const sanitizedAction = assertEnum(action, "action", BULK_ACTIONS);

  return requestJson(`${API_BASE}/sessions/bulk`, {
    ...options,
    method: "POST",
    json: { sessionIds: sanitizedSessionIds, action: sanitizedAction },
    errorMessage: `Failed to ${sanitizedAction} sessions`,
    statusMessages: {
      401: "Not authorized to update sessions",
      403: "Not authorized to update sessions",
    },
    parseResponse: (value) => parseBulkActionResult(value),
    validationErrorMessage: "Received an invalid bulk action response",
  });
}

/**
 * Export sessions to CSV
 */
export async function exportSessions(
  sessionIds: string[],
  options: RequestOptions = {},
): Promise<Blob> {
  const sanitizedSessionIds = sanitizeStringList(sessionIds, "sessionIds");

  return requestBlob(`${API_BASE}/sessions/export`, {
    ...options,
    method: "POST",
    accept: "text/csv",
    json: { sessionIds: sanitizedSessionIds },
    errorMessage: "Failed to export sessions",
    statusMessages: {
      401: "Not authorized to export sessions",
      403: "Not authorized to export sessions",
    },
  });
}

/**
 * Get session details for admin view
 */
export async function fetchSessionDetails(
  sessionId: string,
  options: RequestOptions = {},
): Promise<SessionDetailResponse> {
  return requestJson(`${API_BASE}/sessions/${encodePathSegment(sessionId, "sessionId")}`, {
    ...options,
    errorMessage: "Failed to fetch session details",
    statusMessages: {
      401: "Not authorized to view session details",
      403: "Not authorized to view session details",
      404: "Session not found",
    },
    parseResponse: (value) => parseSessionDetailResponse(value),
    validationErrorMessage: "Received an invalid session details response",
  });
}

function buildSessionFilters(filters: SessionFilters): URLSearchParams {
  const filterRecord = assertRecord(filters as unknown, "filters");
  const params = new URLSearchParams();

  const search = optionalTrimmedString(filterRecord.search, "filters.search");
  const dateRange = assertEnum(filterRecord.dateRange, "filters.dateRange", DATE_RANGES);
  const status = assertEnum(filterRecord.status, "filters.status", FILTER_STATUSES);
  const startDate = parseOptionalDate(filterRecord.startDate, "filters.startDate");
  const endDate = parseOptionalDate(filterRecord.endDate, "filters.endDate");
  const page = normalizePositiveInteger(filterRecord.page, "filters.page");
  const pageSize = Math.min(
    normalizePositiveInteger(filterRecord.pageSize, "filters.pageSize"),
    MAX_PAGE_SIZE,
  );
  const sortBy = assertEnum(filterRecord.sortBy, "filters.sortBy", SORT_FIELDS);
  const sortOrder = assertEnum(filterRecord.sortOrder, "filters.sortOrder", SORT_ORDERS);

  if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
    throw new ApiError("filters.endDate must be on or after filters.startDate", {
      code: "INVALID_INPUT",
    });
  }

  if (search) {
    params.set("search", search);
  }

  if (dateRange !== "all") {
    params.set("dateRange", dateRange);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (startDate) {
    params.set("startDate", startDate);
  }

  if (endDate) {
    params.set("endDate", endDate);
  }

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);

  return params;
}

function normalizePositiveInteger(value: unknown, label: string): number {
  const numberValue = assertNumber(value, label);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new ApiError(`${label} must be a positive integer`, {
      code: "INVALID_INPUT",
    });
  }

  return numberValue;
}

function parseOptionalDate(value: unknown, label: string): string | undefined {
  const dateValue = optionalTrimmedString(value, label);

  if (!dateValue) {
    return undefined;
  }

  if (Number.isNaN(Date.parse(dateValue))) {
    throw new ApiError(`${label} must be a valid date string`, {
      code: "INVALID_INPUT",
    });
  }

  return dateValue;
}

function parseAdminSessionsResponse(value: unknown): AdminSessionsResponse {
  const record = assertRecord(value, "adminSessionsResponse");
  const sessions = assertArray(record.sessions, "adminSessionsResponse.sessions").map(
    (entry, index) => parseAdminSession(entry, `adminSessionsResponse.sessions[${index}]`),
  );

  return {
    sessions,
    total: assertNumber(record.total, "adminSessionsResponse.total"),
    page: assertNumber(record.page, "adminSessionsResponse.page"),
    pageSize: assertNumber(record.pageSize, "adminSessionsResponse.pageSize"),
    totalPages: assertNumber(record.totalPages, "adminSessionsResponse.totalPages"),
  };
}

function parseSessionStats(value: unknown): SessionStats {
  const record = assertRecord(value, "sessionStats");

  return {
    totalSessions: assertNumber(record.totalSessions, "sessionStats.totalSessions"),
    activeSessions: assertNumber(record.activeSessions, "sessionStats.activeSessions"),
    totalMessages: assertNumber(record.totalMessages, "sessionStats.totalMessages"),
    totalTokens: assertNumber(record.totalTokens, "sessionStats.totalTokens"),
    averageMessagesPerSession: assertNumber(
      record.averageMessagesPerSession,
      "sessionStats.averageMessagesPerSession",
    ),
    sessionsToday: assertNumber(record.sessionsToday, "sessionStats.sessionsToday"),
    sessionsThisWeek: assertNumber(
      record.sessionsThisWeek,
      "sessionStats.sessionsThisWeek",
    ),
  };
}

function parseAdminSession(value: unknown, label: string): AdminSession {
  const record = assertRecord(value, label);

  return {
    id: assertString(record.id, `${label}.id`),
    userId: assertString(record.userId, `${label}.userId`),
    userEmail: assertOptionalString(record.userEmail, `${label}.userEmail`),
    title: assertString(record.title, `${label}.title`),
    status: assertEnum(record.status, `${label}.status`, SESSION_STATUSES),
    messageCount: assertNumber(record.messageCount, `${label}.messageCount`),
    createdAt: assertString(record.createdAt, `${label}.createdAt`),
    updatedAt: assertString(record.updatedAt, `${label}.updatedAt`),
    lastActivityAt: assertString(record.lastActivityAt, `${label}.lastActivityAt`),
    model: assertString(record.model, `${label}.model`),
    totalTokens: assertNumber(record.totalTokens, `${label}.totalTokens`),
    isShared: assertBoolean(record.isShared, `${label}.isShared`),
    shareToken: assertOptionalString(record.shareToken, `${label}.shareToken`),
  };
}

function parseBulkActionResult(value: unknown): { success: number; failed: number } {
  const record = assertRecord(value, "bulkActionResult");

  return {
    success: assertNumber(record.success, "bulkActionResult.success"),
    failed: assertNumber(record.failed, "bulkActionResult.failed"),
  };
}

function parseSessionDetailResponse(value: unknown): SessionDetailResponse {
  const record = assertRecord(value, "sessionDetailResponse");

  return {
    ...parseAdminSession(record, "sessionDetailResponse"),
    messages: assertArray(record.messages, "sessionDetailResponse.messages"),
  };
}
