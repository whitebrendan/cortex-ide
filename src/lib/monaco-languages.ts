/**
 * Monaco Editor language configuration registry.
 *
 * Provides a single source of truth for mapping file extensions and
 * filenames to Monaco language identifiers.  Consolidates the various
 * language maps scattered across the codebase (`LANGUAGE_MAP` in
 * `EditorTypes.ts`, `detectLanguage` in `languageDetection.ts`, etc.)
 * into one authoritative module.
 */

// ============================================================================
// Types
// ============================================================================

export interface LanguageConfig {
  /** Monaco language identifier (used with `monaco.editor.setModelLanguage`). */
  monacoId: string;
  /** Human-readable display name. */
  displayName: string;
  /** File extensions **without** the leading dot (e.g. `"ts"`, `"tsx"`). */
  extensions: readonly string[];
  /** Optional aliases used for lookups. */
  aliases?: readonly string[];
}

// ============================================================================
// Language registry
// ============================================================================

/**
 * Comprehensive language configuration list.
 *
 * Each entry maps a set of file extensions to the Monaco language id that
 * should be used for syntax highlighting and IntelliSense.
 */
export const LANGUAGE_CONFIGS: readonly LanguageConfig[] = [
  {
    monacoId: "typescript",
    displayName: "TypeScript",
    extensions: ["ts", "tsx", "mts", "cts"],
    aliases: ["typescript", "ts"],
  },
  {
    monacoId: "javascript",
    displayName: "JavaScript",
    extensions: ["js", "jsx", "mjs", "cjs"],
    aliases: ["javascript", "js"],
  },
  {
    monacoId: "html",
    displayName: "HTML",
    extensions: ["html", "htm", "xhtml"],
    aliases: ["html"],
  },
  {
    monacoId: "css",
    displayName: "CSS",
    extensions: ["css"],
    aliases: ["css"],
  },
  {
    monacoId: "scss",
    displayName: "SCSS",
    extensions: ["scss"],
    aliases: ["scss"],
  },
  {
    monacoId: "less",
    displayName: "Less",
    extensions: ["less"],
    aliases: ["less"],
  },
  {
    monacoId: "json",
    displayName: "JSON",
    extensions: ["json", "jsonc", "json5"],
    aliases: ["json"],
  },
  {
    monacoId: "yaml",
    displayName: "YAML",
    extensions: ["yaml", "yml"],
    aliases: ["yaml", "yml"],
  },
  {
    monacoId: "xml",
    displayName: "XML",
    extensions: ["xml", "svg", "xsl", "xsd"],
    aliases: ["xml"],
  },
  {
    monacoId: "markdown",
    displayName: "Markdown",
    extensions: ["md", "mdx", "markdown"],
    aliases: ["markdown", "md"],
  },
  {
    monacoId: "python",
    displayName: "Python",
    extensions: ["py", "pyw", "pyi"],
    aliases: ["python", "py"],
  },
  {
    monacoId: "rust",
    displayName: "Rust",
    extensions: ["rs"],
    aliases: ["rust", "rs"],
  },
  {
    monacoId: "go",
    displayName: "Go",
    extensions: ["go"],
    aliases: ["go", "golang"],
  },
  {
    monacoId: "java",
    displayName: "Java",
    extensions: ["java"],
    aliases: ["java"],
  },
  {
    monacoId: "kotlin",
    displayName: "Kotlin",
    extensions: ["kt", "kts"],
    aliases: ["kotlin", "kt"],
  },
  {
    monacoId: "swift",
    displayName: "Swift",
    extensions: ["swift"],
    aliases: ["swift"],
  },
  {
    monacoId: "csharp",
    displayName: "C#",
    extensions: ["cs"],
    aliases: ["csharp", "cs"],
  },
  {
    monacoId: "cpp",
    displayName: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hxx"],
    aliases: ["cpp", "c++"],
  },
  {
    monacoId: "c",
    displayName: "C",
    extensions: ["c", "h"],
    aliases: ["c"],
  },
  {
    monacoId: "ruby",
    displayName: "Ruby",
    extensions: ["rb", "erb"],
    aliases: ["ruby", "rb"],
  },
  {
    monacoId: "php",
    displayName: "PHP",
    extensions: ["php"],
    aliases: ["php"],
  },
  {
    monacoId: "scala",
    displayName: "Scala",
    extensions: ["scala", "sc"],
    aliases: ["scala"],
  },
  {
    monacoId: "shell",
    displayName: "Shell",
    extensions: ["sh", "bash", "zsh", "fish"],
    aliases: ["shell", "bash", "sh"],
  },
  {
    monacoId: "powershell",
    displayName: "PowerShell",
    extensions: ["ps1", "psm1", "psd1"],
    aliases: ["powershell", "ps1"],
  },
  {
    monacoId: "bat",
    displayName: "Batch",
    extensions: ["bat", "cmd"],
    aliases: ["bat", "batch"],
  },
  {
    monacoId: "sql",
    displayName: "SQL",
    extensions: ["sql", "mysql", "pgsql", "sqlite"],
    aliases: ["sql"],
  },
  {
    monacoId: "dockerfile",
    displayName: "Dockerfile",
    extensions: ["dockerfile"],
    aliases: ["dockerfile", "docker"],
  },
  {
    monacoId: "ini",
    displayName: "INI / TOML",
    extensions: ["toml", "ini", "cfg", "conf", "editorconfig"],
    aliases: ["ini", "toml"],
  },
  {
    monacoId: "graphql",
    displayName: "GraphQL",
    extensions: ["graphql", "gql"],
    aliases: ["graphql", "gql"],
  },
  {
    monacoId: "lua",
    displayName: "Lua",
    extensions: ["lua"],
    aliases: ["lua"],
  },
  {
    monacoId: "r",
    displayName: "R",
    extensions: ["r", "rmd"],
    aliases: ["r"],
  },
  {
    monacoId: "dart",
    displayName: "Dart",
    extensions: ["dart"],
    aliases: ["dart"],
  },
  {
    monacoId: "plaintext",
    displayName: "Plain Text",
    extensions: ["txt", "log", "text"],
    aliases: ["plaintext", "text"],
  },
] as const;

