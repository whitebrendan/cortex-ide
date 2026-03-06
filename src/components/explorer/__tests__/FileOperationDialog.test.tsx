import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { FileOperationDialog } from "../FileOperationDialog";
import type { FileOperationDialogState } from "../types";

const createDeleteState = (overrides: Partial<FileOperationDialogState> = {}): FileOperationDialogState => ({
  mode: "confirm-delete",
  targetName: "notes.md",
  targetPaths: ["/workspace/notes.md"],
  itemCount: 1,
  existingNames: [],
  parentPath: "/workspace",
  ...overrides,
});

describe("FileOperationDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("names the target item for single delete confirmation", () => {
    render(() => (
      <FileOperationDialog
        state={createDeleteState()}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
        onCreateItem={vi.fn()}
      />
    ));

    vi.runAllTimers();

    expect(screen.getByText(/notes\.md/)).toBeTruthy();
    expect(screen.getByText("Delete File")).toBeTruthy();
  });

  it("names the item count for multi-delete confirmation", () => {
    render(() => (
      <FileOperationDialog
        state={createDeleteState({
          targetName: "unused",
          targetPaths: ["/workspace/a.ts", "/workspace/b.ts", "/workspace/c.ts"],
          itemCount: 3,
        })}
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
        onCreateItem={vi.fn()}
      />
    ));

    vi.runAllTimers();

    expect(screen.getByText("Delete 3 Items")).toBeTruthy();
    expect(screen.getByText(/3 items/)).toBeTruthy();
  });

  it("does not delete when cancel is clicked", async () => {
    const onClose = vi.fn();
    const onConfirmDelete = vi.fn();

    render(() => (
      <FileOperationDialog
        state={createDeleteState()}
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
        onCreateItem={vi.fn()}
      />
    ));

    vi.runAllTimers();

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirmDelete).not.toHaveBeenCalled();
  });

  it("does not delete when the close button or Escape is used", async () => {
    const onClose = vi.fn();
    const onConfirmDelete = vi.fn();

    render(() => (
      <FileOperationDialog
        state={createDeleteState()}
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
        onCreateItem={vi.fn()}
      />
    ));

    vi.runAllTimers();

    await fireEvent.click(screen.getByLabelText("Close modal"));
    const dialog = document.body.querySelector("[role='dialog']") as HTMLElement;
    await fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirmDelete).not.toHaveBeenCalled();
  });

  it("ignores backdrop clicks so they remain mutation-free", async () => {
    const onClose = vi.fn();
    const onConfirmDelete = vi.fn();

    render(() => (
      <FileOperationDialog
        state={createDeleteState()}
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
        onCreateItem={vi.fn()}
      />
    ));

    vi.runAllTimers();

    const dialog = document.body.querySelector("[role='dialog']") as HTMLElement;
    await fireEvent.click(dialog);

    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirmDelete).not.toHaveBeenCalled();
  });

  it("only deletes on explicit Delete confirmation", async () => {
    const onConfirmDelete = vi.fn();

    render(() => (
      <FileOperationDialog
        state={createDeleteState()}
        onClose={vi.fn()}
        onConfirmDelete={onConfirmDelete}
        onCreateItem={vi.fn()}
      />
    ));

    vi.runAllTimers();

    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });
});
