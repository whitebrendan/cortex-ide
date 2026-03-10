# Backend Architecture & Command-Surface Audit

**Project:** Cortex IDE (`src-tauri/`)
**Audit scope:** `src-tauri/src/lib.rs`, `src-tauri/src/app/**`, backend command modules under `src-tauri/src/**`, `src-tauri/AGENTS.md`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, and `rust-compilation-audit.md`
**Out of scope:** vendored `src-tauri/window-vibrancy/` (intentionally not reviewed or modified)

---

## Executive summary

The backend is a large Tauri v2 monolith with a clear top-level boot path but a very broad IPC surface. `src-tauri/src/lib.rs:123-167` builds one `tauri::Builder`, registers plugins, manages shared state through `app::register_state`, and exposes the entire backend through a single `invoke_handler(app::cortex_commands!())`. Under the default feature set (`src-tauri/Cargo.toml:148-153`), the macro chain registers **977 unique Tauri commands** across 12 groups.

Architecturally, the most positive pattern is the startup split in `src-tauri/src/app/mod.rs`: Phase A preloads only settings and windows (`src-tauri/src/app/mod.rs:635-670`), while Phase B defers extensions, LSP, SSH profiles, updater checks, AI provider initialization, debug MCP startup, and factory persistence until the frontend explicitly calls `frontend_ready` (`src-tauri/src/app/mod.rs:476-600`). The state graph is also mostly well-structured, with `LazyState<T>` used for heavier subsystems in `src-tauri/src/lib.rs:72-104` and `src-tauri/src/app/mod.rs:395-468`.

The main architectural risks are drift and surface area, not compilation health. `rust-compilation-audit.md:15-31` reports clean builds, clean clippy under project lints, and 413 passing tests, but the backend currently carries several kinds of dead or misleading surface:

- placeholder app/server commands and state in `src-tauri/src/app/mod.rs:148-245`
- sync file/process work inside async command paths despite the backend guidance in `src-tauri/AGENTS.md:102-112`
- compiled command functions that are never added to the registration macros
- three entire command-bearing modules that are not even declared in `lib.rs`
- partially implemented REPL/Jupyter code paths that advertise more capability than the runtime currently provides

---

## 1. Runtime architecture and startup flow

### 1.1 Entry path

- `src-tauri/src/main.rs:3-5` calls `cortex_gui_lib::run()`.
- `src-tauri/src/lib.rs:107-183` is the real backend entry point.
- `src-tauri/src/app/mod.rs` owns the command registry, state registration, setup flow, and shutdown handling.

### 1.2 Builder and plugin registration

`src-tauri/src/lib.rs:123-147` registers these plugins:

| Plugin | Condition | Notes |
|---|---|---|
| `tauri-plugin-shell` | always | Backed by `shell:allow-open` and explicit `shell:allow-spawn` allowlist in `src-tauri/capabilities/default.json:33-45` |
| `tauri-plugin-dialog` | always | Dialog permissions granted in `src-tauri/capabilities/default.json:46-50` |
| `tauri-plugin-clipboard-manager` | always | Used by `copy_logs_to_clipboard` (`src-tauri/src/app/mod.rs:221-232`) |
| `tauri-plugin-process` | always | Process restart/exit permissions in `src-tauri/capabilities/default.json:53-54` |
| `tauri-plugin-os` | always | Locale/platform/version access permissions in `src-tauri/capabilities/default.json:55-59` |
| `tauri-plugin-notification` | always | Used by `show_notification` (`src-tauri/src/app/mod.rs:245-252`) |
| `tauri-plugin-fs` | always | Backed by broad `fs:default` in `src-tauri/capabilities/default.json:61` |
| `tauri-plugin-mcp-bridge` | `#[cfg(debug_assertions)]` | Debug-only bridge bound to `127.0.0.1` in `src-tauri/src/lib.rs:132-137` |
| `tauri-plugin-single-instance` | desktop only | Refocuses main window on second launch (`src-tauri/src/lib.rs:139-145`) |
| `tauri-plugin-updater` | desktop only | Registered in Rust even though updater config is currently inactive in `src-tauri/tauri.conf.json:70-76` |
| `tauri-plugin-deep-link` | desktop only | `cortex://` handler wired in setup (`src-tauri/src/lib.rs:146-147`, `src-tauri/src/app/mod.rs:611-633`) |

