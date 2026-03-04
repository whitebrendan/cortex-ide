/**
 * File Icons — Maps file extensions and folder names to icon identifiers
 *
 * Provides utility functions for determining the appropriate icon for a file
 * or folder based on its name and extension. Used by the file explorer and
 * editor tabs for visual file type identification.
 *
 * @module lib/file-icons
 */

// ============================================================================
// Extension → Icon Mapping
// ============================================================================

const EXTENSION_ICON_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  ts: "typescript",
  tsx: "react",
  js: "javascript",
  jsx: "react",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",

  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "sass",
  sass: "sass",
  less: "less",
  svg: "svg",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",

  // Data / Config
  json: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  csv: "csv",
  ini: "settings",
  env: "settings",

  // Systems / Low-Level
  rs: "rust",
  go: "go",
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  zig: "zig",

  // Scripting
  py: "python",
  pyi: "python",
  rb: "ruby",
  php: "php",
  pl: "perl",
  lua: "lua",
  r: "r",
  jl: "julia",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  clj: "clojure",
  cljs: "clojure",
  scala: "scala",
  dart: "dart",
  nim: "nim",
  nix: "nix",
  ml: "ocaml",
  mli: "ocaml",
  fs: "fsharp",
  fsx: "fsharp",
  sol: "solidity",

  // Shell
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  bat: "terminal",
  cmd: "terminal",

  // Markup / Documentation
  md: "markdown",
  mdx: "markdown",
  tex: "tex",
  rst: "document",
  adoc: "document",
  txt: "document",
  pdf: "document",

  // Database / Query
  sql: "database",
  sqlite: "database",
  db: "database",
  graphql: "graphql",
  gql: "graphql",

  // Build / CI
  dockerfile: "docker",
  dockerignore: "docker",
  makefile: "settings",
  cmake: "settings",
  gradle: "gradle",

  // Infrastructure
  tf: "terraform",
  tfvars: "terraform",
  proto: "proto",

  // Network / API
  http: "http",

  // Images
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  ico: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  tiff: "image",

  // Fonts
  woff: "font",
  woff2: "font",
  ttf: "font",
  otf: "font",
  eot: "font",

  // Archives
  zip: "archive",
  tar: "archive",
  gz: "archive",
  bz2: "archive",
  xz: "archive",
  "7z": "archive",
  rar: "archive",

  // Lock files
  lock: "lock",

  // Logs
  log: "document",

  // Git
  gitignore: "git",
  gitattributes: "git",
  gitmodules: "git",

  // Config files (dotfile pseudo-extensions)
  editorconfig: "settings",
  prettierrc: "settings",
  eslintrc: "eslint",

  // Binary / Compiled
  wasm: "binary",
  exe: "binary",
  dll: "binary",
  so: "binary",
  dylib: "binary",
  o: "binary",

  // Notebooks
  ipynb: "notebook",

  // Prisma
  prisma: "prisma",
};

// ============================================================================
// Filename → Icon Mapping (exact match, case-insensitive)
// ============================================================================

const FILENAME_ICON_MAP: Record<string, string> = {
  // Package managers
  "package.json": "nodejs",
  "package-lock.json": "nodejs",
  "yarn.lock": "nodejs",
  "pnpm-lock.yaml": "nodejs",
  "bun.lockb": "nodejs",
  "bun.lock": "nodejs",

  // TypeScript / JavaScript config
  "tsconfig.json": "typescript",
  "jsconfig.json": "javascript",

  // Git
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",

  // Editor config
  ".editorconfig": "settings",

  // Prettier
  ".prettierrc": "settings",
  ".prettierrc.json": "settings",
  ".prettierrc.yml": "settings",
  ".prettierrc.js": "settings",
  ".prettierrc.cjs": "settings",
  "prettier.config.js": "settings",
  "prettier.config.mjs": "settings",

  // ESLint
  ".eslintrc": "eslint",
  ".eslintrc.json": "eslint",
  ".eslintrc.js": "eslint",
  ".eslintrc.cjs": "eslint",
  "eslint.config.js": "eslint",
  "eslint.config.mjs": "eslint",
  "eslint.config.ts": "eslint",

  // Environment
  ".env": "settings",
  ".env.local": "settings",
  ".env.development": "settings",
  ".env.production": "settings",
  ".env.test": "settings",
  ".env.staging": "settings",
  ".env.example": "settings",

  // Docker
  dockerfile: "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  ".dockerignore": "docker",

  // CI/CD
  ".gitlab-ci.yml": "settings",
  jenkinsfile: "settings",
  ".travis.yml": "settings",

  // Build
  makefile: "settings",

  // Rust
  "cargo.toml": "rust",
  "cargo.lock": "rust",

  // Go
  "go.mod": "go",
  "go.sum": "go",

  // Python
  "requirements.txt": "python",
  "pipfile": "python",
  "pyproject.toml": "python",
  "setup.py": "python",
  "setup.cfg": "python",

  // Ruby
  "gemfile": "ruby",
  "rakefile": "ruby",

  // Frameworks
  "vite.config.ts": "vite",
  "vite.config.js": "vite",
  "vite.config.mjs": "vite",
  "webpack.config.js": "webpack",
  "webpack.config.ts": "webpack",
  "rollup.config.js": "settings",
  "rollup.config.ts": "settings",
  "next.config.js": "settings",
  "next.config.mjs": "settings",
  "next.config.ts": "settings",
  "nuxt.config.ts": "settings",
  "nuxt.config.js": "settings",
  "astro.config.mjs": "astro",
  "astro.config.ts": "astro",
  "svelte.config.js": "svelte",

  // Styling
  "tailwind.config.js": "tailwind",
  "tailwind.config.ts": "tailwind",
  "postcss.config.js": "settings",
  "postcss.config.ts": "settings",

  // Documentation
  license: "document",
  "license.md": "document",
  "license.txt": "document",
  readme: "markdown",
  "readme.md": "markdown",
  changelog: "document",
  "changelog.md": "document",

  // Testing
  "vitest.config.ts": "test",
  "vitest.config.js": "test",
  "jest.config.js": "test",
  "jest.config.ts": "test",
  "cypress.config.ts": "test",
  "cypress.config.js": "test",

  // Tauri
  "tauri.conf.json": "settings",

  // Database
  "schema.prisma": "prisma",
  "prisma.schema": "prisma",

  // Misc
  ".nvmrc": "nodejs",
  ".node-version": "nodejs",
  "nodemon.json": "settings",
  "vercel.json": "settings",
  "netlify.toml": "settings",
  "biome.json": "settings",
};

