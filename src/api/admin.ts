/**
 * API functions for admin panel
 */

import type {
  AdminMutationResult,
  AdminSession,
  AdminSessionDetails,
  AdminSessionsResponse,
  BulkAction,
  SessionFilters,
  SessionMutationAction,
  SessionStats,
  SessionStatus,
} from "@/types/admin";

const ADMIN_API_BASE = "/api/v1/admin";
const API_BASE = "/api/v1";
const PATH_RETRY_STATUSES = new Set([404, 405, 501]);

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type UnknownRecord = Record<string, unknown>;

interface RequestCandidate {
  path: string;
  init?: RequestInit;
  retryOnStatuses?: number[];
}

interface AttemptFailure {
  method: HttpMethod;
  path: string;
  status?: number;
  statusText?: string;
  detail?: string;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => entry !== undefined);
}

function getFirstDefined(
  records: Array<UnknownRecord | null | undefined>,
  keys: string[]
): unknown {
  for (const record of records) {
    if (!record) continue;

    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }

  return undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function truncate(value: string, limit = 220): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function extractMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractMessage(entry))
      .filter((entry): entry is string => entry !== undefined);
    return parts.length > 0 ? parts.join("; ") : undefined;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const direct = getFirstDefined([record], [
    "message",
    "error",
    "detail",
    "reason",
    "title",
    "description",
  ]);

  const nested =
    extractMessage(direct) ||
    extractMessage(record.errors) ||
    extractMessage(record.details) ||
    extractMessage(record.cause);

  return nested;
}

function unwrapPayload(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 3; depth += 1) {
    const record = asRecord(current);
    if (!record) {
      return current;
    }

    const nested = getFirstDefined([record], ["data", "result", "payload"]);
    if (nested === undefined) {
      return current;
    }

    current = nested;
  }

  return current;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = asNumber(value);
  if (parsed === undefined || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function buildJsonInit(method: HttpMethod, body?: UnknownRecord): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

async function readFailureDetail(response: Response): Promise<string | undefined> {
  try {
    const text = (await response.text()).trim();
    if (!text) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      const message = extractMessage(parsed);
      return message ? truncate(message) : truncate(text);
    } catch {
      return truncate(text);
    }
  } catch {
    return undefined;
  }
}

function formatAttempt(failure: AttemptFailure): string {
  const status =
    failure.status !== undefined
      ? `${failure.status}${failure.statusText ? ` ${failure.statusText}` : ""}`
      : "network error";
  const detail = failure.detail ? ` — ${failure.detail}` : "";
  return `${failure.method} ${failure.path} -> ${status}${detail}`;
}

function buildActionableError(action: string, failures: AttemptFailure[]): Error {
  const attempts = failures.map((failure) => formatAttempt(failure)).join(" | ");
  return new Error(`[Admin API] Failed to ${action}. ${attempts}`);
}

async function requestWithFallback(
  action: string,
  candidates: RequestCandidate[]
): Promise<{ response: Response; path: string; method: HttpMethod }> {
  if (candidates.length === 0) {
    throw new Error(`[Admin API] No request candidates configured for "${action}".`);
  }

  const failures: AttemptFailure[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const method =
      (candidate.init?.method?.toUpperCase() as HttpMethod | undefined) ?? "GET";

    try {
      const response = await fetch(candidate.path, candidate.init);

      if (response.ok) {
        return { response, path: candidate.path, method };
      }

      const detail = await readFailureDetail(response);
      failures.push({
        method,
        path: candidate.path,
        status: response.status,
        statusText: response.statusText,
        detail,
      });

      const retryStatuses = new Set(
        candidate.retryOnStatuses ?? Array.from(PATH_RETRY_STATUSES)
      );
      const shouldRetry = retryStatuses.has(response.status) && index < candidates.length - 1;

      if (shouldRetry) {
        continue;
      }

      throw buildActionableError(action, failures);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("[Admin API] Failed to")) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : String(error);
      failures.push({ method, path: candidate.path, detail: truncate(detail) });

      if (index < candidates.length - 1) {
        continue;
      }

      throw buildActionableError(action, failures);
    }
  }

  throw buildActionableError(action, failures);
}

