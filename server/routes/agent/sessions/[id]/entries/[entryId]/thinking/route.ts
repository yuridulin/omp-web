import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { getSessionEntries } from "@/lib/session-reader";
import { apiErrorBody, resolveSessionPathOr404 } from "@/lib/api-utils";
import { isRecord } from "@/lib/type-guards";

export const contract = routeContract({
  GET: {
    summary: "Read one deferred thinking block from an assistant message",
    request: {
      query: z.object({ blockIndex: z.string() }),
    },
    responses: {
      200: z.looseObject({ thinking: z.string() }),
      400: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  const blockIndexParam = new URL(req.url).searchParams.get("blockIndex");
  const blockIndex = blockIndexParam === null ? Number.NaN : Number(blockIndexParam);
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0) {
    return json({ error: "Valid blockIndex is required", code: "invalid_block_index" }, { status: 400 });
  }

  try {
    const resolved = await resolveSessionPathOr404(id);
    if ("notFound" in resolved) return json(resolved.notFound, { status: 404 });
    const filePath = resolved.filePath;

    // Lenient JSONL parsing keeps omp's malformed-line tolerance.
    const entry = getSessionEntries(filePath).find((candidate) => candidate.id === entryId);
    if (!entry || entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") {
      return json({ error: "Assistant message not found", code: "assistant_message_not_found" }, { status: 404 });
    }

    const block = entry.message.content[blockIndex];
    if (!block || block.type !== "thinking") {
      return json({ error: "Thinking block not found", code: "thinking_block_not_found" }, { status: 404 });
    }

    return json({ thinking: block.thinking });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
