/**
 * Drag data crossing skins. The payload is plain data; it never carries a
 * React element, a tab id, or a CSS class. Parsing is total: anything that is
 * not a well-formed payload reads as `null`.
 */

export type DragPayload =
  | { kind: "session"; id: string }
  | { kind: "file"; path: string; root: string }
  | { kind: "text"; text: string };

export const DRAG_MIME = "application/x-omp-payload";

export function isDragPayload(value: unknown): value is DragPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  switch (record.kind) {
    case "session":
      return typeof record.id === "string" && record.id.length > 0;
    case "file":
      return typeof record.path === "string"
        && record.path.length > 0
        && typeof record.root === "string"
        && record.root.length > 0;
    case "text":
      return typeof record.text === "string";
    default:
      return false;
  }
}

export function serializeDragPayload(payload: DragPayload): string {
  return JSON.stringify(payload);
}

/** Parse the wire form. Malformed or unknown payloads return `null`. */
export function parseDragPayload(raw: string | null | undefined): DragPayload | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isDragPayload(value) ? value : null;
}

export function writeDragPayload(dataTransfer: DataTransfer, payload: DragPayload): void {
  const raw = serializeDragPayload(payload);
  try {
    dataTransfer.setData(DRAG_MIME, raw);
    // Some hosts only expose text/plain; keep a readable JSON fallback.
    dataTransfer.setData("text/plain", raw);
    dataTransfer.effectAllowed = "copy";
  } catch {
    // A locked-down DataTransfer cannot be written; the gesture still starts.
  }
}

function getData(dataTransfer: DataTransfer, type: string): string | null {
  try {
    const value = dataTransfer.getData(type);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function readDragPayload(dataTransfer: DataTransfer | null | undefined): DragPayload | null {
  if (!dataTransfer) return null;
  return parseDragPayload(getData(dataTransfer, DRAG_MIME) ?? getData(dataTransfer, "text/plain"));
}
