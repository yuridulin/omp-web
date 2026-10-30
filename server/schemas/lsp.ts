import { z } from "zod";

const positionSchema = z.object({ line: z.number(), character: z.number() });

export const lspDiagnosticSchema = z.object({
  range: z.object({ start: positionSchema, end: positionSchema }),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  code: z.union([z.string(), z.number()]).optional(),
  source: z.string().optional(),
  message: z.string(),
});

const documentFailureReasons = [
  "disabled",
  "unsupported_language",
  "missing_server",
  "server_failed",
  "document_limit",
  "root_limit",
  "document_not_open",
] as const;

export const lspDocumentResultSchema = z.union([
  z.object({ ok: z.literal(true), server: z.string(), version: z.number() }),
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(documentFailureReasons),
    hint: z.string().optional(),
    error: z.string().optional(),
  }),
]);

const openDocumentBody = z.object({
  action: z.literal("open"),
  root: z.string(),
  path: z.string(),
  languageId: z.string().optional(),
  text: z.string(),
});

const changeDocumentBody = z.object({
  action: z.literal("change"),
  root: z.string(),
  path: z.string(),
  text: z.string(),
});

const closeDocumentBody = z.object({
  action: z.literal("close"),
  root: z.string(),
  path: z.string(),
});

export const lspDocumentBodySchema = z.union([openDocumentBody, changeDocumentBody, closeDocumentBody]);

export const lspDiagnosticsSnapshotSchema = z.object({
  available: z.boolean(),
  server: z.string().nullable(),
  version: z.number().nullable(),
  diagnostics: z.array(lspDiagnosticSchema),
});