async function readResponsePayload(
  response: Response,
  action: string,
  path: string
): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const looksLikeJson =
    contentType.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  if (!looksLikeJson) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `[Admin API] Failed to ${action}: invalid JSON received from ${path} (${truncate(text)}).`
    );
  }
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  const normalized = asString(value)?.toLowerCase();

  switch (normalized) {
    case "active":
      return "active";
    case "archived":
      return "archived";
    case "deleted":
    case "removed":
      return "deleted";
    case "completed":
    case "complete":
    case "done":
    case "closed":
      return "completed";
    default:
      return "completed";
  }
}

function fallbackSession(id: string): AdminSession {
  const now = new Date().toISOString();

  return {
    id,
    userId: "unknown-user",
    title: "Untitled Session",
    status: "completed",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    model: "unknown",
    totalTokens: 0,
    isShared: false,
  };
}

function normalizeAdminSession(raw: unknown, fallbackIdValue: string): AdminSession {
  const record = asRecord(raw);
  if (!record) {
    return fallbackSession(fallbackIdValue);
  }

  const user = asRecord(record.user);
  const now = new Date().toISOString();

  const id =
    asString(getFirstDefined([record], ["id", "sessionId", "session_id"])) ??
    fallbackIdValue;
  const userId =
    asString(getFirstDefined([record, user], ["userId", "user_id", "id"])) ??
    "unknown-user";

  const createdAt =
    asString(getFirstDefined([record], ["createdAt", "created_at"])) ?? now;
  const updatedAt =
    asString(
      getFirstDefined([record], ["updatedAt", "updated_at", "lastUpdatedAt", "last_updated_at"])
    ) ?? createdAt;
  const lastActivityAt =
    asString(
      getFirstDefined([record], [
        "lastActivityAt",
        "last_activity_at",
        "lastMessageAt",
        "last_message_at",
      ])
    ) ?? updatedAt;

  return {
    id,
    userId,
    userEmail: asString(
      getFirstDefined([record, user], ["userEmail", "user_email", "email"])
    ),
    title:
      asString(getFirstDefined([record], ["title", "name", "label"])) ??
      "Untitled Session",
    status: normalizeSessionStatus(getFirstDefined([record], ["status", "state"])),
    messageCount:
      asNumber(
        getFirstDefined([record], [
          "messageCount",
          "message_count",
          "messages",
          "messagesCount",
          "messages_count",
        ])
      ) ?? 0,
    createdAt,
    updatedAt,
    lastActivityAt,
    model:
      asString(getFirstDefined([record], ["model", "modelName", "model_name"])) ??
      "unknown",
    totalTokens:
      asNumber(
        getFirstDefined([record], [
          "totalTokens",
          "total_tokens",
          "tokenCount",
          "token_count",
        ])
      ) ?? 0,
    isShared:
      asBoolean(getFirstDefined([record], ["isShared", "is_shared", "shared"])) ?? false,
    shareToken: asString(getFirstDefined([record], ["shareToken", "share_token"])),
  };
}

