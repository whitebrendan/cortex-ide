# Building Cortex IDE from Source

This guide covers building Cortex IDE on **Windows**, **macOS**, and **Linux**.

---

## Prerequisites

### All Platforms

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | >= 24.x | Frontend build tooling |
| **npm** | >= 10.x | Package manager (comes with Node.js) |
| **Rust** | >= 1.90 | Backend compilation |
| **Git** | >= 2.x | Source code management |

### Windows

| Tool | Purpose |
|------|---------|
| **Visual Studio Build Tools 2022** | C/C++ compiler (MSVC), required by native Rust crates |
| **WebView2** | Ships with Windows 10/11 (1803+). Required by Tauri. |

Install Visual Studio Build Tools:
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

### macOS

| Tool | Purpose |
|------|---------|
| **Xcode Command Line Tools** | C/C++ compiler, macOS SDK |

```bash
xcode-select --install
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    librsvg2-dev \
    libayatana-appindicator3-dev \
    patchelf
```

### Linux (Fedora/RHEL)

```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install \
    openssl-devel \
    gtk3-devel \
    webkit2gtk4.1-devel \
    librsvg2-devel \
    libappindicator-gtk3-devel \
    patchelf
```

### Linux (Arch)

```bash
sudo pacman -S --needed \
    base-devel \
    openssl \
    gtk3 \
    webkit2gtk-4.1 \
    librsvg \
    libappindicator-gtk3 \
    patchelf
```

---

## Install Rust

If you don't have Rust installed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

