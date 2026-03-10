import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { ScreenReaderAnnouncer } from "../ScreenReaderAnnouncer";

describe("ScreenReaderAnnouncer", () => {
  it("renders separate polite and assertive live regions", () => {
    render(() => <ScreenReaderAnnouncer />);

    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
  });

  it("announces polite messages in the status region", async () => {
    render(() => <ScreenReaderAnnouncer />);

    window.dispatchEvent(
      new CustomEvent("accessibility:announcement", {
        detail: { message: "Build finished successfully" },
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole("status").textContent).toBe("Build finished successfully");
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("announces assertive messages in the alert region", async () => {
    render(() => <ScreenReaderAnnouncer />);

    window.dispatchEvent(
      new CustomEvent("accessibility:announcement", {
        detail: { message: "Task failed", politeness: "assertive" },
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByRole("alert").textContent).toBe("Task failed");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("cancels pending announcement frames on unmount", () => {
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(() => <ScreenReaderAnnouncer />);

    window.dispatchEvent(
      new CustomEvent("accessibility:announcement", {
        detail: { message: "Queued message" },
      })
    );

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
  });
});
