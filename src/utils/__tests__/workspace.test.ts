import { describe, it, expect, beforeEach } from "vitest";
import { getProjectPath, setProjectPath, clearProjectPath } from "../workspace";

describe("workspace", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.clear();
    clearProjectPath();
  });

  describe("getProjectPath / setProjectPath", () => {
    it("returns empty string initially", () => {
      expect(getProjectPath()).toBe("");
    });

    it("sets and gets project path", () => {
      setProjectPath("/home/user/project");
      expect(getProjectPath()).toBe("/home/user/project");
    });

    it("prefers the main-window current project key when present", () => {
      localStorage.setItem("cortex_current_project_main", "/home/user/window-project");

      expect(getProjectPath()).toBe("/home/user/window-project");
    });
  });

  describe("clearProjectPath", () => {
    it("clears the project path", () => {
      setProjectPath("/home/user/project");
      clearProjectPath();
      expect(getProjectPath()).toBe("");
    });

    it("clears the main-window scoped project keys", () => {
      localStorage.setItem("projectPath_main", "/home/user/project");
      localStorage.setItem("cortex_current_project_main", "/home/user/project");

      clearProjectPath();

      expect(localStorage.getItem("projectPath_main")).toBeNull();
      expect(localStorage.getItem("cortex_current_project_main")).toBeNull();
    });
  });
});
