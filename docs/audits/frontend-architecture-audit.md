# Frontend architecture audit

## Scope

This audit reviews the frontend runtime architecture around the Solid/Vite entry stack, top-level shell/layout modules, provider composition, representative feature directories, and the thin HTTP-facing API layer.

Primary files reviewed:

- `src/index.tsx`
- `src/App.tsx`
- `src/AppShell.tsx`
- `src/AppCore.tsx`
- `src/context/OptimizedProviders.tsx`
- `src/context/SDKContext.tsx`
- `src/components/cortex/CortexDesktopLayout.tsx`
- `src/components/cortex/layout/CortexIDELayout.tsx`
- `src/components/cortex/layout/CortexBottomPanelContainer.tsx`
- `src/pages/Session.tsx`
- `src/pages/Welcome.tsx`
- `src/pages/admin/AdminSessions.tsx`
- `src/pages/share/SharedSession.tsx`
- `src/api/admin.ts`
- `src/api/agents.ts`
- `src/api/share.ts`
- Representative feature files under `src/components/editor`, `src/components/terminal`, `src/components/git`, `src/components/ai`, and `src/components/tasks`
- Root config: `vite.config.ts`, `tsconfig.json`, `package.json`

Existing audit artifacts used to avoid duplicating prior work:

- `PROJECT_STRUCTURE.md:122-324` for directory/context inventory
- `error-catalog.md:231-327` for `requestIdleCallback` typing debt
- `bug-report-ipc-command.md:73-99` for the previously observed `frontend_ready` startup risk

## Executive summary

The frontend is organized around a deliberately split startup path:

1. `src/index.tsx` does minimal synchronous boot work, pre-resolves the initial route, and mounts the router.
2. `src/AppShell.tsx` provides the minimal root shell, error boundary, splash screen, and lazy import boundary for `AppCore`.
3. `src/AppCore.tsx` is the real orchestration hub: it installs providers, initializes global listeners, coordinates top-level dialogs, gates heavyweight features, and hosts the route tree.
4. `src/components/cortex/CortexDesktopLayout.tsx` owns the shell chrome and view-mode state once the route subtree is available.

The architecture is optimized for startup and progressive loading, but the runtime boundary story is complex because the app uses four different communication styles at once:

- direct Tauri IPC (`invoke`, `listen`)
- a session-oriented SDK store (`SDKContext`)
- a wide DOM custom-event bus (`window.dispatchEvent` / `window.addEventListener`)
- a separate HTTP `fetch` layer for admin/share/agent surfaces

That split is workable, but it pushes a lot of integration knowledge into `AppCore` and `CortexDesktopLayout`, which are the main ownership hotspots.

---

## 1. Startup flow map

### 1.1 Boot sequence

Observed runtime path:

```text
src/index.tsx
  -> initializeWindowStorage()
  -> pre-resolve initial route from storage
  -> mount <Router root={AppShell}>
      -> AppShell lazy-loads AppCore
          -> AppCore wraps route subtree in OptimizedProviders
              -> lazy CortexDesktopLayout wraps lazy page components
```

Key steps:

1. **Synchronous pre-router setup** in `src/index.tsx:31-60`
   - Initializes window-scoped storage before render.
   - Rewrites `/` or `/index.html` to `/session` or `/welcome` based on the stored current project.
   - This avoids the old mount-then-redirect cycle.

2. **Route and layout splitting** in `src/index.tsx:74-97`
   - Route pages (`Home`, `Welcome`, `Session`, `AdminSessions`, `SharedSession`) are lazy loaded.
   - The shell layout itself is also lazy loaded via `CortexDesktopLayout`.

3. **First-paint signaling** in `src/index.tsx:135-170`
   - After the first animation frame, the entry removes the initial HTML loader.
   - It then invokes `frontend_ready` via Tauri (`src/index.tsx:148-157`) to signal backend Phase B initialization.
   - This exact command has already been flagged as a startup-risk surface in `bug-report-ipc-command.md:73-99`.

