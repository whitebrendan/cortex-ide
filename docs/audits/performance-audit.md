# Performance Audit

## Scope and methodology

This audit focuses on frontend startup cost, bundle behavior, provider deferral, and heavy editor/terminal UI paths that can affect Tauri desktop responsiveness.

Reviewed files:

- `vite.config.ts`
- `package.json`
- `src/index.tsx`
- `src/AppShell.tsx`
- `src/AppCore.tsx`
- `src/context/OptimizedProviders.tsx`
- `src/context/utils/LazyProvider.tsx`
- `src/components/cortex/CortexDesktopLayout.tsx`
- `src/components/cortex/layout/CortexIDELayout.tsx`
- `src/components/editor/EditorPanel.tsx`
- `src/components/editor/MultiBuffer.tsx`
- `src/components/editor/LazyEditor.tsx`
- `src/components/editor/CodeEditor.tsx`
- `src/components/editor/core/EditorInstance.tsx`
- `src/components/TerminalPanel.tsx`
- `src/components/terminal/TerminalInstanceManager.ts`
- `src/utils/monacoManager.ts`
- `src/utils/taskVariables.ts`
- `src/utils/lazyStyles.ts`
- `src/utils/logger.ts`
- `src/context/TasksContext.tsx`

### Environment limitation

A production build could not be executed in this workspace because frontend dependencies are not installed yet. Running `npm run build` failed with `Cannot find package 'vite'`. Because of that, chunk-size and preload observations below are based on config and import-graph analysis rather than emitted bundle artifacts. The first follow-up validation step should be `npm install && npm run build:analyze`.

---

## Executive summary

The app already has several strong startup-oriented patterns:

- `src/index.tsx` renders through a minimal `AppShell` and lazy-loads `AppCore`.
- `vite.config.ts` intentionally splits Monaco, xterm, Shiki, Emmet, and several heavy contexts into dedicated chunks.
- Monaco itself is still loaded dynamically in `src/utils/monacoManager.ts`.
- `TerminalInstanceManager` defers the WebGL addon to a dynamic import.
- `LazyEditor` prevents inactive tabs from mounting a full Monaco instance.

The highest-priority performance risks are:

1. **Deferred providers are mount-deferred, not bundle-deferred.** `src/context/OptimizedProviders.tsx` imports Tier 2 providers eagerly at module scope, so `requestIdleCallback` delays provider mounting but not JS parse/eval cost.
2. **The route wrapper is IDE-heavy for every route.** `src/index.tsx` wraps all routes in `CortexDesktopLayout`, so welcome/share/admin routes still pay part of the IDE orchestration cost even when shell chrome is hidden.
3. **The preload filter likely misses real heavy chunks.** `vite.config.ts` filters `vendor-shiki` and `vendor-xterm`, but the actual manual chunk names are `vendor-shiki-core`, `vendor-shiki-lang-*`, `vendor-shiki-themes`, `vendor-shiki-wasm`, `vendor-xterm-core`, `vendor-xterm-addons`, and `vendor-xterm-webgl`.
4. **Terminal activation still contains polling and repeated fit work.** `TerminalPanel` uses a `setInterval(..., 50)` container probe, repeated `requestAnimationFrame` fits, and multiple window/global listeners.
5. **Some supposedly on-demand utilities are still effectively startup work.** `AppCore` renders several lazy components immediately, including `EmmetWrapDialog`, which appears shortcut-driven but is still mounted unconditionally.
6. **Monaco’s main payload is lazy, but some Monaco-related imports still exist at module scope.** Worker entrypoints are statically imported in `src/utils/monacoManager.ts`, and `src/utils/taskVariables.ts` still statically imports `MonacoManager` despite `TasksContext` having a lazy-loading strategy.

---

## Startup path walkthrough

### 1. Entry script critical path: `src/index.tsx`

Observed startup work:

- Startup metrics/logging are initialized at module load (`src/index.tsx:14-28`).
- Window storage initialization happens synchronously before render (`src/index.tsx:35-38`).
- Route resolution also happens synchronously before render and performs `localStorage` reads (`src/index.tsx:48-59`).
- All pages and the layout are declared as lazy imports, including `CortexDesktopLayout` (`src/index.tsx:79-97`).
- After the first `requestAnimationFrame`, the script removes the initial HTML loader and invokes `frontend_ready` through Tauri (`src/index.tsx:136-169`).

