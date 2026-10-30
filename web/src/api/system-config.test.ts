import { describe, expect, it } from "vitest";
import {
  formatAgentEnv,
  formatModelSelector,
  fromModelRoleRows,
  getNested,
  normalizeModelRoles,
  parseAgentEnv,
  parseNativeSettings,
  parseWebSettings,
  readNativeBoolean,
  readNativeString,
  setNested,
  toModelRoleRows,
  updateNativeSetting,
} from "./system-config";

describe("setNested", () => {
  it("preserves unrelated top-level settings", () => {
    const source = {
      personality: "friendly",
      unknownKey: { keep: ["me"] },
      tools: { approvalMode: "write", extra: 42 },
    };
    const next = setNested(source, ["personality"], "pragmatic");
    expect(next.personality).toBe("pragmatic");
    expect(next.unknownKey).toEqual({ keep: ["me"] });
    expect(next.tools).toEqual({ approvalMode: "write", extra: 42 });
  });

  it("clones every level and never mutates the source", () => {
    const source = { tools: { approval: { bash: "allow" }, extra: true } };
    const next = setNested(source, ["tools", "approval", "bash"], "deny");
    expect(getNested(next, ["tools", "approval", "bash"])).toBe("deny");
    expect(getNested(source, ["tools", "approval", "bash"])).toBe("allow");
    expect(getNested(next, ["tools", "extra"])).toBe(true);
    expect(next.tools).not.toBe(source.tools);
  });

  it("creates intermediate objects on demand", () => {
    const next = setNested({}, ["mcp", "notifications"], false);
    expect(next).toEqual({ mcp: { notifications: false } });
  });

  it("removes a leaf when the value is undefined", () => {
    const source = { textVerbosity: "high", keep: 1 };
    const next = setNested(source, ["textVerbosity"], undefined);
    expect("textVerbosity" in next).toBe(false);
    expect(next.keep).toBe(1);
  });

  it("ignores an empty path", () => {
    const source = { a: 1 };
    expect(setNested(source, [], "ignored")).toBe(source);
  });

  it("replaces a non-object intermediate node", () => {
    const next = setNested({ retry: "oops" }, ["retry", "enabled"], true);
    expect(next).toEqual({ retry: { enabled: true } });
  });
});

describe("settings parsing", () => {
  it("keeps unknown native settings fields", () => {
    const parsed = parseNativeSettings({
      personality: "none",
      someFutureFeature: { enabled: true },
    });
    expect(parsed.personality).toBe("none");
    expect((parsed as Record<string, unknown>).someFutureFeature).toEqual({ enabled: true });
  });

  it("is total for non-object payloads", () => {
    expect(parseNativeSettings(null)).toEqual({});
    expect(parseNativeSettings([1, 2])).toEqual({});
    expect(parseNativeSettings("nope")).toEqual({});
  });

  it("reads nested values with typed fallbacks", () => {
    const settings = parseNativeSettings({
      hideThinkingBlock: true,
      tools: { approvalMode: "yolo" },
    });
    expect(readNativeBoolean(settings, ["hideThinkingBlock"], false)).toBe(true);
    expect(readNativeBoolean(settings, ["externalThinking"], false)).toBe(false);
    expect(readNativeString(settings, ["tools", "approvalMode"], "always-ask")).toBe("yolo");
    expect(readNativeString(settings, ["tools", "approval", "bash"], "prompt")).toBe("prompt");
  });

  it("updateNativeSetting merges deeply and keeps unknown siblings", () => {
    const settings = parseNativeSettings({
      tools: { approval: { bash: "allow", extension: "prompt" }, custom: "keep" },
      unknownTop: 7,
    });
    const next = updateNativeSetting(settings, ["tools", "approval", "bash"], "deny");
    expect(readNativeString(next, ["tools", "approval", "bash"], "")).toBe("deny");
    expect(readNativeString(next, ["tools", "approval", "extension"], "")).toBe("prompt");
    expect(getNested(next as Record<string, unknown>, ["tools", "custom"])).toBe("keep");
    expect(getNested(next as Record<string, unknown>, ["unknownTop"])).toBe(7);
    expect(readNativeString(settings, ["tools", "approval", "bash"], "")).toBe("allow");
  });

  it("normalizes web settings and drops non-string env values", () => {
    const parsed = parseWebSettings({
      autoResumeSessions: 1,
      agentToolsEnabled: true,
      agentEnv: { FOO: "bar", NUM: 3 },
      extra: "kept",
    });
    expect(parsed.autoResumeSessions).toBe(false);
    expect(parsed.agentToolsEnabled).toBe(true);
    expect(parsed.agentEnv).toEqual({ FOO: "bar" });
    expect((parsed as Record<string, unknown>).extra).toBe("kept");
  });
});

describe("model roles formatting", () => {
  it("filters invalid role entries", () => {
    expect(normalizeModelRoles({ judge: "openai/gpt", empty: "", bad: 3, " ": "x/y" })).toEqual({
      judge: "openai/gpt",
    });
    expect(normalizeModelRoles(null)).toEqual({});
  });

  it("sorts rows for display and round-trips them", () => {
    const rows = toModelRoleRows({ zeta: "b/two", alpha: "a/one" });
    expect(rows).toEqual([
      { role: "alpha", model: "a/one" },
      { role: "zeta", model: "b/two" },
    ]);
    expect(fromModelRoleRows(rows)).toEqual({ alpha: "a/one", zeta: "b/two" });
  });

  it("trims rows, drops empties, and keeps the last duplicate", () => {
    const roles = fromModelRoleRows([
      { role: " judge ", model: " openai/gpt " },
      { role: "", model: "ignored/one" },
      { role: "empty", model: "   " },
      { role: "judge", model: "anthropic/claude" },
    ]);
    expect(roles).toEqual({ judge: "anthropic/claude" });
  });

  it("formats model selectors as provider/model", () => {
    expect(formatModelSelector("openai", "gpt-5")).toBe("openai/gpt-5");
  });
});

describe("agent environment text", () => {
  it("parses comments, export prefixes, and later assignments", () => {
    const parsed = parseAgentEnv(
      ["# comment", "", "export FOO=one", "BAR = two = three", "FOO=final"].join("\n"),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.values).toEqual({ FOO: "final", BAR: "two = three" });
  });

  it("reports bad lines and reserved names without leaking them into values", () => {
    const parsed = parseAgentEnv(["MISSING", "=nothing", "9LIVES=x", "PATH=/evil", "OMP_WEB_TOKEN=x"].join("\n"));
    expect(parsed.values).toEqual({});
    expect(parsed.errors).toHaveLength(5);
    expect(parsed.errors[0]).toContain("Line 1");
    expect(parsed.errors[3]).toContain("reserved");
  });

  it("round-trips through the editable text form", () => {
    const text = formatAgentEnv({ ZED: "z", ALPHA: "a" });
    expect(text).toBe("ALPHA=a\nZED=z");
    expect(parseAgentEnv(text)).toEqual({ values: { ALPHA: "a", ZED: "z" }, errors: [] });
  });
});
