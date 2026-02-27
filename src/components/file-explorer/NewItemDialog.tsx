import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { validateFileName } from "@/lib/validateFileName";

export interface NewItemDialogProps {
  itemType: "file" | "folder";
  parentPath: string;
  existingSiblings: string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewItemDialog(props: NewItemDialogProps) {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  let dialogRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  const handleInput = (value: string) => {
    setName(value);
    if (value.length === 0) {
      setError(null);
      return;
    }
    const result = validateFileName(value, props.existingSiblings);
    setError(result.valid ? null : (result.error ?? "Invalid name"));
  };

  const handleSubmit = () => {
    const value = name().trim();
    if (!value) return;

    const result = validateFileName(value, props.existingSiblings);
    if (!result.valid) {
      setError(result.error ?? "Invalid name");
      return;
    }

    props.onSubmit(value);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      props.onCancel();
    }
  };

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
    inputRef?.focus();
    document.addEventListener("keydown", trapFocus);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", trapFocus);
  });

  const parentDisplay = () => {
    const parts = props.parentPath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || props.parentPath;
  };

  return (
    <div class="modal-overlay dimmed" onClick={props.onCancel}>
      <div class="dialog-shadow">
        <div
          ref={dialogRef}
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-label={`New ${props.itemType}`}
          onClick={(e) => e.stopPropagation()}
          style={{ "min-width": "400px" }}
        >
          <div class="modal-buttons-row">
            <div class="modal-buttons">
              <button
                class="modal-button modal-button-secondary"
                onClick={props.onCancel}
              >
                Cancel
              </button>
              <button
                class="modal-button modal-button-primary"
                onClick={handleSubmit}
                disabled={!name().trim() || error() !== null}
              >
                Create
              </button>
            </div>
          </div>

          <div class="modal-message-row">
            <div class="modal-message-container">
              <div class="modal-title">
                New {props.itemType === "folder" ? "Folder" : "File"}
              </div>
              <div class="modal-detail" style={{ "margin-bottom": "4px" }}>
                Create a new {props.itemType} in{" "}
                <strong>{parentDisplay()}</strong>
              </div>

              <div style={{ "margin-top": "8px", width: "100%" }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={name()}
                  onInput={(e) => handleInput(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    props.itemType === "folder"
                      ? "Folder name"
                      : "File name (e.g. index.ts)"
                  }
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    "font-size": "13px",
                    background: "var(--surface-input, var(--surface-base))",
                    color: "var(--text-primary, var(--text-base))",
                    border: `1px solid ${error() ? "var(--state-error, #ef4444)" : "var(--border-default)"}`,
                    "border-radius": "var(--radius-sm, 6px)",
                    outline: "none",
                    "box-sizing": "border-box",
                  }}
                  aria-invalid={error() !== null}
                  aria-describedby={error() ? "new-item-error" : undefined}
                />
                <Show when={error()}>
                  <div
                    id="new-item-error"
                    role="alert"
                    style={{
                      color: "var(--state-error, #ef4444)",
                      "font-size": "12px",
                      "margin-top": "4px",
                      "line-height": "1.4",
                    }}
                  >
                    {error()}
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
