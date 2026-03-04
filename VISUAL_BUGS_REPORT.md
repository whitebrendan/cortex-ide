# Cortex IDE — Visual Bugs Report

**Date:** 2026-03-04  
**Repo:** `/workspace/ide`  
**Branch:** `worker/a747e3f2-2b1/1772646102981`  
**Audit scope:** Visual/UX diagnosis of desktop app in Tauri dev runtime

---

## Executive Summary

The UI currently shows a **critical layout/routing regression** on `/welcome`: the Welcome page is rendered **on top of** the desktop shell (title bar, mode toggle, activity/status controls), and the main IDE region collapses to zero height. This causes overlapping layers, hidden editor content, and confusing interactions.

I identified **5 confirmed issues**:
- 1 × Critical
- 1 × High
- 3 × Medium

I also verified a few previously suspicious items are **not broken** (welcome logo image asset, SVG icon rendering, file icon asset presence).

---

## Environment & Method

- App launched via `npm run tauri dev` (headless/Xvfb environment)
- MCP bridge connected at `127.0.0.1:9223`
- Route under test: `http://localhost:1420/welcome`
- Modes tested: Vibe and IDE toggle
- Evidence sources:
  - Tauri screenshots
  - Accessibility tree snapshots
  - DOM/computed-style JavaScript probes
  - Console logs
  - Source inspection in `src/`

---

## Screenshots

- [`visual-audit-initial.png`](./visual-audit-initial.png)
- [`visual-audit-after-ide-click.png`](./visual-audit-after-ide-click.png)
- [`visual-audit-explorer-click.png`](./visual-audit-explorer-click.png)
- [`visual-audit-vibe-mode.png`](./visual-audit-vibe-mode.png)
- [`visual-audit-ide-mode.png`](./visual-audit-ide-mode.png)

---

## Confirmed Visual Bugs

## VB-01 — Welcome page overlays desktop shell on `/welcome`
**Severity:** Critical

### What is wrong
On the `/welcome` route, the Welcome screen is rendered simultaneously with the desktop shell UI. Users can see title bar controls, mode toggles, and IDE chrome while the Welcome page occupies the same viewport.

### Evidence
- Accessibility snapshot contains both:
  - desktop shell controls (Vibe/IDE buttons, activity bar/status items)
  - Welcome content (`Welcome to Cortex`, `New File`, `Open File`, etc.)
- DOM hit-testing (`elementFromPoint`) at coordinates where shell controls appear returns `data-testid="welcome-page"`, indicating the Welcome layer is on top.
- URL remains `/welcome` even after clicking **IDE mode**.
- Visible in screenshots: `visual-audit-vibe-mode.png`, `visual-audit-ide-mode.png`.

### Likely root cause
- `src/index.tsx`: all routes are wrapped by `CortexDesktopLayout`.
- `src/components/cortex/CortexDesktopLayout.tsx`: always renders shell + `<main ...>` and then always renders `{props.children}` at the bottom of the same flex column.
- `/welcome` route child (`src/pages/Welcome.tsx`) is therefore layered into the same layout instead of replacing it.

---

## VB-02 — Main IDE region collapses to 0px height on `/welcome`
**Severity:** High

### What is wrong
When `/welcome` is active, the IDE `<main>` container collapses, causing editor content to disappear or become effectively unusable.

### Evidence
DOM metrics collected live:
- App container height: `900px`
- Header: `48px`
- Main: **`0px`**
- Welcome page child: `852px`

This shows the Welcome child consumes the available height while the flex main area collapses. Status bar/controls appear detached near the top due this collapse.

### Impact
- No usable editor viewport in IDE mode while on `/welcome`
- Broken first-run UX and route transition behavior

---

## VB-03 — Tab active indicator color inconsistency between tab systems
**Severity:** Medium

