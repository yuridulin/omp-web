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

/** Comparable base that keeps a filesystem root (`/`, `C:/`) usable as a prefix. */
function comparableBase(value: string): string {
  const normalized = normalizeSlashes(value);
  if (normalized === "/") return "/";
  const key = comparablePath(normalized);
  return /^[a-z]:$/.test(key) ? `${key}/` : key;
}

/** True when `filePath` is `root` or lives under it (case-insensitive on Windows). */
export function isPathWithin(filePath: string, root: string): boolean {
  const file = comparablePath(filePath);
  const base = comparableBase(root);
  if (!base) return false;
  if (file === base) return true;
  return file.startsWith(base.endsWith("/") ? base : `${base}/`);
}

/** The most specific root containing `filePath`, or null. */
export function rootForPath(roots: readonly string[], filePath: string): string | null {
  let best: string | null = null;
  let bestLength = -1;
  for (const root of roots) {
    if (!isPathWithin(filePath, root)) continue;
    const length = comparableBase(root).length;
    if (length > bestLength) {
      best = root;
      bestLength = length;
    }
  }
  return best;
}