4. **Minimal shell stage** in `src/AppShell.tsx:27-33` and `src/AppShell.tsx:125-159`
   - `AppShell` lazy-loads `AppCore`.
   - While `AppCore` is unresolved, the user sees `SplashScreen`.
   - `AppShell` also installs early global error logging and invokes `show_main_window` on mount (`src/AppShell.tsx:128-151`).

5. **Heavy core stage** in `src/AppCore.tsx:771-778`
   - `AppCore` is the actual root application coordinator.
   - It wraps `AppContent` in `OptimizedProviders`, not `App.tsx`.

### 1.2 Route layering

The route tree is mounted in `src/index.tsx:172-190`:

- `Router` uses `AppShell` as its root.
- All routes are wrapped in a `Suspense` boundary that lazy-loads `CortexDesktopLayout`.
- The route subtree (`Welcome`, `Session`, `AdminSessions`, `SharedSession`) is passed through `AppShell` and `AppCore` before layout/page code runs.

### 1.3 Practical startup takeaway

The architecture is intentionally **double-staged**:

- stage A: `index.tsx` + `AppShell`
- stage B: `AppCore` + providers + layout/pages

That is consistent with the project guidance in `AGENTS.md:96-102` and `vite.config.ts:23-157`, but the real runtime root is now `AppShell`/`AppCore`, not `App.tsx`.

---

## 2. Provider layering

## 2.1 What actually owns provider composition

`src/App.tsx:1-9` is only a visual wrapper `<div>`.

The real provider stack lives in `src/context/OptimizedProviders.tsx:299-345`, and `AppCore` is the only top-level module that mounts it (`src/AppCore.tsx:771-778`).

## 2.2 Tier 1 vs Tier 2

`OptimizedProviders` explicitly documents a two-tier strategy (`src/context/OptimizedProviders.tsx:1-15`).

### Tier 1: synchronous providers

Imported in `src/context/OptimizedProviders.tsx:46-63`, mounted in `src/context/OptimizedProviders.tsx:303-320`.

These cover the minimum shell/runtime spine:

- i18n and theming
- toast and notifications
- SDK/session bootstrap surface
- settings and keymap
- commands and modal state
- windows and layout
- search/workspace/editor/editor cursor/editor features

### Tier 2: deferred providers

Imported in `src/context/OptimizedProviders.tsx:67-127`, mounted in `src/context/OptimizedProviders.tsx:162-288`.

These bring in the heavier feature families:

- personalization and themes (`Profiles`, icon themes, color customizations)
- AI/session/runtime (`LLM`, `AI`, `Session`, `PromptStore`, `Supermaven`)
- code intelligence (`LSP`, `Diagnostics`, `Outline`, workspace symbols)
- repo/dev tooling (`Terminals`, `GitHosting`, `GitMerge`, `Tasks`, `Debug`, `Testing`, `Timeline`)
- collaboration/remote/dev extras (`Collab`, `Remote`, `Tunnel`, `REPL`, `Vim`)

### Deferred mount mechanism

`DeferredProviders` waits for idle time before mounting Tier 2 (`src/context/OptimizedProviders.tsx:136-145`):

- `requestIdleCallback` when available
- `setTimeout(..., 0)` fallback otherwise

### Important nuance

Even though Tier 1 mounts immediately, `DeferredProviders` renders **both Tier 2 providers and `props.children`** only after `ready()` becomes true (`src/context/OptimizedProviders.tsx:159-289`).

That means the design favors **provider completeness over partial page rendering**:

- good: child code can assume all downstream `useXxx()` hooks are valid
- tradeoff: route/layout content still waits for deferred-provider readiness

This is a key architectural tradeoff, not obvious from the “Tier 1 first meaningful paint” comment alone.

---

## 3. Top-level ownership map

