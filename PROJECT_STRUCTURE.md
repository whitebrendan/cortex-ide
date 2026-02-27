# Cortex IDE — Project Structure & Build Baseline

> Generated as the working baseline for all subsequent development tasks.

## Build Verification Status

| Command | Location | Result | Notes |
|---------|----------|--------|-------|
| `npm install` | `/workspace/ide` | ✅ Pass | 623 packages, 784 audited |
| `npm run typecheck` | `/workspace/ide` | ✅ Pass | `tsc --noEmit` — zero errors |
| `npm run build` | `/workspace/ide` | ✅ Pass | Vite production build → `dist/` |
| `npm test` | `/workspace/ide` | ⚠️ 9914 pass / 3 fail | Pre-existing failures (see below) |
| `cargo check` | `/workspace/ide/src-tauri` | ✅ Pass | Rust backend compiles cleanly |

**Note:** There is no `npm run check` script. The TypeScript check command is `npm run typecheck`.

### Pre-existing Test Failures

| Test File | Test Name | Error |
|-----------|-----------|-------|
| `src/components/cortex/editor/__tests__/cov-CortexDiffEditor.test.tsx` | (entire file) | Import/setup error |
| `src/components/cortex/layout/__tests__/CortexIDELayout.test.tsx` | `should render EditorPanel area` | `AssertionError: expected null to be truthy` |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (SolidJS + TypeScript)                                 │
│  src/                                                            │
│  ├── components/   691 .tsx files across 50 feature directories  │
│  ├── context/      99 top-level + 82 sub-context files           │
│  ├── hooks/        37 custom SolidJS hooks                       │
│  ├── providers/    12 Monaco + 9 QuickAccess providers           │
│  ├── sdk/          Tauri IPC client SDK                          │
│  ├── utils/        140+ utility files                            │
│  ├── services/     5 business logic services                     │
│  ├── store/        Zustand stores (debug, settings, ui, etc.)    │
│  ├── types/        28 shared TypeScript type definitions         │
│  ├── pages/        Route pages (Home, Session, Admin, Share)     │
│  ├── layout/       Layout engine (Panel, SplitView, resize)      │
│  ├── design-system/ Design tokens and primitives                 │
│  ├── i18n/         6 translation files (en/fr/de/es/ja/zh)       │
│  ├── api/          API client modules                            │
│  ├── workers/      Web Workers (extension-host.ts)               │
│  └── 1125 test files total                                       │
├──────────────────────────────────────────────────────────────────┤
│  Tauri IPC Bridge (invoke commands + emit/listen events)         │
├──────────────────────────────────────────────────────────────────┤
│  Backend (Rust / Tauri v2)                                       │
│  src-tauri/src/                                                  │
│  ├── 48 modules, 231 .rs files                                   │
│  ├── ai/           AI providers, agents, completions, indexing   │
│  ├── lsp/          Language Server Protocol client (25 files)    │
│  ├── dap/          Debug Adapter Protocol client (35 files)      │
│  ├── terminal/     PTY management (12 files)                     │
│  ├── git/          Git operations via libgit2 (29 files)         │
│  ├── extensions/   Extension system (27 files)                   │
│  ├── factory/      Agent workflow orchestration (15 files)       │
│  ├── sandbox/      Process sandboxing (15 files)                 │
│  ├── collab/       Real-time collaboration (8 files)             │
│  ├── fs/           File system operations (10 files)             │
│  └── ...           + 38 more modules                             │
├──────────────────────────────────────────────────────────────────┤
│  Sidecar: mcp-server/ (TypeScript/Node.js MCP stdio server)      │
├──────────────────────────────────────────────────────────────────┤
│  Local Engine: cortex_engine, cortex_protocol, cortex_storage    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Top-Level File Map

```
cortex-ide/
├── AGENTS.md                     # Agent instructions (root)
├── README.md                     # Project overview & roadmap
├── PROJECT_STRUCTURE.md          # This file
├── VERSION                       # Current version: 1.1.0
├── package.json                  # Frontend deps & scripts
├── package-lock.json             # Lockfile
├── tsconfig.json                 # TypeScript config (strict, SolidJS JSX)
├── tsconfig.node.json            # Node-side TypeScript config
├── vite.config.ts                # Vite bundler (code splitting, dev server)
├── vitest.config.ts              # Vitest test config (jsdom, coverage)
├── index.html                    # Vite entry HTML
├── .env.example                  # Environment variable template
├── .releaserc.json               # Semantic release config
├── .gitignore
├── .githooks/                    # Git hooks
│   ├── pre-commit                # cargo fmt + npm typecheck
│   └── pre-push                  # Full quality gate
├── .github/workflows/ci.yml     # CI pipeline
├── src/                          # Frontend source
├── src-tauri/                    # Rust backend
├── mcp-server/                   # MCP sidecar server
├── public/                       # Static assets (SVG icons)
├── assets/                       # Project assets (banner)
└── docs/                         # Documentation
    ├── BUILD.md
    ├── MCP-SERVER.md
    └── AI_EVENT_CONTRACTS.md
```

