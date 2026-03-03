# Cortex IDE — Consolidated QA Bug Reports

This file reconciles reports from:
- `worker/7fe68ab9-ac3/1772520097916`
- `worker/d46ddcf2-c38/1772520097600`

---

# Cortex IDE — DOM & Visual Smoke Test Bug Report

**Date:** 2026-03-03  
**App Version:** 0.1.0 (com.cortexlm.cortex-ide)  
**Tauri Version:** 2.10.2  
**Platform:** Linux x86_64 (Ubuntu, debug build)  
**WebView:** WebKitGTK (AppleWebKit/605.1.15, Safari/605.1.15)  
**Window Size:** 1400×900  
**Route Tested:** `/welcome` (no project loaded)  

---

## Test Environment

| Property | Value |
|----------|-------|
| Rust toolchain | rustc 1.95.0-nightly |
| Display server | Xvfb :99 (1920×1080×24) |
| Device pixel ratio | 1 |
| Color scheme preference | light |
| Total DOM nodes | 270 |
| Fonts loaded | 9 (status: loaded) |
| Stylesheets | 9 (5 external CSS, 4 inline `<style>` tags) |
| MCP Bridge | Connected on 127.0.0.1:9223 |

---

## UI Structure Overview

### Layout Hierarchy

```
body (900×1400, overflow:hidden)
└── #root (flex column, 900×1400, min-height:900px)
    ├── a.skip-link (18×1400) ← BUG-002: visible, should be hidden
    ├── div (app container, 882×1400, 100vh, flex column, overflow:hidden)
    │   ├── header (titlebar, 48×1400, min-height:48px)
    │   │   ├── div (left: logo + mode switch + menu bar)
    │   │   │   ├── SVG logo
    │   │   │   ├── [Vibe] [IDE] mode toggle buttons
    │   │   │   ├── [Open File] button
    │   │   │   └── Menu bar: [File] [Edit] [Selection] [View] [Go] [Terminal] [Help]
    │   │   └── div (right: model selector + window controls)
    │   │       ├── [claude-opus-4.5] model selector
    │   │       ├── icon button (no accessible name)
    │   │       └── [Minimize] [Maximize] [Close] window controls
    │   ├── main (0×1400, flex:1) ← BUG-001: crushed to 0px height
    │   │   └── div (mode carousel, 0×1400, flex:1)
    │   │       └── div (vibe layout, 0×1400)
    │   │           ├── div (sidebar, 0×326)
    │   │           │   ├── div (header: "Cortex" + button, 48×324)
    │   │           │   ├── div (file tree content, 32×324, empty)
    │   │           │   └── div (footer: "New workspace", 52×324)
    │   │           └── div (editor + chat area, 0×1038)
    │   │               ├── div (editor panel, 0×738)
    │   │               │   ├── div (tab bar: [All Changes] [Current task] [Review])
    │   │               │   ├── div (content area, 24×737, empty)
    │   │               │   └── div (input area with prompt box, 152×737)
    │   │               └── div (chat panel, 12×298)
    │   │                   ├── div (tab bar: [Changes] [All Files])
    │   │                   ├── div (messages area, 0×298, "No changes yet")
    │   │                   ├── div (resize handle, 4×298)
    │   │                   └── div (terminal, 186×282)
    │   │                       ├── div (header: "Terminal" + [Run])
    │   │                       ├── div (output: "cortex-app git:(Cortex)")
    │   │                       └── div (input: "$ [enter command...]")
    │   ├── div ×8 (window resize handles, position:fixed, z-index:1000)
    │   └── div[data-testid=welcome-page] (834×1400) ← BUG-001: sibling of main, steals space
    │       └── div (centered content)
    │           ├── img (Cortex logo, 280×209, loaded OK)
    │           ├── h1 "Welcome to Cortex" (24px, #fcfcfc)
    │           └── div (actions)
    │               ├── [New File] button
    │               ├── [Open File] button
    │               ├── [Open Folder] button
    │               └── [Clone Git Repository] button
    ├── div.sr-only (screen reader announcements, 1×1)
    └── div.notifications-toasts (position:fixed, bottom:30px, right:16px, empty)
```

### Interactive Elements Summary

| Category | Count |
|----------|-------|
| Total buttons | 29 |
| Text inputs | 2 |
| Focusable elements | 32 |
| Buttons without accessible name | 11 |
| Inputs without label | 0 (both have placeholder text) |

