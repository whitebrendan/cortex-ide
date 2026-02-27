import type { Suggestion } from "../TerminalSuggest";
import type { TerminalInstanceManager } from "./TerminalInstanceManager";

export function handleSuggestionSelect(
  suggestion: Suggestion,
  activeTerminalId: string | undefined,
  manager: TerminalInstanceManager,
  writeToTerminal: (id: string, data: string) => Promise<void>,
  closeSuggestions: () => void,
): void {
  if (!activeTerminalId) return;
  const currentBuffer = manager.getInputBuffer(activeTerminalId);
  const insertText = suggestion.insertText || suggestion.text;
  let deleteCount = 0;
  let textToInsert = "";
  if (suggestion.type === "history") {
    deleteCount = currentBuffer.length;
    textToInsert = insertText;
  } else if (suggestion.type === "arg" || suggestion.type === "file" || suggestion.type === "directory") {
    const parts = currentBuffer.split(/\s+/);
    deleteCount = (parts[parts.length - 1] || "").length;
    textToInsert = insertText;
  } else if (suggestion.type === "git" && insertText.startsWith("git ")) {
    deleteCount = currentBuffer.length;
    textToInsert = insertText;
  } else if (currentBuffer.includes(" ")) {
    deleteCount = currentBuffer.slice(currentBuffer.lastIndexOf(" ") + 1).length;
    textToInsert = insertText;
  } else {
    deleteCount = currentBuffer.length;
    textToInsert = insertText;
  }
  const backspaces = "\b".repeat(deleteCount);
  const clearChars = " ".repeat(deleteCount);
  const backspaces2 = "\b".repeat(deleteCount);
  writeToTerminal(activeTerminalId, backspaces + clearChars + backspaces2 + textToInsert).catch(console.error);
  let newBuffer: string;
  if (suggestion.type === "history" || (suggestion.type === "git" && insertText.startsWith("git "))) {
    newBuffer = insertText;
  } else if (currentBuffer.includes(" ")) {
    newBuffer = currentBuffer.slice(0, currentBuffer.lastIndexOf(" ") + 1) + insertText;
  } else {
    newBuffer = insertText;
  }
  manager.setInputBufferValue(activeTerminalId, newBuffer);
  closeSuggestions();
}
