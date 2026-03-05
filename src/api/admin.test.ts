import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_API_REQUEST_TIMEOUT_MS,
  AdminApiError,
  bulkAction,
  deleteSession,
  exportSessions,
  fetchAdminSessions,
  fetchSessionDetails,
  fetchSessionStats,
} from "@/api/admin";
import type { SessionFilters } from "@/types/admin";

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createValidSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "session-1",
    userId: "user-1",
    userEmail: "user@example.com",
    title: "Session title",
    status: "active",
    messageCount: 3,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:10:00.000Z",
    lastActivityAt: "2024-01-01T00:10:00.000Z",
    model: "gpt-4o",
    totalTokens: 420,
    isShared: false,
    ...overrides,
  };
}

describe("admin API", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it("fetchAdminSessions returns validated payload and passes timeout signal", async () => {
    const filters: SessionFilters = {
      search: "abc",
      dateRange: "week",
      status: "active",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      page: 2,
      pageSize: 25,
      sortBy: "updatedAt",
      sortOrder: "asc",
    };

    fetchSpy.mockResolvedValue(
      createJsonResponse({
        sessions: [createValidSession()],
        total: 1,
        page: 2,
        pageSize: 25,
        totalPages: 1,
      })
    );

    const result = await fetchAdminSessions(filters);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("session-1");
    expect(result.total).toBe(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/sessions?");
    expect(url).toContain("search=abc");
    expect(url).toContain("dateRange=week");
    expect(url).toContain("status=active");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=25");
    expect(url).toContain("sortBy=updatedAt");
    expect(url).toContain("sortOrder=asc");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fetchSessionStats throws INVALID_RESPONSE on malformed schema", async () => {
    fetchSpy.mockResolvedValue(
      createJsonResponse({
        totalSessions: 5,
      })
    );

    await expect(fetchSessionStats()).rejects.toMatchObject({
      name: "AdminApiError",
      code: "INVALID_RESPONSE",
      operation: "fetchSessionStats",
    });
  });

  it("deleteSession maps HTTP status to deterministic AdminApiError", async () => {
    fetchSpy.mockResolvedValue(
      createJsonResponse(
        {
          message: "Session missing",
        },
        404
      )
    );

    await expect(deleteSession("missing-session")).rejects.toMatchObject({
      name: "AdminApiError",
      code: "NOT_FOUND",
      status: 404,
      message: "Session missing",
      operation: "deleteSession",
    });
  });

  it("bulkAction maps network failures to NETWORK_ERROR", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(bulkAction(["session-1"], "archive")).rejects.toMatchObject({
      name: "AdminApiError",
      code: "NETWORK_ERROR",
      operation: "bulkAction",
    });
  });

  it("maps request timeout aborts to TIMEOUT errors", async () => {
    vi.useFakeTimers();

    fetchSpy.mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    const pending = fetchSessionDetails("slow-session");
    const assertion = expect(pending).rejects.toMatchObject({
      name: "AdminApiError",
      code: "TIMEOUT",
      operation: "fetchSessionDetails",
    });

    await vi.advanceTimersByTimeAsync(ADMIN_API_REQUEST_TIMEOUT_MS + 1);

    await assertion;
  });

  it("fetchSessionDetails enforces messages array schema", async () => {
    fetchSpy.mockResolvedValue(
      createJsonResponse({
        ...createValidSession(),
        messages: "not-an-array",
      })
    );

    await expect(fetchSessionDetails("session-1")).rejects.toMatchObject({
      name: "AdminApiError",
      code: "INVALID_RESPONSE",
      operation: "fetchSessionDetails",
    });
  });

  it("exportSessions returns blob on success", async () => {
    fetchSpy.mockResolvedValue(
      new Response("id,title\nsession-1,Session title", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      })
    );

    const blob = await exportSessions(["session-1"]);

    expect(blob).toBeInstanceOf(Blob);
    await expect(blob.text()).resolves.toContain("session-1");
  });

  it("exposes typed AdminApiError class for callers", async () => {
    fetchSpy.mockResolvedValue(createJsonResponse({ error: "forbidden" }, 403));

    try {
      await fetchSessionStats();
      throw new Error("Expected fetchSessionStats to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AdminApiError);
      expect((error as AdminApiError).code).toBe("FORBIDDEN");
    }
  });
});
