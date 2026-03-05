import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createShare,
  fetchProtectedSession,
  fetchSharedSession,
  reportShare,
  revokeShare,
} from "@/api/share";

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("share API", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes wrapped shared-session payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        data: {
          session: {
            id: "sess-1",
            title: "Session Title",
            created_at: "2025-01-01T00:00:00.000Z",
            expires_at: "2025-01-02T00:00:00.000Z",
            view_count: "12",
            share_token: "tok-abc",
            is_protected: true,
            messages: [
              {
                id: "m-1",
                role: "assistant",
                content: "Hello",
                created_at: "2025-01-01T00:00:01.000Z",
                tool_calls: [
                  {
                    id: "tool-1",
                    name: "read_file",
                    arguments: { file: "README.md" },
                    result: { ok: true },
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    const result = await fetchSharedSession("tok-abc");

    expect(result.id).toBe("sess-1");
    expect(result.title).toBe("Session Title");
    expect(result.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(result.expiresAt).toBe("2025-01-02T00:00:00.000Z");
    expect(result.viewCount).toBe(12);
    expect(result.shareToken).toBe("tok-abc");
    expect(result.isProtected).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].timestamp).toBe("2025-01-01T00:00:01.000Z");
    expect(result.messages[0].toolCalls?.[0].input).toEqual({ file: "README.md" });
    expect(result.messages[0].toolCalls?.[0].output).toBe('{"ok":true}');
  });

  it("maps 401/403 shared-session responses to password required", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({ message: "Password required" }, { status: 401 }));

    await expect(fetchSharedSession("protected-token")).rejects.toThrow("Password required");
  });

  it("propagates invalid password message from protected-session response", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ error: { message: "Password is incorrect" } }, { status: 403 }),
    );

    await expect(fetchProtectedSession("protected-token", "bad-pass")).rejects.toThrow("Password is incorrect");
  });

  it("normalizes createShare response and sends compatibility payload aliases", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        data: {
          share: {
            share_url: "https://cortex.dev/share/abc123",
            expires_at: "2025-01-05T00:00:00.000Z",
          },
        },
      }),
    );

    const response = await createShare("session-1", {
      includeToolOutputs: true,
      maxMessages: 20,
      expiresInHours: 48,
      title: "Public session",
      password: "secret",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(requestUrl).toBe("/api/v1/sessions/session-1/share");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      title: "Public session",
      password: "secret",
      includeToolOutputs: true,
      include_tool_outputs: true,
      maxMessages: 20,
      max_messages: 20,
      expiresInHours: 48,
      expires_in_hours: 48,
    });

    expect(response).toEqual({
      shareToken: "abc123",
      shareUrl: "https://cortex.dev/share/abc123",
      expiresAt: "2025-01-05T00:00:00.000Z",
    });
  });

  it("accepts revokeShare 204 responses and throws backend error text on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(revokeShare("token-ok")).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(
      new Response("Share already revoked", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(revokeShare("token-fail")).rejects.toThrow("Share already revoked");
  });

  it("reports share successfully on 2xx and propagates explicit 429 errors", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({ ok: true }, { status: 201 }));
    await expect(reportShare("report-token", "  suspicious content  ")).resolves.toBeUndefined();

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({ reason: "suspicious content" });

    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ message: "Too many reports from this IP" }, { status: 429 }),
    );

    await expect(reportShare("report-token", "spam")).rejects.toThrow("Too many reports from this IP");
  });
});
