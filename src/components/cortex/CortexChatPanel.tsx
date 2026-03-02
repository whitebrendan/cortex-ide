/**
 * CortexChatPanel - Pixel-perfect chat panel matching Figma design
 *
 * 3 States:
 * 1. Home (Full Screen) - Centered title + prompt input (Figma 1239:21705)
 * 2. Minimized (Overlay) - 369×297px positioned bottom-left
 * 3. Expanded (Agent Working) - Full conversation with progress indicators
 *
 * Figma refs: 1239:21705 (Main Screen / Home), 166:2184 (AI terminal flow / Expanded)
 */

import { Component, JSX, splitProps, Show, For } from "solid-js";
import { CortexPromptInput } from "./primitives";
import { ChatMessageBubble } from "./CortexChatMessageBubble";

export type {
  ChatPanelState,
  ChatMessage,
  ChatAction,
  ChatProgress,
  ChatToolCall,
} from "./cortexChatTypes";

import type {
  ChatPanelState,
  ChatMessage,
} from "./cortexChatTypes";

export interface CortexChatPanelProps {
  state?: ChatPanelState;
  messages?: ChatMessage[];
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onStop?: () => void;
  isProcessing?: boolean;
  modelName?: string;
  modelIcon?: string;
  onModelClick?: () => void;
  onUploadClick?: () => void;
  class?: string;
  style?: JSX.CSSProperties;
}

type InputProps = Omit<
  CortexChatPanelProps,
  "state" | "messages" | "class" | "style"
>;

const PromptInputBlock: Component<InputProps & { style?: JSX.CSSProperties }> = (props) => (
  <CortexPromptInput
    value={props.inputValue}
    placeholder="Send a prompt or run a command..."
    onChange={props.onInputChange}
    onSubmit={props.onSubmit}
    onStop={props.onStop}
    isProcessing={props.isProcessing}
    modelName={props.modelName}
    modelIcon={props.modelIcon}
    onModelClick={props.onModelClick}
    onUploadClick={props.onUploadClick}
    style={props.style}
  />
);

const FONT = "var(--cortex-font-sans, 'Figtree', sans-serif)";

export const CortexChatPanel: Component<CortexChatPanelProps> = (props) => {
  const [local] = splitProps(props, [
    "state", "messages", "inputValue", "onInputChange", "onSubmit", "onStop",
    "isProcessing", "modelName", "modelIcon", "onModelClick",
    "onUploadClick",
    "class", "style",
  ]);
  const state = () => local.state || "home";

  return (
    <Show
      when={state() === "home"}
      fallback={
        <Show when={state() === "minimized"} fallback={<ExpandedChat {...local} />}>
          <MinimizedChat {...local} />
        </Show>
      }
    >
      <HomeChat {...local} />
    </Show>
  );
};

/* ============================================================================
   HOME STATE - Full screen, centered content
   Figma: 1239:21705 → Main Screen
   Layout: column, center-aligned, 922px content width, 28px gap
   ============================================================================ */
const HomeChat: Component<Omit<CortexChatPanelProps, "state" | "messages">> = (props) => (
  <div class={props.class} style={{
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    "justify-content": "center",
    width: "100%",
    height: "100%",
    background: "var(--cortex-bg-primary)",
    position: "relative",
    overflow: "hidden",
    ...props.style,
  }}>
    {/* Container: Figma 1239:21710 - column, center, gap 28px, width 922px */}
    <div style={{
      display: "flex",
      "flex-direction": "column",
      "align-items": "center",
      "justify-content": "center",
      width: "922px",
      "max-width": "100%",
      gap: "28px",
    }}>
      {/* Title: Figma 1239:21711 - Figtree 32px Medium, lineHeight 40px (125%), centered */}
      <h1 style={{
        "font-family": FONT,
        "font-size": "32px",
        "font-weight": "500",
        color: "var(--cortex-text-primary)",
        "text-align": "center",
        "line-height": "40px",
        "letter-spacing": "0px",
        margin: "0",
        width: "100%",
      }}>Hey, start building or open your project.</h1>

      <PromptInputBlock {...props} />
    </div>
  </div>
);

/* ============================================================================
   MINIMIZED STATE - 369×297px overlay, bottom-left
   Figma: AI terminal / no requests → sidebar panel
   ============================================================================ */
const MinimizedChat: Component<Omit<CortexChatPanelProps, "state">> = (props) => (
  <div class={props.class} style={{
    position: "absolute",
    left: "8px",
    bottom: "36px",
    width: "369px",
    height: "297px",
    background: "var(--cortex-small-btn-bg)",
    "border-radius": "12px",
    border: "1px solid var(--cortex-border-subtle)",
    display: "flex",
    "flex-direction": "column",
    padding: "12px",
    gap: "16px",
    "box-shadow": "var(--cortex-panel-shadow)",
    transition: "box-shadow 200ms ease-out, opacity 200ms ease-out",
    ...props.style,
  }}>
    {/* Title area */}
    <div style={{
      display: "flex",
      "flex-direction": "column",
      gap: "8px",
      padding: "8px",
    }}>
      <h2 style={{
        "font-family": FONT,
        "font-size": "20px",
        "font-weight": "500",
        color: "var(--cortex-text-primary)",
        "line-height": "1em",
        margin: "0",
      }}>What would you like to build?</h2>
      <p style={{
        "font-family": FONT,
        "font-size": "16px",
        "font-weight": "500",
        color: "var(--cortex-text-secondary)",
        "line-height": "1em",
        margin: "0",
      }}>Start a conversation or open a project</p>
    </div>

    <div style={{ flex: "1" }} />

    <PromptInputBlock {...props} style={{ width: "100%" }} />
  </div>
);

/* ============================================================================
   EXPANDED STATE - Full conversation with messages + prompt
   Figma: 166:2184 → AI terminal history → AI Terminal component
   Chat messages in scrollable area, prompt at bottom
   ============================================================================ */
const ExpandedChat: Component<Omit<CortexChatPanelProps, "state">> = (props) => (
  <div class={props.class} style={{
    position: "absolute",
    left: "8px",
    bottom: "36px",
    width: "369px",
    "max-height": "calc(100vh - 120px)",
    background: "var(--cortex-small-btn-bg)",
    "border-radius": "12px",
    border: "1px solid var(--cortex-border-subtle)",
    display: "flex",
    "flex-direction": "column",
    padding: "0 8px 8px 8px",
    gap: "0",
    "box-shadow": "var(--cortex-panel-shadow)",
    transition: "box-shadow 200ms ease-out, opacity 200ms ease-out",
    overflow: "hidden",
    ...props.style,
  }}>
    {/* Scrollable message area: Figma layout_77BZNU - column, gap 16px, padding 0 8px */}
    <div style={{
      flex: "1",
      "overflow-y": "auto",
      display: "flex",
      "flex-direction": "column",
      gap: "16px",
      padding: "8px 0",
    }}>
      <For each={props.messages || []}>
        {(message) => <ChatMessageBubble message={message} />}
      </For>
    </div>

    {/* Prompt input area: Figma layout_IFH6L8 - column, gap 10px, padding 8px */}
    <div style={{
      padding: "8px",
      background: "var(--cortex-border-default)",
      border: "1px solid var(--cortex-border-accent)",
      "border-radius": "12px",
    }}>
      <PromptInputBlock {...props} style={{ width: "100%" }} />
    </div>
  </div>
);

export default CortexChatPanel;
