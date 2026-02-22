import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initGlobalErrorHandler } from "../error-handler";

describe("initGlobalErrorHandler", () => {
  let notify: ReturnType<typeof vi.fn>;
  let appendLine: ReturnType<typeof vi.fn>;
  let cleanup: () => void;

  beforeEach(() => {
    notify = vi.fn();
    appendLine = vi.fn();
    cleanup = initGlobalErrorHandler({ notify, appendLine });
  });

  afterEach(() => {
    cleanup();
  });

  it("should register error and unhandledrejection listeners", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const c = initGlobalErrorHandler({ notify, appendLine });
    expect(addSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
    c();
    addSpy.mockRestore();
  });

  it("should handle uncaught errors via ErrorEvent", () => {
    const event = new ErrorEvent("error", {
      message: "Test uncaught error",
      filename: "test.ts",
      lineno: 42,
      colno: 10,
      error: new Error("Test uncaught error"),
    });
    window.dispatchEvent(event);

    expect(appendLine).toHaveBeenCalledWith(
      "Errors",
      expect.stringContaining("Uncaught Error: Test uncaught error"),
      { severity: "error" }
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Uncaught Error",
        message: "Test uncaught error",
      })
    );
  });

  it("should handle unhandled promise rejections with Error", () => {
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason: new Error("Promise failed"),
    });
    window.dispatchEvent(event);

    expect(appendLine).toHaveBeenCalledWith(
      "Errors",
      expect.stringContaining("Unhandled Rejection: Promise failed"),
      { severity: "error" }
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Unhandled Rejection",
        message: "Promise failed",
      })
    );
  });

  it("should handle unhandled promise rejections with string reason", () => {
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason: "string rejection reason",
    });
    window.dispatchEvent(event);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "string rejection reason",
      })
    );
  });

  it("should deduplicate rapid identical errors", () => {
    const event1 = new ErrorEvent("error", {
      message: "Duplicate error",
      error: new Error("Duplicate error"),
    });
    const event2 = new ErrorEvent("error", {
      message: "Duplicate error",
      error: new Error("Duplicate error"),
    });

    window.dispatchEvent(event1);
    window.dispatchEvent(event2);

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("should allow same error after dedup window passes", () => {
    vi.useFakeTimers();

    const event = new ErrorEvent("error", {
      message: "Timed error",
      error: new Error("Timed error"),
    });

    window.dispatchEvent(event);
    expect(notify).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4000);

    window.dispatchEvent(event);
    expect(notify).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("should remove listeners on cleanup", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    cleanup();
    expect(removeSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("should handle ErrorEvent without filename gracefully", () => {
    const event = new ErrorEvent("error", {
      message: "No source error",
    });
    window.dispatchEvent(event);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "window",
      })
    );
  });

  it("should handle rejection with non-Error non-string reason", () => {
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason: { code: 42 },
    });
    window.dispatchEvent(event);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Unhandled promise rejection",
      })
    );
  });
});
