import { describe, expect, it } from "vitest";
import { parseTerminalFrame, terminalSocketUrl } from "./terminal-protocol";

describe("terminal protocol", () => {
  it("parses every server frame type", () => {
    expect(parseTerminalFrame(JSON.stringify({ type: "created", id: "t1", pid: 4242, cwd: "D:/repo" })))
      .toEqual({ type: "created", id: "t1", pid: 4242, cwd: "D:/repo" });
    expect(parseTerminalFrame('{"type":"output","data":"hello\\r\\n"}'))
      .toEqual({ type: "output", data: "hello\r\n" });
    expect(parseTerminalFrame('{"type":"exit","exitCode":0}')).toEqual({ type: "exit", exitCode: 0 });
    expect(parseTerminalFrame('{"type":"error","error":"boom","code":"terminal_failed"}'))
      .toEqual({ type: "error", error: "boom", code: "terminal_failed" });
  });

  it("ignores unknown fields on valid frames", () => {
    expect(parseTerminalFrame('{"type":"output","data":"x","extra":true}')).toEqual({ type: "output", data: "x" });
  });

  it("rejects malformed or unknown frames", () => {
    expect(parseTerminalFrame("")).toBeNull();
    expect(parseTerminalFrame("not json")).toBeNull();
    expect(parseTerminalFrame("null")).toBeNull();
    expect(parseTerminalFrame("[]")).toBeNull();
    expect(parseTerminalFrame('"output"')).toBeNull();
    expect(parseTerminalFrame('{"data":"x"}')).toBeNull();
    expect(parseTerminalFrame('{"type":"nope"}')).toBeNull();
  });

  it("rejects frames with mistyped fields", () => {
    expect(parseTerminalFrame('{"type":"created","id":"t1","pid":"1","cwd":"D:/repo"}')).toBeNull();
    expect(parseTerminalFrame('{"type":"created","id":"t1","pid":1}')).toBeNull();
    expect(parseTerminalFrame('{"type":"output","data":42}')).toBeNull();
    expect(parseTerminalFrame('{"type":"exit","exitCode":"1"}')).toBeNull();
    expect(parseTerminalFrame('{"type":"exit","exitCode":1e999}')).toBeNull();
    expect(parseTerminalFrame('{"type":"error","error":"boom"}')).toBeNull();
  });

  it("derives the websocket URL from the page origin", () => {
    expect(terminalSocketUrl({ protocol: "http:", host: "localhost:5173" }))
      .toBe("ws://localhost:5173/api/workspace/terminal");
    expect(terminalSocketUrl({ protocol: "https:", host: "omp.example.com" }))
      .toBe("wss://omp.example.com/api/workspace/terminal");
  });
});