### ARIA Landmarks

| Landmark | Present |
|----------|---------|
| `<header>` | ✅ |
| `<main>` | ✅ (but 0px height) |
| `<nav>` | ❌ |
| `<footer>` | ❌ |
| `<aside>` | ❌ |
| `role="navigation"` | ❌ |
| `role="search"` | ❌ |
| `role="banner"` | ❌ |

---

## Bugs Found

### BUG-001 — Main content area has 0px height (CRITICAL)

**Severity:** Critical  
**Impact:** The entire IDE workspace (sidebar, editor, chat panel, terminal) is invisible. Only the title bar and the Welcome page overlay are visible.

**Root Cause:**

The `CortexDesktopLayout` component (`src/components/cortex/CortexDesktopLayout.tsx`) renders `{props.children}` (line 418) as a direct child of the app container `<div>`, making the Welcome page component a **sibling** of `<main>` rather than a child of it.

The app container is a flex column with `height: 100vh`. The layout:

| Element | flex | height | Actual height |
|---------|------|--------|---------------|
| `<header>` | 0 1 auto | 48px (min-height: 48px) | 48px |
| `<main>` | 1 1 0% | — | **0px** |
| Welcome page `<div>` | 0 1 auto | 100% (= 882px) | **834px** |

Because `<main>` has `flex-basis: 0%`, it starts at 0px. The Welcome page has `height: 100%` which resolves to the container's full height (882px). After flex shrinking (to accommodate the 48px header), the Welcome page occupies 834px, leaving exactly 0px for `<main>`.

**Evidence:**
```
main computed height: 0px
main computed flex: 1 1 0%
Welcome page computed height: 834px  
Welcome page style: height: 100%
App container height: 882px (100vh - 18px skip-link offset)
```

**Affected Components:**
- Sidebar / file explorer (0px height)
- Editor tab bar and content area (0px height)
- Chat panel (collapsed to ~12px)
- Mode carousel (0px height)

**Fix Suggestion:**
The Welcome page should either:
1. Be rendered **inside** `<main>` (move `{props.children}` inside the `<main>` tag), or
2. Use `position: absolute/fixed` with `inset: 0` to overlay without affecting flex layout, or
3. Remove `height: 100%` from the Welcome page wrapper and use `flex: 1` instead.

---

### BUG-002 — Skip-link visible, consuming 18px vertical space (HIGH)

**Severity:** High  
**Impact:** The skip-link anchor is rendered as a visible 18px-tall block at the top of the viewport, pushing the entire app container down by 18px.

**Root Cause:**

The skip-link CSS is defined in `AccessibilityContext.tsx` (line 424) with `position: fixed; top: -100px;` to hide it off-screen until focused. However, this CSS is injected via a dynamically created `<style id="accessibility-styles">` tag. In the WebKitGTK environment, this style tag's `.sheet` property is `null`, meaning the CSS rules are **not applied**.

**Evidence:**
```
.skip-link computed position: static (expected: fixed)
.skip-link computed top: auto (expected: -100px)
.skip-link computed height: 18px (expected: 0px visible)
Style tag #accessibility-styles .sheet: null
```

**Affected Layout:**
- `#root` flex container: skip-link takes 18px, app container starts at y=18
- App container has `height: 100vh` (900px) but starts at y=18, so bottom 18px extends beyond viewport (clipped by body `overflow: hidden`)

**Fix Suggestion:**
Add inline styles to the skip-link element as a fallback: `style="position:fixed;top:-100px;left:50%;transform:translateX(-50%);z-index:9999"`. This ensures hiding works regardless of whether the `<style>` tag is parsed.

---

### BUG-003 — Dynamically injected `<style>` tags not applying CSS (HIGH)

**Severity:** High  
**Impact:** CSS rules from 3 of 4 inline `<style>` tags are not applied, affecting accessibility styles, theme transitions, and xterm terminal rendering.

**Details:**

| Style Tag | ID | `.sheet` | Rules Applied |
|-----------|----|----------|---------------|
| Index 0 (`:root` vars) | — | ✅ (16 rules) | ✅ Yes (has nonce) |
| Index 1 (theme transitions) | `theme-transition-styles` | ❌ null | ❌ No |
| Index 2 (accessibility) | `accessibility-styles` | ❌ null | ❌ No |
| Index 3 (xterm overrides) | — | ❌ null | ❌ No |

