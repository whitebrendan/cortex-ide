import { safeSetItem } from "@/utils/safeStorage";
import { clearProjectPath, setProjectPath } from "@/utils/workspace";

export interface SessionNavigationOptions {
  pathname: string;
  navigate: (path: string) => void;
}

export function isSessionRoute(pathname: string): boolean {
  return pathname === "/session" || pathname.startsWith("/session/");
}

export function persistCurrentProject(path: string): void {
  setProjectPath(path);
}

export function resetProjectScopedTransientState(): void {
  safeSetItem("figma_layout_mode", "ide");
  safeSetItem("figma_layout_sidebar_tab", "files");
  safeSetItem("figma_layout_sidebar_collapsed", "false");
  safeSetItem("figma_layout_chat_state", "minimized");
}

export function openWorkspaceSurface(path: string, options: SessionNavigationOptions): void {
  persistCurrentProject(path);
  resetProjectScopedTransientState();
  window.dispatchEvent(new CustomEvent("workspace:open-folder", { detail: { path } }));
  window.dispatchEvent(new CustomEvent("folder:did-open"));

  if (!isSessionRoute(options.pathname)) {
    options.navigate("/session");
  }
}

export function closeWorkspaceSurface(options: SessionNavigationOptions): void {
  clearProjectPath();

  if (options.pathname !== "/welcome") {
    options.navigate("/welcome");
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
