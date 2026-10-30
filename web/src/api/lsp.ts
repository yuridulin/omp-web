import { api } from "./client";
import type { paths } from "./schema";

type DiagnosticsResponse = NonNullable<
  paths["/api/workspace/lsp/diagnostics"]["get"]["responses"][200]["content"]["application/json"]
>;
export type LspDiagnostic = DiagnosticsResponse["diagnostics"][number];
export type LspDiagnosticsSnapshot = DiagnosticsResponse;

type DocumentsResponse = NonNullable<
  paths["/api/workspace/lsp/documents"]["post"]["responses"][200]["content"]["application/json"]
>;
export type LspDocumentResult = DocumentsResponse;

type DocumentsBody = NonNullable<
  paths["/api/workspace/lsp/documents"]["post"]["requestBody"]
>["content"]["application/json"];

export type LspFailureReason = Extract<LspDocumentResult, { ok: false }>["reason"];

async function postDocument(body: DocumentsBody): Promise<LspDocumentResult> {
  const { data, error, response } = await api.POST("/api/workspace/lsp/documents", { body });
  if (error) throw new Error(error.error ?? `HTTP ${response.status}`);
  if (!data) throw new Error("Unexpected empty language-server response");
  return data;
}

export function openLspDocument(input: {
  root: string;
  path: string;
  languageId: string;
  text: string;
}): Promise<LspDocumentResult> {
  return postDocument({ action: "open", ...input });
}

export function changeLspDocument(input: {
  root: string;
  path: string;
  text: string;
}): Promise<LspDocumentResult> {
  return postDocument({ action: "change", ...input });
}

export function closeLspDocument(input: { root: string; path: string }): Promise<LspDocumentResult> {
  return postDocument({ action: "close", ...input });
}

export async function fetchLspDiagnostics(root: string, path: string): Promise<LspDiagnosticsSnapshot> {
  const { data, error, response } = await api.GET("/api/workspace/lsp/diagnostics", {
    params: { query: { root, path } },
  });
  if (error) throw new Error(error.error ?? `HTTP ${response.status}`);
  if (!data) throw new Error("Unexpected empty diagnostics response");
  return data;
}