| Area | Primary files | Responsibilities | Main communication style |
|---|---|---|---|
| Boot + route selection | `src/index.tsx` | storage init, initial route rewrite, router mount, `frontend_ready` | direct Tauri IPC + router |
| Minimal root shell | `src/AppShell.tsx` | error boundary, splash fallback, lazy `AppCore`, `show_main_window` | direct Tauri IPC |
| Global orchestration | `src/AppCore.tsx` | provider mount, helper bridges, dialogs, MCP init, feature gating, window registration | Tauri IPC + DOM event bus |
| Provider composition | `src/context/OptimizedProviders.tsx` | dependency ordering and staged feature availability | synchronous + idle-time mount |
| IDE shell chrome | `src/components/cortex/CortexDesktopLayout.tsx` | mode switch, sidebar, bottom panel, titlebar, persisted shell state | storage + DOM event bus + Tauri IPC |
| Session runtime | `src/context/SDKContext.tsx`, `src/pages/Session.tsx` | session list, history, streaming, approvals, chat/session bootstrap | Tauri IPC-backed SDK store |
| Fetch-driven micro-frontends | `src/pages/admin/AdminSessions.tsx`, `src/pages/share/SharedSession.tsx`, `src/api/*` | admin/share/agent CRUD and read-only views | HTTP `fetch` |
| Heavy feature leaves | `src/components/editor/*`, `src/components/terminal/*`, `src/components/git/*`, `src/components/ai/*`, `src/components/tasks/*` | feature UIs and managers under shell | mostly contexts + lazy chunks |

### 3.1 `AppCore` ownership

`AppCore` combines several normally separate responsibilities:

- helper bridges for extension commands, deep links, AI context, and extension notifications (`src/AppCore.tsx:181-345`)
- global event registration and teardown (`src/AppCore.tsx:481-569`)
- deferred MCP listener init (`src/AppCore.tsx:164-175`, `src/AppCore.tsx:509-514`)
- window state sync via Tauri (`src/AppCore.tsx:516-545`)
- top-level dialog visibility and feature-gated lazy loading (`src/AppCore.tsx:386-479`, `src/AppCore.tsx:591-758`)
- auxiliary window branching (`src/AppCore.tsx:578-764`)

This makes `AppCore` the main **integration hotspot** for anything that needs app-wide orchestration.

### 3.2 `CortexDesktopLayout` ownership

`CortexDesktopLayout` owns persistent shell state and layout chrome:

- local-storage backed layout restore/save (`src/components/cortex/CortexDesktopLayout.tsx:136-163`, `src/components/cortex/CortexDesktopLayout.tsx:339-339`)
- mode/sidebar/chat/bottom-panel signals (`src/components/cortex/CortexDesktopLayout.tsx:186-215`)
- app-level shell event map (`src/components/cortex/CortexDesktopLayout.tsx:341-399`)
- window controls and render-time delegation to `CortexVibeLayout` vs `CortexIDELayout` (`src/components/cortex/CortexDesktopLayout.tsx:402-557`)

This file is effectively the shell-controller for the actual IDE surface.

---

## 4. Communication surface map

The frontend does not have one unified event model. It uses four layers.

## 4.1 Direct Tauri IPC

Representative calls:

- `src/index.tsx:148-157` → `invoke("frontend_ready")`
- `src/AppShell.tsx:147-151` → `invoke("show_main_window")`
- `src/AppCore.tsx:220-227` and `src/AppCore.tsx:245-283` → Tauri `listen(...)` for extension notifications and deep links
- `src/AppCore.tsx:527-535` and `src/AppCore.tsx:568-568` → `update_window_state` / `unregister_window`
- `src/context/SDKContext.tsx:500-684` → session-oriented `cortex_*` commands
- `src/components/cortex/CortexDesktopLayout.tsx:341-342` → `show_window`
- `src/components/cortex/handlers/ViewNavigationHandlers.tsx:126-182` → git-related commands such as `git_init`, `git_push_with_tags`, `git_pull`

