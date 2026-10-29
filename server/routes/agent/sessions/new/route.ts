import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { apiErrorBody } from "@/lib/api-utils";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { WebRpcError, startRpcSession } from "@/lib/rpc-manager";
import { RpcCommandError } from "@/lib/omp/rpc-process";
import { parseJsonWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { MAX_AGENT_COMMAND_REQUEST_BYTES } from "@/lib/image-attachments";

function newSessionErrorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return json({ error: "New session request is too large", code: "request_too_large" }, { status: 413 });
  }
  if (error instanceof SyntaxError) {
    return json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }
  if (error instanceof WebRpcError || error instanceof RpcCommandError) {
    return json(
      { error: error.message, code: error instanceof WebRpcError ? error.code : (error.code ?? "rpc_command_failed") },
      { status: 400 },
    );
  }
  return json(apiErrorBody(error), { status: 500 });
}
// POST /api/agent/sessions/new  body: { cwd: string; type: string; message?: string; ... }
// Spawns a brand-new omp session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
// Returns { sessionId, data } where sessionId is omp's real session id.
// Model/thinking presets are applied post-ready via RPC set_model /
// set_thinking_level (not CLI flags) so failures surface as command errors and
// the live model catalog (incl. background discovery) is consulted.
export const contract = routeContract({
  POST: {
    summary: "Spawn a new omp session (and optionally send its first command)",
    request: {
      body: z.looseObject({
        cwd: z.string(),
        type: z.string(),
        message: z.string().optional(),
        provider: z.string().optional(),
        modelId: z.string().optional(),
        toolNames: z.array(z.string()).optional(),
        thinkingLevel: z.string().optional(),
        advisor: z.boolean().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ success: z.literal(true), sessionId: z.string(), data: z.unknown() }),
      400: errorEnvelope,
      413: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function POST(req: Request) {
  try {
    const body = await parseJsonWithinLimit<{ cwd?: string; [key: string]: unknown }>(req, MAX_AGENT_COMMAND_REQUEST_BYTES);
    const { cwd, ...command } = body;

    if (!cwd || typeof cwd !== "string") {
      return json({ error: "cwd is required", code: "cwd_required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return json({ error: `Directory does not exist: ${cwd}`, code: "directory_not_found" }, { status: 400 });
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider, modelId, toolNames, thinkingLevel, advisor, ...promptCommand } = command as { provider?: string; modelId?: string; toolNames?: string[]; thinkingLevel?: string; advisor?: boolean; [key: string]: unknown };
    // A session id has no meaning for a fresh spawn and must never reach the
    // child RPC: a stale or forged id would address the wrong session.
    delete promptCommand.sessionId;
    if (typeof promptCommand.type !== "string" || !promptCommand.type.trim()) {
      return json({ error: "command type is required", code: "command_type_required" }, { status: 400 });
    }

    // Must be unique per request: startRpcSession coalesces concurrent callers
    // that share a key onto one session. Date.now() (ms resolution) collides for
    // requests in the same millisecond, merging two new sessions into one.
    const tempKey = `__new__${randomUUID()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, toolNames, advisor === true);

    // Keep the files-route allowed-roots cache (see app/api/workspace/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/workspace/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    allowFileRoot(cwd);
    invalidateSessionListCache();

    try {
      // Apply pre-selected model before sending the prompt
      if (provider && modelId) {
        await session.send({ type: "set_model", provider, modelId });
      }

      // Apply pre-selected thinking level before sending the prompt
      if (thinkingLevel) {
        await session.send({ type: "set_thinking_level", level: thinkingLevel });
      }

      if (promptCommand.type === "ensure_session") {
        return json({ success: true, sessionId: realSessionId, data: null });
      }

      const result = await session.send(promptCommand);

      return json({ success: true, sessionId: realSessionId, data: result });
    } catch (error) {
      // The child was spawned but the prompt never ran: without this cleanup a
      // failed set_model/set_thinking_level/prompt leaves an orphaned omp
      // process and a registry entry nobody will ever use.
      await session.destroyAndWait();
      throw error;
    }
  } catch (error) {
    return newSessionErrorResponse(error);
  }
}
