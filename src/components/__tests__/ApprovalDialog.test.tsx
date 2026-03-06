import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createStore } from "solid-js/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModalActiveProvider } from "@/context/ModalActiveContext";
import { useKeyboard } from "@/hooks/useKeyboard";
import { ApprovalDialog } from "../ApprovalDialog";

interface MockApprovalRequest {
  callId: string;
  command: string[];
  cwd: string;
}

const sdkHarness = vi.hoisted(() => ({
  approveMock: vi.fn<(callId: string, approved: boolean) => Promise<void>>(),
  state: null as unknown as { pendingApproval: MockApprovalRequest | null },
  setState: null as unknown as (path: "pendingApproval", value: MockApprovalRequest | null) => void,
}));

vi.mock("@/context/SDKContext", () => ({
  useSDK: () => ({
    state: sdkHarness.state,
    approve: sdkHarness.approveMock,
  }),
}));

function ShortcutProbe(props: { onCommandPalette: () => void }) {
  useKeyboard({ onCommandPalette: props.onCommandPalette });
  return null;
}

function ApprovalHarness(props: { surface: "welcome" | "session"; onCommandPalette: () => void }) {
  return (
    <ModalActiveProvider>
      <ShortcutProbe onCommandPalette={props.onCommandPalette} />
      <button data-testid={`${props.surface}-invoker`}>Open from {props.surface}</button>
      <ApprovalDialog />
    </ModalActiveProvider>
  );
}

function createApprovalRequest(callId = "call-1"): MockApprovalRequest {
  return {
    callId,
    command: ["npm", "run", "dangerous-task"],
    cwd: "/workspace/project",
  };
}

async function openApprovalFrom(surface: "welcome" | "session") {
  const invoker = screen.getByTestId(`${surface}-invoker`);
  invoker.focus();
  expect(document.activeElement).toBe(invoker);

  sdkHarness.setState("pendingApproval", createApprovalRequest());

  await waitFor(() => {
    expect(screen.getByTestId("approval-dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Approve" }));
  });

  return {
    invoker,
    approveButton: screen.getByRole("button", { name: "Approve" }),
    denyButton: screen.getByRole("button", { name: "Deny" }),
    closeButton: screen.getByRole("button", { name: "Close" }),
    overlay: screen.getByTestId("approval-dialog-overlay"),
  };
}

describe("ApprovalDialog", () => {
  beforeEach(() => {
    cleanup();
    sdkHarness.approveMock.mockReset();

    const [state, setState] = createStore<{ pendingApproval: MockApprovalRequest | null }>({
      pendingApproval: null,
    });

    sdkHarness.state = state;
    sdkHarness.setState = setState as typeof sdkHarness.setState;
    sdkHarness.approveMock.mockImplementation(async () => {
      sdkHarness.setState("pendingApproval", null);
    });
  });

  afterEach(() => {
    cleanup();
    sdkHarness.approveMock.mockReset();
  });

  it.each(["welcome", "session"] as const)(
    "blocks background shortcuts and keeps focus inside the mounted overlay on %s",
    async (surface) => {
      const onCommandPalette = vi.fn();
      render(() => <ApprovalHarness surface={surface} onCommandPalette={onCommandPalette} />);

      const { invoker, approveButton, overlay } = await openApprovalFrom(surface);

      await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(onCommandPalette).not.toHaveBeenCalled();

      invoker.focus();
      await waitFor(() => expect(document.activeElement).toBe(approveButton));

      await fireEvent.mouseDown(overlay);
      await fireEvent.click(overlay);

      expect(sdkHarness.approveMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("approval-dialog")).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(approveButton));
    },
  );

  it.each([
    ["welcome", "approve"],
    ["welcome", "deny"],
    ["welcome", "close"],
    ["welcome", "escape"],
    ["session", "approve"],
    ["session", "deny"],
    ["session", "close"],
    ["session", "escape"],
  ] as const)(
    "returns focus to the %s invoker after the %s exit path",
    async (surface, exitPath) => {
      render(() => <ApprovalHarness surface={surface} onCommandPalette={vi.fn()} />);

      const { invoker, approveButton, denyButton, closeButton } = await openApprovalFrom(surface);

      if (exitPath === "approve") {
        await fireEvent.click(approveButton);
        await waitFor(() => {
          expect(sdkHarness.approveMock).toHaveBeenCalledWith("call-1", true);
        });
      } else if (exitPath === "deny") {
        await fireEvent.click(denyButton);
        await waitFor(() => {
          expect(sdkHarness.approveMock).toHaveBeenCalledWith("call-1", false);
        });
      } else if (exitPath === "close") {
        await fireEvent.click(closeButton);
        await waitFor(() => {
          expect(sdkHarness.approveMock).toHaveBeenCalledWith("call-1", false);
        });
      } else {
        await fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => {
          expect(sdkHarness.approveMock).toHaveBeenCalledWith("call-1", false);
        });
      }

      expect(sdkHarness.approveMock).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByTestId("approval-dialog")).toBeNull();
        expect(document.activeElement).toBe(invoker);
      });
    },
  );
});
