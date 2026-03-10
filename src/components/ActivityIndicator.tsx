import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
} from "solid-js";
import {
  useActivityIndicator,
  type ActivityTask,
  type TaskHistoryEntry,
  type TaskSource,
} from "@/context/ActivityIndicatorContext";
import { LoadingSpinner, ProgressBar } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";

type ActivityTab = "active" | "history";

const ACTIVITY_TABS = [
  { id: "active", label: "Active" },
  { id: "history", label: "History" },
] satisfies ReadonlyArray<{ id: ActivityTab; label: string }>;

function getSourceIcon(source: TaskSource) {
  switch (source) {
    case "lsp":
      return <Icon name="code" size={12} />;
    case "git":
      return <Icon name="code-branch" size={12} />;
    case "build":
      return <Icon name="terminal" size={12} />;
    case "format":
      return <Icon name="code" size={12} />;
    case "remote":
      return <Icon name="server" size={12} />;
    case "extension":
      return <Icon name="box" size={12} />;
    case "auto-update":
      return <Icon name="download" size={12} />;
    case "repl":
      return <Icon name="play" size={12} />;
    case "debug":
      return <Icon name="bolt" size={12} />;
    case "mcp":
      return <Icon name="server" size={12} />;
    case "system":
      return <Icon name="gear" size={12} />;
    default:
      return <Icon name="spinner" size={12} />;
  }
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getHistoryStatusLabel(status: TaskHistoryEntry["status"]): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

interface TaskItemProps {
  task: ActivityTask;
  onCancel?: (taskId: string) => void;
  compact?: boolean;
}

function TaskItem(props: TaskItemProps) {
  const progressValue = createMemo(() =>
    props.task.progress === undefined ? undefined : Math.round(props.task.progress)
  );

  return (
    <div
      role="listitem"
      class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors group"
      style={{ "min-height": "32px" }}
      aria-label={
        progressValue() === undefined
          ? props.task.title
          : `${props.task.title}, ${progressValue()} percent complete`
      }
    >
      <div class="relative flex-shrink-0" aria-hidden="true">
        <span style={{ color: "var(--text-weak)" }}>
          {getSourceIcon(props.task.source)}
        </span>
        <Show when={props.task.status === "running"}>
          <div class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <LoadingSpinner size={14} style={{ color: "var(--accent)" }} />
          </div>
        </Show>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="text-xs font-medium truncate"
            style={{ color: "var(--text-base)" }}
          >
            {props.task.title}
          </span>
          <Show when={progressValue() !== undefined}>
            <span
              class="text-[10px] tabular-nums"
              style={{ color: "var(--text-weak)" }}
            >
              {progressValue()}%
            </span>
          </Show>
        </div>
        <Show when={props.task.message && !props.compact}>
          <p class="text-[10px] truncate" style={{ color: "var(--text-weaker)" }}>
            {props.task.message}
          </p>
        </Show>
        <Show when={progressValue() !== undefined}>
          <div
            class="h-1 rounded-full mt-1 overflow-hidden"
            style={{ background: "var(--surface-raised)" }}
            role="progressbar"
            aria-label={`${props.task.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressValue()}
            aria-valuetext={`${progressValue()}%`}
          >
            <div
              class="h-full rounded-full transition-all duration-300"
              style={{
                background: "var(--accent)",
                width: `${progressValue()}%`,
              }}
            />
          </div>
        </Show>
      </div>

      <Show when={props.task.cancellable && props.onCancel}>
        <button
          type="button"
          class="p-1 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-white/10"
          style={{ color: "var(--text-weak)" }}
          onClick={(event) => {
            event.stopPropagation();
            props.onCancel?.(props.task.id);
          }}
          title="Cancel task"
          aria-label={`Cancel ${props.task.title}`}
        >
          <Icon name="xmark" size={14} />
        </button>
      </Show>
    </div>
  );
}

interface HistoryItemProps {
  entry: TaskHistoryEntry;
  now: number;
}

function HistoryItem(props: HistoryItemProps) {
  const statusIcon = () => {
    switch (props.entry.status) {
      case "completed":
        return <Icon name="check" size={12} style={{ color: "var(--success)" }} />;
      case "failed":
        return (
          <Icon
            name="circle-exclamation"
            size={12}
            style={{ color: "var(--error)" }}
          />
        );
      case "cancelled":
        return <Icon name="xmark" size={12} style={{ color: "var(--warning)" }} />;
    }
  };

  const completedLabel = () => formatAbsoluteTime(props.entry.completedAt);
  const relativeLabel = () => formatRelativeTime(props.entry.completedAt, props.now);
  const statusLabel = () => getHistoryStatusLabel(props.entry.status);

  return (
    <div
      role="listitem"
      class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
      title={props.entry.error || completedLabel()}
      aria-label={`${props.entry.title}, ${statusLabel()}, completed ${relativeLabel()}`}
    >
      <div class="flex-shrink-0" aria-hidden="true">
        {statusIcon()}
      </div>
      <span style={{ color: "var(--text-weaker)" }} aria-hidden="true">
        {getSourceIcon(props.entry.source)}
      </span>
      <div class="flex-1 min-w-0">
        <span class="text-xs truncate block" style={{ color: "var(--text-weak)" }}>
          {props.entry.title}
        </span>
      </div>
      <span
        class="text-[10px] tabular-nums flex-shrink-0"
        style={{ color: "var(--text-weaker)" }}
      >
        {formatDuration(props.entry.duration)}
      </span>
      <time
        class="text-[10px] flex-shrink-0"
        style={{ color: "var(--text-weaker)" }}
        dateTime={new Date(props.entry.completedAt).toISOString()}
        title={completedLabel()}
      >
        {relativeLabel()}
      </time>
    </div>
  );
}

export function ActivityIndicator() {
  const activity = useActivityIndicator();
  const [showPopup, setShowPopup] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<ActivityTab>("active");
  const [relativeNow, setRelativeNow] = createSignal(Date.now());
  const [hadActiveTasks, setHadActiveTasks] = createSignal(false);
  const popupId = createUniqueId();
  const activeTabId = `${popupId}-active-tab`;
  const historyTabId = `${popupId}-history-tab`;
  const activePanelId = `${popupId}-active-panel`;
  const historyPanelId = `${popupId}-history-panel`;

  let popupRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;
  const tabRefs: Partial<Record<ActivityTab, HTMLButtonElement | undefined>> = {};

  const primaryTask = () => activity.primaryTask();
  const primaryTaskProgress = () => {
    const task = primaryTask();
    return task?.progress === undefined ? undefined : Math.round(task.progress);
  };
  const activeTasks = () => activity.activeTasks();
  const history = () => activity.state.history;
  const hasActiveTasks = () => activity.hasActiveTasks();
  const activeTaskCount = () => activity.activeTaskCount();
  const shouldRender = () => hasActiveTasks() || history().length > 0;
  const cancellableTaskCount = () =>
    activeTasks().reduce((count, task) => count + Number(task.cancellable), 0);

  const triggerTitle = () => {
    if (hasActiveTasks()) {
      return `${activeTaskCount()} active task${activeTaskCount() === 1 ? "" : "s"}`;
    }
    return "View task history";
  };

  const triggerLabel = () => {
    if (hasActiveTasks()) {
      const primaryTitle = primaryTask()?.title;
      const count = activeTaskCount();
      if (primaryTitle) {
        return `${primaryTitle}. ${count} active task${count === 1 ? "" : "s"}.`;
      }
      return `${count} active task${count === 1 ? "" : "s"}.`;
    }

    const historyCount = history().length;
    return `View task history. ${historyCount} completed task${historyCount === 1 ? "" : "s"} in history.`;
  };

  const closePopup = (restoreFocus = false) => {
    setShowPopup(false);
    setHadActiveTasks(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef?.focus());
    }
  };

  const focusTab = (tab: ActivityTab) => {
    requestAnimationFrame(() => tabRefs[tab]?.focus());
  };

  const selectTab = (tab: ActivityTab, focus = false) => {
    setActiveTab(tab);
    if (focus) {
      focusTab(tab);
    }
  };

  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as Node | null;
    if (
      target &&
      popupRef &&
      triggerRef &&
      !popupRef.contains(target) &&
      !triggerRef.contains(target)
    ) {
      closePopup();
    }
  };

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && showPopup()) {
      event.preventDefault();
      closePopup(true);
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent, currentTab: ActivityTab) => {
    const currentIndex = ACTIVITY_TABS.findIndex((tab) => tab.id === currentTab);
    if (currentIndex < 0) return;

    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        const nextTab = ACTIVITY_TABS[(currentIndex + 1) % ACTIVITY_TABS.length].id;
        selectTab(nextTab, true);
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        const nextTab =
          ACTIVITY_TABS[(currentIndex - 1 + ACTIVITY_TABS.length) % ACTIVITY_TABS.length].id;
        selectTab(nextTab, true);
        break;
      }
      case "Home":
        event.preventDefault();
        selectTab(ACTIVITY_TABS[0].id, true);
        break;
      case "End":
        event.preventDefault();
        selectTab(ACTIVITY_TABS[ACTIVITY_TABS.length - 1].id, true);
        break;
    }
  };

  createEffect(() => {
    if (!showPopup()) return;

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleDocumentKeyDown);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    });
  });

  createEffect(() => {
    const hasTasks = hasActiveTasks();
    if (hasTasks) {
      setHadActiveTasks(true);
      return;
    }

    if (hadActiveTasks() && activeTab() === "history") {
      setActiveTab("active");
    }
  });

  createEffect(() => {
    const shouldTick = showPopup() && activeTab() === "history" && history().length > 0;
    if (!shouldTick) return;

    setRelativeNow(Date.now());
    const intervalId = window.setInterval(() => setRelativeNow(Date.now()), 60000);
    onCleanup(() => window.clearInterval(intervalId));
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleDocumentKeyDown);
  });

  return (
    <Show when={shouldRender()}>
      <div class="relative">
        <button
          ref={triggerRef}
          type="button"
          class="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
          style={{
            color: hasActiveTasks() ? "var(--accent)" : "var(--text-weak)",
          }}
          onClick={() => setShowPopup((open) => !open)}
          title={triggerTitle()}
          aria-haspopup="dialog"
          aria-expanded={showPopup()}
          aria-controls={popupId}
          aria-label={triggerLabel()}
        >
          <Show when={hasActiveTasks()} fallback={<Icon name="clock" size={14} />}>
            <LoadingSpinner size={14} />
          </Show>

          <Show when={primaryTask()}>
            <span class="text-xs max-w-32 truncate">
              {primaryTask()!.title}
              <Show when={primaryTaskProgress() !== undefined}>
                <span class="ml-1 tabular-nums">({primaryTaskProgress()}%)</span>
              </Show>
            </span>
          </Show>

          <Show when={activeTaskCount() > 1}>
            <span
              class="text-[10px] px-1 rounded"
              style={{
                background: "var(--surface-raised)",
                color: "var(--text-weak)",
              }}
              aria-hidden="true"
            >
              +{activeTaskCount() - 1}
            </span>
          </Show>

          <Show when={showPopup()} fallback={<Icon name="chevron-up" size={12} />}>
            <Icon name="chevron-down" size={12} />
          </Show>
        </button>

        <Show when={showPopup()}>
          <div
            ref={popupRef}
            id={popupId}
            role="dialog"
            aria-modal="false"
            aria-label="Activity tasks and history"
            class="absolute bottom-full right-0 mb-1 w-80 rounded-lg shadow-xl overflow-hidden z-50"
            style={{
              background: "var(--surface-base)",
              border: "1px solid var(--border-weak)",
            }}
          >
            <div
              class="flex items-center gap-1 px-2 py-1.5"
              style={{
                background: "var(--surface-raised)",
                "border-bottom": "1px solid var(--border-weak)",
              }}
              role="tablist"
              aria-label="Activity views"
            >
              <For each={ACTIVITY_TABS}>
                {(tab) => {
                  const selected = () => activeTab() === tab.id;
                  const tabId = tab.id === "active" ? activeTabId : historyTabId;
                  const panelId = tab.id === "active" ? activePanelId : historyPanelId;
                  const count = () =>
                    tab.id === "active" ? activeTaskCount() : history().length;

                  return (
                    <button
                      ref={(element) => {
                        tabRefs[tab.id] = element;
                      }}
                      type="button"
                      role="tab"
                      id={tabId}
                      aria-selected={selected()}
                      aria-controls={panelId}
                      tabIndex={selected() ? 0 : -1}
                      class="px-2 py-1 rounded text-xs font-medium transition-colors"
                      style={{
                        background: selected() ? "var(--accent)" : "transparent",
                        color: selected() ? "white" : "var(--text-weak)",
                      }}
                      onClick={() => selectTab(tab.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                    >
                      {tab.label}
                      <Show when={count() > 0}>
                        <span
                          class="ml-1 px-1 rounded-full text-[10px]"
                          style={{
                            background: selected()
                              ? "white"
                              : "var(--surface-base)",
                            color: selected() ? "var(--accent)" : "var(--text-weak)",
                          }}
                          aria-hidden="true"
                        >
                          {count()}
                        </span>
                      </Show>
                    </button>
                  );
                }}
              </For>

              <div class="flex-1" />

              <Show when={activeTab() === "history" && history().length > 0}>
                <button
                  type="button"
                  class="p-1 rounded hover:bg-white/10 transition-colors"
                  style={{ color: "var(--text-weak)" }}
                  onClick={() => activity.clearHistory()}
                  title="Clear history"
                  aria-label="Clear task history"
                >
                  <Icon name="trash" size={14} />
                </button>
              </Show>
            </div>

            <div class="max-h-64 overflow-y-auto">
              <div
                role="tabpanel"
                id={activePanelId}
                aria-labelledby={activeTabId}
                hidden={activeTab() !== "active"}
              >
                <Show
                  when={activeTasks().length > 0}
                  fallback={
                    <div
                      class="px-3 py-6 text-center text-xs"
                      style={{ color: "var(--text-weaker)" }}
                    >
                      No active tasks
                    </div>
                  }
                >
                  <div class="p-1" role="list">
                    <For each={activeTasks()}>
                      {(task) => (
                        <TaskItem
                          task={task}
                          onCancel={(id) => activity.cancelTask(id)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              <div
                role="tabpanel"
                id={historyPanelId}
                aria-labelledby={historyTabId}
                hidden={activeTab() !== "history"}
              >
                <Show
                  when={history().length > 0}
                  fallback={
                    <div
                      class="px-3 py-6 text-center text-xs"
                      style={{ color: "var(--text-weaker)" }}
                    >
                      No task history
                    </div>
                  }
                >
                  <div class="p-1" role="list">
                    <For each={history()}>
                      {(entry) => <HistoryItem entry={entry} now={relativeNow()} />}
                    </For>
                  </div>
                </Show>
              </div>
            </div>

            <Show when={activeTasks().length > 0}>
              <div
                class="px-3 py-2 flex items-center justify-between"
                style={{
                  background: "var(--surface-raised)",
                  "border-top": "1px solid var(--border-weak)",
                }}
              >
                <Show when={cancellableTaskCount() > 0}>
                  <button
                    type="button"
                    class="text-[10px] hover:underline"
                    style={{ color: "var(--text-weak)" }}
                    onClick={() => activity.cancelAllCancellable()}
                    aria-label={`Cancel all ${cancellableTaskCount()} cancellable tasks`}
                  >
                    Cancel all
                  </button>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}

export function ActivityIndicatorMinimal() {
  const activity = useActivityIndicator();

  return (
    <Show when={activity.hasActiveTasks()}>
      <div
        class="flex items-center gap-1"
        title={activity.primaryTask()?.title}
        role="status"
        aria-live="polite"
        aria-label={`${activity.activeTaskCount()} active task${activity.activeTaskCount() === 1 ? "" : "s"}`}
      >
        <LoadingSpinner size={12} style={{ color: "var(--accent)" }} />
        <Show when={activity.activeTaskCount() > 1}>
          <span
            class="text-[10px] tabular-nums"
            style={{ color: "var(--text-weak)" }}
          >
            {activity.activeTaskCount()}
          </span>
        </Show>
      </div>
    </Show>
  );
}

interface ActivityProgressBarProps {
  source?: TaskSource;
}

export function ActivityProgressBar(props: ActivityProgressBarProps) {
  const activity = useActivityIndicator();

  const progress = () => {
    if (props.source) {
      return activity.getSourceProgress(props.source);
    }

    return activity.primaryTask()?.progress;
  };

  const roundedProgress = () => {
    const value = progress();
    return value === undefined ? undefined : Math.round(value);
  };

  const isActive = () => {
    if (props.source) {
      return activity.isSourceBusy(props.source);
    }

    return activity.hasActiveTasks();
  };

  const accessibleLabel = () =>
    props.source ? `${props.source} activity progress` : "Activity progress";

  return (
    <Show when={isActive()}>
      <div
        role="progressbar"
        aria-label={accessibleLabel()}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedProgress()}
        aria-valuetext={
          roundedProgress() === undefined ? "In progress" : `${roundedProgress()}%`
        }
      >
        <ProgressBar
          mode={roundedProgress() === undefined ? "infinite" : "discrete"}
          value={roundedProgress() ?? 0}
          visible={isActive()}
        />
      </div>
    </Show>
  );
}
