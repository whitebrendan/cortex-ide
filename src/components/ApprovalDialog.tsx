import { Show, createSignal, onCleanup, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import { useSDK } from "@/context/SDKContext";
import { useModalActiveOptional } from "@/context/ModalActiveContext";
import { Button } from "./ui";
import { Icon } from "./ui/Icon";

/** Dialog types matching VS Code specifications */
export type DialogType = "info" | "error" | "warning" | "question" | "pending" | "none";

/** Get platform for button ordering */
function getPlatform(): "windows" | "mac" | "linux" {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "mac";
  if (platform.includes("win")) return "windows";
  return "linux";
}

/** Get icon for dialog type */
function DialogIcon(props: { type: DialogType }) {
  const iconClass = () => {
    switch (props.type) {
      case "info": return "modal-icon-info";
      case "error": return "modal-icon-error";
      case "warning": return "modal-icon-warning";
      case "question": return "modal-icon-question";
      case "pending": return "modal-icon-pending";
      default: return "modal-icon-none";
    }
  };

  const ariaLabel = () => {
    switch (props.type) {
      case "info": return "Info";
      case "error": return "Error";
      case "warning": return "Warning";
      case "pending": return "In Progress";
      default: return "Info";
    }
  };

  return (
    <Show when={props.type !== "none"}>
      <div
        class={`modal-icon ${iconClass()}`}
        aria-label={ariaLabel()}
        id="modal-dialog-icon"
      >
        <Show when={props.type === "pending"}>
          <div class="icon-spin">⏳</div>
        </Show>
        <Show when={props.type === "question"}>
          <span>❓</span>
        </Show>
        <Show when={props.type === "info"}>
          <span>ℹ️</span>
        </Show>
        <Show when={props.type === "error"}>
          <span>❌</span>
        </Show>
        <Show when={props.type === "warning"}>
          <span>⚠️</span>
        </Show>
      </div>
    </Show>
  );
}

export function ApprovalDialog() {
  const { state, approve } = useSDK();
  const { registerModal, unregisterModal } = useModalActiveOptional();
  const [dialogRef, setDialogRef] = createSignal<HTMLDivElement | null>(null);
  const platform = getPlatform();

  let focusTimer: ReturnType<typeof setTimeout> | null = null;
  let previousActiveElement: HTMLElement | null = null;
  let previousBodyOverflow = "";
  let isDialogOpen = false;
  let isModalRegistered = false;

  const currentApproval = () => state.pendingApproval;

  const handleApprove = () => {
    const approval = currentApproval();
    if (approval) {
      void approve(approval.callId, true);
    }
  };

  const handleDeny = () => {
    const approval = currentApproval();
    if (approval) {
      void approve(approval.callId, false);
    }
  };

  const command = () => currentApproval()?.command.join(" ") ?? "";

  const getFocusableElements = () => {
    const dialog = dialogRef();
    if (!dialog) return [];

    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => {
      if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") {
        return false;
      }

      if (typeof window === "undefined") {
        return true;
      }

      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  };

  const clearFocusTimer = () => {
    if (focusTimer) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
  };

  const focusPrimaryElement = () => {
    clearFocusTimer();
    focusTimer = setTimeout(() => {
      const dialog = dialogRef();
      if (!dialog) return;

      const focusable = getFocusableElements();
      const primaryButton = focusable.find((element) =>
        element.classList.contains("modal-button-primary") ||
        element.getAttribute("data-primary") === "true"
      );

      (primaryButton ?? focusable[0] ?? dialog).focus();
    }, 0);
  };

  const restoreFocus = () => {
    const focusTarget = previousActiveElement;
    previousActiveElement = null;

    if (!focusTarget || !focusTarget.isConnected || focusTarget.hasAttribute("disabled")) {
      return;
    }

    setTimeout(() => {
      if (focusTarget.isConnected) {
        focusTarget.focus();
      }
    }, 0);
  };

  const stopKeyEvent = (event: KeyboardEvent) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!currentApproval()) return;

    if (event.key === "Escape") {
      stopKeyEvent(event);
      event.preventDefault();
      handleDeny();
      return;
    }

    if (event.key === "Tab") {
      stopKeyEvent(event);
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeElement === firstElement || !activeElement || !focusable.includes(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement || !activeElement || !focusable.includes(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      stopKeyEvent(event);
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const baseIndex = currentIndex === -1 ? 0 : currentIndex;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (baseIndex + direction + focusable.length) % focusable.length;

      event.preventDefault();
      focusable[nextIndex].focus();
      return;
    }

    if (event.altKey) {
      stopKeyEvent(event);
      event.preventDefault();
    }
  };

  const handleFocusIn = (event: FocusEvent) => {
    const dialog = dialogRef();
    const target = event.target;
    if (!currentApproval() || !dialog || !target || dialog.contains(target as Node)) {
      return;
    }

    focusPrimaryElement();
  };

  const openDialog = () => {
    if (typeof document === "undefined" || isDialogOpen) {
      focusPrimaryElement();
      return;
    }

    isDialogOpen = true;
    previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (!isModalRegistered) {
      registerModal();
      isModalRegistered = true;
    }

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    focusPrimaryElement();
  };

  const closeDialog = () => {
    if (typeof document === "undefined" || !isDialogOpen) {
      clearFocusTimer();
      return;
    }

    isDialogOpen = false;
    clearFocusTimer();
    window.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("focusin", handleFocusIn, true);
    document.body.style.overflow = previousBodyOverflow;

    if (isModalRegistered) {
      unregisterModal();
      isModalRegistered = false;
    }

    restoreFocus();
  };

  const handleBackdropPointer = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      focusPrimaryElement();
    }
  };

  createEffect(() => {
    const approval = currentApproval();
    if (approval) {
      openDialog();
      return;
    }

    closeDialog();
  });

  onCleanup(() => {
    clearFocusTimer();
    closeDialog();
  });

  return (
    <Show when={currentApproval()}>
      {(approval) => (
        <Portal>
          <div
            data-testid="approval-dialog-overlay"
            class="modal-overlay dimmed"
            onMouseDown={handleBackdropPointer}
            onClick={handleBackdropPointer}
          >
            <div class="dialog-shadow">
              <div
                ref={setDialogRef}
                data-testid="approval-dialog"
                class="modal dialog-type-question"
                role="dialog"
                aria-modal="true"
                aria-labelledby="approval-dialog-title"
                aria-describedby="approval-dialog-command approval-dialog-cwd"
                tabIndex={-1}
                data-focus-trap="true"
              >
                <div class="modal-buttons-row">
                  <div class={`modal-buttons platform-${platform}`}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDeny}
                      class="modal-button modal-button-secondary"
                    >
                      Deny
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApprove}
                      class="modal-button modal-button-primary"
                      data-primary="true"
                    >
                      Approve
                    </Button>
                  </div>
                </div>

                <div class="modal-message-row">
                  <DialogIcon type="question" />
                  <div class="modal-message-container">
                    <div class="modal-title" id="approval-dialog-title">
                      Approve Command
                    </div>
                    <div class="modal-detail">
                      <pre
                        id="approval-dialog-command"
                        class="text-sm font-mono p-3 rounded overflow-x-auto"
                        style={{
                          background: "var(--background-base)",
                          color: "var(--text-strong)",
                        }}
                      >
                        $ {command()}
                      </pre>
                      <div class="mt-2 text-xs" id="approval-dialog-cwd" style={{ color: "var(--text-weaker)" }}>
                        {approval().cwd}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="modal-toolbar-row">
                  <div class="actions-container">
                    <button
                      class="modal-close"
                      onClick={handleDeny}
                      aria-label="Close"
                    >
                      <Icon name="xmark" size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </Show>
  );
}
