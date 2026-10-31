import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_KEY,
  getAppearance,
  parseAppearance,
  resetAppearanceForTests,
  resolveSlotVariant,
  setAppearancePreset,
  setSlotVariant,
} from "./appearance-store";

beforeEach(() => {
  resetAppearanceForTests();
});

describe("appearance store", () => {
  it("parses partial state and ignores unknown slots", () => {
    expect(parseAppearance(null)).toEqual({ preset: "dsh", slots: {} });
    expect(parseAppearance("not json")).toEqual({ preset: "dsh", slots: {} });
    expect(parseAppearance(JSON.stringify({ preset: "custom", slots: { chat: "x", nope: "y", rail: "" } })))
      .toEqual({ preset: "custom", slots: { chat: "x" } });
  });

  it("lets a slot override the preset and clears back", () => {
    setAppearancePreset("dsh");
    setSlotVariant("chat", "other");
    expect(resolveSlotVariant(getAppearance(), "chat")).toBe("other");
    expect(resolveSlotVariant(getAppearance(), "rail")).toBe("dsh");
    expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}")).toEqual({
      preset: "dsh",
      slots: { chat: "other" },
    });

    setSlotVariant("chat", null);
    expect(resolveSlotVariant(getAppearance(), "chat")).toBe("dsh");
  });
});
