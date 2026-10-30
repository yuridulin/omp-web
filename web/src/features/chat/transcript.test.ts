import { describe, expect, it } from "vitest";
import {
  contentBlocks,
  imageSrc,
  joinClassNames,
  prettyJson,
  roleLabel,
  toolResultImages,
  toolResultText,
} from "./transcript";

describe("contentBlocks", () => {
  it("wraps a plain string as a single text block", () => {
    expect(contentBlocks("hello")).toEqual([{ type: "text", text: "hello" }]);
  });

  it("normalizes a content-block array and drops malformed entries", () => {
    const blocks = contentBlocks([
      { type: "text", text: "hi" },
      null,
      7,
      { type: "text", text: 42 },
      { type: "thinking", thinking: "hmm", deferred: true },
      { type: "toolCall", toolCallId: "t1", toolName: "read", input: { path: "a.ts" } },
      { type: "image", url: "https://example.com/a.png" },
      { type: "mystery", text: "fallback text" },
      { type: "mystery" },
    ]);

    expect(blocks).toEqual([
      { type: "text", text: "hi" },
      { type: "text", text: "" },
      { type: "thinking", thinking: "hmm", deferred: true },
      { type: "toolCall", toolCallId: "t1", toolName: "read", input: { path: "a.ts" } },
      { type: "image", url: "https://example.com/a.png" },
      { type: "text", text: "fallback text" },
    ]);
  });

  it("defaults malformed tool calls instead of throwing", () => {
    expect(contentBlocks({ type: "toolCall" })).toEqual([
      { type: "toolCall", toolCallId: "", toolName: "tool", input: {} },
    ]);
    expect(contentBlocks({ type: "toolCall", input: "nope" })).toEqual([
      { type: "toolCall", toolCallId: "", toolName: "tool", input: {} },
    ]);
  });

  it("returns an empty list for null, undefined, and primitives", () => {
    expect(contentBlocks(null)).toEqual([]);
    expect(contentBlocks(undefined)).toEqual([]);
    expect(contentBlocks(12)).toEqual([]);
    expect(contentBlocks(true)).toEqual([]);
  });
});

describe("imageSrc", () => {
  it("accepts a direct url and source url", () => {
    expect(imageSrc({ type: "image", url: "https://example.com/a.png" })).toBe(
      "https://example.com/a.png",
    );
    expect(imageSrc({ type: "image", source: { url: "http://example.com/b.png" } })).toBe(
      "http://example.com/b.png",
    );
    expect(imageSrc({ type: "image", url: "/local.png" })).toBe("/local.png");
  });

  it("builds a data URL from data and source data", () => {
    expect(imageSrc({ type: "image", data: "AAAA", mimeType: "image/jpeg" })).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(
      imageSrc({ type: "image", source: { type: "base64", media_type: "image/png", data: "BBBB" } }),
    ).toBe("data:image/png;base64,BBBB");
  });

  it("keeps already-qualified data and blob URLs", () => {
    expect(imageSrc("data:image/png;base64,CCCC")).toBe("data:image/png;base64,CCCC");
    expect(imageSrc({ type: "image", url: "blob:https://example.com/123" })).toBe(
      "blob:https://example.com/123",
    );
  });

  it("rejects unsupported, javascript, protocol-relative, and malformed sources", () => {
    expect(imageSrc("javascript:alert(1)")).toBeNull();
    expect(imageSrc("//evil.example/a.png")).toBeNull();
    expect(imageSrc("ftp://example.com/a.png")).toBeNull();
    expect(imageSrc({ type: "image" })).toBeNull();
    expect(imageSrc(null)).toBeNull();
    expect(imageSrc({ type: "image", data: 42 })).toBeNull();
  });
});

describe("toolResultText", () => {
  it("joins text blocks and skips images", () => {
    expect(
      toolResultText([
        { type: "text", text: "one" },
        { type: "image", url: "https://example.com/a.png" },
        { type: "text", text: "two" },
      ]),
    ).toBe("one\ntwo");
    expect(toolResultText("plain")).toBe("plain");
  });

  it("falls back to pretty JSON for structured results", () => {
    expect(toolResultText({ ok: true })).toBe('{\n  "ok": true\n}');
  });

  it("degrades malformed input to an empty string", () => {
    expect(toolResultText(null)).toBe("");
    expect(toolResultText({})).toBe("");
    expect(toolResultText({ type: "image", url: "https://example.com/a.png" })).toBe("");
    expect(toolResultText([null, 7, { type: "image", url: "/a.png" }])).toBe("");
    expect(toolResultText(() => 1)).toBe("");
  });
});

describe("toolResultImages", () => {
  it("collects only allowed image sources", () => {
    expect(
      toolResultImages([
        { type: "text", text: "see" },
        { type: "image", url: "https://example.com/a.png" },
        { type: "image", url: "javascript:alert(1)" },
        { type: "image", source: { media_type: "image/webp", data: "DDDD" } },
      ]),
    ).toEqual(["https://example.com/a.png", "data:image/webp;base64,DDDD"]);
  });

  it("handles a single image block and malformed input", () => {
    expect(toolResultImages({ type: "image", url: "/x.png" })).toEqual(["/x.png"]);
    expect(toolResultImages("nope")).toEqual([]);
    expect(toolResultImages(null)).toEqual([]);
  });
});

describe("roleLabel", () => {
  it("maps known roles to readable labels", () => {
    expect(roleLabel("assistant")).toBe("assistant");
    expect(roleLabel("user")).toBe("user");
    expect(roleLabel("toolResult")).toBe("tool result");
    expect(roleLabel("tool")).toBe("tool result");
    expect(roleLabel("bashExecution")).toBe("bash");
    expect(roleLabel("pythonExecution")).toBe("python");
    expect(roleLabel("fileMention")).toBe("file");
  });

  it("falls back to the raw role or 'message'", () => {
    expect(roleLabel("narrator")).toBe("narrator");
    expect(roleLabel("   ")).toBe("message");
  });
});

describe("prettyJson", () => {
  it("pretty prints values and passes strings through", () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson("line one")).toBe("line one");
    expect(prettyJson(undefined)).toBe("");
  });
});

describe("joinClassNames", () => {
  it("drops empty and false values", () => {
    expect(joinClassNames("a", undefined, "", false, null, "b")).toBe("a b");
  });
});