**Root Cause:**

The working style tag (index 0) has a `nonce` attribute (`nonce="4560400394033001274"`), while the failing tags do not. The Tauri CSP (`style-src 'self' 'unsafe-inline'`) should allow inline styles, but the WebKitGTK implementation may require nonces when one is present. A test confirmed that even freshly created `<style>` tags without nonces fail to apply in this environment.

**CSS Rules Not Applied:**
- `.skip-link` positioning (hidden off-screen)
- `.reduced-motion` animation disabling
- `.high-contrast` mode overrides
- `.screen-reader-optimized` styles
- `.large-text` font size overrides
- `.sr-only` screen reader utility class
- Theme transition animations
- xterm terminal styling overrides

**Fix Suggestion:**
Either propagate the CSP nonce to all dynamically created `<style>` tags, or move these styles into the main CSS bundle (compiled by Vite/Tailwind).

---

### BUG-004 — Buttons missing accessible names (MEDIUM)

**Severity:** Medium  
**Impact:** 11 buttons have no text content, `aria-label`, or `title` attribute, making them inaccessible to screen readers and assistive technology.

**Affected Buttons:**

| Location | Size | Description |
|----------|------|-------------|
| Title bar (x:1256, y:34) | 16×16 | Icon button near model selector |
| Sidebar header (x:301, y:81) | 20×20 | Icon button (likely collapse/menu) |
| Editor tab bar (x:351, y:67) | 145×48 | Tab with SVG icon + text "All Changes" — text exists in innerHTML but `innerText` is empty |
| Editor tab bar (x:497, y:67) | 148×48 | Tab "Current task" — same issue |
| Editor tab bar (x:646, y:67) | 110×48 | Tab "Review" — same issue |
| Editor toolbar (x:397, y:265) | 28×28 | SVG icon button |
| Editor toolbar (x:853, y:265) | 149×28 | SVG icon button with gap |
| Editor toolbar (x:1014, y:265) | 28×28 | SVG icon button |
| Chat tab bar (x:1089, y:67) | 103×48 | Tab "Changes" — text in innerHTML but `innerText` empty |
| Chat tab bar (x:1193, y:67) | 95×48 | Tab "All Files" — same issue |
| Chat panel (x:1316, y:209) | 16×16 | Small icon button |

**Note:** Several tab buttons report empty `innerText` despite having text in their `innerHTML`. This may be because the parent container has `height: 0px` (BUG-001), causing the text to not be laid out and thus not reported by `innerText`.

---

### BUG-005 — Missing ARIA landmarks (LOW)

**Severity:** Low  
**Impact:** Screen readers cannot identify navigation regions, sidebars, or footer areas.

**Missing landmarks:**
- No `<nav>` or `role="navigation"` for the menu bar or sidebar navigation
- No `<aside>` or `role="complementary"` for the sidebar panel
- No `<footer>` or `role="contentinfo"` for the status bar area
- No `role="search"` for the search input
- No `role="banner"` on the header

---

### BUG-006 — Backend auto-update endpoint failure (LOW)

**Severity:** Low (non-blocking)  
**Impact:** Auto-update check fails on startup, but does not affect app functionality.

**Log Entry:**
```
ERROR tauri_plugin_updater::updater: update endpoint did not respond with a successful status code
WARN  cortex_gui_lib::auto_update: Failed to check for updates on startup: Could not fetch a valid release JSON from the remote
```

---

### BUG-007 — Missing D-Bus and video capture in headless environment (INFO)

**Severity:** Info (environment-specific)  
**Impact:** Expected in headless/CI environments. Not a bug in the application itself.

**Log Entries:**
```
Unable to connect to the Desktop portal: Failed to execute child process "dbus-launch" (No such file or directory)
Video capture was requested but no device was found amongst 0 devices
```

---

## CSS Analysis

### CSS Custom Properties (Theme Tokens)

All critical CSS variables are properly defined:

| Variable | Value |
|----------|-------|
| `--cortex-bg-primary` | `#141415` |
| `--cortex-bg-secondary` | `#1c1c1d` |
| `--cortex-text-primary` | `#fcfcfc` |
| `--cortex-text-secondary` | `#8c8d8f` |
| `--cortex-border-default` | `#2e2f31` |
| `--cortex-font-sans` | `"Inter", "Figtree", -apple-system, ...` |
| `--cortex-space-3` | `12px` |
| `--cortex-radius-xl` | `16px` |
| `--cortex-radius-lg` | `12px` |
| `--cortex-radius-md` | `8px` |

