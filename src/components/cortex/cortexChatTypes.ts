export type ChatPanelState = "home" | "minimized" | "expanded";

export interface ChatMessage {
  id: string;
  type: "user" | "agent";
  content: string;
  timestamp?: Date;
  actions?: ChatAction[];
  isThinking?: boolean;
  progress?: ChatProgress[];
  toolCalls?: ChatToolCall[];
  codeBlocks?: { language: string; code: string }[];
}

export interface ChatAction {
  id: string;
  label: string;
  icon?: string;
  onClick?: () => void;
}

export interface ChatProgress {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "error";
}

export interface ChatToolCall {
  name: string;
  status: "running" | "completed" | "error";
  filesEdited?: number;
  onUndo?: () => void;
  onReview?: () => void;
}
