# Tests & Dependencies Audit — Cortex IDE

> **Audit date:** 2026-03-10  
> **Scope:** Frontend/Vite workspace, Tauri/Rust backend, and `mcp-server/` sidecar  
> **Primary evidence:** `TYPESCRIPT_AUDIT.md`, `package.json`, `package-lock.json`, `mcp-server/package.json`, `mcp-server/package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `vitest.config.ts`, `src/__tests__/setup.ts`, `src/test/setup.ts`, `.github/workflows/ci.yml`, `.githooks/pre-commit`, `.githooks/pre-push`

## Executive summary

The repository has broad frontend test volume and clean TypeScript compilation, but its dependency and verification posture still has several high-priority gaps:

- **Root npm dependencies have validated security findings**: `npm audit` reports **6 vulnerabilities** (**4 high**, **2 moderate**) in the main workspace, including `rollup`, `npm`/`tar`/`minimatch`, and `dompurify`/`monaco-editor`.
- **The MCP server has the sharpest transitive dependency exposure**: `npm audit` reports **5 vulnerabilities** (**4 high**, **1 moderate**) in `mcp-server`, driven by `@modelcontextprotocol/sdk` transitive packages (`hono`, `@hono/node-server`, `express-rate-limit`, `ajv`) plus `glob` → `minimatch`.
- **Lockfiles are not fully refreshed inside allowed semver ranges**: for example, `mcp-server/package.json` allows `@modelcontextprotocol/sdk` `^1.25.3`, but `mcp-server/package-lock.json` still resolves to `1.26.0` while `1.27.1` is available. The root lockfile also trails current patch/minor releases for several direct packages.
- **Test coverage is uneven despite high test count**: the frontend has **1,145** detected test files, but **811** are `cov-*` coverage-oriented tests, leaving **334** non-`cov-*` test files. Critical API modules (`src/api/admin.ts`, `src/api/agents.ts`, `src/api/share.ts`) have **no dedicated tests**. The MCP server has **0 test files** and no test script.
- **CI misses an entire deliverable surface**: `.github/workflows/ci.yml` validates frontend and Rust only; there is **no `mcp-server` build/typecheck/test job**, no dependency audit step (`npm audit`, `cargo audit`, `cargo deny`), and no meaningful coverage enforcement.
- **Rust dependency hygiene is serviceable but under-instrumented**: no Rust advisory scanning is present, several crates are stale, and the lockfile includes duplicate HTTP/client stacks such as `reqwest 0.12.28` plus `reqwest 0.13.2` via `tauri-plugin-updater`.

## Evidence summary

### Existing baseline signals

- `TYPESCRIPT_AUDIT.md` reports:
  - `tsc --noEmit` clean for frontend, node config, and `mcp-server`
  - `vite build` succeeds with warnings only
  - `vitest` previously passed **9,912 tests** across **1,125** files, but with at least one noted first-run flaky failure in `CortexBottomPanelContainer.test.tsx`
- `vitest.config.ts` still sets coverage thresholds to `0` across statements, branches, functions, and lines.
- `.github/workflows/ci.yml` runs frontend typecheck/tests/build and Rust fmt/clippy/test/check, but does not mention `mcp-server`.

### Current repository measurements validated during this audit

- Frontend test files detected under `src/`: **1,145**
- Frontend `cov-*` test files: **811**
- Frontend non-`cov-*` test files: **334**
- `src/api/` source files: **4**
- `src/api/` dedicated test files: **0**
- `src/sdk/` dedicated test files: **11**
- `mcp-server/src/` source files: **2**
- `mcp-server` dedicated test files: **0**
- `src-tauri/tests/` integration test files: **1** (`src-tauri/tests/ipc_commands.rs`)
- Files with `waitFor`/`vi.waitFor` in frontend tests: **20**
- Files with raw `setTimeout`-based waits/promises in frontend tests: **19**
- Files with fake timers in frontend tests: **18**

## Dependency validation by surface

### 1) Frontend/root npm workspace

**Manifest / lockfile inputs:** `package.json`, `package-lock.json`

#### Validated security findings

`npm audit --json` for the root workspace reports:

| Package | Severity | Validated issue | Evidence path | Notes |
|---|---|---|---|---|
| `rollup@4.54.0` | High | Arbitrary file write via path traversal (`GHSA-mw96-cpmx-2vgc`) | `package-lock.json`, via `vite` and `rollup-plugin-visualizer` | Fix available via lockfile refresh to patched Rollup within Vite-compatible range. |
| `npm@11.10.0` | High | Pulls vulnerable `minimatch` and `tar` | `package-lock.json`, via `semantic-release` → `@semantic-release/npm` | Dev/release-path exposure, not runtime-app exposure. |
| `minimatch@10.1.2` | High | ReDoS advisories (`GHSA-3ppc-4f35-3m26`, `GHSA-7r86-cg39-jmmj`, `GHSA-23c5-xmqv-rm74`) | `package-lock.json`, via bundled `npm` | Likely fixable by refreshing the dev release tool chain lockfile. |
| `tar` (under `npm`) | High | Path traversal / hardlink escape advisories (`GHSA-83g3-92jg-28cx`, `GHSA-qffp-2rhf-9h96`) | `package-lock.json`, via `npm` | Same release-tool chain caveat as above. |
| `dompurify@3.3.1` | Moderate | XSS advisory (`GHSA-v2wj-7wpq-c8vv`) | direct dependency | Root manifest allows `^3.3.1`; latest npm metadata shows `3.3.2`. |
| `monaco-editor@0.55.1` | Moderate | Pulls transitive `dompurify` | `package-lock.json` | `npm ls --package-lock-only` shows `monaco-editor@0.55.1` still resolves `dompurify@3.2.7`. |

#### Freshness / staleness observations

Direct dependency drift found from npm metadata and lockfile inspection:

| Package | Manifest | Resolved | Latest seen | Assessment |
|---|---:|---:|---:|---|
| `dompurify` | `^3.3.1` | `3.3.1` | `3.3.2` | Safe patch candidate. |
| `marked` | `^17.0.3` | `17.0.3` | `17.0.4` | Safe patch candidate. |
| `@solid-primitives/storage` | `^4.3.3` | `4.3.3` | `4.3.4` | Safe patch candidate. |
| `@solid-primitives/websocket` | `^1.3.1` | `1.3.1` | `1.3.2` | Safe patch candidate. |
| `shiki` | `^3.22.0` | `3.22.0` | `4.0.2` | Major upgrade; not immediate. |
| `vite` | `^7.3.1` | `7.3.1` | `7.3.1` | Current. |
| `vitest` | `^4.0.18` | `4.0.18` | `4.0.18` | Current. |

#### Upgrade caveats

- **`dompurify` is not a full one-line fix** because the repo has both:
  - a direct `dompurify@3.3.1`, and
  - a transitive `dompurify@3.2.7` under `monaco-editor@0.55.1`.
- `npm view monaco-editor@0.55.1 dependencies` still shows `dompurify: 3.2.7`; therefore, **the DOMPurify advisory likely persists even if the direct root dependency alone is patched**.
- The `npm`/`tar`/`minimatch` findings are in the **release toolchain path**, not the shipped frontend runtime, but they still affect CI/release integrity.

### 2) MCP server (`mcp-server/`)

**Manifest / lockfile inputs:** `mcp-server/package.json`, `mcp-server/package-lock.json`, `mcp-server/src/client.ts`, `mcp-server/src/index.ts`

#### Validated security findings

`npm --prefix mcp-server audit --json` reports:

| Package | Severity | Validated issue | Dependency path | Notes |
|---|---|---|---|---|
| `hono@4.12.1` | High | Auth bypass / file access issues plus moderate cookie/SSE injection advisories | `@modelcontextprotocol/sdk@1.26.0` → `hono` | Sidecar network surface, so impact is meaningful. |
| `@hono/node-server@1.19.9` | High | Authorization bypass for protected static paths | `@modelcontextprotocol/sdk@1.26.0` → `@hono/node-server` | Also transitively from MCP SDK. |
| `express-rate-limit@8.2.1` | High | IPv4-mapped IPv6 bypass | `@modelcontextprotocol/sdk@1.26.0` → `express-rate-limit` | Transitively reachable from SDK. |
| `ajv@8.17.1` | Moderate | ReDoS with `$data` option | `@modelcontextprotocol/sdk@1.26.0` → `ajv` | Patch/update needed in SDK tree. |
| `minimatch@10.2.2` | High | ReDoS | `glob@13.0.6` → `minimatch` | Lockfile patch refresh candidate. |

#### Lockfile hygiene

This is the clearest stale-lockfile case in the repo:

| Package | Manifest range | Resolved | Latest seen | Assessment |
|---|---:|---:|---:|---|
| `@modelcontextprotocol/sdk` | `^1.25.3` | `1.26.0` | `1.27.1` | Lockfile is stale within the declared range. |
| `glob` | `^13.0.6` | `13.0.6` | `13.0.6` | Current, but transitive `minimatch` still needs patched resolution. |
| `zod` | `^3.25.76` | `3.25.76` | `4.3.6` | Major migration candidate only. |
| `tsx` | not pinned exactly | `4.21.0` | current enough | No immediate risk signal. |

Important nuance: `npm view @modelcontextprotocol/sdk@1.27.1 dependencies` still advertises the same vulnerable transitive ranges (`hono`, `@hono/node-server`, `express-rate-limit`, `ajv`). So:

- **Refreshing to `1.27.1` is still recommended** because the lockfile is stale and may pick newer patched transitives where ranges allow.
- But **upgrading the MCP SDK alone is not guaranteed to eliminate every audit finding** if the upstream dependency ranges remain unchanged.

#### Test and validation gap

- `mcp-server/package.json` contains **no `test` script**.
- `mcp-server/src/` has only **2 source files** (`client.ts`, `index.ts`) and **0 tests**.
- Given this sidecar directly mediates file access, process execution, and socket connectivity, the absence of unit tests around parsing, truncation, path resolution, and socket lifecycle is a major blind spot.

### 3) Rust/Tauri backend (`src-tauri/`)

**Manifest / lockfile inputs:** `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`

#### Security/process posture observations

- No repo CI or hooks run `cargo audit`, `cargo deny`, or an equivalent Rust advisory scanner.
- There is no pinned repo-level Rust toolchain file (`rust-toolchain.toml` / `rust-toolchain`) even though CI depends on nightly for formatting and stable for build/lint/test.
- This means Rust dependency security posture is currently inferred from version freshness and manual graph inspection rather than enforced by automation.

#### Freshness observations from crates.io metadata

| Crate | Manifest version | Latest seen | Assessment |
|---|---:|---:|---|
| `tauri` | `2.10` | `2.10.3` | Patch drift; usually safe after GUI smoke/build validation. |
| `tauri-build` | `2.5` | `2.5.6` | Patch drift; likely safe with normal build verification. |
| `tauri-plugin-shell` | `2.3` | `2.3.5` | Patch drift; good immediate candidate. |
| `tauri-plugin-deep-link` | `2.4` | `2.4.7` | Patch drift; good immediate candidate. |
| `tauri-plugin-updater` | `2.10` | `2.10.0` | Current. |
| `reqwest` | `0.12` | `0.13.2` | Next-line upgrade; not immediate. |
| `git2` | `0.19` | `0.20.4` | Likely breaking/behavioral surface changes. |
| `rusqlite` | `0.32` | `0.38.0` | Large compatibility jump; not immediate. |
| `wasmtime` | `29` | `42.0.1` | Large lag; high-risk upgrade. |
| `landlock` | `0.4` | `0.4.4` | Patch drift; likely safe on Linux. |
| `sysinfo` | `0.32` | `0.38.4` | Minor/major-ish API delta depending usage; medium risk. |
| `ssh2` | `0.9` | `0.9.5` | Patch drift; likely safe if remote flows are tested. |

#### Lockfile hygiene / duplication debt

`cargo tree -d` shows duplicate dependency lines that should be tracked as maintenance debt:

- `reqwest 0.12.28` is used directly by `cortex-gui`
- `reqwest 0.13.2` is also pulled by `tauri-plugin-updater`
- duplicate `base64` versions are present (`0.21.7`, `0.22.1`)
- multiple `rustix` lines are present (`0.38.44`, `1.1.3`)

This is not automatically wrong, but it means:

- more advisory surface to watch,
- larger binaries / compile time,
- more work to reason about security patches,
- and higher odds of inconsistent behavior across HTTP/client-related stacks.

## Lockfile hygiene assessment

### Good

- Root and MCP server both use npm lockfile v3 (`package-lock.json`, `mcp-server/package-lock.json`).
- Rust lockfile is committed (`src-tauri/Cargo.lock`).
- No peer-dependency conflict evidence was surfaced in the provided TypeScript audit.

### Weak points

1. **Lockfiles are stale inside allowed ranges**
   - Root: several direct packages have patch/minor releases available but are not refreshed.
   - MCP server: `@modelcontextprotocol/sdk` is the clearest example (`1.26.0` resolved vs `1.27.1` available).

2. **No automated dependency refresh policy**
   - No top-level `.github/dependabot.yml` / `.github/dependabot.yaml` found.
   - No top-level `renovate.json` found. The only Renovate config observed is inside vendored `src-tauri/window-vibrancy/`, which does not help this repo.

3. **Toolchain drift risk**
   - No repo `.nvmrc` or `.node-version` found.
   - CI uses `actions/setup-node` with Node `24`, but local contributors are not guided/pinned to that version.
   - No repo-level Rust toolchain file found despite mixed nightly/stable usage in CI.

## Test coverage, flake, and validation assessment

### Frontend

#### What is working

- Large test inventory exists and the project already uses Vitest + jsdom.
- `src/sdk/` has dedicated test coverage (**11** files), which is a positive sign because it is part of the frontend/backend contract surface.
- Existing repo baseline in `TYPESCRIPT_AUDIT.md` shows tests can pass at scale.

#### Main gaps

1. **Critical frontend API surface is untested**
   - `src/api/admin.ts`
   - `src/api/agents.ts`
   - `src/api/share.ts`

   These modules perform request building and error mapping for admin/share/agent flows and currently have **0 dedicated tests**.

2. **Coverage posture is inflated by `cov-*` tests**
   - Out of **1,145** detected frontend test files, **811** use the `cov-*` naming pattern.
   - That leaves **334** non-`cov-*` tests for functional behavior.
   - This does not make the suite bad, but it does mean raw file counts overstate how much human-curated business behavior is covered.

3. **Coverage is not enforced**
   - `vitest.config.ts` sets thresholds to zero for all metrics.
   - Coverage reports exist, but there is no pass/fail bar preventing regressions.

4. **Test setup duplication increases maintenance risk**
   - `vitest.config.ts` loads **both** `src/__tests__/setup.ts` and `src/test/setup.ts`.
   - Both files define overlapping DOM/Tauri mocks and polyfills (`ResizeObserver`, `IntersectionObserver`, clipboard APIs, animation frame shims, event mocks).
   - This creates a risk of inconsistent mock state, hidden ordering dependencies, and harder-to-debug flakes.

#### Flaky-pattern signals

This audit found broad async timing usage in frontend tests:

- **20** files use `waitFor`/`vi.waitFor`
- **19** files use raw `setTimeout`-based waits/promises
- **18** files use fake timers

Representative areas include:

- `src/context/__tests__/ToastContext.test.tsx`
- `src/components/__tests__/SearchSidebar.test.tsx`
- `src/components/cortex/__tests__/CortexDesktopLayout.test.tsx`
- `src/components/editor/__tests__/RenameWidget.test.tsx`
- `src/components/editor/__tests__/PeekView.test.tsx`

These patterns are often legitimate, but they correlate with flake risk when combined with jsdom, async rendering, and overlapping global mocks. That aligns with the existing note in `TYPESCRIPT_AUDIT.md` about first-run frontend flakiness.

### MCP server

This is the thinnest-tested surface in the repository:

- `mcp-server/src/client.ts` has **0 tests** despite handling connection retries, request matching, buffering, timeouts, and parse failures.
- `mcp-server/src/index.ts` has **0 tests** despite defining user-facing tools, truncation, path safety, file I/O, command execution, and workspace resolution behavior.
- `mcp-server/package.json` has **no test script**, so CI cannot even easily add this validation without first creating a standard entry point.

### Rust/Tauri

Rust coverage is present but narrow relative to backend size:

- `src-tauri/src/app/tests.rs` verifies state trait bounds and basic initialization behavior.
- `src-tauri/tests/ipc_commands.rs` is effectively a compile/link integration smoke test.
- There are many test markers in the Rust tree, but the explicit integration surface visible from the repo root is still slim for a backend this large.

For a backend with broad command surfaces (file system, shell, remote, extensions, MCP, collaboration), the current test posture likely under-covers:

- command authorization / path restriction behavior,
- error-path propagation,
- plugin and updater interactions,
- and platform-specific capability checks.

## CI, hook, and release blind spots

### What is enforced today

- `.github/workflows/ci.yml`
  - frontend: `npm ci`, `npm run typecheck`, `npm run test`, `npm run build`
  - rust: `cargo +nightly fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
  - GUI `cargo check` on macOS and Windows
