import type { GitFileStatus } from "@/context/MultiRepoContext";
import type {
  FileEntry,
  CompactedFileEntry,
  GitDecoration,
  NestedFileGroup,
  FileNestingSettings,
  FileNestingPatterns,
  ExplorerSortOrder,
} from "./types";

export function getGitDecorationForStatus(status: GitFileStatus | null): GitDecoration {
  if (!status) {
    return { nameClass: "", status: null };
  }

  switch (status) {
    case "modified":
      return {
        nameClass: "file-tree-name--git-modified",
        badge: "M",
        badgeClass: "file-tree-git-badge file-tree-git-badge--modified",
        status,
      };
    case "added":
      return {
        nameClass: "file-tree-name--git-added",
        badge: "A",
        badgeClass: "file-tree-git-badge file-tree-git-badge--added",
        status,
      };
    case "deleted":
      return {
        nameClass: "file-tree-name--git-deleted",
        badge: "D",
        badgeClass: "file-tree-git-badge file-tree-git-badge--deleted",
        status,
      };
    case "untracked":
      return {
        nameClass: "file-tree-name--git-untracked",
        badge: "U",
        badgeClass: "file-tree-git-badge file-tree-git-badge--untracked",
        status,
      };
    case "renamed":
      return {
        nameClass: "file-tree-name--git-renamed",
        badge: "R",
        badgeClass: "file-tree-git-badge file-tree-git-badge--renamed",
        status,
      };
    case "conflict":
      return {
        nameClass: "file-tree-name--git-conflict",
        badge: "!",
        badgeClass: "file-tree-git-badge file-tree-git-badge--conflict",
        status,
      };
    default:
      return { nameClass: "", status: null };
  }
}

export function getFolderDecoration(
  hasConflicts: boolean,
  hasAdded: boolean,
  hasModified: boolean
): GitDecoration {
  if (hasConflicts) {
    return {
      nameClass: "file-tree-name--git-folder-conflict",
      status: "folder-conflict",
    };
  }
  if (hasAdded) {
    return {
      nameClass: "file-tree-name--git-folder-added",
      status: "folder-added",
    };
  }
  if (hasModified) {
    return {
      nameClass: "file-tree-name--git-folder-modified",
      status: "folder-modified",
    };
  }
  return { nameClass: "", status: null };
}

function matchesNestingGlob(filename: string, pattern: string): boolean {
  const lowerFilename = filename.toLowerCase();
  const lowerPattern = pattern.toLowerCase().trim();
  if (lowerFilename === lowerPattern) return true;
  let regexPattern = lowerPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp(`^${regexPattern}$`, "i").test(lowerFilename);
  } catch {
    return false;
  }
}

