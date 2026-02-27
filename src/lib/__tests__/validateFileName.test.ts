import { describe, it, expect } from "vitest";
import { validateFileName } from "../validateFileName";

describe("validateFileName", () => {
  describe("empty names", () => {
    it("rejects an empty string", () => {
      const result = validateFileName("", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be provided");
    });

    it("rejects a whitespace-only string", () => {
      const result = validateFileName("   ", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be provided");
    });
  });

  describe("invalid characters", () => {
    const invalidChars = ["/", "\\", ":", "*", "?", '"', "<", ">", "|"];

    for (const ch of invalidChars) {
      it(`rejects name containing "${ch}"`, () => {
        const result = validateFileName(`file${ch}name`, []);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("invalid character");
      });
    }
  });

  describe("path traversal", () => {
    it("rejects bare '..'", () => {
      const result = validateFileName("..", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("path traversal");
    });

    it("rejects '../' prefix", () => {
      const result = validateFileName("../etc", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("path traversal");
    });

    it("rejects '..\\' prefix", () => {
      const result = validateFileName("..\\etc", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("path traversal");
    });
  });

  describe("trailing dot or space", () => {
    it("rejects name ending with a dot", () => {
      const result = validateFileName("file.", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("dot or a space");
    });

    it("rejects name ending with a space", () => {
      const result = validateFileName("file ", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("dot or a space");
    });
  });

  describe("Windows reserved names", () => {
    const reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT0", "LPT3"];

    for (const name of reserved) {
      it(`rejects "${name}" (case-insensitive)`, () => {
        const result = validateFileName(name.toLowerCase(), []);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("reserved");
      });
    }

    it("rejects reserved name with extension", () => {
      const result = validateFileName("con.txt", []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reserved");
    });

    it("allows names that contain but are not reserved words", () => {
      const result = validateFileName("console", []);
      expect(result.valid).toBe(true);
    });
  });

  describe("duplicate siblings (case-insensitive)", () => {
    it("rejects exact duplicate", () => {
      const result = validateFileName("README.md", ["README.md", "src"]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("rejects case-insensitive duplicate", () => {
      const result = validateFileName("readme.MD", ["README.md", "src"]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("allows name not in siblings", () => {
      const result = validateFileName("newfile.ts", ["README.md", "src"]);
      expect(result.valid).toBe(true);
    });
  });

  describe("valid names", () => {
    const validNames = [
      "file.txt",
      ".gitignore",
      "my-component.tsx",
      "data_2024.json",
      "package.json",
      "Dockerfile",
      "名前.txt",
    ];

    for (const name of validNames) {
      it(`accepts "${name}"`, () => {
        const result = validateFileName(name, []);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    }
  });
});