### Z-Index Stacking

| z-index | Element | Purpose |
|---------|---------|---------|
| 1000 | 8× resize handle divs | Window resize handles (position:fixed) |
| 1000 | `.notifications-toasts` | Toast notification container |
| 9999 | 2× notification divs | Notification overlay containers |

No z-index conflicts detected. All high z-index elements use `position: fixed` and are appropriately layered.

### Overflow Analysis

- No elements overflow the viewport boundaries
- `body` has `overflow: hidden` (correct for desktop app)
- App container has `overflow: hidden` (correct)
- No horizontal scrollbars detected
- App container `scrollHeight === clientHeight` (no hidden overflow)

---

## Console Log Analysis

**JavaScript Errors:** None detected during initial load.

The MCP Bridge console capture only shows initialization messages:
```
[MCP][BRIDGE][INFO] Console capture initialized
[MCP][BRIDGE][INFO] Ready
```

No JavaScript errors, warnings, or unhandled promise rejections were captured. Note: console capture was initialized after the app's initial render, so any errors during the SolidJS hydration phase may have been missed.

---

## Loaded Resources

### Stylesheets (all loaded successfully)

| File | Rules |
|------|-------|
| `figtree.css` | 2 |
| `dm-sans.css` | 2 |
| `inter.css` | 5 |
| Inline (`:root` vars) | 16 |
| `index-BL1qZ7kV.css` | 1541 |
| `AppCore-D78-c2sT.css` | 108 |
| `vendor-xterm-core-DLuoa74B.css` | 45 |
| `extensions-CWjeIZsx.css` | 150 |
| `terminal-I_IxCwVX.css` | 233 |

### Images

| Image | Status | Size |
|-------|--------|------|
| `abstract-design.svg` (Cortex logo) | ✅ Loaded | 280×209 |

No broken images detected.

---

## Backend State

| Property | Value |
|----------|-------|
| App name | Cortex IDE |
| Identifier | com.cortexlm.cortex-ide |
| Version | 0.1.0 |
| Tauri version | 2.10.2 |
| Debug mode | true |
| Window count | 1 |
| Main window visible | true |
| Main window focused | true |
| Startup time (Phase A) | ~0.5ms |
| Startup time (Phase B) | ~0.5ms |
| Total setup time | 317ms |
| AI threads | 0 |
| Extensions loaded | 0 |
| System locale | en |

---

## Summary

| Severity | Count | Key Issue |
|----------|-------|-----------|
| 🔴 Critical | 1 | Main content area invisible (0px height) |
| 🟠 High | 2 | Skip-link visible; dynamic styles not applied |
| 🟡 Medium | 1 | 11 buttons missing accessible names |
| 🔵 Low | 2 | Missing ARIA landmarks; auto-update failure |
| ⚪ Info | 1 | Headless environment warnings |

The most impactful issue is **BUG-001**: the Welcome page component being rendered as a sibling of `<main>` rather than inside it, causing the entire IDE workspace to be crushed to 0px height. This is a layout architecture issue in `CortexDesktopLayout.tsx` where `{props.children}` (the routed page content) is placed outside the `<main>` element.


---

# Cortex IDE — IPC Command Bug Report

**Date:** 2026-03-03  
**App Version:** 0.0.6 (Tauri 2.10.2)  
**Environment:** Linux x86_64, debug build, headless (Xvfb)  
**Total Registered Commands:** 998  
**Commands Tested:** ~150 unique commands  
**Test Method:** `window.__TAURI__.core.invoke()` via MCP Bridge on localhost:9223

---

## Executive Summary

Out of 998 registered IPC commands, ~150 were directly tested. Of those, **128 calls succeeded** and **159 calls failed** (including retries with corrected arguments). The failures break down into four categories:

| Category | Count | Severity |
|---|---|---|
| **Panics** (task crashes) | 13 calls across 5 commands | 🔴 Critical |
| **Timeouts** (command never resolves) | ~15 commands | 🔴 Critical |
| **Environment-specific errors** | ~5 commands | 🟡 Medium |
| **Argument mismatch** (wrong arg names used by caller) | ~40 calls | 🟢 Caller error, not bugs |

