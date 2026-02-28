# Error Catalog — Cortex IDE

## Executive Summary

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (current config) | **0 errors** ✅ |
| `npx tsc --noEmit` (mcp-server/) | **0 errors** ✅ |
| `npx tsc --noEmit --skipLibCheck false` | **10 errors** (5 in node_modules, 5 in src/vite-env.d.ts) |
| `npx tsc --noEmit --noUncheckedIndexedAccess` | **~3,981 errors** (flag not enabled) |
| `npm run lint` | **No linter configured** (no ESLint, no Biome) |
| `npm test` (vitest) | **1 failed** / 9,911 passed (1,125 test files) |
| Type safety concerns (`: any`, `as any`, `@ts-ignore`) | **1,491 total** occurrences |

The project compiles cleanly under its current `tsconfig.json` settings. The issues found are **code quality concerns** (excessive `any` usage, type suppressions, missing stricter compiler flags) and a **configuration issue** in `src/vite-env.d.ts`, rather than hard compilation errors.

---

## 1. tsconfig.json Analysis

### tsconfig.json (main — frontend)

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/cov-*.test.ts", "src/**/cov-*.test.tsx"]
}
```

**Issues found:**

| Issue | Severity | Details |
|-------|----------|---------|
| `skipLibCheck: true` hides vite-env.d.ts conflicts | Low | With `skipLibCheck: false`, 5 TS2687 errors appear in `src/vite-env.d.ts` due to conflicting `ImportMetaEnv` declarations (missing `readonly` modifiers vs. `vite/client` types) |
| `noUncheckedIndexedAccess` not enabled | Medium | Would catch ~3,981 potential runtime errors from unguarded array/record access. Not enabled — would be a large effort to add. |
| `exactOptionalPropertyTypes` not enabled | Low | Would enforce `undefined` vs. missing property distinction |
| `exclude` only covers `cov-*.test.*` files | Info | 811 cov-test files excluded; 314 non-cov test files are type-checked (which is fine) |

### tsconfig.node.json (Vite config)

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

**Issues found:** None. This is correctly scoped to `vite.config.ts` only.

### mcp-server/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

**Issues found:** None. Compiles cleanly. Missing `noUnusedLocals`/`noUnusedParameters` but this is a small 2-file project.

---

## 2. src/vite-env.d.ts Conflict (TS2687)

**5 errors** when `skipLibCheck` is disabled:

```
src/vite-env.d.ts(4,12): error TS2687: All declarations of 'DEV' must have identical modifiers.
src/vite-env.d.ts(5,12): error TS2687: All declarations of 'PROD' must have identical modifiers.
src/vite-env.d.ts(6,12): error TS2687: All declarations of 'MODE' must have identical modifiers.
src/vite-env.d.ts(7,12): error TS2687: All declarations of 'BASE_URL' must have identical modifiers.
src/vite-env.d.ts(8,12): error TS2687: All declarations of 'SSR' must have identical modifiers.
```

**Root cause:** The file includes `/// <reference types="vite/client" />` which already declares `ImportMetaEnv` with `readonly` properties. The file then re-declares the same interface without `readonly`, causing a modifier mismatch.

**Fix:** Either remove the redundant `ImportMetaEnv` interface (since `vite/client` already provides it), or add `readonly` modifiers to match.

---

## 3. Type Safety Issues by Directory

### Overview: `: any` annotations (935 total)

| Directory | Source Files | Test Files | Total |
|-----------|-------------|------------|-------|
| src/components/ | 42 | 720 | 762 |
| src/context/ | 32 | 78 | 110 |
| src/utils/ | 26 | 9 | 35 |
| src/providers/ | 6 | 10 | 16 |
| src/hooks/ | 0 | 8 | 8 |
| src/pages/ | 0 | 3 | 3 |
| src/ (root files) | 1 | 0 | 1 |
| **Total** | **107** | **828** | **935** |

### Overview: `as any` type casts (528 total)

| Directory | Source Files | Test Files | Total |
|-----------|-------------|------------|-------|
| src/components/ | 34 | 219 | 253 |
| src/utils/ | 9 | 131 | 140 |
| src/context/ | 12 | 44 | 56 |
| src/providers/ | 2 | 45 | 47 |
| src/hooks/ | 4 | 22 | 26 |
| src/sdk/ | 0 | 4 | 4 |
| src/types/ | 1 | 0 | 1 |
| src/ (root files) | 1 | 0 | 1 |
| **Total** | **63** | **465** | **528** |

### Overview: Type suppressions (@ts-ignore + @ts-expect-error)

| File | Count | Type | Reason |
|------|-------|------|--------|
| src/components/editor/VimMode.tsx | 7 | @ts-ignore | Monaco internal API access |
| src/components/settings/SettingsEditor.tsx | 19 | @ts-expect-error | Dynamic key access for settings |
| src/components/editor/TabBar.tsx | 1 | @ts-expect-error | Reserved for future use |
| src/components/editor/FindReplaceWidget.tsx | 2 | @ts-expect-error | Reserved for future use |
| **Total** | **29** | | |

---

## 4. Detailed `: any` in Source Files (non-test, 75 occurrences)

### src/components/editor/ (10 occurrences)
- VimMode.tsx: Monaco internal API access patterns
- Other editor files: Event handler parameters

### src/components/dev/ (6 occurrences)
- Developer tool components with untyped data

### src/components/debugger/ (4 occurrences)
- Debug protocol data handling

