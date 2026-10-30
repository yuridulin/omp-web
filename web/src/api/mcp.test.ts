import { describe, expect, it } from "vitest";
import { mcpStatusLabel, mcpStatusTone, parseMcpReport } from "./mcp";

describe("MCP status helpers", () => {
  it("labels every known status", () => {
    expect(mcpStatusLabel("connected")).toBe("Connected");
    expect(mcpStatusLabel("connecting")).toBe("Connecting");
    expect(mcpStatusLabel("not_connected")).toBe("Not connected");
    expect(mcpStatusLabel("inactive")).toBe("Inactive");
    expect(mcpStatusLabel("disabled")).toBe("Disabled");
    expect(mcpStatusLabel("configured")).toBe("Configured");
  });

  it("passes through unknown statuses", () => {
    expect(mcpStatusLabel("to_string")).toBe("to_string");
  });

  it("maps statuses to pill tones", () => {
    expect(mcpStatusTone("connected")).toBe("ok");
    expect(mcpStatusTone("connecting")).toBe("pending");
    expect(mcpStatusTone("configured")).toBe("warn");
    expect(mcpStatusTone("disabled")).toBe("muted");
    expect(mcpStatusTone("inactive")).toBe("muted");
    expect(mcpStatusTone("not_connected")).toBe("muted");
  });
});

describe("MCP parser", () => {
  it("normalizes an empty payload", () => {
    expect(parseMcpReport(null)).toEqual({
      root: null,
      path: null,
      exists: false,
      inventory: [],
      liveServers: null,
      liveError: null,
    });
  });

  it("keeps valid servers and defaults unknown statuses", () => {
    const report = parseMcpReport({
      root: "/repo",
      path: "/repo/.omp/mcp.json",
      exists: true,
      inventory: [
        { name: "fs", source: "project", status: "connected", type: "stdio" },
        { name: "bad", source: "user", status: "mystery" },
        { status: "connected" },
      ],
      liveServers: [{ name: "fs", source: "project", status: "connecting" }],
      liveError: "not running",
    });
    expect(report.inventory).toHaveLength(2);
    expect(report.inventory[0]?.type).toBe("stdio");
    expect(report.inventory[1]?.status).toBe("configured");
    expect(report.liveServers?.[0]?.status).toBe("connecting");
    expect(report.liveError).toBe("not running");
  });
});