function normalizeAdminSessionsResponse(
  raw: unknown,
  filters: SessionFilters
): AdminSessionsResponse {
  const root = asRecord(raw);
  const unwrapped = unwrapPayload(raw);
  const payload = asRecord(unwrapped);
  const pagination = asRecord(
    getFirstDefined([payload, root], ["pagination", "pageInfo", "page_info", "meta"])
  );

  const sessionsSource =
    Array.isArray(unwrapped)
      ? unwrapped
      : getFirstDefined([payload, root, pagination], [
          "sessions",
          "items",
          "results",
          "rows",
          "data",
        ]);

  const sessionsArray = Array.isArray(sessionsSource) ? sessionsSource : [];
  const sessions = sessionsArray.map((session, index) =>
    normalizeAdminSession(session, `session-${filters.page}-${index + 1}`)
  );

  const pageSize = toPositiveInt(
    getFirstDefined([payload, root, pagination], [
      "pageSize",
      "page_size",
      "perPage",
      "per_page",
      "limit",
    ]),
    filters.pageSize
  );

  const total = Math.max(
    asNumber(
      getFirstDefined([payload, root, pagination], [
        "total",
        "totalCount",
        "total_count",
        "count",
      ])
    ) ?? sessions.length,
    sessions.length
  );

  const page = toPositiveInt(
    getFirstDefined([payload, root, pagination], ["page", "currentPage", "current_page"]),
    filters.page
  );

  const totalPages = toPositiveInt(
    getFirstDefined([payload, root, pagination], [
      "totalPages",
      "total_pages",
      "pages",
      "pageCount",
      "page_count",
    ]),
    Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))
  );

  return {
    sessions,
    total,
    page,
    pageSize,
    totalPages,
  };
}

function normalizeSessionStats(raw: unknown): SessionStats {
  const root = asRecord(raw);
  const payload = asRecord(unwrapPayload(raw)) ?? root;

  if (!payload) {
    throw new Error(
      "[Admin API] Failed to fetch statistics: response did not contain a JSON object."
    );
  }

  const totalSessions =
    asNumber(getFirstDefined([payload, root], ["totalSessions", "total_sessions", "total"])) ??
    0;
  const totalMessages =
    asNumber(
      getFirstDefined([payload, root], ["totalMessages", "total_messages", "messages"])
    ) ?? 0;

  return {
    totalSessions,
    activeSessions:
      asNumber(getFirstDefined([payload, root], ["activeSessions", "active_sessions", "active"])) ??
      0,
    totalMessages,
    totalTokens:
      asNumber(getFirstDefined([payload, root], ["totalTokens", "total_tokens", "tokens"])) ??
      0,
    averageMessagesPerSession:
      asNumber(
        getFirstDefined([payload, root], [
          "averageMessagesPerSession",
          "average_messages_per_session",
          "avgMessagesPerSession",
          "avg_messages_per_session",
        ])
      ) ?? (totalSessions > 0 ? totalMessages / totalSessions : 0),
    sessionsToday:
      asNumber(getFirstDefined([payload, root], ["sessionsToday", "sessions_today", "today"])) ??
      0,
    sessionsThisWeek:
      asNumber(
        getFirstDefined([payload, root], ["sessionsThisWeek", "sessions_this_week", "thisWeek"])
      ) ?? 0,
  };
}

function normalizeMutationResult(
  action: SessionMutationAction,
  sessionIds: string[],
  raw: unknown
): AdminMutationResult {
  const root = asRecord(raw);
  const payload = asRecord(unwrapPayload(raw));
  const records: Array<UnknownRecord | null> = [payload, root];

  const requested = Math.max(
    0,
    toPositiveInt(
      getFirstDefined(records, ["requested", "requestedCount", "requested_count", "total"]),
      Math.max(sessionIds.length, 1)
    )
  );

  const successValue = getFirstDefined(records, [
    "success",
    "succeeded",
    "successCount",
    "success_count",
    "processed",
    "processedCount",
    "processed_count",
  ]);
  const failedValue = getFirstDefined(records, [
    "failed",
    "failedCount",
    "failed_count",
    "failureCount",
    "failure_count",
  ]);

  const failedIds = asStringArray(
    getFirstDefined(records, ["failedIds", "failed_ids", "failedSessionIds", "failed_session_ids"])
  );

  const successFromBoolean = asBoolean(successValue);
  const failedFromBoolean = asBoolean(failedValue);

  let success =
    successFromBoolean !== undefined
      ? successFromBoolean
        ? requested
        : 0
      : asNumber(successValue);
  let failed =
    failedFromBoolean !== undefined
      ? failedFromBoolean
        ? requested
        : 0
      : asNumber(failedValue);

  if (failed === undefined && failedIds.length > 0) {
    failed = failedIds.length;
  }

  if (success === undefined && failed === undefined) {
    success = requested;
    failed = 0;
  } else if (success === undefined) {
    success = Math.max(requested - (failed ?? 0), 0);
  } else if (failed === undefined) {
    failed = Math.max(requested - success, 0);
  }

  const normalizedSuccess = Math.max(0, Math.floor(success ?? 0));
  const normalizedFailed = Math.max(
    0,
    Math.floor(failed ?? Math.max(requested - normalizedSuccess, 0))
  );

  const message =
    extractMessage(getFirstDefined(records, ["message", "detail", "error", "errors"])) ??
    undefined;

  return {
    action,
    requested,
    success: normalizedSuccess,
    failed: normalizedFailed,
    sessionIds,
    failedIds: failedIds.length > 0 ? failedIds : undefined,
    message,
  };
}

