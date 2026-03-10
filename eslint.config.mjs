import globals from "globals";
import solid from "eslint-plugin-solid";
import tseslint from "typescript-eslint";

const focusedTestRule = [
  "error",
  {
    object: "describe",
    property: "only",
    message: "Remove focused tests before committing.",
  },
  {
    object: "it",
    property: "only",
    message: "Remove focused tests before committing.",
  },
  {
    object: "test",
    property: "only",
    message: "Remove focused tests before committing.",
  },
];

const browserGlobals = {
  ...globals.browser,
  __DEV__: "readonly",
  __VERSION__: "readonly",
};

const nodeGlobals = {
  ...globals.node,
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/target/**",
      "**/.git/**",
      "src-tauri/**",
      "mcp-server/**",
      "assets/**",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: browserGlobals,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      solid,
    },
    rules: {
      "no-debugger": "error",
      "solid/jsx-no-script-url": "error",
      "solid/no-react-specific-props": "error",
    },
  },
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/__tests__/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: browserGlobals,
    },
    rules: {
      "no-restricted-properties": focusedTestRule,
    },
  },
  {
    files: ["vite.config.ts", "vitest.config.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: nodeGlobals,
    },
    rules: {
      "no-debugger": "error",
    },
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "no-debugger": "error",
    },
  },
];
