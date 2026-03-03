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
