import { describe, it, expect } from "vitest";
import { getFileIcon, getFolderIcon, getFolderIconExpanded } from "../fileIcons";

describe("fileIcons", () => {
  describe("getFileIcon", () => {
    it("returns icon for TypeScript file", () => {
      const icon = getFileIcon("main.ts");
      expect(icon).toContain("/files/ts.svg");
    });

    it("returns icon for JavaScript file", () => {
      const icon = getFileIcon("index.js");
      expect(icon).toContain("/files/js.svg");
    });

    it("returns icon for JSON file", () => {
      const icon = getFileIcon("data.json");
      expect(icon).toContain("/files/brackets-yellow.svg");
    });

    it("returns specific icon for package.json", () => {
      const icon = getFileIcon("package.json");
      expect(icon).toContain("/files/node.svg");
    });

    it("returns icon for directory", () => {
      const icon = getFileIcon("src", true);
      expect(icon).toContain("/folders/");
    });

    it("returns default icon for unknown file type", () => {
      const icon = getFileIcon("unknown.xyz");
      expect(icon).toContain("/files/document.svg");
    });

    it("returns icon for dotfiles", () => {
      const icon = getFileIcon(".gitignore");
      expect(icon).toContain("/files/git.svg");
    });

    // Case-insensitive matching
    it("handles uppercase extensions", () => {
      expect(getFileIcon("MAIN.TS")).toContain("/files/ts.svg");
      expect(getFileIcon("APP.TSX")).toContain("/files/react-ts.svg");
      expect(getFileIcon("CONFIG.JSON")).toContain("/files/brackets-yellow.svg");
    });

    it("handles mixed-case filenames", () => {
      expect(getFileIcon("Dockerfile")).toContain("/files/docker.svg");
      expect(getFileIcon("Makefile")).toContain("/files/gear.svg");
      expect(getFileIcon("LICENSE")).toContain("/files/license.svg");
      expect(getFileIcon("README")).toContain("/files/markdown.svg");
      expect(getFileIcon("README.md")).toContain("/files/markdown.svg");
    });

    // All bug-reported file extensions
    it("resolves .ts files", () => {
      expect(getFileIcon("file.ts")).toContain("/files/ts.svg");
    });

    it("resolves .tsx files", () => {
      expect(getFileIcon("file.tsx")).toContain("/files/react-ts.svg");
    });

    it("resolves .md files", () => {
      expect(getFileIcon("file.md")).toContain("/files/markdown.svg");
    });

    it("resolves .rs files", () => {
      expect(getFileIcon("file.rs")).toContain("/files/rust.svg");
    });

    it("resolves .py files", () => {
      expect(getFileIcon("file.py")).toContain("/files/python.svg");
    });

    it("resolves .go files", () => {
      expect(getFileIcon("file.go")).toContain("/files/go.svg");
    });

    it("resolves .java files", () => {
      expect(getFileIcon("file.java")).toContain("/files/java.svg");
    });

    it("resolves .css files", () => {
      expect(getFileIcon("file.css")).toContain("/files/brackets-purple.svg");
    });

    it("resolves .scss files", () => {
      expect(getFileIcon("file.scss")).toContain("/files/sass.svg");
    });

    it("resolves .html files", () => {
      expect(getFileIcon("file.html")).toContain("/files/code-orange.svg");
    });

    it("resolves .yml and .yaml files", () => {
      expect(getFileIcon("file.yml")).toContain("/files/yaml.svg");
      expect(getFileIcon("file.yaml")).toContain("/files/yaml.svg");
    });

    it("resolves .toml files", () => {
      expect(getFileIcon("file.toml")).toContain("/files/gear.svg");
    });

    it("resolves .lock files", () => {
      expect(getFileIcon("file.lock")).toContain("/files/lock.svg");
    });

    it("resolves .sh and .bash files", () => {
      expect(getFileIcon("file.sh")).toContain("/files/shell.svg");
      expect(getFileIcon("file.bash")).toContain("/files/shell.svg");
    });

    it("resolves .c and .cpp files", () => {
      expect(getFileIcon("file.c")).toContain("/files/c.svg");
      expect(getFileIcon("file.cpp")).toContain("/files/cplus.svg");
    });

    it("resolves .h files", () => {
      expect(getFileIcon("file.h")).toContain("/files/h.svg");
    });

    it("resolves .rb files", () => {
      expect(getFileIcon("file.rb")).toContain("/files/ruby.svg");
    });

    it("resolves .swift files", () => {
      expect(getFileIcon("file.swift")).toContain("/files/swift.svg");
    });

    it("resolves .kt files", () => {
      expect(getFileIcon("file.kt")).toContain("/files/kotlin.svg");
    });

    it("resolves .lua files", () => {
      expect(getFileIcon("file.lua")).toContain("/files/lua.svg");
    });

    it("resolves .sql files", () => {
      expect(getFileIcon("file.sql")).toContain("/files/database.svg");
    });

    it("resolves .graphql files", () => {
      expect(getFileIcon("file.graphql")).toContain("/files/graphql.svg");
    });

    it("resolves .vue files", () => {
      expect(getFileIcon("file.vue")).toContain("/files/vue.svg");
    });

    it("resolves .svelte files", () => {
      expect(getFileIcon("file.svelte")).toContain("/files/svelte.svg");
    });

    // Dotfiles and special filenames
    it("resolves .env files", () => {
      expect(getFileIcon(".env")).toContain("/files/gear.svg");
      expect(getFileIcon(".env.local")).toContain("/files/gear.svg");
      expect(getFileIcon(".env.development")).toContain("/files/gear.svg");
      expect(getFileIcon(".env.production")).toContain("/files/gear.svg");
    });

    it("resolves .gitignore", () => {
      const icon = getFileIcon(".gitignore");
      expect(icon).toContain("/files/git.svg");
    });

    it("resolves Dockerfile", () => {
      expect(getFileIcon("Dockerfile")).toContain("/files/docker.svg");
      expect(getFileIcon("dockerfile")).toContain("/files/docker.svg");
    });

    it("resolves Makefile", () => {
      expect(getFileIcon("Makefile")).toContain("/files/gear.svg");
      expect(getFileIcon("makefile")).toContain("/files/gear.svg");
    });

    it("resolves LICENSE", () => {
      expect(getFileIcon("LICENSE")).toContain("/files/license.svg");
      expect(getFileIcon("license")).toContain("/files/license.svg");
    });

    it("resolves README", () => {
      expect(getFileIcon("README")).toContain("/files/markdown.svg");
      expect(getFileIcon("readme")).toContain("/files/markdown.svg");
      expect(getFileIcon("README.md")).toContain("/files/markdown.svg");
    });

    // Compound extensions
    it("resolves test files", () => {
      expect(getFileIcon("app.test.ts")).toContain("/files/ts-test.svg");
      expect(getFileIcon("app.spec.tsx")).toContain("/files/react-test.svg");
    });

    it("resolves .d.ts files", () => {
      expect(getFileIcon("types.d.ts")).toContain("/files/dts.svg");
    });

    // No false positives — unknown extensions get default
    it("returns default for truly unknown extensions", () => {
      expect(getFileIcon("file.zzz")).toContain("/files/document.svg");
      expect(getFileIcon("file.qwerty")).toContain("/files/document.svg");
    });
  });

  describe("getFolderIcon", () => {
    it("returns icon for src folder", () => {
      expect(getFolderIcon("src")).toContain("/folders/");
    });

    it("returns icon for node_modules", () => {
      expect(getFolderIcon("node_modules")).toContain("/folders/");
    });

    it("returns default icon for generic folder", () => {
      expect(getFolderIcon("myFolder")).toContain("/folders/folder.svg");
    });

    it("handles case-insensitive folder names", () => {
      expect(getFolderIcon("SRC")).toContain("/folders/folder-sky-code.svg");
      expect(getFolderIcon("Node_Modules")).toContain("/folders/folder-node-modules.svg");
    });
  });

  describe("getFolderIconExpanded", () => {
    it("returns expanded icon for known folder", () => {
      expect(getFolderIconExpanded("src")).toContain("/folders/");
    });

    it("returns open folder icon for unknown folder", () => {
      expect(getFolderIconExpanded("myFolder")).toContain("/folders/folder-open.svg");
    });
  });
});
