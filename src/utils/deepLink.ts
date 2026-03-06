import { type SessionNavigationOptions } from "@/utils/workingSurface";

export interface DeepLinkOpenFile {
  type: "OpenFile";
  payload: { path: string };
}

export interface DeepLinkOpenFolder {
  type: "OpenFolder";
  payload: { path: string; new_window?: boolean; newWindow?: boolean };
}

export interface DeepLinkOpenGoto {
  type: "OpenGoto";
  payload: { path: string; line: number; column?: number };
}

export interface DeepLinkOpenDiff {
  type: "OpenDiff";
  payload: { left: string; right: string };
}

export interface DeepLinkAddFolder {
  type: "AddFolder";
  payload: { path: string };
}

export interface DeepLinkOpenSettings {
  type: "OpenSettings";
  payload: { section: string };
}

export interface DeepLinkUnknown {
  type: "Unknown";
  payload: { raw_url: string };
}

export type DeepLinkAction =
  | DeepLinkOpenFile
  | DeepLinkOpenFolder
  | DeepLinkOpenGoto
  | DeepLinkOpenDiff
  | DeepLinkAddFolder
  | DeepLinkOpenSettings
  | DeepLinkUnknown;

interface HandleDeepLinkActionOptions {
  openFile: (path: string) => Promise<void>;
  openWorkspace: (path: string, options: SessionNavigationOptions & { newWindow?: boolean }) => void;
  openAndGoto: (path: string, line: number, column?: number) => Promise<void>;
  openDiff: (options: { left: string; right: string }) => void;
  addFolder: (path: string) => Promise<void>;
  navigateOptions: SessionNavigationOptions;
  notifyInfo: (message: string) => void;
  notifyError: (message: string) => void;
  openSettings: (section: string) => void;
}

const getLeafName = (path: string): string => path.split(/[\\/]/).pop() || path;

export async function handleDeepLinkAction(
  action: DeepLinkAction,
  options: HandleDeepLinkActionOptions,
): Promise<void> {
  switch (action.type) {
    case "OpenFile": {
      try {
        await options.openFile(action.payload.path);
        options.notifyInfo(`Opened: ${getLeafName(action.payload.path)}`);
      } catch {
        options.notifyError(`Failed to open: ${action.payload.path}`);
      }
      break;
    }
    case "OpenFolder": {
      const path = action.payload.path;
      options.openWorkspace(path, {
        ...options.navigateOptions,
        newWindow: action.payload.new_window ?? action.payload.newWindow,
      });
      options.notifyInfo(`Opening: ${getLeafName(path)}`);
      break;
    }
    case "OpenGoto": {
      await options.openAndGoto(action.payload.path, action.payload.line, action.payload.column);
      break;
    }
    case "OpenDiff": {
      options.openDiff({ left: action.payload.left, right: action.payload.right });
      break;
    }
    case "AddFolder": {
      try {
        await options.addFolder(action.payload.path);
        options.notifyInfo(`Added folder: ${getLeafName(action.payload.path)}`);
      } catch {
        options.notifyError(`Failed to add folder: ${action.payload.path}`);
      }
      break;
    }
    case "OpenSettings": {
      options.openSettings(action.payload.section);
      options.notifyInfo(`Opening settings: ${action.payload.section || "general"}`);
      break;
    }
    case "Unknown": {
      options.notifyError("Unknown deep link format");
      break;
    }
  }
}
