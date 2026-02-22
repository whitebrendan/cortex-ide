import { safeInvoke } from "./safe-invoke";

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface CodeActionContext {
  diagnostics: LspDiagnostic[];
  only?: string[];
  triggerKind?: number;
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity?: number;
  code?: string | number;
  source?: string;
}

export interface CodeAction {
  title: string;
  kind?: string;
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: LspCommand;
  diagnostics?: LspDiagnostic[];
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
}

export interface TextEdit {
  range: LspRange;
  newText: string;
}

export interface LspCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface CodeLens {
  range: LspRange;
  command?: LspCommand;
  data?: unknown;
}

export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  trimFinalNewlines?: boolean;
}

export interface PrepareRenameResult {
  range: LspRange;
  placeholder: string;
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature: number;
  activeParameter: number;
}

export interface SignatureInformation {
  label: string;
  documentation?: string;
  parameters?: ParameterInformation[];
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: string;
}

export interface InlayHint {
  position: LspPosition;
  label: string;
  kind?: number;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

export interface CallHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  detail?: string;
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem;
  fromRanges: LspRange[];
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem;
  fromRanges: LspRange[];
}

export interface TypeHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  detail?: string;
}

export interface DapBreakpoint {
  id: number;
  verified: boolean;
  line: number;
  column?: number;
  source?: string;
  condition?: string;
  logMessage?: string;
}

export interface DapDataBreakpoint {
  id: number;
  verified: boolean;
  variableName: string;
  accessType: "read" | "write" | "readWrite";
}

export interface WatchExpression {
  id: string;
  expression: string;
  result?: string;
  type?: string;
}

export interface EvalResult {
  result: string;
  type?: string;
  variablesReference?: number;
}

export interface DisassembledInstruction {
  address: string;
  instruction: string;
  instructionBytes?: string;
  line?: number;
  location?: string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  path: string;
  description?: string;
}

export interface ExtensionPermissions {
  fileSystem: boolean;
  network: boolean;
  process: boolean;
  clipboard: boolean;
  env: boolean;
}

export interface ExtensionLifecycleState {
  state: "installed" | "enabled" | "disabled" | "activating" | "active" | "deactivating" | "error";
  lastError?: string;
  activatedAt?: number;
}

export interface DiagnosticEntry {
  uri: string;
  range: LspRange;
  severity: "error" | "warning" | "information" | "hint";
  message: string;
  code?: string | number;
  source?: string;
}

export interface DiagnosticsSummary {
  totalErrors: number;
  totalWarnings: number;
  totalInformation: number;
  totalHints: number;
  fileCount: number;
}

export interface DiagnosticsFilter {
  severity?: "error" | "warning" | "information" | "hint";
  source?: string;
  uri?: string;
}

export interface TerminalSearchResult {
  line: number;
  column: number;
  text: string;
}

export interface TerminalProfile {
  id: string;
  name: string;
  shell: string;
  args?: string[];
  env?: Record<string, string>;
  icon?: string;
  isDefault?: boolean;
}

export interface TerminalLink {
  startIndex: number;
  length: number;
  text: string;
  uri?: string;
}

export async function lspCodeAction(
  serverId: string,
  uri: string,
  range: LspRange,
  context: CodeActionContext,
): Promise<CodeAction[]> {
  return safeInvoke<CodeAction[]>("lsp_code_action", { serverId, uri, range, context }, { fallback: [], silent: true });
}

export async function lspCodeLens(serverId: string, uri: string): Promise<CodeLens[]> {
  return safeInvoke<CodeLens[]>("lsp_code_lens", { serverId, uri }, { fallback: [], silent: true });
}

export async function lspResolveCodeLens(serverId: string, codeLens: CodeLens): Promise<CodeLens> {
  return safeInvoke<CodeLens>("lsp_resolve_code_lens", { serverId, codeLens }, { fallback: codeLens, silent: true });
}

export async function lspFormatDocument(
  serverId: string,
  uri: string,
  options: FormattingOptions,
): Promise<TextEdit[]> {
  return safeInvoke<TextEdit[]>("lsp_format_document", { serverId, uri, options }, { fallback: [], silent: true });
}

export async function lspFormatRange(
  serverId: string,
  uri: string,
  range: LspRange,
  options: FormattingOptions,
): Promise<TextEdit[]> {
  return safeInvoke<TextEdit[]>("lsp_format_range", { serverId, uri, range, options }, { fallback: [], silent: true });
}

