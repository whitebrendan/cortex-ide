import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bulkAction,
  deleteSession,
  exportSessions,
  fetchAdminSessions,
  fetchSessionDetails,
  fetchSessionStats,
} from "@/api/admin";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const sampleSession = {
  id: "session-1",
  userId: "user-1",
  userEmail: "user@example.com",
  title: "Test session",
  status: "active",
  messageCount: 12,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
  lastActivityAt: "2025-01-02T00:00:00.000Z",
  model: "claude-sonnet",
  totalTokens: 1234,
  isShared: true,
  shareToken: "share-token",
} as const;

describe("src/api/admin", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", originalFetch);
  });

  it("sanitizes filters and parses the admin sessions response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        sessions: [sampleSession],
        total: 1,
        page: 2,
        pageSize: 100,
        totalPages: 1,
      }),
    );

    const result = await fetchAdminSessions({
      search: "  cortex  ",
      dateRange: "all",
      status: "all",
      page: 2,
      pageSize: 250,
      sortBy: "updatedAt",
      sortOrder: "asc",
    });

    expect(result.sessions).toEqual([sampleSession]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/v1/admin/sessions?search=cortex&page=2&pageSize=100&sortBy=updatedAt&sortOrder=asc",
    );
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
  });

  it("rejects invalid filters before sending a request", async () => {
    await expect(
      fetchAdminSessions({
        search: "",
        dateRange: "all",
        status: "all",
        page: 0,
        pageSize: 20,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "filters.page must be a positive integer",
        code: "INVALID_INPUT",
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deduplicates bulk action session ids before posting", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: 2, failed: 0 }));

    const result = await bulkAction([" session-1 ", "session-2", "session-1", "   "], "archive");

    expect(result).toEqual({ success: 2, failed: 0 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      sessionIds: ["session-1", "session-2"],
      action: "archive",
    });
  });

  it("encodes session ids for destructive routes", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteSession("session/one?draft=true");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/sessions/session%2Fone%3Fdraft%3Dtrue");
    expect(init.method).toBe("DELETE");
  });

  it("maps authorization errors for statistics requests", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "forbidden" }, { status: 403 }));

    await expect(fetchSessionStats()).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Not authorized to view admin statistics",
        status: 403,
      }),
    );
  });

  it("returns blobs for session exports", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("id,title\nsession-1,Test session", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );

    const blob = await exportSessions(["session-1"]);

    expect(await blob.text()).toBe("id,title\nsession-1,Test session");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ sessionIds: ["session-1"] });
  });

  it("rejects malformed session detail payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...sampleSession,
        messages: "not-an-array",
      }),
    );

    await expect(fetchSessionDetails("session-1")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Received an invalid session details response",
        code: "INVALID_RESPONSE",
      }),
    );
  });
});
