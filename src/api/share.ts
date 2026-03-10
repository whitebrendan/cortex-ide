/**
 * API functions for session sharing
 */

import type { SharedSession, ShareSettings, ShareResponse } from "@/types/share";
import {
  ApiError,
  type RequestOptions,
  assertArray,
  assertBoolean,
  assertNumber,
  assertOptionalString,
  assertRecord,
  assertString,
  encodePathSegment,
  optionalTrimmedString,
  requestJson,
  requestVoid,
  requireBoolean,
  requireNonEmptyString,
  toApiInputError,
} from "@/api/http";

const API_BASE = "/api/v1";
const PASSWORD_REQUIRED_MESSAGE = "Password required";
const INVALID_PASSWORD_MESSAGE = "Invalid password";
const SHARE_NOT_FOUND_MESSAGE = "Session not found or expired";

/**
 * Fetch a shared session by token
 */
export async function fetchSharedSession(
  token: string,
  options: RequestOptions = {},
): Promise<SharedSession> {
  return requestJson(`${API_BASE}/share/${encodePathSegment(token, "token")}`, {
    ...options,
    errorMessage: "Failed to fetch shared session",
    statusMessages: {
      401: PASSWORD_REQUIRED_MESSAGE,
      404: SHARE_NOT_FOUND_MESSAGE,
    },
    parseResponse: (value) => parseSharedSession(value),
    validationErrorMessage: "Received an invalid shared session response",
  });
}

/**
 * Fetch a password-protected shared session
 */
export async function fetchProtectedSession(
  token: string,
  password: string,
  options: RequestOptions = {},
): Promise<SharedSession> {
  return requestJson(`${API_BASE}/share/${encodePathSegment(token, "token")}`, {
    ...options,
    method: "POST",
    json: { password: requireNonEmptyString(password, "password") },
    errorMessage: "Failed to fetch shared session",
    statusMessages: {
      401: INVALID_PASSWORD_MESSAGE,
      404: SHARE_NOT_FOUND_MESSAGE,
    },
    parseResponse: (value) => parseSharedSession(value),
    validationErrorMessage: "Received an invalid shared session response",
  });
}

/**
 * Create a new share for a session
 */
export async function createShare(
  sessionId: string,
  settings: ShareSettings,
  options: RequestOptions = {},
): Promise<ShareResponse> {
  return requestJson(
    `${API_BASE}/sessions/${encodePathSegment(sessionId, "sessionId")}/share`,
    {
      ...options,
      method: "POST",
      json: sanitizeShareSettings(settings),
      errorMessage: "Failed to create share",
      statusMessages: {
        401: "Not authorized to create shares",
        403: "Not authorized to create shares",
        404: "Session not found",
      },
      parseResponse: (value) => parseShareResponse(value),
      validationErrorMessage: "Received an invalid share response",
    },
  );
}

/**
 * Revoke a share
 */
export async function revokeShare(
  token: string,
  options: RequestOptions = {},
): Promise<void> {
  await requestVoid(`${API_BASE}/share/${encodePathSegment(token, "token")}`, {
    ...options,
    method: "DELETE",
    errorMessage: "Failed to revoke share",
    statusMessages: {
      401: "Not authorized to revoke shares",
      403: "Not authorized to revoke shares",
      404: SHARE_NOT_FOUND_MESSAGE,
    },
  });
}

/**
 * Report a shared session
 */
export async function reportShare(
  token: string,
  reason: string,
  options: RequestOptions = {},
): Promise<void> {
  await requestVoid(`${API_BASE}/share/${encodePathSegment(token, "token")}/report`, {
    ...options,
    method: "POST",
    json: { reason: requireNonEmptyString(reason, "reason") },
    errorMessage: "Failed to report share",
    statusMessages: {
      404: SHARE_NOT_FOUND_MESSAGE,
    },
  });
}

function sanitizeShareSettings(value: ShareSettings): ShareSettings {
  try {
    const record = assertRecord(value as unknown, "shareSettings");
    const title = optionalTrimmedString(record.title, "shareSettings.title");
    const password = optionalTrimmedString(record.password, "shareSettings.password");
    const includeToolOutputs = requireBoolean(
      record.includeToolOutputs,
      "shareSettings.includeToolOutputs",
    );
    const expiresInHours = normalizeOptionalPositiveInteger(
      record.expiresInHours,
      "shareSettings.expiresInHours",
    );
    const maxMessages = normalizeOptionalPositiveInteger(
      record.maxMessages,
      "shareSettings.maxMessages",
    );

    return {
      includeToolOutputs,
      ...(title ? { title } : {}),
      ...(password ? { password } : {}),
      ...(expiresInHours === null ? { expiresInHours: null } : expiresInHours ? { expiresInHours } : {}),
      ...(maxMessages === null ? { maxMessages: null } : maxMessages ? { maxMessages } : {}),
    };
  } catch (error) {
    throw toApiInputError(error, "Invalid share settings");
  }
}

function normalizeOptionalPositiveInteger(
  value: unknown,
  label: string,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const numberValue = assertNumber(value, label);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new ApiError(`${label} must be a positive integer or null`, {
      code: "INVALID_INPUT",
    });
  }

  return numberValue;
}

function parseSharedSession(value: unknown): SharedSession {
  const record = assertRecord(value, "sharedSessionResponse");

  return {
    id: assertString(record.id, "sharedSessionResponse.id"),
    title: assertString(record.title, "sharedSessionResponse.title"),
    createdAt: assertString(record.createdAt, "sharedSessionResponse.createdAt"),
    expiresAt: assertOptionalString(record.expiresAt, "sharedSessionResponse.expiresAt"),
    messages: assertArray(record.messages, "sharedSessionResponse.messages").map(
      (entry, index) => parseSharedMessage(entry, `sharedSessionResponse.messages[${index}]`),
    ),
    viewCount: assertNumber(record.viewCount, "sharedSessionResponse.viewCount"),
    shareToken: assertString(record.shareToken, "sharedSessionResponse.shareToken"),
    isProtected: assertBoolean(record.isProtected, "sharedSessionResponse.isProtected"),
  };
}

function parseSharedMessage(value: unknown, label: string) {
  const record = assertRecord(value, label);

  return {
    id: assertString(record.id, `${label}.id`),
    role: parseMessageRole(record.role, `${label}.role`),
    content: assertString(record.content, `${label}.content`),
    timestamp: assertString(record.timestamp, `${label}.timestamp`),
    toolCalls: record.toolCalls === undefined
      ? undefined
      : assertArray(record.toolCalls, `${label}.toolCalls`).map((entry, index) =>
          parseSharedToolCall(entry, `${label}.toolCalls[${index}]`),
        ),
  };
}

function parseSharedToolCall(value: unknown, label: string) {
  const record = assertRecord(value, label);

  return {
    id: assertString(record.id, `${label}.id`),
    name: assertString(record.name, `${label}.name`),
    input: assertRecord(record.input, `${label}.input`),
    output: assertOptionalString(record.output, `${label}.output`),
  };
}

function parseMessageRole(value: unknown, label: string): "user" | "assistant" | "system" {
  const role = assertString(value, label);

  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }

  throw new Error(`${label} must be user, assistant, or system`);
}

function parseShareResponse(value: unknown): ShareResponse {
  const record = assertRecord(value, "shareResponse");

  return {
    shareToken: assertString(record.shareToken, "shareResponse.shareToken"),
    shareUrl: assertString(record.shareUrl, "shareResponse.shareUrl"),
    expiresAt: assertOptionalString(record.expiresAt, "shareResponse.expiresAt"),
  };
}
