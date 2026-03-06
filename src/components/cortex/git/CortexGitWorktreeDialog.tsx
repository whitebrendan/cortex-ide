import { Component, For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { CortexModal } from "@/components/cortex/primitives/CortexModal";
import { CortexButton } from "@/components/cortex/primitives/CortexButton";
import { CortexIcon } from "@/components/cortex/primitives/CortexIcon";
import { DestructiveActionDialog } from "@/components/ui/DestructiveActionDialog";
import {
  gitStatus,
  gitWorktreeList,
  gitWorktreePrune,
  gitWorktreeRemove,
  type GitWorktree,
} from "@/utils/tauri-api";

export interface CortexGitWorktreeDialogProps {
  open: boolean;
  repoPath?: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}

const getWorktreeName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export const CortexGitWorktreeDialog: Component<CortexGitWorktreeDialogProps> = (props) => {
  const [worktrees, setWorktrees] = createSignal<GitWorktree[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [dirtyByPath, setDirtyByPath] = createSignal<Record<string, boolean>>({});
  const [pendingRemove, setPendingRemove] = createSignal<GitWorktree | null>(null);
  const [removeLoading, setRemoveLoading] = createSignal(false);
  const [showPrunePreview, setShowPrunePreview] = createSignal(false);
  const [prunePreview, setPrunePreview] = createSignal<string[]>([]);
  const [previewLoading, setPreviewLoading] = createSignal(false);
  const [pruneLoading, setPruneLoading] = createSignal(false);

  const isPrimaryWorktree = (worktree: GitWorktree) => Boolean(worktree.isMain || (props.repoPath && worktree.path === props.repoPath));

  const refreshWorktrees = async () => {
    if (!props.repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const listed = await gitWorktreeList(props.repoPath);
      setWorktrees(listed);

      const dirtyEntries = await Promise.all(
        listed.map(async (worktree) => {
          if (isPrimaryWorktree(worktree)) {
            return [worktree.path, false] as const;
          }
          try {
            const status = await gitStatus(worktree.path);
            return [
              worktree.path,
              status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0,
            ] as const;
          } catch {
            return [worktree.path, false] as const;
          }
        })
      );

      setDirtyByPath(Object.fromEntries(dirtyEntries));
    } catch (err) {
      setError(`Failed to load worktrees: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const closePrunePreview = () => {
    if (pruneLoading()) return;
    setShowPrunePreview(false);
    setPrunePreview([]);
  };

  createEffect(() => {
    if (props.open && props.repoPath) {
      void refreshWorktrees();
    }
    if (!props.open) {
      setError(null);
      setPendingRemove(null);
      setShowPrunePreview(false);
      setPrunePreview([]);
    }
  });

  const confirmRemoveLabel = createMemo(() => {
    const pending = pendingRemove();
    return pending && dirtyByPath()[pending.path] ? "Force Remove" : "Remove Worktree";
  });

  const pruneConfirmLabel = createMemo(() =>
    prunePreview().length === 1 ? "Prune 1 Stale Worktree" : `Prune ${prunePreview().length} Stale Worktrees`
  );

  const handleRemoveConfirm = async () => {
    const worktree = pendingRemove();
    if (!props.repoPath || !worktree || removeLoading()) return;
    setRemoveLoading(true);
    setError(null);
    try {
      await gitWorktreeRemove(props.repoPath, worktree.path, dirtyByPath()[worktree.path] ?? false);
      setPendingRemove(null);
      await refreshWorktrees();
      props.onRefresh?.();
    } catch (err) {
      setError(`Failed to remove worktree: ${err}`);
    } finally {
      setRemoveLoading(false);
    }
  };

  const handlePreviewPrune = async () => {
    if (!props.repoPath || previewLoading()) return;
    setPreviewLoading(true);
    setError(null);
    try {
      setPrunePreview(await gitWorktreePrune(props.repoPath, true));
      setShowPrunePreview(true);
    } catch (err) {
      setError(`Failed to preview prune: ${err}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmPrune = async () => {
    if (!props.repoPath || pruneLoading()) return;
    setPruneLoading(true);
    setError(null);
    try {
      await gitWorktreePrune(props.repoPath, false);
      closePrunePreview();
      await refreshWorktrees();
      props.onRefresh?.();
    } catch (err) {
      setError(`Failed to prune worktrees: ${err}`);
    } finally {
      setPruneLoading(false);
    }
  };

  return (
    <>
      <CortexModal open={props.open} onClose={props.onClose} title="Worktrees" size="lg" closeOnOverlay={false} showFooter={false}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "12px", "flex-wrap": "wrap" }}>
            <p style={{ margin: 0, color: "var(--cortex-text-secondary)", "font-size": "13px", "line-height": "1.5" }}>
              Review mounted worktrees before removing them. Dirty worktrees require an explicit force-remove confirmation, and stale prune runs always preview first.
            </p>
            <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
              <CortexButton variant="secondary" size="sm" onClick={() => void refreshWorktrees()} disabled={loading()}>
                Refresh
              </CortexButton>
              <CortexButton variant="danger" size="sm" onClick={() => void handlePreviewPrune()} disabled={!props.repoPath || previewLoading() || pruneLoading()}>
                {previewLoading() ? "Loading…" : "Prune Stale Worktrees"}
              </CortexButton>
            </div>
          </div>

          <Show when={error()}>
            <div style={{ padding: "12px", border: "1px solid rgba(239,68,68,0.25)", "border-radius": "10px", background: "rgba(239,68,68,0.08)", color: "#ef4444", "font-size": "13px" }}>
              {error()}
            </div>
          </Show>

          <Show when={loading()}>
            <div style={{ padding: "12px", color: "var(--cortex-text-secondary)", "font-size": "13px" }}>Loading worktrees…</div>
          </Show>

          <Show when={!loading() && worktrees().length === 0}>
            <div style={{ padding: "12px", color: "var(--cortex-text-secondary)", "font-size": "13px" }}>No worktrees found.</div>
          </Show>

          <Show when={!loading() && worktrees().length > 0}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
              <For each={worktrees()}>
                {(worktree) => (
                  <div style={{ display: "flex", "align-items": "center", gap: "12px", padding: "12px", border: "1px solid var(--cortex-border-default)", "border-radius": "12px", background: "var(--cortex-bg-secondary)" }}>
                    <CortexIcon name={isPrimaryWorktree(worktree) ? "home-01" : "git-branch-01"} size={16} color="var(--cortex-text-secondary)" />
                    <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "4px", overflow: "hidden" }}>
                      <div style={{ display: "flex", "align-items": "center", gap: "8px", "flex-wrap": "wrap" }}>
                        <span style={{ color: "var(--cortex-text-on-surface)", "font-size": "14px", "font-weight": "600" }}>
                          {worktree.branch ?? getWorktreeName(worktree.path)}
                        </span>
                        <Show when={isPrimaryWorktree(worktree)}>
                          <span style={{ padding: "2px 8px", "border-radius": "999px", background: "rgba(178,255,34,0.12)", color: "var(--cortex-accent-primary)", "font-size": "11px" }}>Main</span>
                        </Show>
                        <Show when={dirtyByPath()[worktree.path]}>
                          <span style={{ padding: "2px 8px", "border-radius": "999px", background: "rgba(245,158,11,0.12)", color: "#f59e0b", "font-size": "11px" }}>Dirty</span>
                        </Show>
                        <Show when={worktree.prunable}>
                          <span style={{ padding: "2px 8px", "border-radius": "999px", background: "rgba(239,68,68,0.12)", color: "#ef4444", "font-size": "11px" }}>Stale</span>
                        </Show>
                      </div>
                      <span style={{ color: "var(--cortex-text-secondary)", "font-size": "12px", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>{worktree.path}</span>
                    </div>
                    <Show when={!isPrimaryWorktree(worktree)}>
                      <CortexButton variant="danger" size="sm" onClick={() => setPendingRemove(worktree)} disabled={removeLoading()}>
                        Remove
                      </CortexButton>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </CortexModal>

      <CortexModal
        open={showPrunePreview()}
        onClose={closePrunePreview}
        title="Prune Stale Worktrees?"
        size="sm"
        closeOnOverlay={false}
        footer={
          <div style={{ display: "flex", width: "100%", "justify-content": "flex-end", gap: "8px" }}>
            <CortexButton variant="ghost" size="sm" onClick={closePrunePreview} disabled={pruneLoading()}>
              {prunePreview().length > 0 ? "Cancel" : "Close"}
            </CortexButton>
            <Show when={prunePreview().length > 0}>
              <CortexButton variant="danger" size="sm" onClick={() => void handleConfirmPrune()} disabled={pruneLoading()}>
                {pruneLoading() ? "Pruning…" : pruneConfirmLabel()}
              </CortexButton>
            </Show>
          </div>
        }
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <p style={{ margin: 0, color: "var(--cortex-text-secondary)", "font-size": "13px", "line-height": "1.5" }}>
            Preview stale worktree metadata before pruning so the mounted sidebar never removes entries silently.
          </p>
          <Show when={prunePreview().length > 0} fallback={<div style={{ color: "var(--cortex-text-secondary)", "font-size": "13px" }}>No stale worktrees found.</div>}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
              <For each={prunePreview()}>
                {(line) => (
                  <div style={{ padding: "10px 12px", border: "1px solid var(--cortex-border-default)", "border-radius": "10px", background: "var(--cortex-bg-secondary)", color: "var(--cortex-text-on-surface)", "font-size": "12px", "font-family": "var(--cortex-font-mono)" }}>
                    {line}
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </CortexModal>

      <DestructiveActionDialog
        open={!!pendingRemove()}
        title="Remove Worktree?"
        message={pendingRemove() ? `Remove “${getWorktreeName(pendingRemove()!.path)}”?` : "Remove worktree?"}
        detail={pendingRemove() ? `${dirtyByPath()[pendingRemove()!.path] ? "This worktree has uncommitted changes and will be force-removed. " : ""}Path: ${pendingRemove()!.path}` : undefined}
        confirmLabel={confirmRemoveLabel()}
        onConfirm={() => void handleRemoveConfirm()}
        onCancel={() => {
          if (!removeLoading()) setPendingRemove(null);
        }}
      />
    </>
  );
};

export default CortexGitWorktreeDialog;
