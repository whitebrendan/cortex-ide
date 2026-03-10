import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import { AccessibilitySettings } from "../AccessibilitySettings";

const renderWithProvider = () =>
  render(() => (
    <AccessibilityProvider>
      <AccessibilitySettings />
    </AccessibilityProvider>
  ));

describe("AccessibilitySettings", () => {
  beforeEach(() => {
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

    const mockAudioContext = {
      state: "running",
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn().mockReturnValue({
        connect: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      }),
    };

    const AudioContextMock = vi.fn(function MockAudioContext() {
      return mockAudioContext;
    });

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: AudioContextMock,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      writable: true,
      value: AudioContextMock,
    });
  });

  it("renders sections and system details", () => {
    renderWithProvider();

    expect(screen.getByText("Visual Settings")).toBeTruthy();
    expect(screen.getByText("Font Size")).toBeTruthy();
    expect(screen.getByText("Audio Signals")).toBeTruthy();
    expect(screen.getByText("Monaco Editor Accessibility")).toBeTruthy();
    expect(screen.getByText(/System prefers reduced motion:/)).toBeTruthy();
    expect(screen.getByText("ARIA Labels Audit")).toBeTruthy();
  });

  it("uses switch semantics for top-level toggles", () => {
    renderWithProvider();

    const screenReaderToggle = screen.getByRole("switch", {
      name: /Screen Reader Mode/,
    });

    expect(screenReaderToggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screenReaderToggle);

    expect(screenReaderToggle.getAttribute("aria-checked")).toBe("true");
  });

  it("updates select and range controls with accessible labels", () => {
    renderWithProvider();

    const fontScaleSelect = screen.getByLabelText(/Application font scale/);
    fireEvent.change(fontScaleSelect, { target: { value: "1.3" } });
    expect((fontScaleSelect as HTMLSelectElement).value).toBe("1.3");

    const volumeSlider = screen.getByLabelText(/Audio signal volume/);
    expect(volumeSlider.getAttribute("aria-valuetext")).toBe("50%");

    const audioToggle = screen.getByRole("switch", {
      name: /Enable Audio Signals/,
    });
    fireEvent.click(audioToggle);
    fireEvent.input(volumeSlider, { target: { value: "0.7" } });

    expect(volumeSlider.getAttribute("aria-valuetext")).toBe("70%");
  });

  it("exposes checkbox semantics for individual audio cues", () => {
    renderWithProvider();

    const cue = screen.getByRole("checkbox", { name: /Errors/ });
    expect(cue.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(cue);
    expect(cue.getAttribute("aria-checked")).toBe("false");
  });

  it("renders reset button and ARIA audit items", () => {
    renderWithProvider();

    expect(screen.getByRole("button", { name: /Reset to Defaults/ })).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(screen.getByText("Chat Panel")).toBeTruthy();
  });
});
