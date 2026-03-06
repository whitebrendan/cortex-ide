import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, within, cleanup } from "@solidjs/testing-library";
import { Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { SearchSidebar } from "../SearchSidebar";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/context/EditorContext", () => ({
  useEditor: () => ({
    openFile: vi.fn(),
    updateFileContent: vi.fn(),
    state: { openFiles: [] },
  }),
}));

vi.mock("@/context/SettingsContext", () => ({
  useSearchSettings: () => ({
    settings: () => ({ contextLines: 0 }),
  }),
  useZenModeSettings: () => ({
    settings: () => ({ showLineNumbers: true }),
  }),
}));

vi.mock("@/utils/tauri-api", () => ({
  fsReadFile: vi.fn(),
  fsWriteFile: vi.fn(),
}));

vi.mock("@/utils/workspace", () => ({
  getProjectPath: () => "/workspace/project",
}));

vi.mock("@/components/ui/Icon", () => ({
  Icon: () => null,
}));

vi.mock("@/components/cortex/primitives/CortexIcon", () => ({
  CortexIcon: () => null,
}));

vi.mock("@/components/cortex/primitives/CortexButton", () => ({
  CortexButton: (props: any) => (
    <button onClick={props.onClick}>{props.children}</button>
  ),
}));

vi.mock("@/components/cortex/primitives/CortexModal", () => ({
  CortexModal: (props: any) => (
    <Show when={props.open}>
      <div role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        <div>{props.children}</div>
        <Show when={props.showFooter}>
          <div>{props.footer}</div>
        </Show>
      </div>
    </Show>
  ),
}));

vi.mock("@/components/ui", () => ({
  SidebarHeader: (props: any) => <div>{props.children}</div>,
  Input: (props: any) => <input {...props} />,
  IconButton: (props: any) => (
    <button aria-label={props.tooltip} onClick={props.onClick} disabled={props.disabled}>{props.children}</button>
  ),
  Badge: (props: any) => <span>{props.children}</span>,
  Text: (props: any) => <span>{props.children}</span>,
  EmptyState: (props: any) => <div>{props.description}</div>,
  LoadingSpinner: () => <div>Loading</div>,
  Button: (props: any) => (
    <button onClick={props.onClick} disabled={props.disabled}>{props.children}</button>
  ),
}));

vi.mock("@/lib/ui-kit", () => ({
  ui: {
    icon: {},
    scrollY: {},
    spaceBetween: {},
    flexCenter: {},
  },
  mergeStyles: (...styles: Array<Record<string, unknown> | undefined>) => Object.assign({}, ...styles.filter(Boolean)),
}));

vi.mock("@/design-system/tokens", () => ({
  tokens: {
    spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "20px" },
    radius: { sm: "4px", md: "8px", lg: "12px" },
    colors: {
      bg: { primary: "#111", secondary: "#222", tertiary: "#333", overlay: "rgba(0,0,0,0.5)" },
      surface: { panel: "#1f1f1f", canvas: "#161616" },
      text: { primary: "#fff", secondary: "#ddd", muted: "#999", inverse: "#000" },
      border: { default: "#444", divider: "#555" },
      interactive: { hover: "#666", active: "#777", selected: "#888" },
      semantic: { error: "#f00", success: "#0f0", warning: "#ff0", primary: "#09f" },
      accent: { primary: "#09f", muted: "#0af" },
      icon: { default: "#bbb" },
    },
    typography: { fontSize: { sm: "12px", md: "14px" } },
    shadows: {},
    transitions: { fast: "all 0.1s linear" },
  },
}));

describe("SearchSidebar replace-all normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("shows the normalized query in the mounted Replace All confirmation for padded input", async () => {
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === "fs_search_content") {
        return Promise.resolve({
          results: [
            {
              file: "/workspace/project/src/main.ts",
              matches: [
                { line: 10, column: 5, text: "const test = 1;", matchStart: 6, matchEnd: 10 },
                { line: 20, column: 3, text: "let test = 2;", matchStart: 4, matchEnd: 8 },
              ],
            },
          ],
          totalMatches: 2,
          filesSearched: 1,
        });
      }

      if (command === "search_replace_all") {
        return Promise.resolve(2);
      }

      return Promise.resolve(undefined);
    });

    render(() => <SearchSidebar />);

    const searchInput = screen.getByRole("textbox", { name: "Search in files" });
    await fireEvent.input(searchInput, { target: { value: "  test  " } });
    await fireEvent.keyDown(searchInput, { key: "Enter" });

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "fs_search_content",
        expect.objectContaining({ query: "test" })
      );
    });

    const replaceInput = screen.getByRole("textbox", { name: "Replace" });
    await fireEvent.input(replaceInput, { target: { value: "updated" } });

    await fireEvent.click(screen.getByRole("button", { name: "Replace All (2 occurrences)" }));

    await vi.waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Replace All" })).toBeTruthy();
    });
    const dialog = screen.getByRole("dialog", { name: "Replace All" });
    expect(dialog.textContent).toContain('"test" → "updated"');

    await fireEvent.click(within(dialog).getByRole("button", { name: "Replace All" }));

    expect(invoke).toHaveBeenCalledWith(
      "search_replace_all",
      expect.objectContaining({
        results: [
          expect.objectContaining({
            uri: "/workspace/project/src/main.ts",
          }),
        ],
        replaceText: "updated",
        useRegex: false,
        preserveCase: false,
      })
    );
  });
});