export async function lspRename(
  serverId: string,
  uri: string,
  position: LspPosition,
  newName: string,
): Promise<WorkspaceEdit | null> {
  return safeInvoke<WorkspaceEdit | null>("lsp_rename", { serverId, uri, position, newName }, { fallback: null, silent: true });
}

export async function lspPrepareRename(
  serverId: string,
  uri: string,
  position: LspPosition,
): Promise<PrepareRenameResult | null> {
  return safeInvoke<PrepareRenameResult | null>("lsp_prepare_rename", { serverId, uri, position }, { fallback: null, silent: true });
}

export async function lspSignatureHelp(
  serverId: string,
  uri: string,
  position: LspPosition,
): Promise<SignatureHelp | null> {
  return safeInvoke<SignatureHelp | null>("lsp_signature_help", { serverId, uri, position }, { fallback: null, silent: true });
}

export async function lspInlayHints(
  serverId: string,
  uri: string,
  range: LspRange,
): Promise<InlayHint[]> {
  return safeInvoke<InlayHint[]>("lsp_inlay_hints", { serverId, uri, range }, { fallback: [], silent: true });
}

export async function lspCallHierarchyPrepare(
  serverId: string,
  uri: string,
  position: LspPosition,
): Promise<CallHierarchyItem[]> {
  return safeInvoke<CallHierarchyItem[]>("lsp_call_hierarchy_prepare", { serverId, uri, position }, { fallback: [], silent: true });
}

export async function lspCallHierarchyIncoming(
  serverId: string,
  item: CallHierarchyItem,
): Promise<CallHierarchyIncomingCall[]> {
  return safeInvoke<CallHierarchyIncomingCall[]>("lsp_call_hierarchy_incoming", { serverId, item }, { fallback: [], silent: true });
}

export async function lspCallHierarchyOutgoing(
  serverId: string,
  item: CallHierarchyItem,
): Promise<CallHierarchyOutgoingCall[]> {
  return safeInvoke<CallHierarchyOutgoingCall[]>("lsp_call_hierarchy_outgoing", { serverId, item }, { fallback: [], silent: true });
}

export async function lspTypeHierarchyPrepare(
  serverId: string,
  uri: string,
  position: LspPosition,
): Promise<TypeHierarchyItem[]> {
  return safeInvoke<TypeHierarchyItem[]>("lsp_type_hierarchy_prepare", { serverId, uri, position }, { fallback: [], silent: true });
}

export async function lspTypeHierarchySupertypes(
  serverId: string,
  item: TypeHierarchyItem,
): Promise<TypeHierarchyItem[]> {
  return safeInvoke<TypeHierarchyItem[]>("lsp_type_hierarchy_supertypes", { serverId, item }, { fallback: [], silent: true });
}

export async function lspTypeHierarchySubtypes(
  serverId: string,
  item: TypeHierarchyItem,
): Promise<TypeHierarchyItem[]> {
  return safeInvoke<TypeHierarchyItem[]>("lsp_type_hierarchy_subtypes", { serverId, item }, { fallback: [], silent: true });
}

export async function dapSetConditionalBreakpoint(
  sessionId: string,
  source: string,
  line: number,
  condition: string,
): Promise<DapBreakpoint | null> {
  const result = await safeInvoke<DapBreakpoint[] | null>("debug_set_breakpoints", {
    sessionId, path: source, breakpoints: [{ path: source, line, condition }],
  }, { fallback: null, silent: true });
  return result?.[0] ?? null;
}

export async function dapSetLogpoint(
  sessionId: string,
  source: string,
  line: number,
  logMessage: string,
): Promise<DapBreakpoint | null> {
  const result = await safeInvoke<DapBreakpoint[] | null>("debug_set_breakpoints", {
    sessionId, path: source, breakpoints: [{ path: source, line, logMessage }],
  }, { fallback: null, silent: true });
  return result?.[0] ?? null;
}

export async function dapSetDataBreakpoint(
  sessionId: string,
  variableName: string,
  accessType: "read" | "write" | "readWrite",
): Promise<DapDataBreakpoint | null> {
  const result = await safeInvoke<{ breakpoints: DapDataBreakpoint[] } | null>("debug_set_data_breakpoints", {
    sessionId, breakpoints: [{ dataId: variableName, accessType }],
  }, { fallback: null, silent: true });
  return result?.breakpoints?.[0] ?? null;
}

export async function dapAddWatchExpression(
  _sessionId: string,
  expression: string,
): Promise<WatchExpression | null> {
  return safeInvoke<WatchExpression | null>("debug_add_watch", { expression }, { fallback: null, silent: true });
}