---

## 🔴 BUG 1: Git Commands Panic with "failed printing to stderr: Broken pipe"

**Severity:** Critical  
**Affected Commands:**
- `git_init`
- `git_commit`
- `git_clone`
- `git_unstage`
- `load_keybindings_file`

**Error:**
```
Task join error: task NNN panicked with message "failed printing to stderr: Broken pipe (os error 32)"
```

**Reproduction:**
```js
window.__TAURI__.core.invoke('git_init', {path: '/tmp/test-git-init'})
window.__TAURI__.core.invoke('git_commit', {path: '/workspace/ide', message: 'test', sign: false})
window.__TAURI__.core.invoke('git_clone', {url: 'https://example.com/repo.git', targetDir: '/tmp/clone'})
window.__TAURI__.core.invoke('load_keybindings_file')
```

**Root Cause Analysis:**  
These commands use `tokio::task::spawn_blocking` and internally invoke git CLI commands or perform operations that write to stderr. When stderr's pipe is broken (e.g., in headless/daemon mode where the parent process doesn't read stderr), the `eprintln!`/`writeln!(stderr)` macro panics because Rust's default behavior is to panic on write failures to stderr.

**Impact:** Any git operation that shells out to the `git` CLI will crash the async task. This affects `git_init`, `git_commit`, `git_clone`, `git_unstage` (when calling git CLI), and `load_keybindings_file`.

**Suggested Fix:**  
In all `spawn_blocking` closures that invoke external processes, redirect stderr or use `Command::new().stderr(Stdio::piped())` to capture stderr instead of inheriting it. Alternatively, wrap stderr writes in `let _ = writeln!(...)` to suppress broken pipe panics.

---

## 🔴 BUG 2: Multiple Commands Timeout / Never Resolve

**Severity:** Critical  
**Affected Commands:**

| Command | Expected Behavior | Actual |
|---|---|---|
| `fs_create_file` | Creates an empty file | File IS created on disk but the Promise never resolves |
| `fs_write_file` | Writes content to file | Content IS written but Promise never resolves |
| `fs_create_directory` | Creates directory | Directory IS created but Promise never resolves |
| `fs_delete_directory` | Deletes directory | Timeout |
| `write_file` (fs_commands) | Writes file | Timeout |
| `delete_entry` (fs_commands) | Deletes entry | Timeout |
| `terminal_create` | Creates a PTY terminal | Timeout |
| `settings_reset` | Resets settings to defaults | Timeout |
| `frontend_ready` | Triggers Phase B init | Timeout |
| `get_system_specs` | Returns system info | Timeout |
| `list_available_themes` | Lists theme stubs | Timeout |
| `i18n_detect_locale` | Detects system locale | Timeout |
| `check_for_updates` | Checks for app updates | Timeout |
| `diagnostics_refresh` | Refreshes diagnostics | Timeout |
| `git_watch_repository` | Starts git file watcher | Timeout |
| `rules_scan_project` | Scans for rules files | Timeout |
| `notebook_detect_kernels` | Detects Jupyter kernels | Timeout |
| `notebook_list_kernels` | Lists running kernels | Timeout |
| `debug_detect_adapters` | Detects debug adapters | Timeout |
| `cortex_create_session` | Creates AI session | Timeout |
| `ai_init_threads` | Initializes AI threads | Timeout |
| `add_recent_workspace` | Adds workspace to recents | Timeout (with correct args) |
| `git_forge_authenticate` | Authenticates with forge | Timeout |

**Key Observation for FS Commands:**  
`fs_create_file`, `fs_write_file`, and `fs_create_directory` **do complete their file system operations** (verified by checking the filesystem), but the IPC Promise never resolves back to the frontend. This strongly suggests a **deadlock or blocked event emission** after the file operation completes.

Notably, `fs_read_file`, `fs_delete_file`, `fs_get_metadata`, `fs_detect_encoding`, and other read-only FS commands work perfectly and return within 0-10ms.

**Possible Root Causes:**
1. **File watcher notification deadlock:** Write operations may trigger file system watcher events that attempt to acquire a lock already held by the write operation.
2. **Event emission blocking:** The command may be trying to emit a Tauri event (e.g., `fs:changed`) that blocks on the main thread while the command itself is running on the main thread.
3. **`terminal_create`:** PTY creation may be blocking waiting for shell initialization or attempting to read from the PTY in a way that blocks the async runtime.
4. **`frontend_ready`:** Triggers Phase B initialization which runs many parallel async tasks (extensions, LSP, AI, MCP, SSH, auto-update, factory). Any of these could hang in this headless environment.
5. **`get_system_specs`:** Uses `sysinfo` crate with CPU refresh which may block for extended periods.

