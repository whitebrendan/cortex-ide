# Rust Compilation Audit — Cortex IDE

**Date:** 2025-03-02
**Toolchain:** `rustc 1.95.0-nightly (c04308580 2026-02-18)`, `cargo 1.95.0-nightly`
**Target:** `x86_64-unknown-linux-gnu`
**Crate:** `cortex-gui v0.0.6` (edition 2024, rust-version 1.85)
**Directory:** `src-tauri/`

---

## Executive Summary

| Check | Result |
|-------|--------|
| `cargo check` | **PASS** — 0 errors, 0 warnings |
| `cargo build` (debug) | **PASS** — 0 errors, 0 warnings |
| `cargo build --release` | **PASS** — 0 errors, 0 warnings (LTO enabled) |
| `cargo clippy --all-targets` (project lints) | **PASS** — 0 issues |
| `cargo clippy --all-targets -- -W clippy::all` | **22 warnings** (all stylistic) |
| `cargo fmt --all -- --check` | **1 file** needs formatting |
| `cargo test` | **413 passed**, 0 failed |
| `cargo check --no-default-features` | **PASS** |
| `cargo check --features custom-protocol` | **PASS** |
| `cargo check --features wasm-extensions` | **PASS** |
| `cargo check --features remote-ssh` | **PASS** |
| `cargo check --features image-processing` | **PASS** |
| Build-time prerequisites | **3 issues** (missing `dist/` dir, missing GTK libs, missing `libxdo`) |
| Duplicate dependencies | **~40 crate pairs** (transitive, not direct conflicts) |
| Undeclared source modules | **3 files** not wired into `lib.rs` |

**Overall:** The Rust codebase compiles cleanly with zero errors and zero warnings under its configured lint profile. All 4 feature flags compile independently. The 22 clippy warnings only appear when overriding the project's intentionally relaxed `derivable_impls` and `unnecessary_sort_by` lint settings. Three system-level prerequisites must be satisfied before compilation can succeed on a fresh Linux environment.

---

## 1. Compilation Errors

### 1.1 Hard Compilation Errors: **NONE**

`cargo check` and `cargo build` produce **zero** Rust compilation errors. All 48+ modules, macros, and type-level constructs resolve correctly.

### 1.2 Build-Time Prerequisite Errors (Environment)

These are not Rust code errors but environment setup issues that block compilation on a fresh system.

#### Error 1: Missing `frontendDist` Directory

| Field | Value |
|-------|-------|
| **Error type** | Proc-macro panic (build-time) |
| **File** | `src/lib.rs:167` |
| **Trigger** | `tauri::generate_context!()` macro |
| **Message** | `The frontendDist configuration is set to "../dist" but this path doesn't exist` |
| **Root cause** | `tauri.conf.json` references `../dist` which is the Vite build output; it must exist at Rust compile time |
| **Fix** | Run `npm run build` (or `mkdir -p ../dist && touch ../dist/index.html`) before `cargo check`/`cargo build` |
| **Severity** | Blocking — prevents any Rust compilation |

#### Error 2: Missing System Library `glib-2.0`

| Field | Value |
|-------|-------|
| **Error type** | Build script failure (`glib-sys v0.18.1`) |
| **Message** | `The system library glib-2.0 required by crate glib-sys was not found` |
| **Root cause** | GTK3/GLib development headers not installed (required by Tauri on Linux) |
| **Fix** | `apt-get install libglib2.0-dev libgtk-3-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` |
| **Severity** | Blocking — prevents compilation of GTK/WebKit system bindings |

#### Error 3: Missing System Library `libxdo`

| Field | Value |
|-------|-------|
| **Error type** | Linker error |
| **Message** | `rust-lld: error: unable to find library -lxdo` |
| **Root cause** | `enigo v0.3.0` (keyboard/mouse automation crate) requires `libxdo` |
| **Fix** | `apt-get install libxdo-dev` |
| **Severity** | Blocking — `cargo check` passes but `cargo build` fails at link stage |

---

