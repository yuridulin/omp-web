import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import {
  MAX_INLINE_BASH_OUTPUT_BYTES,
  openRegularFileNoFollow,
  readUtf8FileWithinLimit,
  resolveBashOutputPath,
} from "@/lib/bash-output";
import { isBashOutputPathReferencedBySession } from "@/lib/session-file-references";

export const contract = routeContract({
  GET: {
    summary: "Serve a bash execution's full output (JSON inline, or a text/plain attachment with download=1)",
    request: {
      query: z.object({
        path: z.string().optional(),
        download: z.enum(["1"]).optional(),
      }),
    },
    responses: {
      200: z.looseObject({
        success: z.literal(true),
        data: z.looseObject({ output: z.string() }),
      }),
      400: errorEnvelope,
      403: errorEnvelope,
      404: errorEnvelope,
      413: z.looseObject({
        error: z.string(),
        code: z.string(),
        data: z.looseObject({ size: z.number(), maxBytes: z.number() }),
      }),
    },
  },
});

// GET /api/agent/sessions/[id]/bash-output?path=<absPath>[&download=1]
// Serves the full output of a bash execution whose session entry recorded a
// `fullOutputPath` temp file. Inline display is size-limited (413 when the
// file exceeds MAX_INLINE_BASH_OUTPUT_BYTES); `download=1` streams the file
// without buffering it. Access requires the session to actually reference the
// path — a path alone is never enough.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let path: string | null = null;
  let download = false;
  try {
    const url = new URL(_req.url);
    path = url.searchParams.get("path");
    download = url.searchParams.get("download") === "1";
  } catch {
    return json({ error: "invalid url", code: "invalid_url" }, { status: 400 });
  }

  if (!path) {
    return json({ error: "path required", code: "path_required" }, { status: 400 });
  }

  const resolved = resolveBashOutputPath(path, tmpdir());
  if (!resolved) {
    return json({ error: "invalid path", code: "invalid_path" }, { status: 400 });
  }

  if (!await isBashOutputPathReferencedBySession(resolved, id)) {
    return json({ error: "forbidden", code: "access_denied" }, { status: 403 });
  }

  try {
    if (download) {
      const { handle } = await openRegularFileNoFollow(resolved);
      const stream = Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>;
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"bash-output.log\"",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await readUtf8FileWithinLimit(resolved);
    if (result.tooLarge) {
      return json({
        error: `Full output is too large to display (limit ${MAX_INLINE_BASH_OUTPUT_BYTES} bytes)`,
        code: "output_too_large",
        data: { size: result.size, maxBytes: MAX_INLINE_BASH_OUTPUT_BYTES },
      }, { status: 413 });
    }
    return json({ success: true, data: { output: result.content } });
  } catch {
    return json({ error: "full output unavailable", code: "output_not_found" }, { status: 404 });
  }
}
