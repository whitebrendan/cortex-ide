import { safeInvoke } from "./safe-invoke";

export interface DiagnosticPosition {
  line: number;
  character: number;
}

export interface DiagnosticRange {
  start: DiagnosticPosition;
  end: DiagnosticPosition;
}

export type DiagnosticSeverity = "error" | "warning" | "information" | "hint";

export interface Diagnostic {
  uri: string;
  range: DiagnosticRange;
  severity: DiagnosticSeverity;
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInfo[];
}

export interface DiagnosticRelatedInfo {
  location: {
    uri: string;
    range: DiagnosticRange;
  };
  message: string;
}

export interface DiagnosticCollection {
  uri: string;
  diagnostics: Diagnostic[];
}

export interface CodeAction {
  title: string;
  kind?: string;
  isPreferred?: boolean;
  edit?: {
    changes?: Record<string, Array<{ range: DiagnosticRange; newText: string }>>;
  };
  command?: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
}

export interface DiagnosticsRefreshOptions {
  uri?: string;
  force?: boolean;
}

export interface DiagnosticsExportOptions {
  format: "json" | "csv" | "markdown";
  uri?: string;
  includeHints?: boolean;
}

export async function refreshDiagnostics(options?: DiagnosticsRefreshOptions): Promise<void> {
  return safeInvoke<void>("diagnostics_refresh", {
    uri: options?.uri,
    force: options?.force ?? false,
  }, { fallback: undefined });
}

export async function getDiagnostics(uri?: string): Promise<DiagnosticCollection[]> {
  if (uri) {
    const diagnostics = await safeInvoke<Diagnostic[]>("diagnostics_get_for_file", { uri }, { fallback: [] });
    return diagnostics.length > 0 ? [{ uri, diagnostics }] : [];
  }
  const grouped = await safeInvoke<DiagnosticCollection[]>("diagnostics_get_by_file", { filter: null }, { fallback: [] });
  return grouped;
}

export async function getDiagnosticsForFile(uri: string): Promise<Diagnostic[]> {
  return safeInvoke<Diagnostic[]>("diagnostics_get_for_file", { uri }, { fallback: [] });
}

export async function clearDiagnostics(uri?: string): Promise<void> {
  return safeInvoke<void>("diagnostics_clear", { uri }, { fallback: undefined });
}

export async function getCodeActions(uri: string, range: DiagnosticRange): Promise<CodeAction[]> {
  return safeInvoke<CodeAction[]>("diagnostics_get_code_actions", {
    uri,
    range,
  }, { fallback: [] });
}

export async function applyCodeAction(action: CodeAction): Promise<boolean> {
  return safeInvoke<boolean>("diagnostics_apply_code_action", { action }, { fallback: false });
}

export async function exportDiagnostics(options: DiagnosticsExportOptions): Promise<string> {
  return safeInvoke<string>("diagnostics_export", {
    format: options.format,
    uri: options.uri,
    include_hints: options.includeHints ?? false,
  }, { fallback: "" });
}

export async function getDiagnosticCounts(uri?: string): Promise<{
  error: number;
  warning: number;
  information: number;
  hint: number;
  total: number;
}> {
  return safeInvoke("diagnostics_get_counts", { uri }, {
    fallback: { error: 0, warning: 0, information: 0, hint: 0, total: 0 },
  });
}

export async function navigateToDiagnostic(
  uri: string,
  range: DiagnosticRange
): Promise<void> {
  return safeInvoke<void>("diagnostics_navigate_to", {
    uri,
    line: range.start.line,
    column: range.start.character,
  }, { fallback: undefined });
}

export async function setDiagnosticsFilter(filter: {
  showErrors?: boolean;
  showWarnings?: boolean;
  showInformation?: boolean;
  showHints?: boolean;
  sources?: string[];
}): Promise<void> {
  return safeInvoke<void>("diagnostics_set_filter", { filter }, { fallback: undefined });
}
