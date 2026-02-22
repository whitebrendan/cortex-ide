import { Show } from "solid-js";
import type { DragConfirmDialogProps } from "./types";

export function DragConfirmDialog(props: DragConfirmDialogProps) {
  return (
    <Show when={props.open}>
      <div class="modal-overlay dimmed" onClick={props.onCancel}>
        <div class="dialog-shadow">
          <div 
            class="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ "min-width": "350px" }}
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
                  onClick={props.onConfirm}
                >
                  {props.operation === "copy" ? "Copy" : "Move"}
                </button>
              </div>
            </div>
            
            <div class="modal-message-row">
              <div class="modal-message-container">
                <div class="modal-title">
                  {props.operation === "copy" ? "Copy" : "Move"} {props.itemCount === 1 ? "Item" : "Items"}
                </div>
                <div class="modal-detail">
                  {props.operation === "copy" ? "Copy" : "Move"} {props.itemCount} {props.itemCount === 1 ? "item" : "items"} to "{props.targetName}"?
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
