import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from "solid-js";
import { Icon } from "@/components/ui/Icon";
import { useAccessibility, type FontScale } from "@/context/AccessibilityContext";

interface KeyboardShortcut {
  keys: string;
  description: string;
  category: string;
}

type TabId = "shortcuts" | "screenReader" | "navigation" | "settings";

interface HelpSection {
  id: TabId;
  title: string;
  icon: string;
}

interface ShortcutGroup {
  category: string;
  shortcuts: KeyboardShortcut[];
}

const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { keys: "Ctrl+Shift+P", description: "Open Command Palette", category: "General" },
  { keys: "Ctrl+P", description: "Quick Open / Go to File", category: "General" },
  { keys: "Ctrl+,", description: "Open Settings", category: "General" },
  { keys: "Ctrl+N", description: "New Session", category: "General" },
  { keys: "F1", description: "Show Accessibility Help", category: "General" },
  { keys: "Ctrl+Shift+?", description: "Show Accessibility Help", category: "General" },
  { keys: "Ctrl+G", description: "Go to Line", category: "Navigation" },
  { keys: "F12", description: "Go to Definition", category: "Navigation" },
  { keys: "Shift+F12", description: "Go to References", category: "Navigation" },
  { keys: "Ctrl+-", description: "Navigate Back", category: "Navigation" },
  { keys: "Ctrl+Shift+-", description: "Navigate Forward", category: "Navigation" },
  { keys: "Ctrl+Tab", description: "Switch Tabs", category: "Navigation" },
  { keys: "Alt+1-9", description: "Focus Nth Tab", category: "Navigation" },
  { keys: "Ctrl+F", description: "Find in File", category: "Editor" },
  { keys: "Ctrl+H", description: "Find and Replace", category: "Editor" },
  { keys: "Ctrl+Shift+F", description: "Find in Project", category: "Editor" },
  { keys: "Ctrl+Z", description: "Undo", category: "Editor" },
  { keys: "Ctrl+Shift+Z", description: "Redo", category: "Editor" },
  { keys: "Ctrl+X", description: "Cut Line/Selection", category: "Editor" },
  { keys: "Ctrl+C", description: "Copy Line/Selection", category: "Editor" },
  { keys: "Ctrl+V", description: "Paste", category: "Editor" },
  { keys: "Ctrl+/", description: "Toggle Comment", category: "Editor" },
  { keys: "Alt+Up", description: "Move Line Up", category: "Editor" },
  { keys: "Alt+Down", description: "Move Line Down", category: "Editor" },
  { keys: "Ctrl+D", description: "Add Selection to Next Match", category: "Editor" },
  { keys: "Ctrl+Shift+L", description: "Select All Occurrences", category: "Editor" },
  { keys: "Ctrl+B", description: "Toggle Sidebar", category: "View" },
  { keys: "Ctrl+`", description: "Toggle Terminal", category: "View" },
  { keys: "Ctrl+Shift+M", description: "Toggle Problems Panel", category: "View" },
  { keys: "Ctrl+=", description: "Zoom In", category: "View" },
  { keys: "Ctrl+-", description: "Zoom Out", category: "View" },
  { keys: "Ctrl+\\", description: "Split Editor", category: "View" },
  { keys: "F5", description: "Start/Continue Debugging", category: "Debug" },
  { keys: "Shift+F5", description: "Stop Debugging", category: "Debug" },
  { keys: "F9", description: "Toggle Breakpoint", category: "Debug" },
  { keys: "F10", description: "Step Over", category: "Debug" },
  { keys: "F11", description: "Step Into", category: "Debug" },
  { keys: "Shift+F11", description: "Step Out", category: "Debug" },
  { keys: "Ctrl+S", description: "Save File", category: "File" },
  { keys: "Ctrl+Shift+S", description: "Save All", category: "File" },
  { keys: "Ctrl+W", description: "Close Editor", category: "File" },
  { keys: "Ctrl+Shift+T", description: "Reopen Closed Editor", category: "File" },
  { keys: "Tab", description: "Move to Next Focusable Element", category: "Accessibility" },
  { keys: "Shift+Tab", description: "Move to Previous Focusable Element", category: "Accessibility" },
  { keys: "Enter/Space", description: "Activate Focused Button/Link", category: "Accessibility" },
  { keys: "Escape", description: "Close Dialog/Cancel", category: "Accessibility" },
  { keys: "Arrow Keys", description: "Navigate Within Components", category: "Accessibility" },
];