// ============================================================================
// Folder → Icon Mapping
// ============================================================================

const FOLDER_ICON_MAP: Record<string, string> = {
  src: "folder-src",
  lib: "folder-lib",
  dist: "folder-dist",
  build: "folder-dist",
  out: "folder-dist",
  output: "folder-dist",
  node_modules: "folder-node",
  ".git": "folder-git",
  ".github": "folder-github",
  ".vscode": "folder-vscode",
  test: "folder-test",
  tests: "folder-test",
  __tests__: "folder-test",
  spec: "folder-test",
  docs: "folder-docs",
  doc: "folder-docs",
  documentation: "folder-docs",
  public: "folder-public",
  static: "folder-public",
  assets: "folder-assets",
  images: "folder-images",
  img: "folder-images",
  icons: "folder-images",
  fonts: "folder-fonts",
  styles: "folder-css",
  css: "folder-css",
  components: "folder-components",
  hooks: "folder-hooks",
  utils: "folder-utils",
  helpers: "folder-utils",
  config: "folder-config",
  scripts: "folder-scripts",
  api: "folder-api",
  routes: "folder-routes",
  pages: "folder-pages",
  views: "folder-views",
  layouts: "folder-layouts",
  types: "folder-types",
  interfaces: "folder-types",
  models: "folder-database",
  migrations: "folder-database",
  middleware: "folder-middleware",
  services: "folder-services",
  store: "folder-store",
  stores: "folder-store",
  context: "folder-context",
  providers: "folder-context",
  i18n: "folder-i18n",
  locales: "folder-i18n",
  translations: "folder-i18n",
  vendor: "folder-vendor",
  target: "folder-dist",
  ".cargo": "folder-config",
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the icon identifier for a file based on its name.
 * Checks exact filename matches first, then falls back to extension-based lookup.
 * Handles case-insensitive matching, dotfiles, and special filenames.
 */
export function getFileIcon(filename: string): string {
  const lowerName = filename.toLowerCase();

  // Check exact filename match (case-insensitive)
  const filenameMatch = FILENAME_ICON_MAP[lowerName];
  if (filenameMatch) {
    return filenameMatch;
  }

  // Check extension-based match
  const lastDot = lowerName.lastIndexOf(".");
  if (lastDot !== -1) {
    const ext = lowerName.slice(lastDot + 1);
    const extMatch = EXTENSION_ICON_MAP[ext];
    if (extMatch) {
      return extMatch;
    }
  }

  // For dotfiles without a recognized extension (e.g., ".npmrc"), try the name without leading dot
  if (lowerName.startsWith(".") && lastDot === 0) {
    const withoutDot = lowerName.slice(1);
    const dotfileMatch = EXTENSION_ICON_MAP[withoutDot];
    if (dotfileMatch) {
      return dotfileMatch;
    }
  }

  return "file";
}

/**
 * Get the icon identifier for a folder based on its name.
 */
export function getFolderIcon(folderName: string): string {
  const lowerName = folderName.toLowerCase();
  return FOLDER_ICON_MAP[lowerName] ?? "folder";
}

/**
 * Get the programming language identifier for a file based on its extension.
 * Returns "plaintext" if no language mapping is found.
 */
export function getLanguageFromFilename(filename: string): string {
  const lowerName = filename.toLowerCase();
  const lastDot = lowerName.lastIndexOf(".");
  if (lastDot === -1) {
    return "plaintext";
  }

  const ext = lowerName.slice(lastDot + 1);

  const LANGUAGE_MAP: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    mjs: "javascript",
    cjs: "javascript",
    mts: "typescript",
    cts: "typescript",
    json: "json",
    jsonc: "jsonc",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    md: "markdown",
    mdx: "mdx",
    rs: "rust",
    go: "go",
    py: "python",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cxx: "cpp",
    cc: "cpp",
    hpp: "cpp",
    hxx: "cpp",
    cs: "csharp",
    php: "php",
    sh: "shellscript",
    bash: "shellscript",
    zsh: "shellscript",
    fish: "shellscript",
    ps1: "powershell",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    svg: "xml",
    lua: "lua",
    r: "r",
    dart: "dart",
    scala: "scala",
    zig: "zig",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    dockerfile: "dockerfile",
    makefile: "makefile",
    tex: "latex",
    graphql: "graphql",
    gql: "graphql",
    prisma: "prisma",
    proto: "protobuf",
    nim: "nim",
    nix: "nix",
    ml: "ocaml",
    mli: "ocaml",
    fs: "fsharp",
    fsx: "fsharp",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    clj: "clojure",
    cljs: "clojurescript",
    jl: "julia",
    pl: "perl",
    sol: "solidity",
    tf: "terraform",
  };

  return LANGUAGE_MAP[ext] ?? "plaintext";
}