Supporting abstraction:

- `src/utils/tauri-api.ts:1-138` provides a broad invoke-wrapper layer with batching, caching, and request deduplication.
- `src/hooks/useTauriListen.ts:18-100` provides lifecycle-safe event-listener helpers.

However, the root modules still make frequent direct `invoke()` / `listen()` calls instead of routing everything through a single contract layer.

## 4.2 SDK session protocol

`SDKContext` is not just a helper; it is the stateful runtime contract for AI/session behavior.

Key lifecycle methods:

- `connect()` lists stored sessions from Tauri: `src/context/SDKContext.tsx:500-533`
- `createSession()` creates a backend session and seeds local state: `src/context/SDKContext.tsx:540-593`
- `sendMessage()` invokes `cortex_send_message` and appends an optimistic user message: `src/context/SDKContext.tsx:595-638`
- `loadSession()` fetches history and status: `src/context/SDKContext.tsx:660-684`
- `approve()` sends execution approval back to the backend: `src/context/SDKContext.tsx:743-747`

`src/pages/Session.tsx:24-49` depends on this store to connect and create a session on first mount.

## 4.3 DOM custom-event bus

This is the most widespread integration mechanism across the shell.

Representative producers/consumers:

- `src/pages/Welcome.tsx:41-55` dispatches `file:new`, `file:open`, `folder:open`, `git:clone`
- `src/pages/Session.tsx:52-60` and `src/pages/Session.tsx:132-155` dispatch/listen for `ai:subagents`, `chat:need-project`, `git:clone`
- `src/utils/workingSurface.ts:24-33` dispatches `workspace:open-folder` and `folder:did-open`
- `src/context/SDKContext.tsx:184-221` listens for project changes via `workspace:open-folder` and `storage`
- `src/components/cortex/CortexDesktopLayout.tsx:344-383` listens for shell commands such as `viewmode:change`, `layout:toggle-panel`, `view:git`, `folder:did-open`, `settings:open-tab`
- `src/components/cortex/handlers/ViewNavigationHandlers.tsx:143-145` translates `git:clone` into `git:clone-repository`
- `src/AppCore.tsx:490-507` listens for shell-wide events that open feedback/settings/clone/task/terminal/AI/debug surfaces
- `src/components/git/CloneRepositoryDialog.tsx:215-225` listens for `git:clone-repository-prefill`
- `src/components/cortex/layout/CortexBottomPanelContainer.tsx:25-30` listens for `cortex:git:history`

### Example: workspace-open flow

```text
openWorkspaceSurface()
  -> dispatch workspace:open-folder + folder:did-open
  -> SDKContext updates cwd
  -> CortexDesktopLayout resets project-scoped shell state
  -> router navigates to /session when needed
```

Evidence:

- `src/utils/workingSurface.ts:24-33`
- `src/context/SDKContext.tsx:184-221`
- `src/components/cortex/CortexDesktopLayout.tsx:345-349`

### Example: clone flow

```text
Welcome / Session / command handlers dispatch git:clone
  -> ViewNavigationHandlers converts to git:clone-repository
  -> AppCore opens CloneRepositoryDialog
  -> dialog can accept a prefill event
  -> clone completion reuses openWorkspaceSurface()
```

Evidence:

- `src/pages/Welcome.tsx:53-55`
- `src/pages/Session.tsx:132-155`
- `src/components/cortex/handlers/ViewNavigationHandlers.tsx:143-145`
- `src/AppCore.tsx:468-469`, `src/AppCore.tsx:490-495`, `src/AppCore.tsx:742-753`
- `src/components/git/CloneRepositoryDialog.tsx:215-225`
- `src/utils/workingSurface.ts:24-33`

## 4.4 HTTP fetch layer

The app also contains a separate REST-style layer:

- admin endpoints in `src/api/admin.ts:18-145`
- agent endpoints in `src/api/agents.ts:12-143`
- share endpoints in `src/api/share.ts:12-100`

Representative consumers:

- `src/pages/admin/AdminSessions.tsx:42-143`
- `src/pages/share/SharedSession.tsx:31-101`
- `src/hooks/useAgents.ts:44-124`

This layer is notably distinct from the Tauri/SDK surfaces and behaves like a small web app embedded inside the desktop shell.

---

## 5. Lazy-loading boundaries

## 5.1 Route-level boundaries

Defined in `src/index.tsx:79-97`:

- `Home`
- `Welcome`
- `Session`
- `AdminSessions`
- `SharedSession`
- `CortexDesktopLayout`

All route content is wrapped in a `Suspense` boundary with a minimal inline fallback (`src/index.tsx:104-122`, `src/index.tsx:176-179`).

## 5.2 Core split: `AppShell` -> `AppCore`

`AppShell` lazy-loads `AppCore` in `src/AppShell.tsx:27-33` and uses `SplashScreen` as the root fallback in `src/AppShell.tsx:153-157`.

This is the most important startup boundary in the app.

## 5.3 Feature-gated lazy UI inside `AppCore`

`AppCore` defines a large set of lazy imports grouped by usage pattern (`src/AppCore.tsx:55-157`).

Runtime gates are then applied in `src/AppCore.tsx:591-758`:

- always-visible core UI (`ToastManager`, `NotificationCenter`, quick-open surfaces)
- early navigation tools (`FileFinder`, `BufferSearch`, search/goto surfaces)
- gated domains loaded on first use:
  - terminal (`src/AppCore.tsx:642-649`)
  - REPL (`src/AppCore.tsx:651-656`)
  - tasks (`src/AppCore.tsx:658-666`)
  - journal (`src/AppCore.tsx:668-673`)
  - snippets (`src/AppCore.tsx:675-681`)
  - AI (`src/AppCore.tsx:683-691`)
  - bookmarks (`src/AppCore.tsx:693-698`)
  - debug (`src/AppCore.tsx:700-706`)
  - dev tools (`src/AppCore.tsx:708-714`)
- dialog-only loads (`src/AppCore.tsx:720-758`)

### Barrel-based feature loading

Some lazy imports intentionally target barrel files rather than leaf modules:

- AI family via `src/components/ai/index.ts:1-61`
- tasks family via `src/components/tasks/index.ts:1-17`

That simplifies import ergonomics, but it means these features load at a **feature-family** granularity rather than a single-widget granularity.

## 5.4 Layout-level lazy boundaries

`src/components/cortex/layout/CortexIDELayout.tsx:9-10` lazy-loads `EditorPanel`, then wraps it in `Suspense` at `src/components/cortex/layout/CortexIDELayout.tsx:77-97`.

`src/components/cortex/layout/CortexBottomPanelContainer.tsx:6-10` lazy-loads output/diagnostics/diff/history/debug-console panels.

This keeps the shell chrome responsive even when editor/bottom-panel surfaces are still resolving.

## 5.5 Representative feature behavior

- `src/components/editor/EditorPanel.tsx:17-20` documents a deliberate choice to keep Monaco mounted and hide it with CSS instead of conditionally unmounting it.
- `src/components/editor/EditorPanel.tsx:53-63` implements that choice.
- `src/components/TerminalPanel.tsx:6-8` loads xterm CSS and terminal stylesheet only when the terminal module is loaded.
- `src/components/TerminalPanel.tsx:152-156` lazily loads the WebGL addon on mount.

These are good examples of feature-level progressive loading under the shell.

## 5.6 Build-time chunk strategy

`vite.config.ts` reinforces the runtime boundaries:

