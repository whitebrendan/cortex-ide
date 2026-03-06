import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { Suspense } from "solid-js";
import { CortexBottomPanelContainer } from "../CortexBottomPanelContainer";
import type { CortexBottomPanelContainerProps } from "../CortexBottomPanelContainer";
import { gitLog } from "@/utils/tauri-api";
import { getProjectPath } from "@/utils/workspace";

vi.mock("@/utils/tauri-api", () => ({
  gitLog: vi.fn(),
}));

vi.mock("@/utils/workspace", () => ({
  getProjectPath: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

function createProps(
  overrides: Partial<CortexBottomPanelContainerProps> = {},
): CortexBottomPanelContainerProps {
  return {
    bottomPanelTab: "history",
    bottomPanelCollapsed: false,
    bottomPanelHeight: 200,
    onTabChange: vi.fn(),
    onCollapse: vi.fn(),
    onHeightChange: vi.fn(),
    ...overrides,
  };
}

function renderHistoryTab(props: CortexBottomPanelContainerProps) {
  return render(() => (
    <Suspense fallback={<div data-testid="history-loading">Loading...</div>}>
      <CortexBottomPanelContainer {...props} />
    </Suspense>
  ));
}

describe("CortexBottomPanelContainer git history timestamps", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-06T12:00:00Z").getTime(),
    );

    vi.mocked(getProjectPath).mockReturnValue("/tmp/repo");
    vi.mocked(gitLog).mockResolvedValue([
      {
        hash: "abcdef1234567890",
        shortHash: "abcdef1",
        message: "Normalize mounted history timestamps",
        author: "Cortex Dev",
        authorEmail: "dev@example.com",
        date: 1700000000 as unknown as string,
        parents: ["1234567"],
      },
    ]);

    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function mockDateString(
      this: Date,
    ) {
      return `DATE:${this.getTime()}`;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders git-log unix-second timestamps as normalized dates on the mounted history tab", async () => {
    const props = createProps();
    const { findByText, queryByText } = renderHistoryTab(props);

    expect(
      await findByText("Normalize mounted history timestamps"),
    ).toBeTruthy();
    expect(await findByText("DATE:1700000000000")).toBeTruthy();
    expect(queryByText("DATE:1700000000")).toBeNull();
    expect(gitLog).toHaveBeenCalledWith("/tmp/repo", 100);
  });
});
