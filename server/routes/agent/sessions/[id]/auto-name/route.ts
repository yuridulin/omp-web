import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { scanSessionInfo, setSessionTitle } from "@/lib/omp/session-files";
import { deriveSessionTitleFromFirstMessage, sanitizeSessionTitle } from "@/lib/session-title";
import { getRpcSession, resolveSpawnCwdResult, startRpcSession, WebRpcError } from "@/lib/rpc-manager";
import { invalidateSessionCaches, readSessionHeader } from "@/lib/session-reader";
import { resolveSessionPathOr404 } from "@/lib/api-utils";

export const contract = routeContract({
  POST: {
    summary: "Generate a session title with omp, falling back to the first user message",
    responses: {
      200: z.looseObject({
        title: z.string(),
        generated: z.boolean(),
        usage: z.unknown().nullable(),
      }),
      404: errorEnvelope,
      409: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/**
 * POST /api/agent/sessions/[id]/auto-name
 *
 * Generates a title with omp's own title generator (the native `generate_title`
 * command, else argument-less `/rename`) through the session's omp process,
 * starting one when the session is not live. omp persists the title itself.
 * When omp cannot generate one (older omp, a run in flight, spawn failure) the
 * endpoint falls back to the existing title, else a title derived from the
 * first user message, and saves that fallback (through the live process when
 * there is one). `generated` tells the caller which path produced the title.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // This runs before the path check because omp does not create the session
    // file until the history holds an assistant message.
    let rpc = getRpcSession(id);
    if (!rpc?.isAlive?.()) {
      const resolved = await resolveSessionPathOr404(id);
      if ("notFound" in resolved) return json(resolved.notFound, { status: 404 });
      try {
        const header = readSessionHeader(resolved.filePath);
        const { cwd } = resolveSpawnCwdResult(header?.cwd);
        rpc = (await startRpcSession(id, resolved.filePath, cwd, undefined, undefined, header?.cwd)).session;
      } catch {
        rpc = undefined; // Fall through to the fallback title.
      }
    }

    if (rpc?.isAlive?.()) {
      try {
        const generated = sanitizeSessionTitle((await rpc.generateTitle()) ?? undefined);
        if (generated) {
          invalidateSessionCaches(rpc.sessionFile);
          return json({ title: generated, generated: true, usage: null });
        }
      } catch (error) {
        // A busy/restarting session reports a typed error the UI can show; any
        // other failure degrades to the fallback below.
        if (error instanceof WebRpcError) {
          return json({ error: error.message, code: error.code }, { status: 409 });
        }
      }
    }

    const resolved = await resolveSessionPathOr404(id);
    if ("notFound" in resolved) return json(resolved.notFound, { status: 404 });
    const filePath = resolved.filePath;

    const info = scanSessionInfo(filePath, false);
    const storedTitle = sanitizeSessionTitle(info?.title);
    if (storedTitle) {
      return json({ title: storedTitle, generated: false, usage: null });
    }

    const derived = deriveSessionTitleFromFirstMessage(info?.firstMessage);
    if (!derived) {
      return json(
        { error: "The session has no user messages to name", code: "session_no_messages_to_name" },
        { status: 409 },
      );
    }

    // Title generation/path resolution yielded; Edit may now own this session.
    if (getRpcSession(id)?.isEditingHistory()) {
      return json({ error: "Wait for the history edit to finish", code: "session_busy" }, { status: 409 });
    }

    // Save title both to disk and through the live process so it persists immediately.
    setSessionTitle(filePath, derived, "auto");
    if (rpc?.isAlive?.()) {
      try {
        await rpc.send({ type: "set_session_name", name: derived });
      } catch {
        // Saved on disk; ignore RPC sync failure.
      }
    }
    invalidateSessionCaches(filePath);
    return json({ title: derived, generated: false, usage: null });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "internal_error" },
      { status: 500 },
    );
  }
}