### src/context/ (8 occurrences)
- SDKContext.tsx (4): `metadata?: any`, `invoke: <T>(cmd: string, args?: any)`, message mapping callbacks typed as `any`
- MultiRepoContext.tsx (1): catch clause `err: any`
- ExtensionsContext.tsx (2): `executeExtensionCommand(command: string, args?: any[]): Promise<any>`
- DebugContext.tsx (1): Debug breakpoint event mapping

### src/utils/ (19 occurrences)
- decorators.ts (17): Generic utility functions (`throttle`, `debounce`, `memoize`, `once`, `sequentialize`) using `any` for generic flexibility
- retry.ts (3): Error handling with `any`

### src/components/ (misc, ~28 occurrences)
- ai/ (3), settings/ (2), collab/ (1), Chat/ (1), DiffView.tsx (1), extensions/ (1), git/ (1), keyboard/ (1), Markdown.tsx (2), SettingsDialog.tsx (1), terminal/ (1), tools/ (1), other scattered

---

## 5. Detailed `as any` in Source Files (non-test, 50 occurrences)

### src/components/debugger/ (16 occurrences)
- Type casting for debug adapter protocol data

### src/components/editor/ (6 occurrences)
- Monaco API workarounds

### src/components/cortex/ (6 occurrences)
- Layout and handler type casts

### src/components/ (misc, 10 occurrences)
- session/ (3), git/ (2), debug/ (2), agents/ (1), ai/ (1), settings/ (1)

### src/context/ (2 occurrences)
- OptimizedProviders.tsx (1): `(window as any).requestIdleCallback`
- Other (1)

### src/providers/ (2 occurrences)
- CallHierarchyProvider.ts (1): `(monaco.languages as any).registerCallHierarchyProvider`
- TypeHierarchyProvider.ts (1): `(monaco.languages as any).registerTypeHierarchyProvider`

### src/hooks/ (3 occurrences)
- useQuickPickWizard.ts (3): State type casts

### src/ root (1 occurrence)
- AppCore.tsx: `(window as any).requestIdleCallback`

### src/utils/ (1 occurrence)
- provider-profiler.tsx: `(window as any).__providerProfiler`

### src/types/ (1 occurrence)
- toolInputs.ts

---

## 6. Error Categories Summary

### By Error Type

| Category | Count | Location |
|----------|-------|----------|
| `: any` type annotations (source) | 75 | Spread across components, context, utils |
| `: any` type annotations (tests) | 860 | Primarily test mocks and fixtures |
| `as any` type casts (source) | 50 | Debugger, editor, cortex components |
| `as any` type casts (tests) | 478 | Test mocks, setup utilities |
| `@ts-ignore` (source) | 7 | VimMode.tsx (Monaco internal APIs) |
| `@ts-expect-error` (source) | 22 | SettingsEditor.tsx (19), editor (3) |
| vite-env.d.ts TS2687 conflicts | 5 | src/vite-env.d.ts |
| Missing linter configuration | 1 | Project root (no ESLint config) |
| Failing test | 1 | CortexBottomPanelContainer.test.tsx |

### By Root Cause

| Root Cause | Count | Recommendation |
|------------|-------|----------------|
| **Untyped utility functions** (decorators.ts) | 17 | Replace `any` with proper generics |
| **Monaco internal API access** | 9 | Use `@ts-expect-error` with comments; unavoidable |
| **Dynamic key access in settings** | 19 | Add proper index signature types |
| **Debug protocol untyped data** | 20 | Define DAP protocol interfaces |
| **`window as any` for missing APIs** | 3 | Add `requestIdleCallback` to global types |
| **Untyped catch clauses** | ~5 | Use `unknown` instead of `any` |
| **Test mock shortcuts** | ~1,338 | Lower priority; test-only |
| **vite-env.d.ts redundant declarations** | 5 | Remove or fix `readonly` modifiers |

---

## 7. Project Statistics

| Metric | Count |
|--------|-------|
| Total TypeScript files (src/) | 2,340 |
| Source files (non-test) | 1,215 |
| Test files | 1,125 |
| Coverage test files (cov-*) excluded from tsc | 811 |
| Components (src/components/) | 792 source + 718 test |
| Context files (src/context/) | 182 source + 219 test |
| Hooks (src/hooks/) | 37 source + 46 test |
| Providers (src/providers/) | 24 source + 21 test |
| MCP server files (mcp-server/src/) | 2 |

---

## 8. Recommendations (Priority Order)

1. **Fix src/vite-env.d.ts** — Remove redundant `ImportMetaEnv` interface or add `readonly` modifiers. This is the only real compilation issue (hidden by `skipLibCheck: true`).

2. **Add `requestIdleCallback` type declaration** — Add to global types to eliminate 3 `window as any` casts in AppCore.tsx, OptimizedProviders.tsx, and provider-profiler.tsx.

3. **Type utility functions in src/utils/decorators.ts** — Replace 17 `any` annotations with proper generics. These are foundational utilities used throughout.

4. **Add ESLint configuration** — The project has no linter. Adding `@typescript-eslint` + `eslint-plugin-solid` would catch additional issues.

5. **Replace `any` with `unknown` in catch clauses** — Quick wins in retry.ts, MultiRepoContext.tsx, etc.

6. **Define DAP protocol types for debugger** — Would eliminate ~20 `any`/`as any` in debugger components.

7. **Consider enabling `noUncheckedIndexedAccess`** — Would catch ~3,981 potential runtime null errors, but is a large effort.

8. **Reduce test file `any` usage** — Lower priority since tests don't ship, but 1,338 occurrences indicate test infrastructure could benefit from better mock typing.
