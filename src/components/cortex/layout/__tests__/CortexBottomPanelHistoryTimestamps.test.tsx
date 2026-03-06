import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { CortexGitHistory } from "../../CortexGitHistory";
import { gitLog } from "@/utils/tauri-api";
import { getProjectPath } from "@/utils/workspace";

vi.mock("../../primitives", () => ({
  CortexIconButton: (props: { title?: string; onClick?: () => void }) => (
    <button onClick={() => props.onClick?.()}>{props.title ?? "Close"}</button>
  ),
  CortexInput: (props: { placeholder?: string; value?: string; onChange?: (value: string) => void }) => (
    <input
      aria-label={props.placeholder ?? "Filter commits"}
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onInput={(event) => props.onChange?.(event.currentTarget.value)}
    />
  ),
}));

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

describe("CortexGitHistory mounted timestamp normalization", () => {
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

  it("renders git-log unix-second timestamps as normalized dates on the mounted history panel", async () => {
    const { findByText, queryByText } = render(() => <CortexGitHistory />);

    expect(
      await findByText("Normalize mounted history timestamps"),
    ).toBeTruthy();
    expect(await findByText("DATE:1700000000000")).toBeTruthy();
    expect(queryByText("DATE:1700000000")).toBeNull();
    expect(gitLog).toHaveBeenCalledWith("/tmp/repo", 100);
  });
});
