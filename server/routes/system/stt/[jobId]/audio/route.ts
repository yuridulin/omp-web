import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { getSttJobAudio } from "@/lib/stt-jobs";

export const contract = routeContract({
  GET: {
    summary: "Stream the audio kept with a live job; the body is the uploaded audio type (served as audio/*, or application/octet-stream)",
    responses: {
      200: { contentType: "application/octet-stream" },
      404: errorEnvelope,
    },
  },
});

/** GET /api/system/stt/[jobId]/audio — the recording kept with a live job, for playback in any browser. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const audio = getSttJobAudio((await params).jobId);
  if (!audio) {
    return json({ error: "Transcription job not found", code: "stt_job_not_found" }, { status: 404 });
  }
  // The type came from the uploading browser: serve only a bare audio/* type
  // so a crafted upload cannot render as HTML on this origin.
  const type = /^audio\/[a-z0-9.+-]+/i.exec(audio.type)?.[0] ?? "application/octet-stream";
  return new Response(audio, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(audio.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