- `.githooks/pre-commit`
  - Rust format check
  - TS typecheck
  - full frontend test suite
- `.githooks/pre-push`
  - TS typecheck
  - frontend tests
  - frontend build
  - Rust fmt/clippy/test

### Blind spots

1. **No `mcp-server` CI job**
   - No install/build/typecheck/test path for `mcp-server` in CI.
   - No hook coverage for `mcp-server` either.

2. **No dependency security automation**
   - CI/hook searches show **0** references to `npm audit`, `cargo audit`, or `cargo deny`.
   - Vulnerability detection is entirely manual today.

3. **Coverage is informational only**
   - `npm run test:coverage` exists but is not used in CI.
   - Thresholds are all `0`, so coverage regression does not fail builds.

4. **Release tooling carries vulnerable transitive packages**
   - `semantic-release` pulls `@semantic-release/npm`, which pulls `npm@11.10.0` and its vulnerable `tar` / `minimatch` tree.
   - This is not app-runtime code, but it still touches the release path and should be treated as release supply-chain debt.

5. **Environment/toolchain pinning is incomplete**
   - CI is opinionated (Node 24, nightly fmt, stable build/test), but local development lacks matching version pins.
   - That raises the chance of “works in CI, fails locally” or vice versa, especially for native/Tauri builds.