function ensureMutationSucceeded(result: AdminMutationResult, actionText: string): AdminMutationResult {
  if (result.requested > 0 && result.success <= 0) {
    throw new Error(
      `[Admin API] ${actionText} failed${result.message ? `: ${result.message}` : "."}`
    );
  }

  return result;
}

function buildSessionsQuery(filters: SessionFilters): string {
  const params = new URLSearchParams();

  const set = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  };

  const search = filters.search.trim();
  if (search) set("search", search);

  if (filters.dateRange !== "all") {
    set("dateRange", filters.dateRange);
    set("date_range", filters.dateRange);
  }

  if (filters.status !== "all") {
    set("status", filters.status);
  }

  if (filters.startDate) {
    set("startDate", filters.startDate);
    set("start_date", filters.startDate);
  }

  if (filters.endDate) {
    set("endDate", filters.endDate);
    set("end_date", filters.endDate);
  }

  set("page", String(filters.page));
  set("pageSize", String(filters.pageSize));
  set("page_size", String(filters.pageSize));

  set("sortBy", filters.sortBy);
  set("sort_by", filters.sortBy);

  set("sortOrder", filters.sortOrder);
  set("sort_order", filters.sortOrder);

  return params.toString();
}

function buildSessionMutationPayload(sessionId: string, action: SessionMutationAction): UnknownRecord {
  return {
    id: sessionId,
    sessionId,
    session_id: sessionId,
    action,
    operation: action,
    type: action,
  };
}

function buildBulkPayload(
  sessionIds: string[],
  action: SessionMutationAction
): UnknownRecord {
  return {
    action,
    operation: action,
    type: action,
    sessionIds,
    session_ids: sessionIds,
    ids: sessionIds,
  };
}

function buildExportPayload(sessionIds: string[]): UnknownRecord {
  return {
    sessionIds,
    session_ids: sessionIds,
    ids: sessionIds,
  };
}

function normalizeSessionDetails(raw: unknown, fallbackSessionId: string): AdminSessionDetails {
  const root = asRecord(raw);
  const unwrapped = unwrapPayload(raw);
  const payload = asRecord(unwrapped);
  const nestedSession = asRecord(getFirstDefined([payload, root], ["session", "details"]));

  const sessionSource = nestedSession ?? payload ?? root;
  if (!sessionSource) {
    throw new Error(
      "[Admin API] Failed to fetch session details: response did not contain session data."
    );
  }

  const messagesSource = getFirstDefined([payload, root, sessionSource], [
    "messages",
    "history",
    "conversation",
    "entries",
    "items",
  ]);

  const messages = Array.isArray(messagesSource) ? messagesSource : [];
  const baseSession = normalizeAdminSession(sessionSource, fallbackSessionId);

  return {
    ...baseSession,
    messages,
  };
}

function looksLikeBase64(value: string): boolean {
  const normalized = value.trim().replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  return (
    normalized.length > 0 &&
    normalized.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(normalized)
  );
}

