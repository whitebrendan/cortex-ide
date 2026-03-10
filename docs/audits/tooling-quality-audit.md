# Tooling / Tests / Dependency Baseline Audit

**Date:** 2026-03-10  
**Scope:** repo tooling, CI, hooks, TypeScript/test configs, lint baseline, dependency posture, and known audit/doc contradictions  
**Primary evidence:** `.github/workflows/ci.yml`, `.githooks/pre-commit`, `.githooks/pre-push`, `package.json`, `package-lock.json`, `mcp-server/package.json`, `mcp-server/package-lock.json`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `mcp-server/tsconfig.json`, `lint-errors.txt`, `TYPESCRIPT_AUDIT.md`, `AGENTS.md`, `PROJECT_STRUCTURE.md`, `docs/BUILD.md`

---

## Executive summary

1. **CI is partial, not repo-wide.** The only workflow is `.github/workflows/ci.yml`, and it gates the frontend (`typecheck`, `test`, `build`) plus Rust checks (`fmt`, `clippy`, `test`, platform `cargo check`). It does **not** lint TypeScript, run `test:coverage`, or validate the standalone `mcp-server/` package at all (`.github/workflows/ci.yml:33-210`).
2. **There is currently no JS/TS linter.** `lint-errors.txt` shows `npm run lint` fails because no `lint` script or ESLint config exists, and there are no root lint config files such as `eslint.config.*`, `.eslintrc*`, `biome.json`, or Prettier config.
3. **Coverage is curated and non-blocking.** `vitest.config.ts` uses `jsdom`, excludes `src-tauri` and `mcp-server`, manually enumerates a `coverage.include` list of about **284 files**, and sets all thresholds to `0`, so coverage is informative rather than gating (`vitest.config.ts:18-37`, `vitest.config.ts:44-334`).
4. **Type safety claims are narrower than they sound.** Root `tsc --noEmit` is strict for `src/**/*`, but `tsconfig.json` explicitly excludes `src/**/cov-*.test.{ts,tsx}` (`tsconfig.json:24-25`), and `tsconfig.node.json` only includes `vite.config.ts`, not `vitest.config.ts` (`tsconfig.node.json:13`).
5. **Dependency risk is non-trivial in both Node trees.** Current `npm audit --omit=optional --json` reports **6 vulnerabilities** at the root (2 moderate, 4 high) and **5 vulnerabilities** in `mcp-server/` (1 moderate, 4 high), including direct frontend exposure around `dompurify`/`monaco-editor` and transitive server/runtime exposure around `hono`, `@hono/node-server`, `express-rate-limit`, `ajv`, `minimatch`, `rollup`, `tar`, and `npm`.
6. **Repo docs are stale in several tooling areas.** `AGENTS.md`, `PROJECT_STRUCTURE.md`, and `TYPESCRIPT_AUDIT.md` disagree with current hooks, current CI jobs, current Vitest major version, and current vulnerability counts.

---

## 1) Current CI and local quality gates

### 1.1 GitHub Actions workflow coverage

The repo has a single workflow: `.github/workflows/ci.yml`.

### Workflow triggers

- Runs on pushes to `master`, `main`, and `develop` (`.github/workflows/ci.yml:4-6`)
- Runs on pull requests targeting `master` and `main` (`.github/workflows/ci.yml:11-13`)
- Ignores markdown, `LICENSE`, `.gitignore`, and **all `docs/**` changes** on both push and PR (`.github/workflows/ci.yml:6-17`)

**Implication:** docs-only changes, including this audit file, do not trigger CI by themselves.

### CI jobs actually enforced

| Job | Evidence | What it enforces | Notable omissions |
|---|---|---|---|
| `frontend` | `.github/workflows/ci.yml:33-67` | `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` | No lint step, no `test:coverage`, no `npm audit`, no `mcp-server` |
| `rust-checks` | `.github/workflows/ci.yml:72-128` | Linux deps install, `cargo +nightly fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` | Ubuntu only; no release step |
| `gui-check-macos` | `.github/workflows/ci.yml:133-159` | `cargo check` on macOS | No tests/clippy/fmt on macOS |
| `gui-check-windows` | `.github/workflows/ci.yml:164-190` | `cargo check` on Windows | No tests/clippy/fmt on Windows |
| `ci-success` | `.github/workflows/ci.yml:195-210` | Aggregates job results | Only aggregates the above four jobs |

### Important CI gaps

