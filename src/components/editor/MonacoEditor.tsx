/**
 * MonacoEditor — Reusable SolidJS wrapper around the Monaco editor.
 *
 * This is a lightweight, self-contained component that handles Monaco
 * initialisation, model management, and settings synchronisation.  It is
 * intentionally simpler than {@link CodeEditor} (which adds LSP providers,
 * debug overlays, peek widgets, etc.) so that it can be embedded wherever a
 * basic code editor is needed (e.g. settings previews, scratch pads, diff
 * inputs, extension contribution views).
 *
 * Usage:
 * ```tsx
 * <MonacoEditor
 *   value={code()}
 *   language="typescript"
 *   onChange={(v) => setCode(v)}
 * />
 * ```
 */

import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  mergeProps,
} from "solid-js";
import type { JSX } from "solid-js";
import type * as Monaco from "monaco-editor";
import { MonacoManager } from "@/utils/monacoManager";
import { useSettings } from "@/context/SettingsContext";
import { buildEditorOptions } from "@/lib/monaco-config";
import { resolveMonacoLanguage } from "@/lib/monaco-languages";

// ============================================================================
// Types
// ============================================================================

export interface MonacoEditorProps {
  /** Current editor content. */
  value?: string;
  /** Language identifier (app-level, e.g. `"typescript"`, `"rust"`). */
  language?: string;
  /** File path — used for Monaco model URI deduplication. */
  filePath?: string;
  /** Whether the editor is read-only. */
  readOnly?: boolean;
  /** Additional Monaco editor options (merged on top of defaults). */
  options?: Monaco.editor.IStandaloneEditorConstructionOptions;
  /** Called when the editor content changes. */
  onChange?: (value: string) => void;
  /** Called when the user triggers save (Ctrl/Cmd+S). */
  onSave?: (value: string) => void;
  /** Called once the editor instance is ready. */
  onMount?: (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => void;
  /** Extra CSS class applied to the container `<div>`. */
  class?: string;
  /** Inline styles for the container `<div>`. */
  style?: JSX.CSSProperties | string;
}

// ============================================================================
// Component
// ============================================================================

export function MonacoEditor(inProps: MonacoEditorProps) {
  const props = mergeProps(
    {
      value: "",
      language: "plaintext",
      readOnly: false,
    } as const,
    inProps,
  );

  const { getEffectiveEditorSettings } = useSettings();

  let containerRef: HTMLDivElement | undefined;
  let editorRef: Monaco.editor.IStandaloneCodeEditor | null = null;
  let monacoRef: typeof Monaco | null = null;
  const [isReady, setIsReady] = createSignal(false);
  let isUpdatingFromProp = false;
  let changeDisposable: Monaco.IDisposable | null = null;
  let saveDisposable: Monaco.IDisposable | null = null;

  const monacoManager = MonacoManager.getInstance();

  // --------------------------------------------------------------------------
  // Initialisation
  // --------------------------------------------------------------------------

  onMount(async () => {
    if (!containerRef) return;

    try {
      const monaco = await monacoManager.ensureLoaded();
      monacoRef = monaco;

      const monacoLang = resolveMonacoLanguage(props.language);
      const settings = getEffectiveEditorSettings(monacoLang);
      const baseOptions = buildEditorOptions(settings, {
        readOnly: props.readOnly,
        ...props.options,
      });

      const modelUri = props.filePath
        ? monaco.Uri.parse(`file://${props.filePath}`)
        : undefined;

      let model: Monaco.editor.ITextModel | null = null;
      if (modelUri) {
        model = monaco.editor.getModel(modelUri);
      }
      if (!model) {
        model = monaco.editor.createModel(
          props.value,
          monacoLang,
          modelUri,
        );
      }

      editorRef = monaco.editor.create(containerRef, {
        ...baseOptions,
        model,
      });

      // Wire up content-change listener
      changeDisposable = editorRef.onDidChangeModelContent(() => {
        if (isUpdatingFromProp) return;
        const newValue = editorRef?.getModel()?.getValue() ?? "";
        props.onChange?.(newValue);
      });

      // Wire up Ctrl/Cmd+S
      saveDisposable = editorRef.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          const value = editorRef?.getModel()?.getValue() ?? "";
          props.onSave?.(value);
        },
      ) as unknown as Monaco.IDisposable;

      setIsReady(true);
      props.onMount?.(editorRef, monaco);
    } catch (err) {
      console.error("[MonacoEditor] Failed to initialise Monaco:", err);
    }
  });

  // --------------------------------------------------------------------------
  // Reactive updates
  // --------------------------------------------------------------------------

  // Sync external value → editor model
  createEffect(() => {
    if (!isReady() || !editorRef) return;
    const current = editorRef.getModel()?.getValue() ?? "";
    if (props.value !== current) {
      isUpdatingFromProp = true;
      editorRef.getModel()?.setValue(props.value);
      isUpdatingFromProp = false;
    }
  });

  // Sync language changes
  createEffect(() => {
    if (!isReady() || !editorRef || !monacoRef) return;
    const monacoLang = resolveMonacoLanguage(props.language);
    const model = editorRef.getModel();
    if (model) {
      monacoRef.editor.setModelLanguage(model, monacoLang);
    }
  });

  // Sync readOnly changes
  createEffect(() => {
    if (!isReady() || !editorRef) return;
    editorRef.updateOptions({ readOnly: props.readOnly });
  });

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  onCleanup(() => {
    changeDisposable?.dispose();
    if (saveDisposable && typeof (saveDisposable as Monaco.IDisposable).dispose === "function") {
      (saveDisposable as Monaco.IDisposable).dispose();
    }

    if (editorRef) {
      const model = editorRef.getModel();
      editorRef.dispose();
      // Only dispose the model if we created it (no filePath = ephemeral)
      if (!props.filePath && model) {
        model.dispose();
      }
      editorRef = null;
    }
  });

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div
      ref={(el) => {
        containerRef = el;
      }}
      class={props.class}
      style={
        typeof props.style === "string"
          ? props.style
          : {
              width: "100%",
              height: "100%",
              overflow: "hidden",
              ...(props.style as JSX.CSSProperties | undefined),
            }
      }
    />
  );
}

export default MonacoEditor;
