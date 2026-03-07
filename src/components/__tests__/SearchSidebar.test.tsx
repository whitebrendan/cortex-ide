import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, within, cleanup } from "@solidjs/testing-library";
import { Show } from "solid-js";
import { CommandProvider } from "@/context/CommandContext";
import { SearchSidebar } from "../SearchSidebar";

const hoisted = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockOpenFile: vi.fn(),
  mockUpdateFileContent: vi.fn(),
  mockFsReadFile: vi.fn(),
  mockFsWriteFile: vi.fn(),
  mockEditorState: {
    openFiles: [] as Array<{ id: string; path: string; modified?: boolean; content?: string; language?: string }>,
    activeFileId: null as string | null,
  },
}));

const {
  mockInvoke,
  mockOpenFile,
  mockEditorState,
} = hoisted;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: hoisted.mockInvoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@/context/ModalActiveContext", () => ({
  useModalActiveOptional: () => ({
    isModalActive: () => false,
  }),
}));

vi.mock("@/context/EditorContext", () => ({
  useEditor: () => ({
    openFile: hoisted.mockOpenFile,
    updateFileContent: hoisted.mockUpdateFileContent,
    state: hoisted.mockEditorState,
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
  fsReadFile: hoisted.mockFsReadFile,
  fsWriteFile: hoisted.mockFsWriteFile,
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
  SidebarHeader: (props: any) => (
    <div>
      <span>{props.title}</span>
      <div>{props.actions}</div>
      {props.children}
    </div>
  ),
  Input: (props: any) => <input {...props} />,
  IconButton: (props: any) => (
    <button
      aria-label={props["aria-label"] ?? props.tooltip}
      aria-pressed={props["aria-pressed"]}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
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
    panel: {},
    popup: {},
    row: {},
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
      search: { match: "#ff0" },
    },
    typography: { fontSize: { sm: "12px", md: "14px" } },
    shadows: {},
    transitions: { fast: "all 0.1s linear" },
  },
}));

const singleFileResponse = {
  results: [
    {
      file: "src/main.ts",
      matches: [
        { line: 10, column: 7, text: "const test = 1;", matchStart: 6, matchEnd: 10 },
        { line: 20, column: 5, text: "let test = 2;", matchStart: 4, matchEnd: 8 },
      ],
    },
  ],
  totalMatches: 2,
  filesSearched: 1,
};

const getSearchInput = () => screen.getByRole("textbox", { name: "Search in files" }) as HTMLInputElement;

const findButtonByText = (text: string) =>
  screen.getAllByRole("button").find((button) => button.textContent?.includes(text)) as HTMLButtonElement;

const renderSearchSidebar = () => render(() => <SearchSidebar />);

const renderSearchSidebarWithCommands = () =>
  render(() => (
    <CommandProvider>
      <SearchSidebar />
    </CommandProvider>
  ));

const runSearch = async (query: string) => {
  const input = getSearchInput();
  await fireEvent.input(input, { target: { value: query } });
  await fireEvent.keyDown(input, { key: "Enter" });
  return input;
};

describe("SearchSidebar", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    mockEditorState.openFiles = [];
    mockEditorState.activeFileId = null;
    mockOpenFile.mockResolvedValue(undefined);
    mockInvoke.mockImplementation((command: string, args?: { query?: string }) => {
      if (command === "vscode_get_command_palette_items") {
        return Promise.resolve([]);
      }

      if (command === "fs_search_content") {
        if (args?.query === "first") {
          return Promise.resolve({
            results: [
              { file: "src/alpha.ts", matches: [{ line: 4, column: 1, text: "alpha result", matchStart: 0, matchEnd: 5 }] },
              { file: "lib/beta.ts", matches: [{ line: 8, column: 1, text: "beta result", matchStart: 0, matchEnd: 4 }] },
            ],
            totalMatches: 2,
            filesSearched: 2,
          });
        }

        if (args?.query === "fresh") {
          return Promise.resolve({
            results: [
              { file: "src/gamma.ts", matches: [{ line: 12, column: 1, text: "gamma result", matchStart: 0, matchEnd: 5 }] },
            ],
            totalMatches: 1,
            filesSearched: 1,
          });
        }

        if (args?.query === "other") {
          return Promise.resolve({
            results: [
              { file: "src/other.ts", matches: [{ line: 15, column: 9, text: "const otherMatch = true;", matchStart: 6, matchEnd: 16 }] },
            ],
            totalMatches: 1,
            filesSearched: 1,
          });
        }

        return Promise.resolve(singleFileResponse);
      }

      if (command === "search_replace_all") {
        return Promise.resolve(2);
      }

      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
  });

  it("shows the normalized query in the mounted Replace All confirmation for padded input", async () => {
    renderSearchSidebar();

    await runSearch("  test  ");

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "fs_search_content",
        expect.objectContaining({ query: "test" }),
      );
    });

    const replaceInput = screen.getByRole("textbox", { name: "Replace" });
    await fireEvent.input(replaceInput, { target: { value: "updated" } });
    await fireEvent.click(screen.getByRole("button", { name: "Replace All (2 occurrences)" }));

    const dialog = await screen.findByRole("dialog", { name: "Replace All" });
    expect(dialog.textContent).toContain('"test" → "updated"');

    await fireEvent.click(within(dialog).getByRole("button", { name: "Replace All" }));

    expect(mockInvoke).toHaveBeenCalledWith(
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
      }),
    );
  });

  it("accepts and dismisses filter suggestions from the keyboard", async () => {
    renderSearchSidebar();

    const searchInput = getSearchInput();
    await fireEvent.input(searchInput, { target: { value: "@" } });

    await screen.findByRole("listbox", { name: "Search filters" });
    await fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    await fireEvent.keyDown(searchInput, { key: "Tab" });

    expect(searchInput.value).toBe("@ext:");
    expect(screen.queryByRole("listbox", { name: "Search filters" })).toBeNull();

    await fireEvent.input(searchInput, { target: { value: "@m" } });
    await screen.findByRole("listbox", { name: "Search filters" });
    await fireEvent.keyDown(searchInput, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Search filters" })).toBeNull();
  });

  it("keeps the filter suggestions flyout inside the viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 260 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 150 });

    renderSearchSidebar();

    const searchInput = getSearchInput();
    Object.defineProperty(searchInput, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 228,
        y: 118,
        left: 228,
        top: 118,
        right: 252,
        bottom: 138,
        width: 24,
        height: 20,
        toJSON: () => ({}),
      }),
    });

    await fireEvent.input(searchInput, { target: { value: "@" } });

    const flyout = await screen.findByRole("listbox", { name: "Search filters" });
    await new Promise((resolve) => setTimeout(resolve, 350));

    await vi.waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Search filters" })).toBe(flyout);
      expect(flyout.style.position).toBe("fixed");
      expect(Number.parseFloat(flyout.style.left)).toBeGreaterThanOrEqual(8);
      expect(Number.parseFloat(flyout.style.top)).toBeGreaterThanOrEqual(8);
    });
  });

  it("routes Ctrl+Shift+H through the mounted replace shortcut without extra UI setup", async () => {
    renderSearchSidebarWithCommands();

    await fireEvent.click(screen.getByRole("button", { name: "Hide Replace" }));
    expect(screen.queryByRole("textbox", { name: "Replace" })).toBeNull();

    await fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true });

    await vi.waitFor(() => {
      const replaceInput = screen.getByRole("textbox", { name: "Replace" });
      expect(document.activeElement).toBe(replaceInput);
    });
  });

  it("focuses the replace input when the Replace in Files command is invoked", async () => {
    renderSearchSidebar();

    await fireEvent.click(screen.getByRole("button", { name: "Hide Replace" }));
    expect(screen.queryByRole("textbox", { name: "Replace" })).toBeNull();

    window.dispatchEvent(new CustomEvent("search:focus-replace"));

    await vi.waitFor(() => {
      const replaceInput = screen.getByRole("textbox", { name: "Replace" });
      expect(document.activeElement).toBe(replaceInput);
    });
  });

  it("resets stale tree expansion state when a new search is run", async () => {
    renderSearchSidebar();

    await runSearch("first");
    await screen.findByText("src");

    await fireEvent.click(screen.getByRole("button", { name: "View as Tree" }));
    await fireEvent.click(screen.getByRole("button", { name: /src/i }));

    await vi.waitFor(() => {
      expect(screen.getByText("alpha.ts")).toBeTruthy();
    });

    await runSearch("fresh");

    await vi.waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
      expect(screen.queryByText("gamma.ts")).toBeNull();
    });
  });

  it("keeps the search context menu inside the viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 240 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 180 });

    renderSearchSidebar();
    await runSearch("test");

    const matchButton = findButtonByText("const test = 1;");
    await fireEvent.contextMenu(matchButton, { clientX: 235, clientY: 175 });

    const menu = await screen.findByRole("menu", { name: "Search result actions" });
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("8px");
  });

  it("reveals the per-file replace action when hovering a result file row", async () => {
    renderSearchSidebar();
    await runSearch("test");

    const replaceButton = screen.getByTitle("Replace in file") as HTMLButtonElement;
    expect(replaceButton.style.opacity).toBe("0");

    await fireEvent.mouseEnter(screen.getByRole("button", { name: /main\.ts/i }));
    expect(replaceButton.style.opacity).toBe("1");
  });

  it("waits for editor readiness before jumping to a cross-file match", async () => {
    mockEditorState.openFiles = [
      { id: "active", path: "/workspace/project/src/current.ts", content: "current", language: "typescript" },
      { id: "other", path: "/workspace/project/src/other.ts", content: "other", language: "typescript" },
    ];
    mockEditorState.activeFileId = "active";

    const gotoHandler = vi.fn();
    window.addEventListener("buffer-search:goto", gotoHandler);

    renderSearchSidebar();
    await runSearch("other");

    const otherMatchButton = findButtonByText("const otherMatch = true;");
    await fireEvent.click(otherMatchButton);

    await vi.waitFor(() => {
      expect(mockOpenFile).toHaveBeenCalledWith("/workspace/project/src/other.ts");
    });

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(gotoHandler).not.toHaveBeenCalled();

    mockEditorState.activeFileId = "other";
    window.dispatchEvent(new CustomEvent("editor:file-ready", {
      detail: { filePath: "/workspace/project/src/other.ts" },
    }));

    await vi.waitFor(() => {
      expect(gotoHandler).toHaveBeenCalledTimes(1);
    });

    expect((gotoHandler.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      line: 15,
      column: 9,
      length: 10,
      relativeToLine: true,
    });

    window.removeEventListener("buffer-search:goto", gotoHandler);
  });
});
