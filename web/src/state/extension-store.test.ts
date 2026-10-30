import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyExtensionFrame,
  clearExtensionRequest,
  getExtensionRequest,
  resetExtensionRequests,
  subscribeExtensionRequest,
} from "./extension-store";

beforeEach(() => resetExtensionRequests());
afterEach(() => vi.useRealTimers());

describe("extension request store", () => {
  it("keeps the latest blocking request with its expiry", () => {
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r1",
      method: "select",
      title: "Pick one",
      options: ["a", "b"],
      expiresAt: 123,
    });
    expect(getExtensionRequest("s1")).toEqual({
      id: "r1",
      method: "select",
      title: "Pick one",
      options: ["a", "b"],
      expiresAt: 123,
    });

    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r2",
      method: "confirm",
      title: "Sure?",
      message: "Continue",
    });
    expect(getExtensionRequest("s1")).toMatchObject({ id: "r2", method: "confirm" });
  });

  it("clears only the request a cancel frame targets", () => {
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r1",
      method: "input",
      title: "Name",
    });

    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      method: "cancel",
      targetId: "other",
    });
    expect(getExtensionRequest("s1")).toMatchObject({ id: "r1" });

    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      method: "cancel",
      targetId: "r1",
    });
    expect(getExtensionRequest("s1")).toBeNull();
  });

  it("ignores malformed and unknown frames", () => {
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r1",
      method: "select",
      title: "Broken",
    });
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r2",
      method: "mystery",
      title: "Unknown",
    });
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      method: "confirm",
      message: "No id",
    });
    applyExtensionFrame("s1", { type: "snapshot", snapshot: {} });

    expect(getExtensionRequest("s1")).toBeNull();
  });

  it("parses ask questions and preserves optional fields", () => {
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r1",
      method: "ask",
      title: "Questions",
      questions: [
        {
          id: "q1",
          question: "Pick",
          header: "Header",
          multi: true,
          recommended: 1,
          options: [
            { label: "A", description: "first", preview: "code" },
            { label: "B" },
          ],
        },
      ],
    });

    expect(getExtensionRequest("s1")).toEqual({
      id: "r1",
      method: "ask",
      title: "Questions",
      questions: [
        {
          id: "q1",
          question: "Pick",
          header: "Header",
          multi: true,
          recommended: 1,
          options: [
            { label: "A", description: "first", preview: "code" },
            { label: "B" },
          ],
        },
      ],
    });
  });

  it("isolates sessions and only notifies the changed one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeExtensionRequest("s1", first);
    subscribeExtensionRequest("s2", second);

    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r1",
      method: "confirm",
      title: "One",
      message: "Message",
    });
    applyExtensionFrame("s2", {
      type: "extension_ui_request",
      id: "r2",
      method: "confirm",
      title: "Two",
      message: "Message",
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(getExtensionRequest("s1")?.id).toBe("r1");
    expect(getExtensionRequest("s2")?.id).toBe("r2");

    clearExtensionRequest("s1", "r1");
    expect(getExtensionRequest("s1")).toBeNull();
    expect(getExtensionRequest("s2")?.id).toBe("r2");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    applyExtensionFrame("s2", {
      type: "extension_ui_request",
      id: "r3",
      method: "input",
      title: "Three",
    });
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("drops a request when its server expiry passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "expiring",
      method: "confirm",
      title: "Expiring",
      message: "Answer now",
      expiresAt: 1005,
    });
    expect(getExtensionRequest("s1")?.id).toBe("expiring");

    vi.advanceTimersByTime(10);
    expect(getExtensionRequest("s1")).toBeNull();
  });

  it("keeps the request when clear targets a different id", () => {
    applyExtensionFrame("s1", {
      type: "extension_ui_request",
      id: "r1",
      method: "editor",
      title: "Edit",
      prefill: "hello",
      promptStyle: true,
    });
    clearExtensionRequest("s1", "r2");
    expect(getExtensionRequest("s1")?.id).toBe("r1");
    clearExtensionRequest("s1");
    expect(getExtensionRequest("s1")).toBeNull();
  });
});