function decodeBase64ToBlob(base64Value: string, contentType: string): Blob {
  const normalized = base64Value
    .trim()
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s+/g, "");

  if (!normalized) {
    throw new Error("[Admin API] Export payload contained an empty base64 field.");
  }

  if (typeof atob !== "function") {
    throw new Error("[Admin API] Base64 decoding is not available in this runtime.");
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: contentType });
}

async function normalizeExportPayloadToBlob(raw: unknown): Promise<Blob> {
  if (raw instanceof Blob) {
    return raw;
  }

  if (typeof raw === "string") {
    return new Blob([raw], { type: "text/csv;charset=utf-8" });
  }

  const root = asRecord(raw);
  const payload = asRecord(unwrapPayload(raw));
  const records: Array<UnknownRecord | null> = [payload, root];

  if (!records.some((record) => record !== null)) {
    throw new Error(
      "[Admin API] Export succeeded but response did not contain CSV data, base64 content, or a download URL."
    );
  }

  const contentType =
    asString(getFirstDefined(records, ["contentType", "content_type", "mimeType", "mime_type"])) ??
    "text/csv;charset=utf-8";

  const csvText = asString(
    getFirstDefined(records, ["csv", "content", "fileContent", "file_content", "text"])
  );
  if (csvText && !looksLikeBase64(csvText)) {
    return new Blob([csvText], { type: contentType });
  }

  const base64Content = asString(
    getFirstDefined(records, [
      "base64",
      "csvBase64",
      "csv_base64",
      "contentBase64",
      "content_base64",
      "data",
    ])
  );
  if (base64Content && looksLikeBase64(base64Content)) {
    return decodeBase64ToBlob(base64Content, contentType);
  }

  const downloadUrl = asString(
    getFirstDefined(records, ["downloadUrl", "download_url", "url", "href"])
  );
  if (downloadUrl) {
    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
      throw new Error(
        `[Admin API] Failed to download exported sessions from ${downloadUrl}: ${downloadResponse.status} ${downloadResponse.statusText}.`
      );
    }

    return downloadResponse.blob();
  }

  if (csvText) {
    return new Blob([csvText], { type: contentType });
  }

  throw new Error(
    "[Admin API] Export succeeded but response did not contain CSV data, base64 content, or a download URL."
  );
}

/**
 * Fetch paginated sessions for admin view
 */
export async function fetchAdminSessions(
  filters: SessionFilters
): Promise<AdminSessionsResponse> {
  const query = buildSessionsQuery(filters);
  const paths = unique([
    `${ADMIN_API_BASE}/sessions`,
    `${API_BASE}/sessions`,
    `${API_BASE}/sessions/admin`,
  ]).map((path) => (query ? `${path}?${query}` : path));

  const { response, path } = await requestWithFallback(
    "fetch sessions",
    paths.map((candidatePath) => ({
      path: candidatePath,
      init: { method: "GET" },
    }))
  );

  const payload = await readResponsePayload(response, "fetch sessions", path);
  return normalizeAdminSessionsResponse(payload, filters);
}

/**
 * Get session statistics
 */
export async function fetchSessionStats(): Promise<SessionStats> {
  const paths = unique([
    `${ADMIN_API_BASE}/sessions/stats`,
    `${API_BASE}/sessions/stats`,
    `${API_BASE}/sessions/admin/stats`,
  ]);

  const { response, path } = await requestWithFallback(
    "fetch session statistics",
    paths.map((candidatePath) => ({
      path: candidatePath,
      init: { method: "GET" },
    }))
  );

  const payload = await readResponsePayload(response, "fetch session statistics", path);
  return normalizeSessionStats(payload);
}

/**
 * Delete a single session
 */
