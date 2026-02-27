/**
 * FileOperationDialog - Reusable modal for file explorer delete & create operations
 *
 * Handles two modes:
 * - confirm-delete: Confirmation modal with Cancel/Delete buttons
 * - new-file / new-folder: Input modal with name validation
 *
 * Built on CortexModal / CortexButton / CortexIcon from the Cortex UI Design System.
 */

import { Component, Show, createSignal, createEffect, createMemo, JSX, on } from "solid-js";
import { CortexModal } from "../cortex/primitives/CortexModal";
import { CortexButton } from "../cortex/primitives/CortexButton";
import { CortexIcon } from "../cortex/primitives/CortexIcon";
import { validateFileName } from "@/lib/validateFileName";
import type { FileOperationDialogProps } from "./types";

function validateName(name: string, existingNames: string[]): string | null {
  const result = validateFileName(name, existingNames);
  return result.valid ? null : (result.error ?? "Invalid name");
}

export const FileOperationDialog: Component<FileOperationDialogProps> = (props) => {
  const [inputValue, setInputValue] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  const isOpen = () => props.state !== null;
  const mode = () => props.state?.mode ?? "confirm-delete";
  const isDelete = () => mode() === "confirm-delete";
  const isCreate = () => mode() === "new-file" || mode() === "new-folder";

  createEffect(
    on(
      () => props.state,
      (state) => {
        if (state && (state.mode === "new-file" || state.mode === "new-folder")) {
          setInputValue("");
          setTouched(false);
          setTimeout(() => inputRef?.focus(), 50);
        }
      },
    ),
  );

  const validationError = createMemo(() => {
    if (!isCreate()) return null;
    if (!touched()) return null;
    return validateName(inputValue(), props.state?.existingNames ?? []);
  });

  const canSubmit = createMemo(() => {
    if (!isCreate()) return true;
    const name = inputValue();
    return name.trim().length > 0 && validateName(name, props.state?.existingNames ?? []) === null;
  });

  const handleClose = () => {
    setInputValue("");
    setTouched(false);
    props.onClose();
  };

  const handleDelete = () => {
    props.onConfirmDelete();
  };

  const handleCreate = () => {
    const name = inputValue().trim();
    if (!canSubmit()) return;
    props.onCreateItem(name);
    setInputValue("");
    setTouched(false);
  };

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  };

  const deleteTitle = () => {
    const state = props.state;
    if (!state) return "Delete";
    return state.itemCount > 1 ? `Delete ${state.itemCount} Items` : "Delete File";
  };

  const createTitle = () => {
    return mode() === "new-file" ? "New File" : "New Folder";
  };

  const iconContainerStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "40px",
    height: "40px",
    "border-radius": "var(--cortex-radius-md, 8px)",
    "flex-shrink": "0",
  };

  const deleteIconContainerStyle = (): JSX.CSSProperties => ({
    ...iconContainerStyle,
    background: "var(--cortex-error-bg, rgba(239, 68, 68, 0.1))",
  });

  const createIconContainerStyle = (): JSX.CSSProperties => ({
    ...iconContainerStyle,
    background: "var(--cortex-accent-bg, rgba(178, 255, 34, 0.1))",
  });

  const bodyStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "flex-start",
    gap: "16px",
  };

  const textStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "4px",
    flex: "1",
    "min-width": "0",
  };

  const messageStyle: JSX.CSSProperties = {
    margin: "0",
    "font-size": "14px",
    color: "var(--cortex-text-primary)",
    "line-height": "1.5",
  };

  const detailStyle: JSX.CSSProperties = {
    margin: "0",
    "font-size": "13px",
    color: "var(--cortex-text-muted)",
    "line-height": "1.5",
  };

  const inputStyle = (): JSX.CSSProperties => ({
    width: "100%",
    height: "32px",
    padding: "8px 12px",
    "margin-top": "8px",
    background: "var(--cortex-bg-primary)",
    border: validationError()
      ? "1px solid var(--cortex-error)"
      : "1px solid var(--cortex-border-default)",
    "border-radius": "var(--cortex-radius-md, 8px)",
    color: "var(--cortex-text-primary)",
    "font-family": "var(--cortex-font-sans)",
    "font-size": "13px",
    outline: "none",
    "box-sizing": "border-box",
  });

  const errorTextStyle: JSX.CSSProperties = {
    "font-size": "11px",
    color: "var(--cortex-error)",
    "margin-top": "4px",
  };

  const footerStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "flex-end",
    gap: "8px",
    width: "100%",
  };

  const fileNameStyle: JSX.CSSProperties = {
    "font-weight": "600",
    color: "var(--cortex-text-primary)",
    "word-break": "break-all",
  };

  return (
    <Show when={isOpen()}>
      <CortexModal
        open={isOpen()}
        onClose={handleClose}
        title={isDelete() ? deleteTitle() : createTitle()}
        size="sm"
        closeOnOverlay={false}
        footer={
          <div style={footerStyle}>
            <CortexButton variant="ghost" onClick={handleClose}>
              Cancel
            </CortexButton>
            <Show when={isDelete()}>
              <CortexButton variant="danger" onClick={handleDelete}>
                Delete
              </CortexButton>
            </Show>
            <Show when={isCreate()}>
              <CortexButton
                variant="primary"
                onClick={handleCreate}
                disabled={!canSubmit()}
              >
                Create
              </CortexButton>
            </Show>
          </div>
        }
      >
        <Show when={isDelete()}>
          <div style={bodyStyle}>
            <div style={deleteIconContainerStyle()}>
              <CortexIcon
                name="trash-03"
                size={20}
                style={{ color: "var(--cortex-error, #EF4444)" }}
              />
            </div>
            <div style={textStyle}>
              <p style={messageStyle}>
                <Show
                  when={(props.state?.itemCount ?? 0) > 1}
                  fallback={
                    <>
                      Are you sure you want to delete{" "}
                      <span style={fileNameStyle}>{props.state?.targetName}</span>?
                    </>
                  }
                >
                  Are you sure you want to delete{" "}
                  <span style={fileNameStyle}>
                    {props.state?.itemCount} items
                  </span>
                  ?
                </Show>
              </p>
              <p style={detailStyle}>This action cannot be undone.</p>
            </div>
          </div>
        </Show>

        <Show when={isCreate()}>
          <div style={bodyStyle}>
            <div style={createIconContainerStyle()}>
              <CortexIcon
                name={mode() === "new-file" ? "file" : "folder"}
                size={20}
                style={{ color: "var(--cortex-accent-primary, #B2FF22)" }}
              />
            </div>
            <div style={textStyle}>
              <p style={messageStyle}>
                Enter a name for the new{" "}
                {mode() === "new-file" ? "file" : "folder"}:
              </p>
              <input
                ref={inputRef}
                type="text"
                value={inputValue()}
                onInput={(e) => {
                  setInputValue(e.currentTarget.value);
                  setTouched(true);
                }}
                onKeyDown={handleInputKeyDown}
                style={inputStyle()}
                placeholder={
                  mode() === "new-file" ? "filename.ext" : "folder-name"
                }
                spellcheck={false}
                autocomplete="off"
              />
              <Show when={validationError()}>
                <span style={errorTextStyle}>{validationError()}</span>
              </Show>
            </div>
          </div>
        </Show>
      </CortexModal>
    </Show>
  );
};

export default FileOperationDialog;
