import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpenWorkspaceSurface } = vi.hoisted(() => ({
  mockOpenWorkspaceSurface: vi.fn(),
}));

vi.mock("@/utils/workingSurface", () => ({
  openWorkspaceSurface: mockOpenWorkspaceSurface,
}));

import { handleDeepLinkAction, parseDeepLinkAction, type DeepLinkAction } from "../deepLink";

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

  describe("parseDeepLinkAction", () => {
    it("parses backend-shaped OpenFolder payloads", () => {
      expect(parseDeepLinkAction({
        type: "OpenFolder",
        payload: {
          path: "/workspace/demo-project",
          new_window: true,
        },
      })).toEqual({
        type: "OpenFolder",
        payload: {
          path: "/workspace/demo-project",
          new_window: true,
        },
      });
    });

    it("accepts the legacy newWindow alias for OpenFolder payloads", () => {
      expect(parseDeepLinkAction({
        type: "OpenFolder",
        payload: {
          path: "/workspace/demo-project",
          newWindow: true,
        },
      })).toEqual({
        type: "OpenFolder",
        payload: {
          path: "/workspace/demo-project",
          newWindow: true,
        },
      });
    });

    it("parses valid OpenGoto payloads", () => {
      expect(parseDeepLinkAction({
        type: "OpenGoto",
        payload: {
          path: "/workspace/demo-project/src/main.ts",
          line: 12,
          column: 4,
        },
      })).toEqual({
        type: "OpenGoto",
        payload: {
          path: "/workspace/demo-project/src/main.ts",
          line: 12,
          column: 4,
        },
      });
    });

    it("parses Unknown payloads emitted by the backend", () => {
      expect(parseDeepLinkAction({
        type: "Unknown",
        payload: {
          raw_url: "Cortex://unsupported/action",
        },
      })).toEqual({
        type: "Unknown",
        payload: {
          raw_url: "Cortex://unsupported/action",
        },
      });
    });

    it("rejects malformed payloads and unsupported action types", () => {
      expect(parseDeepLinkAction(null)).toBeNull();
      expect(parseDeepLinkAction({ type: "OpenFile" })).toBeNull();
      expect(parseDeepLinkAction({
        type: "OpenFile",
        payload: { path: 42 },
      })).toBeNull();
      expect(parseDeepLinkAction({
        type: "OpenGoto",
        payload: { path: "/workspace/demo", line: "12" },
      })).toBeNull();
      expect(parseDeepLinkAction({
        type: "OpenGoto",
        payload: { path: "/workspace/demo", line: 0 },
      })).toBeNull();
      expect(parseDeepLinkAction({
        type: "Unexpected",
        payload: {},
      })).toBeNull();
    });
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
