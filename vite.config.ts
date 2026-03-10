import { defineConfig, type UserConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

// Check if we're running bundle analysis
const isAnalyze = process.env.ANALYZE === "true";

const host = process.env.TAURI_DEV_HOST;

/**
 * Manual chunk configuration for optimal code splitting.
 * Separates large dependencies into individual chunks for better caching
 * and parallel loading.
 *
 * Chunk strategy:
 * - Heavy vendor libs (monaco, xterm, shiki) get their own chunks for lazy loading
 * - Framework code (solid, tauri) is split for long-term caching
 * - App source contexts are split so they load after first paint
 * - Small remaining node_modules fall into vendor-common
 */
function createManualChunks(id: string): string | undefined {
  // ===========================================================================
  // SOURCE CODE SPLITTING - Split heavy app modules for lazy loading
  // ===========================================================================
  
  // Extension host system - ~590KB, loaded lazily when extensions are activated
  if (id.includes("/extension-host/") && !id.includes("node_modules")) {
    return "app-extension-host";
  }
  
  // Heavy context providers - defer loading to after first paint
  if (id.includes("/context/DebugContext") && !id.includes("node_modules")) {
    return "app-context-debug";
  }
  if (id.includes("/context/TasksContext") && !id.includes("node_modules")) {
    return "app-context-tasks";
  }
  if (id.includes("/context/TerminalsContext") && !id.includes("node_modules")) {
    return "app-context-terminals";
  }
  if (id.includes("/context/TestingContext") && !id.includes("node_modules")) {
    return "app-context-testing";
  }
  if (id.includes("/context/LSPContext") && !id.includes("node_modules")) {
    return "app-context-lsp";
  }
  if (id.includes("/context/ExtensionsContext") && !id.includes("node_modules")) {
    return "app-context-extensions";
  }
  
  // ===========================================================================
  // VENDOR SPLITTING - External dependencies
  // ===========================================================================
  
  // Monaco Editor - Large library (~2.6MB), separate chunk for on-demand loading
  // Loaded lazily via dynamic import() in monacoManager.ts
  if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
    return "vendor-monaco";
  }

  // Xterm terminal - Split for progressive loading
  if (id.includes("@xterm/xterm")) {
    return "vendor-xterm-core";
  }
  if (id.includes("@xterm/addon-webgl")) {
    return "vendor-xterm-webgl";
  }
  if (id.includes("@xterm/addon")) {
    return "vendor-xterm-addons";
  }

  // Shiki syntax highlighter - Split into core + languages for better lazy loading
  if (id.includes("shiki")) {
    // Shiki WASM engine - load separately (required for highlighting)
    if (id.includes("onig.wasm") || id.includes("/wasm")) {
      return "vendor-shiki-wasm";
    }
    // Shiki themes - only github-dark is used, but bundle includes others
    if (id.includes("/themes/")) {
      return "vendor-shiki-themes";
    }
    // Shiki languages - split by usage frequency
    if (id.includes("/langs/")) {
      // High priority: JS/TS ecosystem (most common in IDE)
      if (id.match(/\/(javascript|typescript|jsx|tsx|json)\./)) {
        return "vendor-shiki-lang-js";
      }
      // Web languages
      if (id.match(/\/(html|css|scss|markdown|xml)\./)) {
        return "vendor-shiki-lang-web";
      }
      // Scripting languages
      if (id.match(/\/(python|ruby|php|bash|shell)\./)) {
        return "vendor-shiki-lang-script";
      }
      // Systems languages
      if (id.match(/\/(rust|go|c|cpp|java|kotlin|swift)\./)) {
        return "vendor-shiki-lang-systems";
      }
      // Everything else - rarely used
      return "vendor-shiki-lang-other";
    }
    // Core shiki engine
    return "vendor-shiki-core";
  }

  // Emmet abbreviation engine (~1.1MB source) - only needed when editing HTML/JSX
  if (id.includes("node_modules/emmet") || id.includes("node_modules/@emmetio")) {
    return "vendor-emmet";
  }

  // Marked markdown parser
  if (id.includes("marked")) {
    return "vendor-marked";
  }

  // Kobalte UI components (headless component library)
  if (id.includes("@kobalte")) {
    return "vendor-kobalte";
  }

  // Solid.js ecosystem (core + router + primitives)
  if (
    id.includes("solid-js") ||
    id.includes("@solidjs/router") ||
    id.includes("@solid-primitives")
  ) {
    return "vendor-solid";
  }

  // Zustand state management + Immer
  if (
    id.includes("node_modules/zustand") ||
    id.includes("node_modules/solid-zustand") ||
    id.includes("node_modules/immer")
  ) {
    return "vendor-zustand";
  }

  // Tauri plugins - Group all Tauri-related code
  if (id.includes("@tauri-apps")) {
    return "vendor-tauri";
  }

  // Diff library
  if (id.includes("node_modules/diff")) {
    return "vendor-diff";
  }

  // Generic node_modules fallback (small remaining dependencies)
  if (id.includes("node_modules")) {
    return "vendor-common";
  }

  return undefined;
}

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const isProd = command === "build";

  return {
    plugins: [
      solid({
        hot: true,
        ssr: false,
        include: [
          /\.tsx$/,
          /\.jsx$/,
        ],
        solid: {
          omitNestedClosingTags: true,
          delegateEvents: true,
          wrapConditionals: true,
          generate: "dom",
          hydratable: false,
        },
      }),
      tailwindcss(),
      // Bundle analyzer - only in analyze mode
      isAnalyze && visualizer({
        open: true,
        filename: "dist/bundle-stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Optimize module resolution
      dedupe: ["solid-js", "@solidjs/router"],
    },

    // Dependency optimization for dev server
    optimizeDeps: {
      include: [
        // SolidJS core
        "solid-js",
        "solid-js/store",
        "solid-js/web",
        "@solidjs/router",
        // Tauri IPC (used on every page)
        "@tauri-apps/api/core",
        "@tauri-apps/api/event",
        "@tauri-apps/plugin-dialog",
        "@tauri-apps/plugin-clipboard-manager",
        "@tauri-apps/plugin-shell",
        "@tauri-apps/plugin-os",
        // Large libs that benefit from pre-bundling (many internal modules)
        "monaco-editor",
        "shiki",
        "emmet",
        "@xterm/xterm",
        // Utilities
        "marked",
        "diff",
      ],
      esbuildOptions: {
        target: "es2022",
        treeShaking: true,
        minify: true,
        keepNames: true,
      },
      noDiscovery: false,
      holdUntilCrawlEnd: true,
    },

    // Build configuration
    build: {
      minify: "esbuild",
      // Tauri v2 WebViews: macOS Safari 15+, Windows Edge/Chromium 91+, Linux WebKitGTK 2.36+
      target: "es2022",
      // Source maps only during development builds; disabled for production
      sourcemap: isProd ? false : "inline",
      cssCodeSplit: true,
      // Monaco + workers are inherently large; suppress noise
      chunkSizeWarningLimit: 1500,
      // Prevent heavy lazy chunks from being preloaded before first paint
      modulePreload: {
        resolveDependencies: (_filename, deps) => {
          const heavyChunks = [
            'app-context-debug',
            'app-context-tasks', 
            'app-context-terminals',
            'app-context-testing',
            'app-context-lsp',
            'app-context-extensions',
            'app-extension-host',
            'AppCore',
            'EditorPanel',
            'vendor-monaco',
            'vendor-emmet',
            'vendor-shiki',
            'vendor-xterm',
          ];
          return deps.filter(dep => 
            !heavyChunks.some(chunk => dep.includes(chunk))
          );
        },
      },
      rollupOptions: {
        output: {
          manualChunks: createManualChunks,
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          compact: true,
          preserveModules: false,
          hoistTransitiveImports: true,
        },
        treeshake: {
          moduleSideEffects: (id) => {
            if (id.endsWith(".css")) return true;
            if (id.includes("@tauri-apps")) return true;
            return false;
          },
          propertyReadSideEffects: false,
          annotations: true,
        },
      },
      reportCompressedSize: false,
    },

    // CSS configuration
    css: {
      modules: {
        generateScopedName: "[hash:base64:8]",
        scopeBehaviour: "local",
      },
      devSourcemap: true,
    },

    // Esbuild configuration
    esbuild: {
      drop: isProd ? ["console", "debugger"] : [],
      target: "es2022",
      treeShaking: true,
      legalComments: "none",
    },

    clearScreen: false,

    // Development server configuration
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      fs: {
        strict: true,
      },
      watch: {
        ignored: ["**/src-tauri/**"],
      },
      warmup: {
        clientFiles: [
          "./src/index.tsx",
          "./src/AppShell.tsx",
          "./src/AppCore.tsx",
          "./src/pages/Home.tsx",
          "./src/pages/Session.tsx",
          "./src/components/MenuBar.tsx",
          "./src/components/cortex/CortexDesktopLayout.tsx",
          "./src/context/OptimizedProviders.tsx",
          "./src/context/I18nContext.tsx",
          "./src/context/ThemeContext.tsx",
          "./src/context/CortexColorThemeContext.tsx",
          "./src/context/ToastContext.tsx",
          "./src/context/SettingsContext.tsx",
          "./src/context/WindowsContext.tsx",
          "./src/context/LayoutContext.tsx",
          "./src/context/SDKContext.tsx",
          "./src/context/SessionContext.tsx",
          "./src/context/EditorContext.tsx",
          "./src/context/WorkspaceContext.tsx",
          "./src/context/CommandContext.tsx",
          "./src/context/KeymapContext.tsx",
          "./src/design-system/tokens/index.ts",
          "./src/design-system/primitives/Flex.tsx",
        ],
      },
      preTransformRequests: true,
    },

    // Preview server (for testing production builds)
    preview: {
      port: 1421,
      strictPort: true,
      host: host || false,
    },

    // Worker configuration for web workers
    worker: {
      format: "es",
      rollupOptions: {
        output: {
          entryFileNames: "assets/worker-[name]-[hash].js",
        },
      },
    },

    // JSON handling optimization
    json: {
      namedExports: true,
      stringify: true,
    },

    // Define global constants (dead code elimination)
    define: {
      __DEV__: JSON.stringify(!isProd),
      __VERSION__: JSON.stringify(process.env.npm_package_version || "0.1.0"),
    },
  };
});