Assessment:

- The architecture is directionally correct: minimal entry work, then lazy routes, then first-paint callback.
- The remaining synchronous cost is mostly localStorage/path resolution and dev-only logging.
- The main structural concern is that the single route wrapper still points every route through the heavy layout (`src/index.tsx:174-189`).

### 2. Minimal shell: `src/AppShell.tsx`

Observed startup work:

- `AppShell` keeps `AppCore` behind a lazy import (`src/AppShell.tsx:27-33`).
- It installs early `error` and `unhandledrejection` listeners immediately inside the component body (`src/AppShell.tsx:128-145`).
- It schedules `invoke("show_main_window")` on the next animation frame (`src/AppShell.tsx:147-150`).

Assessment:

- The lazy `AppCore` boundary is the strongest startup optimization in the current frontend.
- The early error listeners are not expensive on their own, but they are still render-phase side effects rather than mount-scoped setup.
- There are at least two early window-show related paths in the frontend (`show_main_window` here and `show_window` later in the layout), which should be validated for duplication.

### 3. Heavy app core: `src/AppCore.tsx`

Observed startup work:

- `AppCore` imports `OptimizedProviders` and a wide set of contexts/hooks up front (`src/AppCore.tsx:30-47`).
- It defines many lazy UI components, but several are rendered immediately in the startup tiers.
- `AppContent` sets up a long list of global event listeners and deferred MCP initialization on mount (`src/AppCore.tsx:481-535`).
- The “always visible” startup tier renders `ToastManager`, `NotificationCenter`, command palette UI, quick access, WhichKey, screencast mode, auto-update dialog, profile UI, and extension profiler commands immediately (`src/AppCore.tsx:594-609`).
- The next tier also renders navigation/search helpers early: `FileFinder`, `BufferSearch`, `GoToLineDialog`, `GoToSymbolDialog`, `ProjectSearch`, `SearchEditorWithState`, `SearchInOpenEditorsWithState`, `ProjectSymbols`, `WorkspaceSymbolPicker`, `TabSwitcher`, `LanguageSelectorModal`, and `EncodingPickerModal` (`src/AppCore.tsx:614-627`).
- The terminal stack is gated, but the gate opens as soon as the layout panel becomes visible or a terminal event fires (`src/AppCore.tsx:642-649`).
- `EmmetWrapDialog` is mounted unconditionally, despite the code comment saying it is “usually invoked via shortcut” (`src/AppCore.tsx:755-758`).

Assessment:

- `AppCore` is lazy relative to the entrypoint, but once it loads it still fronts a large amount of startup work.
- Many of the lazy components are only network-deferred until first render, not genuinely feature-deferred.
- `EmmetWrapDialog` is a particularly good candidate for true user-action gating.

---

## Bundle and chunk strategy assessment

### What is already working well

`vite.config.ts` has an explicit chunking strategy for the libraries most likely to dominate bundle weight:

- `app-extension-host` (`vite.config.ts:28-31`)
- `app-context-debug`, `app-context-tasks`, `app-context-terminals`, `app-context-testing`, `app-context-lsp`, `app-context-extensions` (`vite.config.ts:33-51`)
- `vendor-monaco` (`vite.config.ts:57-61`)
- `vendor-xterm-core`, `vendor-xterm-webgl`, `vendor-xterm-addons` (`vite.config.ts:63-72`)
- `vendor-shiki-core`, `vendor-shiki-themes`, `vendor-shiki-wasm`, `vendor-shiki-lang-*` (`vite.config.ts:74-107`)
- `vendor-emmet` (`vite.config.ts:109-112`)
- additional vendor splits for `marked`, `@kobalte`, Solid, Zustand, Tauri, and `diff`

That is a strong baseline for a desktop IDE.

### Main concern: preload exclusions probably do not match actual chunk names

The `modulePreload.resolveDependencies` filter excludes:

- `vendor-monaco`
- `vendor-emmet`
- `vendor-shiki`
- `vendor-xterm`
- `AppCore`
- `EditorPanel`
- several `app-context-*` chunks