---

## Frontend (`src/`) — Detailed Structure

### Entry Points

| File | Purpose |
|------|---------|
| `src/index.tsx` | App entry → renders AppShell |
| `src/main.tsx` | Alternative entry |
| `src/App.tsx` | Main app with OptimizedProviders |
| `src/AppCore.tsx` | Lazy-loaded core logic (heavy, deferred) |
| `src/AppShell.tsx` | Minimal shell for instant first paint |

### Components (`src/components/`) — 50 Feature Directories

| Directory | Description |
|-----------|-------------|
| `Chat/` | AI chat components |
| `accessibility/` | Accessibility settings, screen reader |
| `admin/` | Admin panel, session filters |
| `agents/` | Agent management forms |
| `ai/` | AI status, tools |
| `appearance/` | Appearance settings |
| `codespaces/` | Codespaces integration |
| `collab/` | Real-time collaboration UI |
| `comments/` | Code comments |
| `cortex/` | Core Cortex UI (layout, titlebar, explorer, git, editor, icons, primitives, vibe, dialogs, command-palette, diagnostics, output, remote, styles) |
| `debug/` | Debug widgets (breakpoints) |
| `debugger/` | Debugger panels (breakpoints, call stack, variables) |
| `dev/` | Developer tools |
| `diagnostics/` | Diagnostic items and filters |
| `editor/` | Monaco editor (breadcrumbs, core, diff, features, grid, merge, modules, tab bar, find/replace, hex editor, minimap, peek view, rename, snippets, sticky scroll, inline diff) |
| `explorer/` | File explorer |
| `extensions/` | Extension management (contributed panels/views) |
| `file-explorer/` | File explorer (alternate) |
| `git/` | Git panel (commit graph) |
| `keyboard/` | Keyboard shortcuts |
| `layout/` | Layout components |
| `notebook/` | Notebook editor (outputs: HTML, Markdown, Text) |
| `notifications/` | Notification system |
| `onboarding/` | Onboarding flows |
| `output/` | Output channels and panel |
| `palette/` | Command palette |
| `preview/` | Preview panel |
| `profiles/` | User profiles |
| `quickaccess/` | Quick access widget |
| `remote/` | Remote development UI |
| `repl/` | REPL interface |
| `search/` | Search panel |
| `session/` | Session management |
| `settings/` | Settings editor (keybindings) |
| `share/` | Share functionality |
| `snippets/` | Snippet management |
| `startup/` | Startup screen |
| `tasks/` | Task runner UI |
| `terminal/` | Terminal components |
| `testing/` | Test explorer (coverage overlay, test output/results) |
| `theme/` | Theme customizer and preview |
| `timeline/` | Timeline panel (local history) |
| `tools/` | Tool components |
| `ui/` | Shared UI primitives (Button, Card, Modal, Badge, etc.) |
| `viewers/` | File viewers |
| `workbench/` | Workbench layout |
| `workspace/` | Workspace manager, trust dialog |
| `workspace-trust/` | Workspace trust badge/editor |

### Top-Level Components (in `src/components/`)

| File | Purpose |
|------|---------|
| `TerminalPanel.tsx` | Terminal panel |
| `NotificationsPanel.tsx` | Notifications panel |
| `ReferencesPanel.tsx` | References panel |
| `BookmarksPanel.tsx` | Bookmarks panel |
| `TimelinePanel.tsx` | Timeline panel |
| `PlanAgentsPanel.tsx` | Plan agents panel |
| `WebviewPanel.tsx` | Webview panel |
| `PanelGroup.tsx` | Panel grouping |
| `MenuBar.tsx` | Application menu bar |

### Context Providers (`src/context/`) — 99 Top-Level Files

<details>
<summary>All 99 top-level context files</summary>