---

## 🟡 BUG 3: `batch_invoke` Only Supports a Subset of Commands

**Severity:** Medium  
**Command:** `batch_invoke`

**Reproduction:**
```js
window.__TAURI__.core.invoke('batch_invoke', {
  calls: [
    {id: '1', cmd: 'get_version', args: {}},
    {id: '2', cmd: 'get_server_info', args: {}}
  ]
})
// Result: get_version succeeds, get_server_info returns "Unknown batch command"
```

**Expected:** All registered IPC commands should be callable via `batch_invoke`.  
**Actual:** Only a subset of commands are registered in the batch dispatcher. `get_server_info` (and likely many others) return `"Unknown batch command"`.

---

## 🟡 BUG 4: `settings_update` Requires Full Section Object

**Severity:** Medium  
**Command:** `settings_update`

**Reproduction:**
```js
// Attempting to update a single field:
window.__TAURI__.core.invoke('settings_update', {
  section: 'editor',
  value: {fontSize: 16}
})
// Error: "Invalid editor settings: missing field `fontFamily`"
```

**Expected:** Partial updates to a settings section should be supported (merge with existing values).  
**Actual:** The entire section object must be provided with all fields, making granular updates impractical for the frontend.

---

## 🟡 BUG 5: `get_workspace_symbols` Rejects Valid Paths

**Severity:** Medium  
**Command:** `get_workspace_symbols`

**Reproduction:**
```js
window.__TAURI__.core.invoke('get_workspace_symbols', {
  query: 'test',
  workspacePath: '/workspace/ide'
})
// Error: "Invalid workspace path: Path '/workspace/ide' is outside allowed directories"
```

**Root Cause:** The path security validation (`get_allowed_roots()`) only allows paths under `$HOME`, `$DOCUMENTS`, `$TEMP`, and a few hardcoded development directories. The current working directory `/workspace/ide` is not in any of these roots.

**Impact:** Users working from non-standard directories (containers, CI environments, custom mount points) cannot use workspace symbol search.

---

## 🟡 BUG 6: `list_listening_ports` Fails Without `lsof`

**Severity:** Medium  
**Command:** `list_listening_ports`

**Error:** `Failed to run lsof: No such file or directory (os error 2)`

**Root Cause:** The command shells out to `lsof` which is not installed in minimal Linux environments (containers, CI).

**Suggested Fix:** Fall back to parsing `/proc/net/tcp` on Linux when `lsof` is unavailable.

---

## 🟡 BUG 7: `open_in_browser` Fails in Headless Environment

**Severity:** Low (environment-specific)  
**Command:** `open_in_browser`

**Error:** `Failed to open URL: Launcher "xdg-open" "https://example.com" failed with ExitStatus(unix_wait_status(768))`

**Root Cause:** No desktop environment configured. Expected behavior in headless mode.

---

## 🟡 BUG 8: `fs_get_documents_dir` / `fs_get_desktop_dir` Fail on Minimal Linux

**Severity:** Low (environment-specific)  
**Commands:** `fs_get_documents_dir`, `fs_get_desktop_dir`

**Error:** `Could not determine documents/desktop directory`

**Root Cause:** `dirs::document_dir()` / `dirs::desktop_dir()` return `None` when XDG directories are not configured (common in containers/CI).

**Suggested Fix:** Return a sensible fallback (e.g., `$HOME/Documents`) instead of an error.

---

## 🟢 Successfully Tested Commands (128 calls)

All of these commands returned correct results within 0-54ms:

### Core / Misc
| Command | Result | Latency |
|---|---|---|
| `get_version` | `"0.0.6"` | 0ms |
| `get_server_info` | `{port: 4096, url: "http://127.0.0.1:4096", running: true}` | 1ms |
| `get_logs` | `""` (empty) | 0ms |
| `get_app_version` | `"0.1.0"` | 1ms |
| `show_notification` | `null` (success) | 1ms |
| `get_update_status` | `{type: "Checking"}` | 0ms |
| `get_update_info` | `null` | 0ms |

