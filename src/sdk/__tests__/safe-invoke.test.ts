import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { safeInvoke, InvokeTimeoutError, DEFAULT_TIMEOUT_MS } from "../safe-invoke";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("safeInvoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call invoke with correct command and args", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("result");

    const promise = safeInvoke("test_cmd", { key: "value" });
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(invoke).toHaveBeenCalledWith("test_cmd", { key: "value" });
    expect(result).toBe("result");
  });

  it("should pass undefined args when not provided", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("ok");

    const promise = safeInvoke("test_cmd");
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(invoke).toHaveBeenCalledWith("test_cmd", undefined);
    expect(result).toBe("ok");
  });

  it("should return fallback value on error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("fail"));

    const promise = safeInvoke<string[]>("test_cmd", undefined, { fallback: [] });
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toEqual([]);
  });

  it("should throw when no fallback is provided", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(new Error("fail"));

    const promise = safeInvoke("test_cmd").catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);

    const error = await promise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("fail");
    consoleSpy.mockRestore();
  });

  it("should log errors by default", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(new Error("logged error"));

    const promise = safeInvoke("test_cmd", undefined, { fallback: null });
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(consoleSpy).toHaveBeenCalledWith(
      "[ipc] test_cmd failed:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("should suppress logging when silent is true", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(new Error("silent error"));

    const promise = safeInvoke("test_cmd", undefined, { fallback: null, silent: true });
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should timeout after specified duration", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));

    const promise = safeInvoke("slow_cmd", undefined, { timeout: 5000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5000);

    const error = await promise;
    expect(error).toBeInstanceOf(InvokeTimeoutError);
    expect((error as InvokeTimeoutError).message).toBe('IPC command "slow_cmd" timed out after 5000ms');
    consoleSpy.mockRestore();
  });

  it("should use DEFAULT_TIMEOUT_MS when no timeout specified", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it("should return fallback on timeout when fallback is provided", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));

    const promise = safeInvoke<string[]>("slow_cmd", undefined, {
      timeout: 1000,
      fallback: ["default"],
    });
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual(["default"]);
  });

  it("should resolve before timeout when invoke is fast", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("fast result");

    const promise = safeInvoke("fast_cmd", undefined, { timeout: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBe("fast result");
  });
});

describe("InvokeTimeoutError", () => {
  it("should have correct properties", () => {
    const error = new InvokeTimeoutError("test_cmd", 5000);

    expect(error.name).toBe("InvokeTimeoutError");
    expect(error.command).toBe("test_cmd");
    expect(error.timeoutMs).toBe(5000);
    expect(error.message).toBe('IPC command "test_cmd" timed out after 5000ms');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvokeTimeoutError);
  });
});
