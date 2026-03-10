import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, screen } from "@solidjs/testing-library";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import {
  AccessibilityHelp,
  useAccessibilityHelpDialog,
} from "../AccessibilityHelp";

vi.mock("@/components/ui/Icon", () => ({
  Icon: (props: { name: string }) => <span data-testid={`icon-${props.name}`} />,
}));

describe("AccessibilityHelp", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  function renderHelp() {
    return render(() => (
      <AccessibilityProvider>
        <button type="button">Launch help</button>
        <AccessibilityHelp />
      </AccessibilityProvider>
    ));
  }

  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("opens with F1, focuses search, and restores focus on close", async () => {
    renderHelp();

    const launchButton = screen.getByRole("button", { name: /Launch help/ });
    launchButton.focus();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true }));
    await nextFrame();

    expect(screen.getByRole("dialog", { name: /Accessibility Help/ })).toBeTruthy();
    const searchInput = screen.getByLabelText(/Search keyboard shortcuts/);
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(screen.getByRole("dialog", { name: /Accessibility Help/ }), {
      key: "Escape",
    });
    await nextFrame();

    expect(document.activeElement).toBe(launchButton);
  });

  it("filters shortcuts and announces empty search results text", async () => {
    renderHelp();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true }));
    await nextFrame();

    const searchInput = screen.getByLabelText(/Search keyboard shortcuts/);
    fireEvent.input(searchInput, { target: { value: "nonexistent shortcut" } });

    const emptyStateMatches = screen.getAllByText(/No shortcuts found matching/);
    expect(emptyStateMatches.length).toBeGreaterThan(0);
  });

  it("supports roving tab keyboard navigation", async () => {
    renderHelp();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true }));
    await nextFrame();

    const shortcutsTab = screen.getByRole("tab", { name: /Keyboard Shortcuts/ });
    shortcutsTab.focus();
    fireEvent.keyDown(shortcutsTab, { key: "ArrowRight" });

    const screenReaderTab = screen.getByRole("tab", { name: /Screen Reader Tips/ });
    expect(screenReaderTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screenReaderTab, { key: "End" });

    const settingsTab = screen.getByRole("tab", { name: /Accessibility Settings/ });
    expect(settingsTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("switch", { name: /Screen Reader Mode/ })).toBeTruthy();
  });

  it("can be controlled programmatically through the dialog hook", async () => {
    function Harness() {
      const dialog = useAccessibilityHelpDialog();
      return (
        <>
          <button type="button" onClick={dialog.open}>
            Open help
          </button>
          <button type="button" onClick={dialog.close}>
            Close help
          </button>
        </>
      );
    }

    render(() => (
      <AccessibilityProvider>
        <Harness />
        <AccessibilityHelp />
      </AccessibilityProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: /Open help/ }));
    await nextFrame();
    expect(screen.getByRole("dialog", { name: /Accessibility Help/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Close help/ }));
    await nextFrame();
    expect(screen.queryByRole("dialog", { name: /Accessibility Help/ })).toBeNull();
  });
});
