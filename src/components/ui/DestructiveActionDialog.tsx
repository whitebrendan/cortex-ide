import { Component, JSX, Show } from "solid-js";
import { CortexModal } from "@/components/cortex/primitives/CortexModal";
import { CortexButton } from "@/components/cortex/primitives/CortexButton";
import { CortexIcon } from "@/components/cortex/primitives/CortexIcon";

export interface DestructiveActionDialogProps {
  open: boolean;
  title: string;
  message: JSX.Element | string;
  detail?: JSX.Element | string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export const DestructiveActionDialog: Component<DestructiveActionDialogProps> = (props) => {
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
      title={props.title}
      size="sm"
      closeOnOverlay={false}
      showFooter={true}
      footer={
        <div style={footerStyle}>
          <CortexButton variant="ghost" onClick={props.onCancel}>
            Cancel
          </CortexButton>
          <CortexButton
            variant={props.confirmVariant ?? "danger"}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
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
          <p style={messageStyle}>{props.message}</p>
          <Show when={props.detail}>
            <p style={detailStyle}>{props.detail}</p>
          </Show>
        </div>
      </div>
    </CortexModal>
  );
};

export default DestructiveActionDialog;
