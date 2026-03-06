/**
 * EditorArea - Main container for the editor tab bar + content area
 *
 * Renders EditorTabs at the top and the active file's editor below.
 * Shows WelcomeTab when no files are open. Integrates ConfirmDialog
 * for dirty file close confirmation.
 *
 * This component wraps the tab system and content display into a
 * single cohesive editor area that can be placed inside EditorPanel
 * or used standalone.
 */

import { Show, createSignal, createMemo, type JSX } from "solid-js";
import { useEditor } from "@/context/EditorContext";
import { CortexTokens } from "@/design-system/tokens/cortex-tokens";
import { EditorTabs } from "./EditorTabs";
import { WelcomeTab } from "./WelcomeTab";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export interface EditorAreaProps {
  groupId?: string;
  children?: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
}

export function EditorArea(props: EditorAreaProps) {
  const editor = useEditor();

  const [confirmState, setConfirmState] = createSignal<{
    open: boolean;
    fileId: string;
    fileName: string;
  }>({ open: false, fileId: "", fileName: "" });

  const hasOpenFiles = createMemo(() => editor.state.openFiles.length > 0);

  const handleFileClose = (fileId: string) => {
    const file = editor.state.openFiles.find((f) => f.id === fileId);
    if (!file) return;

    if (file.modified) {
      setConfirmState({ open: true, fileId: file.id, fileName: file.name });
    } else {
      editor.closeFile(fileId);
    }
  };

  const handleSave = async () => {
    const { fileId } = confirmState();
    await editor.saveFile(fileId);

    const file = editor.state.openFiles.find((openFile) => openFile.id === fileId);
    if (file && !file.modified) {
      editor.closeFile(fileId);
      setConfirmState({ open: false, fileId: "", fileName: "" });
    }
  };

  const handleDontSave = () => {
    const { fileId } = confirmState();
    editor.closeFile(fileId);
    setConfirmState({ open: false, fileId: "", fileName: "" });
  };

  const handleCancel = () => {
    setConfirmState({ open: false, fileId: "", fileName: "" });
  };

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    flex: "1",
    "min-height": "0",
    overflow: "hidden",
    background: CortexTokens.colors.bg.primary,
    ...props.style,
  });

  const contentStyle: JSX.CSSProperties = {
    display: "flex",
    flex: "1",
    "min-height": "0",
    overflow: "hidden",
  };

  return (
    <div class={props.class} style={containerStyle()}>
      <Show when={hasOpenFiles()}>
        <EditorTabs
          onFileClose={handleFileClose}
          groupId={props.groupId}
        />
      </Show>

      <div style={contentStyle}>
        <Show when={hasOpenFiles()} fallback={<WelcomeTab />}>
          {props.children}
        </Show>
      </div>

      <ConfirmDialog
        open={confirmState().open}
        fileName={confirmState().fileName}
        onSave={handleSave}
        onDontSave={handleDontSave}
        onCancel={handleCancel}
      />
    </div>
  );
}

export default EditorArea;