### 1.3 Startup phases

The backend intentionally avoids doing all initialization in `setup()`.

**Phase A (critical path)** — `src-tauri/src/app/mod.rs:635-670`
- restore window sessions
- preload settings
- emit `backend:ready`

**Phase B (deferred, triggered by frontend)** — `src-tauri/src/app/mod.rs:476-600`
- preload extensions through `spawn_blocking`
- attach LSP event listeners
- load SSH profiles
- initialize auto-update checks
- initialize AI providers from settings
- start the debug MCP socket server
- initialize factory persistence
- emit `backend:phase_b_ready`

**Observations**
- This split is a strong architectural choice for perceived startup performance.
- The backend depends on the frontend calling `frontend_ready` (`src-tauri/src/app/mod.rs:587-600`). If that signal is never emitted, heavy subsystems remain partially initialized.

### 1.4 Shutdown path

`src-tauri/src/app/mod.rs:685-894` cleans up terminals, SSH sessions, remote connections, LSP, DAP, MCP bridge, Node host, tunnels, collab, AI sessions, and persisted windows during `RunEvent::ExitRequested`.

This is comprehensive, but several cleanup steps use `tauri::async_runtime::block_on(...)` directly in the run-event handler (`src-tauri/src/app/mod.rs:722`, `765-771`, `777-783`, `812-814`, `822-825`, `832-...`). That improves determinism but can also make shutdown latency sensitive to stuck async cleanup.

---

## 2. Command registration model and inventory

### 2.1 Registration pattern

The backend uses a macro-chain registry in `src-tauri/src/app/mod.rs:45-146`:

- `cortex_commands!()` starts the chain
- each `src-tauri/src/app/*_commands.rs` file appends command paths
- `collect_final!` feeds the accumulated list into `tauri::generate_handler!`
- `src-tauri/src/lib.rs:157-160` installs the resulting handler as one monolithic `invoke_handler`

This approach is organized by domain, but it also means the app ships one flat invoke surface rather than smaller trust-partitioned handlers.

### 2.2 Registered command counts (default feature set)

Using the active macros with default features enabled (`src-tauri/Cargo.toml:148-153`), the command surface is:

| Group | Macro file | Registered commands |
|---|---|---:|
| Misc | `src-tauri/src/app/misc_commands.rs` | 162 |
| Editor | `src-tauri/src/app/editor_commands.rs` | 161 |
| Workspace | `src-tauri/src/app/workspace_commands.rs` | 154 |
| Git | `src-tauri/src/app/git_commands.rs` | 150 |
| Extension | `src-tauri/src/app/extension_commands.rs` | 103 |
| AI / Factory | `src-tauri/src/app/ai_commands.rs` | 92 |
| Remote | `src-tauri/src/app/remote_commands.rs` | 40 |
| Terminal | `src-tauri/src/app/terminal_commands.rs` | 39 |
| Settings | `src-tauri/src/app/settings_commands.rs` | 36 |
| Notebook / REPL | `src-tauri/src/app/notebook_commands.rs` | 25 |
| Collab | `src-tauri/src/app/collab_commands.rs` | 12 |
| I18n | `src-tauri/src/app/i18n_commands.rs` | 3 |
| **Total** | — | **977 unique commands** |

### 2.3 What the surface contains

Highlights by group:

- **Editor** (`src-tauri/src/app/editor_commands.rs:5-194`): LSP server/document/completion/navigation/actions/formatting/symbols, multi-provider LSP, CodeLens, semantic tokens, diagnostics-adjacent editor helpers, DAP, toolchain detection, formatter commands, language selector, and editor refactor helpers.
- **Workspace** (`src-tauri/src/app/workspace_commands.rs:5-171`): workspace settings, multi-root workspace management, search/replace, testing, tasks, filesystem CRUD/search/watchers, project recents, and batch IPC.
- **Misc** (`src-tauri/src/app/misc_commands.rs:5-187`): lifecycle, placeholder server commands, updater, system specs, context-server/MCP client operations, activity/timeline/action log, diagnostics, rules library, prompt store, ACP, sandbox, custom MCP server/bridge, windows, WSL, browser webview, and process termination.
- **Extension** (`src-tauri/src/app/extension_commands.rs:5-123`): marketplace, extension registry, permissions, plugin APIs, WASM runtime, and Node.js extension host.
- **AI** (`src-tauri/src/app/ai_commands.rs:5-107`): provider configuration, threads, Cortex sessions, tool execution, agents, inline completions, codebase indexing, prompt/context retrieval, and factory workflows.

