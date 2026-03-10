import { Component, For, JSX, createMemo, createUniqueId } from "solid-js";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import {
  useAccessibility,
  type AudioSignalType,
  type FocusIndicatorStyle,
  type FontScale,
} from "@/context/AccessibilityContext";

export interface AccessibilitySettingsProps {
  class?: string;
  style?: JSX.CSSProperties;
}

const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: 0.8, label: "80%" },
  { value: 0.9, label: "90%" },
  { value: 1.0, label: "100%" },
  { value: 1.1, label: "110%" },
  { value: 1.2, label: "120%" },
  { value: 1.3, label: "130%" },
  { value: 1.4, label: "140%" },
  { value: 1.5, label: "150%" },
];

const FOCUS_STYLES: { value: FocusIndicatorStyle; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "high-visibility", label: "High Visibility" },
  { value: "custom", label: "Custom" },
];

const AUDIO_SIGNALS: { type: AudioSignalType; label: string; icon: string }[] = [
  { type: "error", label: "Errors", icon: "circle-xmark" },
  { type: "warning", label: "Warnings", icon: "triangle-exclamation" },
  { type: "success", label: "Success", icon: "circle-check" },
  { type: "breakpointHit", label: "Breakpoint Hit", icon: "circle-dot" },
  { type: "taskComplete", label: "Task Complete", icon: "check" },
  { type: "notification", label: "Notifications", icon: "bell" },
];

const ARIA_AUDIT_ITEMS = [
  { name: "Editor", status: "complete" as const },
  { name: "Terminal", status: "complete" as const },
  { name: "File Explorer", status: "complete" as const },
  { name: "Activity Bar", status: "complete" as const },
  { name: "Status Bar", status: "complete" as const },
  { name: "Chat Panel", status: "partial" as const },
  { name: "Settings", status: "complete" as const },
  { name: "Debug Panel", status: "partial" as const },
];

const CARD_STYLE: JSX.CSSProperties = {
  background: "var(--cortex-bg-secondary)",
  border: "1px solid var(--cortex-border-default)",
  "border-radius": "var(--cortex-radius-md)",
};

const SECTION_STYLE: JSX.CSSProperties = {
  display: "flex",
  "flex-direction": "column",
  gap: "12px",
};

const SECTION_TITLE_STYLE: JSX.CSSProperties = {
  "font-size": "14px",
  "font-weight": "600",
  color: "var(--cortex-text-primary)",
};

const SECTION_DESC_STYLE: JSX.CSSProperties = {
  "font-size": "12px",
  color: "var(--cortex-text-muted)",
};

const LABEL_STYLE: JSX.CSSProperties = {
  "font-size": "13px",
  color: "var(--cortex-text-primary)",
  "font-weight": "500",
};

const SUPPORT_TEXT_STYLE: JSX.CSSProperties = {
  "font-size": "11px",
  color: "var(--cortex-text-muted)",
};

const SELECT_STYLE: JSX.CSSProperties = {
  padding: "8px 12px",
  "font-size": "12px",
  background: "var(--cortex-bg-secondary)",
  border: "1px solid var(--cortex-border-default)",
  "border-radius": "var(--cortex-radius-sm)",
  color: "var(--cortex-text-primary)",
  cursor: "pointer",
};

const SLIDER_STYLE_BASE: JSX.CSSProperties = {
  width: "100%",
  height: "4px",
  "border-radius": "2px",
  cursor: "pointer",
  "-webkit-appearance": "none",
  appearance: "none",
};

function controlRowStyle(disabled?: boolean): JSX.CSSProperties {
  return {
    display: "flex",
    "align-items": "center",
    "justify-content": "space-between",
    gap: "16px",
    width: "100%",
    padding: "12px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? "0.6" : "1",
    ...CARD_STYLE,
  };
}

function switchTrackStyle(checked: boolean, disabled?: boolean): JSX.CSSProperties {
  return {
    width: "36px",
    height: "20px",
    "border-radius": "10px",
    background: checked
      ? "var(--cortex-accent-primary)"
      : "var(--cortex-bg-active)",
    position: "relative",
    transition: "background var(--cortex-transition-fast)",
    "flex-shrink": "0",
    opacity: disabled ? "0.8" : "1",
  };
}

