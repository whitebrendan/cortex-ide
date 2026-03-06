import { safeSetItem } from "@/utils/safeStorage";
import { getWindowLabel } from "@/utils/windowStorage";

export interface SessionNavigationOptions {
  pathname: string;
  navigate: (path: string) => void;
}

export function isSessionRoute(pathname: string): boolean {
  return pathname === "/session" || pathname.startsWith("/session/");
}

export function persistCurrentProject(path: string): void {
  const label = getWindowLabel();
  safeSetItem(`cortex_current_project_${label}`, path);
  if (label === "main") {
    safeSetItem("cortex_current_project", path);
  }
}

export function openWorkspaceSurface(path: string, options: SessionNavigationOptions): void {
  persistCurrentProject(path);
  safeSetItem("figma_layout_mode", "ide");
  window.dispatchEvent(new CustomEvent("workspace:open-folder", { detail: { path } }));
  window.dispatchEvent(new CustomEvent("folder:did-open"));

  if (!isSessionRoute(options.pathname)) {
    options.navigate("/session");
  }
}

export function openUntitledSurface(options: SessionNavigationOptions & {
  openVirtualFile: (name: string, content: string, language: string) => void;
}): void {
  safeSetItem("figma_layout_mode", "ide");
  options.openVirtualFile("Untitled", "", "plaintext");

  if (!isSessionRoute(options.pathname)) {
    options.navigate("/session");
  }
}
