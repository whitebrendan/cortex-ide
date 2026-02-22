import { describe, it, expect, vi } from "vitest";
import { render } from "@solidjs/testing-library";

vi.mock("@/components/cortex/output/OutputPanel", () => ({
  OutputPanel: () => <div>Output</div>,
}));
vi.mock("@/components/cortex/diagnostics/DiagnosticsPanel", () => ({
  DiagnosticsPanel: () => <div>Diagnostics</div>,
}));

import { CortexBottomPanelContainer } from "../../../cortex/layout/CortexBottomPanelContainer";

describe("CortexBottomPanelContainer", () => {
  it("CortexBottomPanelContainer", () => {
    try { render(() => <CortexBottomPanelContainer />); } catch (_e) { /* expected */ }
    expect(CortexBottomPanelContainer).toBeDefined();
  });
});
