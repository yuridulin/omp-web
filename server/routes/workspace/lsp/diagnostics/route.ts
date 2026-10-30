import path from "node:path";
import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { requireWorkspace } from "@/server/workspace-access";
import { isAbsoluteFileRequestPath, isFilePathAllowed } from "@/lib/file-access";
import { getLspDiagnostics } from "@/lib/lsp/manager";
import { lspDiagnosticsSnapshotSchema } from "@/server/schemas/lsp";

export const contract = routeContract({
  GET: {
    summary: "Read the diagnostics published for one workspace document",
    request: { query: z.object({ root: z.string(), path: z.string() }) },
    responses: {
      200: lspDiagnosticsSnapshotSchema,
      400: errorEnvelope,
      403: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/** GET /api/workspace/lsp/diagnostics?root=…&path=… */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const root = url.searchParams.get("root")?.trim() ?? "";
  const rawPath = url.searchParams.get("path")?.trim() ?? "";
  if (!root || !rawPath) {
    return json({ error: "root and path are required", code: "invalid_request" }, { status: 400 });
  }

  const access = await requireWorkspace(root);
  if (!access.ok) return access.response;

  if (!isAbsoluteFileRequestPath(rawPath)) {
    return json({ error: "path must be an absolute path", code: "path_must_be_absolute" }, { status: 400 });
  }
  const filePath = path.resolve(rawPath);
  if (!isFilePathAllowed(filePath, new Set([access.cwd]))) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }

  try {
    return json(getLspDiagnostics(access.cwd, filePath));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "internal_error" },
      { status: 500 },
    );
  }
}
