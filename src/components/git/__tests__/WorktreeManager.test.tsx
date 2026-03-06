import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@/test/utils";
import { WorktreeManager } from "../WorktreeManager";

const mockGitWorktreeList = vi.fn();
const mockGitWorktreeAdd = vi.fn();
const mockGitWorktreeRemove = vi.fn();
const mockGitWorktreeLock = vi.fn();
const mockGitWorktreeUnlock = vi.fn();
const mockGitWorktreeMove = vi.fn();
const mockGitWorktreeRepair = vi.fn();
const mockGitWorktreePrune = vi.fn();
const mockGitStatus = vi.fn();

vi.mock("@/utils/tauri-api", () => ({
  gitWorktreeList: (...args: unknown[]) => mockGitWorktreeList(...args),
  gitWorktreeAdd: (...args: unknown[]) => mockGitWorktreeAdd(...args),
  gitWorktreeRemove: (...args: unknown[]) => mockGitWorktreeRemove(...args),
  gitWorktreeLock: (...args: unknown[]) => mockGitWorktreeLock(...args),
  gitWorktreeUnlock: (...args: unknown[]) => mockGitWorktreeUnlock(...args),
  gitWorktreeMove: (...args: unknown[]) => mockGitWorktreeMove(...args),
  gitWorktreeRepair: (...args: unknown[]) => mockGitWorktreeRepair(...args),
  gitWorktreePrune: (...args: unknown[]) => mockGitWorktreePrune(...args),
  gitStatus: (...args: unknown[]) => mockGitStatus(...args),
}));

vi.mock("@/components/ui/Icon", () => ({
  Icon: (props: { name: string }) => <span data-icon={props.name} />,
}));

vi.mock("@/components/ui", () => ({
  Button: (props: { children?: any; onClick?: () => void; disabled?: boolean; style?: Record<string, string>; loading?: boolean }) => (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.loading ? "loading" : null}
      {props.children}
    </button>
  ),
  IconButton: (props: { children?: any; onClick?: (event: MouseEvent) => void; disabled?: boolean; tooltip?: string }) => (
    <button disabled={props.disabled} title={props.tooltip} onClick={(event) => props.onClick?.(event)}>
      {props.children}
    </button>
  ),
  Input: (props: { value?: string; onInput?: (event: InputEvent & { currentTarget: HTMLInputElement }) => void; placeholder?: string; autofocus?: boolean }) => (
    <input value={props.value} placeholder={props.placeholder} autofocus={props.autofocus} onInput={(event) => props.onInput?.(event as InputEvent & { currentTarget: HTMLInputElement })} />
  ),
  Badge: (props: { children?: any }) => <span>{props.children}</span>,
  Text: (props: { children?: any }) => <span>{props.children}</span>,
  Modal: (props: { open?: boolean; title?: string; children?: any; footer?: any }) => props.open ? (
    <div data-testid="modal">
      <div>{props.title}</div>
      <div>{props.children}</div>
      <div>{props.footer}</div>
    </div>
  ) : null,
}));

vi.mock("@/design-system/tokens", () => ({
  tokens: {
    colors: {
      surface: { panel: "transparent", canvas: "transparent" },
      text: { primary: "inherit", muted: "inherit" },
      border: { divider: "transparent", default: "transparent" },
      semantic: { primary: "blue", warning: "orange", error: "red", success: "green" },
      icon: { default: "inherit", inactive: "inherit" },
      interactive: { hover: "transparent" },
    },
    spacing: { xs: "2px", sm: "4px", md: "8px", lg: "12px" },
    radius: { md: "8px" },
    typography: { fontFamily: { mono: "monospace" } },
  },
}));

vi.mock("../AddWorktreeDialog", () => ({
  AddWorktreeDialog: () => null,
}));

describe("WorktreeManager", () => {
  beforeEach(() => {
    mockGitWorktreeList.mockResolvedValue([
      {
        path: "/test/repo",
        branch: "main",
        commit: "abcdef123456",
        isMain: true,
        isLocked: false,
        prunable: false,
      },
      {
        path: "/test/stale-worktree",
        branch: "feature/demo",
        commit: "123456abcdef",
        isMain: false,
        isLocked: false,
        prunable: true,
        prunableReason: "gitdir file points to missing worktree",
      },
    ]);
    mockGitStatus.mockResolvedValue({ staged: [], unstaged: [], untracked: [] });
    mockGitWorktreePrune.mockImplementation((_repoPath: string, dryRun: boolean) =>
      Promise.resolve(dryRun ? ["would prune /test/stale-worktree"] : ["Removing /test/stale-worktree"])
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("runs a dry-run preview instead of pruning immediately", async () => {
    const { container } = render(() => <WorktreeManager repoPath="/test/repo" />);

    await waitFor(() => mockGitWorktreeList.mock.calls.length > 0);
    expect(mockGitWorktreeList).toHaveBeenCalledWith("/test/repo");

    const pruneButton = container.querySelector('button[title="Prune Stale Worktrees"]') as HTMLButtonElement;
    expect(pruneButton).toBeTruthy();

    pruneButton.click();
    await waitFor(() => mockGitWorktreePrune.mock.calls.length > 0);
    expect(mockGitWorktreePrune).toHaveBeenCalledWith("/test/repo", true);

    expect(mockGitWorktreePrune).toHaveBeenCalledTimes(1);
    expect(mockGitWorktreeList).toHaveBeenCalledTimes(1);
  });
});
