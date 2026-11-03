import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelEntry } from "@/api/agent";
import { ModelPicker } from "./ModelPicker";
import { testModelPickerClasses } from "./test-classes";

const MODELS: ModelEntry[] = [
  {
    id: "m1",
    name: "Model 1",
    provider: "p",
    thinkingLevels: ["off", "high"],
    supportsFastMode: false,
    supportsSlowMode: false,
  },
];

afterEach(cleanup);

function renderPicker() {
  return render(
    <ModelPicker
      classes={testModelPickerClasses}
      models={MODELS}
      model={{ provider: "p", modelId: "m1" }}
      thinkingLevel="high"
      thinkingLevels={["off", "high"]}
      onChangeModel={() => {}}
      onChangeThinking={() => {}}
    />,
  );
}

describe("model picker pills", () => {
  it.each(["Model", "Thinking level"])("opens the %s select from its whole pill", (label) => {
    const proto = HTMLSelectElement.prototype as { showPicker?: () => void };
    proto.showPicker ??= () => {};
    const showPicker = vi.spyOn(proto, "showPicker").mockImplementation(() => {});
    try {
      renderPicker();
      const select = screen.getByLabelText(label);
      fireEvent.click(select.closest("label") as HTMLLabelElement);
      expect(showPicker).toHaveBeenCalledTimes(1);
    } finally {
      showPicker.mockRestore();
    }
  });

  it("leaves a direct select click to the native control", () => {
    const proto = HTMLSelectElement.prototype as { showPicker?: () => void };
    proto.showPicker ??= () => {};
    const showPicker = vi.spyOn(proto, "showPicker").mockImplementation(() => {});
    try {
      renderPicker();
      fireEvent.click(screen.getByLabelText("Thinking level"));
      expect(showPicker).not.toHaveBeenCalled();
    } finally {
      showPicker.mockRestore();
    }
  });
});