export async function deleteSession(sessionId: string): Promise<AdminMutationResult> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("[Admin API] Cannot delete session: session ID is required.");
  }

  const encodedId = encodeURIComponent(normalizedSessionId);
  const actionPayload = buildSessionMutationPayload(normalizedSessionId, "delete");
  const retryOnMutationFallback = [400, 404, 405, 422, 501];

  const { response, path } = await requestWithFallback(`delete session "${normalizedSessionId}"`, [
    {
      path: `${ADMIN_API_BASE}/sessions/${encodedId}`,
      init: { method: "DELETE" },
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${API_BASE}/sessions/${encodedId}`,
      init: { method: "DELETE" },
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${ADMIN_API_BASE}/sessions/${encodedId}/delete`,
      init: buildJsonInit("POST", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${API_BASE}/sessions/${encodedId}/delete`,
      init: buildJsonInit("POST", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
  ]);

  const payload = await readResponsePayload(response, `delete session "${normalizedSessionId}"`, path);
  const result = normalizeMutationResult("delete", [normalizedSessionId], payload);

  return ensureMutationSucceeded(result, `Delete session "${normalizedSessionId}"`);
}

/**
 * Archive a single session
 */
export async function archiveSession(sessionId: string): Promise<AdminMutationResult> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("[Admin API] Cannot archive session: session ID is required.");
  }

  const encodedId = encodeURIComponent(normalizedSessionId);
  const actionPayload = {
    ...buildSessionMutationPayload(normalizedSessionId, "archive"),
    status: "archived",
  };
  const retryOnMutationFallback = [400, 404, 405, 422, 501];

  const { response, path } = await requestWithFallback(`archive session "${normalizedSessionId}"`, [
    {
      path: `${ADMIN_API_BASE}/sessions/${encodedId}/archive`,
      init: buildJsonInit("POST", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${API_BASE}/sessions/${encodedId}/archive`,
      init: buildJsonInit("POST", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${ADMIN_API_BASE}/sessions/${encodedId}`,
      init: buildJsonInit("PATCH", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${API_BASE}/sessions/${encodedId}`,
      init: buildJsonInit("PATCH", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
  ]);

  const payload = await readResponsePayload(response, `archive session "${normalizedSessionId}"`, path);
  const result = normalizeMutationResult("archive", [normalizedSessionId], payload);

  return ensureMutationSucceeded(result, `Archive session "${normalizedSessionId}"`);
}

/**
 * Restore a single session from archive
 */
export async function restoreSession(sessionId: string): Promise<AdminMutationResult> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("[Admin API] Cannot restore session: session ID is required.");
  }

  const encodedId = encodeURIComponent(normalizedSessionId);
  const actionPayload = {
    ...buildSessionMutationPayload(normalizedSessionId, "restore"),
    status: "active",
  };
  const retryOnMutationFallback = [400, 404, 405, 422, 501];

  const { response, path } = await requestWithFallback(`restore session "${normalizedSessionId}"`, [
    {
      path: `${ADMIN_API_BASE}/sessions/${encodedId}/restore`,
      init: buildJsonInit("POST", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${API_BASE}/sessions/${encodedId}/restore`,
      init: buildJsonInit("POST", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${ADMIN_API_BASE}/sessions/${encodedId}`,
      init: buildJsonInit("PATCH", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
    {
      path: `${API_BASE}/sessions/${encodedId}`,
      init: buildJsonInit("PATCH", actionPayload),
      retryOnStatuses: retryOnMutationFallback,
    },
  ]);

  const payload = await readResponsePayload(response, `restore session "${normalizedSessionId}"`, path);
  const result = normalizeMutationResult("restore", [normalizedSessionId], payload);

  return ensureMutationSucceeded(result, `Restore session "${normalizedSessionId}"`);
}

/**
 * Perform bulk action on sessions
 */
export async function bulkAction(
  sessionIds: string[],
  action: BulkAction
): Promise<AdminMutationResult> {
  if (action === "export") {
    throw new Error(
      "[Admin API] bulkAction does not support \"export\". Use exportSessions(sessionIds) instead."
    );
  }

  const normalizedIds = unique(sessionIds.map((id) => id.trim()).filter((id) => id.length > 0));
  if (normalizedIds.length === 0) {
    throw new Error(`[Admin API] Cannot ${action} sessions: no session IDs were provided.`);
  }

  const payload = buildBulkPayload(normalizedIds, action);
  const retryOnBulkFallback = [400, 404, 405, 422, 501];

  const { response, path } = await requestWithFallback(`${action} selected sessions`, [
    {
      path: `${ADMIN_API_BASE}/sessions/bulk`,
      init: buildJsonInit("POST", payload),
      retryOnStatuses: retryOnBulkFallback,
    },
    {
      path: `${API_BASE}/sessions/bulk`,
      init: buildJsonInit("POST", payload),
      retryOnStatuses: retryOnBulkFallback,
    },
    {
      path: `${ADMIN_API_BASE}/sessions/bulk-action`,
      init: buildJsonInit("POST", payload),
      retryOnStatuses: retryOnBulkFallback,
    },
    {
      path: `${API_BASE}/sessions/bulk-action`,
      init: buildJsonInit("POST", payload),
      retryOnStatuses: retryOnBulkFallback,
    },
  ]);

  const responsePayload = await readResponsePayload(response, `${action} selected sessions`, path);
  const result = normalizeMutationResult(action, normalizedIds, responsePayload);

  return ensureMutationSucceeded(result, `${action} selected sessions`);
}

/**
 * Export sessions to CSV
 */
export async function exportSessions(sessionIds: string[]): Promise<Blob> {
  const normalizedIds = unique(sessionIds.map((id) => id.trim()).filter((id) => id.length > 0));
  if (normalizedIds.length === 0) {
    throw new Error("[Admin API] Cannot export sessions: no session IDs were provided.");
  }

  const payload = buildExportPayload(normalizedIds);

  const { response } = await requestWithFallback("export sessions", [
    {
      path: `${ADMIN_API_BASE}/sessions/export`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/csv, application/octet-stream, application/json",
        },
        body: JSON.stringify(payload),
      },
      retryOnStatuses: [400, 404, 405, 422, 501],
    },
    {
      path: `${API_BASE}/sessions/export`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/csv, application/octet-stream, application/json",
        },
        body: JSON.stringify(payload),
      },
      retryOnStatuses: [400, 404, 405, 422, 501],
    },
    {
      path: `${API_BASE}/sessions/bulk-export`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/csv, application/octet-stream, application/json",
        },
        body: JSON.stringify(payload),
      },
      retryOnStatuses: [400, 404, 405, 422, 501],
    },
  ]);

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return response.blob();
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    return new Blob([], { type: "text/csv;charset=utf-8" });
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return await normalizeExportPayloadToBlob(parsed);
  } catch {
    return new Blob([rawText], { type: "text/csv;charset=utf-8" });
  }
}

/**
 * Get session details for admin view
 */
export async function fetchSessionDetails(
  sessionId: string
): Promise<AdminSessionDetails> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("[Admin API] Cannot fetch session details: session ID is required.");
  }

  const encodedId = encodeURIComponent(normalizedSessionId);

  const { response, path } = await requestWithFallback(
    `fetch session details for "${normalizedSessionId}"`,
    [
      {
        path: `${ADMIN_API_BASE}/sessions/${encodedId}`,
        init: { method: "GET" },
      },
      {
        path: `${API_BASE}/sessions/${encodedId}`,
        init: { method: "GET" },
      },
      {
        path: `${ADMIN_API_BASE}/sessions/${encodedId}/details`,
        init: { method: "GET" },
      },
      {
        path: `${API_BASE}/sessions/${encodedId}/details`,
        init: { method: "GET" },
      },
    ]
  );

  const payload = await readResponsePayload(
    response,
    `fetch session details for "${normalizedSessionId}"`,
    path
  );

  return normalizeSessionDetails(payload, normalizedSessionId);
}