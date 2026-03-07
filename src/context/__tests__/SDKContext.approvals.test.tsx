import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SDKProvider, useSDK } from "../SDKContext";

const sdkHarness = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  eventHandler: null as null | ((payload: Record<string, unknown>) => void),
  sdk: null as ReturnType<typeof useSDK> | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: sdkHarness.invokeMock,
}));

vi.mock("../../hooks/useTauriListen", () => ({
  useTauriListen: (_event: string, handler: (payload: Record<string, unknown>) => void) => {
    sdkHarness.eventHandler = handler;
    return Promise.resolve(() => {});
  },
}));

vi.mock("@/utils/logger", () => ({
  cortexLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../utils/workspace", () => ({
  getProjectPath: () => ".",
}));

vi.mock("@/utils/windowStorage", () => ({
  getWindowLabel: () => "main",
}));

vi.mock("@/utils/notifications", () => ({
  showWarningNotification: vi.fn(),
}));

function SDKConsumer() {
  const sdk = useSDK();
  sdkHarness.sdk = sdk;

  return (
    <>
      <div data-testid="current-approval">{sdk.state.pendingApproval?.callId ?? "none"}</div>
      <div data-testid="approval-queue-size">{sdk.state.pendingApprovalQueue.length}</div>
    </>
  );
}

function emitCortexEvent(payload: Record<string, unknown>) {
  if (!sdkHarness.eventHandler) {
    throw new Error("SDK event handler was not registered");
  }
  sdkHarness.eventHandler(payload);
}

describe("SDKProvider approval queueing", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sdkHarness.invokeMock.mockReset();
    sdkHarness.eventHandler = null;
    sdkHarness.sdk = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("queues later approval requests and advances them in order after each decision", async () => {
    sdkHarness.invokeMock.mockResolvedValue(undefined);

    render(() => (
      <SDKProvider>
        <SDKConsumer />
      </SDKProvider>
    ));

    emitCortexEvent({ type: "joined_session", session_id: "session-1" });
    emitCortexEvent({
      type: "approval_request",
      call_id: "call-1",
      command: ["git", "push"],
      cwd: "/workspace/project",
    });
    emitCortexEvent({
      type: "approval_request",
      call_id: "call-2",
      command: ["rm", "-rf", "tmp"],
      cwd: "/workspace/project",
    });

    await waitFor(() => {
      expect(screen.getByTestId("current-approval").textContent).toBe("call-1");
      expect(screen.getByTestId("approval-queue-size").textContent).toBe("1");
    });

    await sdkHarness.sdk!.approve("call-1", false);

    await waitFor(() => {
      expect(screen.getByTestId("current-approval").textContent).toBe("call-2");
      expect(screen.getByTestId("approval-queue-size").textContent).toBe("0");
    });

    await sdkHarness.sdk!.approve("call-2", true);

    await waitFor(() => {
      expect(screen.getByTestId("current-approval").textContent).toBe("none");
      expect(screen.getByTestId("approval-queue-size").textContent).toBe("0");
    });

    expect(sdkHarness.invokeMock).toHaveBeenNthCalledWith(1, "cortex_approve_exec", {
      sessionId: "session-1",
      callId: "call-1",
      approved: false,
    });
    expect(sdkHarness.invokeMock).toHaveBeenNthCalledWith(2, "cortex_approve_exec", {
      sessionId: "session-1",
      callId: "call-2",
      approved: true,
    });
  });
});
