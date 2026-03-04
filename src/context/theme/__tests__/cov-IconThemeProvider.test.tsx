import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";

const mockUseIconTheme = vi.fn();
const mockUseSettings = vi.fn();

vi.mock("@/context/iconTheme/IconThemeProvider", () => ({
  IconThemeProvider: (props: { children: unknown }) => props.children,
  useIconTheme: () => mockUseIconTheme(),
  BUILTIN_THEMES: [],
}));

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => mockUseSettings(),
}));

import {
  getIconForFile,
  getIconForFolder,
  FileIconThemeProvider,
} from "../../theme/IconThemeProvider";

function createIconThemeMock(options?: {
  activeThemeId?: string;
  availableThemeIds?: string[];
}) {
  const availableThemeIds = options?.availableThemeIds ?? ["seti", "material"];
  let activeThemeId = options?.activeThemeId ?? "seti";

  return {
    themes: () => availableThemeIds.map((id) => ({ id })),
    activeTheme: () => ({ id: activeThemeId, name: activeThemeId }),
    setIconTheme: vi.fn((id: string) => {
      activeThemeId = id;
    }),
    getFileIcon: vi.fn((filename: string) => ({ icon: filename, color: "#fff" })),
    getFolderIcon: vi.fn((name: string, open: boolean) => ({ icon: `${name}:${open ? "open" : "closed"}`, color: "#fff" })),
  };
}

function createSettingsMock(iconTheme: string) {
  return {
    effectiveSettings: () => ({
      theme: {
        iconTheme,
      },
    }),
    updateThemeSetting: vi.fn().mockResolvedValue(undefined),
  };
}

describe("IconThemeProvider", () => {
  beforeEach(() => {
    const iconTheme = createIconThemeMock();
    const settings = createSettingsMock("seti");
    mockUseIconTheme.mockReturnValue(iconTheme);
    mockUseSettings.mockReturnValue(settings);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("getIconForFile", () => {
    const iconTheme = createIconThemeMock();
    mockUseIconTheme.mockReturnValue(iconTheme);

    const result = getIconForFile("test.ts");

    expect(iconTheme.getFileIcon).toHaveBeenCalledWith("test.ts");
    expect(result).toEqual({ icon: "test.ts", color: "#fff" });
  });

  it("getIconForFolder", () => {
    const iconTheme = createIconThemeMock();
    mockUseIconTheme.mockReturnValue(iconTheme);

    const result = getIconForFolder("src", false);

    expect(iconTheme.getFolderIcon).toHaveBeenCalledWith("src", false);
    expect(result).toEqual({ icon: "src:closed", color: "#fff" });
  });

  it("FileIconThemeProvider syncs settings iconTheme to active icon theme", () => {
    const iconTheme = createIconThemeMock({
      activeThemeId: "seti",
      availableThemeIds: ["seti", "material"],
    });
    const settings = createSettingsMock("material");
    mockUseIconTheme.mockReturnValue(iconTheme);
    mockUseSettings.mockReturnValue(settings);

    render(() => (
      <FileIconThemeProvider>
        <div data-testid="child" />
      </FileIconThemeProvider>
    ));

    expect(iconTheme.setIconTheme).toHaveBeenCalledWith("material");
  });

  it("FileIconThemeProvider normalizes legacy default iconTheme setting", () => {
    const iconTheme = createIconThemeMock({ activeThemeId: "material" });
    const settings = createSettingsMock("default");
    mockUseIconTheme.mockReturnValue(iconTheme);
    mockUseSettings.mockReturnValue(settings);

    render(() => <FileIconThemeProvider />);

    expect(iconTheme.setIconTheme).toHaveBeenCalledWith("seti");
  });
});
