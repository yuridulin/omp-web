import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { parseFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { isSttAfter, MAX_STT_AUDIO_BYTES, MAX_STT_REQUEST_BYTES, readSttConfig } from "@/lib/stt";
import { listSttJobs, startSttJob } from "@/lib/stt-jobs";
import { sttJobSchema } from "@/server/schemas/system-ops";

export const contract = routeContract({
  GET: {
    summary: "List live transcription jobs for one composer scope, newest first",
    request: { query: z.object({ scope: z.string() }) },
    responses: {
      200: z.looseObject({ jobs: z.array(sttJobSchema) }),
      400: errorEnvelope,
    },
  },
  POST: {
    summary: "Upload audio (multipart: file, optional scope/owner/after) and start a server-side transcription job",
    request: { body: { contentType: "multipart/form-data" } },
    responses: {
      202: z.looseObject({ jobId: z.string() }),
      400: errorEnvelope,
      413: errorEnvelope,
      429: errorEnvelope,
      500: errorEnvelope,
      501: errorEnvelope,
    },
  },
});

const MAX_SCOPE_LENGTH = 1024;

/** GET /api/system/stt?scope=<draft key> — live jobs for that composer, newest first. */
export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  if (!scope || scope.length > MAX_SCOPE_LENGTH) {
    return json({ error: "scope is required", code: "missing_scope" }, { status: 400 });
  }
  return json({ jobs: listSttJobs(scope) });
}

/**
 * POST /api/system/stt (multipart: file, optional scope) — keeps the audio and starts
 * a server-side transcription job. Returns 202 { jobId }; poll
 * GET /api/system/stt/[jobId] for the result.
 */
export async function POST(request: Request) {
  try {
    const config = readSttConfig();
    if (!config) {
      return json(
        { error: "STT not configured. Set OMP_WEB_STT_ENDPOINT or OMP_WEB_STT_MODEL.", code: "stt_not_configured" },
        { status: 501 }
      );
    }

    const formData = await parseFormDataWithinLimit(request, MAX_STT_REQUEST_BYTES);
    const file = formData.get("file");
    if (!file || typeof file === "string" || file.size === 0) {
      return json(
        { error: "Audio file is required", code: "missing_audio_file" },
        { status: 400 }
      );
    }
    if (file.size > MAX_STT_AUDIO_BYTES) {
      return json(
        { error: "Audio file too large (max 25MB)", code: "audio_too_large" },
        { status: 413 }
      );
    }
    const scope = formData.get("scope");
    if (scope !== null && (typeof scope !== "string" || scope.length > MAX_SCOPE_LENGTH)) {
      return json({ error: "Invalid scope", code: "invalid_scope" }, { status: 400 });
    }
    // The uploader's claim token: it gets first claim on the transcript.
    const owner = formData.get("owner");
    // What to do with the transcript (send/steer/followup); absent = insert.
    const after = formData.get("after");
    if (after !== null && !isSttAfter(after)) {
      return json({ error: "Invalid after", code: "invalid_after" }, { status: 400 });
    }

    const jobId = startSttJob(config, {
      audio: file,
      scope: scope || null,
      owner: typeof owner === "string" && owner ? owner.slice(0, 128) : undefined,
      after: after ?? undefined,
    });
    if (!jobId) {
      return json(
        { error: "Too many transcriptions in progress", code: "stt_busy" },
        { status: 429 }
      );
    }
    return json({ jobId }, { status: 202 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json(
        { error: "Audio file too large (max 25MB)", code: "audio_too_large" },
        { status: 413 }
      );
    }
    return json({ error: error instanceof Error ? error.message : String(error), code: "internal_error" }, { status: 500 });
  }
}