### Settings
| Command | Result | Latency |
|---|---|---|
| `settings_get` | Full settings object | 0-3ms |
| `settings_load` | Full settings object | 0-1ms |
| `settings_export` | JSON string of settings | 0-1ms |

### File System (Read Operations)
| Command | Result | Latency |
|---|---|---|
| `fs_get_home_dir` | `"/root"` | 1-5ms |
| `fs_get_default_projects_dir` | `"/root/Cortex/Projects"` | 0ms |
| `fs_exists({path: '/tmp'})` | `true` | 0ms |
| `fs_exists({path: '/nonexistent'})` | `false` | 1ms |
| `fs_is_file({path: '/etc/hostname'})` | `true` | 1ms |
| `fs_is_directory({path: '/tmp'})` | `true` | 0ms |
| `fs_read_file` | File content string | 0-1ms |
| `read_file` | `{content, encoding, path, size}` | 0ms |
| `fs_get_metadata` | Full metadata object | 0ms |
| `fs_detect_encoding` | `"UTF-8"` | 1ms |
| `fs_detect_eol` | `"LF"` | 1ms |
| `fs_get_supported_encodings` | Array of 20+ encodings | 0-1ms |
| `fs_list_directory` | Array of FileEntry objects | 1ms |
| `fs_search_files` | Array of matching files | 8-10ms |
| `fs_get_file_tree` | Nested FileEntry tree | 2ms |
| `fs_delete_file` | `null` (success) | 0ms |

### Git
| Command | Result | Latency |
|---|---|---|
| `git_status` | `{branch, staged, unstaged, conflicts, ahead, behind, ...}` | 13-27ms |
| `git_log({limit: 3})` | Array of commit objects | 1ms |
| `git_diff` | Diff string | 10-11ms |
| `git_diff_staged` | `[]` (empty) | 3ms |
| `git_stash_list` | `[]` (empty) | 0-1ms |
| `git_blame({file: 'package.json'})` | Array of BlameEntry objects | 53-54ms |
| `git_branches` | `{branches: [...]}` | 1ms |
| `git_current_branch` | Branch name string | 0ms |
| `git_remotes` | `{remotes: [...]}` | 0ms |
| `git_head` | `{sha: "..."}` | 1ms |
| `git_is_repo` | `{isRepo: true}` | 0ms |
| `git_worktree_list` | Array of worktree objects | 51ms |
| `git_submodule_list` | `[]` (empty) | 3ms |
| `git_list_tags` | `[]` (empty) | 1ms |
| `git_lfs_status` | LFS status object | 50ms |

### Terminal
| Command | Result | Latency |
|---|---|---|
| `terminal_list` | `[]` (empty) | 0ms |
| `terminal_get_default_shell` | `"/bin/bash"` | 3ms |
| `terminal_detect_shells` | `["/bin/bash", "/bin/sh", "/usr/bin/bash"]` | 0ms |
| `terminal_profiles_list` | `[]` (empty) | 0ms |
| `path_exists({path: '/tmp'})` | `true` | 0ms |

### AI / Agents
| Command | Result | Latency |
|---|---|---|
| `ai_list_models` | `[]` (empty) | 0ms |
| `ai_list_threads` | `[]` (empty) | 0ms |
| `ai_thread_count` | `0` | 5ms |
| `ai_get_provider_models({provider: 'anthropic'})` | Array of model objects | 0ms |
| `agent_list` | `[]` (empty) | 0ms |
| `agent_get_stats` | Stats object (all zeros) | 0ms |
| `cortex_list_stored_sessions` | `[]` (empty) | 1ms |
| `tools_list` | Array of tool definitions | 0ms |
| `acp_list_tools` | Array of ACP tool definitions | 0ms |

### Extensions
| Command | Result | Latency |
|---|---|---|
| `get_extensions` | `[]` (empty) | 0ms |
| `get_enabled_extensions` | `[]` (empty) | 0ms |
| `get_extensions_directory` | `"/root/.cortex/extensions"` | 1ms |

