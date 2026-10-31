import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeDragPayload, type DragPayload } from "@/drag/payload";
import type { ChatSlotProps } from "@/slots/chat";
import { resetComposerStoreForTests } from "@/state/composer-store";
import { ChatSkin } from "./ChatSkin";

function fakeDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
    getData: (type: string) => values.get(type) ?? "",
    effectAllowed: "uninitialized",
  } as unknown as DataTransfer;
}

function props(onDropPayload: (payload: DragPayload) => void): ChatSlotProps {
  return {
    session: null,
    selected: "s1",
    snapshot: null,
    context: undefined,
    streamError: null,
    extensionRequest: null,
    extensionBusy: false,
    extensionError: null,
    onExtensionResponse: vi.fn(),
    models: [],
    modelsLoading: false,
    modelValue: null,
    thinkingLevel: "off",
    thinkingLevels: ["off"],
    modelLoading: false,
    onModelChange: vi.fn(),
    onThinkingChange: vi.fn(),
    running: false,
    queue: { steering: [], followUp: [] },
    sending: false,
    onSend: vi.fn(async () => {}),
    onAbort: vi.fn(),
    onRemoveQueued: vi.fn(),
    onPromoteQueued: vi.fn(),
    onDropPayload,
  };
}

beforeEach(() => {
  resetComposerStoreForTests();
});
afterEach(cleanup);

describe("chat skin drop target", () => {
  it("decodes a file payload on the composer and hands it to the callback", () => {
    const onDropPayload = vi.fn();
    const { container } = render(<ChatSkin {...props(onDropPayload)} />);
    const composer = container.querySelector("footer");
    expect(composer).toBeTruthy();

    const dataTransfer = fakeDataTransfer();
    writeDragPayload(dataTransfer, { kind: "file", path: "D:/repo/a.ts", root: "D:/repo" });
    fireEvent.drop(composer as Element, { dataTransfer });

    expect(onDropPayload).toHaveBeenCalledWith({ kind: "file", path: "D:/repo/a.ts", root: "D:/repo" });
  });

  it("ignores garbage drop data", () => {
    const onDropPayload = vi.fn();
    const { container } = render(<ChatSkin {...props(onDropPayload)} />);
    const composer = container.querySelector("footer");
    const dataTransfer = fakeDataTransfer();
    dataTransfer.setData("text/plain", "not a payload");
    fireEvent.drop(composer as Element, { dataTransfer });
    expect(onDropPayload).not.toHaveBeenCalled();
  });
});
