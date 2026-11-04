import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { pickDirectoryDialog } from "@/lib/native-dialog";

export const contract = routeContract({
  POST: {
    summary: "Open the host's native folder dialog and return the chosen directory (null when cancelled)",
    request: {
      body: z.object({
        /** Directory the dialog opens in. */
        cwd: z.string().optional(),
        /** Instruction text shown above the folder tree. */
        title: z.string().optional(),
      }).optional(),
    },
    responses: {
      200: z.object({ path: z.string().nullable() }),
      409: errorEnvelope,
      503: errorEnvelope,
    },
  },
});

// POST /api/workspace/cwd/pick  body: { cwd?, title? }  →  { path: string | null }
// The dialog belongs to this process because a page cannot open a native one and
// `showDirectoryPicker` never reveals the absolute path. The request stays open
// until the user answers; the server is loopback-only by default, so the dialog
// appears on the machine that also owns the filesystem.
export async function POST(req: Request) {
  const parsed = await readJson<{ cwd?: unknown; title?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};
  const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  const result = await pickDirectoryDialog({
    ...(cwd ? { defaultPath: cwd } : {}),
    ...(title ? { title } : {}),
  });

  if (result.kind === "busy") {
    return json({ error: "A folder dialog is already open", code: "dialog_busy" }, { status: 409 });
  }
  if (result.kind === "unavailable") {
    return json({ error: result.reason, code: "dialog_unavailable" }, { status: 503 });
  }
  return json({ path: result.kind === "picked" ? result.path : null });
}
