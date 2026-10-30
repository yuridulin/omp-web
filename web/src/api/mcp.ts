import { api } from "./client";
import { isRecord } from "./guards";
import type { paths } from "./schema";

type McpPayload = NonNullable<
  paths["/api/system/mcp"]["get"]["responses"][200]["content"]["application/json"]
>;
export type McpInventoryItem = McpPayload["inventory"][number];
export type McpStatus = McpInventoryItem["status"];

type McpActionBody = NonNullable<
  paths["/api/system/mcp"]["patch"]["requestBody"]
>["content"]["application/json"];
export type McpAction = McpActionBody["action"];

export interface McpReport {
  root: McpPayload["root"];
  path: McpPayload["path"];
  exists: McpPayload["exists"];
  inventory: McpPayload["inventory"];
  liveServers: NonNullable<McpPayload["liveServers"]> | null;
  liveError: string | null;
}

const MCP_STATUSES: readonly McpStatus[] = [
  "connected",
  "connecting",
  "not_connected",
  "inactive",
  "disabled",
  "configured",
];

export const MCP_STATUS_LABELS: Record<McpStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  not_connected: "Not connected",
  inactive: "Inactive",
  disabled: "Disabled",
  configured: "Configured",
};

function errorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === "string" && value.error) return value.error;
  return `HTTP ${status}`;
}

function statusValue(value: unknown): McpStatus {
  return typeof value === "string" && (MCP_STATUSES as readonly string[]).includes(value)
    ? (value as McpStatus)
    : "configured";
}

function parseServer(value: unknown): McpInventoryItem | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const server: McpInventoryItem = {
    name: value.name,
    source: typeof value.source === "string" ? value.source : "unknown",
    status: statusValue(value.status),
  };
  if (typeof value.type === "string") server.type = value.type;
  if (typeof value.sourcePath === "string") server.sourcePath = value.sourcePath;
  return server;
}

function parseServers(value: unknown): McpInventoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseServer).filter((entry): entry is McpInventoryItem => entry !== null);
}

/** Normalize an MCP payload without trusting any field. */
export function parseMcpReport(value: unknown): McpReport {
  const raw = isRecord(value) ? value : {};
  return {
    root: typeof raw.root === "string" ? raw.root : null,
    path: typeof raw.path === "string" ? raw.path : null,
    exists: raw.exists === true,
    inventory: parseServers(raw.inventory),
    liveServers: Array.isArray(raw.liveServers) ? parseServers(raw.liveServers) : null,
    liveError: typeof raw.liveError === "string" ? raw.liveError : null,
  };
}

export interface McpQuery {
  cwd?: string | null;
  sessionId?: string | null;
}

export async function fetchMcpInventory(options: McpQuery = {}): Promise<McpReport> {
  const cwd = options.cwd ?? null;
  const sessionId = options.sessionId ?? null;
  const { data, error, response } = await api.GET("/api/system/mcp", {
    params: {
      query: {
        ...(cwd ? { cwd } : {}),
        ...(sessionId ? { sessionId, live: "1" } : {}),
      },
    },
  });
  if (error) throw new Error(errorMessage(error, response.status));
  return parseMcpReport(data);
}

export async function applyMcpAction(
  sessionId: string,
  action: McpAction,
  name?: string,
): Promise<void> {
  const body: McpActionBody = {
    sessionId,
    action,
    ...(name ? { name } : {}),
  };
  const { error, response } = await api.PATCH("/api/system/mcp", { body });
  if (error) throw new Error(errorMessage(error, response.status));
}

/** Human label for a server's inventory/live status. */
export function mcpStatusLabel(status: McpStatus | string): string {
  return (MCP_STATUSES as readonly string[]).includes(status)
    ? MCP_STATUS_LABELS[status as McpStatus]
    : status;
}

/** Coarse tone used to style a status pill. */
export type McpStatusTone = "ok" | "pending" | "muted" | "warn";

export function mcpStatusTone(status: McpStatus): McpStatusTone {
  switch (status) {
    case "connected":
      return "ok";
    case "connecting":
      return "pending";
    case "disabled":
    case "inactive":
    case "not_connected":
      return "muted";
    case "configured":
      return "warn";
  }
}
