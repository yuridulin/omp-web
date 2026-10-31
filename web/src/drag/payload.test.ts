import { describe, expect, it } from "vitest";
import {
  DRAG_MIME,
  parseDragPayload,
  readDragPayload,
  serializeDragPayload,
  writeDragPayload,
  type DragPayload,
} from "./payload";

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

describe("drag payload", () => {
  it("round-trips every payload kind", () => {
    const payloads: DragPayload[] = [
      { kind: "session", id: "s1" },
      { kind: "file", path: "D:/repo/a.ts", root: "D:/repo" },
      { kind: "text", text: "hello" },
    ];
    for (const payload of payloads) {
      expect(parseDragPayload(serializeDragPayload(payload))).toEqual(payload);
    }
  });

  it("writes through DataTransfer under the custom MIME and text/plain", () => {
    const dataTransfer = fakeDataTransfer();
    const payload: DragPayload = { kind: "file", path: "D:/repo/a.ts", root: "D:/repo" };
    writeDragPayload(dataTransfer, payload);
    expect(dataTransfer.getData(DRAG_MIME)).toBe(serializeDragPayload(payload));
    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(readDragPayload(dataTransfer)).toEqual(payload);
  });

  it("returns null for malformed, unknown, or partial payloads", () => {
    expect(parseDragPayload(null)).toBeNull();
    expect(parseDragPayload("")).toBeNull();
    expect(parseDragPayload("not json")).toBeNull();
    expect(parseDragPayload("null")).toBeNull();
    expect(parseDragPayload("[]")).toBeNull();
    expect(parseDragPayload(JSON.stringify({ kind: "nope", id: "s1" }))).toBeNull();
    expect(parseDragPayload(JSON.stringify({ kind: "session", id: "" }))).toBeNull();
    expect(parseDragPayload(JSON.stringify({ kind: "file", path: "a.ts" }))).toBeNull();
    expect(parseDragPayload(JSON.stringify({ kind: "file", path: "", root: "D:/repo" }))).toBeNull();
  });
});
