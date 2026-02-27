import { Show, For, JSX } from "solid-js";
import { useSettings, type SettingsScope, type EditorSettings, type InlayHintsSettings } from "@/context/SettingsContext";
import { Toggle, SectionHeader } from "./FormComponents";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "../ui/Icon";
import { tokens } from '@/design-system/tokens';

interface EditorSettingsPanelProps {
  scope?: SettingsScope;
}

/** Row with workspace override indicator and modified from default indicator */
function SettingRowWithOverride(props: {
  label: string;
  settingKey: keyof EditorSettings;
  hasOverride: boolean;
  isModified?: boolean;
  onReset?: () => void;
  onResetToDefault?: () => void;
  children: JSX.Element;
}) {
  const isModifiedValue = () => props.isModified ?? false;
  return (
    <div 
      class="setting-item-contents group relative" 
      classList={{ 
        "is-configured": props.hasOverride,
        "is-modified": isModifiedValue() && !props.hasOverride
      }}
      style={{
        background: tokens.colors.surface.panel,
        "border-radius": tokens.radius.sm,
      }}
    >
      {/* Modified indicator - VS Code spec: 2px left border, 6px width, positioned at left: 5px */}
      <div class="setting-item-modified-indicator" />
      <div 
        style={{ 
          display: "flex", 
          "align-items": "center", 
          "justify-content": "space-between", 
          gap: "16px",
          padding: "12px 14px 18px" 
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <Text 
            variant="body" 
            weight="semibold" 
            style={{ color: tokens.colors.text.primary }}
          >
            {props.label}
          </Text>
          {/* Modified from default indicator dot */}
          <Show when={isModifiedValue() && !props.hasOverride}>
            <span 
              class="modified-indicator-dot"
              title="Modified from default"
              style={{
                width: "6px",
                height: "6px",
                "border-radius": "var(--cortex-radius-full)",
                background: "var(--jb-border-focus)",
                "flex-shrink": "0",
              }}
            />
          </Show>
        </div>
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          {props.children}
          {/* Reset to workspace/user setting button */}
          <Show when={props.hasOverride && props.onReset}>
            <button
              onClick={props.onReset}
              style={{ 
                padding: tokens.spacing.sm,
                "border-radius": tokens.radius.sm,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: tokens.colors.text.muted,
                opacity: "0",
                transition: "opacity 0.3s, color 0.2s, background 0.2s",
              }}
              class="group-hover:opacity-100"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.colors.interactive.hover;
                e.currentTarget.style.color = tokens.colors.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = tokens.colors.text.muted;
              }}
              title="Reset to user setting"
            >
              <Icon name="rotate-left" style={{ width: tokens.spacing.lg, height: tokens.spacing.lg }} />
            </button>
          </Show>
          {/* Reset to default button (when modified but not overridden) */}
          <Show when={isModifiedValue() && !props.hasOverride && props.onResetToDefault}>
            <button
              onClick={props.onResetToDefault}
              style={{
                padding: tokens.spacing.sm,
                "border-radius": tokens.radius.sm,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: tokens.colors.text.muted,
                transition: "color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.colors.interactive.hover;
                e.currentTarget.style.color = tokens.colors.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = tokens.colors.text.muted;
              }}
              title="Reset to default"
            >
              <Icon name="rotate-left" style={{ width: tokens.spacing.lg, height: tokens.spacing.lg }} />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function EditorSettingsPanel(props: EditorSettingsPanelProps) {
  const settings = useSettings();
  const scope = () => props.scope || "user";
  
  // Use effective settings for display, but update based on scope
  const editor = () => settings.effectiveSettings().editor;
  
  // Helper to update setting based on current scope
  const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    if (scope() === "workspace" && settings.hasWorkspace()) {
      settings.setWorkspaceSetting("editor", key, value);
    } else {
      settings.updateEditorSetting(key, value);
    }
  };

  // Check if setting has workspace override
  const hasOverride = (key: keyof EditorSettings) => settings.hasWorkspaceOverride("editor", key);
  
  // Check if setting is modified from default
  const isModified = (key: keyof EditorSettings) => settings.isSettingModified("editor", key);
  
  // Reset workspace override
  const resetOverride = (key: keyof EditorSettings) => {
    settings.resetWorkspaceSetting("editor", key);
  };
  
  // Reset setting to default value
  const resetToDefault = (key: keyof EditorSettings) => {
    settings.resetSettingToDefault("editor", key);
  };

  const fontFamilyOptions = [
    { value: "JetBrains Mono, Fira Code, Consolas, monospace", label: "JetBrains Mono" },
    { value: "Fira Code, Consolas, monospace", label: "Fira Code" },
    { value: "SF Mono, Monaco, Consolas, monospace", label: "SF Mono" },
    { value: "Cascadia Code, Consolas, monospace", label: "Cascadia Code" },
    { value: "Consolas, monospace", label: "Consolas" },
    { value: "Monaco, monospace", label: "Monaco" },
    { value: "Source Code Pro, monospace", label: "Source Code Pro" },
    { value: "Ubuntu Mono, monospace", label: "Ubuntu Mono" },
    { value: "monospace", label: "System Monospace" },
  ];

  const fontSizeOptions = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24].map(s => ({
    value: s.toString(),
    label: `${s}px`,
  }));

  const tabSizeOptions = [2, 4, 8].map(s => ({
    value: s.toString(),
    label: s.toString(),
  }));

  const lineHeightOptions = [1.0, 1.2, 1.4, 1.5, 1.6, 1.8, 2.0].map(s => ({
    value: s.toString(),
    label: s.toString(),
  }));

  const wordWrapOptions = [
    { value: "off", label: "Off" },
    { value: "on", label: "On" },
    { value: "wordWrapColumn", label: "Word Wrap Column" },
    { value: "bounded", label: "Bounded" },
  ];

  const lineNumbersOptions = [
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
    { value: "relative", label: "Relative" },
    { value: "interval", label: "Interval" },
  ];

  const cursorStyleOptions = [
    { value: "line", label: "Line" },
    { value: "block", label: "Block" },
    { value: "underline", label: "Underline" },
    { value: "line-thin", label: "Line Thin" },
    { value: "block-outline", label: "Block Outline" },
    { value: "underline-thin", label: "Underline Thin" },
  ];

  const cursorBlinkOptions = [
    { value: "blink", label: "Blink" },
    { value: "smooth", label: "Smooth" },
    { value: "phase", label: "Phase" },
    { value: "expand", label: "Expand" },
    { value: "solid", label: "Solid" },
  ];

  const renderWhitespaceOptions = [
    { value: "none", label: "None" },
    { value: "boundary", label: "Boundary" },
    { value: "selection", label: "Selection" },
    { value: "trailing", label: "Trailing" },
    { value: "all", label: "All" },
  ];

  const autoClosingBracketsOptions = [
    { value: "always", label: "Always" },
    { value: "languageDefined", label: "Language Defined" },
    { value: "beforeWhitespace", label: "Before Whitespace" },
    { value: "never", label: "Never" },
  ];

  const foldingControlsOptions = [
    { value: "always", label: "Always" },
    { value: "mouseover", label: "On Mouseover" },
    { value: "never", label: "Never" },
  ];

  // Inline select style helper with JetBrains design tokens
  const getSelectStyle = (hasOverrideFlag: boolean): JSX.CSSProperties => ({
    height: "var(--jb-input-height)",
    padding: "var(--jb-input-padding)",
    background: tokens.colors.surface.canvas,
    border: hasOverrideFlag 
      ? "1px solid var(--jb-border-focus)" 
      : `1px solid ${tokens.colors.border.default}`,
    "border-radius": "var(--jb-input-radius)",
    color: tokens.colors.text.primary,
    "font-family": "var(--jb-font-ui)",
    "font-size": "var(--jb-text-body-size)",
    cursor: "pointer",
    outline: "none",
    transition: "border-color var(--cortex-transition-fast)",
  });

  // Inline input style helper
  const getInputStyle = (hasOverrideFlag: boolean): JSX.CSSProperties => ({
    height: "var(--jb-input-height)",
    padding: "var(--jb-input-padding)",
    background: tokens.colors.surface.canvas,
    border: hasOverrideFlag 
      ? "1px solid var(--jb-border-focus)" 
      : `1px solid ${tokens.colors.border.default}`,
    "border-radius": "var(--jb-input-radius)",
    color: tokens.colors.text.primary,
    "font-family": "var(--jb-font-ui)",
    "font-size": "var(--jb-text-body-size)",
    outline: "none",
    transition: "border-color var(--cortex-transition-fast)",
  });

  return (
    <div 
      style={{ 
        display: "flex", 
        "flex-direction": "column", 
        gap: "24px",
        "max-height": "500px",
        "overflow-y": "auto",
        "padding-right": tokens.spacing.md,
        background: tokens.colors.surface.panel,
      }}
    >
      {/* Scope indicator */}
      <Show when={scope() === "workspace"}>
        <Badge variant="accent" style={{ 
          padding: `${tokens.spacing.md} ${tokens.spacing.lg}`, 
          "font-size": "var(--jb-text-muted-size)",
          "border-radius": "var(--jb-radius-lg)",
          "margin-bottom": "16px",
        }}>
          Editing workspace-specific editor settings. Changes apply only to this workspace.
        </Badge>
      </Show>

      {/* Font Settings */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Font" />
        <SettingRowWithOverride 
          label="Font Family" 
          settingKey="fontFamily"
          hasOverride={hasOverride("fontFamily")}
          isModified={isModified("fontFamily")}
          onReset={() => resetOverride("fontFamily")}
          onResetToDefault={() => resetToDefault("fontFamily")}
        >
          <select
            value={editor().fontFamily}
            onChange={(e) => updateSetting("fontFamily", e.currentTarget.value)}
            style={{ ...getSelectStyle(hasOverride("fontFamily")), width: "320px" }}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("fontFamily") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={fontFamilyOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Font Size" 
          settingKey="fontSize"
          hasOverride={hasOverride("fontSize")}
          isModified={isModified("fontSize")}
          onReset={() => resetOverride("fontSize")}
          onResetToDefault={() => resetToDefault("fontSize")}
        >
          <select
            value={editor().fontSize.toString()}
            onChange={(e) => updateSetting("fontSize", parseInt(e.currentTarget.value))}
            style={getSelectStyle(hasOverride("fontSize"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("fontSize") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={fontSizeOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Line Height" 
          settingKey="lineHeight"
          hasOverride={hasOverride("lineHeight")}
          isModified={isModified("lineHeight")}
          onReset={() => resetOverride("lineHeight")}
          onResetToDefault={() => resetToDefault("lineHeight")}
        >
          <select
            value={editor().lineHeight.toString()}
            onChange={(e) => updateSetting("lineHeight", parseFloat(e.currentTarget.value))}
            style={getSelectStyle(hasOverride("lineHeight"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("lineHeight") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={lineHeightOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Font Ligatures" 
          settingKey="fontLigatures"

          hasOverride={hasOverride("fontLigatures")}
          isModified={isModified("fontLigatures")}
          onReset={() => resetOverride("fontLigatures")}
          onResetToDefault={() => resetToDefault("fontLigatures")}
        >
          <input
            type="checkbox"
            checked={editor().fontLigatures}
            onChange={(e) => updateSetting("fontLigatures", e.currentTarget.checked)}
            style={{ width: "18px", height: "18px", cursor: "pointer" }}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Indentation */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Indentation" />
        <SettingRowWithOverride 
          label="Tab Size" 
          settingKey="tabSize"
          hasOverride={hasOverride("tabSize")}
          isModified={isModified("tabSize")}
          onReset={() => resetOverride("tabSize")}
          onResetToDefault={() => resetToDefault("tabSize")}
        >
          <select
            value={editor().tabSize.toString()}
            onChange={(e) => updateSetting("tabSize", parseInt(e.currentTarget.value))}
            style={getSelectStyle(hasOverride("tabSize"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("tabSize") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={tabSizeOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Insert Spaces" 
          settingKey="insertSpaces"
          hasOverride={hasOverride("insertSpaces")}
          isModified={isModified("insertSpaces")}
          onReset={() => resetOverride("insertSpaces")}
          onResetToDefault={() => resetToDefault("insertSpaces")}
        >
          <Toggle
            checked={editor().insertSpaces}
            onChange={(checked) => updateSetting("insertSpaces", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Auto Indent" 
          settingKey="autoIndent"
          hasOverride={hasOverride("autoIndent")}
          isModified={isModified("autoIndent")}
          onReset={() => resetOverride("autoIndent")}
          onResetToDefault={() => resetToDefault("autoIndent")}
        >
          <Toggle
            checked={editor().autoIndent}
            onChange={(checked) => updateSetting("autoIndent", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Display */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Display" />
        <SettingRowWithOverride 
          label="Word Wrap" 
          settingKey="wordWrap"
          hasOverride={hasOverride("wordWrap")}
          isModified={isModified("wordWrap")}
          onReset={() => resetOverride("wordWrap")}
          onResetToDefault={() => resetToDefault("wordWrap")}
        >
          <select
            value={editor().wordWrap}
            onChange={(e) => updateSetting("wordWrap", e.currentTarget.value as EditorSettings["wordWrap"])}
            style={getSelectStyle(hasOverride("wordWrap"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("wordWrap") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={wordWrapOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <Show when={editor().wordWrap === "wordWrapColumn" || editor().wordWrap === "bounded"}>
          <SettingRowWithOverride
            label="Word Wrap Column"
            settingKey="wordWrapColumn"
            hasOverride={hasOverride("wordWrapColumn")}
            isModified={isModified("wordWrapColumn")}
            onReset={() => resetOverride("wordWrapColumn")}
            onResetToDefault={() => resetToDefault("wordWrapColumn")}
          >
            <input
              type="number"
              min={1}
              max={500}
              value={editor().wordWrapColumn ?? 80}
              onChange={(e) => updateSetting("wordWrapColumn", parseInt(e.currentTarget.value) || 80)}
              style={getInputStyle(hasOverride("wordWrapColumn"))}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("wordWrapColumn") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            />
          </SettingRowWithOverride>
        </Show>
        <SettingRowWithOverride 
          label="Line Numbers" 
          settingKey="lineNumbers"
          hasOverride={hasOverride("lineNumbers")}
          isModified={isModified("lineNumbers")}
          onReset={() => resetOverride("lineNumbers")}
          onResetToDefault={() => resetToDefault("lineNumbers")}
        >
          <select
            value={editor().lineNumbers}
            onChange={(e) => updateSetting("lineNumbers", e.currentTarget.value as EditorSettings["lineNumbers"])}
            style={getSelectStyle(hasOverride("lineNumbers"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("lineNumbers") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={lineNumbersOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Render Whitespace" 
          settingKey="renderWhitespace"
          hasOverride={hasOverride("renderWhitespace")}
          isModified={isModified("renderWhitespace")}
          onReset={() => resetOverride("renderWhitespace")}
          onResetToDefault={() => resetToDefault("renderWhitespace")}
        >
          <select
            value={editor().renderWhitespace}
            onChange={(e) => updateSetting("renderWhitespace", e.currentTarget.value as EditorSettings["renderWhitespace"])}
            style={getSelectStyle(hasOverride("renderWhitespace"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("renderWhitespace") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={renderWhitespaceOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Render Control Characters" 
          settingKey="renderControlCharacters"
          hasOverride={hasOverride("renderControlCharacters")}
          isModified={isModified("renderControlCharacters")}
          onReset={() => resetOverride("renderControlCharacters")}
          onResetToDefault={() => resetToDefault("renderControlCharacters")}
        >
          <Toggle
            checked={editor().renderControlCharacters}
            onChange={(checked) => updateSetting("renderControlCharacters", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Minimap */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Minimap" />
        <SettingRowWithOverride 
          label="Enable Minimap" 
          settingKey="minimapEnabled"
          hasOverride={hasOverride("minimapEnabled")}
          isModified={isModified("minimapEnabled")}
          onReset={() => resetOverride("minimapEnabled")}
          onResetToDefault={() => resetToDefault("minimapEnabled")}
        >
          <Toggle
            checked={editor().minimapEnabled}
            onChange={(checked) => updateSetting("minimapEnabled", checked)}
          />
        </SettingRowWithOverride>
        <Show when={editor().minimapEnabled}>
          <SettingRowWithOverride
            label="Side"
            settingKey="minimapSide"
            hasOverride={hasOverride("minimapSide")}
            isModified={isModified("minimapSide")}
            onReset={() => resetOverride("minimapSide")}
            onResetToDefault={() => resetToDefault("minimapSide")}
          >
            <select
              value={editor().minimapSide}
              onChange={(e) => updateSetting("minimapSide", e.currentTarget.value as "right" | "left")}
              style={getSelectStyle(hasOverride("minimapSide"))}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("minimapSide") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </SettingRowWithOverride>
          <SettingRowWithOverride
            label="Show Slider"
            settingKey="minimapShowSlider"
            hasOverride={hasOverride("minimapShowSlider")}
            isModified={isModified("minimapShowSlider")}
            onReset={() => resetOverride("minimapShowSlider")}
            onResetToDefault={() => resetToDefault("minimapShowSlider")}
          >
            <select
              value={editor().minimapShowSlider}
              onChange={(e) => updateSetting("minimapShowSlider", e.currentTarget.value as "always" | "mouseover")}
              style={getSelectStyle(hasOverride("minimapShowSlider"))}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("minimapShowSlider") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            >
              <option value="always">Always</option>
              <option value="mouseover">On Mouseover</option>
            </select>
          </SettingRowWithOverride>
          <SettingRowWithOverride
            label="Render Characters"
            settingKey="minimapRenderCharacters"
            hasOverride={hasOverride("minimapRenderCharacters")}
            isModified={isModified("minimapRenderCharacters")}
            onReset={() => resetOverride("minimapRenderCharacters")}
            onResetToDefault={() => resetToDefault("minimapRenderCharacters")}
          >
            <Toggle
              checked={editor().minimapRenderCharacters}
              onChange={(checked) => updateSetting("minimapRenderCharacters", checked)}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride
            label="Max Column"
            settingKey="minimapMaxColumn"
            hasOverride={hasOverride("minimapMaxColumn")}
            isModified={isModified("minimapMaxColumn")}
            onReset={() => resetOverride("minimapMaxColumn")}
            onResetToDefault={() => resetToDefault("minimapMaxColumn")}
          >
            <input
              type="number"
              min="1"
              max="300"
              value={editor().minimapMaxColumn}
              onChange={(e) => updateSetting("minimapMaxColumn", parseInt(e.currentTarget.value) || 80)}
              style={{ ...getInputStyle(hasOverride("minimapMaxColumn")), width: "80px" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("minimapMaxColumn") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride
            label="Scale"
            settingKey="minimapScale"
            hasOverride={hasOverride("minimapScale")}
            isModified={isModified("minimapScale")}
            onReset={() => resetOverride("minimapScale")}
            onResetToDefault={() => resetToDefault("minimapScale")}
          >
            <select
              value={editor().minimapScale.toString()}
              onChange={(e) => updateSetting("minimapScale", parseFloat(e.currentTarget.value))}
              style={getSelectStyle(hasOverride("minimapScale"))}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("minimapScale") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            >
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
              <option value="2.5">2.5x</option>
              <option value="3">3x</option>
            </select>
          </SettingRowWithOverride>
        </Show>
      </Card>

      {/* Cursor */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Cursor" />
        <SettingRowWithOverride 
          label="Cursor Style" 
          settingKey="cursorStyle"
          hasOverride={hasOverride("cursorStyle")}
          isModified={isModified("cursorStyle")}
          onReset={() => resetOverride("cursorStyle")}
          onResetToDefault={() => resetToDefault("cursorStyle")}
        >
          <select
            value={editor().cursorStyle}
            onChange={(e) => updateSetting("cursorStyle", e.currentTarget.value as EditorSettings["cursorStyle"])}
            style={getSelectStyle(hasOverride("cursorStyle"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("cursorStyle") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={cursorStyleOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Cursor Blinking" 
          settingKey="cursorBlink"
          hasOverride={hasOverride("cursorBlink")}
          isModified={isModified("cursorBlink")}
          onReset={() => resetOverride("cursorBlink")}
          onResetToDefault={() => resetToDefault("cursorBlink")}
        >
          <select
            value={editor().cursorBlink}
            onChange={(e) => updateSetting("cursorBlink", e.currentTarget.value as EditorSettings["cursorBlink"])}
            style={getSelectStyle(hasOverride("cursorBlink"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("cursorBlink") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={cursorBlinkOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
      </Card>

      {/* Brackets */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Brackets" />
        <SettingRowWithOverride 
          label="Bracket Pair Colorization" 
          settingKey="bracketPairColorization"
          hasOverride={hasOverride("bracketPairColorization")}
          isModified={isModified("bracketPairColorization")}
          onReset={() => resetOverride("bracketPairColorization")}
          onResetToDefault={() => resetToDefault("bracketPairColorization")}
        >
          <Toggle
            checked={editor().bracketPairColorization}
            onChange={(checked) => updateSetting("bracketPairColorization", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Auto Closing Brackets" 
          settingKey="autoClosingBrackets"
          hasOverride={hasOverride("autoClosingBrackets")}
          isModified={isModified("autoClosingBrackets")}
          onReset={() => resetOverride("autoClosingBrackets")}
          onResetToDefault={() => resetToDefault("autoClosingBrackets")}
        >
          <select
            value={editor().autoClosingBrackets}
            onChange={(e) => updateSetting("autoClosingBrackets", e.currentTarget.value as EditorSettings["autoClosingBrackets"])}
            style={getSelectStyle(hasOverride("autoClosingBrackets"))}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("autoClosingBrackets") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          >
            <For each={autoClosingBracketsOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Bracket Pair Guides" 
          settingKey="guidesBracketPairs"
          hasOverride={hasOverride("guidesBracketPairs")}
          isModified={isModified("guidesBracketPairs")}
          onReset={() => resetOverride("guidesBracketPairs")}
          onResetToDefault={() => resetToDefault("guidesBracketPairs")}
        >
          <Toggle
            checked={editor().guidesBracketPairs}
            onChange={(checked) => updateSetting("guidesBracketPairs", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Formatting */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Formatting" />
        <SettingRowWithOverride 
          label="Format On Save" 
          settingKey="formatOnSave"
          hasOverride={hasOverride("formatOnSave")}
          isModified={isModified("formatOnSave")}
          onReset={() => resetOverride("formatOnSave")}
          onResetToDefault={() => resetToDefault("formatOnSave")}
        >
          <Toggle
            checked={editor().formatOnSave}
            onChange={(checked) => updateSetting("formatOnSave", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Format On Paste" 
          settingKey="formatOnPaste"
          hasOverride={hasOverride("formatOnPaste")}
          isModified={isModified("formatOnPaste")}
          onReset={() => resetOverride("formatOnPaste")}
          onResetToDefault={() => resetToDefault("formatOnPaste")}
        >
          <Toggle
            checked={editor().formatOnPaste}
            onChange={(checked) => updateSetting("formatOnPaste", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Folding */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Code Folding" />
        <SettingRowWithOverride 
          label="Enable Folding" 
          settingKey="foldingEnabled"
          hasOverride={hasOverride("foldingEnabled")}
          isModified={isModified("foldingEnabled")}
          onReset={() => resetOverride("foldingEnabled")}
          onResetToDefault={() => resetToDefault("foldingEnabled")}
        >
          <Toggle
            checked={editor().foldingEnabled}
            onChange={(checked) => updateSetting("foldingEnabled", checked)}
          />
        </SettingRowWithOverride>
        <Show when={editor().foldingEnabled}>
          <SettingRowWithOverride 
            label="Show Folding Controls" 
            settingKey="showFoldingControls"
            hasOverride={hasOverride("showFoldingControls")}
            isModified={isModified("showFoldingControls")}
            onReset={() => resetOverride("showFoldingControls")}
            onResetToDefault={() => resetToDefault("showFoldingControls")}
          >
            <select
              value={editor().showFoldingControls}
              onChange={(e) => updateSetting("showFoldingControls", e.currentTarget.value as EditorSettings["showFoldingControls"])}
              style={getSelectStyle(hasOverride("showFoldingControls"))}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("showFoldingControls") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            >
              <For each={foldingControlsOptions}>
                {(opt) => <option value={opt.value}>{opt.label}</option>}
              </For>
            </select>
          </SettingRowWithOverride>
        </Show>
      </Card>

      {/* Scrolling */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Scrolling" />
        <SettingRowWithOverride 
          label="Scroll Beyond Last Line" 
          settingKey="scrollBeyondLastLine"
          hasOverride={hasOverride("scrollBeyondLastLine")}
          isModified={isModified("scrollBeyondLastLine")}
          onReset={() => resetOverride("scrollBeyondLastLine")}
          onResetToDefault={() => resetToDefault("scrollBeyondLastLine")}
        >
          <Toggle
            checked={editor().scrollBeyondLastLine}
            onChange={(checked) => updateSetting("scrollBeyondLastLine", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Smooth Scrolling" 
          settingKey="smoothScrolling"
          hasOverride={hasOverride("smoothScrolling")}
          isModified={isModified("smoothScrolling")}
          onReset={() => resetOverride("smoothScrolling")}
          onResetToDefault={() => resetToDefault("smoothScrolling")}
        >
          <Toggle
            checked={editor().smoothScrolling}
            onChange={(checked) => updateSetting("smoothScrolling", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Mouse Wheel Zoom" 
          settingKey="mouseWheelZoom"
          hasOverride={hasOverride("mouseWheelZoom")}
          isModified={isModified("mouseWheelZoom")}
          onReset={() => resetOverride("mouseWheelZoom")}
          onResetToDefault={() => resetToDefault("mouseWheelZoom")}
        >
          <Toggle
            checked={editor().mouseWheelZoom}
            onChange={(checked) => updateSetting("mouseWheelZoom", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Guides */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Guides" />
        <SettingRowWithOverride 
          label="Indentation Guides" 
          settingKey="guidesIndentation"
          hasOverride={hasOverride("guidesIndentation")}
          isModified={isModified("guidesIndentation")}
          onReset={() => resetOverride("guidesIndentation")}
          onResetToDefault={() => resetToDefault("guidesIndentation")}
        >
          <Toggle
            checked={editor().guidesIndentation}
            onChange={(checked) => updateSetting("guidesIndentation", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Highlight Active Indent Guide" 
          settingKey="highlightActiveIndentGuide"
          hasOverride={hasOverride("highlightActiveIndentGuide")}
          isModified={isModified("highlightActiveIndentGuide")}
          onReset={() => resetOverride("highlightActiveIndentGuide")}
          onResetToDefault={() => resetToDefault("highlightActiveIndentGuide")}
        >
          <Toggle
            checked={editor().highlightActiveIndentGuide}
            onChange={(checked) => updateSetting("highlightActiveIndentGuide", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Advanced */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Advanced" />
        <SettingRowWithOverride 
          label="Linked Editing" 
          settingKey="linkedEditing"
          hasOverride={hasOverride("linkedEditing")}
          isModified={isModified("linkedEditing")}
          onReset={() => resetOverride("linkedEditing")}
          onResetToDefault={() => resetToDefault("linkedEditing")}
        >
          <Toggle
            checked={editor().linkedEditing}
            onChange={(checked) => updateSetting("linkedEditing", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Rename On Type" 
          settingKey="renameOnType"
          hasOverride={hasOverride("renameOnType")}
          isModified={isModified("renameOnType")}
          onReset={() => resetOverride("renameOnType")}
          onResetToDefault={() => resetToDefault("renameOnType")}
        >
          <Toggle
            checked={editor().renameOnType}
            onChange={(checked) => updateSetting("renameOnType", checked)}
          />
        </SettingRowWithOverride>
        <SettingRowWithOverride 
          label="Sticky Scroll" 
          settingKey="stickyScrollEnabled"
          hasOverride={hasOverride("stickyScrollEnabled")}
          isModified={isModified("stickyScrollEnabled")}
          onReset={() => resetOverride("stickyScrollEnabled")}
          onResetToDefault={() => resetToDefault("stickyScrollEnabled")}
        >
          <Toggle
            checked={editor().stickyScrollEnabled}
            onChange={(checked) => updateSetting("stickyScrollEnabled", checked)}
          />
        </SettingRowWithOverride>
      </Card>

      {/* Inlay Hints */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Inlay Hints" />
        <SettingRowWithOverride 
          label="Enable Inlay Hints" 
          settingKey={"inlayHints" as keyof EditorSettings}
          hasOverride={hasOverride("inlayHints")}
          isModified={isModified("inlayHints")}
          onReset={() => resetOverride("inlayHints")}
          onResetToDefault={() => resetToDefault("inlayHints")}
        >
          <Toggle
            checked={editor().inlayHints?.enabled ?? true}
            onChange={(checked) => {
              const current = editor().inlayHints ?? {} as InlayHintsSettings;
              updateSetting("inlayHints", { ...current, enabled: checked } as EditorSettings["inlayHints"]);
            }}
          />
        </SettingRowWithOverride>
        <Show when={editor().inlayHints?.enabled !== false}>
          <SettingRowWithOverride 
            label="Font Size" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <input
              type="number"
              min="0"
              max="32"
              value={editor().inlayHints?.fontSize ?? 0}
              onChange={(e) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, fontSize: parseInt(e.currentTarget.value) || 0 } as EditorSettings["inlayHints"]);
              }}
              style={{ ...getInputStyle(hasOverride("inlayHints")), width: "80px" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("inlayHints") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride 
            label="Font Family" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <input
              type="text"
              value={editor().inlayHints?.fontFamily ?? ""}
              placeholder="Inherit from editor"
              onChange={(e) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, fontFamily: e.currentTarget.value } as EditorSettings["inlayHints"]);
              }}
              style={{ ...getInputStyle(hasOverride("inlayHints")), width: "240px" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("inlayHints") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride 
            label="Show Types" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <Toggle
              checked={editor().inlayHints?.showTypes ?? true}
              onChange={(checked) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, showTypes: checked } as EditorSettings["inlayHints"]);
              }}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride 
            label="Show Parameter Names" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <Toggle
              checked={editor().inlayHints?.showParameterNames ?? true}
              onChange={(checked) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, showParameterNames: checked } as EditorSettings["inlayHints"]);
              }}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride 
            label="Show Return Types" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <Toggle
              checked={editor().inlayHints?.showReturnTypes ?? true}
              onChange={(checked) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, showReturnTypes: checked } as EditorSettings["inlayHints"]);
              }}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride 
            label="Max Length" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <input
              type="number"
              min="1"
              max="120"
              value={editor().inlayHints?.maxLength ?? 25}
              onChange={(e) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, maxLength: parseInt(e.currentTarget.value) || 25 } as EditorSettings["inlayHints"]);
              }}
              style={{ ...getInputStyle(hasOverride("inlayHints")), width: "80px" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
              onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("inlayHints") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
            />
          </SettingRowWithOverride>
          <SettingRowWithOverride 
            label="Padding" 
            settingKey={"inlayHints" as keyof EditorSettings}
            hasOverride={hasOverride("inlayHints")}
            onReset={() => resetOverride("inlayHints")}
          >
            <Toggle
              checked={editor().inlayHints?.padding ?? true}
              onChange={(checked) => {
                const current = editor().inlayHints ?? {} as InlayHintsSettings;
                updateSetting("inlayHints", { ...current, padding: checked } as EditorSettings["inlayHints"]);
              }}
            />
          </SettingRowWithOverride>
        </Show>
      </Card>

      {/* Performance */}
      <Card variant="outlined" padding="none">
        <SectionHeader title="Performance" />
        <SettingRowWithOverride 
          label="Large File Optimizations" 
          settingKey="largeFileOptimizations"
          hasOverride={hasOverride("largeFileOptimizations")}
          isModified={isModified("largeFileOptimizations")}
          onReset={() => resetOverride("largeFileOptimizations")}
          onResetToDefault={() => resetToDefault("largeFileOptimizations")}
        >
          <Toggle
            checked={editor().largeFileOptimizations ?? true}
            onChange={(checked) => updateSetting("largeFileOptimizations", checked)}
          />
        </SettingRowWithOverride>
        <Text 
          variant="muted" 
          size="xs" 
          style={{ 
            padding: `0 16px ${tokens.spacing.md}`, 
            "margin-top": `-${tokens.spacing.md}`,
            color: tokens.colors.text.muted,
          }}
        >
          When enabled, automatically disables minimap, folding, and bracket matching for large files to improve performance.
        </Text>
        <SettingRowWithOverride 
          label="Max Tokenization Line Length" 
          settingKey="maxTokenizationLineLength"
          hasOverride={hasOverride("maxTokenizationLineLength")}
          isModified={isModified("maxTokenizationLineLength")}
          onReset={() => resetOverride("maxTokenizationLineLength")}
          onResetToDefault={() => resetToDefault("maxTokenizationLineLength")}
        >
          <input
            type="number"
            min="1000"
            max="100000"
            step="1000"
            value={editor().maxTokenizationLineLength}
            onChange={(e) => updateSetting("maxTokenizationLineLength", parseInt(e.currentTarget.value) || 20000)}
            style={{ ...getInputStyle(hasOverride("maxTokenizationLineLength")), width: "96px" }}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--jb-border-focus)"}
            onBlur={(e) => e.currentTarget.style.borderColor = hasOverride("maxTokenizationLineLength") ? "var(--jb-border-focus)" : "var(--jb-border-default)"}
          />
        </SettingRowWithOverride>
        <Text 
          variant="muted" 
          size="xs" 
          style={{ 
            padding: `0 16px ${tokens.spacing.md}`, 
            "margin-top": `-${tokens.spacing.md}`,
            color: tokens.colors.text.muted,
          }}
        >
          Lines longer than this limit use simplified syntax highlighting for better performance. Default: 20000
        </Text>
      </Card>

      {/* Reset Button */}
      <div style={{ 
        "padding-top": "16px", 
        "border-top": `1px solid ${tokens.colors.border.default}`,
      }}>
        <Show 
          when={scope() === "user"}
          fallback={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Reset all workspace editor overrides
                const keys: (keyof EditorSettings)[] = [
                  "fontFamily", "fontSize", "lineHeight", "tabSize", "insertSpaces",
                  "autoIndent", "wordWrap", "lineNumbers", "renderWhitespace",
                  "minimapEnabled", "minimapWidth", "minimapSide", "minimapShowSlider",
                  "minimapRenderCharacters", "minimapMaxColumn", "minimapScale",
                  "cursorStyle", "cursorBlink", "bracketPairColorization",
                  "autoClosingBrackets", "guidesBracketPairs", "formatOnSave",
                  "formatOnPaste", "foldingEnabled", "showFoldingControls",
                  "scrollBeyondLastLine", "smoothScrolling", "mouseWheelZoom",
                  "guidesIndentation", "highlightActiveIndentGuide",
                  "linkedEditing", "renameOnType", "stickyScrollEnabled",
                  "largeFileOptimizations", "maxTokenizationLineLength"
                ];
                keys.forEach(key => {
                  if (hasOverride(key)) {
                    resetOverride(key);
                  }
                });
              }}
            >
              Reset All Workspace Editor Overrides
            </Button>
          }
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => settings.resetSection("editor")}
          >
            Reset Editor Settings to Defaults
          </Button>
        </Show>
      </div>
    </div>
  );
}