- **No JavaScript/TypeScript lint job** anywhere in workflow
- **No coverage gate or upload** (`npm run test:coverage` is never run)
- **No `mcp-server/` install/build/typecheck/test/audit job**
- **No dependency review/update automation** (no Dependabot/Renovate config found)
- **No release workflow** despite release config existing in `.releaserc.json`

### 1.2 Local hooks

The repo has two hook scripts under `.githooks/`:

- `.githooks/pre-commit`
- `.githooks/pre-push`

#### `pre-commit`

Evidence: `.githooks/pre-commit:1-38`

Runs:

1. `cargo +nightly fmt --all -- --check` if `cargo` exists (`.githooks/pre-commit:11-18`)
2. `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsbuildinfo` if `package.json` exists (`.githooks/pre-commit:20-27`)
3. `npm run test` (`.githooks/pre-commit:29-35`)

#### `pre-push`

Evidence: `.githooks/pre-push:1-63`

Runs:

1. `npx tsc --noEmit` (`.githooks/pre-push:11-18`)
2. `npm run test` (`.githooks/pre-push:20-27`)
3. `npm run build` (`.githooks/pre-push:29-36`)
4. `cargo fmt --all -- --check` (`.githooks/pre-push:38-44`)
5. `cargo clippy --all-targets -- -D warnings` (`.githooks/pre-push:46-51`)
6. `cargo test` (`.githooks/pre-push:53-58`)

#### Hook caveats

- Both hooks can be bypassed with `SKIP_GIT_HOOKS=1` (`.githooks/pre-commit:4-7`, `.githooks/pre-push:4-7`).
- `AGENTS.md` says hooks are configured via `git config core.hooksPath .githooks` (`AGENTS.md:179-181`), but in this checkout `git config --get core.hooksPath` returned **empty**, so hook enforcement depends on local git config being set.
- `pre-commit` uses **nightly** Rust fmt, while `pre-push` uses plain `cargo fmt`, and CI uses `cargo +nightly fmt`. That makes the local/CI Rust formatting baseline inconsistent (`.githooks/pre-commit:11-18`, `.githooks/pre-push:38-44`, `.github/workflows/ci.yml:99-116`).

### 1.3 Release tooling

`.releaserc.json` is present and configured for semantic-release on `main`/`master` (`.releaserc.json:1-20`), but:

- there is **no `release` job** in `.github/workflows/ci.yml`
- there is **no `release` script** in `package.json`

This means release configuration exists, but the repository does not currently show a matching GitHub Actions execution path for it.

---

## 2) TypeScript and test-tooling baseline

### 2.1 Root TypeScript gate

`tsconfig.json` is strict and includes:

- `strict: true` (`tsconfig.json:15`)
- `noUnusedLocals: true` (`tsconfig.json:16`)
- `noUnusedParameters: true` (`tsconfig.json:17`)
- `noFallthroughCasesInSwitch: true` (`tsconfig.json:18`)

But its scope is narrower than “all TS in the repo”:

- includes only `src/**/*.ts` and `src/**/*.tsx` (`tsconfig.json:24`)
- excludes `src/**/cov-*.test.ts` and `src/**/cov-*.test.tsx` (`tsconfig.json:25`)
- references `tsconfig.node.json` (`tsconfig.json:26`)

### 2.2 Node-side TS gate

`tsconfig.node.json` is also strict, but it includes only `vite.config.ts` (`tsconfig.node.json:1-13`).

**Gap:** `vitest.config.ts` is not covered by `tsc --noEmit` via `tsconfig.node.json`, even though it is a critical test/runtime config file.

### 2.3 MCP server TS gate

`mcp-server/tsconfig.json` is strict and builds from `src/` to `dist/` (`mcp-server/tsconfig.json:1-18`), but:

- `mcp-server/package.json` has only `build`, `start`, and `dev` scripts (`mcp-server/package.json:7-10`)
- there is **no `typecheck` script**
- there is **no `test` script**
- there is **no `lint` script**
- the root CI workflow never runs the sidecar package

**Result:** the standalone MCP server has a TypeScript config, but no repo-level quality gate currently exercises it.

### 2.4 Vitest scope and realism

`vitest.config.ts` currently does the following:

- `environment: "jsdom"` (`vitest.config.ts:19`)
- `setupFiles: ["./src/__tests__/setup.ts", "./src/test/setup.ts"]` (`vitest.config.ts:20`)
- includes frontend tests under `src/**/*.{test,spec}.{ts,tsx}` and `src/**/__tests__/**/*.{ts,tsx}` (`vitest.config.ts:22-25`)
- excludes `node_modules`, `dist`, `src-tauri`, `mcp-server`, and `src/__tests__/setup.ts` (`vitest.config.ts:26-32`)
- uses V8 coverage with `text`, `json-summary`, `json`, and `html` reporters (`vitest.config.ts:33-36`)
- manually enumerates a large `coverage.include` list beginning at `vitest.config.ts:44`
- sets all coverage thresholds to `0` (`vitest.config.ts:330-334`)
- does not set `coverage.all = true`

### Coverage realism findings

1. **Frontend-only:** tests run in `jsdom` and intentionally exclude `src-tauri` and `mcp-server`, so the existing coverage story is a frontend component/unit-test baseline, not a product-wide one.
2. **Curated coverage scope:** `coverage.include` is a manual allowlist of roughly **284 entries**, not an automatic “all production source files” measure.
3. **No enforcement:** thresholds are all zero, so coverage cannot fail CI based on low statements/branches/functions/lines.
4. **No CI publication:** there is no coverage job, no lcov output, and no Codecov/Coveralls integration in the repo.
5. **The source/test footprint is unusually close:** a read-only scan found **1221 non-test `src/` files** and **1145 files in test naming/placement patterns**, which makes raw test-file counts look impressive but does not guarantee that the important paths are covered well.
6. **811 `cov-*` files are outside root `tsc`:** a scan found **811** `cov-*.test.{ts,tsx}` files under `src/`, and `tsconfig.json` excludes that entire class from the TypeScript gate.

**Bottom line:** the repo has a large Vitest surface, but the coverage baseline is **selective, frontend-only, and non-blocking**.

---

## 3) Lint baseline: missing coverage by design

`lint-errors.txt` shows the current lint posture clearly:

- `npm run lint` fails because the script does not exist (`lint-errors.txt:7-16`)
- there is no ESLint config (`lint-errors.txt:18-21`)
- there is no `lint` script in `package.json` (`lint-errors.txt:22-27`)
- ESLint is not listed in dependencies (`lint-errors.txt:28-32`)
- no other linting tools are configured (`lint-errors.txt:34-35`)

### What is actually checked today

At the root, the practical JS/TS quality checks are only:

- TypeScript compile-time checks via `npm run typecheck` (`package.json:11-23`)
- Vitest via `npm run test` (`package.json:19-23`)
- Vite production build via CI and pre-push (`package.json:12-18`, `.github/workflows/ci.yml:49-59`, `.githooks/pre-push:29-36`)

### What is not checked today

- unused imports beyond what TS detects
- Solid-specific lint rules
- promise handling / floating promises
- import ordering / consistency
- type-only import hygiene
- JSX / accessibility linting
- formatting consistency for TS/JS/CSS/JSON
- `mcp-server/` linting entirely

### Config search result

No repo-wide config was found for:

- `eslint.config.*`
- `.eslintrc*`
- `biome.json`
- `.prettierrc*`
- `prettier.config.*`
- `lefthook.yml`
- `.lintstagedrc*`
- `commitlint.config.*`

---

## 4) Package-manifest and dependency baseline

### 4.1 Root package (`package.json`)

Evidence: `package.json:11-77`

Current root scripts:

- `dev`
- `build`
- `build:analyze`
- `preview`
- `tauri`
- `tauri:dev`
- `tauri:build`
- `typecheck`
- `test`
- `test:watch`
- `test:ui`
- `test:coverage`

Notably absent:

- `lint`
- `format`
- `audit`
- `check`
- any `mcp-server` orchestration scripts

The root uses `package-lock.json` with `lockfileVersion: 3`.

### 4.2 MCP server package (`mcp-server/package.json`)

Evidence: `mcp-server/package.json:7-22`

Current sidecar scripts:

- `build`
- `start`
- `dev`

Notably absent:

- `test`
- `lint`
- `typecheck`
- coverage or audit helpers

The sidecar also has its own `package-lock.json` with `lockfileVersion: 3`.

### 4.3 Version pinning and update management gaps

- `docs/BUILD.md` documents **Node >= 24.x** and **npm >= 10.x** (`docs/BUILD.md:11-16`, `docs/BUILD.md:108-118`)
- CI explicitly installs **Node 24** (`.github/workflows/ci.yml:39-42`)
- but neither `package.json` nor `mcp-server/package.json` declares an `engines` field or `packageManager` field