## Prioritized remediation backlog

| Priority | Package / module | Affected files | Validated issue | Upgrade / implementation caveats | Safe for immediate PR? | Suggested verification |
|---|---|---|---|---|---|---|
| P0 | `mcp-server` CI coverage | `.github/workflows/ci.yml`, `mcp-server/package.json` | Sidecar is unvalidated in CI; 0 tests and no build/typecheck step | Add `npm --prefix mcp-server ci`, `npm --prefix mcp-server run build`, and ideally a test script scaffold | **Yes** | CI passes on fresh checkout; `npm --prefix mcp-server run build` succeeds |
| P0 | `@modelcontextprotocol/sdk` lockfile refresh | `mcp-server/package.json`, `mcp-server/package-lock.json` | Resolved `1.26.0` is stale vs available `1.27.1`; sidecar audit currently has 5 findings | Refreshing may not eliminate all SDK-transitive advisories because upstream ranges still include vulnerable packages | **Yes** | `npm --prefix mcp-server ci`, `npm --prefix mcp-server outdated`, `npm --prefix mcp-server audit` |
| P0 | `glob` / `minimatch` in `mcp-server` | `mcp-server/package-lock.json` | `glob@13.0.6` resolves vulnerable `minimatch@10.2.2` | Try lockfile refresh first; if still unresolved, may require explicit override/resolution strategy | **Yes** | Re-run `npm --prefix mcp-server audit --json` |
| P0 | MCP server test harness | `mcp-server/src/client.ts`, `mcp-server/src/index.ts`, `mcp-server/package.json` | High-risk sidecar logic has 0 tests | Need to introduce a test runner and isolate socket/fs/child-process boundaries | **No** (larger task) | Add unit tests for path resolution, truncation, timeout handling, and buffer parsing |
| P0 | Frontend API modules tests | `src/api/admin.ts`, `src/api/agents.ts`, `src/api/share.ts` | Core request/error mapping layer has 0 tests | Straightforward fetch-mocking tests; low production risk | **Yes** | Vitest coverage for success, 4xx/5xx mapping, payload/query construction |
| P1 | Root lockfile refresh for safe patches | `package.json`, `package-lock.json` | Several direct packages are behind latest patch/minor in existing ranges (`dompurify`, `marked`, solid primitives) | Keep changes within existing semver ranges to reduce break risk | **Yes** | `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` |
| P1 | `rollup` advisory remediation | `package-lock.json` | Root audit reports high severity `rollup@4.54.0` | Usually fixable via lockfile refresh if Vite’s allowed range pulls patched Rollup | **Yes** | Re-run root `npm audit --json`; confirm Vite build still passes |
| P1 | Release toolchain dependency refresh | `package-lock.json`, `.releaserc.json` | `semantic-release` path brings in vulnerable `npm`/`tar`/`minimatch` | Scope is CI/release, not app runtime; verify release workflow compatibility before merging | **Likely yes** | `npm audit --json`; dry-run semantic-release if available |
| P1 | Coverage enforcement | `vitest.config.ts`, `.github/workflows/ci.yml` | Coverage thresholds are all `0`; CI never runs `test:coverage` | Start with targeted thresholds on critical modules to avoid mass false failures | **No** (policy change) | Run `npm run test:coverage`; ratchet thresholds over time |
| P1 | Duplicate frontend setup files | `vitest.config.ts`, `src/__tests__/setup.ts`, `src/test/setup.ts` | Overlapping global mocks/polyfills increase maintenance and flake risk | Consolidate carefully to avoid breaking implicit test dependencies | **No** (needs audit of current consumers) | Full Vitest suite on clean runs, repeated at least twice |
| P1 | Rust advisory automation | `.github/workflows/ci.yml`, possibly tooling docs | No `cargo audit` / `cargo deny` in CI or hooks | Requires selecting tool and acceptable advisory policy | **Yes** | Dedicated CI job runs and produces deterministic output |
| P1 | Toolchain pinning | repo root (`.nvmrc`, `rust-toolchain.toml`) | Local environments can drift from CI | Minor developer experience change, but low runtime risk | **Yes** | Fresh setup follows pinned Node/Rust versions; CI remains green |
| P2 | `dompurify` / `monaco-editor` path | `package.json`, `package-lock.json`, Monaco-related codepaths | Moderate XSS advisory remains entangled with Monaco’s transitive `dompurify@3.2.7` | May require waiting for upstream Monaco release or using a vetted override after compatibility review | **No** | `npm audit --json`; manual verification of Markdown/HTML rendering paths |
| P2 | `zod` v4 migration in `mcp-server` | `mcp-server/package.json`, `mcp-server/src/index.ts` | Major upgrade available | Runtime schema and inferred-type behavior may change; coordinate with MCP SDK expectations | **No** | Build + test suite once MCP server tests exist |
| P2 | Rust patch/minor refreshes (`tauri`, plugins, `landlock`, `ssh2`) | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | Patch drift on several direct crates | Usually safe, but native plugins warrant multi-platform build/test coverage | **Yes, in small batches** | `cargo check`, `cargo test`, CI GUI checks on macOS/Windows/Linux |
| P2 | `reqwest` unification | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | Duplicate `reqwest 0.12` and `0.13` stacks | Potentially blocked by `tauri-plugin-updater`; may require waiting for aligned ecosystem versions | **No** | `cargo tree -d`, `cargo check`, updater flow smoke test |
| P3 | Large Rust crate catch-up (`git2`, `rusqlite`, `wasmtime`) | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, affected backend modules | Significant lag vs newest releases | High API/behavioral risk; should be treated as dedicated upgrade projects | **No** | Module-focused test plans plus platform smoke testing |