export async function dapRemoveWatchExpression(
  _sessionId: string,
  id: string,
): Promise<boolean> {
  try {
    await safeInvoke<void>("debug_remove_watch", { watchId: id }, { silent: true });
    return true;
  } catch {
    return false;
  }
}

export async function dapEvaluateWatch(
  sessionId: string,
  expression: string,
  _frameId?: number,
): Promise<EvalResult | null> {
  return safeInvoke<EvalResult | null>("debug_evaluate", {
    sessionId, expression, context: "watch",
  }, { fallback: null, silent: true });
}

export async function dapDebugConsoleEval(
  sessionId: string,
  expression: string,
  _context: "repl" | "watch" | "hover" = "repl",
): Promise<EvalResult | null> {
  return safeInvoke<EvalResult | null>("debug_evaluate_repl", {
    sessionId, expression,
  }, { fallback: null, silent: true });
}

export async function dapDisassemble(
  sessionId: string,
  memoryReference: string,
  offset: number,
  instructionCount: number,
): Promise<DisassembledInstruction[]> {
  return safeInvoke<DisassembledInstruction[]>("debug_disassemble", {
    sessionId, memoryReference, offset, instructionCount,
  }, { fallback: [], silent: true });
}

export async function extensionInstall(path: string): Promise<ExtensionInfo | null> {
  return safeInvoke<ExtensionInfo | null>("install_extension_from_path", { path }, { fallback: null });
}

export async function extensionUninstall(extensionId: string): Promise<boolean> {
  try {
    await safeInvoke<void>("uninstall_extension", { extensionId });
    return true;
  } catch {
    return false;
  }
}

export async function extensionEnable(extensionId: string): Promise<boolean> {
  try {
    await safeInvoke<void>("enable_extension", { extensionId });
    return true;
  } catch {
    return false;
  }
}

export async function extensionDisable(extensionId: string): Promise<boolean> {
  try {
    await safeInvoke<void>("disable_extension", { extensionId });
    return true;
  } catch {
    return false;
  }
}

export async function extensionGetPermissions(extensionId: string): Promise<ExtensionPermissions> {
  return safeInvoke<ExtensionPermissions>("get_extension_permissions", { extensionId }, {
    fallback: { fileSystem: false, network: false, process: false, clipboard: false, env: false },
  });
}

export async function extensionSetPermissions(
  extensionId: string,
  permissions: ExtensionPermissions,
): Promise<boolean> {
  try {
    await safeInvoke<void>("set_extension_permissions", { extensionId, permissions });
    return true;
  } catch {
    return false;
  }
}

export async function extensionGetLifecycleState(extensionId: string): Promise<ExtensionLifecycleState> {
  return safeInvoke<ExtensionLifecycleState>("get_extension_lifecycle_state", { extensionId }, {
    fallback: { state: "error", lastError: "Failed to get lifecycle state" },
  });
}

export async function extensionTriggerHostFunction(
  extensionId: string,
  functionName: string,
  args: unknown[],
): Promise<unknown> {
  return safeInvoke<unknown>("trigger_extension_host_function", {
    extensionId, functionName, args,
  }, { fallback: null });
}

export async function extensionListInstalled(): Promise<ExtensionInfo[]> {
  return safeInvoke<ExtensionInfo[]>("list_installed_extensions", undefined, { fallback: [] });
}

export async function getDiagnosticsByFile(uri: string): Promise<DiagnosticEntry[]> {
  return safeInvoke<DiagnosticEntry[]>("diagnostics_get_by_file", { uri }, { fallback: [], silent: true });
}

export async function getDiagnosticsSummary(): Promise<DiagnosticsSummary> {
  return safeInvoke<DiagnosticsSummary>("diagnostics_get_summary", undefined, {
    fallback: { totalErrors: 0, totalWarnings: 0, totalInformation: 0, totalHints: 0, fileCount: 0 },
  });
}

export async function filterDiagnostics(filter: DiagnosticsFilter): Promise<DiagnosticEntry[]> {
  return safeInvoke<DiagnosticEntry[]>("diagnostics_filter", { filter }, { fallback: [], silent: true });
}

export async function searchTerminal(
  terminalId: string,
  query: string,
): Promise<TerminalSearchResult[]> {
  return safeInvoke<TerminalSearchResult[]>("terminal_search", { terminalId, query }, { fallback: [], silent: true });
}

export async function getTerminalProfiles(): Promise<TerminalProfile[]> {
  return safeInvoke<TerminalProfile[]>("terminal_get_profiles", undefined, { fallback: [] });
}