at `vite.config.ts:244-264`.

However, the manual chunk names above show that:

- xterm is split into `vendor-xterm-core`, `vendor-xterm-addons`, and `vendor-xterm-webgl`
- shiki is split into `vendor-shiki-core`, `vendor-shiki-wasm`, `vendor-shiki-themes`, and several `vendor-shiki-lang-*`

That means the generic filters `vendor-shiki` and `vendor-xterm` may or may not catch all emitted file names depending on how Rollup names them and how dependency paths are represented. This needs to be validated against actual build output, because a mismatch would quietly allow heavy chunks to preload before they are useful.

### Dev-server optimizations are not production wins

`optimizeDeps.include` explicitly prebundles Monaco, Shiki, Emmet, and xterm for dev (`vite.config.ts:199-231`). That is useful for developer ergonomics, but it does not improve the production Tauri bundle. Likewise, `server.warmup.clientFiles` (`vite.config.ts:323-348`) improves dev-server navigation, not release startup.

### Production logging removal is a positive

The production build drops `console` and `debugger` statements through esbuild (`vite.config.ts:299-303`). That reduces runtime noise and mitigates some of the startup logging overhead seen throughout the frontend.

---

## Provider deferral assessment

### Current behavior

`src/context/OptimizedProviders.tsx` has a clear two-tier design:

- Tier 1 providers are imported and mounted synchronously (`src/context/OptimizedProviders.tsx:46-62`)
- Tier 2 providers are also imported eagerly at module scope (`src/context/OptimizedProviders.tsx:67-127`)
- Tier 2 mounting is merely delayed until `requestIdleCallback` fires (`src/context/OptimizedProviders.tsx:136-160`)

### Why this still costs startup time

Because Tier 2 providers are static imports inside the same module, their code must still be downloaded, parsed, and evaluated when `AppCore` imports `OptimizedProviders`. The current design defers **provider mounting**, but not **provider code cost**.

In other words:

- good: avoids some early reactive setup and mount churn
- not enough: does not meaningfully shrink the `AppCore` parse/eval footprint

### Existing primitives already point to a stronger pattern

The repo already contains utilities for more aggressive provider deferral in `src/context/utils/LazyProvider.tsx` and `ProviderComposer` patterns. That means the next step can be evolutionary rather than a new framework.

### Recommendation

Split Tier 2 into one or more real async provider groups, for example:

- workbench/editor-adjacent providers
- terminal/debug/testing providers
- AI/collaboration providers
- extensions/remote/toolchain providers

That would let `AppCore` mount a smaller essential shell first, then fetch and mount provider families based on route or feature usage.

---

## Heavy UI path review

## 1. Route-wide shell and layout: `src/components/cortex/CortexDesktopLayout.tsx`

Observed behavior:

- Layout state is restored from storage synchronously in `loadLayoutState()` (`src/components/cortex/CortexDesktopLayout.tsx:136-155`).
- The component immediately hooks several heavy contexts: editor, SDK, AI agent/provider, multi-repo, workspace, commands (`src/components/cortex/CortexDesktopLayout.tsx:165-179`).
- It registers a large event map on mount and calls `invoke("show_window")` (`src/components/cortex/CortexDesktopLayout.tsx:341-395`).
- Shell chrome is conditionally hidden on non-session routes via `showShellChrome()` (`src/components/cortex/CortexDesktopLayout.tsx:313`, `437-552`), but the layout module and its context hookups still load.

Why this matters:

- `src/index.tsx` routes everything through this layout wrapper (`src/index.tsx:176-179`), so welcome/share/admin pages likely pay more IDE orchestration cost than necessary.
- This is a startup responsiveness issue even before editor or terminal features are used.

### Proposal

Use a lightweight non-session layout for `/welcome`, `/share/:token`, and `/admin/*`, and only load `CortexDesktopLayout` for `/session/*`.

---

## 2. Early AppCore UI tiers: `src/AppCore.tsx`

Observed behavior:

- “Always visible” startup UI includes more than just toasts and notifications; it also includes command palette UI, quick-open UI, WhichKey, profile UI, auto-update UI, and extension profiler commands (`src/AppCore.tsx:594-609`).
- File/navigation helpers also load very early (`src/AppCore.tsx:614-627`).
- `EmmetWrapDialog` is rendered unconditionally (`src/AppCore.tsx:755-758`). `src/components/EmmetWrapDialog.tsx` imports `generateWrapPreview`, and `src/utils/emmet.ts` statically imports the `emmet` package.

Why this matters:

- These are lazy components, but because they are rendered immediately, their chunks still get requested during startup.
- `vendor-emmet` is explicitly treated as heavy in `vite.config.ts`, but the current render path likely defeats that intended deferral.

### Proposal

Reclassify startup UI into three groups:

1. **truly required on first interaction**: toast manager, notification center
2. **required after first keyboard interaction**: quick open, command palette, WhichKey
3. **explicitly user-triggered**: settings dialog, Emmet wrap, profile management, extension profiler commands, most search/navigation overlays

`EmmetWrapDialog` should become `Show when={showEmmetWrap()}` rather than unconditional startup work.

---

## 3. Editor path: `CortexIDELayout`, `EditorPanel`, `LazyEditor`, `CodeEditor`, `EditorInstance`, `MonacoManager`

### Strengths

- `CortexIDELayout` lazy-loads `EditorPanel` (`src/components/cortex/layout/CortexIDELayout.tsx:9`, `77-97`).
- `EditorPanel` keeps the editor mounted carefully to avoid Monaco teardown races (`src/components/editor/EditorPanel.tsx:17-20`, `53-66`).
- `MultiBuffer` uses `LazyEditor` so only activated code tabs mount a real editor (`src/components/editor/MultiBuffer.tsx:149-165`).
- `LazyEditor` only loads `CodeEditor` after a tab has actually been active (`src/components/editor/LazyEditor.tsx:15-17`, `53-56`).
- `MonacoManager` still loads `monaco-editor` dynamically (`src/utils/monacoManager.ts:257-299`).

### Risks and costs

- `CodeEditor` is still a very feature-heavy module with many editor/debug/LSP widgets and top-level stylesheet loads (`src/components/editor/CodeEditor.tsx:42-44` and surrounding imports).
- `EditorInstance` loads Monaco on first mount and registers all providers in a `requestAnimationFrame` callback (`src/components/editor/core/EditorInstance.tsx:103-123`).
- `EditorInstance` may re-enter `ensureLoaded()` inside its main effect if Monaco is not already ready (`src/components/editor/core/EditorInstance.tsx:147-160`).
- `MonacoManager` statically imports worker entrypoints at module scope (`src/utils/monacoManager.ts:13-17`) before the main Monaco payload is dynamically imported (`src/utils/monacoManager.ts:293-299`).

### Important measurable hypothesis

The main Monaco payload is still lazy, but static worker imports may preserve more Monaco-related code in earlier chunks than intended. This should be verified in the bundle analyzer rather than assumed.

### Secondary risk: inconsistent Monaco laziness

`src/context/TasksContext.tsx` explicitly documents a lazy MonacoManager strategy and keeps a lazily loaded module reference (`src/context/TasksContext.tsx:6`, `836-860`).

By contrast, `src/utils/taskVariables.ts` still imports `MonacoManager` at module scope (`src/utils/taskVariables.ts:10`). That is inconsistent with the lazy pattern and worth cleaning up so accidental imports do not keep Monaco-related code “warm” in shared chunks.

---

## 4. Terminal path: `src/components/TerminalPanel.tsx` and `src/components/terminal/TerminalInstanceManager.ts`

### Strengths

- Terminal UI is gated behind `terminalUsed()` or visible terminal-panel state in `AppCore` (`src/AppCore.tsx:642-649`).
- The WebGL addon is truly dynamic and optional (`src/components/terminal/TerminalInstanceManager.ts:32-43`).

### Costs and risks

#### Module-eval and initial activation cost

- `TerminalPanel` statically imports xterm CSS and triggers `loadStylesheet("terminal")` at module scope (`src/components/TerminalPanel.tsx:1-8`).
- `TerminalInstanceManager` statically imports xterm core plus multiple addons (`src/components/terminal/TerminalInstanceManager.ts:9-17`).

#### Polling and repeated fit work

