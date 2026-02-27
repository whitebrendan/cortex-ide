/**
 * MinimapSettings - Right-click context menu for minimap configuration.
 * Provides options to toggle minimap, change render mode, size mode, and side.
 */
import { createSignal, createEffect, onCleanup, Show, For, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useMinimapController } from "@/components/editor/MinimapController";
import { tokens } from "@/design-system/tokens";

export interface MinimapSettingsProps {
  position: { x: number; y: number };
  onClose: () => void;
}

interface MenuItem {
  label: string;
  value: string;
  group: string;
  checked: boolean;
  action: () => void;
}

const separatorStyle: JSX.CSSProperties = {
  height: "1px",
  background: tokens.colors.border.default,
  margin: "4px 0",
};

export function MinimapSettings(props: MinimapSettingsProps) {
  const controller = useMinimapController();
  const [hovered, setHovered] = createSignal<string | null>(null);
  let menuRef: HTMLDivElement | undefined;

  const settings = () => controller.minimapOptions();

  createEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) props.onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onEsc);
    }, 0);
    onCleanup(() => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    });
  });

  const items = (): MenuItem[] => {
    const s = settings();
    return [
      { label: "Toggle Minimap", value: "toggle", group: "toggle", checked: s.enabled, action: () => controller.toggleMinimap() },
      { label: "Render Characters", value: "characters", group: "render", checked: s.renderCharacters, action: () => controller.setRenderMode(true) },
      { label: "Render Blocks", value: "blocks", group: "render", checked: !s.renderCharacters, action: () => controller.setRenderMode(false) },
      { label: "Proportional", value: "proportional", group: "size", checked: s.size === "proportional", action: () => controller.setSizeMode("proportional") },
      { label: "Fill", value: "fill", group: "size", checked: s.size === "fill", action: () => controller.setSizeMode("fill") },
      { label: "Fit", value: "fit", group: "size", checked: s.size === "fit", action: () => controller.setSizeMode("fit") },
      { label: "Side: Right", value: "right", group: "side", checked: s.side === "right", action: () => controller.setSide("right") },
      { label: "Side: Left", value: "left", group: "side", checked: s.side === "left", action: () => controller.setSide("left") },
    ];
  };

  const groups = () => {
    const all = items();
    const order = ["toggle", "render", "size", "side"];
    return order.map((g) => all.filter((i) => i.group === g));
  };

  const menuPos = (): JSX.CSSProperties => {
    const pad = 8;
    const w = 220;
    const h = 300;
    const x = props.position.x + w > window.innerWidth - pad ? window.innerWidth - w - pad : props.position.x;
    const y = props.position.y + h > window.innerHeight - pad ? window.innerHeight - h - pad : props.position.y;
    return {
      position: "fixed",
      left: `${Math.max(pad, x)}px`,
      top: `${Math.max(pad, y)}px`,
      "min-width": "200px",
      background: tokens.colors.surface.elevated,
      border: `1px solid ${tokens.colors.border.default}`,
      "border-radius": tokens.radius.md,
      "box-shadow": "0 4px 12px rgba(0,0,0,0.4)",
      padding: "4px 0",
      "z-index": "2600",
      "font-size": "13px",
      color: tokens.colors.text.primary,
    };
  };

  const indicator = (item: MenuItem): JSX.CSSProperties => {
    const isToggle = item.group === "toggle";
    return {
      width: "14px",
      height: "14px",
      "border-radius": isToggle ? tokens.radius.sm : tokens.radius.full,
      border: `2px solid ${item.checked ? tokens.colors.accent.primary : tokens.colors.text.muted}`,
      background: isToggle && item.checked ? tokens.colors.accent.primary : "transparent",
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      "flex-shrink": "0",
      "font-size": "10px",
      color: "#fff",
    };
  };

  const radioDot: JSX.CSSProperties = {
    width: "6px",
    height: "6px",
    "border-radius": tokens.radius.full,
    background: tokens.colors.accent.primary,
  };

  return (
    <Portal>
      <div ref={menuRef} style={menuPos()}>
        <For each={groups()}>
          {(group, idx) => (
            <>
              <Show when={idx() > 0}>
                <div style={separatorStyle} />
              </Show>
              <For each={group}>
                {(item) => (
                  <div
                    class="flex items-center gap-2 cursor-pointer select-none"
                    style={{
                      padding: "6px 12px",
                      background: hovered() === item.value ? tokens.colors.surface.hover : "transparent",
                      transition: "background 0.1s",
                      "font-size": "12px",
                    }}
                    onMouseEnter={() => setHovered(item.value)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => item.action()}
                  >
                    <div style={indicator(item)}>
                      <Show when={item.checked && item.group === "toggle"}>✓</Show>
                      <Show when={item.checked && item.group !== "toggle"}>
                        <div style={radioDot} />
                      </Show>
                    </div>
                    <span>{item.label}</span>
                  </div>
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </Portal>
  );
}

export default MinimapSettings;