### 2.4 Architectural implication

The command surface is too large to reason about informally. A single frontend build can reach nearly a thousand backend entry points, spanning filesystem, process, remote execution, browser/webview management, AI, collaboration, Git, and extension-host control. That is workable, but it increases the cost of auditing every trust boundary manually and makes drift more likely.

---

## 3. State management and initialization

### 3.1 `LazyState<T>` wrapper

`src-tauri/src/lib.rs:72-104` defines `LazyState<T>` around `OnceLock<T>` for on-demand initialization. This matches the backend guidance in `src-tauri/AGENTS.md:104-105` to keep state thread-safe and avoid front-loading heavy work.

### 3.2 Registered state inventory

`src-tauri/src/app/mod.rs:395-468` registers **59 managed state objects** before build, plus a setup-only `WindowManagerState` in `src-tauri/src/app/mod.rs:603-607`.

**Clearly eager state** includes:
- `LspState`, `ToolchainState`, `AIState`, `AIToolsState`, `AgentState`, `AgentStoreState`
- `TerminalState`, `TerminalProfilesState`
- `SettingsState`, `SettingsSyncState`
- file watcher/cache/semaphore/batch cache state
- `McpState`, `McpBridgeState`
- `ThemeState`, `KeybindingsState`, `WorkspaceManagerState`, `ProjectState`
- `RemoteManager`, tunnel/port-forwarding state, forge state, etc.

**Explicitly lazy state** includes:
- `ExtensionsState` (`src-tauri/src/app/mod.rs:403-405`)
- `DebuggerState` (`src-tauri/src/app/mod.rs:412`)
- `ContextServerState` (`src-tauri/src/app/mod.rs:417`)
- `TestWatcherState` (`src-tauri/src/app/mod.rs:444`)
- `FactoryState` (`src-tauri/src/app/mod.rs:445`)
- `SandboxState` (`src-tauri/src/app/mod.rs:460`)
- `CollabState` (`src-tauri/src/app/mod.rs:463`)

**Custom lazy-by-option state**
- `REPLState(pub Arc<Mutex<Option<KernelManager>>>)` in `src-tauri/src/app/mod.rs:157-158`, initialized inside the first REPL command (`src-tauri/src/app/mod.rs:257-305`) rather than in startup.

**Setup-only state**
- `WindowManagerState` is managed in `setup_app`, not in `register_state` (`src-tauri/src/app/mod.rs:603-607`). That split is important when reading command code that assumes the state already exists.

### 3.3 Strengths

- The state graph is explicit and centralized.
- The heavier modules that do not need immediate startup are mostly lazy.
- Phase A vs Phase B work is intentionally separated.

### 3.4 Weak spots

- Some legacy state appears registered but not functionally wired (see placeholder server/logging issue below).
- `#![allow(dead_code)]` at crate root (`src-tauri/src/lib.rs:1`) makes state/command drift easier to accumulate without compiler pressure.

---

## 4. Async/blocking boundary review

`src-tauri/AGENTS.md:102-112` explicitly says async commands should not block the runtime and should use `spawn_blocking` for unavoidable sync work. The codebase has both good examples and notable violations.

### 4.1 Good patterns already present

| Area | Evidence | Notes |
|---|---|---|
| Deferred extension preload | `src-tauri/src/app/mod.rs:497-502` | `spawn_blocking` around extension preload in Phase B |
| Toolchain detection | `src-tauri/src/toolchain.rs:789-790`, `812-830` | blocking filesystem/probing pushed to `spawn_blocking` |
| Theme import/export | `src-tauri/src/themes.rs:177-179`, `273-275` | sync file work moved off the async executor |
| Notebook parsing/export | `src-tauri/src/notebook/commands.rs:21`, `41`, `67`, `153`, `227` | JSON parse/render work wrapped in `spawn_blocking` |
| Workspace symbol indexing | `src-tauri/src/workspace_symbols.rs:537-539` | blocking indexing intentionally delegated (but the module is currently undeclared) |