- `TerminalPanel` uses a `setInterval(check, 50)` loop to look for an embedded terminal container (`src/components/TerminalPanel.tsx:158-176`).
- It performs repeated fit/focus work in `requestAnimationFrame` callbacks (`src/components/TerminalPanel.tsx:71-82`, `179-213`, `237-244`).
- It installs several window-level listeners for keyboard, split, rename, color, resize, and pane events (`src/components/TerminalPanel.tsx:215-244`).

#### Terminal initialization path

- `TerminalInstanceManager` performs a fit/resize on the next frame, writes a connection banner, and then performs a second fit/resize after a `setTimeout(..., 100)` (`src/components/terminal/TerminalInstanceManager.ts:507-523`).
- `terminal.onData` schedules additional `requestAnimationFrame` work for input tracking/suggestions on each terminal data event (`src/components/terminal/TerminalInstanceManager.ts:528-557`).
- Output subscription writes directly into the terminal, which is fine functionally but should be profiled under high-volume output (`src/components/terminal/TerminalInstanceManager.ts:570-585` and beyond).

### Why this matters for Tauri

On desktop, terminal output and resize work competes with the same UI thread that handles editor input, animations, and webview responsiveness. The 50ms polling loop is especially suspicious because it burns idle CPU even when the user is not interacting.

### Proposal

- Replace the embedded-container polling loop with a `MutationObserver`, explicit ref handoff, or a layout event from the embedding container.
- Coalesce fit requests so one frame handles all pending terminals.
- Measure CPU cost with one idle terminal, one active terminal, and one noisy terminal (`yes`, `cargo check`, or `npm install`) to find the actual breakpoints.

---

## Logging overhead and instrumentation posture

### Current state

- `src/index.tsx`, `src/AppShell.tsx`, `src/AppCore.tsx`, and `src/context/OptimizedProviders.tsx` all emit dev-only startup logs with `performance.now()`.
- `src/utils/logger.ts` defaults logger enablement to `import.meta.env.DEV`, which is a good baseline (`src/utils/logger.ts:13-38`, `81-83`).
- The production build strips console/debugger calls (`vite.config.ts:299-303`).

### Assessment

- Production overhead from these logs is largely mitigated.
- Dev/Tauri-debug responsiveness can still be affected by repeated startup logs and hot-path error/warn/debug churn.
- Logging currently gives timestamps, but not a stable metric pipeline.

### Proposal

Prefer `performance.mark()` / `performance.measure()` plus one aggregated reporter over repeated free-form console logging. That would make traces easier to compare across builds and would avoid cluttering the console during startup experiments.

---

## Measurable hypotheses

| ID | Hypothesis | Evidence | How to measure | Success criteria |
|---|---|---|---|---|
| H1 | Preload exclusions are missing some xterm/Shiki chunks. | `vite.config.ts:244-264` vs actual manual chunk names in `vite.config.ts:63-107` | Run `npm run build:analyze`; inspect generated preload links and cold-start network waterfall | No xterm/Shiki chunks fetched before terminal/editor/highlighter use |
| H2 | True async provider grouping will reduce `AppCore` parse/eval cost more than the current `requestIdleCallback` mount deferral. | `src/context/OptimizedProviders.tsx:67-160` | Add `performance.mark` around `AppCore` import start, provider module ready, deferred-provider ready | Lower main-thread scripting time between `AppCore` fetch and usable shell |
| H3 | Non-session routes are overpaying because `CortexDesktopLayout` wraps all routes. | `src/index.tsx:176-179`, `src/components/cortex/CortexDesktopLayout.tsx:165-179` | Compare `/welcome` startup trace before/after route split | Smaller welcome-route JS and faster time-to-interactive |
| H4 | `EmmetWrapDialog` is pulling `vendor-emmet` into startup unnecessarily. | `src/AppCore.tsx:755-758`, `src/components/EmmetWrapDialog.tsx:3`, `src/utils/emmet.ts:6` | Compare bundle waterfall before/after gating dialog on actual open state | No Emmet chunk request during cold start unless dialog opens |
| H5 | Terminal idle CPU can be reduced by removing the 50ms polling loop. | `src/components/TerminalPanel.tsx:158-176` | Record Performance traces with terminal hidden, idle, and embedded | Fewer timer tasks and lower idle CPU in session route |
| H6 | Static Monaco worker imports still keep more code in early chunks than intended. | `src/utils/monacoManager.ts:13-17`, `293-299` | Compare analyzer output before/after moving worker setup behind a smaller async boundary | Smaller early JS or fewer Monaco-related modules in shared chunks |
| H7 | AppCore’s “always visible” tier is still too broad. | `src/AppCore.tsx:594-627` | Compare first-input delay and JS requests after gating secondary overlays | Fewer startup chunk requests without regressing command-palette UX |

