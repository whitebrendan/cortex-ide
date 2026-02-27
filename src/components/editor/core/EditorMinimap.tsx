import { createEffect, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type * as Monaco from "monaco-editor";
import { useMinimapController } from "@/components/editor/MinimapController";

interface EditorMinimapProps {
  editor: Accessor<Monaco.editor.IStandaloneCodeEditor | null>;
  monaco: Accessor<typeof Monaco | null>;
}

export function EditorMinimap(props: EditorMinimapProps) {
  const { minimapOptions, toggleMinimap } = useMinimapController();

  createEffect(() => {
    const editor = props.editor();
    if (!editor) return;

    const opts = minimapOptions();
    editor.updateOptions({
      minimap: {
        enabled: opts.enabled,
        side: opts.side,
        showSlider: opts.showSlider,
        renderCharacters: opts.renderCharacters,
        maxColumn: opts.maxColumn,
        scale: opts.scale,
        size: opts.size,
      },
    });
  });

  createEffect(() => {
    const editor = props.editor();
    const monaco = props.monaco();
    if (!editor || !monaco) return;

    const handleToggleMinimap = () => {
      toggleMinimap();
    };

    window.addEventListener("editor:toggle-minimap", handleToggleMinimap);

    onCleanup(() => {
      window.removeEventListener("editor:toggle-minimap", handleToggleMinimap);
    });
  });

  return null;
}
