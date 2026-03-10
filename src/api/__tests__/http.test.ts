import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, requestBlob, requestJson, requestVoid } from "@/api/http";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createAbortAwarePendingResponse(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal as AbortSignal | undefined;
    signal?.addEventListener(
      "abort",
      () => {
        queueMicrotask(() => reject(new Error("aborted")));
      },
      { once: true },
    );
  });
}

describe("api/http", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", originalFetch);
  });

  it("parses JSON responses and applies same-origin credentials", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: 1 }));

    const result = await requestJson("/api/test", {
      errorMessage: "Failed to fetch test data",
      parseResponse: (value) => ({ value: (value as { value: number }).value }),
    });

    expect(result).toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/test");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
  });

  it("maps HTTP failures to ApiError instances with status details", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { message: "backend says forbidden", code: "FORBIDDEN" } },
        { status: 403 },
      ),
    );

    await expect(
      requestJson("/api/test", {
        errorMessage: "Failed to fetch test data",
        statusMessages: { 403: "Custom forbidden message" },
        parseResponse: (value) => value as { ok: true },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Custom forbidden message",
        status: 403,
        code: "FORBIDDEN",
      }),
    );
  });

  it("wraps invalid JSON responses as invalid response errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not valid json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      requestJson("/api/test", {
        errorMessage: "Failed to fetch test data",
        validationErrorMessage: "Received an invalid test response",
        parseResponse: (value) => value as { ok: true },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Received an invalid test response",
        code: "INVALID_RESPONSE",
      }),
    );
  });

  it("times out stalled requests", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) =>
      createAbortAwarePendingResponse(init),
    );

    const promise = requestVoid("/api/test", {
      errorMessage: "Failed to submit test request",
      timeoutMs: 1_000,
    });
    const assertion = expect(promise).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Failed to submit test request (request timed out)",
        code: "TIMEOUT",
      }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("returns blobs for binary/text downloads", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("col1,col2\nvalue1,value2", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );

    const blob = await requestBlob("/api/export", {
      errorMessage: "Failed to export data",
      accept: "text/csv",
    });

    expect(await blob.text()).toBe("col1,col2\nvalue1,value2");
  });

  it("maps caller-provided abort signals to ApiError cancellation failures", async () => {
    fetchMock.mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) =>
      createAbortAwarePendingResponse(init),
    );

    const controller = new AbortController();
    const promise = requestVoid("/api/test", {
      errorMessage: "Failed to submit test request",
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Failed to submit test request (request was cancelled)",
        code: "ABORTED",
      }),
    );

    controller.abort();

    await assertion;
  });

  it("preserves ApiError instances thrown from response validators", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: 1 }));

    await expect(
      requestJson("/api/test", {
        errorMessage: "Failed to fetch test data",
        parseResponse: () => {
          throw new ApiError("Validator rejected the payload", {
            code: "INVALID_PAYLOAD",
          });
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Validator rejected the payload",
        code: "INVALID_PAYLOAD",
      }),
    );
  });
});
