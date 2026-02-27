import { Show, onMount, onCleanup } from "solid-js";

export interface DeleteConfirmDialogProps {
  itemName: string;
  itemType: "file" | "folder";
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog(props: DeleteConfirmDialogProps) {
  let dialogRef: HTMLDivElement | undefined;

  const titleId = "delete-confirm-title";
  const descriptionId = "delete-confirm-description";

  const trapFocus = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onCancel();
      return;
    }

    if (e.key !== "Tab" || !dialogRef) return;

    const focusable = dialogRef.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  onMount(() => {
    const cancelBtn = dialogRef?.querySelector<HTMLElement>(
      ".delete-confirm-cancel-btn",
    );
    cancelBtn?.focus();
    document.addEventListener("keydown", trapFocus);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", trapFocus);
  });

  return (
    <div class="modal-overlay dimmed" onClick={props.onCancel}>
      <div class="dialog-shadow">
        <div
          ref={dialogRef}
          class="modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onClick={(e) => e.stopPropagation()}
          style={{ "min-width": "400px" }}
        >
          <div class="modal-buttons-row">
            <div class="modal-buttons">
              <button
                class="modal-button modal-button-secondary delete-confirm-cancel-btn"
                onClick={props.onCancel}
              >
                Cancel
              </button>
              <button
                class="modal-button"
                onClick={props.onConfirm}
                style={{
                  background: "var(--button-danger-bg, var(--state-error, #ef4444))",
                  color: "var(--button-danger-text, #fff)",
                  "border-color": "transparent",
                }}
              >
                Delete
              </button>
            </div>
          </div>

          <div class="modal-message-row">
            <div class="modal-message-container">
              <div class="modal-title" id={titleId}>
                Delete {props.itemType === "folder" ? "Folder" : "File"}
              </div>
              <div class="modal-detail" id={descriptionId}>
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    "margin-bottom": "8px",
                  }}
                >
                  <span
                    style={{
                      "font-size": "16px",
                      "flex-shrink": "0",
                    }}
                    aria-hidden="true"
                  >
                    {props.itemType === "folder" ? "📁" : "📄"}
                  </span>
                  <span
                    style={{
                      "font-weight": "600",
                      "word-break": "break-all",
                    }}
                  >
                    {props.itemName}
                  </span>
                </div>
                <Show when={props.itemType === "folder"}>
                  <div
                    style={{
                      color: "var(--state-warning, #f59e0b)",
                      "font-size": "13px",
                      "margin-top": "4px",
                    }}
                  >
                    This will delete the folder and all its contents.
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
