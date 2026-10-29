import { describe, expect, it } from "vitest";
import { createSseParser, type SseFrame } from "./events";

describe("createSseParser", () => {
  it("parses frames split across chunks", () => {
    const frames: SseFrame[] = [];
    const parse = createSseParser((frame) => frames.push(frame));
    parse('event: mux\ndata: {"type":"hello"}\n\n');
    parse('event: s1\ndata: {"type":"snap');
    parse('shot","history":true}\n\n');
    expect(frames).toEqual([
      { event: "mux", data: '{"type":"hello"}' },
      { event: "s1", data: '{"type":"snapshot","history":true}' },
    ]);
  });

  it("handles CRLF, comments, and multi-line data", () => {
    const frames: SseFrame[] = [];
    const parse = createSseParser((frame) => frames.push(frame));
    parse(": heartbeat\r\n\r\nevent: s1\r\ndata: one\r\ndata: two\r\n\r\n");
    expect(frames).toEqual([{ event: "s1", data: "one\ntwo" }]);
  });

  it("ignores frames without an event name", () => {
    const frames: SseFrame[] = [];
    const parse = createSseParser((frame) => frames.push(frame));
    parse("data: orphan\n\n");
    expect(frames).toEqual([]);
  });
});
