import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { deleteMcpServer, parseMcpListOutput, readDiscoveredMcpServers, readMcpConfig, readUserMcpConfig, type McpLiveServer, validateMcpServer, writeMcpServer } from "@/lib/omp/mcp-config";
import { readSessionHeader, resolveSessionPath } from "@/lib/session-reader";
import { WebRpcError, getRpcSession, resolveSpawnCwdResult, startRpcSession } from "@/lib/rpc-manager";
import { RpcCommandError } from "@/lib/omp/rpc-process";
import { parseJsonWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { redactMcpServer } from "@/lib/omp/mcp-config";

const mcpServerConfigSchema = z.looseObject({
  type: z.enum(["stdio", "http", "sse"]).optional(),
  command: z.string().optional(),
  url: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().optional(),
  requestIdFormat: z.enum(["number", "string"]).optional(),
});

const mcpLiveServerSchema = z.looseObject({
  name: z.string(),
  source: z.string(),
  status: z.enum(["connected", "connecting", "not_connected", "inactive", "disabled", "configured"]),
  type: z.string().optional(),
  sourcePath: z.string().optional(),
});

export const contract = routeContract({
  GET: {
    summary: "List project-level, user-level, and live MCP server configuration",
    request: {
      query: z.object({
        cwd: z.string().optional(),
        sessionId: z.string().optional(),
        live: z.string().optional(),
        advisor: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({
        root: z.string().nullable(),
        path: z.string().nullable(),
        exists: z.boolean(),
        servers: z.array(z.looseObject({ name: z.string(), config: z.record(z.string(), z.unknown()) })),
        user: z.looseObject({
          path: z.string(),
          disabledServers: z.array(z.string()),
          error: z.string().optional(),
          servers: z.array(z.looseObject({
            name: z.string(),
            status: z.enum(["configured", "disabled"]),
            type: z.string(),
            enabled: z.boolean(),
            valid: z.boolean(),
          })),
        }),
        inventory: z.array(mcpLiveServerSchema),
        liveServers: z.array(mcpLiveServerSchema).optional(),
        liveError: z.string().optional(),
      }),
      400: errorEnvelope,
    },
  },
  POST: {
    summary: "Create or update an MCP server in the project config",
    request: {
      body: z.object({
        cwd: z.string(),
        name: z.string(),
        server: mcpServerConfigSchema,
        previousName: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ success: z.literal(true), path: z.string() }),
      400: errorEnvelope,
      413: errorEnvelope,
    },
  },
  PUT: {
    summary: "Validate an MCP server configuration without writing it",
    request: { body: z.object({ name: z.string(), server: mcpServerConfigSchema }) },
    responses: {
      200: z.looseObject({ success: z.literal(true), message: z.string() }),
      400: errorEnvelope,
      413: errorEnvelope,
    },
  },
  DELETE: {
    summary: "Delete an MCP server from the project config",
    request: { body: z.object({ cwd: z.string(), name: z.string() }) },
    responses: {
      200: z.looseObject({ success: z.literal(true), path: z.string() }),
      400: errorEnvelope,
      413: errorEnvelope,
    },
  },
  PATCH: {
    summary: "Enable, disable, or reload an MCP server inside a live session",
    request: {
      body: z.object({
        sessionId: z.string(),
        action: z.enum(["enable", "disable", "reload"]),
        name: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ success: z.literal(true) }),
      400: errorEnvelope,
      409: errorEnvelope,
    },
  },
});

const MAX_MCP_REQUEST_BYTES = 1024 * 1024;

function mcpErrorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return json({ error: "MCP request is too large", code: "request_too_large" }, { status: 413 });
  }
  const message = error instanceof Error ? error.message : String(error);
  return json({
    error: message,
    code: message === "cwd is required" ? "cwd_required"
      : message === "Workspace is not allowed" ? "workspace_not_allowed"
      : "invalid_request",
  }, { status: 400 });
}

/** Stable client-safe message for the GET liveError field: raw child-process
 *  errors (spawn failures, stderr tails) must not reach the browser. */
function sanitizeMcpLiveError(error: unknown): string {
  if (error instanceof WebRpcError || error instanceof RpcCommandError) {
    return error.message;
  }
  console.error("[api/mcp] live server list failed:", error);
  return "Could not load live MCP server states";
}

function mergeMcpServers(primary: McpLiveServer[], secondary: McpLiveServer[]): McpLiveServer[] {
  const result: McpLiveServer[] = primary.map((server) => ({ ...server, sourcePath: secondary.find((other) => other.name === server.name && other.source === server.source)?.sourcePath }));
  const seen = new Set(primary.map((server) => `${server.source}:${server.name}`));
  for (const server of secondary) {
    const key = `${server.source}:${server.name}`;
    if (!seen.has(key)) { result.push(server); seen.add(key); }
  }
  return result;
}

async function allowedCwd(cwd: unknown): Promise<string> {
  if (typeof cwd !== "string" || !cwd.trim()) throw new Error("cwd is required");
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) throw new Error("Workspace is not allowed");
  return cwd;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const requestedCwd = params.get("cwd");
    const cwd = requestedCwd ? await allowedCwd(requestedCwd) : null;
    const file = cwd ? readMcpConfig(cwd) : null;
    const user = readUserMcpConfig();
    const inventory: McpLiveServer[] = [
      ...user.servers.map(({ name, config }) => ({ name, source: "User level", sourcePath: user.path, status: config.enabled === false ? "disabled" as const : "configured" as const, type: typeof config.type === "string" ? config.type : typeof config.url === "string" ? "http" : "stdio" })),
      ...user.disabledServers.map((name) => ({ name, source: "Disabled", sourcePath: user.path, status: "disabled" as const })),
      ...Object.entries(file?.config.mcpServers ?? {}).map(([name, config]) => ({ name, source: "Project level", sourcePath: file?.path, status: config.enabled === false ? "disabled" as const : "configured" as const, type: typeof config.type === "string" ? config.type : typeof config.url === "string" ? "http" : "stdio" })),
      ...readDiscoveredMcpServers(cwd ?? undefined, user.disabledServers),
    ];
    // The user-level config may carry bearer tokens/API keys in `headers` and
    // credentials in `env`. The UI only renders name/status/type/enabled —
    // never serialize the raw user-level server configs to the client.
    const safeUser = {
      path: user.path,
      disabledServers: user.disabledServers,
      error: user.error,
      servers: user.servers.map(({ name, config }) => {
        const type = typeof config.type === "string" && config.type !== "stdio" ? config.type
          : typeof config.url === "string" ? "http" : "stdio";
        const command = typeof config.command === "string" ? config.command.trim() : "";
        const url = typeof config.url === "string" ? config.url.trim() : "";
        const hasCommand = command.length > 0;
        const hasUrl = url.length > 0;
        const valid = (hasCommand || hasUrl) && !(hasCommand && hasUrl) && (type === "http" || type === "sse" ? hasUrl : hasCommand);
        return {
          name,
          status: config.enabled === false ? ("disabled" as const) : ("configured" as const),
          type,
          enabled: config.enabled !== false,
          valid,
        };
      }),
    };
    const sessionId = params.get("sessionId");
    const includeLive = params.get("live") !== "0";
    // Advisor opinion for a fresh spawn only (same ?advisor=1 convention as
    // /api/agent/sessions/[id]): an alive child is reused as-is below, never replaced —
    // listing servers must stay side-effect-free.
    const advisor = params.get("advisor") === "1";
    let liveServers: ReturnType<typeof parseMcpListOutput> | undefined;
    let liveError: string | undefined;
    if (includeLive && sessionId) {
      try {
        let session = getRpcSession(sessionId);
        if (!session?.isAlive()) {
          const sessionFile = await resolveSessionPath(sessionId);
          if (!sessionFile) throw new Error("Session not found");
          const header = readSessionHeader(sessionFile);
          const { cwd } = resolveSpawnCwdResult(header?.cwd);
          // Fresh spawn only (an alive child is reused above): apply the
          // caller's advisor opinion so a racing prompt doesn't inherit a
          // wrong-flag child for its whole turn.
          ({ session } = await startRpcSession(sessionId, sessionFile, cwd, undefined, advisor, header?.cwd));
        }
        liveServers = mergeMcpServers(parseMcpListOutput(await session.getMcpList()), inventory);
      } catch (error) {
        liveError = sanitizeMcpLiveError(error);
      }
    }
    return json({ root: file?.root ?? null, path: file?.path ?? null, exists: file?.exists ?? false, servers: Object.entries(file?.config.mcpServers ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, config]) => ({ name, config: redactMcpServer(config) })), user: safeUser, inventory, liveServers, liveError });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonWithinLimit<{ cwd?: unknown; name?: unknown; previousName?: unknown; server?: unknown }>(request, MAX_MCP_REQUEST_BYTES);
    const cwd = await allowedCwd(body.cwd);
    validateMcpServer(body.name, body.server);
    if (body.previousName !== undefined && typeof body.previousName !== "string") throw new Error("previousName must be a string");
    return json({ success: true, ...writeMcpServer(cwd, body.name as string, body.server, body.previousName) });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await parseJsonWithinLimit<{ name?: unknown; server?: unknown }>(request, MAX_MCP_REQUEST_BYTES);
    validateMcpServer(body.name, body.server);
    return json({ success: true, message: "MCP server configuration is valid" });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await parseJsonWithinLimit<{ cwd?: unknown; name?: unknown }>(request, MAX_MCP_REQUEST_BYTES);
    const cwd = await allowedCwd(body.cwd);
    if (typeof body.name !== "string") throw new Error("name is required");
    return json({ success: true, ...deleteMcpServer(cwd, body.name) });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

