import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpenWorkspaceSurface } = vi.hoisted(() => ({
  mockOpenWorkspaceSurface: vi.fn(),
}));

vi.mock("@/utils/workingSurface", () => ({
  openWorkspaceSurface: mockOpenWorkspaceSurface,
}));

import { handleDeepLinkAction, type DeepLinkAction } from "../deepLink";

describe("deepLink", () => {
  const navigate = vi.fn();
  const openFile = vi.fn();
  const info = vi.fn();
  const error = vi.fn();
  const openSettings = vi.fn();
  const openWorkspace = vi.fn();
  const openAndGoto = vi.fn();
  const openDiff = vi.fn();
  const addFolder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes OpenFolder actions through the shared workspace-opening surface contract", async () => {
    const action: DeepLinkAction = {
      type: "OpenFolder",
      payload: { path: "/workspace/demo-project" },
    };

    await handleDeepLinkAction(action, {
      openFile,
      openWorkspace,
      openAndGoto,
      openDiff,
      addFolder,
      navigateOptions: {
        pathname: "/welcome",
        navigate,
      },
      notifyInfo: info,
      notifyError: error,
      openSettings,
    });

    expect(openWorkspace).toHaveBeenCalledWith("/workspace/demo-project", {
      pathname: "/welcome",
      navigate,
      newWindow: undefined,
    });
    expect(info).toHaveBeenCalledWith("Opening: demo-project");
    expect(openFile).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
  });
});
