import {
  Component,
  createSignal,
  createMemo,
  Show,
  For,
  JSX,
} from "solid-js";
import { useMultiRepo, type GitBranch } from "@/context/MultiRepoContext";
import { CortexSvgIcon, type CortexIconName } from "@/components/cortex/icons";

export interface BranchStatusBarItemProps {
  style?: JSX.CSSProperties;
}

export const BranchStatusBarItem: Component<BranchStatusBarItemProps> = (
  props,
) => {
  let multiRepo: ReturnType<typeof useMultiRepo> | null = null;
  try {
    multiRepo = useMultiRepo();
  } catch {
    /* context not available */
  }

  const [isOpen, setIsOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [checkoutLoading, setCheckoutLoading] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);

  const activeRepo = () => multiRepo?.activeRepository() ?? null;
  const currentBranch = () => activeRepo()?.branch ?? null;
  const allBranches = () => activeRepo()?.branches ?? [];

  const localBranches = createMemo(() =>
    allBranches().filter((b) => !b.remote),
  );

  const remoteBranches = createMemo(() =>
    allBranches().filter((b) => !!b.remote),
  );

  const filteredLocal = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    if (!q) return localBranches();
    return localBranches().filter((b) => b.name.toLowerCase().includes(q));
  });

  const filteredRemote = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    if (!q) return remoteBranches();
    return remoteBranches().filter((b) => b.name.toLowerCase().includes(q));
  });

  const handleCheckout = async (branch: GitBranch) => {
    const repo = activeRepo();
    if (!repo || !multiRepo || branch.current) return;

    setCheckoutLoading(true);
    try {
      const branchName = branch.remote
        ? branch.name.replace(/^[^/]+\//, "")
        : branch.name;
      await multiRepo.checkout(repo.id, branchName);
      setIsOpen(false);
      setSearchQuery("");
    } catch (err) {
      console.error("Branch checkout failed:", err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleToggle = () => {
    if (!activeRepo()) return;
    setIsOpen(!isOpen());
    if (!isOpen()) {
      setSearchQuery("");
    }
  };

  const handleClickOutside = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  let searchInputRef: HTMLInputElement | undefined;

  const iconColor = () => {
    if (isHovered() || isOpen())
      return "var(--cortex-text-on-surface, #FCFCFC)";
    return "var(--cortex-text-secondary, #8C8D8F)";
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        style={{
          display: "flex",
          "align-items": "center",
          gap: "6px",
          padding: "8px",
          border: "1px solid transparent",
          "border-radius": "8px",
          background: "transparent",
          cursor: activeRepo() ? "pointer" : "default",
          height: "32px",
          "font-family": "var(--cortex-font-sans)",
          "font-size": "14px",
          "font-weight": "500",
          color: iconColor(),
          transition: "color 150ms ease, background 150ms ease",
          ...props.style,
        }}
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={
          currentBranch()
            ? `Git Branch: ${currentBranch()} (click to switch)`
            : "Source Control"
        }
        aria-label={
          currentBranch()
            ? `Current branch: ${currentBranch()}`
            : "Source Control"
        }
        aria-expanded={isOpen()}
        aria-haspopup="listbox"
      >
        <Show
          when={!checkoutLoading()}
          fallback={
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                animation: "spin 1s linear infinite",
                color: iconColor(),
              }}
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-dasharray="28"
                stroke-dashoffset="8"
                stroke-linecap="round"
              />
            </svg>
          }
        >
          <CortexSvgIcon
            name={"status-bar/git-branch-02" as CortexIconName}
            size={16}
            color={iconColor()}
          />
        </Show>
        <Show when={currentBranch()}>
          <span
            style={{
              "max-width": "140px",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}
          >
            {currentBranch()}
          </span>
        </Show>
      </button>

      <Show when={isOpen()}>
        {/* Click-outside overlay */}
        <div
          style={{
            position: "fixed",
            inset: "0",
            "z-index": "999",
          }}
          onClick={handleClickOutside}
        />

        {/* Dropdown positioned above the status bar */}
        <div
          style={{
            position: "absolute",
            bottom: "28px",
            left: "0",
            width: "280px",
            "max-height": "360px",
            display: "flex",
            "flex-direction": "column",
            background: "var(--cortex-bg-elevated, #2A2A2C)",
            border: "1px solid var(--cortex-border-default, #2E2F31)",
            "border-radius": "var(--cortex-radius-md, 8px)",
            "box-shadow":
              "0 -4px 16px rgba(0, 0, 0, 0.4), 0 -1px 4px rgba(0, 0, 0, 0.2)",
            "z-index": "1000",
            overflow: "hidden",
            "font-family": "var(--cortex-font-sans)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div
            style={{
              padding: "8px",
              "border-bottom":
                "1px solid var(--cortex-border-default, #2E2F31)",
            }}
          >
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search branches..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsOpen(false);
                  setSearchQuery("");
                }
              }}
              autofocus
              style={{
                width: "100%",
                height: "28px",
                padding: "0 8px",
                background: "var(--cortex-bg-primary, #141415)",
                border: "1px solid var(--cortex-border-default, #2E2F31)",
                "border-radius": "var(--cortex-radius-sm, 4px)",
                color: "var(--cortex-text-primary, #FCFCFC)",
                "font-size": "12px",
                "font-family": "inherit",
                outline: "none",
                "box-sizing": "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor =
                  "var(--cortex-accent-primary, #BFFF00)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor =
                  "var(--cortex-border-default, #2E2F31)";
              }}
            />
          </div>

          {/* Branch list */}
          <div style={{ flex: "1", "overflow-y": "auto", "min-height": "0" }}>
            {/* Loading overlay */}
            <Show when={checkoutLoading()}>
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  padding: "16px",
                  gap: "8px",
                  color: "var(--cortex-text-muted, #8C8D8F)",
                  "font-size": "12px",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-dasharray="28"
                    stroke-dashoffset="8"
                    stroke-linecap="round"
                  />
                </svg>
                <span>Switching branch…</span>
              </div>
            </Show>

            <Show when={!checkoutLoading()}>
              {/* Local branches */}
              <Show when={filteredLocal().length > 0}>
                <div
                  style={{
                    padding: "6px 10px 4px",
                    "font-size": "10px",
                    "font-weight": "600",
                    "text-transform": "uppercase",
                    "letter-spacing": "0.5px",
                    color: "var(--cortex-text-muted, #8C8D8F)",
                    "user-select": "none",
                  }}
                >
                  Local Branches
                </div>
                <For each={filteredLocal()}>
                  {(branch) => (
                    <BranchItem
                      branch={branch}
                      isCurrent={branch.current}
                      onClick={() => handleCheckout(branch)}
                      disabled={checkoutLoading()}
                    />
                  )}
                </For>
              </Show>

              {/* Remote branches */}
              <Show when={filteredRemote().length > 0}>
                <div
                  style={{
                    padding: "6px 10px 4px",
                    "font-size": "10px",
                    "font-weight": "600",
                    "text-transform": "uppercase",
                    "letter-spacing": "0.5px",
                    color: "var(--cortex-text-muted, #8C8D8F)",
                    "user-select": "none",
                    "border-top":
                      filteredLocal().length > 0
                        ? "1px solid var(--cortex-border-default, #2E2F31)"
                        : "none",
                    "margin-top":
                      filteredLocal().length > 0 ? "4px" : "0",
                  }}
                >
                  Remote Branches
                </div>
                <For each={filteredRemote()}>
                  {(branch) => (
                    <BranchItem
                      branch={branch}
                      isCurrent={false}
                      onClick={() => handleCheckout(branch)}
                      disabled={checkoutLoading()}
                    />
                  )}
                </For>
              </Show>

              {/* No results */}
              <Show
                when={
                  filteredLocal().length === 0 && filteredRemote().length === 0
                }
              >
                <div
                  style={{
                    padding: "16px",
                    "text-align": "center",
                    color: "var(--cortex-text-muted, #8C8D8F)",
                    "font-size": "12px",
                  }}
                >
                  <Show
                    when={searchQuery().trim()}
                    fallback="No branches found"
                  >
                    No branches matching "{searchQuery()}"
                  </Show>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Show>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

interface BranchItemProps {
  branch: GitBranch;
  isCurrent: boolean;
  onClick: () => void;
  disabled: boolean;
}

const BranchItem: Component<BranchItemProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const displayName = () => {
    if (props.branch.remote) {
      return props.branch.name;
    }
    return props.branch.name;
  };

  return (
    <button
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        width: "100%",
        padding: "6px 10px",
        border: "none",
        background: isHovered()
          ? "var(--cortex-surface-hover, rgba(255, 255, 255, 0.06))"
          : props.isCurrent
            ? "var(--cortex-surface-active, rgba(255, 255, 255, 0.04))"
            : "transparent",
        cursor: props.isCurrent || props.disabled ? "default" : "pointer",
        "text-align": "left",
        "font-family": "inherit",
        "font-size": "12px",
        color: props.isCurrent
          ? "var(--cortex-accent-primary, #BFFF00)"
          : "var(--cortex-text-primary, #FCFCFC)",
        opacity: props.disabled && !props.isCurrent ? "0.5" : "1",
        transition: "background 100ms ease",
      }}
      onClick={() => {
        if (!props.isCurrent && !props.disabled) {
          props.onClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={props.isCurrent || props.disabled}
      role="option"
      aria-selected={props.isCurrent}
    >
      {/* Check icon for current branch */}
      <div
        style={{
          width: "14px",
          "flex-shrink": "0",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
        }}
      >
        <Show when={props.isCurrent}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </Show>
      </div>

      {/* Branch name */}
      <span
        style={{
          flex: "1",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "white-space": "nowrap",
          "min-width": "0",
        }}
      >
        {displayName()}
      </span>

      {/* Ahead/behind indicators */}
      <Show when={props.branch.ahead || props.branch.behind}>
        <span
          style={{
            "flex-shrink": "0",
            "font-size": "10px",
            color: "var(--cortex-text-muted, #8C8D8F)",
          }}
        >
          <Show when={props.branch.ahead}>
            <span style={{ color: "var(--cortex-success, #22c55e)" }}>
              ↑{props.branch.ahead}
            </span>
          </Show>
          <Show when={props.branch.behind}>
            <span style={{ color: "var(--cortex-warning, #f59e0b)" }}>
              ↓{props.branch.behind}
            </span>
          </Show>
        </span>
      </Show>
    </button>
  );
};

export default BranchStatusBarItem;
