import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { Show, type JSX } from "solid-js";
import { CortexGitWorktreeDialog } from "../CortexGitWorktreeDialog";

const mockGitWorktreeList = vi.fn();
const mockGitWorktreeRemove = vi.fn();
const mockGitWorktreePrune = vi.fn();
const mockGitStatus = vi.fn();

vi.mock("@/utils/tauri-api", () => ({
  gitWorktreeList: (...args: unknown[]) => mockGitWorktreeList(...args),
  gitWorktreeRemove: (...args: unknown[]) => mockGitWorktreeRemove(...args),
  gitWorktreePrune: (...args: unknown[]) => mockGitWorktreePrune(...args),
  gitStatus: (...args: unknown[]) => mockGitStatus(...args),
}));

vi.mock("@/components/cortex/primitives/CortexModal", () => ({
  CortexModal: (props: {
    open: boolean;
    title?: string;
    children?: JSX.Element;
    footer?: JSX.Element;
    onClose?: () => void;
  }) => (
    <Show when={props.open}>
      <div data-testid={`modal-${props.title ?? "untitled"}`}>
        <div>{props.title}</div>
        {props.children}
        {props.footer}
        <button onClick={props.onClose}>Close Modal</button>
      </div>
    </Show>
  ),
}));

vi.mock("@/components/cortex/primitives/CortexButton", () => ({
  CortexButton: (props: {
    children?: JSX.Element;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    title?: string;
  }) => (
    <button onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.loading ? "loading" : props.children}
    </button>
  ),
}));

vi.mock("@/components/cortex/primitives/CortexIcon", () => ({
  CortexIcon: (props: { name: string }) => <span data-testid={`icon-${props.name}`} />,
}));

vi.mock("@/components/ui/DestructiveActionDialog", () => ({
  DestructiveActionDialog: (props: {
    open: boolean;
    title: string;
    message: JSX.Element | string;
    detail?: JSX.Element | string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => (
    <Show when={props.open}>
      <div data-testid="remove-worktree-dialog">
        <div>{props.title}</div>
        <div>{props.message}</div>
        <div>{props.detail}</div>
        <button onClick={props.onCancel}>Cancel Remove</button>
        <button onClick={props.onConfirm}>{props.confirmLabel}</button>
      </div>
    </Show>
  ),
}));

describe("CortexGitWorktreeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGitWorktreeList.mockResolvedValue([
      {
        path: "/test/repo",
        branch: "main",
        commit: "abc123",
        isMain: true,
        isLocked: false,
        prunable: false,
      },
      {
        path: "/test/repo-feature",
        branch: "feature/guardrail",
        commit: "def456",
        isMain: false,
        isLocked: false,
        prunable: true,
      },
    ]);
    mockGitStatus.mockImplementation((path: string) => Promise.resolve(
      path === "/test/repo-feature"
        ? { staged: [], unstaged: [{ path: "src/file.ts" }], untracked: [] }
        : { staged: [], unstaged: [], untracked: [] }
    ));
    mockGitWorktreeRemove.mockResolvedValue(undefined);
    mockGitWorktreePrune.mockImplementation((_repoPath: string, dryRun: boolean) => Promise.resolve(
      dryRun ? ["would prune /test/repo-stale"] : ["Removing /test/repo-stale"]
    ));
  });

  afterEach(() => {
    cleanup();
  });

  it("loads mounted worktrees and keeps removal cancel-safe until confirmed", async () => {
    const { findByText, getByText } = render(() => (
      <CortexGitWorktreeDialog open={true} repoPath="/test/repo" onClose={vi.fn()} />
    ));

    expect(await findByText("feature/guardrail")).toBeTruthy();

    await fireEvent.click(getByText("Remove"));
    expect(await findByText("Remove Worktree?")).toBeTruthy();
    expect(mockGitWorktreeRemove).not.toHaveBeenCalled();

    await fireEvent.click(getByText(/Cancel/));
    expect(mockGitWorktreeRemove).not.toHaveBeenCalled();
  });

  it("does not offer primary-worktree removal when the repo path itself is listed", async () => {
    mockGitWorktreeList.mockResolvedValueOnce([
      {
        path: "/test/repo",
        branch: "main",
        commit: "abc123",
        isMain: false,
        isLocked: false,
        prunable: false,
      },
    ]);
    mockGitStatus.mockResolvedValueOnce({ staged: [], unstaged: [], untracked: [] });

    const { findByText, queryByText } = render(() => (
      <CortexGitWorktreeDialog open={true} repoPath="/test/repo" onClose={vi.fn()} />
    ));

    expect(await findByText("main")).toBeTruthy();
    expect(queryByText("Remove")).toBeNull();
  });

  it("forces a dirty worktree removal only after explicit confirmation", async () => {
    const onRefresh = vi.fn();
    const { findByText, getByText } = render(() => (
      <CortexGitWorktreeDialog open={true} repoPath="/test/repo" onClose={vi.fn()} onRefresh={onRefresh} />
    ));

    expect(await findByText("feature/guardrail")).toBeTruthy();

    await fireEvent.click(getByText("Remove"));
    await findByText("Remove Worktree?");
    await fireEvent.click(await findByText("Force Remove"));

    await vi.waitFor(() => {
      expect(mockGitWorktreeRemove).toHaveBeenCalledWith("/test/repo", "/test/repo-feature", true);
    });
    await vi.waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("previews stale worktree pruning before executing it", async () => {
    const { findByText, getByText } = render(() => (
      <CortexGitWorktreeDialog open={true} repoPath="/test/repo" onClose={vi.fn()} />
    ));

    expect(await findByText("feature/guardrail")).toBeTruthy();

    await fireEvent.click(getByText("Prune Stale Worktrees"));

    await vi.waitFor(() => {
      expect(mockGitWorktreePrune).toHaveBeenCalledWith("/test/repo", true);
    });
    expect(mockGitWorktreePrune).not.toHaveBeenCalledWith("/test/repo", false);

    await fireEvent.click(await findByText("Prune 1 Stale Worktree"));

    await vi.waitFor(() => {
      expect(mockGitWorktreePrune).toHaveBeenCalledWith("/test/repo", false);
    });
  });
});
