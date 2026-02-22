/**
 * ConfirmDialog - Dirty file close confirmation dialog
 *
 * Shows a modal with Save / Don't Save / Cancel buttons when
 * the user attempts to close a file with unsaved changes.
 * Built on CortexModal from the Cortex UI Design System.
 */

import { Component, JSX } from "solid-js";
import { CortexModal } from "../cortex/primitives/CortexModal";
import { CortexButton } from "../cortex/primitives/CortexButton";
import { CortexIcon } from "../cortex/primitives/CortexIcon";

export interface ConfirmDialogProps {
  open: boolean;
  fileName: string;
  message?: string;
  onSave: () => void;
  onDontSave: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  const bodyStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "flex-start",
    gap: "16px",
  };

  const iconContainerStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "40px",
    height: "40px",
    "border-radius": "var(--cortex-radius-md, 8px)",
    background: "var(--cortex-warning-bg, rgba(245, 158, 11, 0.1))",
    "flex-shrink": "0",
  };

  const textStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "4px",
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

  const footerStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    "justify-content": "flex-end",
    gap: "8px",
    width: "100%",
  };

  return (
    <CortexModal
      open={props.open}
      onClose={props.onCancel}
      title="Unsaved Changes"
      size="sm"
      closeOnOverlay={false}
      footer={
        <div style={footerStyle}>
          <CortexButton variant="ghost" onClick={props.onCancel}>
            Cancel
          </CortexButton>
          <CortexButton variant="secondary" onClick={props.onDontSave}>
            Don't Save
          </CortexButton>
          <CortexButton variant="primary" onClick={props.onSave}>
            Save
          </CortexButton>
        </div>
      }
    >
      <div style={bodyStyle}>
        <div style={iconContainerStyle}>
          <CortexIcon
            name="triangle-exclamation"
            size={20}
            style={{ color: "var(--cortex-warning, #F59E0B)" }}
          />
        </div>
        <div style={textStyle}>
          <p style={messageStyle}>
            {props.message ??
              `Do you want to save the changes you made to ${props.fileName}?`}
          </p>
          <p style={detailStyle}>
            Your changes will be lost if you don't save them.
          </p>
        </div>
      </div>
    </CortexModal>
  );
};

export default ConfirmDialog;