On Windows, download and run [rustup-init.exe](https://rustup.rs/).

After installation, verify:

```bash
rustc --version   # Should be >= 1.90.0
cargo --version
```

---

## Install Node.js

We recommend using [nvm](https://github.com/nvm-sh/nvm) (or [nvm-windows](https://github.com/coreybutler/nvm-windows)):

```bash
nvm install 24
nvm use 24

# or, after cloning the repo:
nvm use
```

The repository ships with a root `.nvmrc` pinned to the supported Node.js major used in CI.

Verify:

```bash
node --version   # Should be >= 24.x
npm --version    # Should be >= 10.x
```

---

## Clone & Build

### 1. Clone the repository

```bash
git clone https://github.com/CortexLM/cortex-ide.git
cd cortex-ide
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Development mode (hot-reload)

```bash
npm run tauri:dev
```

This will:
- Start the Vite dev server for the frontend (SolidJS + TypeScript)
- Compile and launch the Tauri Rust backend
- Open the application with hot-reload enabled

First build may take **5-15 minutes** as Rust compiles all dependencies. Subsequent builds are incremental and much faster.

### 4. Production build

```bash
npm run tauri:build
```

This produces platform-specific installers in `src-tauri/target/release/bundle/`:

| Platform | Output |
|----------|--------|
| **Windows** | `nsis/Cortex Desktop_x.x.x_x64-setup.exe` |
| **macOS** | `dmg/Cortex Desktop_x.x.x_aarch64.dmg` and `macos/Cortex Desktop.app` |
| **Linux** | `deb/cortex-desktop_x.x.x_amd64.deb`, `rpm/cortex-desktop-x.x.x.x86_64.rpm`, `appimage/cortex-desktop_x.x.x_amd64.AppImage` |

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server only (frontend) |
| `npm run build` | Build frontend for production |
| `npm run build:analyze` | Build frontend with bundle analysis enabled |
| `npm run tauri:dev` | Full development build (frontend + backend + launch app) |
| `npm run tauri:build` | Full production build with installers |
| `npm run lint` | Run the root ESLint baseline for frontend source and tooling files |
| `npm run lint:fix` | Apply auto-fixable ESLint changes |
| `npm run typecheck` | Run TypeScript checks for app code and root tooling configs |
| `npm run test` | Run frontend unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:ui` | Open Vitest UI in browser |
| `npm run check:frontend` | Run the root frontend quality gate (`lint`, `typecheck`, `test`, `build`) |

---

## Tooling Conventions

- `.nvmrc` pins the supported Node.js major for local development and CI.
- `npm run check:frontend` is the canonical root frontend quality gate used by hooks and CI.
- `npm run lint` is intentionally conservative: it focuses on root frontend source and tooling files without forcing broad repo-wide refactors.

### Deferred Tooling Debt

- `semantic-release@25` still pulls `@semantic-release/npm`, which bundles an npm distribution that `npm audit` flags via `minimatch`/`tar`. Resolving that cleanly likely requires dedicated release-tooling validation rather than a root config-only pass.
- `mcp-server/` dependency refreshes and advisories remain a separate workstream and are intentionally not changed in this root-only pass.
- Stricter type-aware ESLint rules and stricter TypeScript flags (for example `no-floating-promises`, `consistent-type-imports`, `verbatimModuleSyntax`, or `exactOptionalPropertyTypes`) are deferred until dedicated cleanup work can address existing code patterns safely.
- Coverage thresholds remain permissive and should be raised incrementally in focused follow-up work instead of this configuration pass.
- Some advisories can still originate from the developer's globally installed npm CLI/runtime rather than this repository's lockfile and should be evaluated in the local environment separately.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | SolidJS, TypeScript, Tailwind CSS v4, Monaco Editor, xterm.js v6 |
| **Backend** | Rust, Tauri v2 |
| **Editor** | Monaco Editor 0.55.1 |
| **Terminal** | xterm.js 6.x with WebGL rendering |
| **Build** | Vite 7.x (frontend), Cargo (backend) |
| **Testing** | Vitest (frontend), Cargo test (backend) |
| **Desktop** | Tauri v2 (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS) |

---

## Project Structure

```
cortex-ide/
├── src/                    # Frontend (SolidJS + TypeScript)
│   ├── components/         # UI components
│   ├── context/            # SolidJS context providers
│   ├── pages/              # Application pages/views
│   ├── utils/              # Utility functions
│   ├── styles/             # CSS and design tokens
│   ├── i18n/               # Internationalization
│   └── workers/            # Web Workers
├── src-tauri/              # Backend (Rust + Tauri)
│   ├── src/
│   │   ├── ai/             # AI integration (completions, chat, agents)
│   │   ├── editor/         # Editor backend services
│   │   ├── extensions/     # Extension system (WASM, Node.js hosts)
│   │   ├── factory/        # Workflow engine
│   │   ├── fs/             # File system operations
│   │   ├── git/            # Git operations (via libgit2)
│   │   ├── lsp/            # Language Server Protocol client
│   │   ├── remote/         # SSH, tunnels, DevContainers
│   │   └── terminal/       # PTY management
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── mcp-server/             # MCP server (Model Context Protocol)
├── docs/                   # Documentation
└── package.json            # Frontend dependencies & scripts
```

---

## Troubleshooting

### Rust compilation fails with linker errors (Linux)

Make sure all system dependencies are installed. The most common missing package is `libwebkit2gtk-4.1-dev`:

```bash
sudo apt install libwebkit2gtk-4.1-dev
```

### `cargo build` is very slow

First builds compile ~400 crates. This is normal. Enable sccache for faster rebuilds:

```bash
cargo install sccache
export RUSTC_WRAPPER=sccache
```

### WebView2 not found (Windows)

WebView2 ships with Windows 10 (1803+) and Windows 11. If missing, download the [Evergreen Bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

### Node.js version mismatch

Ensure you're using Node.js >= 24:

```bash
node --version
```

If using nvm: `nvm use 24`

### Permission denied on Linux AppImage

```bash
chmod +x cortex-desktop_*.AppImage
./cortex-desktop_*.AppImage
```

### macOS: "Cortex Desktop" is damaged

This happens with unsigned builds. Remove the quarantine flag:

```bash
xattr -cr "/Applications/Cortex Desktop.app"
```

---

## Running Tests

### Frontend tests

```bash
npm run test                # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

### Backend tests

```bash
cd src-tauri
cargo test
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm run test && cd src-tauri && cargo test`
5. Run type checking: `npm run typecheck`
6. Commit and push
7. Open a Pull Request