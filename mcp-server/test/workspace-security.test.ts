import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  DEFAULT_COMMAND_STREAM_MAX_BYTES,
  DEFAULT_READ_FILE_MAX_BYTES,
  DEFAULT_RESOURCE_MAX_BYTES,
  appendToBoundedText,
  createBoundedTextAccumulator,
  finalizeBoundedText,
  formatToolError,
  getWorkspaceRoots,
  readTextLines,
  readTextPreview,
  resolveSafePath,
  sanitizeUserError,
} from "../src/workspace-security.ts";

let tempRoot: string;
let workspaceRoot: string;
let outsideRoot: string;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-mcp-security-"));
  workspaceRoot = path.join(tempRoot, "workspace");
  outsideRoot = path.join(tempRoot, "outside");

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(outsideRoot, { recursive: true });
});

after(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

describe("resolveSafePath", () => {
  it("rejects parent-directory traversal outside the workspace", async () => {
    const roots = await getWorkspaceRoots(workspaceRoot);

    await assert.rejects(
      resolveSafePath("../outside/secret.txt", { roots }),
      /Access denied: path is outside the workspace/,
    );
  });

  it("rejects absolute paths outside the workspace", async () => {
    const roots = await getWorkspaceRoots(workspaceRoot);
    const outsideFile = path.join(outsideRoot, "secret.txt");

    await fs.writeFile(outsideFile, "secret", "utf8");

    await assert.rejects(
      resolveSafePath(outsideFile, { roots }),
      /Access denied: path is outside the workspace/,
    );
  });

  it("rejects symlink escapes that point outside the workspace", async () => {
    const roots = await getWorkspaceRoots(workspaceRoot);
    const outsideFile = path.join(outsideRoot, "secret.txt");
    const linkPath = path.join(workspaceRoot, "escape-link");

    await fs.writeFile(outsideFile, "secret", "utf8");
    await fs.symlink(outsideFile, linkPath);

    await assert.rejects(
      resolveSafePath(linkPath, { roots }),
      /Access denied: path is outside the workspace/,
    );
  });

  it("allows creating a missing file inside the workspace when allowMissing is true", async () => {
    const roots = await getWorkspaceRoots(workspaceRoot);
    const target = await resolveSafePath("nested/new-file.txt", { roots, allowMissing: true });

    assert.equal(target, path.join(workspaceRoot, "nested", "new-file.txt"));
  });
});

describe("readTextPreview", () => {
  it("bounds file reads to the configured byte limit and appends a truncation marker", async () => {
    const filePath = path.join(workspaceRoot, "large-preview.txt");
    const content = "x".repeat(DEFAULT_RESOURCE_MAX_BYTES + 128);

    await fs.writeFile(filePath, content, "utf8");

    const preview = await readTextPreview(filePath, { maxBytes: DEFAULT_RESOURCE_MAX_BYTES });

    assert.equal(preview.truncated, true);
    assert.match(preview.text, /\.\.\. \[truncated\]$/);
    assert.ok(Buffer.byteLength(preview.text, "utf8") <= DEFAULT_RESOURCE_MAX_BYTES);
  });
});

describe("readTextLines", () => {
  it("returns numbered lines and stops at the byte ceiling", async () => {
    const filePath = path.join(workspaceRoot, "numbered-lines.txt");
    const lines = Array.from({ length: 600 }, (_, index) => `line-${index + 1}`);

    await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");

    const result = await readTextLines(filePath, {
      startLine: 1,
      maxLines: 600,
      hardMaxLines: 600,
      maxBytes: 120,
    });

    assert.equal(result.truncated, true);
    assert.match(result.text, /^1: line-1/m);
    assert.match(result.text, /\.\.\. \[truncated\]$/);
    assert.ok(Buffer.byteLength(result.text, "utf8") <= DEFAULT_READ_FILE_MAX_BYTES);
  });

  it("respects the requested starting line when within bounds", async () => {
    const filePath = path.join(workspaceRoot, "offset-lines.txt");

    await fs.writeFile(filePath, "alpha\nbeta\ngamma\ndelta\n", "utf8");

    const result = await readTextLines(filePath, {
      startLine: 3,
      maxLines: 2,
      hardMaxLines: 10,
      maxBytes: 200,
    });

    assert.equal(result.truncated, false);
    assert.equal(result.text, "3: gamma\n4: delta");
  });
});

describe("error sanitization", () => {
  it("maps filesystem errors to stable user-safe messages", () => {
    const error = Object.assign(new Error("ENOENT: no such file or directory, open '/tmp/secrets.txt'"), {
      code: "ENOENT",
    });

    assert.equal(sanitizeUserError(error), "Path not found");
    assert.equal(formatToolError("reading file", error), "Error reading file: Path not found");
  });

  it("does not leak internal exception details for generic failures", () => {
    const error = new Error("/private/tmp/secret.txt exploded");

    assert.equal(sanitizeUserError(error), "Internal error");
    assert.equal(formatToolError("reading resource", error), "Error reading resource: Internal error");
  });
});

describe("bounded command output accumulation", () => {
  it("caps stream output and appends the truncation marker", () => {
    const accumulator = createBoundedTextAccumulator();
    const overLimit = "z".repeat(DEFAULT_COMMAND_STREAM_MAX_BYTES + 50);

    appendToBoundedText(accumulator, overLimit, DEFAULT_COMMAND_STREAM_MAX_BYTES);
    const output = finalizeBoundedText(accumulator, DEFAULT_COMMAND_STREAM_MAX_BYTES);

    assert.match(output, /\.\.\. \[truncated\]$/);
    assert.ok(Buffer.byteLength(output, "utf8") <= DEFAULT_COMMAND_STREAM_MAX_BYTES);
  });
});