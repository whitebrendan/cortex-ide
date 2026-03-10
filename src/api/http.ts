export const DEFAULT_API_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiErrorOptions {
  status?: number;
  url?: string;
  method?: string;
  code?: string;
  details?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly url?: string;
  readonly method?: string;
  readonly code: string;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.url = options.url;
    this.method = options.method;
    this.code = options.code ?? "HTTP_ERROR";
    this.details = options.details;
    this.cause = options.cause;

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

export function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

export function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value == null) {
    return undefined;
  }

  return assertString(value, label);
}

export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

export function assertNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
}

export function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value;
}

export function assertEnum<T extends string>(
  value: unknown,
  label: string,
  allowedValues: readonly T[],
): T {
  const stringValue = assertString(value, label);

  if (!allowedValues.includes(stringValue as T)) {
    throw new Error(`${label} must be one of ${allowedValues.join(", ")}`);
  }

  return stringValue as T;
}

export function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new ApiError(`${label} must be a string`, { code: "INVALID_INPUT" });
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new ApiError(`${label} is required`, { code: "INVALID_INPUT" });
  }

  return trimmedValue;
}

export function optionalTrimmedString(value: unknown, label: string): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ApiError(`${label} must be a string`, { code: "INVALID_INPUT" });
  }

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiError(`${label} must be a boolean`, { code: "INVALID_INPUT" });
  }

  return value;
}

export function toApiInputError(
  error: unknown,
  fallbackMessage = "Invalid request input",
): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(error.message || fallbackMessage, {
      code: "INVALID_INPUT",
      cause: error,
    });
  }

  return new ApiError(fallbackMessage, {
    code: "INVALID_INPUT",
    cause: error,
  });
}

export function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApiError(`${label} must be an array`, { code: "INVALID_INPUT" });
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new ApiError(`${label}[${index}] must be a string`, {
        code: "INVALID_INPUT",
      });
    }

    return entry;
  });
}

export function sanitizeStringList(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean } = {},
): string[] {
  const entries = requireStringArray(value, label);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry || seen.has(trimmedEntry)) {
      continue;
    }

    seen.add(trimmedEntry);
    result.push(trimmedEntry);
  }

  if (!options.allowEmpty && result.length === 0) {
    throw new ApiError(`${label} must include at least one item`, {
      code: "INVALID_INPUT",
    });
  }

  return result;
}

export function encodePathSegment(value: unknown, label: string): string {
  return encodeURIComponent(requireNonEmptyString(value, label));
}

interface BaseApiRequestOptions extends RequestOptions, Omit<RequestInit, "body" | "signal"> {
  body?: BodyInit | null;
  json?: unknown;
  errorMessage: string;
  statusMessages?: Partial<Record<number, string>>;
  accept?: string;
}

export interface JsonRequestOptions<T> extends BaseApiRequestOptions {
  parseResponse: (value: unknown) => T;
  validationErrorMessage?: string;
}

interface ParsedErrorPayload {
  message?: string;
  code?: string;
  details?: unknown;
}

export async function requestJson<T>(url: string, options: JsonRequestOptions<T>): Promise<T> {
  const method = getRequestMethod(options);
  const response = await performRequest(url, options, method);
  const validationErrorMessage = options.validationErrorMessage ?? options.errorMessage;

  let payload: unknown;

  try {
    payload = await readJsonResponse(response);
  } catch (error) {
    throw new ApiError(validationErrorMessage, {
      url,
      method,
      code: "INVALID_RESPONSE",
      details: error instanceof Error ? error.message : error,
      cause: error,
    });
  }

  try {
    return options.parseResponse(payload);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(validationErrorMessage, {
      url,
      method,
      code: "INVALID_RESPONSE",
      details: error instanceof Error ? error.message : error,
      cause: error,
    });
  }
}

export async function requestVoid(url: string, options: BaseApiRequestOptions): Promise<void> {
  const method = getRequestMethod(options);
  await performRequest(url, options, method);
}

export async function requestBlob(url: string, options: BaseApiRequestOptions): Promise<Blob> {
  const method = getRequestMethod(options);
  const response = await performRequest(url, options, method);
  return response.blob();
}

function getRequestMethod(options: BaseApiRequestOptions): string {
  const explicitMethod = options.method?.toUpperCase();

  if (explicitMethod) {
    return explicitMethod;
  }

  return options.json !== undefined || options.body !== undefined ? "POST" : "GET";
}

async function performRequest(
  url: string,
  options: BaseApiRequestOptions,
  method: string,
): Promise<Response> {
  const {
    errorMessage,
    statusMessages,
    accept,
    json,
    body,
    signal: externalSignal,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    headers: rawHeaders,
    ...requestInit
  } = options;

  const headers = new Headers(rawHeaders);

  if (accept && !headers.has("Accept")) {
    headers.set("Accept", accept);
  }

  if (json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const { signal, cleanup, timedOut } = createRequestSignal(externalSignal, timeoutMs);

  const init: RequestInit = {
    ...requestInit,
    method,
    headers,
    credentials: requestInit.credentials ?? "same-origin",
    signal,
  };

  if (json !== undefined) {
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body;
  }

  try {
    const response = await fetch(url, init);

    if (!response.ok) {
      const parsedPayload = await readErrorPayload(response);
      throw new ApiError(
        statusMessages?.[response.status] ?? parsedPayload.message ?? errorMessage,
        {
          status: response.status,
          url,
          method,
          code: parsedPayload.code ?? "HTTP_ERROR",
          details: parsedPayload.details,
        },
      );
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (timedOut()) {
      throw new ApiError(`${errorMessage} (request timed out)`, {
        url,
        method,
        code: "TIMEOUT",
        cause: error,
      });
    }

    if (externalSignal?.aborted) {
      throw new ApiError(`${errorMessage} (request was cancelled)`, {
        url,
        method,
        code: "ABORTED",
        cause: error,
      });
    }

    throw new ApiError(errorMessage, {
      url,
      method,
      code: "NETWORK_ERROR",
      cause: error,
    });
  } finally {
    cleanup();
  }
}

function createRequestSignal(externalSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortFromExternalSignal = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else if (externalSignal) {
    externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    },
    timedOut: () => timedOut,
  };
}

async function readErrorPayload(response: Response): Promise<ParsedErrorPayload> {
  const text = await safeReadText(response);
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {};
  }

  try {
    return normalizeErrorPayload(JSON.parse(trimmedText) as unknown);
  } catch {
    return {
      message: trimmedText,
      details: trimmedText,
    };
  }
}

function normalizeErrorPayload(value: unknown): ParsedErrorPayload {
  if (!isRecord(value)) {
    return {
      message: nonEmptyString(value),
      details: value,
    };
  }

  const nestedError = value.error;
  const nestedErrorRecord = isRecord(nestedError) ? nestedError : undefined;

  return {
    message:
      nonEmptyString(value.message) ??
      nonEmptyString(value.detail) ??
      nonEmptyString(nestedError) ??
      nonEmptyString(nestedErrorRecord?.message) ??
      nonEmptyString(nestedErrorRecord?.detail),
    code: nonEmptyString(value.code) ?? nonEmptyString(nestedErrorRecord?.code),
    details: value,
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await safeReadText(response);
  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new Error("Response body is empty");
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    throw new Error("Response body is not valid JSON");
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}