### 4.2 Blocking concerns found

#### Issue A — async settings-profile commands still use `std::fs`

**Evidence**
- `src-tauri/src/settings/profiles.rs:54-123` defines async commands `profiles_save` and `profiles_load`
- both commands call `std::fs::create_dir_all`, `std::fs::write`, and `std::fs::read_to_string`

**Why it matters**
These are command entry points reached from the webview. Blocking disk I/O here directly conflicts with the backend rule in `src-tauri/AGENTS.md:105`.

**Candidate fix**
Convert these commands to `tokio::fs` or wrap the legacy sync path in `spawn_blocking`. The rest of the same file already uses async I/O for newer commands (`src-tauri/src/settings/profiles.rs:130-376`), so the module is internally inconsistent.

#### Issue B — window session persistence uses sync file I/O from async-triggered flows

**Evidence**
- `src-tauri/src/window.rs:69-102` uses `fs::create_dir_all` and `fs::write`
- the helpers are called by async commands `register_window_project` and `update_window_state` (`src-tauri/src/window.rs:113-161`) and by close/exit handling (`src-tauri/src/window.rs:164-188`, `src-tauri/src/app/mod.rs:160-165`, `881-885`)

**Why it matters**
This is on user-interaction paths: window state updates, close handling, and exit handling. It is unlikely to dominate normal runtime, but it is still synchronous disk I/O on hot UI-adjacent paths.

**Candidate fix**
Move persistence to `tokio::fs` or enqueue session saves onto a debounced background task.

#### Issue C — REPL commands keep sync process/state management on async call paths

**Evidence**
- `src-tauri/src/app/mod.rs:257-359` uses `std::sync::Mutex` for `REPLState`
- `src-tauri/src/repl/kernel.rs:139-145` and `213-219` synchronously spawn Python/Node child processes
- `src-tauri/src/repl/kernel.rs:158-198` and `231-...` start dedicated reader threads instead of async tasks

**Why it matters**
The REPL layer is effectively a synchronous subsystem accessed through async Tauri commands. It works, but it does not follow the same async discipline as the rest of the backend.

**Candidate fix**
Either (a) move `KernelManager` calls behind `spawn_blocking`, or (b) refactor the REPL manager to an async-aware state model using `tokio::process` and async locks/channels.

#### Issue D — shutdown uses repeated `block_on` calls in run-event handling

**Evidence**
- `src-tauri/src/app/mod.rs:722`
- `src-tauri/src/app/mod.rs:765-771`
- `src-tauri/src/app/mod.rs:777-783`
- `src-tauri/src/app/mod.rs:812-814`
- `src-tauri/src/app/mod.rs:822-825`

**Why it matters**
This is not a steady-state performance problem, but it can turn app shutdown into a serial blocking path. Any hung cleanup future can freeze exit.

**Candidate fix**
Aggregate shutdown into a bounded async cleanup routine with timeouts, then join it from one place.

---

## 5. Capabilities, CSP, and exposed native surface

### 5.1 Capability posture

`src-tauri/capabilities/default.json:6-63` grants a broad baseline:

- core event emit/listen permissions
- webview/window create/focus/resize/print controls
- `shell:allow-open`
- `shell:allow-spawn` for `git`, `node`, `npm`, `npx`, `cargo`, `python`, `python3` with unrestricted args (`src-tauri/capabilities/default.json:35-44`)
- dialog open/save/message/ask/confirm
- clipboard read/write
- process restart/exit
- OS metadata access
- deep-link default
- `fs:default`
- `mcp-bridge:default`

### 5.2 CSP posture

`src-tauri/tauri.conf.json:14-16` permits:

- `script-src 'self' 'wasm-unsafe-eval'`
- `style-src 'self' 'unsafe-inline'`
- `connect-src 'self'` plus all localhost HTTP/WS ports and several remote AI/GitHub domains
- `worker-src 'self' blob:`