- manual chunks for heavy contexts, Monaco, xterm, Shiki, Tauri, extension host, etc.: `vite.config.ts:23-157`
- alias and dedupe setup for `@` and Solid core packages: `vite.config.ts:191-197`
- preload filtering to avoid pulling `AppCore`, heavy contexts, Monaco, xterm, and related chunks into the first paint path: `vite.config.ts:243-265`

TypeScript config complements this with a strict `src`-scoped alias setup in `tsconfig.json:15-24`.

---

## 6. Representative feature-directory ownership

### `src/components/cortex/**`

Owns the shell, titlebar, vibe/IDE layout split, shell-level handlers, and shell-specific panels.

Key files:

- `src/components/cortex/CortexDesktopLayout.tsx:165-557`
- `src/components/cortex/layout/CortexIDELayout.tsx:44-141`
- `src/components/cortex/handlers/ViewNavigationHandlers.tsx:121-205`

### `src/components/editor/**`

Owns the Monaco/editor surface and editor-specific mounting rules.

Key file:

- `src/components/editor/EditorPanel.tsx:21-67`

### `src/components/terminal/**`

Owns terminal instance management, xterm integration, split panes, and feature activation.

Key file:

- `src/components/TerminalPanel.tsx:21-220`

### `src/components/git/**`

Owns git-facing dialogs and panels, but shell activation often starts from cross-module events.

Key file:

- `src/components/git/CloneRepositoryDialog.tsx:57-225`

### `src/components/ai/**`

Owns AI-side widgets and barrel exports consumed lazily from `AppCore`.

Key file:

- `src/components/ai/index.ts:1-61`

### `src/components/tasks/**`

Owns task runner surfaces and exports them as a grouped feature family.

Key file:

- `src/components/tasks/index.ts:1-17`

### `src/pages/admin/**` and `src/pages/share/**`

These are closer to isolated web pages than core IDE surfaces:

- `src/pages/admin/AdminSessions.tsx:25-301`
- `src/pages/share/SharedSession.tsx:17-270`

They use `fetch`-based APIs instead of the Tauri/SDK pathway.

---

## 7. Concrete findings

| ID | Severity | Finding | Evidence | Why it matters |
|---|---|---|---|---|
| FA-01 | Warning | **Boot-root documentation has drifted from the runtime.** `App.tsx` is now a minimal visual wrapper, while `index.tsx -> AppShell -> AppCore` is the real boot path. | `src/App.tsx:1-9`, `src/index.tsx:6-8`, `src/AppShell.tsx:27-33`, `src/AppCore.tsx:771-778`, contrast with `PROJECT_STRUCTURE.md:126-130` | Contributors reading older docs may place startup or provider logic in the wrong file. |
| FA-02 | Info | **Deferred providers also defer child rendering.** Tier 1 mounts immediately, but `DeferredProviders` withholds `props.children` until idle-time readiness. | `src/context/OptimizedProviders.tsx:136-145`, `src/context/OptimizedProviders.tsx:159-289`, `src/context/OptimizedProviders.tsx:323-325` | This is a valid safety tradeoff, but it means startup gains come mostly from code splitting and shell deferral, not from early route availability. |
| FA-03 | Warning | **Top-level orchestration is concentrated in two hotspots:** `AppCore` and `CortexDesktopLayout`. | `src/AppCore.tsx:181-345`, `src/AppCore.tsx:481-569`, `src/AppCore.tsx:591-758`, `src/components/cortex/CortexDesktopLayout.tsx:186-399`, `src/components/cortex/CortexDesktopLayout.tsx:428-557` | Changes to startup, deep links, dialogs, layout, window state, or feature activation are likely to converge here, increasing coordination cost. |
| FA-04 | Warning | **The communication model is intentionally mixed but expensive to reason about.** The same user flow may pass through DOM events, Tauri IPC, and helper utilities before UI changes appear. | Clone flow: `src/pages/Welcome.tsx:53-55`, `src/components/cortex/handlers/ViewNavigationHandlers.tsx:143-145`, `src/AppCore.tsx:490-495`, `src/components/git/CloneRepositoryDialog.tsx:215-225`; workspace flow: `src/utils/workingSurface.ts:24-33`, `src/context/SDKContext.tsx:184-221`, `src/components/cortex/CortexDesktopLayout.tsx:345-349` | This improves decoupling between feature leaves, but increases discoverability and makes end-to-end flow tracing slower. |
| FA-05 | Warning | **The HTTP API layer is thin, duplicated, and not always respected.** `src/api/*` wraps `fetch`, but some features bypass it. | Shared wrappers: `src/api/admin.ts:18-145`, `src/api/agents.ts:12-143`, `src/api/share.ts:12-100`, `src/hooks/useAgents.ts:44-124`; bypasses: `src/components/AgentsManager.tsx:96-111`, `src/components/AgentsManager.tsx:169-187` | Error handling, cancellation, auth/session assumptions, and base-URL behavior are not centrally enforced. `AgentsManager` in particular blurs ownership by calling both `state.serverUrl` and an external Cortex API directly. |
| FA-06 | Info | **Startup risk around `frontend_ready` is known and should be treated as a linked concern, not a mystery regression.** | `src/index.tsx:148-157`, `bug-report-ipc-command.md:73-99` | The frontend architecture doc should point readers to the existing backend/IPC investigation instead of duplicating the same runtime evidence. |
| FA-07 | Info | **There is already explicit type-debt recorded around the startup deferral APIs.** | `src/context/OptimizedProviders.tsx:140-143`, `src/AppCore.tsx:509-513`, `error-catalog.md:231-327` | This is not a new finding for this audit, but it is relevant context for anyone modifying startup and provider deferral code. |

