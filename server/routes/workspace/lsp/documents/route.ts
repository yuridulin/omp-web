import path from "node:path";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { requireWorkspace } from "@/server/workspace-access";
import { isAbsoluteFileRequestPath, isFilePathAllowed } from "@/lib/file-access";
import { getFileLanguage } from "@/lib/file-types";
import {
  changeLspDocument,
  closeLspDocument,
  LSP_MAX_DOCUMENT_BYTES,
  openLspDocument,
} from "@/lib/lsp/manager";
import { lspDocumentBodySchema, lspDocumentResultSchema } from "@/server/schemas/lsp";

export const contract = routeContract({
  POST: {
    summary: "Open, change or close one workspace document in its language server",
    request: { body: lspDocumentBodySchema },
    responses: {
      200: lspDocumentResultSchema,
      400: errorEnvelope,
      403: errorEnvelope,
      413: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/** POST /api/workspace/lsp/documents */
export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = lspDocumentBodySchema.safeParse(parsed.body);
  if (!body.success) {
    return json({ error: "Invalid language-server document request", code: "invalid_request" }, { status: 400 });
  }
  const input = body.data;

  const access = await requireWorkspace(input.root);
  if (!access.ok) return access.response;

  if (!isAbsoluteFileRequestPath(input.path)) {
    return json({ error: "path must be an absolute path", code: "path_must_be_absolute" }, { status: 400 });
  }
  const filePath = path.resolve(input.path);
  if (!isFilePathAllowed(filePath, new Set([access.cwd]))) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }

  try {
    if (input.action === "close") {
      closeLspDocument({ root: access.cwd, path: filePath });
      return json({ ok: true });
    }

    if (Buffer.byteLength(input.text, "utf8") > LSP_MAX_DOCUMENT_BYTES) {
      return json({ error: "Document exceeds 2 MiB", code: "document_too_large" }, { status: 413 });
    }

    if (input.action === "change") {
      return json(changeLspDocument({ root: access.cwd, path: filePath, text: input.text }));
    }

    const languageId = input.languageId ?? getFileLanguage(filePath);
    return json(
      await openLspDocument({ root: access.cwd, path: filePath, languageId, text: input.text }),
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "internal_error" },
      { status: 500 },
    );
  }
}
