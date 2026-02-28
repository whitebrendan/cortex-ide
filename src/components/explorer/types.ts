/**
 * File Explorer Types & Constants
 *
 * Shared types, interfaces, and constants used across
 * the file explorer sub-components.
 */

import type { GitFileStatus } from "@/context/MultiRepoContext";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isHidden: boolean;
  isSymlink: boolean;
  size?: number;
  modifiedAt?: number;
  extension?: string;
  children?: FileEntry[];
}

export interface CompactedFileEntry extends FileEntry {
  compactedName?: string;
  compactedPaths?: string[];
}

export interface FileExplorerProps {
  rootPath?: string | null;
  onFileSelect?: (path: string) => void;
  onFilePreview?: (path: string) => void;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  entry: FlattenedItem | null;
}

export interface ClipboardState {
  paths: string[];
  operation: "cut" | "copy";
}

export interface FlattenedItem {
  id: string;
  entry: CompactedFileEntry;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  hasChildren: boolean;
  parentPath: string | null;
  isNestedParent: boolean;
  nestedFiles?: FileEntry[];
  isNestedExpanded?: boolean;
}

export interface GitDecoration {
  nameClass: string;
  badge?: string;
  badgeClass?: string;
  status:
    | GitFileStatus
    | "folder-modified"
    | "folder-added"
    | "folder-conflict"
    | null;
}

export interface NestedFileGroup {
  parent: FileEntry;
  nestedFiles: FileEntry[];
}

export interface VirtualItemProps {
  item: FlattenedItem;
  isSelected: boolean;
  focusedPath: string | null;
  renamingPath: string | null;
  dragOverPath: string | null;
  isDragCopy: boolean;
  isCut: boolean;
  gitDecoration?: GitDecoration;
  indentGuidesEnabled: boolean;
  enablePreview: boolean;
  isEntering: boolean;
  onSelect: (path: string, event?: MouseEvent) => void;
  onOpen: (entry: FileEntry) => void;
  onOpenPreview: (entry: FileEntry) => void;
  onToggleExpand: (path: string, additionalPaths?: string[]) => void;
  onToggleNestedExpand: (path: string) => void;
  onContextMenu: (e: MouseEvent, item: FlattenedItem) => void;
  onRename: (oldPath: string, newName: string) => void;
  validateRename: (oldPath: string, newName: string) => string | null;
  onDragStart: (e: DragEvent, entry: FileEntry) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, entry: FileEntry) => void;
  onDrop: (e: DragEvent, entry: FileEntry) => void;
  onFocus: (path: string) => void;
}

export interface VirtualizedFileTreeProps {
  rootPath: string;
  onFileSelect?: (path: string) => void;
  onFilePreview?: (path: string) => void;
  enablePreview: boolean;
  selectedPaths: string[];
  onSelectPaths: (paths: string[]) => void;
  showHidden: boolean;
  filterQuery: string;
  compactFolders: boolean;
  fileNestingSettings: FileNestingSettings;
  confirmDragAndDrop: boolean;
  indentGuidesEnabled: boolean;
  sortOrder: ExplorerSortOrder;
  gitStatusMap: Map<string, GitFileStatus>;
  gitFolderStatusMap: Map<
    string,
    { hasConflicts: boolean; hasAdded: boolean; hasModified: boolean }
  >;
  confirmDelete: boolean;
  enableTrash: boolean;
  maxMemoryForLargeFilesMB: number;
}

export interface DragConfirmDialogProps {
  open: boolean;
  operation: "move" | "copy";
  itemCount: number;
  targetName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface LargeFileWarningDialogProps {
  open: boolean;
  fileName: string;
  fileSizeMB: number;
  maxSizeMB: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface WorkspaceFolderHeaderProps {
  folder: WorkspaceFolder;
  isExpanded: boolean;
  isActive: boolean;
  folderIndex: number;
  totalFolders: number;
  onToggle: () => void;
  onRemove: () => void;
  onSetActive: () => void;
  onRename: (name: string) => void;
  onSetColor: (color: string | undefined) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
}

// Re-export types used from external modules for convenience
import type {
  FileNestingSettings,
  FileNestingPatterns,
  ExplorerSortOrder,
} from "@/context/SettingsContext";
import type { WorkspaceFolder } from "@/context/WorkspaceContext";

export type { FileNestingSettings, FileNestingPatterns, ExplorerSortOrder, WorkspaceFolder };

export type FileOperationDialogMode = "confirm-delete" | "new-file" | "new-folder";

export interface FileOperationDialogState {
  mode: FileOperationDialogMode;
  targetName: string;
  targetPaths: string[];
  itemCount: number;
  existingNames: string[];
  parentPath: string;
}

export interface FileOperationDialogProps {
  state: FileOperationDialogState | null;
  onClose: () => void;
  onConfirmDelete: () => void;
  onCreateItem: (name: string) => void;
}

// Constants
export const ITEM_HEIGHT = 20;
export const OVERSCAN = 10;
export const DEBOUNCE_DELAY = 100;
export const LAZY_LOAD_DEPTH = 1;
export const TREE_INDENT_SIZE = 26;
export const TREE_BASE_PADDING = 0;