---

## Recommended instrumentation points

Add stable `performance.mark()` points at the following locations:

### Startup and routing

- `src/index.tsx`
  - `startup:script-start`
  - `startup:window-storage-ready`
  - `startup:route-resolved`
  - `startup:render-start`
  - `startup:first-raf`
  - `startup:frontend-ready-invoked`

### Shell/core split

- `src/AppShell.tsx`
  - `startup:appshell-render`
  - `startup:appcore-import-start`
  - `startup:appcore-import-end`
  - `startup:show-main-window-invoked`

### AppCore and providers

- `src/AppCore.tsx`
  - `startup:appcore-render`
  - `startup:appcontent-mounted`
  - `startup:mcp-init-scheduled`
  - `startup:mcp-init-complete`
- `src/context/OptimizedProviders.tsx`
  - `startup:providers-module-eval-start`
  - `startup:providers-module-eval-end`
  - `startup:deferred-providers-ready`

### Layout

- `src/components/cortex/CortexDesktopLayout.tsx`
  - `startup:layout-state-restored`
  - `startup:layout-mounted`
  - `startup:show-window-invoked`
  - `startup:chrome-visible`

### Editor and terminal first-use

- `src/components/editor/core/EditorInstance.tsx`
  - `editor:ensure-loaded-start`
  - `editor:ensure-loaded-end`
  - `editor:providers-registered`
  - `editor:first-instance-ready`
- `src/components/TerminalPanel.tsx`
  - `terminal:panel-mounted`
  - `terminal:webgl-load-start`
  - `terminal:webgl-load-end`
  - `terminal:first-fit`
- `src/components/terminal/TerminalInstanceManager.ts`
  - `terminal:instance-init-start`
  - `terminal:instance-init-end`
  - `terminal:first-output`

---

## File- and line-specific optimization proposals

### `vite.config.ts`

- **`vite.config.ts:244-264`** — reconcile `heavyChunks` with real chunk names. Explicitly include `vendor-xterm-core`, `vendor-xterm-addons`, `vendor-xterm-webgl`, `vendor-shiki-core`, `vendor-shiki-wasm`, `vendor-shiki-themes`, and the `vendor-shiki-lang-*` variants.
- **`vite.config.ts:23-157`** — consider adding explicit manual chunks for route-level session shell pieces if `CortexDesktopLayout` and `EditorPanel` are still ending up in overly large shared chunks.
- **`vite.config.ts:199-231`** — keep `optimizeDeps` for dev, but do not treat it as evidence of a good production bundle; validate release output directly.

### `src/index.tsx`

- **`src/index.tsx:174-189`** — split routes so only `/session/*` uses the full IDE layout. Welcome/share/admin should not need the same route wrapper.
- **`src/index.tsx:35-59`** — instrument storage/route resolution duration rather than assuming it is negligible on all desktop systems.

### `src/AppShell.tsx`

- **`src/AppShell.tsx:128-150`** — validate whether `show_main_window` and later `show_window` are both required. If not, remove or consolidate one path.
- **`src/AppShell.tsx:139-145`** — move global listener setup into `onMount` for cleaner lifecycle semantics.

### `src/AppCore.tsx`

- **`src/AppCore.tsx:594-627`** — narrow the always-on startup tier to the smallest useful set.
- **`src/AppCore.tsx:755-758`** — gate `EmmetWrapDialog` behind an explicit open state instead of unconditional rendering.
- **`src/AppCore.tsx:481-535`** — measure listener setup and MCP initialization cost as separate marks; do not hide them inside one large on-mount block.