export async function saveTerminalProfile(profile: TerminalProfile): Promise<boolean> {
  try {
    await safeInvoke<void>("terminal_save_profile", { profile });
    return true;
  } catch {
    return false;
  }
}

export async function detectTerminalLinks(terminalId: string): Promise<TerminalLink[]> {
  return safeInvoke<TerminalLink[]>("terminal_detect_links", { terminalId }, { fallback: [], silent: true });
}

// ============================================================================
// Editor Feature Commands
// ============================================================================

export interface FoldingRange {
  startLine: number;
  endLine: number;
  kind: "comment" | "imports" | "region" | "block";
  collapsedText?: string;
}

export interface BreadcrumbSegment {
  name: string;
  kind: string;
  line: number;
  column: number;
}

export interface StickyScrollLineEntry {
  line: number;
  text: string;
  indentLevel: number;
  scopeKind: string;
}

export interface InlineDiffLine {
  changeType: "equal" | "insert" | "delete";
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  charChanges: InlineDiffCharChange[];
}

export interface InlineDiffCharChange {
  changeType: "equal" | "insert" | "delete";
  value: string;
}

export interface InlineDiffResult {
  lines: InlineDiffLine[];
  stats: {
    insertions: number;
    deletions: number;
    unchanged: number;
  };
  hasChanges: boolean;
}

export interface ExpandedSnippet {
  text: string;
  cursorOffset: number;
  tabStops: SnippetTabStop[];
}

export interface SnippetTabStop {
  index: number;
  offset: number;
  length: number;
  placeholder: string;
}

export interface EditorSymbolEntry {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  containerName: string | null;
  score: number;
}

export interface FileChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  occurrences: number;
}

export interface RenameResult {
  filesChanged: number;
  totalOccurrences: number;
  changes: FileChange[];
}

export interface ExtractResult {
  newContent: string;
  extractedText: string;
  insertedAtLine: number;
}

export async function renameAcrossFiles(
  workspacePath: string,
  oldName: string,
  newName: string,
  filePaths: string[],
): Promise<RenameResult | null> {
  return safeInvoke<RenameResult | null>("rename_across_files", {
    workspacePath,
    oldName,
    newName,
    filePaths,
  }, { fallback: null });
}

export async function extractVariable(
  content: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
  variableName: string,
): Promise<ExtractResult | null> {
  return safeInvoke<ExtractResult | null>("extract_variable", {
    content,
    startLine,
    startColumn,
    endLine,
    endColumn,
    variableName,
  }, { fallback: null });
}

export async function extractMethod(
  content: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
  methodName: string,
): Promise<ExtractResult | null> {
  return safeInvoke<ExtractResult | null>("extract_method", {
    content,
    startLine,
    startColumn,
    endLine,
    endColumn,
    methodName,
  }, { fallback: null });
}

export async function computeFoldingRanges(
  content: string,
  language: string,
): Promise<FoldingRange[]> {
  return safeInvoke<FoldingRange[]>("compute_folding_ranges", { content, language }, { fallback: [], silent: true });
}

export async function getWorkspaceSymbols(
  workspacePath: string,
  query: string,
  maxResults?: number,
): Promise<EditorSymbolEntry[]> {
  return safeInvoke<EditorSymbolEntry[]>("get_workspace_symbols", {
    workspacePath,
    query,
    maxResults: maxResults ?? 100,
  }, { fallback: [], silent: true });
}

export async function expandSnippet(
  body: string[],
  variables: Record<string, string>,
): Promise<ExpandedSnippet | null> {
  return safeInvoke<ExpandedSnippet | null>("expand_snippet", { body, variables }, { fallback: null, silent: true });
}

export async function computeInlineDiff(
  original: string,
  modified: string,
): Promise<InlineDiffResult | null> {
  return safeInvoke<InlineDiffResult | null>("compute_inline_diff", { original, modified }, { fallback: null, silent: true });
}

export async function getBreadcrumbPath(
  filePath: string,
  line: number,
  column: number,
): Promise<BreadcrumbSegment[]> {
  return safeInvoke<BreadcrumbSegment[]>("get_breadcrumb_path", { filePath, line, column }, { fallback: [], silent: true });
}

export async function getStickyScrollLines(
  content: string,
  language: string,
  visibleStartLine: number,
): Promise<StickyScrollLineEntry[]> {
  return safeInvoke<StickyScrollLineEntry[]>("get_sticky_scroll_lines", {
    content,
    language,
    visibleStartLine,
  }, { fallback: [], silent: true });
}