const SCREEN_READER_TIPS = [
  {
    title: "Navigation Landmarks",
    tips: [
      "Use your screen reader's landmark navigation (for example, D in NVDA) to jump between regions.",
      "The main content area uses the main landmark.",
      "The sidebar uses a complementary landmark.",
      "The activity bar uses a navigation landmark.",
    ],
  },
  {
    title: "Headings Structure",
    tips: [
      "Use heading navigation to browse the document structure.",
      "Panel titles are exposed as headings.",
      "File names in tabs are announced through accessible labels.",
    ],
  },
  {
    title: "Interactive Elements",
    tips: [
      "Buttons and links expose accessible names.",
      "Form inputs are paired with labels or descriptions.",
      "Status changes are announced through live regions.",
      "Loading states are announced automatically.",
    ],
  },
  {
    title: "Editor Navigation",
    tips: [
      "Line numbers are announced while moving through code.",
      "Syntax errors and warnings are surfaced to assistive technology.",
      "Use Ctrl+G to jump to a specific line.",
      "Use Ctrl+Shift+O to navigate symbols quickly.",
    ],
  },
  {
    title: "Announcements",
    tips: [
      "File saves, errors, and completions are announced.",
      "Debug events such as breakpoint hits are announced.",
      "Task completions trigger live-region updates.",
      "Audio signals can provide additional feedback when enabled.",
    ],
  },
];

const NAVIGATION_HELP = [
  {
    area: "Application Window",
    instructions: [
      "Press Tab to move through the main areas: Activity Bar → Sidebar → Editor → Panel.",
      "Press Escape to close an open dialog or popup.",
      "Use Ctrl+1, Ctrl+2, and Ctrl+3 to focus editor groups.",
      "Press F6 to cycle between major window sections.",
    ],
  },
  {
    area: "File Explorer",
    instructions: [
      "Use Arrow Up and Arrow Down to move between files and folders.",
      "Press Enter to open files or expand and collapse folders.",
      "Press Right Arrow to expand a folder.",
      "Press Left Arrow to collapse a folder or move to the parent item.",
      "Type to filter files by name.",
    ],
  },
  {
    area: "Editor",
    instructions: [
      "Use Ctrl+Tab to switch between open files.",
      "Press Ctrl+\\ to split the editor.",
      "Use Alt+Click for multiple cursors.",
      "Press Ctrl+L to select the current line.",
      "Use Ctrl+Shift+[ and Ctrl+Shift+] to fold or unfold code.",
    ],
  },
  {
    area: "Terminal",
    instructions: [
      "Press Ctrl+` to toggle terminal visibility.",
      "Use Ctrl+Shift+` to create a new terminal.",
      "Press Ctrl+PageUp or Ctrl+PageDown to switch terminals.",
      "Standard shell navigation is supported inside the terminal.",
    ],
  },
  {
    area: "Dialogs & Popups",
    instructions: [
      "Tab moves between interactive elements.",
      "Enter confirms or submits.",
      "Escape closes the current dialog without taking action.",
      "Arrow keys navigate lists, menus, and tab sets.",
    ],
  },
];

const HELP_SECTIONS: HelpSection[] = [
  { id: "shortcuts", title: "Keyboard Shortcuts", icon: "command" },
  { id: "screenReader", title: "Screen Reader Tips", icon: "desktop" },
  { id: "navigation", title: "Navigation Help", icon: "location-arrow" },
  { id: "settings", title: "Accessibility Settings", icon: "gear" },
];

const CATEGORY_ORDER = [
  "General",
  "Navigation",
  "Editor",
  "View",
  "Debug",
  "File",
  "Accessibility",
] as const;