This is more permissive than a simple desktop shell, but it matches the product’s use of localhost services, streaming AI providers, and worker-based frontend infrastructure.

### 5.3 Notable interactions and drift

#### Observation — debug-only MCP bridge permission is present in the default capability

**Evidence**
- debug bridge plugin only in `src-tauri/src/lib.rs:132-137`
- capability still grants `mcp-bridge:default` in `src-tauri/capabilities/default.json:62`

**Implication**
Release builds ship a capability entry for a plugin that is only registered in debug builds. This is configuration drift rather than an immediate vulnerability, but it makes the security story harder to reason about.

**Candidate fix**
Split debug vs release capabilities or document why the release config intentionally carries debug-only permission entries.

#### Observation — updater surface is exposed while updater config is inactive

**Evidence**
- updater plugin registered in `src-tauri/src/lib.rs:146`
- Phase B always calls `init_auto_update` (`src-tauri/src/app/mod.rs:520-523`)
- custom auto-update commands are exported in `src-tauri/src/app/misc_commands.rs:17-26`
- config currently sets `"active": false` and an empty `pubkey` in `src-tauri/tauri.conf.json:70-76`

**Implication**
The update API surface is present, but production updater behavior is currently configuration-dependent and likely incomplete until signing/pubkey setup is finished.

**Candidate fix**
Gate update commands behind a config check or hide them from the frontend until updater config is complete.

#### Observation — command trust is enforced mostly in code, not by command partitioning

`src-tauri/src/lib.rs:157-160` exposes all custom commands through one `invoke_handler`. Some subsystems do their own validation correctly—for example:

- context-server URLs are restricted to HTTP/SSE over `http`/`https` in `src-tauri/src/context_server/commands.rs:17-37`
- MCP bridge startup validates a trusted workspace path in `src-tauri/src/mcp/commands.rs:63-77`
- extension workspace file access goes through permission checks in `src-tauri/src/extensions/api/workspace.rs:299-376`

That is good, but it also means privileged surface reduction depends on every command author remembering to add those checks.

---

## 6. Dead, undeclared, or registration-drifted modules

### 6.1 Entire command-bearing files not declared in `lib.rs`

`rust-compilation-audit.md:306-314` already flags three files under `src-tauri/src/` that are **not declared in `src-tauri/src/lib.rs:7-64`**:

| File | Status | Impact |
|---|---|---|
| `src-tauri/src/output_channels.rs` | not declared in `lib.rs`; not compiled | 10 output-channel commands are dead code |
| `src-tauri/src/snippets.rs` | not declared in `lib.rs`; not compiled | 10 snippet-management commands are dead code |
| `src-tauri/src/workspace_symbols.rs` | not declared in `lib.rs`; not compiled | 4 workspace-symbol commands are dead code |

This matches the current audit: those files define `#[tauri::command]` functions, but they are absent from the module list in `lib.rs` and absent from the app macro registry.

### 6.2 Compiled command functions that are never registered

Separate from undeclared files, several compiled modules define valid Tauri commands that are **not referenced by `src-tauri/src/app/extension_commands.rs`**:

| File | Example commands | Evidence of drift |
|---|---|---|
| `src-tauri/src/extensions/api/window.rs` | `plugin_create_tree_view`, `plugin_create_webview_panel`, `plugin_create_text_editor_decoration_type`, `plugin_set_decorations`, terminal helpers | commands exist at `src-tauri/src/extensions/api/window.rs:537-610`, but the macro only registers window API commands through `plugin_create_terminal` at `src-tauri/src/app/extension_commands.rs:63-72` |
| `src-tauri/src/extensions/api/workspace.rs` | `plugin_stat_file`, `plugin_read_file`, `plugin_write_file` | commands exist at `src-tauri/src/extensions/api/workspace.rs:299-376`, but the macro stops at `plugin_on_config_change` in `src-tauri/src/app/extension_commands.rs:73-80` |
| `src-tauri/src/extensions/contributions.rs` | `get_extension_menus`, `get_extension_views_containers`, `get_extension_views`, `get_extension_configuration`, `get_extension_grammars` | only the earlier contribution getters are registered in `src-tauri/src/app/extension_commands.rs:27-34` |
| `src-tauri/src/extensions/marketplace.rs` | `install_from_vsix` | command exists at `src-tauri/src/extensions/marketplace.rs:594-596`, but `src-tauri/src/app/extension_commands.rs:21-25` does not register it |
| `src-tauri/src/extensions/plugin_api.rs` | `plugin_api_get_document`, `plugin_api_set_decorations` | the macro only registers the first three plugin API helpers in `src-tauri/src/app/extension_commands.rs:55-58` |
| `src-tauri/src/extensions/wasm/mod.rs` | `notify_wasm_file_save`, `notify_wasm_file_open`, `notify_wasm_workspace_change`, `notify_wasm_selection_change` | commands exist at `src-tauri/src/extensions/wasm/mod.rs:129-193`, but the macro only registers runtime lifecycle commands |
| `src-tauri/src/extensions/node_host/commands.rs` | `start_extension_host`, `install_vscode_extension`, `activate_extension`, `call_extension_api` | legacy-looking wrappers exist, while a different API surface is registered from `src-tauri/src/extensions/node_host/mod.rs:68-197` |

### 6.3 Why this matters

There are two different classes of drift:

1. **undeclared files** — dead code that never compiles
2. **compiled but unregistered commands** — reachable by Rust callers but not reachable through Tauri IPC

Both make it harder to know what the real backend contract is.

**Candidate fix**
Add CI that compares `#[tauri::command]` symbols against the registration macros, with an allowlist for intentionally internal-only commands.

---

## 7. Concrete issues and candidate fixes

### 7.1 High — placeholder server/logging surface is still exported

**Evidence**
- `ServerState`, `LogState`, `PortState`, and `find_free_port` are defined in `src-tauri/src/app/mod.rs:148-184`
- `start_server` always returns `127.0.0.1:4096` and `running: true` (`src-tauri/src/app/mod.rs:188-195`)
- `stop_server` is a no-op (`src-tauri/src/app/mod.rs:197-200`)
- `get_server_info` returns the same hard-coded data (`src-tauri/src/app/mod.rs:202-209`)
- this audit found no producers for `LogState`; the only runtime uses are the read/copy commands (`src-tauri/src/app/mod.rs:211-232`)

**Impact**
Frontend code can invoke a server API that appears real but is effectively stubbed. This is misleading and increases maintenance cost because the placeholder state is still managed globally.

**Candidate fix**
Either wire these commands to a real sidecar/server implementation and remove the hard-coded values, or delete the commands and their associated state until the feature actually exists.

### 7.2 High — blocking file I/O remains in async command paths

See section 4.2 Issue A and Issue B.

**Candidate fix**
Normalize on `tokio::fs` or `spawn_blocking` across all async commands; add a lint/test that rejects `std::fs` inside `#[tauri::command] async fn` bodies unless explicitly exempted.

### 7.3 Medium — REPL runtime advertises more than it cleanly supports

**Evidence**
- REPL commands are exported in `src-tauri/src/app/notebook_commands.rs:5-13`
- `src-tauri/src/repl/jupyter.rs` implements Jupyter message types and tests
- `KernelType::Jupyter` still returns `"Jupyter kernels not yet implemented"` in `src-tauri/src/repl/kernel.rs:97-103`
- stdout/stderr reader threads attach events to `"<spec>_pending"` IDs instead of the final kernel ID in `src-tauri/src/repl/kernel.rs:153-158` and `226-231`

**Impact**
The REPL layer looks richer than the actual runtime. Event consumers may also see output tagged with placeholder IDs that do not match the kernel ID returned to the frontend.

**Candidate fix**
Create the final kernel ID before wiring readers, pass it into the child-process setup, and either fully implement Jupyter kernels or remove/hide Jupyter-specific types until they are actually reachable.

### 7.4 Medium — command-registration drift is already substantial

See section 6.2.

**Impact**
It is easy for backend code to define a `#[tauri::command]` and still forget to export it. The current macro chain does not help detect this.

**Candidate fix**
Generate the registry from annotated modules, or add a test/CI script that fails when command symbols exist outside the registered set.

### 7.5 Medium — crate-wide `dead_code` allowance reduces compiler help

