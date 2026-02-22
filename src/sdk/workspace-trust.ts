import { safeInvoke } from "./safe-invoke";

export interface TrustedFolderInfo {
  path: string;
  trustedAt: number;
  description?: string;
  trustParent: boolean;
}

export interface WorkspaceTrustInfo {
  isTrusted: boolean;
  trustLevel: "trusted" | "restricted" | "unknown";
  workspacePath: string | null;
  trustedFolders: TrustedFolderInfo[];
}

export interface TrustDecisionRequest {
  workspacePath: string;
  trustLevel: "trusted" | "restricted";
  remember: boolean;
  trustParent?: boolean;
  description?: string;
}

export interface WorkspaceTrustSettings {
  enabled: boolean;
  trustAllWorkspaces: boolean;
  showBanner: boolean;
  restrictedModeEnabled: boolean;
  promptForParentFolderTrust: boolean;
}

export async function getWorkspaceTrustInfo(workspacePath?: string): Promise<WorkspaceTrustInfo> {
  return safeInvoke<WorkspaceTrustInfo>("workspace_trust_get_info", {
    workspace_path: workspacePath,
  }, {
    fallback: {
      isTrusted: false,
      trustLevel: "unknown",
      workspacePath: workspacePath ?? null,
      trustedFolders: [],
    },
  });
}

export async function setWorkspaceTrust(request: TrustDecisionRequest): Promise<boolean> {
  return safeInvoke<boolean>("workspace_trust_set_decision", {
    workspace_path: request.workspacePath,
    trust_level: request.trustLevel,
    remember: request.remember,
    trust_parent: request.trustParent ?? false,
    description: request.description,
  }, { fallback: false });
}

export async function addTrustedFolder(
  path: string,
  options?: { trustParent?: boolean; description?: string }
): Promise<boolean> {
  return safeInvoke<boolean>("workspace_trust_add_folder", {
    path,
    trust_parent: options?.trustParent ?? false,
    description: options?.description,
  }, { fallback: false });
}

export async function removeTrustedFolder(path: string): Promise<boolean> {
  return safeInvoke<boolean>("workspace_trust_remove_folder", { path }, { fallback: false });
}

export async function getTrustedFolders(): Promise<TrustedFolderInfo[]> {
  return safeInvoke<TrustedFolderInfo[]>("workspace_trust_get_folders", undefined, { fallback: [] });
}

export async function clearAllTrustDecisions(): Promise<boolean> {
  return safeInvoke<boolean>("workspace_trust_clear_all", undefined, { fallback: false });
}

export async function getWorkspaceTrustSettings(): Promise<WorkspaceTrustSettings> {
  return safeInvoke<WorkspaceTrustSettings>("workspace_trust_get_settings", undefined, {
    fallback: {
      enabled: true,
      trustAllWorkspaces: false,
      showBanner: true,
      restrictedModeEnabled: true,
      promptForParentFolderTrust: true,
    },
  });
}

export async function updateWorkspaceTrustSettings(
  settings: Partial<WorkspaceTrustSettings>
): Promise<boolean> {
  return safeInvoke<boolean>("workspace_trust_update_settings", { settings }, { fallback: false });
}

export async function isPathTrusted(path: string): Promise<boolean> {
  return safeInvoke<boolean>("workspace_trust_is_path_trusted", { path }, { fallback: false });
}

export async function promptForTrust(workspacePath: string): Promise<"trusted" | "restricted" | "cancelled"> {
  return safeInvoke<"trusted" | "restricted" | "cancelled">(
    "workspace_trust_prompt",
    { workspace_path: workspacePath },
    { fallback: "cancelled" },
  );
}
