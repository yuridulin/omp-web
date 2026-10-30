import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readTheme, subscribeTheme, toggleTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme", () => {
  it("defaults to light without a saved mode", () => {
    expect(readTheme()).toBe("light");
  });

  it("applies and persists the mode, then notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);

    applyTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("omp.theme.v1")).toBe("dark");
    expect(readTheme()).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("toggles between the two modes", () => {
    applyTheme("light");
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
