import { api } from "./client";
import type { paths } from "./schema";
import { fileApiUrl } from "./paths";
import { isRecord } from "./guards";

type SessionsPayload = NonNullable<
  paths["/api/agent/sessions"]["get"]["responses"][200]["content"]["application/json"]
>;
export type SessionSummary = SessionsPayload["sessions"][number];

type ProjectsPayload = NonNullable<
  paths["/api/workspace/projects"]["get"]["responses"][200]["content"]["application/json"]
>;
export type ProjectSummary = ProjectsPayload["projects"][number];

type GitStatusPayload = NonNullable<
  paths["/api/workspace/git/status"]["get"]["responses"][200]["content"]["application/json"]
>;
export type GitStatus = GitStatusPayload;
export type GitFileStatus = GitStatusPayload["files"][number];

type GitFilePayload = NonNullable<
  paths["/api/workspace/git/file"]["get"]["responses"][200]["content"]["application/json"]
>;
export type GitFileContents = GitFilePayload;

export type FileWriteBody = NonNullable<
  paths["/api/workspace/files/{path}"]["put"]["requestBody"]
>["content"]["application/json"];

export type FileRenameBody = NonNullable<
  paths["/api/workspace/files/{path}"]["patch"]["requestBody"]
>["content"]["application/json"];

export type FileDeleteQuery = NonNullable<
  paths["/api/workspace/files/{path}"]["delete"]["parameters"]["query"]
>;

export interface UploadResult {
  uploaded: string[];
  skipped: string[];
  errors: { name: string; error: string }[];
}

export interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

export interface FileList {
  path: string;
  entries: FileEntry[];
}

export interface FileContent {
  content: string;
  language: string;
  size: number;
}

function errorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  return `HTTP ${status}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseFileEntry(value: unknown): FileEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string" || typeof value.isDir !== "boolean") return null;
  return {
    name: value.name,
    isDir: value.isDir,
    size: typeof value.size === "number" ? value.size : 0,
    modified: typeof value.modified === "string" ? value.modified : "",
  };
}

export async function fetchFileList(filePath: string, sessionId?: string): Promise<FileList> {
  const response = await fetch(fileApiUrl(filePath, {
    type: "list",
    ...(sessionId ? { sessionId } : {}),
  }));
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body) || !Array.isArray(body.entries)) throw new Error("Malformed file listing");
  const entries = body.entries
    .map(parseFileEntry)
    .filter((entry): entry is FileEntry => entry !== null);
  return { path: typeof body.path === "string" ? body.path : filePath, entries };
}

export async function fetchFileContent(filePath: string, sessionId?: string): Promise<FileContent> {
  const response = await fetch(fileApiUrl(filePath, {
    type: "read",
    ...(sessionId ? { sessionId } : {}),
  }));
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body) || typeof body.content !== "string") throw new Error("Malformed file content");
  return {
    content: body.content,
    language: typeof body.language === "string" ? body.language : "text",
    size: typeof body.size === "number" ? body.size : body.content.length,
  };
}

export async function writeWorkspaceFile(
  filePath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const payload: FileWriteBody = { content, createParents: true };
  const response = await fetch(fileApiUrl(filePath), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body)) throw new Error("Malformed file write response");
  return {
    path: typeof body.path === "string" ? body.path : filePath,
    bytes: typeof body.bytes === "number" ? body.bytes : content.length,
  };
}

export async function renameWorkspacePath(
  from: string,
  to: string,
  overwrite = false,
): Promise<{ from: string; to: string }> {
  const payload: FileRenameBody = { to, overwrite };
  const response = await fetch(fileApiUrl(from), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body)) throw new Error("Malformed file rename response");
  return {
    from: typeof body.from === "string" ? body.from : from,
    to: typeof body.to === "string" ? body.to : to,
  };
}

export async function deleteWorkspacePath(
  filePath: string,
  recursive = false,
): Promise<{ path: string }> {
  const query: FileDeleteQuery = recursive ? { recursive: "1" } : {};
  const response = await fetch(fileApiUrl(filePath, query.recursive ? { recursive: query.recursive } : {}), {
    method: "DELETE",
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  if (!isRecord(body)) throw new Error("Malformed file delete response");
  return { path: typeof body.path === "string" ? body.path : filePath };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseUploadErrors(value: unknown): UploadResult["errors"] {
  if (!Array.isArray(value)) return [];
  const errors: UploadResult["errors"] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    errors.push({
      name: entry.name,
      error: typeof entry.error === "string" ? entry.error : "Upload failed",
    });
  }
  return errors;
}

function parseUploadResult(value: unknown): UploadResult {
  if (!isRecord(value)) return { uploaded: [], skipped: [], errors: [] };
  return {
    uploaded: parseStringArray(value.uploaded),
    skipped: parseStringArray(value.skipped),
    errors: parseUploadErrors(value.errors),
  };
}

export async function uploadWorkspaceFiles(
  directory: string,
  files: File[],
  conflict: "error" | "overwrite" | "skip" = "error",
): Promise<UploadResult> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);
  const response = await fetch(fileApiUrl(directory, { type: "upload", conflict }), {
    method: "POST",
    body: form,
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, response.status));
  return parseUploadResult(body);
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const { data, error, response } = await api.GET("/api/workspace/projects");
  if (error) throw new Error(error.error ?? `HTTP ${response.status}`);
  if (!data) throw new Error("Unexpected empty projects response");
  return data.projects;
}

export async function fetchGitStatus(cwd: string): Promise<GitStatus> {
  const { data, error, response } = await api.GET("/api/workspace/git/status", {
    params: { query: { cwd } },
  });
  if (error) throw new Error(error.error ?? `HTTP ${response.status}`);
  if (!data) throw new Error("Unexpected empty git status response");
  return data;
}

export async function fetchGitFileContents(
  cwd: string,
  filePath: string,
  options: { from?: string; to?: string; oldPath?: string } = {},
): Promise<GitFileContents> {
  const { data, error, response } = await api.GET("/api/workspace/git/file", {
    params: {
      query: {
        cwd,
        path: filePath,
        ...(options.from ? { from: options.from } : {}),
        ...(options.to ? { to: options.to } : {}),
        ...(options.oldPath ? { oldPath: options.oldPath } : {}),
      },
    },
  });
  if (error) throw new Error(error.error ?? `HTTP ${response.status}`);
  if (!data) throw new Error("Unexpected empty git file response");
  return data;
}

type ContextPayload = NonNullable<
  paths["/api/agent/sessions/{id}/context"]["get"]["responses"][200]["content"]["application/json"]
>;

export type SessionContextPayload = ContextPayload;

export async function fetchSessionContext(sessionId: string): Promise<ContextPayload> {
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/context", {
    params: { path: { id: sessionId } },
  });
  if (error) throw new Error(error.error ?? `HTTP ${response.status}`);
  if (!data) throw new Error("Unexpected empty session context");
  return data;
}
