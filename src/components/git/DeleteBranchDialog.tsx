import { onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../ui/Icon";
import { Button } from "@/components/ui";
import { tokens } from "@/design-system/tokens";

export interface DeleteBranchDialogProps {
  branchName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteBranchDialog(props: DeleteBranchDialogProps) {
  let dialogRef: HTMLDivElement | undefined;

  const getFocusableButtons = (): HTMLButtonElement[] => {
    if (!dialogRef) return [];
    return Array.from(dialogRef.querySelectorAll("button"));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onCancel();
      return;
    }
    if (e.key === "Tab") {
      const focusable = getFocusableButtons();
      if (focusable.length < 2) return;
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
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    const buttons = getFocusableButtons();
    if (buttons.length > 0) {
      buttons[0].focus();
    }
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  const descriptionId = "delete-branch-description";

  return (
    <Portal>
      <div
        style={{
          position: "fixed",
          inset: "0",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          background: "rgba(0, 0, 0, 0.6)",
          "z-index": "9999",
        }}
        onClick={props.onCancel}
      >
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-describedby={descriptionId}
          style={{
            width: "420px",
            "max-width": "90vw",
            background: tokens.colors.surface.elevated,
            "border-radius": tokens.radius.lg,
            "box-shadow": tokens.shadows.modal,
            display: "flex",
            "flex-direction": "column",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            class="flex items-center gap-3 px-5 py-4 border-b"
            style={{ "border-color": tokens.colors.border.divider }}
          >
            <Icon
              name="triangle-exclamation"
              class="w-5 h-5"
              style={{ color: tokens.colors.semantic.error }}
            />
            <span class="text-base font-semibold" style={{ color: tokens.colors.text.primary }}>
              Delete Branch
            </span>
          </div>

          {/* Content */}
          <div class="px-5 py-4">
            <p
              id={descriptionId}
              class="text-sm"
              style={{ color: tokens.colors.text.secondary }}
            >
              Delete branch <strong style={{ color: tokens.colors.text.primary }}>{props.branchName}</strong>? This action cannot be undone.
            </p>
          </div>

          {/* Footer */}
          <div
            class="flex items-center justify-end gap-3 px-5 py-3 border-t"
            style={{ "border-color": tokens.colors.border.divider }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={props.onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={props.onConfirm}
              style={{
                background: tokens.colors.semantic.error,
              }}
            >
              <Icon name="trash" class="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