function getFocusableElements(container?: HTMLElement): HTMLElement[] {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

interface SettingToggleProps {
  icon: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function SettingToggle(props: SettingToggleProps) {
  const labelId = createUniqueId();
  const descriptionId = createUniqueId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.enabled}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      class="flex w-full items-center justify-between gap-4 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-white/5"
      style={{
        background: "var(--surface-base)",
        border: "1px solid var(--border-weak)",
      }}
      onClick={props.onToggle}
    >
      <div class="flex items-start gap-3 min-w-0">
        <span style={{ color: "var(--accent)" }} aria-hidden="true">
          <Icon name={props.icon} size={16} />
        </span>
        <div class="min-w-0">
          <div id={labelId} class="text-sm font-medium" style={{ color: "var(--text-base)" }}>
            {props.title}
          </div>
          <div id={descriptionId} class="text-xs" style={{ color: "var(--text-weak)" }}>
            {props.description}
          </div>
        </div>
      </div>
      <span
        class="relative h-5 w-10 rounded-full transition-colors"
        style={{ background: props.enabled ? "var(--accent)" : "var(--border-weak)" }}
        aria-hidden="true"
      >
        <span
          class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: props.enabled ? "translateX(22px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  );
}

export function AccessibilityHelp() {
  const accessibility = useAccessibility();
  const [isOpen, setIsOpen] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<TabId>("shortcuts");
  const [searchQuery, setSearchQuery] = createSignal("");
  const baseId = createUniqueId();
  const searchInputId = `${baseId}-shortcut-search`;
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  let dialogRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;
  let previousFocusedElement: HTMLElement | null = null;
  const tabRefs: Partial<Record<TabId, HTMLButtonElement | undefined>> = {};

  const groupedShortcuts = createMemo<ShortcutGroup[]>(() => {
    const query = searchQuery().trim().toLowerCase();
    const filtered = query
      ? KEYBOARD_SHORTCUTS.filter(
          (shortcut) =>
            shortcut.description.toLowerCase().includes(query) ||
            shortcut.keys.toLowerCase().includes(query) ||
            shortcut.category.toLowerCase().includes(query)
        )
      : KEYBOARD_SHORTCUTS;

    const grouped = new Map<string, KeyboardShortcut[]>();
    for (const shortcut of filtered) {
      const existing = grouped.get(shortcut.category) ?? [];
      grouped.set(shortcut.category, [...existing, shortcut]);
    }

    return CATEGORY_ORDER.flatMap((category) => {
      const shortcuts = grouped.get(category);
      return shortcuts ? [{ category, shortcuts }] : [];
    });
  });

  const shortcutCount = createMemo(() =>
    groupedShortcuts().reduce((total, group) => total + group.shortcuts.length, 0)
  );

  const openDialog = (tab: TabId = "shortcuts") => {
    if (!isOpen()) {
      const activeElement = document.activeElement;
      previousFocusedElement = activeElement instanceof HTMLElement ? activeElement : null;
    }
    setActiveTab(tab);
    setIsOpen(true);
  };

  const closeDialog = (restoreFocus = true) => {
    setIsOpen(false);
    setSearchQuery("");

    if (restoreFocus) {
      const target = previousFocusedElement;
      requestAnimationFrame(() => target?.focus());
    }

    previousFocusedElement = null;
  };

  const focusTab = (tab: TabId) => {
    requestAnimationFrame(() => tabRefs[tab]?.focus());
  };

  const selectTab = (tab: TabId, focus = false) => {
    setActiveTab(tab);
    if (focus) {
      focusTab(tab);
    }
  };

  const handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === "F1") {
      event.preventDefault();
      openDialog("shortcuts");
      return;
    }

    if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.key === "?") {
      event.preventDefault();
      openDialog("shortcuts");
      return;
    }

    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      closeDialog();
    }
  };

  const handleDialogKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (event.key !== "Tab" || !accessibility.state.focusTrapEnabled) {
      return;
    }

    const focusable = getFocusableElements(dialogRef);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleTabKeydown = (event: KeyboardEvent, currentTab: TabId) => {
    const currentIndex = HELP_SECTIONS.findIndex((section) => section.id === currentTab);
    if (currentIndex < 0) return;

    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        const next = HELP_SECTIONS[(currentIndex + 1) % HELP_SECTIONS.length].id;
        selectTab(next, true);
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        const next = HELP_SECTIONS[(currentIndex - 1 + HELP_SECTIONS.length) % HELP_SECTIONS.length].id;
        selectTab(next, true);
        break;
      }
      case "Home":
        event.preventDefault();
        selectTab(HELP_SECTIONS[0].id, true);
        break;
      case "End":
        event.preventDefault();
        selectTab(HELP_SECTIONS[HELP_SECTIONS.length - 1].id, true);
        break;
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleGlobalKeydown);
    });
  });

  createEffect(() => {
    if (!isOpen()) return;

    requestAnimationFrame(() => searchInputRef?.focus());
    accessibility.announceToScreenReader(
      "Accessibility Help dialog opened. Use Tab to navigate, arrow keys to switch sections, and Escape to close."
    );
  });

  const renderShortcutsTab = () => (
    <div class="space-y-4">
      <div class="space-y-2">
        <label for={searchInputId} class="sr-only">
          Search keyboard shortcuts
        </label>
        <input
          ref={searchInputRef}
          id={searchInputId}
          type="text"
          placeholder="Search shortcuts..."
          value={searchQuery()}
          onInput={(event) => setSearchQuery(event.currentTarget.value)}
          aria-describedby={`${searchInputId}-summary`}
          class="w-full rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--surface-base)",
            color: "var(--text-base)",
            border: "1px solid var(--border-weak)",
          }}
        />
        <p id={`${searchInputId}-summary`} class="text-xs" style={{ color: "var(--text-weak)" }} aria-live="polite">
          {shortcutCount() === 0
            ? `No shortcuts found matching “${searchQuery()}”.`
            : `Showing ${shortcutCount()} shortcut${shortcutCount() === 1 ? "" : "s"} in ${groupedShortcuts().length} section${groupedShortcuts().length === 1 ? "" : "s"}.`}
        </p>
      </div>

      <Show
        when={groupedShortcuts().length > 0}
        fallback={
          <div class="rounded-lg px-3 py-6 text-center text-sm" style={{ color: "var(--text-weak)", background: "var(--surface-base)" }}>
            No shortcuts found matching “{searchQuery()}”.
          </div>
        }
      >
        <div class="max-h-[400px] space-y-4 overflow-y-auto pr-2">
          <For each={groupedShortcuts()}>
            {(group) => (
              <section>
                <h3
                  class="mb-2 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider"
                  style={{
                    color: "var(--text-weak)",
                    background: "var(--background-base)",
                  }}
                >
                  {group.category}
                </h3>
                <ul role="list" class="space-y-1">
                  <For each={group.shortcuts}>
                    {(shortcut) => (
                      <li
                        class="flex items-center justify-between gap-3 rounded px-2 py-1.5"
                        style={{ background: "var(--surface-base)" }}
                      >
                        <span class="text-sm" style={{ color: "var(--text-base)" }}>
                          {shortcut.description}
                        </span>
                        <kbd
                          class="rounded px-2 py-1 text-xs font-mono"
                          style={{
                            background: "var(--background-base)",
                            color: "var(--text-weak)",
                            border: "1px solid var(--border-weak)",
                          }}
                        >
                          {shortcut.keys}
                        </kbd>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );

  const renderScreenReaderTab = () => (
    <div class="max-h-[450px] space-y-4 overflow-y-auto pr-2">
      <For each={SCREEN_READER_TIPS}>
        {(section) => (
          <section>
            <h3
              class="mb-2 rounded px-2 py-1.5 text-sm font-semibold"
              style={{
                color: "var(--text-base)",
                background: "var(--surface-base)",
              }}
            >
              {section.title}
            </h3>
            <ul class="space-y-1 pl-4" role="list">
              <For each={section.tips}>
                {(tip) => (
                  <li class="flex items-start gap-2 py-1 text-sm" style={{ color: "var(--text-weak)" }}>
                    <span style={{ color: "var(--accent)" }} aria-hidden="true">
                      •
                    </span>
                    <span>{tip}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );

  const renderNavigationTab = () => (
    <div class="max-h-[450px] space-y-4 overflow-y-auto pr-2">
      <For each={NAVIGATION_HELP}>
        {(area) => (
          <section>
            <h3
              class="mb-2 flex items-center gap-2 rounded px-2 py-1.5 text-sm font-semibold"
              style={{
                color: "var(--text-base)",
                background: "var(--surface-base)",
              }}
            >
              <Icon name="location-arrow" size={14} style={{ color: "var(--accent)" }} />
              {area.area}
            </h3>
            <ul class="space-y-1 pl-4" role="list">
              <For each={area.instructions}>
                {(instruction) => (
                  <li class="flex items-start gap-2 py-1 text-sm" style={{ color: "var(--text-weak)" }}>
                    <span style={{ color: "var(--accent)" }} aria-hidden="true">
                      →
                    </span>
                    <span>{instruction}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );

  const renderSettingsTab = () => (
    <div class="max-h-[450px] space-y-4 overflow-y-auto pr-2">
      <SettingToggle
        icon="desktop"
        title="Screen Reader Mode"
        description="Enhance ARIA attributes and enable automatic announcements."
        enabled={accessibility.screenReaderMode()}
        onToggle={accessibility.toggleScreenReaderMode}
      />
      <SettingToggle
        icon="eye"
        title="High Contrast Mode"
        description="Increase visual contrast for better visibility."
        enabled={accessibility.highContrastMode()}
        onToggle={accessibility.toggleHighContrast}
      />
      <SettingToggle
        icon="bolt"
        title="Reduced Motion"
        description="Minimize animations and transitions."
        enabled={accessibility.reducedMotion()}
        onToggle={accessibility.toggleReducedMotion}
      />
      <SettingToggle
        icon="volume-high"
        title="Audio Signals"
        description="Play sounds for errors, warnings, and completions."
        enabled={accessibility.audioSignalsEnabled()}
        onToggle={accessibility.toggleAudioSignals}
      />

      <div
        class="space-y-3 rounded-lg border p-3"
        style={{
          background: "var(--surface-base)",
          border: "1px solid var(--border-weak)",
        }}
      >
        <div class="flex items-center gap-3">
          <Icon name="font" size={16} style={{ color: "var(--accent)" }} />
          <div>
            <div class="text-sm font-medium" style={{ color: "var(--text-base)" }}>
              Font Size
            </div>
            <div class="text-xs" style={{ color: "var(--text-weak)" }}>
              Scale text throughout the application.
            </div>
          </div>
        </div>
        <label class="sr-only" for={`${baseId}-font-scale`}>
          Font size scale
        </label>
        <select
          id={`${baseId}-font-scale`}
          class="w-full rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--background-base)",
            color: "var(--text-base)",
            border: "1px solid var(--border-weak)",
          }}
          value={String(accessibility.fontScale())}
          onChange={(event) =>
            accessibility.setFontScale(parseFloat(event.currentTarget.value) as FontScale)
          }
        >
          <For each={[0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5] as const}>
            {(scale) => <option value={scale}>{Math.round(scale * 100)}%</option>}
          </For>
        </select>
      </div>

      <div class="pt-2">
        <button
          type="button"
          onClick={accessibility.resetToDefaults}
          class="w-full rounded-md border px-4 py-2 text-sm transition-colors hover:bg-white/5"
          style={{
            background: "var(--surface-raised)",
            color: "var(--text-base)",
            border: "1px solid var(--border-weak)",
          }}
        >
          Reset All Settings to Defaults
        </button>
      </div>
    </div>
  );

  return (
    <Show when={isOpen()}>
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={() => closeDialog()}
        role="presentation"
      >
        <div class="absolute inset-0 bg-black/50" />

        <div
          ref={dialogRef}
          class="relative mx-4 w-full max-w-2xl overflow-hidden rounded-lg shadow-2xl"
          style={{ background: "var(--surface-raised)" }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleDialogKeydown}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <div
            class="border-b px-4 py-3"
            style={{ "border-color": "var(--border-weak)" }}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3">
                <Icon name="circle-question" size={20} style={{ color: "var(--accent)" }} />
                <div>
                  <h2 id={titleId} class="text-lg font-semibold" style={{ color: "var(--text-base)" }}>
                    Accessibility Help
                  </h2>
                  <p id={descriptionId} class="mt-1 text-sm" style={{ color: "var(--text-weak)" }}>
                    Browse keyboard shortcuts, screen-reader tips, navigation guidance, and quick accessibility settings.
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <kbd
                  class="rounded px-1.5 py-0.5 text-xs"
                  style={{
                    background: "var(--background-base)",
                    color: "var(--text-weak)",
                  }}
                >
                  Esc
                </kbd>
                <button
                  type="button"
                  onClick={() => closeDialog()}
                  class="rounded-md p-1.5 transition-colors hover:bg-white/10"
                  style={{ color: "var(--text-weak)" }}
                  aria-label="Close accessibility help"
                >
                  <Icon name="xmark" size={18} />
                </button>
              </div>
            </div>
          </div>

          <div
            class="flex border-b px-4"
            style={{ "border-color": "var(--border-weak)" }}
            role="tablist"
            aria-label="Accessibility help sections"
          >
            <For each={HELP_SECTIONS}>
              {(section) => {
                const selected = () => activeTab() === section.id;
                const tabId = `${baseId}-${section.id}-tab`;
                const panelId = `${baseId}-${section.id}-panel`;

                return (
                  <button
                    ref={(element) => {
                      tabRefs[section.id] = element;
                    }}
                    type="button"
                    role="tab"
                    id={tabId}
                    aria-selected={selected()}
                    aria-controls={panelId}
                    tabIndex={selected() ? 0 : -1}
                    class="relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors"
                    style={{ color: selected() ? "var(--accent)" : "var(--text-weak)" }}
                    onClick={() => selectTab(section.id)}
                    onKeyDown={(event) => handleTabKeydown(event, section.id)}
                  >
                    <Icon name={section.icon} size={16} />
                    <span class="hidden sm:inline">{section.title}</span>
                    <Show when={selected()}>
                      <span
                        class="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ background: "var(--accent)" }}
                        aria-hidden="true"
                      />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>

          <div class="p-4" style={{ background: "var(--surface-base)" }}>
            <div
              role="tabpanel"
              id={`${baseId}-shortcuts-panel`}
              aria-labelledby={`${baseId}-shortcuts-tab`}
              hidden={activeTab() !== "shortcuts"}
            >
              <Show when={activeTab() === "shortcuts"}>{renderShortcutsTab()}</Show>
            </div>
            <div
              role="tabpanel"
              id={`${baseId}-screenReader-panel`}
              aria-labelledby={`${baseId}-screenReader-tab`}
              hidden={activeTab() !== "screenReader"}
            >
              <Show when={activeTab() === "screenReader"}>{renderScreenReaderTab()}</Show>
            </div>
            <div
              role="tabpanel"
              id={`${baseId}-navigation-panel`}
              aria-labelledby={`${baseId}-navigation-tab`}
              hidden={activeTab() !== "navigation"}
            >
              <Show when={activeTab() === "navigation"}>{renderNavigationTab()}</Show>
            </div>
            <div
              role="tabpanel"
              id={`${baseId}-settings-panel`}
              aria-labelledby={`${baseId}-settings-tab`}
              hidden={activeTab() !== "settings"}
            >
              <Show when={activeTab() === "settings"}>{renderSettingsTab()}</Show>
            </div>
          </div>

          <div
            class="flex items-center justify-between gap-4 border-t px-4 py-3"
            style={{
              "border-color": "var(--border-weak)",
              background: "var(--surface-raised)",
            }}
          >
            <span class="text-xs" style={{ color: "var(--text-weak)" }}>
              Press <kbd class="rounded px-1.5 py-0.5" style={{ background: "var(--background-base)" }}>F1</kbd> or <kbd class="rounded px-1.5 py-0.5" style={{ background: "var(--background-base)" }}>Ctrl+Shift+?</kbd> to open this help.
            </span>
            <a
              href="https://docs.cortex.ai/accessibility"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs underline"
              style={{ color: "var(--accent)" }}
            >
              Learn more about accessibility
            </a>
          </div>
        </div>
      </div>
    </Show>
  );
}

export function useAccessibilityHelpDialog() {
  const open = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1" }));
  };

  const close = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  };

  return { open, close };
}