---

## 8. Recommendations

1. **Update architecture docs to name the real boot root**
   - Refresh any references that still describe `App.tsx` as the provider-owning root.
   - The canonical runtime path should be documented as `index.tsx -> AppShell -> AppCore -> OptimizedProviders -> CortexDesktopLayout -> page`.

2. **Document the event-surface rules explicitly**
   - Define when a feature should use:
     - raw Tauri IPC
     - `SDKContext`
     - DOM custom events
     - `src/api/*`
   - Today this knowledge is mostly implicit in `AppCore` and `CortexDesktopLayout`.

3. **Clarify the provider deferral tradeoff in comments/docs**
   - The current design is defensible, but contributors should know that children are withheld until Tier 2 is ready.

4. **Consolidate HTTP-facing ownership over time**
   - `src/api/*` is the natural place for admin/share/agent HTTP requests.
   - `AgentsManager` is a good example of a feature that currently bypasses that layer and would benefit from normalization.

5. **Keep cross-audit references instead of duplicating evidence**
   - Startup timeout/hang concerns should point to `bug-report-ipc-command.md`.
   - Type-level startup debt should point to `error-catalog.md`.
   - Directory/context inventories should continue to live in `PROJECT_STRUCTURE.md`.

---

## 9. Suggested ownership summary for future audits

If future work needs to change the frontend architecture, the most likely first-stop files are:

- **startup / first paint:** `src/index.tsx`, `src/AppShell.tsx`, `vite.config.ts`
- **provider ordering:** `src/context/OptimizedProviders.tsx`
- **global app behavior:** `src/AppCore.tsx`
- **shell chrome / mode switching:** `src/components/cortex/CortexDesktopLayout.tsx`
- **session transport / message model:** `src/context/SDKContext.tsx`
- **fetch-driven web surfaces:** `src/api/*`, `src/pages/admin/*`, `src/pages/share/*`
- **feature boundaries:** `src/components/editor/*`, `src/components/terminal/*`, `src/components/git/*`, `src/components/ai/*`, `src/components/tasks/*`

This division is strong enough to audit and evolve, but today it still depends heavily on implicit conventions and cross-module event knowledge.