| Context | File | Domain |
|---------|------|--------|
| ACPContext | `ACPContext.tsx` | Agent Control Protocol |
| AIContext | `AIContext.tsx` | AI chat, providers, streaming |
| AccessibilityContext | `AccessibilityContext.tsx` | Accessibility features |
| ActivityBarContext | `ActivityBarContext.tsx` | Activity bar state |
| ActivityIndicatorContext | `ActivityIndicatorContext.tsx` | Activity indicators |
| AgentFollowContext | `AgentFollowContext.tsx` | Agent follow mode |
| AutoUpdateContext | `AutoUpdateContext.tsx` | Auto-update |
| BookmarksContext | `BookmarksContext.tsx` | Bookmarks |
| ChannelsContext | `ChannelsContext.tsx` | Communication channels |
| ChatEditingContext | `ChatEditingContext.tsx` | Chat editing |
| CodespacesContext | `CodespacesContext.tsx` | Codespaces |
| CollabContext | `CollabContext.tsx` | Real-time collaboration |
| CollabSyncContext | `CollabSyncContext.tsx` | Collaboration sync |
| ColorCustomizationsContext | `ColorCustomizationsContext.tsx` | Color customizations |
| CommandContext | `CommandContext.tsx` | Command palette registry |
| CommandPaletteContext | `CommandPaletteContext.tsx` | Command palette state |
| CommentsContext | `CommentsContext.tsx` | Code comments |
| ContextServerContext | `ContextServerContext.tsx` | MCP context servers |
| CortexColorThemeContext | `CortexColorThemeContext.tsx` | Cortex color theme |
| DebugContext | `DebugContext.tsx` | Debug sessions, breakpoints |
| DiagnosticsContext | `DiagnosticsContext.tsx` | Diagnostics |
| EditorAssociationsContext | `EditorAssociationsContext.tsx` | Editor associations |
| EditorContext | `EditorContext.tsx` | Open editors, tabs, active file |
| EncodingContext | `EncodingContext.tsx` | File encoding |
| ExtensionBisectContext | `ExtensionBisectContext.tsx` | Extension bisect debugging |
| ExtensionHostContext | `ExtensionHostContext.tsx` | Extension host |
| ExtensionRecommendationsContext | `ExtensionRecommendationsContext.tsx` | Extension recommendations |
| ExtensionsContext | `ExtensionsContext.tsx` | Installed extensions |
| FileOperationsContext | `FileOperationsContext.tsx` | File operations |
| FormatterContext | `FormatterContext.tsx` | Code formatting |
| GitHostingContext | `GitHostingContext.tsx` | GitHub/GitLab integration |
| GitMergeContext | `GitMergeContext.tsx` | Git merge |
| I18nContext | `I18nContext.tsx` | Internationalization |
| IconThemeContext | `IconThemeContext.tsx` | Icon themes |
| InspectorContext | `InspectorContext.tsx` | Inspector |
| JournalContext | `JournalContext.tsx` | Journal |
| KeymapContext | `KeymapContext.tsx` | Keyboard shortcuts |
| LLMContext | `LLMContext.tsx` | LLM providers |
| LSPContext | `LSPContext.tsx` | Language server connections |
| LanguageSelectorContext | `LanguageSelectorContext.tsx` | Language selection |
| LayoutContext | `LayoutContext.tsx` | Panel layout, sidebar |
| LocalHistoryContext | `LocalHistoryContext.tsx` | Local file history |
| MultiRepoContext | `MultiRepoContext.tsx` | Multi-repo support |
| NavigationHistoryContext | `NavigationHistoryContext.tsx` | Navigation history |
| NodeExtensionHostContext | `NodeExtensionHostContext.tsx` | Node.js extension host |
| NotebookContext | `NotebookContext.tsx` | Notebook editor |
| NotificationsContext | `NotificationsContext.tsx` | Notifications |
| OptimizedProviders | `OptimizedProviders.tsx` | Provider composition (2-tier) |
| OutlineContext | `OutlineContext.tsx` | Document outline |
| OutputContext | `OutputContext.tsx` | Output channels |
| PlanContext | `PlanContext.tsx` | Plan management |
| PolicySettingsContext | `PolicySettingsContext.tsx` | Policy settings |
| PreviewContext | `PreviewContext.tsx` | Preview panel |
| ProductIconThemeContext | `ProductIconThemeContext.tsx` | Product icon themes |
| ProfilesContext | `ProfilesContext.tsx` | User profiles |
| PromptStoreContext | `PromptStoreContext.tsx` | Prompt templates |
| PullRequestContext | `PullRequestContext.tsx` | Pull request management |
| QuickAccessContext | `QuickAccessContext.tsx` | Quick access |
| QuickInputContext | `QuickInputContext.tsx` | Quick input |
| QuickPickContext | `QuickPickContext.tsx` | Quick pick |
| REPLContext | `REPLContext.tsx` | REPL sessions |
| RecentProjectsContext | `RecentProjectsContext.tsx` | Recent projects |
| RemoteContext | `RemoteContext.tsx` | Remote development |
| RulesLibraryContext | `RulesLibraryContext.tsx` | Agent rules library |
| SDKContext | `SDKContext.tsx` | SDK state |
| SSHContext | `SSHContext.tsx` | SSH connections |
| SearchContext | `SearchContext.tsx` | Search state |
| SemanticSearchContext | `SemanticSearchContext.tsx` | Semantic search |
| SemanticTokenCustomizationsContext | `SemanticTokenCustomizationsContext.tsx` | Semantic token customization |
| SessionContext | `SessionContext.tsx` | Current session |
| SettingsContext | `SettingsContext.tsx` | User preferences |
| SettingsSyncContext | `SettingsSyncContext.tsx` | Settings sync |
| SnippetsContext | `SnippetsContext.tsx` | Snippets |
| SpeechContext | `SpeechContext.tsx` | Speech recognition |
| StatusBarContext | `StatusBarContext.tsx` | Status bar |
| SubAgentContext | `SubAgentContext.tsx` | Sub-agent management |
| SupermavenContext | `SupermavenContext.tsx` | Supermaven integration |
| TabSwitcherContext | `TabSwitcherContext.tsx` | Tab switching |
| TasksContext | `TasksContext.tsx` | Task runner |
| TelemetryContext | `TelemetryContext.tsx` | Telemetry |
| TerminalProfilesContext | `TerminalProfilesContext.tsx` | Terminal profiles |
| TerminalsContext | `TerminalsContext.tsx` | Terminal instances |
| TestingContext | `TestingContext.tsx` | Test explorer/runner |
| ThemeContext | `ThemeContext.tsx` | Color theme, dark/light |
| TimelineContext | `TimelineContext.tsx` | Timeline/local history |
| ToastContext | `ToastContext.tsx` | Toast notifications |
| TokenColorCustomizationsContext | `TokenColorCustomizationsContext.tsx` | Token color customization |
| ToolchainContext | `ToolchainContext.tsx` | Language toolchains |
| TunnelContext | `TunnelContext.tsx` | Tunnel management |
| ViewModeContext | `ViewModeContext.tsx` | View mode |
| VimContext | `VimContext.tsx` | Vim mode |
| WebviewContext | `WebviewContext.tsx` | Webview management |
| WhichKeyContext | `WhichKeyContext.tsx` | Which-key overlay |
| WindowsContext | `WindowsContext.tsx` | Multi-window management |
| WorkspaceContext | `WorkspaceContext.tsx` | Project root, file tree |
| WorkspaceSymbolsContext | `WorkspaceSymbolsContext.tsx` | Workspace symbols |
| WorkspaceTrustContext | `WorkspaceTrustContext.tsx` | Workspace trust |
| ZenModeContext | `ZenModeContext.tsx` | Zen mode |