**Implication:** contributor/runtime expectations are documented and used in CI, but not enforced by package manifests.

No dependency update automation config was found for Dependabot or Renovate.

---

## 5) Current dependency risk areas

## 5.1 Root package audit snapshot

Command used:

```bash
cd /workspace/ide
npm audit --omit=optional --json
```

Current result: **exit code 1**, **6 vulnerabilities total**

- **2 moderate**
- **4 high**

Metadata from audit output:

- total dependencies: **857**
- prod: **106**
- dev: **751**
- optional: **89**

### Root risks by package

| Package | Severity | Direct? | Evidence |
|---|---|---:|---|
| `dompurify` | Moderate | Yes | `package.json:48`, `package-lock.json:4626`; current audit flags GHSA-v2wj-7wpq-c8vv for `3.1.3 - 3.3.1` |
| `monaco-editor` | Moderate | Yes | `package.json:52`, `package-lock.json:6618`; current audit shows it is impacted through vulnerable `dompurify` |
| `rollup` | High | No | `package-lock.json:9523`; current audit flags GHSA-mw96-cpmx-2vgc for `4.0.0 - 4.58.0` |
| `npm` | High | No | `package-lock.json:6775`; current audit reports vulnerable transitive `npm` |
| `minimatch` | High | No | `package-lock.json:8011`; current audit flags multiple ReDoS advisories for `10.0.0 - 10.2.2` |
| `tar` | High | No | `package-lock.json:8688`; current audit flags hardlink/path traversal issues for `<=7.5.9` |

### Root risk interpretation

The root dependency tree mixes:

- browser-facing parsing/sanitization libraries (`dompurify`, `marked`, `monaco-editor`)
- large frontend build tooling (`vite`, `rollup`, visualizer)
- a transitive `npm` toolchain subtree carrying its own advisory surface

This is not unusual for a desktop/web toolchain, but it means “green build” is not equivalent to “low-risk dependency baseline”.

## 5.2 MCP server audit snapshot

Command used:

```bash
cd /workspace/ide/mcp-server
npm audit --omit=optional --json
```

Current result: **exit code 1**, **5 vulnerabilities total**

- **1 moderate**
- **4 high**

Metadata from audit output:

- total dependencies: **134**
- prod: **99**
- dev: **36**
- optional: **27**

### MCP server risks by package

| Package | Severity | Direct? | Evidence |
|---|---|---:|---|
| `@hono/node-server` | High | No | `mcp-server/package-lock.json:464`; current audit flags authorization-bypass issue for `<1.19.10` |
| `hono` | High + Moderate | No | `mcp-server/package-lock.json:1152`; current audit flags multiple issues including auth bypass and arbitrary file access for `<=4.12.3` |
| `express-rate-limit` | High | No | `mcp-server/package-lock.json:946`; current audit flags IPv4-mapped IPv6 bypass for `8.2.0 - 8.2.1` |
| `ajv` | Moderate | No | `mcp-server/package-lock.json:557`; current audit flags ReDoS for `7.0.0-alpha.0 - 8.17.1` |
| `minimatch` | High | No | `mcp-server/package-lock.json:1318`; current audit flags ReDoS for `10.0.0 - 10.2.2` |

### MCP risk interpretation

`mcp-server/package.json` declares only `@modelcontextprotocol/sdk`, `glob`, and `zod` as runtime dependencies (`mcp-server/package.json:12-16`), but the resolved tree contains a broader HTTP/server surface via Hono and rate limiting packages.

That matters because **the sidecar is currently outside CI and hook enforcement**, so these vulnerabilities are easier to overlook than the root frontend ones.

---

## 6) Already-known contradictions and stale audit claims

### 6.1 CI / release documentation drift

`AGENTS.md` documents a `release` job in the CI pipeline (`AGENTS.md:187-194`), but `.github/workflows/ci.yml` only defines:

- `frontend`
- `rust-checks`
- `gui-check-macos`
- `gui-check-windows`
- `ci-success`

There is no release job in the actual workflow file.

### 6.2 Hook documentation drift

- `PROJECT_STRUCTURE.md` says `pre-commit` is “cargo fmt + npm typecheck” (`PROJECT_STRUCTURE.md:103-105`, `PROJECT_STRUCTURE.md:657-658`)
- `AGENTS.md` describes `pre-commit` as Rust fmt + TS typecheck and `pre-push` as the full gate (`AGENTS.md:174-181`)

Actual behavior is stricter and different:

- `pre-commit` also runs the **full frontend test suite** (`.githooks/pre-commit:29-35`)
- `pre-push` does **not** run `cargo check`, even though some docs summarize it as part of the gate (`.githooks/pre-push:38-58`)
- `pre-push` uses plain `cargo fmt`, while `pre-commit` and CI use `cargo +nightly fmt`

### 6.3 Tool version drift in docs

`AGENTS.md` still says the frontend uses **Vitest 3.2** (`AGENTS.md:66`), but the manifest is on Vitest **4.0.18** and `@vitest/coverage-v8` **4.0.18** (`package.json:68-77`).

### 6.4 TypeScript audit wording vs actual TS scope

`TYPESCRIPT_AUDIT.md` says:

- `tsc --noEmit` has **0 errors** (`TYPESCRIPT_AUDIT.md:12-21`)
- the project has zero TypeScript errors across **2,340 source files** (`TYPESCRIPT_AUDIT.md:21`)

But the same audit also notes that `src/**/cov-*.test.{ts,tsx}` is excluded (`TYPESCRIPT_AUDIT.md:42-43`), and later reports **811** excluded coverage-test files (`TYPESCRIPT_AUDIT.md:189-193`). `tsconfig.json:24-25` confirms those exclusions.

**Interpretation:** the “0 errors across 2,340 files” summary overstates the scope of the actual root `tsc` gate.

### 6.5 Vulnerability counts have already drifted

`TYPESCRIPT_AUDIT.md` reports:

- root: **4 high** vulnerabilities (`TYPESCRIPT_AUDIT.md:145-155`)
- `mcp-server`: **1 moderate, 2 high`** (`TYPESCRIPT_AUDIT.md:163-171`)

Current `npm audit --json` shows:

- root: **2 moderate, 4 high**
- `mcp-server`: **1 moderate, 4 high**

So the dependency-risk section of `TYPESCRIPT_AUDIT.md` is already stale.

### 6.6 Build documentation vs manifest enforcement

`docs/BUILD.md` sets clear contributor expectations around Node and npm versions (`docs/BUILD.md:11-16`, `docs/BUILD.md:108-118`), but those constraints are not encoded in `package.json` or `mcp-server/package.json` through `engines` or `packageManager` fields.

---

## 7) Reproduction commands

### Root frontend/tooling

```bash
cd /workspace/ide
npm ci
npm run typecheck
npm run test
npm run build
npm run test:coverage
npm audit --omit=optional --json
```

### Rust / Tauri quality gates

```bash
cd /workspace/ide/src-tauri
cargo +nightly fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

### MCP server

```bash
cd /workspace/ide/mcp-server
npm ci
npm run build
npm audit --omit=optional --json
```

### Hook configuration check

```bash
cd /workspace/ide
git config --get core.hooksPath
```

### Optional evidence-gathering commands

```bash
cd /workspace/ide
rg --files src -g '*.{test,spec}.{ts,tsx}'
rg --files src -g 'cov-*.test.ts' -g 'cov-*.test.tsx'
rg -n 'thresholds:|include: \[' vitest.config.ts
rg -n 'SKIP_GIT_HOOKS|cargo fmt|npm run test' .githooks/pre-commit .githooks/pre-push
```

---

## 8) Recommended follow-up work

1. **Add a real lint baseline** at the root and for `mcp-server/`.
2. **Bring `mcp-server/` into CI** with at least `npm ci`, `npm run build`, and `npm audit`/dependency review.
3. **Typecheck `vitest.config.ts`** by expanding `tsconfig.node.json` or adding a dedicated config.
4. **Make coverage meaningful** by removing zero thresholds, deciding whether `coverage.all` should be enabled, and publishing coverage artifacts in CI.
5. **Resolve doc drift** in `AGENTS.md`, `PROJECT_STRUCTURE.md`, and `TYPESCRIPT_AUDIT.md` so the documented gates match reality.
6. **Encode runtime/tooling expectations in manifests** (`engines`, `packageManager`) and consider dependency update automation.

---

## Audit conclusion

The repo already has meaningful **TypeScript, test, build, and Rust** gates, but the tooling baseline is still **incomplete and inconsistent**:

- linting is absent,
- coverage is informative but not enforced,
- the standalone `mcp-server/` is largely outside automated verification,
- and several docs overstate what is actually guaranteed.

The fastest wins are to close the lint gap, add `mcp-server/` CI, and align docs with the real gates that exist today.
