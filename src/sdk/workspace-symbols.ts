/**
 * SDK wrapper for the workspace_symbols.rs backend module.
 *
 * Provides typed TypeScript functions wrapping the Tauri IPC commands
 * for workspace-wide symbol search, indexing, and statistics.
 */

import { safeInvoke } from "./safe-invoke";

export type SymbolKind =
  | "file" | "module" | "namespace" | "package" | "class"
  | "method" | "property" | "field" | "constructor" | "enum"
  | "interface" | "function" | "variable" | "constant" | "string"
  | "number" | "boolean" | "array" | "object" | "key"
  | "null" | "enumMember" | "struct" | "event" | "operator"
  | "typeParameter";

export interface WorkspaceSymbolEntry {
  name: string;
  kind: SymbolKind;
  containerName: string | null;
  filePath: string;
  line: number;
  column: number;
  endLine: number | null;
  endColumn: number | null;
}

export interface IndexStats {
  totalSymbols: number;
  totalFiles: number;
  lastIndexed: number | null;
  indexed: boolean;
}

/**
 * Search workspace symbols by query with fuzzy matching.
 * Returns up to `maxResults` symbols sorted by relevance.
 */
export async function workspaceSymbolsSearch(
  workspacePath: string,
  query: string,
  maxResults?: number,
): Promise<WorkspaceSymbolEntry[]> {
  return safeInvoke<WorkspaceSymbolEntry[]>("workspace_symbols_search", {
    workspacePath,
    query,
    maxResults: maxResults ?? 100,
  }, { fallback: [], silent: true });
}

/**
 * Index or re-index a workspace directory.
 * Scans source files and extracts symbols using regex-based patterns.
 */
export async function workspaceSymbolsIndex(
  workspacePath: string,
): Promise<IndexStats> {
  return safeInvoke<IndexStats>("workspace_symbols_index", { workspacePath }, {
    fallback: { totalSymbols: 0, totalFiles: 0, lastIndexed: null, indexed: false },
    silent: true,
  });
}

/**
 * Clear the symbol index for a workspace.
 */
export async function workspaceSymbolsClear(
  workspacePath: string,
): Promise<void> {
  return safeInvoke<void>("workspace_symbols_clear", { workspacePath }, {
    fallback: undefined,
    silent: true,
  });
}

/**
 * Get indexing statistics for a workspace.
 */
export async function workspaceSymbolsGetStats(
  workspacePath: string,
): Promise<IndexStats> {
  return safeInvoke<IndexStats>("workspace_symbols_get_stats", { workspacePath }, {
    fallback: { totalSymbols: 0, totalFiles: 0, lastIndexed: null, indexed: false },
    silent: true,
  });
}
