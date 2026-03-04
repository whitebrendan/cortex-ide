import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { SearchResultItem } from "../SearchResultItem";

describe("SearchResultItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const baseProps = {
    file: "/workspace/project/src/main.ts",
    line: 42,
    column: 10,
    text: "const hello = world;",
    matchStart: 6,
    matchEnd: 11,
  };

  describe("Rendering", () => {
    it("renders the match line number", () => {
      const { container } = render(() => <SearchResultItem {...baseProps} />);
      expect(container.textContent).toContain("42");
    });

    it("renders the match text with highlighted portion", () => {
      const { container } = render(() => <SearchResultItem {...baseProps} />);
      expect(container.textContent).toContain("const ");
      expect(container.textContent).toContain("hello");
      expect(container.textContent).toContain(" = world;");
    });

    it("renders before context lines when provided", () => {
      const { container } = render(() => (
        <SearchResultItem
          {...baseProps}
          beforeContext={[
            { lineNumber: 40, text: "// comment line 40" },
            { lineNumber: 41, text: "// comment line 41" },
          ]}
        />
      ));
      expect(container.textContent).toContain("40");
      expect(container.textContent).toContain("// comment line 40");
      expect(container.textContent).toContain("41");
      expect(container.textContent).toContain("// comment line 41");
    });

    it("renders after context lines when provided", () => {
      const { container } = render(() => (
        <SearchResultItem
          {...baseProps}
          afterContext={[
            { lineNumber: 43, text: "return result;" },
          ]}
        />
      ));
      expect(container.textContent).toContain("43");
      expect(container.textContent).toContain("return result;");
    });
  });

  describe("Click Handling", () => {
    it("calls onMatchClick with correct arguments when clicked", async () => {
      const onMatchClick = vi.fn();
      const { container } = render(() => (
        <SearchResultItem {...baseProps} onMatchClick={onMatchClick} />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      expect(matchRow).toBeTruthy();
      await fireEvent.click(matchRow);

      expect(onMatchClick).toHaveBeenCalledOnce();
      expect(onMatchClick).toHaveBeenCalledWith(
        "/workspace/project/src/main.ts",
        42,
        10
      );
    });

    it("does not dispatch editor:goto event directly (parent handles navigation)", async () => {
      const gotoHandler = vi.fn();
      window.addEventListener("editor:goto", gotoHandler);

      const onMatchClick = vi.fn();
      const { container } = render(() => (
        <SearchResultItem {...baseProps} onMatchClick={onMatchClick} />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.click(matchRow);

      expect(onMatchClick).toHaveBeenCalledOnce();
      expect(gotoHandler).not.toHaveBeenCalled();

      window.removeEventListener("editor:goto", gotoHandler);
    });

    it("does not throw when onMatchClick is not provided", async () => {
      const { container } = render(() => <SearchResultItem {...baseProps} />);

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      expect(() => fireEvent.click(matchRow)).not.toThrow();
    });
  });

  describe("Replace Button", () => {
    it("calls onReplace when replace button is clicked", async () => {
      const onReplace = vi.fn();
      const { container } = render(() => (
        <SearchResultItem {...baseProps} showReplace onReplace={onReplace} />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.mouseEnter(matchRow);

      const replaceBtn = container.querySelector("button[title='Replace this match']") as HTMLElement;
      expect(replaceBtn).toBeTruthy();
      await fireEvent.click(replaceBtn);

      expect(onReplace).toHaveBeenCalledWith(baseProps.file, baseProps.line);
    });

    it("stops propagation so onMatchClick is not called", async () => {
      const onReplace = vi.fn();
      const onMatchClick = vi.fn();
      const { container } = render(() => (
        <SearchResultItem
          {...baseProps}
          showReplace
          onReplace={onReplace}
          onMatchClick={onMatchClick}
        />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.mouseEnter(matchRow);

      const replaceBtn = container.querySelector("button[title='Replace this match']") as HTMLElement;
      await fireEvent.click(replaceBtn);

      expect(onReplace).toHaveBeenCalled();
      expect(onMatchClick).not.toHaveBeenCalled();
    });
  });

  describe("Dismiss Button", () => {
    it("calls onDismiss when dismiss button is clicked", async () => {
      const onDismiss = vi.fn();
      const { container } = render(() => (
        <SearchResultItem {...baseProps} showReplace onDismiss={onDismiss} />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.mouseEnter(matchRow);

      const dismissBtn = container.querySelector("button[title='Dismiss this match']") as HTMLElement;
      expect(dismissBtn).toBeTruthy();
      await fireEvent.click(dismissBtn);

      expect(onDismiss).toHaveBeenCalledWith(baseProps.file, baseProps.line);
    });

    it("stops propagation so onMatchClick is not called", async () => {
      const onDismiss = vi.fn();
      const onMatchClick = vi.fn();
      const { container } = render(() => (
        <SearchResultItem
          {...baseProps}
          showReplace
          onDismiss={onDismiss}
          onMatchClick={onMatchClick}
        />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.mouseEnter(matchRow);

      const dismissBtn = container.querySelector("button[title='Dismiss this match']") as HTMLElement;
      await fireEvent.click(dismissBtn);

      expect(onDismiss).toHaveBeenCalled();
      expect(onMatchClick).not.toHaveBeenCalled();
    });
  });

  describe("Action Buttons Visibility", () => {
    it("does not show action buttons when showReplace is false", () => {
      const { container } = render(() => (
        <SearchResultItem {...baseProps} showReplace={false} />
      ));
      expect(container.querySelector("button[title='Replace this match']")).toBeNull();
      expect(container.querySelector("button[title='Dismiss this match']")).toBeNull();
    });

    it("does not show action buttons when not hovered even if showReplace is true", () => {
      const { container } = render(() => (
        <SearchResultItem {...baseProps} showReplace />
      ));
      expect(container.querySelector("button[title='Replace this match']")).toBeNull();
      expect(container.querySelector("button[title='Dismiss this match']")).toBeNull();
    });

    it("shows action buttons on hover when showReplace is true", async () => {
      const { container } = render(() => (
        <SearchResultItem {...baseProps} showReplace />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.mouseEnter(matchRow);

      expect(container.querySelector("button[title='Replace this match']")).toBeTruthy();
      expect(container.querySelector("button[title='Dismiss this match']")).toBeTruthy();
    });

    it("hides action buttons on mouse leave", async () => {
      const { container } = render(() => (
        <SearchResultItem {...baseProps} showReplace />
      ));

      const matchRow = container.querySelector("div[style*='cursor: pointer']") as HTMLElement;
      await fireEvent.mouseEnter(matchRow);
      expect(container.querySelector("button[title='Replace this match']")).toBeTruthy();

      await fireEvent.mouseLeave(matchRow);
      expect(container.querySelector("button[title='Replace this match']")).toBeNull();
    });
  });
});
