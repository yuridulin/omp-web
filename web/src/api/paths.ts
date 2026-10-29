/** Browser-safe path helpers for workspace URLs and tree keys. */

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

export function basename(filePath: string): string {
  const normalized = normalizeSlashes(filePath).replace(/\/+$/, "");
  return normalized.split("/").pop() ?? normalized;
}

export function dirname(filePath: string): string {
  const normalized = normalizeSlashes(filePath).replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return "";
  if (slash === 0) return "/";
  if (slash === 2 && /^[a-zA-Z]:\//.test(normalized)) return normalized.slice(0, 3);
  return normalized.slice(0, slash);
}

function isWindowsForm(value: string): boolean {
  return /^[a-zA-Z]:\//.test(value) || value.startsWith("//");
}

export function relativePath(filePath: string, root: string): string {
  const file = normalizeSlashes(filePath);
  const base = normalizeSlashes(root).replace(/\/+$/, "");
  const fileKey = isWindowsForm(file) || isWindowsForm(base) ? file.toLowerCase() : file;
  const baseKey = isWindowsForm(file) || isWindowsForm(base) ? base.toLowerCase() : base;
  if (fileKey === baseKey) return "";
  if (fileKey.startsWith(`${baseKey}/`)) return file.slice(base.length + 1);
  return file;
}

export function joinPath(root: string, ...segments: string[]): string {
  const base = normalizeSlashes(root).replace(/\/+$/, "");
  const tail = segments.map((segment) => normalizeSlashes(segment).replace(/^\/+|\/+$/g, "")).filter(Boolean);
  if (tail.length === 0) return base || "/";
  return `${base}/${tail.join("/")}`;
}

/** Matches `lib/file-paths.ts`; the catch-all route decodes each segment. */
export function filePathApiSegments(filePath: string): string[] {
  const normalized = normalizeSlashes(filePath);
  const isUnc = normalized.startsWith("//");
  const segments = normalized.split("/").filter(Boolean);
  if (isUnc && segments.length > 0) segments[0] = `//${segments[0]}`;
  return segments;
}

export function encodeFilePathForApi(filePath: string): string {
  return filePathApiSegments(filePath).map(encodeURIComponent).join("/");
}

export function fileApiUrl(filePath: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams(query).toString();
  const suffix = params ? `?${params}` : "";
  return `/api/workspace/files/${encodeFilePathForApi(filePath)}${suffix}`;
}

/** Case-insensitive comparable key for Windows-form paths. */
export function comparablePath(value: string): string {
  const normalized = normalizeSlashes(value).replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return isWindowsForm(normalized) ? normalized.toLowerCase() : normalized;
}