**Evidence**
- `src-tauri/src/lib.rs:1` uses `#![allow(dead_code)]`
- the repo already has undeclared modules and placeholder state/commands

**Impact**
The compiler is prevented from surfacing some of the exact drift that this audit found.

**Candidate fix**
Remove the crate-wide allowance and replace it with narrower `#[allow(dead_code)]` only where genuinely needed.

### 7.6 Low/Medium — security configuration is broad and partially drifted

**Evidence**
- `shell:allow-spawn` permits six common toolchains with unrestricted args (`src-tauri/capabilities/default.json:35-44`)
- `fs:default` is granted globally (`src-tauri/capabilities/default.json:61`)
- CSP allows all localhost HTTP/WS endpoints in all builds (`src-tauri/tauri.conf.json:15`)
- `mcp-bridge:default` is granted even though the plugin is debug-only (`src-tauri/capabilities/default.json:62`, `src-tauri/src/lib.rs:132-137`)

**Impact**
This is not a proven vulnerability by itself, but it enlarges the blast radius of any frontend compromise or missing per-command validation.

**Candidate fix**
Split debug/release capability manifests, narrow plugin permissions to what the frontend actually uses, and document which localhost endpoints are required in production.

### 7.7 Low/Medium — exit cleanup is comprehensive but serial and blocking

See section 4.2 Issue D.

**Candidate fix**
Refactor exit cleanup into a single orchestrated async shutdown routine with per-subsystem timeouts and structured logging of cleanup failures.

---

## 8. Modules that appear healthy or thoughtfully designed

This audit focused on risk, but several patterns are worth preserving:

- **Startup staging** is clearly intentional and performance-minded (`src-tauri/src/app/mod.rs:476-670`).
- **Lazy state** is a good fit for optional/heavy subsystems (`src-tauri/src/lib.rs:72-104`).
- **Subsystem ownership** is mostly clear: `app/` aggregates, feature modules implement.
- **Validation exists in sensitive places**, e.g.:
  - MCP/context server URL validation (`src-tauri/src/context_server/commands.rs:17-37`)
  - trusted workspace validation before starting the MCP bridge (`src-tauri/src/mcp/commands.rs:63-77`)
  - extension workspace permission checks (`src-tauri/src/extensions/api/workspace.rs:299-376`)
- **Compilation quality is currently strong** per `rust-compilation-audit.md:15-31`.

---

## 9. Recommended next steps

1. **Delete or wire placeholder app/server commands** in `src-tauri/src/app/mod.rs`.
2. **Eliminate blocking disk I/O in async commands**, starting with `settings/profiles.rs` and `window.rs`.
3. **Add CI for command-registration drift** (`#[tauri::command]` vs macro registry).
4. **Resolve undeclared modules** (`output_channels.rs`, `snippets.rs`, `workspace_symbols.rs`) one way or the other.
5. **Tighten the REPL contract** so returned kernel IDs and emitted events align, and hide unimplemented Jupyter support.
6. **Review release-vs-debug security config** for MCP bridge, updater, and localhost CSP scope.
7. **Consider removing crate-wide `dead_code` allow** after the cleanup pass.

---

## Appendix A — source references reviewed

- `src-tauri/src/lib.rs`
- `src-tauri/src/app/mod.rs`
- `src-tauri/src/app/*_commands.rs`
- `src-tauri/src/context_server/commands.rs`
- `src-tauri/src/mcp/commands.rs`
- `src-tauri/src/settings/profiles.rs`
- `src-tauri/src/window.rs`
- `src-tauri/src/repl/kernel.rs`
- `src-tauri/src/repl/jupyter.rs`
- `src-tauri/src/extensions/api/window.rs`
- `src-tauri/src/extensions/api/workspace.rs`
- `src-tauri/src/extensions/contributions.rs`
- `src-tauri/src/extensions/marketplace.rs`
- `src-tauri/src/extensions/node_host/commands.rs`
- `src-tauri/src/extensions/node_host/mod.rs`
- `src-tauri/src/extensions/wasm/mod.rs`
- `src-tauri/AGENTS.md`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/Cargo.toml`
- `rust-compilation-audit.md`
