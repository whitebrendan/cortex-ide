/**
 * Workspace utilities for consistent project path handling
 * 
 * This module provides a unified way to access the current project path
 * from localStorage, handling the multiple key names that have been used
 * historically (projectPath and cortex_current_project).
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from "./safeStorage";
import { getWindowLabel } from "./windowStorage";

const PROJECT_PATH_KEY = "projectPath";
const cortex_PROJECT_KEY = "cortex_current_project";

const getWindowScopedKey = (key: string): string => `${key}_${getWindowLabel()}`;

/**
 * Get the current project path from localStorage.
 * Checks both legacy global keys and the active window's scoped keys for compatibility.
 * 
 * @returns The current project path, or empty string if not set
 */
export function getProjectPath(): string {
  return (
    safeGetItem(getWindowScopedKey(PROJECT_PATH_KEY)) ||
    safeGetItem(getWindowScopedKey(cortex_PROJECT_KEY)) ||
    safeGetItem(PROJECT_PATH_KEY) ||
    safeGetItem(cortex_PROJECT_KEY) ||
    ""
  );
}

/**
 * Set the current project path in localStorage.
 * Sets both key families, including the active window's scoped keys, for compatibility.
 * 
 * @param path - The project path to set
 */
export function setProjectPath(path: string): void {
  safeSetItem(getWindowScopedKey(PROJECT_PATH_KEY), path);
  safeSetItem(getWindowScopedKey(cortex_PROJECT_KEY), path);
  safeSetItem(PROJECT_PATH_KEY, path);
  safeSetItem(cortex_PROJECT_KEY, path);
}

/**
 * Clear the current project path from localStorage.
 * Removes both global keys and the active window's scoped keys for full cleanup.
 */
export function clearProjectPath(): void {
  safeRemoveItem(getWindowScopedKey(PROJECT_PATH_KEY));
  safeRemoveItem(getWindowScopedKey(cortex_PROJECT_KEY));
  safeRemoveItem(PROJECT_PATH_KEY);
  safeRemoveItem(cortex_PROJECT_KEY);
}
