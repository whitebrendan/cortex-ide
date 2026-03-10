# Frontend Audit Baseline — TypeScript/Vite/Solid Frontend

> Audit scope: root frontend config plus `src/` architecture/convention review
>
> Reviewed files: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.githooks/pre-commit`, `.githooks/pre-push`, `.releaserc.json`, `VERSION`, `src/index.tsx`, `src/App.tsx`, `src/AppShell.tsx`, `src/AppCore.tsx`, `src/context/OptimizedProviders.tsx`, selected `src/store/*`, selected source/test files.

## 1. Audit method and evidence pack

### Method
- Static review of root config and selected frontend source files.
- Lockfile/package audit via `npm audit --package-lock-only --json`.
- Source-pattern review via `rg`/`Grep` for conventions, duplication, and likely dead patterns.
- Runtime evidence check via Tauri MCP session status and local port inspection.

### Environment notes
- Local `node_modules` was **not** present during this review, so this audit relies on source/config/lockfile evidence rather than rerunning `npm run typecheck`, `npm run test`, or `npm run build` in this workspace.
- Local environment reported `node v24.13.1` and `npm 11.8.0`.

### Runtime evidence status
- `mcp__tauri__driver_session` status returned `{"connected":false}`.
- Local port check for `9223`, `1420`, and `1421` returned no listening sockets.
- Result: no live Tauri/webview runtime was available for `mcp__tauri__read_logs`, screenshots, or IPC/log capture.

### High-signal command evidence
- `npm audit --package-lock-only --json` reported **2 moderate** and **4 high** vulnerabilities in the root frontend lockfile.
- `rg --files src | wc -l` reported **2414** files under `src/`.
- `rg --files src | rg '/cov-.*\.test\.(ts|tsx)$' | wc -l` reported **811** `cov-*` test files.

---

## 2. Baseline snapshot

| Area | Baseline evidence |
|---|---|
| Frontend stack | Solid + TypeScript + Vite in `package.json:1-78` |
| TypeScript strictness | `tsconfig.json:2-26` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| Root Node-side TS config | `tsconfig.node.json:2-13` |
| Build configuration | `vite.config.ts:160-381` |
| Test configuration | `vitest.config.ts:18-349` |
| CI frontend gate | `.github/workflows/ci.yml:33-68` |
| Local hooks | `.githooks/pre-commit:9-38`, `.githooks/pre-push:9-63` |
| Entry path | `src/index.tsx:172-190`, `src/AppShell.tsx:125-160`, `src/AppCore.tsx:771-777` |
| Provider architecture | `src/context/OptimizedProviders.tsx:44-127`, `src/context/OptimizedProviders.tsx:299-345` |

---

## 3. Findings summary

| ID | Risk | Area | Summary |
|---|---|---|---|
| F1 | High | Release/versioning | Frontend version source of truth is split across `package.json`, `VERSION`, Vite define constants, and runtime IPC version calls |
| F2 | Medium | Conventions / quality gates | No repo-level ESLint or Prettier baseline is enforced in scripts, hooks, or CI |
| F3 | Medium | Test quality gate | Coverage is configured, but thresholds are all `0` and coverage is not part of CI |
| F4 | Medium | Test harness | Vitest loads two overlapping global setup files with duplicate mocks/polyfills |
| F5 | Medium | Test debt / signal quality | `cov-*` test files are numerous, included by Vitest, and excluded from `tsc`, creating a shadow test layer |
| F6 | Medium | Startup architecture | “Deferred” provider strategy is mostly mount-time deferral; Tier 2 provider modules are still statically imported into the lazy `AppCore` graph |
| F7 | Low | Import conventions | Frontend alias policy says use `@/`, but many production modules still use relative imports |
| F8 | Low | Duplication | Keybinding import/export fallback logic is duplicated in two different layers |
|
| O1 | Low | Dead/stale pattern | `src/App.tsx` appears to be a leftover root wrapper and is not the active entry component |
| O2 | Low | Config coverage gap | `tsconfig.node.json` includes `vite.config.ts` but not `vitest.config.ts`, so `npm run typecheck` does not typecheck the Vitest config file |
| O3 | Low | Dependency hygiene | Several direct frontend dependencies appear to be candidates for pruning based on search-only evidence |

---

## 4. Detailed findings

### F1 — High — Frontend version/release source of truth is split

**Evidence**
- `package.json:2-3` sets the npm package version to `0.1.0`.
- `VERSION:1` contains `1.1.0`.
- `vite.config.ts:377-380` injects `__VERSION__` from `process.env.npm_package_version || "0.1.0"`.
- `.releaserc.json:7-17` updates `VERSION` during semantic release, but does not update `package.json`.
- `src/context/AutoUpdateContext.tsx:183-186` reads the runtime app version from `invoke<string>("get_app_version")`.
- `src/utils/tauri.ts:29-30` exposes another runtime `get_version` IPC wrapper.

**Why this matters**
- The build-time frontend version and the released/runtime application version can diverge.
- That creates risk for issue reporting, update UI, diagnostics, telemetry tagging, and any UI that exposes “current version”.

**Recommendation**
- Pick a single canonical version source for frontend display/runtime checks.
- Either update `package.json` during release as well, or have the frontend read the version from the same runtime source everywhere.

### F2 — Medium — No repo-level ESLint or Prettier baseline is enforced

**Evidence**
- `package.json:11-24` defines `dev`, `build`, `typecheck`, and Vitest scripts, but no `lint`, `format`, `eslint`, or `prettier` scripts.
- `.github/workflows/ci.yml:49-59` runs dependency install, typecheck, tests, and build for the frontend job, but no lint/format step.
- `.githooks/pre-commit:20-35` runs TypeScript typecheck and frontend tests, but no lint/format step.
- `.githooks/pre-push:11-35` runs TypeScript typecheck, frontend tests, and build, but no lint/format step.
- Review-time config search found no root `eslint.config.*`, `.eslintrc*`, `prettier.config.*`, or `.prettierrc*` files.

**Why this matters**
- TypeScript catches type errors, but not many convention, maintainability, or accidental-dead-code issues.
- The repo currently relies on manual discipline for import consistency, debug logging patterns, formatting, and some unsafe/unused patterns.

**Recommendation**
- Add a lightweight ESLint baseline first, then Prettier only if the team wants automatic formatting.
- Wire lint into `package.json` and the existing CI/frontend hook path.

### F3 — Medium — Coverage exists, but it is not an effective quality gate

**Evidence**
- `package.json:20-23` provides `test`, `test:watch`, `test:ui`, and `test:coverage` scripts.
- `.github/workflows/ci.yml:55-59` runs `npm run test` and `npm run build`, but not `npm run test:coverage`.
- `vitest.config.ts:33-37` configures V8 coverage reporting.
- `vitest.config.ts:44-329` maintains a very large manual coverage include allowlist.
- `vitest.config.ts:330-335` sets coverage thresholds for statements, branches, functions, and lines to `0`.

**Why this matters**
- Coverage data can be generated, but it cannot fail CI in its current form.
- A long manual include list is also expensive to maintain and can drift from real code ownership.

**Recommendation**
- Decide whether coverage is informational only or a gate.
- If it is meant to gate quality, raise thresholds from `0` and add `test:coverage` to CI.
- If it is meant to remain informational, reduce maintenance cost by simplifying the coverage include strategy.

### F4 — Medium — Vitest loads two overlapping global setup files

**Evidence**
- `vitest.config.ts:18-21` loads both `./src/__tests__/setup.ts` and `./src/test/setup.ts`.
- `src/__tests__/setup.ts:16-24` mocks Tauri core/event APIs; `src/test/setup.ts:308-348` mocks many of the same Tauri surfaces.
- `src/__tests__/setup.ts:98-152` defines DOM/polyfill globals such as `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`, and clipboard; `src/test/setup.ts:18-91` repeats many of the same polyfills.
- `src/__tests__/setup.ts:158-170` and `src/test/setup.ts:354-378` both define global test lifecycle cleanup/reset behavior.

**Why this matters**
- The effective global test environment is harder to reason about.
- Mock precedence and cleanup ordering can drift over time.
- Duplicate setup logic raises maintenance cost and increases the chance of “fixing” only one of the two test harnesses.

**Recommendation**
- Consolidate shared mocks/polyfills into one canonical setup file and keep the second only for narrowly scoped helpers if still needed.

### F5 — Medium — `cov-*` test files create a large shadow test layer

**Evidence**
- `tsconfig.json:24-25` excludes `src/**/cov-*.test.ts` and `src/**/cov-*.test.tsx` from the TypeScript project.
- `vitest.config.ts:22-32` includes all `src/**/*.{test,spec}.{ts,tsx}` and `src/**/__tests__/**/*.{ts,tsx}`, which still pulls in `cov-*` tests.
- Command evidence counted **811** `cov-*` tests under `src/`.
- Example of duplicate/shadow coverage files:
  - substantive test: `src/components/__tests__/ApprovalDialog.test.tsx:1-160`
  - shallow generated counterpart: `src/components/__tests__/cov-ApprovalDialog.test.tsx:1-13`

**Why this matters**
- The repository carries a large second layer of tests that is outside normal `tsc` coverage but still inside the Vitest include set.
- That inflates suite size and obscures the difference between intentional hand-written tests and auto-generated smoke coverage tests.

**Recommendation**
- Make an explicit decision: either keep `cov-*` tests as a separate/generated artifact outside normal Vitest includes, or fold them into a documented generation workflow and typecheck scope.

### F6 — Medium — “Deferred provider loading” is mostly mount-time deferral, not code-load deferral

**Evidence**
- `src/context/OptimizedProviders.tsx:65-127` statically imports all Tier 2 provider modules while commenting that they are “loaded after first paint”.
- `src/context/OptimizedProviders.tsx:136-145` uses `requestIdleCallback` only to flip `ready()` before mounting Tier 2.
- `src/context/OptimizedProviders.tsx:159-289` renders the entire Tier 2 provider stack only once `ready()` becomes true.
- `src/AppCore.tsx:30-31` statically imports `OptimizedProviders` into the lazy `AppCore` module.
- `src/AppCore.tsx:771-777` wraps the full `AppContent` tree in `OptimizedProviders`.
- `src/AppShell.tsx:27-33` shows that once `AppCore` is requested, its full static dependency graph is requested.
- `vite.config.ts:33-51` manually chunks several heavy context providers, but those modules are still part of the `AppCore` dependency graph because of static imports.

**Why this matters**
- The current architecture defers **mounting** of Tier 2 providers, but not necessarily **transfer/evaluation** of their code.
- That means the code-splitting/performance story is weaker than the comments suggest.

**Recommendation**
- If the goal is true first-paint bundle deferral, move the heaviest Tier 2 providers behind dynamic imports or separate lazy boundaries rather than only an idle-gated mount.
- If mount-only deferral is intentional, update the comments/docs so the optimization claim matches the implementation.

### F7 — Low — Alias convention is not consistently followed

**Evidence**
- Root guidance says to use the alias consistently: `AGENTS.md:90`.
- Frontend guidance repeats the same rule: `src/AGENTS.md:115-116`.
- Production examples that still use relative imports:
  - `src/context/QuickAccessContext.tsx:62-70`
  - `src/context/TerminalsContext.tsx:4-19`
  - `src/i18n/index.ts:2-12`

**Why this matters**
- This is not a correctness bug, but it shows the repo does not currently enforce one of its stated import conventions.
- Mixed alias/relative import styles make bulk moves and refactors noisier.

**Recommendation**
- Add a lint rule or import policy check if alias consistency is important enough to document.

### F8 — Low — Keybinding import/export fallback logic is duplicated

**Evidence**
- `src/context/keymap/keymapActions.ts:203-243` implements Tauri dialog/plugin-fs import/export with browser fallback.
- `src/components/keyboard/KeyboardShortcutsEditor.tsx:85-132` repeats nearly the same import/export flow.

**Why this matters**
- Two layers now own the same file-handling behavior.
- Future bug fixes or UX changes can easily land in one path and miss the other.

**Recommendation**
- Extract one shared helper for keybinding import/export and reuse it from both places.

---

## 5. Additional observations

### O1 — Low — `src/App.tsx` appears to be a stale root wrapper

**Evidence**
- `src/App.tsx:1-8` defines a minimal wrapper component.
- `src/index.tsx:6-8` explicitly chooses `AppShell` instead of `App`.
- `src/index.tsx:172-190` mounts the router with `AppShell` as the root.
- Review-time search did not find any `./App` or `@/App` imports under `src/`.

**Why this matters**
- This is minor, but it is an obvious dead/stale pattern that can confuse newcomers about the real frontend entry path.

### O2 — Low — `vitest.config.ts` is outside the Node-side TS project include list

**Evidence**
- `package.json:19` uses `tsc --noEmit` for typechecking.
- `tsconfig.json:26` references `./tsconfig.node.json`.
- `tsconfig.node.json:13` includes only `vite.config.ts`.
- `vitest.config.ts:1-5` is a TypeScript config file but is not listed in the Node-side TS include.

**Why this matters**
- Regressions in the Vitest config can slip past the normal typecheck command.

### O3 — Low — Some direct dependencies look like pruning candidates (search-only evidence)

**Evidence**
- Declared frontend dependencies include:
  - `@kobalte/core` in `package.json:26`
  - `@solid-primitives/websocket` in `package.json:29`
  - `@tauri-apps/plugin-deep-link` in `package.json:33`
  - `@tauri-apps/plugin-notification` in `package.json:36`
  - `@tauri-apps/plugin-updater` in `package.json:40`
- Search review did not find direct frontend imports for those package names outside `package.json`.

**Why this matters**
- This is not proof that the packages are unused, but it is enough to justify a follow-up dependency-pruning check.

---

## 6. Dependency hygiene observations

### Known lockfile/audit issues

`npm audit --package-lock-only --json` reported **2 moderate** and **4 high** issues. Supporting lockfile evidence:
- `package-lock.json:4626-4634` — direct `dompurify` `3.3.1`
- `package-lock.json:6618-6636` — `monaco-editor` `0.55.1` plus transitive `dompurify` `3.2.7`
- `package-lock.json:9523-9544` — `rollup` `4.54.0`
- `package-lock.json:8011-8025` — bundled `npm` dependency `minimatch` `10.1.2`
- `package-lock.json:8688-8703` — bundled `npm` dependency `tar` `7.5.7`

### Dependency hygiene conclusion
- Vulnerability cleanup is a real maintenance item, not just a theoretical one.
- The dependency tree also appears to contain at least a few packages that should be revalidated for actual frontend use.

---

## 7. CI / hook observations

### What is currently enforced
- Frontend CI job installs, typechecks, tests, and builds: `.github/workflows/ci.yml:49-59`.
- Pre-commit runs TypeScript typecheck and the full frontend test suite: `.githooks/pre-commit:20-35`.
- Pre-push runs TypeScript typecheck, frontend tests, frontend build, then Rust checks: `.githooks/pre-push:11-58`.

### What is not currently enforced
- No frontend lint step.
- No formatting step.
- No coverage threshold gate.
- No explicit check that the frontend build-time version matches `VERSION`/release metadata.

---

## 8. Priority follow-up list

1. **Unify versioning** across `package.json`, `VERSION`, Vite build constants, and runtime version display/update flows.
2. **Add a lint baseline** and decide whether formatting should be machine-enforced.
3. **Rationalize the Vitest harness** by collapsing duplicate setup files.
4. **Decide what `cov-*` tests are for** and move them out of the default developer/test path if they are generated artifacts.
5. **Make provider deferral honest**: either dynamically import heavy Tier 2 providers or document that the optimization is mount-only.
6. **Prune duplicated file-handling logic** in keybinding import/export flows.
7. **Validate direct dependencies for actual use** and remove any confirmed dead packages.

---

## 9. Bottom line

The frontend baseline is strong on **TypeScript strictness**, **build/test automation**, and a clearly intentional **startup/performance architecture**, but it is weaker on **tooling governance** and **source-of-truth consistency**.

The highest-value fixes are not feature work; they are cleanup and policy work:
- one version source of truth,
- one test harness story,
- one lint/import policy story,
- and a clearer boundary between real startup deferral and deferred mounting.