## Safe immediate PR bucket

These items are the best candidates for near-term, low-risk follow-up PRs:

1. **Create `mcp-server` CI coverage**
   - Add install/build/typecheck validation to `.github/workflows/ci.yml`.
   - Add a standard script surface in `mcp-server/package.json` if needed.

2. **Refresh `mcp-server` lockfile within current semver ranges**
   - Update `@modelcontextprotocol/sdk` resolution to current allowed version.
   - Re-run audit and record which findings remain upstream.

3. **Add dedicated frontend tests for `src/api/admin.ts`, `src/api/agents.ts`, `src/api/share.ts`**
   - These should be isolated fetch-mock tests and are unlikely to destabilize app code.

4. **Refresh root patch/minor npm dependencies within current ranges**
   - `dompurify` (direct), `marked`, `@solid-primitives/storage`, `@solid-primitives/websocket`.
   - Verify whether Rollup advisory clears as a consequence.

5. **Add dependency scanning automation**
   - At minimum: root `npm audit`, `mcp-server` `npm audit`, Rust `cargo audit` or `cargo deny` in CI.

6. **Add repo-level version pinning**
   - `.nvmrc` or `.node-version`
   - `rust-toolchain.toml`

## Needs deeper validation before merging

These are important, but should not be treated as “safe quick wins”:

- **`monaco-editor` / transitive `dompurify` remediation**
- **Introducing meaningful coverage thresholds**
- **Consolidating the dual Vitest setup files**
- **`zod` v4 migration in `mcp-server`**
- **Rust `reqwest` unification / HTTP stack deduplication**
- **Large Rust dependency upgrades** (`git2`, `rusqlite`, `wasmtime`)

## Recommended next sequence

1. Add `mcp-server` CI build/typecheck coverage.
2. Refresh `mcp-server` lockfile and root lockfile within existing semver ranges.
3. Add tests for `src/api/admin.ts`, `src/api/agents.ts`, `src/api/share.ts`.
4. Introduce dependency audit jobs for npm and Rust.
5. Stand up a minimal `mcp-server` unit test harness for `client.ts` and `index.ts`.
6. Tackle medium-risk upgrades and threshold policy changes in separate PRs.

## Appendix: concrete files reviewed

- `TYPESCRIPT_AUDIT.md`
- `package.json`
- `package-lock.json`
- `mcp-server/package.json`
- `mcp-server/package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `vitest.config.ts`
- `src/__tests__/setup.ts`
- `src/test/setup.ts`
- `src/api/admin.ts`
- `src/api/agents.ts`
- `src/api/share.ts`
- `mcp-server/src/client.ts`
- `mcp-server/src/index.ts`
- `src-tauri/src/app/tests.rs`
- `src-tauri/tests/ipc_commands.rs`
- `.github/workflows/ci.yml`
- `.githooks/pre-commit`
- `.githooks/pre-push`