function extractBasename(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

function isNestedFile(parentName: string, childName: string, patterns: string): boolean {
  const parentBase = extractBasename(parentName);
  for (const pattern of patterns.split(",").map((p) => p.trim()).filter(Boolean)) {
    const expanded = pattern.replace(/\$\{basename\}/gi, parentBase);
    if (matchesNestingGlob(childName, expanded)) return true;
  }
  return false;
}

function findNestingRule(parentName: string, patterns: FileNestingPatterns): string | null {
  for (const [pattern, nested] of Object.entries(patterns)) {
    if (matchesNestingGlob(parentName, pattern)) return nested;
  }
  return null;
}

export function computeNestedGroups(
  entries: FileEntry[],
  settings: FileNestingSettings
): { groups: Map<string, NestedFileGroup>; standalone: FileEntry[] } {
  if (!settings.enabled) {
    return { groups: new Map(), standalone: entries };
  }
  const groups = new Map<string, NestedFileGroup>();
  const nestedPaths = new Set<string>();
  const parentRules = new Map<string, string>();

  for (const e of entries) {
    if (!e.isDir) {
      const rule = findNestingRule(e.name, settings.patterns);
      if (rule) parentRules.set(e.path, rule);
    }
  }

  for (const [parentPath, rule] of parentRules) {
    const parent = entries.find((e) => e.path === parentPath);
    if (!parent) continue;
    const nested: FileEntry[] = [];
    for (const e of entries) {
      if (!e.isDir && e.path !== parentPath && isNestedFile(parent.name, e.name, rule)) {
        nested.push(e);
        nestedPaths.add(e.path);
      }
    }
    if (nested.length > 0) {
      groups.set(parentPath, {
        parent,
        nestedFiles: nested.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      });
    }
  }

  return { groups, standalone: entries.filter((e) => !nestedPaths.has(e.path)) };
}

export function sortEntries(entries: FileEntry[], sortOrder: ExplorerSortOrder = "default"): FileEntry[] {
  return [...entries].sort((a, b) => {
    switch (sortOrder) {
      case "mixed":
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      
      case "filesFirst":
        if (!a.isDir && b.isDir) return -1;
        if (a.isDir && !b.isDir) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      
      case "type":
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        if (a.isDir && b.isDir) {
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        }
        {
          const extA = a.name.includes('.') ? a.name.split('.').pop()?.toLowerCase() || '' : '';
          const extB = b.name.includes('.') ? b.name.split('.').pop()?.toLowerCase() || '' : '';
          if (extA !== extB) {
            return extA.localeCompare(extB, undefined, { sensitivity: "base" });
          }
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      
      case "modified":
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        {
          const modA = a.modifiedAt || 0;
          const modB = b.modifiedAt || 0;
          if (modA !== modB) {
            return modB - modA;
          }
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      
      case "default":
      default:
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    }
  });
}

export function filterEntries(entries: FileEntry[], query: string, showHidden: boolean): FileEntry[] {
  const queryLower = query.toLowerCase();
  return entries.filter(entry => {
    if (!showHidden && entry.isHidden) return false;
    if (!query) return true;
    return entry.name.toLowerCase().includes(queryLower);
  });
}

export function compactFolderEntries(
  entries: FileEntry[],
  compactEnabled: boolean,
  showHidden: boolean
): CompactedFileEntry[] {
  if (!compactEnabled) {
    return entries as CompactedFileEntry[];
  }
  return entries.map(entry => compactSingleEntry(entry, showHidden));
}

export function compactSingleEntry(entry: FileEntry, showHidden: boolean): CompactedFileEntry {
  if (!entry.isDir || !entry.children) {
    return entry as CompactedFileEntry;
  }

  const visibleChildren = entry.children.filter(child => 
    showHidden || !child.isHidden
  );

  if (visibleChildren.length === 1 && visibleChildren[0].isDir) {
    const singleChild = visibleChildren[0];
    const compactedChild = compactSingleEntry(singleChild, showHidden);
    const childDisplayName = compactedChild.compactedName || compactedChild.name;
    const compactedName = `${entry.name}/${childDisplayName}`;
    const compactedPaths = [entry.path];
    if (compactedChild.compactedPaths) {
      compactedPaths.push(...compactedChild.compactedPaths);
    } else {
      compactedPaths.push(compactedChild.path);
    }

    const result: CompactedFileEntry = {
      ...compactedChild,
      compactedName,
      compactedPaths,
    };

    if (compactedChild.children) {
      result.children = compactedChild.children.map(child => 
        compactSingleEntry(child, showHidden)
      );
    }

    return result;
  }

  const result: CompactedFileEntry = {
    ...entry,
    children: entry.children.map(child => compactSingleEntry(child, showHidden)),
  };

  return result;
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function extractProjectName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || parts[parts.length - 2] || "Project";
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T, 
  delay: number
): { call: (...args: Parameters<T>) => void; cancel: () => void } {
  let timeoutId: number | null = null;
  return {
    call: (...args: Parameters<T>) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        fn(...args);
        timeoutId = null;
      }, delay);
    },
    cancel: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}
