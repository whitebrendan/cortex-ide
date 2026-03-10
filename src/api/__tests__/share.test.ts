import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShare,
  fetchProtectedSession,
  fetchSharedSession,
  reportShare,
  revokeShare,
} from "@/api/share";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const sharedSession = {
  id: "session-1",
  title: "Shared session",
  createdAt: "2025-01-01T00:00:00.000Z",
  expiresAt: "2025-01-10T00:00:00.000Z",
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "Hello",
      timestamp: "2025-01-01T00:00:00.000Z",
      toolCalls: [
        {
          id: "tool-1",
          name: "Read",
          input: { path: "README.md" },
          output: "done",
        },
      ],
    },
  ],
  viewCount: 5,
  shareToken: "share-token",
  isProtected: true,
} as const;

describe("src/api/share", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", originalFetch);
  });

  it("parses shared session payloads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(sharedSession));

    const result = await fetchSharedSession("share-token");

    expect(result).toEqual(sharedSession);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/share/share-token",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("maps password-protected and not-found share errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "need password" }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ message: "gone" }, { status: 404 }));

    await expect(fetchSharedSession("share-token")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Password required",
        status: 401,
      }),
    );

    await expect(fetchSharedSession("missing")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Session not found or expired",
        status: 404,
      }),
    );
  });

  it("rejects blank passwords before making protected-session requests", async () => {
    await expect(fetchProtectedSession("share-token", "   ")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "password is required",
        code: "INVALID_INPUT",
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps invalid passwords for protected shares", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "invalid" }, { status: 401 }));

    await expect(fetchProtectedSession("share-token", "secret")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Invalid password",
        status: 401,
      }),
    );
  });

  it("sanitizes create-share payloads and encodes session ids", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        shareToken: "share-token",
        shareUrl: "https://example.com/share/share-token",
        expiresAt: "2025-01-10T00:00:00.000Z",
      }),
    );

    const result = await createShare("session/one?draft=true", {
      title: "  Shared session  ",
      expiresInHours: 24,
      password: "  secret  ",
      includeToolOutputs: true,
      maxMessages: 50,
    });

    expect(result).toEqual({
      shareToken: "share-token",
      shareUrl: "https://example.com/share/share-token",
      expiresAt: "2025-01-10T00:00:00.000Z",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/sessions/session%2Fone%3Fdraft%3Dtrue/share");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Shared session",
      expiresInHours: 24,
      password: "secret",
      includeToolOutputs: true,
      maxMessages: 50,
    });
  });

  it("rejects invalid share settings before making requests", async () => {
    await expect(
      createShare("session-1", {
        includeToolOutputs: true,
        expiresInHours: 0,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "shareSettings.expiresInHours must be a positive integer or null",
        code: "INVALID_INPUT",
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a non-empty report reason and encodes tokens for destructive routes", async () => {
    await expect(reportShare("share token", "   ")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "reason is required",
        code: "INVALID_INPUT",
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await reportShare("share token", "Needs review");
    await revokeShare("share token");

    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "/api/v1/share/share%20token/report",
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "/api/v1/share/share%20token",
    );
  });

  it("rejects malformed shared session payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...sharedSession,
        messages: [{ ...sharedSession.messages[0], role: "guest" }],
      }),
    );

    await expect(fetchSharedSession("share-token")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Received an invalid shared session response",
        code: "INVALID_RESPONSE",
      }),
    );
  });
});