### Other
| Command | Result | Latency |
|---|---|---|
| `lsp_list_servers` | `[]` (empty) | 0ms |
| `diagnostics_get_summary` | `{error_count: 0, ...}` | 0ms |
| `diagnostics_get_by_file` | `[]` (empty) | 1ms |
| `collab_get_server_status` | `{running: false, ...}` | 0ms |
| `activity_get_tasks` | `[]` (empty) | 0ms |
| `activity_get_history` | `[]` (empty) | 0ms |
| `action_log_get_entries` | `[]` (empty) | 1ms |
| `action_log_get_session` | `null` | 0ms |
| `batch_cache_stats` | Cache stats object | 0ms |
| `get_default_keybindings` | `[]` (empty) | 0-1ms |
| `get_theme_by_id({id: 'dark'})` | Theme data object | 1ms |
| `get_recent_workspaces` | `[]` (empty) | 0-1ms |
| `wsl_list_distributions` | `[]` (empty) | 0ms |
| `prompt_store_get_path` | Path string | 1ms |
| `mcp_list_servers` | `[]` (empty) | 1ms |
| `remote_get_profiles` | `[]` (empty) | 2ms |
| `remote_get_connections` | `[]` (empty) | 0ms |
| `remote_get_default_key_paths` | `[]` (empty) | 0ms |
| `timeline_get_stats` | `{totalEntries: 0, ...}` | 0ms |
| `repl_list_kernel_specs` | Array of kernel specs | 3ms |
| `repl_list_kernels` | `[]` (empty) | 0ms |
| `factory_list_workflows` | `[]` (empty) | 0ms |
| `batch_invoke` | Array of results | 6ms |
| `rules_get_user_dir` | `"/root/.cortex/rules"` | 0ms |
| `search_history_get` | `{searchEntries: [], replaceEntries: []}` | 0ms |
| `search_history_load` | Same as above | 1ms |
| `tasks_list` | `[]` (empty) | 0ms |
| `tasks_get_config` | `{version: "2.0.0", tasks: [], inputs: []}` | 0ms |
| `browser_list` | `[]` (empty) | 0ms |
| `language_get_all` | Array of language definitions | 1ms |
| `language_get_by_extension({extension: 'rs'})` | `{id: "rust", ...}` | 1ms |
| `language_get_by_id({id: 'rust'})` | `{id: "rust", ...}` | 0ms |
| `language_detect_from_path({path: 'test.rs'})` | `"rust"` | 0ms |

---

## Network-Dependent Failures (Expected in Offline Environment)

These commands failed because the test environment has no internet access:

| Command | Error |
|---|---|
| `search_marketplace` | Failed to fetch from `https://marketplace.cortex.ai/...` |
| `get_featured_extensions` | Failed to fetch from `https://marketplace.cortex.ai/...` |
| `get_marketplace_categories` | Failed to fetch from `https://marketplace.cortex.ai/...` |

---

## `mcp__tauri__ipc_execute_command` Does Not Work

The MCP Bridge's `ipc_execute_command` tool returns `"Unsupported Tauri command"` for all tested commands (`get_version`, `get_server_info`, `settings_get`, `get_logs`). All commands must be invoked via `window.__TAURI__.core.invoke()` through `webview_execute_js` instead. This appears to be a limitation of the MCP Bridge plugin's command routing — it does not have access to the app's registered invoke handler.

---

## Recommendations

### Priority 1 — Fix Panics
1. **Guard all `spawn_blocking` git CLI invocations** against stderr broken pipe panics. Use `Command::new().stderr(Stdio::piped())` or wrap stderr writes.
2. **Fix `load_keybindings_file`** — same stderr panic issue.

### Priority 2 — Fix Timeouts
3. **Investigate `fs_create_file` / `fs_write_file` / `fs_create_directory` deadlock.** The file operations complete but the Promise never resolves. Check for file watcher lock contention or blocking event emission.
4. **Fix `terminal_create` timeout.** PTY creation or shell startup may be blocking the async runtime.
5. **Add timeout guards** to `get_system_specs`, `settings_reset`, `check_for_updates`, `debug_detect_adapters`, `notebook_detect_kernels`, and other commands that can hang indefinitely.

### Priority 3 — Improve Robustness
6. **Support partial settings updates** in `settings_update` by merging with existing values.
7. **Expand `batch_invoke` command registry** to include all registered commands.
8. **Add fallback for `list_listening_ports`** when `lsof` is unavailable (parse `/proc/net/tcp`).
9. **Return fallback paths** for `fs_get_documents_dir` / `fs_get_desktop_dir` when XDG dirs are not configured.
10. **Expand `get_allowed_roots()`** to include the current working directory on all platforms, not just Windows.