// ============================================================================
// Pre-built lookup tables (computed once at module load)
// ============================================================================

/** Extension → Monaco language id (e.g. `"ts"` → `"typescript"`). */
const extensionIndex: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const cfg of LANGUAGE_CONFIGS) {
    for (const ext of cfg.extensions) {
      map.set(ext.toLowerCase(), cfg.monacoId);
    }
  }
  return map;
})();

/** Alias → Monaco language id. */
const aliasIndex: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const cfg of LANGUAGE_CONFIGS) {
    map.set(cfg.monacoId, cfg.monacoId);
    if (cfg.aliases) {
      for (const alias of cfg.aliases) {
        map.set(alias.toLowerCase(), cfg.monacoId);
      }
    }
  }
  return map;
})();

// ============================================================================
// Special filename mappings
// ============================================================================

const FILENAME_MAP: ReadonlyMap<string, string> = new Map([
  ["dockerfile", "dockerfile"],
  ["makefile", "shell"],
  ["gnumakefile", "shell"],
  [".gitignore", "ini"],
  [".gitattributes", "ini"],
  [".dockerignore", "ini"],
  [".editorconfig", "ini"],
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve a Monaco language id from a file extension (without leading dot).
 *
 * Returns `"plaintext"` when no match is found.
 *
 * ```ts
 * getLanguageByExtension("tsx"); // "typescript"
 * getLanguageByExtension("rs");  // "rust"
 * ```
 */
export function getLanguageByExtension(ext: string): string {
  return extensionIndex.get(ext.toLowerCase()) ?? "plaintext";
}

/**
 * Resolve a Monaco language id from a filename or path.
 *
 * Handles special filenames (e.g. `Dockerfile`, `Makefile`, `.env.*`) and
 * falls back to extension-based detection.
 *
 * ```ts
 * getMonacoLanguageId("app.tsx");      // "typescript"
 * getMonacoLanguageId("Dockerfile");   // "dockerfile"
 * getMonacoLanguageId(".env.local");   // "ini"
 * ```
 */
export function getMonacoLanguageId(filenameOrPath: string): string {
  const basename = filenameOrPath.split(/[/\\]/).pop()?.toLowerCase() ?? "";

  // Check exact filename matches first
  const filenameMatch = FILENAME_MAP.get(basename);
  if (filenameMatch) return filenameMatch;

  // Check prefix patterns
  if (basename.startsWith("dockerfile")) return "dockerfile";
  if (basename.startsWith(".env")) return "ini";

  // Fall back to extension-based lookup
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = basename.slice(dotIdx + 1);
    return getLanguageByExtension(ext);
  }

  return "plaintext";
}

/**
 * Normalise an application-level language name (e.g. the value stored in
 * `OpenFile.language`) to a Monaco language identifier.
 *
 * The existing `LANGUAGE_MAP` in `EditorTypes.ts` performs a similar role;
 * this function extends it with alias resolution so that callers don't need
 * to maintain a separate mapping table.
 *
 * ```ts
 * resolveMonacoLanguage("typescript"); // "typescript"
 * resolveMonacoLanguage("rust");       // "rust"
 * resolveMonacoLanguage("unknown");    // "plaintext"
 * ```
 */
export function resolveMonacoLanguage(languageName: string): string {
  return aliasIndex.get(languageName.toLowerCase()) ?? "plaintext";
}

/**
 * Look up the full {@link LanguageConfig} for a given Monaco language id.
 *
 * Returns `undefined` when no configuration exists for the id.
 */
export function getLanguageConfig(
  monacoId: string,
): LanguageConfig | undefined {
  return LANGUAGE_CONFIGS.find((c) => c.monacoId === monacoId);
}