## 2. Compiler Warnings: **NONE**

Under the project's configured lint profile (`Cargo.toml` `[lints.clippy]` section), `cargo check` and `cargo build` produce **zero warnings**.

The project intentionally allows these clippy lints:
- `print_stdout` / `print_stderr` — allowed
- `unnecessary_sort_by` — allowed
- `iter_without_into_iter` — allowed
- `module_inception` — allowed
- `derivable_impls` — allowed

And sets these to warn:
- `unwrap_used` — warn
- `expect_used` — warn

And denies:
- `unsafe_code` — deny

---

## 3. Clippy Extended Warnings (`-W clippy::all`)

Running `cargo clippy --all-targets -- -W clippy::all` (overriding the project's relaxed settings) produces **22 warnings** across 14 files. These are all stylistic and intentionally suppressed by the project's lint configuration.

### 3.1 `derivable_impls` — 14 warnings

Manual `Default` implementations that could be replaced with `#[derive(Default)]`:

| # | File | Line | Type |
|---|------|------|------|
| 1 | `src/activity.rs` | 25 | `TaskPriority::Normal` |
| 2 | `src/ai/agents/types.rs` | 87 | `AgentStatus::Idle` |
| 3 | `src/ai/agents/types.rs` | 103 | `AgentType::Custom` |
| 4 | `src/collab/types.rs` | 17 | `CollabPermission::Editor` |
| 5 | `src/factory/types.rs` | 346 | `RiskLevel::None` |
| 6 | `src/factory/types.rs` | 393 | `TimeoutAction::Deny` |
| 7 | `src/factory/types.rs` | 515 | `AgentStatus::Idle` |
| 8 | `src/factory/types.rs` | 662 | `AuditResult::Success` |
| 9 | `src/factory/types.rs` | 784 | `ExecutionStatus::Pending` |
| 10 | `src/factory/types.rs` | 844 | `ApprovalStatus::Pending` |
| 11 | `src/repl/types.rs` | 18 | `KernelStatus::Idle` |
| 12 | `src/repl/types.rs` | 75 | `CellStatus::Pending` |
| 13 | `src/settings_sync/types.rs` | 16 | `SyncStatus::Idle` |
| 14 | `src/terminal/types.rs` | 53 | `CreateTerminalOptions` (struct) |

### 3.2 `unnecessary_sort_by` — 6 warnings

`sort_by` calls that could use `sort_by_key`:

| # | File | Line | Suggestion |
|---|------|------|------------|
| 1 | `src/ai/thread.rs` | 212 | `sort_by_key(\|b\| std::cmp::Reverse(b.updated_at))` |
| 2 | `src/cortex_storage/mod.rs` | 239 | `sort_by_key(\|b\| std::cmp::Reverse(b.updated_at))` |
| 3 | `src/factory/audit.rs` | 270 | `sort_by_key(\|b\| std::cmp::Reverse(b.timestamp))` |
| 4 | `src/fs/directory.rs` | 678 | `sort_by_key(\|b\| std::cmp::Reverse(b.modified_at))` |
| 5 | `src/search.rs` | 145 | `sort_by_key(\|b\| std::cmp::Reverse(b.column))` |
| 6 | `src/search.rs` | 797 | `sort_by_key(\|b\| std::cmp::Reverse(b.column))` |

### 3.3 Additional `unnecessary_sort_by` — 1 warning

| # | File | Line | Suggestion |
|---|------|------|------------|
| 1 | `src/terminal/process.rs` | 443 | `sort_by_key(\|a\| a.port)` |

### 3.4 `derivable_impls` (struct) — 1 warning

| # | File | Line | Suggestion |
|---|------|------|------------|
| 1 | `src/toolchain.rs` | 44 | `ProjectToolchains` — derive `Default` |

---

## 4. Formatting Issues

`cargo fmt --all -- --check` reports **1 file** needs formatting:

| File | Issue |
|------|-------|
| `src/lib.rs:48-53` | `mod startup_timing;` declaration is out of alphabetical order relative to the `#[cfg(feature = "remote-ssh")] mod ssh_terminal;` block |

**Diff:**
```diff
 mod settings_sync;
-mod startup_timing;
 #[cfg(feature = "remote-ssh")]
 mod ssh_terminal;
+mod startup_timing;
 mod system_specs;
```

---

## 5. Cargo.toml Dependency Audit

### 5.1 Direct Dependency Summary

The project declares **56 direct dependencies** (plus 5 platform-specific and 3 optional).

### 5.2 Duplicate Dependencies (Transitive)

`cargo tree --duplicates` reveals the following duplicate crate versions pulled in transitively. These are **not direct conflicts** — they arise from different dependency trees requiring different major/minor versions.

#### High-Impact Duplicates (large crates compiled twice)

| Crate | Versions | Cause |
|-------|----------|-------|
| `image` | 0.24.9, 0.25.9 | Direct dep uses 0.24; `arboard`/`tauri-plugin-mcp-bridge` use 0.25 |
| `reqwest` | 0.12.28, 0.13.2 | Direct dep uses 0.12; `tauri-plugin-updater` uses 0.13 |
| `tokio-tungstenite` | 0.24.0, 0.28.0 | Direct dep uses 0.24; transitive uses 0.28 |
| `tungstenite` | 0.24.0, 0.28.0 | Follows `tokio-tungstenite` split |
| `wasmtime` components | Multiple `wasm-encoder` versions | Internal wasmtime dependency chain |

#### Medium-Impact Duplicates

| Crate | Versions | Cause |
|-------|----------|-------|
| `rand` | 0.7.3, 0.8.5, 0.9.2 | 3 major versions across dependency tree |
| `rand_chacha` | 0.2.2, 0.3.1, 0.9.0 | Follows `rand` versions |
| `rand_core` | 0.5.1, 0.6.4, 0.9.3 | Follows `rand` versions |
| `getrandom` | 0.1.16, 0.2.16, 0.3.4 | Follows `rand` versions |
| `hashbrown` | 0.12.3, 0.14.5, 0.15.5, 0.16.1 | 4 versions across indexmap/dashmap/etc. |
| `toml_edit` | 0.19.15, 0.20.2, 0.22.27, 0.23.10 | 4 versions across proc-macro-crate versions |
| `toml` | 0.8.23, 0.9.11 | wasmtime-cache uses 0.9 |
| `thiserror` | 1.0.69, 2.0.18 | Migration period — both major versions coexist |

#### Low-Impact Duplicates (small crates)

| Crate | Versions |
|-------|----------|
| `base64` | 0.21.7, 0.22.1 |
| `bitflags` | 1.3.2, 2.10.0 |
| `dirs` / `dirs-sys` | Two version pairs |
| `foldhash` | 0.1.5, 0.2.0 |
| `indexmap` | 1.9.3, 2.13.0 |
| `linux-raw-sys` | 0.4.15, 0.11.0 |
| `mio` | 0.8.11, 1.1.1 |
| `nix` | 0.25.1, 0.30.1 |
| `openssl-probe` | 0.1.6, 0.2.1 |
| `phf` / `phf_shared` / `phf_generator` / `phf_macros` / `phf_codegen` | 3 version families (0.8, 0.10, 0.11) |
| `png` | 0.17.16, 0.18.0 |
| `proc-macro-crate` | 1.3.1, 2.0.0, 3.4.0 |
| `rustix` | 0.38.44, 1.1.3 |
| `siphasher` | 0.3.11, 1.0.1 |
| `syn` | 1.0.109, 2.0.114 |
| `target-lexicon` | 0.12.16, 0.13.4 |
| `winnow` | 0.5.40, 0.7.14 |
| `zstd` / `zstd-safe` | Two version pairs |
| `memoffset` | 0.6.5, 0.9.1 |
| `heck` | 0.4.1, 0.5.0 |

### 5.3 Potential Upgrade Opportunities

| Dependency | Current | Note |
|------------|---------|------|
| `image` | 0.24 (direct) | Could upgrade to 0.25 to eliminate duplicate with transitive deps |
| `tokio-tungstenite` | 0.24 (direct) | Could upgrade to 0.28 to match transitive deps |
| `rand` | 0.8 (direct) | Could upgrade to 0.9 to reduce duplicate chain |
| `thiserror` | 1.0 (direct) | Could upgrade to 2.0 to match some transitive deps |

### 5.4 Feature Flag Configuration

| Feature | Default | Dependencies | Status |
|---------|---------|-------------|--------|
| `custom-protocol` | ✅ Yes | `tauri/custom-protocol` | ✅ Compiles |
| `wasm-extensions` | ✅ Yes | `dep:wasmtime` (v29, cranelift) | ✅ Compiles |
| `remote-ssh` | ✅ Yes | `dep:ssh2` (v0.9) | ✅ Compiles |
| `image-processing` | ✅ Yes | `dep:image` (v0.24) | ✅ Compiles |

All features compile independently with `--no-default-features --features <name>`. No feature flag misconfigurations detected.

### 5.5 Platform-Specific Dependencies

| Platform | Dependencies | Status |
|----------|-------------|--------|
| `cfg(target_os = "windows")` | `win-screenshot 4.0`, `window-vibrancy 0.5`, `windows-sys 0.59` | Not tested (Linux host) |
| `cfg(target_os = "macos")` | `xcap 0.0.4`, `window-vibrancy 0.5` | Not tested (Linux host) |
| `cfg(target_os = "linux")` | `landlock 0.4` | ✅ Compiles |
| `cfg(not(android/ios))` | `tauri-plugin-single-instance 2.4`, `tauri-plugin-updater 2.10`, `tauri-plugin-deep-link 2.4` | ✅ Compiles |

### 5.6 Vendored Dependencies

| Crate | Path | Status |
|-------|------|--------|
| `window-vibrancy` | `src-tauri/window-vibrancy/` | Present but **not referenced** in `Cargo.toml` workspace/path deps — Windows and macOS targets use `window-vibrancy = "0.5"` from crates.io |

### 5.7 Notable Dependency Observations

1. **`reqwest` has no `blocking` feature** — Intentional per AGENTS.md to prevent sync blocking in async context
2. **`rusqlite` uses `bundled` feature** — Bundles SQLite statically, avoiding system SQLite version issues
3. **`notify` uses `macos_kqueue` feature with `default-features = false`** — Avoids pulling in fsevent on Linux
4. **`sysinfo` uses `default-features = false` with `system` feature** — Minimal system info footprint
5. **`wasmtime v29`** — Large dependency (~25+ transitive crates); compiled by default via the `wasm-extensions` feature (included in default features)

---

## 6. Linker Errors

### 6.1 Linux (x86_64-unknown-linux-gnu)

| Error | Library | Required By | Fix |
|-------|---------|-------------|-----|
| `unable to find library -lxdo` | `libxdo` | `enigo v0.3.0` | `apt-get install libxdo-dev` |

No other linker errors after installing system dependencies.

### 6.2 Required System Libraries (Linux)

Complete list of system libraries linked at build time:

| Library | Package | Required By |
|---------|---------|-------------|
| `libglib-2.0` | `libglib2.0-dev` | GTK/GLib bindings |
| `libgtk-3` | `libgtk-3-dev` | Tauri/tao window management |
| `libwebkit2gtk-4.1` | `libwebkit2gtk-4.1-dev` | Tauri webview (wry) |
| `libjavascriptcoregtk-4.1` | `libjavascriptcoregtk-4.1-dev` | WebKit JS engine |
| `libsoup-3.0` | `libsoup-3.0-dev` | HTTP client for WebKit |
| `libpango-1.0` / `libpangocairo-1.0` | `libpango1.0-dev` | Text rendering |
| `libcairo` / `libcairo-gobject` | `libcairo2-dev` | 2D graphics |
| `libgdk_pixbuf-2.0` | `libgdk-pixbuf2.0-dev` | Image loading |
| `libatk-1.0` | `libatk1.0-dev` | Accessibility toolkit |
| `libharfbuzz` | `libharfbuzz-dev` | Text shaping |
| `libxdo` | `libxdo-dev` | Keyboard/mouse automation (enigo) |
| `libssl` / `libcrypto` | `libssl-dev` | TLS (openssl-sys) |
| `libz` | `zlib1g-dev` | Compression |

---

## 7. Undeclared Source Modules

Three Rust source files exist in `src-tauri/src/` but are **not declared** in `lib.rs`:

| File | Purpose | Impact |
|------|---------|--------|
| `src/output_channels.rs` | VS Code-like output channels | Dead code — not compiled |
| `src/snippets.rs` | VS Code-compatible snippet management | Dead code — not compiled |
| `src/workspace_symbols.rs` | Workspace-wide symbol search | Dead code — not compiled |

These files are noted in the AGENTS.md as "not yet wired into lib.rs". They do not cause compilation errors because they are simply not included in the module tree.

---

## 8. Test Results

```
cargo test: 413 passed, 0 failed (4 test suites, 0.11s)
```

Test executables:
- `cortex_gui_lib` (lib tests) — unit tests across modules
- `cortex_gui` (binary tests) — main entry point
- `ipc_commands` (integration test) — IPC command tests

---

## 9. Build Profile Analysis

### Debug Profile
```toml
[profile.dev]
opt-level = 0
debug = 2

[profile.dev.package."*"]
opt-level = 2  # Optimize dependencies even in debug mode
```

### Release Profile
```toml
[profile.release]
lto = true           # Link-Time Optimization (full)
codegen-units = 1    # Single codegen unit for max optimization
strip = true         # Strip debug symbols
panic = "abort"      # No unwinding (smaller binary)
```

Both profiles compile successfully.

---

## 10. Summary of All Issues

### Blocking Issues (must fix for fresh builds)

| # | Issue | Category | Fix |
|---|-------|----------|-----|
| 1 | Missing `../dist` directory | Build prerequisite | `npm run build` or `mkdir -p ../dist` |
| 2 | Missing `libglib-2.0` + GTK dev packages | System dependency | `apt-get install libglib2.0-dev libgtk-3-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev` |
| 3 | Missing `libxdo` | System dependency | `apt-get install libxdo-dev` |

### Non-Blocking Issues (code quality)

| # | Issue | Count | Category |
|---|-------|-------|----------|
| 4 | Clippy `derivable_impls` warnings | 14 | Style (intentionally allowed) |
| 5 | Clippy `unnecessary_sort_by` warnings | 7 | Style (intentionally allowed) |
| 6 | Clippy `derivable_impls` (struct) | 1 | Style (intentionally allowed) |
| 7 | `cargo fmt` formatting drift | 1 file | Formatting |
| 8 | Undeclared source modules | 3 files | Dead code |
| 9 | Duplicate transitive dependencies | ~40 pairs | Build size/time |
| 10 | `image` crate version split (0.24 vs 0.25) | 1 | Dependency hygiene |
| 11 | `reqwest` version split (0.12 vs 0.13) | 1 | Dependency hygiene |
| 12 | `tokio-tungstenite` version split (0.24 vs 0.28) | 1 | Dependency hygiene |
| 13 | `rand` 3-version chain (0.7, 0.8, 0.9) | 1 | Dependency hygiene |

### Zero Issues Found In

- ✅ Rust compilation errors
- ✅ Rust compiler warnings (under project lint config)
- ✅ Feature flag misconfigurations
- ✅ Feature flag compilation failures
- ✅ Test failures
- ✅ Release build issues
- ✅ `unsafe_code` violations (denied at crate level; 13 targeted `#[allow(unsafe_code)]` annotations exist in `sandbox/`, `repl/`, `fs/`, `i18n/`, `fs_commands.rs` for platform-specific operations)
- ✅ Version incompatibilities causing build failures
