import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { resolveSessionPathOr404 } from "@/lib/api-utils";
import { readCompletionArtifact, readSubagentTranscriptPage, resolveSubagentArtifact, subagentTranscriptPath } from "@/lib/subagent-history";

// Subagent ids are AdjectiveNoun names, optionally dotted for nested spawns
// (OMP allocates hierarchical ids like `Parent.Child`). The grammar bounds the
// value, rejects empty segments and traversal forms, and guarantees the joined
// path cannot escape the sibling dir; symlink escapes are additionally blocked
// by realpath confinement (resolveSubagentArtifact).
const SUBAGENT_ID_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const SUBAGENT_ID_MAX_LENGTH = 100;

export const contract = routeContract({
  GET: {
    summary: "Read a page of a subagent's transcript, or its final completion artifact (mode=completion)",
    request: {
      query: z.object({
        mode: z.enum(["completion"]).optional(),
        fromByte: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({
        sessionFile: z.string(),
        fromByte: z.number().optional(),
        nextByte: z.number().optional(),
        reset: z.boolean().optional(),
        messages: z.array(z.unknown()).optional(),
        completion: z.string().nullable().optional(),
        truncated: z.boolean().optional(),
        error: z.string().optional(),
        totalBytes: z.number().optional(),
      }),
      400: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/**
 * GET /api/agent/sessions/[id]/subagents/[subagentId]?fromByte=N
 *
 * Default: paged transcript of one subagent, read directly from the parent
 * session's sibling artifacts dir. Mirrors the RPC get_subagent_messages
 * response shape so the dialog can fall back to it when no live RPC process
 * knows the file.
 *
 * ?mode=completion: the subagent's final output (`<id>.md`), without loading
 * the transcript — works even for transcripts beyond the readable size cap.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; subagentId: string }> }
) {
  const { id, subagentId } = await params;
  try {
    if (!SUBAGENT_ID_RE.test(subagentId) || subagentId.length > SUBAGENT_ID_MAX_LENGTH) {
      return json({ error: "Invalid subagent id", code: "invalid_subagent_id" }, { status: 400 });
    }
    const sessionResolved = await resolveSessionPathOr404(id);
    if ("notFound" in sessionResolved) return json(sessionResolved.notFound, { status: 404 });
    const filePath = sessionResolved.filePath;
    const searchParams = new URL(req.url).searchParams;
    if (searchParams.get("mode") === "completion") {
      const resolved = resolveSubagentArtifact(filePath, subagentId, ".md");
      if (!resolved) {
        return json({ error: "Subagent completion not found", code: "transcript_not_found" }, { status: 404 });
      }
      // Read the RESOLVED path: re-deriving from the raw session path here
      // would reopen whatever the symlink points at after the check.
      const completion = readCompletionArtifact(resolved);
      return json({
        sessionFile: subagentTranscriptPath(filePath, subagentId),
        completion: completion?.completion ?? null,
        truncated: completion?.truncated ?? false,
      });
    }
    const resolved = resolveSubagentArtifact(filePath, subagentId, ".jsonl");
    if (!resolved) {
      return json({ error: "Subagent transcript not found", code: "transcript_not_found" }, { status: 404 });
    }
    const fromByteRaw = searchParams.get("fromByte");
    const fromByte = fromByteRaw !== null ? Number(fromByteRaw) : 0;
    const page = readSubagentTranscriptPage(resolved, fromByte);
    return json(page);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "internal_error" },
      { status: 500 },
    );
  }
}