function switchKnobStyle(checked: boolean): JSX.CSSProperties {
  return {
    position: "absolute",
    top: "2px",
    left: checked ? "18px" : "2px",
    width: "16px",
    height: "16px",
    "border-radius": "50%",
    background: "white",
    transition: "left var(--cortex-transition-fast)",
  };
}

function checkboxIndicatorStyle(checked: boolean): JSX.CSSProperties {
  return {
    width: "16px",
    height: "16px",
    "border-radius": "var(--cortex-radius-sm)",
    border: `1px solid ${checked ? "var(--cortex-accent-primary)" : "var(--cortex-border-default)"}`,
    background: checked ? "var(--cortex-accent-primary)" : "transparent",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    "flex-shrink": "0",
  };
}

function fieldCardStyle(): JSX.CSSProperties {
  return {
    display: "flex",
    gap: "12px",
    padding: "12px",
    "align-items": "flex-start",
    ...CARD_STYLE,
  };
}

function sectionCardStyle(): JSX.CSSProperties {
  return {
    padding: "12px",
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
    ...CARD_STYLE,
  };
}

interface ToggleCardProps {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ToggleCard(props: ToggleCardProps) {
  const labelId = createUniqueId();
  const descriptionId = createUniqueId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      disabled={props.disabled}
      style={controlRowStyle(props.disabled)}
      onClick={() => {
        if (!props.disabled) {
          props.onToggle();
        }
      }}
    >
      <div style={{ display: "flex", "align-items": "flex-start", gap: "12px", flex: "1", "text-align": "left" }}>
        <Icon name={props.icon} size={16} style={{ color: "var(--cortex-text-muted)" }} />
        <div style={{ display: "flex", "flex-direction": "column", gap: "4px", flex: "1", "min-width": "0" }}>
          <span id={labelId} style={LABEL_STYLE}>
            {props.title}
          </span>
          <span id={descriptionId} style={SUPPORT_TEXT_STYLE}>
            {props.description}
          </span>
        </div>
      </div>

      <span style={switchTrackStyle(props.checked, props.disabled)} aria-hidden="true">
        <span style={switchKnobStyle(props.checked)} />
      </span>
    </button>
  );
}

interface CheckboxCardProps {
  icon: string;
  title: string;
  checked: boolean;
  onToggle: () => void;
}

function CheckboxCard(props: CheckboxCardProps) {
  const labelId = createUniqueId();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-labelledby={labelId}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "8px 12px",
        width: "100%",
        cursor: "pointer",
        background: "var(--cortex-bg-primary)",
        "border-radius": "var(--cortex-radius-sm)",
      }}
      onClick={props.onToggle}
    >
      <span style={checkboxIndicatorStyle(props.checked)} aria-hidden="true">
        {props.checked && <Icon name="check" size={10} style={{ color: "white" }} />}
      </span>
      <Icon name={props.icon} size={12} style={{ color: "var(--cortex-text-muted)" }} />
      <span id={labelId} style={{ "font-size": "12px", color: "var(--cortex-text-primary)" }}>
        {props.title}
      </span>
    </button>
  );
}