</details>

### Sub-Context Directories

| Directory | Files | Purpose |
|-----------|-------|---------|
| `context/ai/` | `AIAgentContext`, `AIProviderContext`, `AIStreamContext`, `AIThreadContext` | AI sub-contexts |
| `context/debug/` | `BreakpointManager`, `ConsoleManager`, `DebugBreakpointContext`, `DebugConsoleContext`, `DebugDisassemblyContext`, `DebugProvider`, `DebugSessionContext`, `DebugWatchContext`, `WatchManager` | Debug sub-contexts |
| `context/editor/` | `EditorCursorContext`, `EditorFeaturesProvider`, `EditorFilesContext`, `EditorProvider`, `EditorUIContext`, `TabsProvider` + helpers | Editor sub-contexts |
| `context/extensions/` | `ActivationManager`, `ExtensionsProvider`, `PluginAPIBridge`, `PluginUIContributions`, `RegistryClient` | Extension sub-contexts |
| `context/notebook/` | `CellManager`, `KernelManager`, `NotebookProvider`, `OutputRenderer` + types/utils | Notebook sub-contexts |
| `context/diff/` | `DiffEditorProvider` | Diff editor |
| `context/merge/` | `MergeEditorProvider` | Merge editor |
| `context/theme/` | `ThemeProvider`, `IconThemeProvider`, `ProductIconThemeProvider` + color tokens, Monaco sync | Theme sub-contexts |
| `context/keymap/` | `KeymapProvider` + chord handling, default bindings | Keymap sub-contexts |
| `context/iconTheme/` | `IconThemeProvider` | Icon theme |
| `context/tasks/` | `ProblemsManager`, `TaskExecutionManager` | Task sub-contexts |
| `context/i18n/` | `I18nContext` | i18n sub-context |
| `context/workspace/` | `MultiRootProvider` | Workspace sub-context |
| `context/utils/` | `ProviderComposer.tsx`, `LazyProvider.tsx` | Provider utilities |

