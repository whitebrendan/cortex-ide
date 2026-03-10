import { hasProperty, isBoolean, isNumber, isObject, isString } from "@/utils/json";
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

const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  isNumber(value) && Number.isInteger(value) && value >= 1;

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || isBoolean(value);

const isOptionalPositiveInteger = (value: unknown): value is number | undefined =>
  value === undefined || isPositiveInteger(value);

export function parseDeepLinkAction(value: unknown): DeepLinkAction | null {
  if (
    !isObject(value)
    || !hasProperty(value, "type")
    || !isString(value.type)
    || !hasProperty(value, "payload")
    || !isObject(value.payload)
  ) {
    return null;
  }

  const type = value.type;
  const payload = value.payload;

  switch (type) {
    case "OpenFile": {
      if (!isNonEmptyString(payload.path)) return null;
      return { type, payload: { path: payload.path } };
    }

    case "OpenFolder": {
      if (!isNonEmptyString(payload.path)) return null;
      if (!isOptionalBoolean(payload.new_window) || !isOptionalBoolean(payload.newWindow)) return null;

      return {
        type,
        payload: {
          path: payload.path,
          ...(isBoolean(payload.new_window) ? { new_window: payload.new_window } : {}),
          ...(isBoolean(payload.newWindow) ? { newWindow: payload.newWindow } : {}),
        },
      };
    }

    case "OpenGoto": {
      if (!isNonEmptyString(payload.path) || !isPositiveInteger(payload.line) || !isOptionalPositiveInteger(payload.column)) {
        return null;
      }

      return {
        type,
        payload: {
          path: payload.path,
          line: payload.line,
          ...(isNumber(payload.column) ? { column: payload.column } : {}),
        },
      };
    }

    case "OpenDiff": {
      if (!isNonEmptyString(payload.left) || !isNonEmptyString(payload.right)) return null;
      return { type, payload: { left: payload.left, right: payload.right } };
    }

    case "AddFolder": {
      if (!isNonEmptyString(payload.path)) return null;
      return { type, payload: { path: payload.path } };
    }

    case "OpenSettings": {
      if (!isNonEmptyString(payload.section)) return null;
      return { type, payload: { section: payload.section } };
    }

    case "Unknown": {
      if (!isNonEmptyString(payload.raw_url)) return null;
      return { type, payload: { raw_url: payload.raw_url } };
    }

    default:
      return null;
  }
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