export const AccessibilitySettings: Component<AccessibilitySettingsProps> = (props) => {
  const accessibility = useAccessibility();
  const fontScaleSelectId = createUniqueId();
  const focusIndicatorSelectId = createUniqueId();
  const volumeSliderId = createUniqueId();

  const containerStyle = (): JSX.CSSProperties => ({
    display: "flex",
    "flex-direction": "column",
    gap: "24px",
    padding: "24px",
    background: "var(--cortex-bg-primary)",
    ...props.style,
  });

  const volumePercentage = createMemo(() => Math.round(accessibility.audioVolume() * 100));

  const systemIntegrationItems = createMemo(() => [
    `System prefers reduced motion: ${accessibility.systemPrefersReducedMotion() ? "Yes" : "No"}`,
    `High contrast auto-detection is ${accessibility.highContrastMode() ? "active" : "inactive"}`,
  ]);

  return (
    <div class={props.class} style={containerStyle()}>
      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-visual-title">
        <h2 id="accessibility-settings-visual-title" style={SECTION_TITLE_STYLE}>
          Visual Settings
        </h2>
        <ToggleCard
          icon="eye"
          title="Screen Reader Mode"
          description="Optimize Cortex for screen readers with enhanced ARIA and announcements."
          checked={accessibility.screenReaderMode()}
          onToggle={accessibility.toggleScreenReaderMode}
        />
        <ToggleCard
          icon="circle-half-stroke"
          title="High Contrast Mode"
          description="Increase contrast for better visibility across the workspace."
          checked={accessibility.highContrastMode()}
          onToggle={accessibility.toggleHighContrast}
        />
        <ToggleCard
          icon="pause"
          title="Reduced Motion"
          description="Minimize animations and transitions throughout the interface."
          checked={accessibility.reducedMotion()}
          onToggle={accessibility.toggleReducedMotion}
        />
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-font-title">
        <h2 id="accessibility-settings-font-title" style={SECTION_TITLE_STYLE}>
          Font Size
        </h2>
        <div style={fieldCardStyle()}>
          <Icon name="text-size" size={16} style={{ color: "var(--cortex-text-muted)" }} />
          <div style={{ display: "flex", "flex-direction": "column", gap: "8px", flex: "1" }}>
            <label for={fontScaleSelectId} style={LABEL_STYLE}>
              Application font scale
            </label>
            <span id={`${fontScaleSelectId}-hint`} style={SUPPORT_TEXT_STYLE}>
              Scale text throughout the application interface.
            </span>
            <select
              id={fontScaleSelectId}
              style={SELECT_STYLE}
              value={String(accessibility.fontScale())}
              aria-describedby={`${fontScaleSelectId}-hint`}
              onChange={(event) =>
                accessibility.setFontScale(
                  parseFloat(event.currentTarget.value) as FontScale
                )
              }
            >
              <For each={FONT_SCALES}>
                {(scale) => <option value={scale.value}>{scale.label}</option>}
              </For>
            </select>
          </div>
        </div>
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-focus-title">
        <h2 id="accessibility-settings-focus-title" style={SECTION_TITLE_STYLE}>
          Focus Indicator
        </h2>
        <div style={fieldCardStyle()}>
          <Icon name="crosshairs" size={16} style={{ color: "var(--cortex-text-muted)" }} />
          <div style={{ display: "flex", "flex-direction": "column", gap: "8px", flex: "1" }}>
            <label for={focusIndicatorSelectId} style={LABEL_STYLE}>
              Focus indicator style
            </label>
            <span id={`${focusIndicatorSelectId}-hint`} style={SUPPORT_TEXT_STYLE}>
              Choose how focused controls are highlighted.
            </span>
            <select
              id={focusIndicatorSelectId}
              style={SELECT_STYLE}
              value={accessibility.focusIndicatorStyle()}
              aria-describedby={`${focusIndicatorSelectId}-hint`}
              onChange={(event) =>
                accessibility.setFocusIndicatorStyle(
                  event.currentTarget.value as FocusIndicatorStyle
                )
              }
            >
              <For each={FOCUS_STYLES}>
                {(style) => <option value={style.value}>{style.label}</option>}
              </For>
            </select>
          </div>
        </div>
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-audio-title">
        <h2 id="accessibility-settings-audio-title" style={SECTION_TITLE_STYLE}>
          Audio Signals
        </h2>
        <p style={SECTION_DESC_STYLE}>Play sounds for various events.</p>
        <ToggleCard
          icon="volume-high"
          title="Enable Audio Signals"
          description="Play sounds for errors, warnings, success states, and notifications."
          checked={accessibility.audioSignalsEnabled()}
          onToggle={accessibility.toggleAudioSignals}
        />

        <div style={fieldCardStyle()}>
          <Icon name="volume-low" size={14} style={{ color: "var(--cortex-text-muted)" }} />
          <div style={{ display: "flex", "flex-direction": "column", gap: "8px", flex: "1" }}>
            <label for={volumeSliderId} style={LABEL_STYLE}>
              Audio signal volume
            </label>
            <span id={`${volumeSliderId}-hint`} style={SUPPORT_TEXT_STYLE}>
              {accessibility.audioSignalsEnabled()
                ? "Adjust the playback volume for audio accessibility cues."
                : "Enable audio signals to adjust the playback volume."}
            </span>
            <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
              <input
                id={volumeSliderId}
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={String(accessibility.audioVolume())}
                disabled={!accessibility.audioSignalsEnabled()}
                aria-describedby={`${volumeSliderId}-hint`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={volumePercentage()}
                aria-valuetext={`${volumePercentage()}%`}
                style={{
                  ...SLIDER_STYLE_BASE,
                  background: "var(--cortex-bg-active)",
                  opacity: accessibility.audioSignalsEnabled() ? "1" : "0.5",
                }}
                onInput={(event) =>
                  accessibility.setAudioVolume(parseFloat(event.currentTarget.value))
                }
              />
              <span
                aria-live="polite"
                style={{
                  "font-size": "11px",
                  color: "var(--cortex-text-muted)",
                  width: "32px",
                  "text-align": "right",
                }}
              >
                {volumePercentage()}%
              </span>
            </div>
          </div>
          <Icon name="volume-high" size={14} style={{ color: "var(--cortex-text-muted)" }} />
        </div>

        <div style={sectionCardStyle()}>
          <span style={LABEL_STYLE}>Individual audio cues</span>
          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }} role="group" aria-label="Individual audio signal settings">
            <For each={AUDIO_SIGNALS}>
              {(signal) => (
                <CheckboxCard
                  icon={signal.icon}
                  title={signal.label}
                  checked={accessibility.state.audioSignals[signal.type]}
                  onToggle={() =>
                    accessibility.setAudioSignalEnabled(
                      signal.type,
                      !accessibility.state.audioSignals[signal.type]
                    )
                  }
                />
              )}
            </For>
          </div>
        </div>
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-keyboard-title">
        <h2 id="accessibility-settings-keyboard-title" style={SECTION_TITLE_STYLE}>
          Keyboard
        </h2>
        <ToggleCard
          icon="keyboard"
          title="Show Keyboard Hints"
          description="Display keyboard shortcuts on UI elements when they are available."
          checked={accessibility.keyboardHintsVisible()}
          onToggle={accessibility.toggleKeyboardHints}
        />
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-monaco-title">
        <h2 id="accessibility-settings-monaco-title" style={SECTION_TITLE_STYLE}>
          Monaco Editor Accessibility
        </h2>
        <p style={SECTION_DESC_STYLE}>Configure Monaco editor accessibility support.</p>
        <ToggleCard
          icon="code"
          title="Editor Screen Reader Support"
          description="Set Monaco accessibilitySupport to 'on' when using a screen reader."
          checked={accessibility.screenReaderMode()}
          onToggle={accessibility.toggleScreenReaderMode}
        />
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-system-title">
        <h2 id="accessibility-settings-system-title" style={SECTION_TITLE_STYLE}>
          System Integration
        </h2>
        <div style={sectionCardStyle()}>
          <ul role="list" style={{ display: "flex", "flex-direction": "column", gap: "8px", margin: "0", padding: "0", "list-style": "none" }}>
            <For each={systemIntegrationItems()}>
              {(item) => (
                <li style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                  <Icon name="circle-info" size={14} style={{ color: "var(--cortex-text-muted)" }} />
                  <span style={{ "font-size": "12px", color: "var(--cortex-text-muted)" }}>
                    {item}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </section>

      <section style={SECTION_STYLE} aria-labelledby="accessibility-settings-aria-title">
        <h2 id="accessibility-settings-aria-title" style={SECTION_TITLE_STYLE}>
          ARIA Labels Audit
        </h2>
        <p style={SECTION_DESC_STYLE}>Status of ARIA label coverage across components.</p>
        <div style={sectionCardStyle()}>
          <ul role="list" style={{ display: "flex", "flex-direction": "column", gap: "6px", margin: "0", padding: "0", "list-style": "none" }}>
            <For each={ARIA_AUDIT_ITEMS}>
              {(item) => (
                <li
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    gap: "12px",
                  }}
                >
                  <span style={{ "font-size": "12px", color: "var(--cortex-text-primary)" }}>
                    {item.name}
                  </span>
                  <span
                    style={{
                      "font-size": "11px",
                      padding: "2px 8px",
                      "border-radius": "var(--cortex-radius-sm)",
                      background:
                        item.status === "complete"
                          ? "rgba(75, 210, 143, 0.15)"
                          : "rgba(255, 193, 7, 0.15)",
                      color:
                        item.status === "complete"
                          ? "rgb(75, 210, 143)"
                          : "rgb(255, 193, 7)",
                    }}
                  >
                    {item.status === "complete" ? "✓ Complete" : "◐ Partial"}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </section>

      <div style={{ display: "flex", gap: "8px" }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => accessibility.resetToDefaults()}
        >
          <Icon name="rotate-left" size={14} />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
};

export default AccessibilitySettings;