### `src/context/OptimizedProviders.tsx`

- **`src/context/OptimizedProviders.tsx:67-127`** — convert some Tier 2 providers into true async groups instead of static imports.
- **`src/context/OptimizedProviders.tsx:136-160`** — keep the idle-mount behavior, but attach it to a lazy-imported provider group so both mount cost and parse/eval cost move off the critical path.

### `src/components/cortex/CortexDesktopLayout.tsx`

- **`src/components/cortex/CortexDesktopLayout.tsx:136-155`** — measure layout-state restoration cost and move anything nonessential out of the route-critical path.
- **`src/components/cortex/CortexDesktopLayout.tsx:341-395`** — review the event map and split session-only listeners from globally needed listeners.

### `src/components/TerminalPanel.tsx`

- **`src/components/TerminalPanel.tsx:1-8`** — confirm whether both the static xterm CSS import and `loadStylesheet("terminal")` are necessary, and make sure the terminal CSS path remains fully feature-gated.
- **`src/components/TerminalPanel.tsx:158-176`** — replace `setInterval(check, 50)` with an observer or explicit ref/event handoff.
- **`src/components/TerminalPanel.tsx:179-244`** — centralize terminal fit scheduling so multiple effects and window events cannot trigger redundant work in the same frame.

### `src/components/terminal/TerminalInstanceManager.ts`

- **`src/components/terminal/TerminalInstanceManager.ts:507-523`** — collapse the double-fit path into one measured strategy when possible.
- **`src/components/terminal/TerminalInstanceManager.ts:528-557`** — profile suggestion/input tracking under heavy output and consider a coarser scheduler or per-frame batching threshold.

### `src/utils/monacoManager.ts`

- **`src/utils/monacoManager.ts:13-17`** — test moving worker entrypoints behind a smaller async boundary or dedicated worker-config module to verify early chunk reduction.
- **`src/utils/monacoManager.ts:293-299`** — add explicit performance marks around `ensureLoaded()` so first-editor latency can be tracked release over release.

### `src/utils/taskVariables.ts` and `src/context/TasksContext.tsx`

- **`src/utils/taskVariables.ts:10`** — align with the lazy Monaco strategy already used in `TasksContext` (`src/context/TasksContext.tsx:836-860`) so task-related utilities do not accidentally retain MonacoManager in shared paths.

---

## Suggested verification plan

1. Install frontend dependencies:
   - `npm install`
2. Inspect production bundle composition:
   - `npm run build:analyze`
3. Capture three cold-start traces in the desktop shell:
   - `/welcome`
   - `/session` with no editor opened
   - `/session` with first editor open and first terminal open
4. Record the following from each trace:
   - total JS transferred before first input
   - time spent in scripting before first paint
   - time from app boot to `frontend_ready`
   - time from first editor open to `MonacoManager.ensureLoaded()` completion
   - idle CPU while session route is open with terminal hidden
5. Re-run the same traces after each high-priority optimization to avoid “bundle moved but UX unchanged” regressions.

---

## Priority order

1. **Fix preload filter naming mismatch in `vite.config.ts`.** Low risk, high confidence.
2. **Split non-session routes away from `CortexDesktopLayout`.** High impact on cold-start and welcome-route responsiveness.
3. **Turn Tier 2 providers into real async groups.** Highest likely payoff for `AppCore` scripting cost.
4. **Replace terminal polling and coalesce fit work.** High payoff for Tauri desktop smoothness once a session is open.
5. **Gate `EmmetWrapDialog` and trim always-on AppCore overlays.** Good startup win with low functional risk.
6. **Validate whether Monaco worker imports can be pushed later.** Potentially high payoff, but measure first.

---

## Bottom line

The repo already shows deliberate performance engineering, especially around `AppShell`, Monaco lazy loading, and manual chunking. The next gains are no longer about introducing laziness in general; they are about making the existing deferral strategy **real at the bundle boundary**, narrowing the set of UI that renders immediately after `AppCore` loads, and removing hot-path timer/resize work from the terminal stack.

If only three actions are taken first, they should be:

1. correct the preload exclusion list,
2. stop sending every route through the full IDE layout,
3. convert deferred providers from idle-mounted imports into true async groups.
