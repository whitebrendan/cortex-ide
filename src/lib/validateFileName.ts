/**
 * File Name Validation Utility
 *
 * Validates file and folder names for the file explorer.
 * Checks for empty names, invalid characters, path traversal,
 * Windows reserved names, and duplicate siblings.
 *
 * Pure TypeScript — no framework dependencies.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const INVALID_CHARS = /[/\\:*?"<>|]/;

const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com0",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt0",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function validateFileName(
  newName: string,
  siblings: string[],
): ValidationResult {
  if (!newName || newName.trim().length === 0) {
    return { valid: false, error: "A file or folder name must be provided." };
  }

  if (newName === ".." || newName.includes("../") || newName.includes("..\\")) {
    return {
      valid: false,
      error: "The name contains a path traversal sequence (..) which is not allowed.",
    };
  }

  const match = newName.match(INVALID_CHARS);
  if (match) {
    return {
      valid: false,
      error: `The name "${newName}" contains an invalid character: "${match[0]}". Avoid / \\ : * ? " < > |`,
    };
  }

  if (newName.endsWith(".") || newName.endsWith(" ")) {
    return {
      valid: false,
      error: "File names must not end with a dot or a space.",
    };
  }

  const baseName = newName.includes(".") ? newName.slice(0, newName.indexOf(".")) : newName;
  if (WINDOWS_RESERVED_NAMES.has(baseName.toLowerCase())) {
    return {
      valid: false,
      error: `The name "${newName}" is reserved. Avoid names like CON, PRN, AUX, NUL, COM0–COM9, LPT0–LPT9.`,
    };
  }

  const lowerName = newName.toLowerCase();
  const duplicate = siblings.some((s) => s.toLowerCase() === lowerName);
  if (duplicate) {
    return {
      valid: false,
      error: `A file or folder "${newName}" already exists at this location. Choose a different name.`,
    };
  }

  return { valid: true };
}
