import { Show } from "solid-js";
import type { LargeFileWarningDialogProps } from "./types";

export function LargeFileWarningDialog(props: LargeFileWarningDialogProps) {
  return (
    <Show when={props.open}>
      <div class="modal-overlay dimmed" onClick={props.onCancel}>
        <div class="dialog-shadow">
          <div 
            class="modal"
            role="dialog"
            aria-modal="true"
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
                  onClick={props.onConfirm}
                >
                  Open Anyway
                </button>
              </div>
            </div>
            
            <div class="modal-message-row">
              <div class="modal-message-container">
                <div class="modal-title">Large File Warning</div>
                <div class="modal-detail">
                  The file "{props.fileName}" is {props.fileSizeMB.toFixed(1)} MB, which exceeds the configured limit of {props.maxSizeMB} MB.
                  <br /><br />
                  Opening large files may impact editor performance and memory usage.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