### Hooks (`src/hooks/`) — 37 Files

| Hook | Purpose |
|------|---------|
| `useKeyboard` | Keyboard shortcut handling |
| `useTauriListen` | Tauri event subscription with cleanup |
| `useLocalStorage` | Persistent local storage |
| `useLSPEditor` | LSP integration for Monaco |
| `useInlineCompletions` | AI inline completions |
| `useDebounce` | Debounced values |
| `useAgents` | Agent management |
| `useAgentFollow` | Agent follow mode |
| `useCollabEditor` | Real-time collaboration for Monaco |
| `useCollabSync` | Collaboration sync |
| `useCommandDetection` | Terminal command detection |
| `useCommandRegistry` | Command registry |
| `useDebugKeyboard` | Debug keyboard shortcuts |
| `useDebugSession` | Debug session management |
| `useDiagnostics` | Diagnostics |
| `useEventListener` | DOM event listeners |
| `useFileSystem` | File system operations |
| `useHighFrequencyUpdates` | High-frequency state updates |
| `useIntersectionObserver` | Intersection observer |
| `useLspFeature` | LSP feature integration |
| `usePrevious` | Previous value tracking |
| `useQuickPickWizard` | Quick pick wizard |
| `useResizeObserver` | Resize observer |
| `useSnippetCompletions` | Snippet completions |
| `useTaskSubscription` | Task event subscription |
| `useTerminalAutoReply` | Terminal auto-reply |
| `useTerminalCompletion` | Terminal completions |
| `useTerminalImages` | Terminal image rendering |
| `useTerminalSearch` | Terminal search |
| `useThrottle` | Throttled values |
| `useWindowEvents` | Window event handling |
| `useAccessibility` | Accessibility features |
| `useAnimatedList` | Animated list transitions |
| `useAsync` | Async operation handling |
| `useAutoSave` | Auto-save |
| `useBracketColorization` | Bracket pair colorization |

### Providers (`src/providers/`) — 12 Monaco + 9 QuickAccess

**Monaco Providers** (bridge LSP → Monaco API):
`CallHierarchyProvider`, `CodeLensProvider`, `ColorProvider`, `DocumentLinkProvider`, `FoldingRangeProvider`, `InlayHintsProvider`, `InlineCompletionsProvider`, `LinkedEditingProvider`, `SelectionRangeProvider`, `TerminalCompletionProvider`, `TimelineProvider`, `TypeHierarchyProvider`

**QuickAccess Providers:**
`DebugProvider`, `EditorMRUProvider`, `ExtensionProvider`, `HelpProvider`, `IssueReporterProvider`, `TaskProvider`, `TerminalProvider`, `TextSearchProvider`, `WorkspaceSymbolsProvider`

### SDK (`src/sdk/`)

| File | Purpose |
|------|---------|
| `client.ts` | Typed Tauri IPC invoke wrappers |
| `executor.ts` | Command execution utilities |
| `types.ts` | SDK type definitions |
| `errors.ts` | Error types |
| `ipc.ts` | IPC utilities |
| `safe-invoke.ts` | Safe invoke wrapper |
| `collab.ts` | Collaboration SDK |
| `diagnostics.ts` | Diagnostics SDK |
| `git-graph.ts` | Git graph SDK |
| `extension-host-proxy.ts` | Extension host proxy |
| `scm-provider.ts` | SCM provider |
| `workspace-symbols.ts` | Workspace symbols SDK |
| `workspace-trust.ts` | Workspace trust SDK |

### Stores (`src/store/`)

| File | Purpose |
|------|---------|
| `debug.ts` | Debug state store |
| `fileTreeCache.ts` | File tree cache |
| `settings.ts` | Settings store |
| `ui.ts` | UI state store |
| `workspace.ts` | Workspace store |

### Utilities (`src/utils/`) — 140+ Files