### What is wrong
Two tab implementations use different active indicator tokens/fallbacks:
- `src/components/editor/EditorTab.tsx` → `var(--cortex-accent-primary, #B2FF22)`
- `src/components/editor/TabBar.tsx` → `var(--cortex-accent, #6366F1)`

### Why this matters
Depending on which tab component is active in a given surface, users can see inconsistent accent colors for the same UI state (active tab).

---

## VB-04 — Missing backend commands create visible error/degraded states
**Severity:** Medium

### Console evidence
- `[WorkspaceSymbols] Failed to refresh stats: Command workspace_symbols_get_stats not found`
- `[Command] Extension commands unavailable: Command vscode_get_command_palette_items not found`

### UX impact
Parts of UI that depend on these commands appear unavailable, stale, or error-prone during startup.

---

## VB-05 — Repeated SolidJS cleanup lifecycle warnings
**Severity:** Medium

### Console evidence
- `cleanups created outside a 'createRoot' or 'render' will never be run` (repeated multiple times)

### Why this matters
Not directly a visual artifact by itself, but strongly correlated with unstable UI behavior over time (leaks, stale listeners, inconsistent component teardown).

---

## Console Warnings/Errors (captured)

- `ERROR`: `workspace_symbols_get_stats` command not found
- `DEBUG`: `vscode_get_command_palette_items` command not found (extension commands unavailable)
- `WARN`: Solid cleanup warnings (x3)
- `WARN`: Terminal WebGL addon unavailable, canvas fallback
  - In this headless environment this is expected and **not classified as a product visual bug**

---

## Code-Level Issues (from source inspection)

- `src/components/cortex/CortexDesktopLayout.tsx`
  - The layout always renders shell structure and then also renders `props.children`, which causes `/welcome` route content to be composed into the same viewport stack.
- `src/index.tsx`
  - `/welcome` is mounted inside the same `CortexDesktopLayout` route wrapper as session/admin/share routes.
- `src/pages/Welcome.tsx`
  - Welcome container uses full available area (`width: 100%`, `height: 100%`) and competes with shell layout when both are mounted.
- `src/components/editor/EditorTab.tsx` vs `src/components/editor/TabBar.tsx`
  - Active-tab accent token usage differs (`--cortex-accent-primary` vs `--cortex-accent` fallback), causing visual inconsistency across tab systems.

---

## Closed / Verified Non-Issues

1. **Welcome logo image is loading correctly**
   - `img.complete = true`
   - `naturalWidth = 280`, `naturalHeight = 209`
   - Source: `/assets/abstract-design.svg`

2. **Inline SVG icon rendering is not empty**
   - Prior inspection found 31 SVG elements and 0 empty SVGs.

3. **File icon asset mapping presence check passed**
   - Static check of icon tokens in `src/utils/fileIcons.ts` found matching icon files under `public/icons/**` (no missing candidates detected in sampled check).

---

## Recommendations (Priority Order)

1. **Fix routing/layout composition for `/welcome` (P0)**
   - Do not render full desktop shell and route child simultaneously for the welcome route.
   - Option A: make `/welcome` a standalone route outside `CortexDesktopLayout`.
   - Option B: conditionally suppress shell main/content when route is `/welcome`.

2. **Prevent `main` flex collapse (P0/P1)**
   - Ensure the editor shell and welcome screen do not compete in the same vertical flex stack.

3. **Unify tab accent token usage (P1)**
   - Standardize active tab indicator to a single token (`--cortex-accent-primary`).

4. **Harden missing-command fallbacks (P1)**
   - Gracefully disable/placeholder UI if command unavailable, without startup errors.

5. **Resolve SolidJS cleanup warnings (P1/P2)**
   - Audit `onCleanup` registrations for execution context correctness.

---

## Final Assessment

The most urgent issue is the `/welcome` composition bug (VB-01 + VB-02), which materially breaks first-run and no-workspace UX. Secondary issues are consistency and robustness problems (tab token divergence, missing command handling, lifecycle warnings).
