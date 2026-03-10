import { onMount } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import {
  ActivityIndicator,
  ActivityProgressBar,
} from "../ActivityIndicator";
import {
  ActivityIndicatorProvider,
  useActivityIndicator,
} from "@/context/ActivityIndicatorContext";

vi.mock("@/components/ui/Icon", () => ({
  Icon: (props: { name: string }) => <span data-testid={`icon-${props.name}`} />,
}));

vi.mock("@/components/ui", () => ({
  LoadingSpinner: () => <span data-testid="loading-spinner" />,
  ProgressBar: (props: { mode: string; value: number; visible?: boolean }) => (
    <div
      data-testid="activity-progress-bar"
      data-mode={props.mode}
      data-value={String(props.value)}
      data-visible={String(props.visible ?? true)}
    />
  ),
}));

vi.mock("@/hooks/useTauriListen", () => ({
  useTauriListen: vi.fn(),
}));

interface ActivityHarnessProps {
  includeHistory?: boolean;
  includeProgressBar?: boolean;
}

function ActivityHarness(props: ActivityHarnessProps) {
  const activity = useActivityIndicator();

  onMount(() => {
    const activeTaskId = activity.createTask({
      title: "Compiling project",
      message: "Running build pipeline",
      source: "build",
      progress: 42,
      cancellable: true,
    });

    activity.updateTask(activeTaskId, {
      message: "Running build pipeline",
      progress: 42,
    });

    if (props.includeHistory) {
      const historyTaskId = activity.createTask({
        title: "Index workspace",
        source: "lsp",
        cancellable: false,
      });
      activity.completeTask(historyTaskId);
    }
  });

  return (
    <>
      <button type="button">Outside focus target</button>
      <ActivityIndicator />
      {props.includeProgressBar ? <ActivityProgressBar /> : null}
    </>
  );
}

const renderActivityIndicator = (props: ActivityHarnessProps = {}) =>
  render(() => (
    <ActivityIndicatorProvider>
      <ActivityHarness {...props} />
    </ActivityIndicatorProvider>
  ));

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ActivityIndicator", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens a popup with task progress semantics and task actions", async () => {
    renderActivityIndicator({ includeHistory: true });
    await nextFrame();

    const trigger = screen.getByRole("button", { name: /Compiling project/ });
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: /Activity tasks and history/ })).toBeTruthy();

    const taskProgress = screen.getByRole("progressbar", {
      name: /Compiling project progress/,
    });
    expect(taskProgress.getAttribute("aria-valuenow")).toBe("42");
    expect(taskProgress.getAttribute("aria-valuetext")).toBe("42%");

    expect(
      screen.getByRole("button", { name: /Cancel Compiling project/ })
    ).toBeTruthy();
  });

  it("supports keyboard tab navigation and closes on Escape", async () => {
    renderActivityIndicator({ includeHistory: true });
    await nextFrame();

    const trigger = screen.getByRole("button", { name: /Compiling project/ });
    fireEvent.click(trigger);

    const activeTab = screen.getByRole("tab", { name: /Active/ });
    activeTab.focus();
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });

    const historyTab = screen.getByRole("tab", { name: /History/ });
    expect(historyTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Index workspace")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await nextFrame();

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("adds accessible semantics to the standalone progress bar", async () => {
    renderActivityIndicator({ includeProgressBar: true });
    await nextFrame();

    const progressBar = screen.getByRole("progressbar", {
      name: /Activity progress/,
    });
    expect(progressBar.getAttribute("aria-valuenow")).toBe("42");
    expect(progressBar.getAttribute("aria-valuetext")).toBe("42%");

    const visualProgress = screen.getByTestId("activity-progress-bar");
    expect(visualProgress.getAttribute("data-mode")).toBe("discrete");
    expect(visualProgress.getAttribute("data-value")).toBe("42");
  });
});