Key utility categories:
- **AI:** `ai/CopilotProvider.ts`, `ai/SupermavenProvider.ts`
- **LLM:** `llm/OpenAIProvider.ts`, `llm/AnthropicProvider.ts`, `llm/DeepSeekProvider.ts`, `llm/GoogleAIProvider.ts`, `llm/MistralProvider.ts`, `llm/OpenRouterProvider.ts`
- **Git:** `git/errors.ts`, `git/registry.ts`, `git/types.ts`
- **Grid:** `grid/layoutFactories.ts`, `grid/manipulation.ts`, `grid/serialization.ts`, `grid/types.ts`
- **Editor:** `diffAlgorithm.ts`, `findReplace.ts`, `lineOperations.ts`, `bracketOperations.ts`, `multiCursor.ts`, `decorators.ts`
- **Terminal:** `shellIntegration.ts`, `shellQuoting.ts`, `terminalImageProtocols.ts`, `terminalLinks.ts`
- **Theme:** `theme-converter.ts`, `monaco-theme.ts`, `lazyStyles.ts`
- **Monaco:** `monacoManager.ts`, `semanticTokensProvider.ts`
- **IPC:** `ipcCache.ts`, `batchInvoke.ts`, `tauriBatch.ts`, `tauri.ts`, `tauri-api.ts`
- **Settings:** `settingsMigration.ts`, `settingsSearch.ts`, `settingsValidation.ts`, `restrictedSettings.ts`
- **Misc:** `eventBus.ts`, `logger.ts`, `retry.ts`, `format.ts`, `json.ts`, `jsonc.ts`, `config.ts`, `storage.ts`, `workspace.ts`

### Types (`src/types/`) — 28 Files

`admin.ts`, `agents.ts`, `ai.ts`, `authentication.ts`, `chat.ts`, `comments.ts`, `debug.ts`, `editor.ts`, `emmet.d.ts`, `events.ts`, `git.ts`, `keybindings.ts`, `layout.ts`, `notebooks.ts`, `quickInput.ts`, `remote-debug.ts`, `scm.ts`, `search.ts`, `settings.ts`, `share.ts`, `ssh.ts`, `tasks.ts`, `terminal.ts`, `testing.ts`, `toolInputs.ts`, `workbench.ts`, `workspace.ts`, `index.ts`

---

## Backend (`src-tauri/`) — Detailed Structure

### Configuration Files

| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust dependencies (edition 2024, nightly 1.85+) |
| `tauri.conf.json` | Tauri app config (CSP, windows, plugins, bundle) |
| `capabilities/default.json` | Tauri security capabilities |
| `build.rs` | Build script (tauri-build) |

### Entry Points

| File | Purpose |
|------|---------|
| `src/main.rs` | Binary entry → `cortex_gui_lib::run()` |
| `src/lib.rs` | Library entry — module declarations, `LazyState<T>`, `run()` |

### Module Map — All 48+ Modules

#### Core Infrastructure

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `app` | `src/app/` | 14 | Command registration, state init, app setup (split into ai/collab/editor/extension/git/i18n/misc/notebook/remote/settings/terminal/workspace command files) |
| `error` | `src/error.rs` | 1 | `CortexError` enum with thiserror |
| `batch` | `src/batch.rs` | 1 | IPC batch command system with MessagePack |
| `batch_ipc` | `src/batch_ipc.rs` | 1 | Batch IPC utilities |
| `models` | `src/models.rs` | 1 | Shared data models |
| `process` | `src/process.rs` | 1 | Process management |
| `process_utils` | `src/process_utils.rs` | 1 | Process utilities |
| `project` | `src/project.rs` | 1 | Project management |
| `window` | `src/window.rs` | 1 | Multi-window management |
| `system_specs` | `src/system_specs.rs` | 1 | System info and metrics |

#### AI & Agent System

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `ai` | `src/ai/` | 21 | AI providers (OpenAI, Anthropic, etc.), agent orchestration, completions, context, indexer, protocol, session, storage, thread, tools, types, vector store, OpenRouter commands |
| `acp` | `src/acp/` | 3 | Agent Control Protocol tool registry and execution |
| `factory` | `src/factory/` | 15 | Agent workflow orchestration: designer, executor (actions, agents, control flow, triggers), interception, audit, persistence |
| `prompt_store` | `src/prompt_store.rs` | 1 | Prompt template persistence |
| `rules_library` | `src/rules_library.rs` | 1 | Agent rules library |
| `action_log` | `src/action_log.rs` | 1 | Agent action tracking |

