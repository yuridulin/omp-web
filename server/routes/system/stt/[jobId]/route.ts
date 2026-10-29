import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { readSttConfig } from "@/lib/stt";
import { closeSttJob, getSttJob, retrySttJob } from "@/lib/stt-jobs";
import { sttClaimSchema, sttJobSchema } from "@/server/schemas/system-ops";

type Params = { params: Promise<{ jobId: string }> };

export const contract = routeContract({
  GET: {
    summary: "Poll a transcription job (status only; the transcript is returned by claiming it)",
    responses: {
      200: sttJobSchema,
      404: errorEnvelope,
    },
  },
  POST: {
    summary: "Retry a failed transcription job with the audio the server kept",
    request: { query: z.object({ owner: z.string().optional() }) },
    responses: {
      200: sttJobSchema,
      404: errorEnvelope,
      429: errorEnvelope,
      501: errorEnvelope,
    },
  },
  DELETE: {
    summary: "Claim a finished transcript (claim token), or discard the job when no claim is given",
    request: {
      query: z.object({
        claim: z.string().optional(),
        owner: z.string().optional(),
      }),
    },
    responses: {
      200: sttClaimSchema,
      404: errorEnvelope,
    },
  },
});

const notFound = () =>
  json({ error: "Transcription job not found", code: "stt_job_not_found" }, { status: 404 });

/**
 * GET /api/system/stt/[jobId] — { id, status: "pending" | "done" | "error" | "gone", error? },
 * or 404 for an unknown/expired job. The transcript is never here: claim it
 * with DELETE ?claim=<token>. "gone" means another browser claimed or
 * discarded it. Job failures are 200 payloads, not 5xx, so an intermediate
 * proxy cannot swap them for its own error page.
 */
export async function GET(_req: Request, { params }: Params) {
  const job = getSttJob((await params).jobId);
  return job ? json(job) : notFound();
}

/** POST /api/system/stt/[jobId]?owner=<token> — retry a failed job with the audio the server kept. */
export async function POST(req: Request, { params }: Params) {
  const config = readSttConfig();
  if (!config) {
    return json({ error: "STT not configured. Set OMP_WEB_STT_ENDPOINT or OMP_WEB_STT_MODEL.", code: "stt_not_configured" }, { status: 501 });
  }
  const owner = new URL(req.url).searchParams.get("owner")?.slice(0, 128) || undefined;
  const job = retrySttJob(config, (await params).jobId, owner);
  if (job === "busy") {
    return json({ error: "Too many transcriptions in progress", code: "stt_busy" }, { status: 429 });
  }
  return job ? json(job) : notFound();
}

/**
 * DELETE /api/system/stt/[jobId]?claim=<instance token>&owner=<tab token> — claim a
 * finished transcript, or (without `claim`) discard the job. Returns the job
 * as it was before closing: only the first claimer of a "done" job sees
 * status "done" with its text (repeatable with the same claim token), and
 * only the job's owner also gets its send/queue `after`; everyone else sees
 * "gone".
 */
export async function DELETE(req: Request, { params }: Params) {
  const query = new URL(req.url).searchParams;
  const claim = query.get("claim")?.slice(0, 128) || undefined;
  const owner = query.get("owner")?.slice(0, 128) || undefined;
  const job = closeSttJob((await params).jobId, claim, owner);
  return job ? json(job) : notFound();
}