/** Native local commands only: never a model prompt or shell command. */
export async function PATCH(request: Request) {
  try {
    const body = await parseJsonWithinLimit<{ sessionId?: unknown; action?: unknown; name?: unknown }>(request, MAX_MCP_REQUEST_BYTES);
    if (typeof body.sessionId !== "string" || !body.sessionId) throw new Error("Select a session first");
    if (body.action !== "enable" && body.action !== "disable" && body.action !== "reload") throw new Error("Invalid MCP action");
    if (body.action !== "reload" && (typeof body.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(body.name))) throw new Error("Invalid MCP server name");
    // Load the selected session through the same validated path as inventory.
    // Do not create a different session or apply the caller's arbitrary cwd.
    let session = getRpcSession(body.sessionId);
    if (!session?.isAlive()) {
      const sessionFile = await resolveSessionPath(body.sessionId);
      if (!sessionFile) throw new Error("Session not found");
      const header = readSessionHeader(sessionFile);
      const { cwd } = resolveSpawnCwdResult(header?.cwd);
      ({ session } = await startRpcSession(body.sessionId, sessionFile, cwd, undefined, undefined, header?.cwd));
    }
    if (session.isRunning()) return json({ error: "Wait for the current run to finish before changing MCP servers.", code: "session_busy" }, { status: 409 });
    await session.changeMcp(body.action, typeof body.name === "string" ? body.name : undefined);
    return json({ success: true });
  } catch (error) {
    const busy = error instanceof WebRpcError && error.code === "session_busy";
    return json({ error: sanitizeMcpLiveError(error), code: busy ? "session_busy" : "invalid_request" }, { status: busy ? 409 : 400 });
  }
}