#### Editor & Language Intelligence

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `lsp` | `src/lsp/` | 25 | Full LSP client: document sync, completions, hover, definitions, references, diagnostics, semantic tokens, code lens, formatting, hierarchy, symbols, multi-provider |
| `dap` | `src/dap/` | 35 | Full DAP client: sessions, breakpoints, stepping, variables, stack frames, memory, navigation, disassembly, watch, threads |
| `editor` | `src/editor/` | 5 | Editor features: folding, inline diff, refactoring, snippets, symbols |
| `diagnostics` | `src/diagnostics.rs` | 1 | Diagnostic aggregation |
| `language_selector` | `src/language_selector.rs` | 1 | Language detection and selection |
| `formatter` | `src/formatter/` | 4 | Code formatting (Prettier integration) |

#### Terminal & Shell

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `terminal` | `src/terminal/` | 12 | PTY management, flow control, shell integration, profiles, links, search, protocol |
| `ssh_terminal` | `src/ssh_terminal.rs` | 1 | Remote SSH PTY sessions |

#### Git & VCS

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `git` | `src/git/` | 29 | Full Git via libgit2: bisect, blame, branch, cache, cherry-pick, clone, command, diff, forge, graph, helpers, hunk, lfs, lines, log, merge, merge-editor, pull-request, rebase, remote, staging, stash, status, submodule, tag, types, watcher, worktree |

#### File System & Workspace

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `fs` | `src/fs/` | 10 | File operations, directory, encoding, search, security, watcher, workspace edit |
| `fs_commands` | `src/fs_commands.rs` | 1 | File system Tauri commands |
| `workspace` | `src/workspace/` | 6 | Cross-folder ops, workspace trust, multi-root git status, manager |
| `workspace_settings` | `src/workspace_settings.rs` | 1 | Workspace/folder/language settings |
| `workspace_symbols` | `src/workspace_symbols.rs` | 1 | Workspace-wide symbol search (undeclared in lib.rs) |
| `search` | `src/search.rs` | 1 | Search and replace across files |
| `timeline` | `src/timeline.rs` | 1 | Local file history tracking |

#### Extensions & Plugins

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `extensions` | `src/extensions/` | 27 | VS Code-compatible extension system: activation, marketplace, registry, permissions, plugin API, contributions, WASM runtime (wasmtime), Node.js host, WIT interface |
| `context_server` | `src/context_server/` | 4 | MCP client for external context servers |
| `mcp` | `src/mcp/` | 3 | MCP TCP server for AI agent debugging |

#### Collaboration & Remote

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `collab` | `src/collab/` | 8 | Real-time collaboration: CRDT (yrs), WebSocket server, session/room management, awareness, auth |
| `remote` | `src/remote/` | 9 | SSH remote development: connection, credentials, file ops, port forwarding, tunnels |

#### Security & Sandboxing

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `sandbox` | `src/sandbox/` | 15 | Sandboxed execution: ACL, audit, capabilities, DPAPI, elevated impl, environment, identity, Linux/macOS platform-specific, process, users, token, Windows utils |
| `deep_link` | `src/deep_link.rs` | 1 | `cortex://` deep link handler |

#### Settings & Configuration

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `settings` | `src/settings/` | 5 | User/workspace settings with profiles and secure storage |
| `settings_sync` | `src/settings_sync/` | 5 | Settings sync via GitHub Gist |
| `keybindings` | `src/keybindings.rs` | 1 | Keybinding management |
| `themes` | `src/themes.rs` | 1 | Theme management |
| `i18n` | `src/i18n/` | 1+ | Internationalization: locale detection |

#### Testing & Tasks

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `testing` | `src/testing/` | 8 | Test framework detection, discovery, execution, coverage, watch, single test |
| `tasks` | `src/tasks.rs` | 1 | Task runner integration |

#### Notebook & REPL

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `notebook` | `src/notebook/` | 3 | Jupyter-style notebook kernel management |
| `repl` | `src/repl/` | 4 | REPL kernel management (Jupyter protocol) |

#### Misc

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `auto_update` | `src/auto_update.rs` | 1 | Application auto-update |
| `browser` | `src/browser.rs` | 1 | Embedded browser webview |
| `activity` | `src/activity.rs` | 1 | User activity tracking |
| `toolchain` | `src/toolchain.rs` | 1 | Language toolchain detection |
| `wsl` | `src/wsl.rs` | 1 | WSL integration |
| `output_channels` | `src/output_channels.rs` | 1 | Output channels (undeclared in lib.rs) |
| `snippets` | `src/snippets.rs` | 1 | Snippet management (undeclared in lib.rs) |
| `commands` | `src/commands/` | — | Additional commands module |

#### Local Engine Modules

| Module | Path | Files | Description |
|--------|------|-------|-------------|
| `cortex_engine` | `src/cortex_engine/` | 3 | Config, session, SSRF security |
| `cortex_protocol` | `src/cortex_protocol/` | 1 | Event/submission types, policies |
| `cortex_storage` | `src/cortex_storage/` | 1 | Session persistence, message history |

#### Shell Integration Resources

| File | Purpose |
|------|---------|
| `src/resources/shell-integration-bash.sh` | Bash shell integration (OSC 633) |
| `src/resources/shell-integration-zsh.sh` | Zsh shell integration |
| `src/resources/shell-integration-fish.fish` | Fish shell integration |
| `src/resources/shell-integration-pwsh.ps1` | PowerShell shell integration |

---

## MCP Server (`mcp-server/`)

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server setup with stdio transport, 396 lines |
| `src/client.ts` | `CortexSocketClient` connecting to Cortex Desktop TCP (port 4000), 264 lines |
| `package.json` | Dependencies: `@modelcontextprotocol/sdk`, `zod` |
| `tsconfig.json` | TypeScript config (ES2022, NodeNext) |
| `AGENTS.md` | MCP server agent docs |

---

## Build & Test Commands

### Frontend

```bash
npm install                    # Install dependencies
npm run dev                    # Start Vite dev server (port 1420)
npm run build                  # Production build (output: dist/)
npm run typecheck              # TypeScript type checking (tsc --noEmit)
npm run test                   # Run Vitest tests
npm run test:watch             # Run tests in watch mode
npm run test:coverage          # Run tests with coverage
npm run build:analyze          # Build with bundle analysis
```

### Backend (Rust / Tauri)

```bash
cd src-tauri
cargo fmt --all                                   # Format Rust code
cargo fmt --all -- --check                        # Check formatting
cargo clippy --all-targets -- -D warnings         # Lint
cargo check                                       # Type check (fast)
cargo build                                       # Debug build
cargo build --release                             # Release build
cargo test                                        # Run Rust tests
```

### Full App (Tauri)

```bash
npm run tauri:dev              # Dev mode (frontend + backend hot reload)
npm run tauri:build            # Production desktop app build
```

---

## CI Pipeline (`.github/workflows/ci.yml`)

| Job | Platform | What it does |
|-----|----------|-------------|
| `frontend` | Ubuntu | TypeScript typecheck + Vitest tests + Vite build → uploads `dist/` |
| `rust-checks` | Ubuntu | Rust fmt (nightly) + clippy + tests (needs `dist/` artifact) |
| `gui-check-macos` | macOS | `cargo check` (needs `dist/` artifact) |
| `gui-check-windows` | Windows | `cargo check` (needs `dist/` artifact) |
| `ci-success` | — | Aggregates all check results |
| `release` | — | Semantic release on push to main/master |

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript: strict, SolidJS JSX, `@/` alias, ES2021 target |
| `vite.config.ts` | Vite: SolidJS plugin, Tailwind, 20+ manual chunks, code splitting |
| `vitest.config.ts` | Vitest: jsdom, 1125 test files, coverage config |
| `src-tauri/Cargo.toml` | Rust: edition 2024, nightly 1.85+, 50+ dependencies |
| `src-tauri/tauri.conf.json` | Tauri: CSP, window config, plugins, bundle targets |
| `src-tauri/capabilities/default.json` | Tauri security capabilities |
| `.releaserc.json` | Semantic release configuration |
| `.githooks/pre-commit` | Pre-commit: cargo fmt + npm typecheck |
| `.githooks/pre-push` | Pre-push: full quality gate |

---

## Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | SolidJS | 1.9.11 |
| TypeScript | TypeScript | 5.9.3 |
| UI Components | Kobalte (headless) | 0.13.11 |
| Styling | Tailwind CSS | 4.2.0 |
| Code Editor | Monaco Editor | 0.55.1 |
| Terminal | xterm.js | 6.0 |
| Bundler | Vite | 7.3.1 |
| Testing | Vitest | 4.0.18 |
| Desktop Framework | Tauri | 2.10 |
| Rust Edition | 2024 | nightly 1.85+ |
| Async Runtime | Tokio | full features |
| Database | SQLite | rusqlite (bundled) |
| Git | libgit2 | git2 crate |
| WASM Runtime | wasmtime | 29 |
| CRDT | yrs (Yjs) | — |
| Syntax Highlighting | Shiki | 3.22+ |
| MCP | @modelcontextprotocol/sdk | 1.25.3 |
| State Management | Zustand + solid-zustand | 5.0.11 |
