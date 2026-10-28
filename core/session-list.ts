import { isRecord } from "./guards";

/**
 * Session-list scanning: session metadata from a small file prefix plus a tail
 * window, without reading the whole file.
 *
 * A host supplies the windows (and an optional full-file fallback for the
 * first user message); everything here is parsing over strings. The prefix is
 * counted as a lower bound, not the exact message count — the list never
 * needs to open a multi-megabyte transcript to render a row.
 */

export const SESSION_LIST_PREFIX_BYTES = 4096;
export const SESSION_LIST_SUFFIX_BYTES = 32_768;

export type SessionStatus = "complete" | "interrupted" | "aborted" | "error" | "pending" | "unknown";

export interface ScannedSessionInfo {
  path: string;
  id: string;
  cwd: string;
  title?: string;
  parentSessionPath?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  size: number;
  firstMessage: string;
  status?: SessionStatus;
  /** Timestamp of the last message entry in the tail window (when scanned with status). */
  lastMessageAt?: Date;
}

export interface ScanSessionOptions {
  path: string;
  /** The first SESSION_LIST_PREFIX_BYTES of the file, decoded as UTF-8. */
  prefix: string;
  /** The last SESSION_LIST_SUFFIX_BYTES of the file; empty when status is skipped. */
  suffix?: string;
  size: number;
  modified: Date;
  withStatus?: boolean;
  /**
   * Called only when the prefix holds no user message (injected context can
   * push it past the window). The host streams the file's lines through
   * `firstUserMessageFromLines`; the result is capped to the prefix size.
   */
  scanFirstUserMessage?: () => string;
}

function decodeJsonStringFragment(value: string): string {
  const safeValue = value.endsWith("\\") ? value.slice(0, -1) : value;
  try {
    return JSON.parse(`"${safeValue}"`) as string;
  } catch {
    return safeValue
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

/** Raw-text string-property scan used on the possibly-truncated prefix window. */
export function extractStringProperty(source: string, name: string, startIndex = 0): string | undefined {
  const propertyIndex = source.indexOf(`"${name}"`, startIndex);
  if (propertyIndex === -1) return undefined;
  const colonIndex = source.indexOf(":", propertyIndex + name.length + 2);
  if (colonIndex === -1) return undefined;

  let valueIndex = colonIndex + 1;
  while (valueIndex < source.length) {
    const char = source.charCodeAt(valueIndex);
    if (char !== 32 && char !== 9 && char !== 10 && char !== 13) break;
    valueIndex++;
  }
  if (source.charCodeAt(valueIndex) !== 34) return undefined;

  const valueStart = valueIndex + 1;
  let escaped = false;
  for (let i = valueStart; i < source.length; i++) {
    const char = source.charCodeAt(i);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === 92) {
      escaped = true;
      continue;
    }
    if (char === 34) {
      return decodeJsonStringFragment(source.slice(valueStart, i));
    }
  }
  return decodeJsonStringFragment(source.slice(valueStart));
}

function countMessageMarkers(content: string): number {
  let count = 0;
  let index = 0;
  while (index < content.length) {
    const typeIndex = content.indexOf('"type"', index);
    if (typeIndex === -1) break;
    const colonIndex = content.indexOf(":", typeIndex + 6);
    if (colonIndex === -1) break;
    if (extractStringProperty(content, "type", typeIndex) === "message") count++;
    index = colonIndex + 1;
  }
  return count;
}

/** First displayable message text visible in the prefix (user wins). */
export function extractFirstDisplayMessageFromPrefix(content: string): string | undefined {
  let fallback: string | undefined;
  let index = content.indexOf('"role"');
  while (index !== -1) {
    const role = extractStringProperty(content, "role", index);
    const text = extractStringProperty(content, "content", index) ?? extractStringProperty(content, "text", index);
    if (text) {
      if (role === "user") return text;
      if (!fallback && (role === "developer" || role === "assistant")) fallback = text;
    }
    index = content.indexOf('"role"', index + 6);
  }
  return fallback;
}

export function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const text: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") text.push(block.text);
  }
  return text.join(" ");
}

/**
 * The first user prompt from a session's lines, for prefixes that did not
 * reach it. A `skill-prompt` custom message stands in for the invocation.
 */
export function firstUserMessageFromLines(lines: Iterable<string>): string {
  for (const line of lines) {
    if (!line.includes('"user"') && !line.includes('"skill-prompt"')) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      // Torn or hand-edited line: skip it.
      continue;
    }
    if (!isRecord(entry)) continue;
    const message = isRecord(entry.message) ? entry.message : undefined;
    if (entry.type === "message" && message?.role === "user") {
      const text = extractTextFromContent(message.content);
      if (text) return text;
    }
    if (entry.type === "custom_message" && entry.customType === "skill-prompt") {
      const content = typeof entry.content === "string" ? entry.content : "";
      const parts = content.split(/\nUser:\s*/);
      if (parts.length > 1 && parts[parts.length - 1].trim()) return parts[parts.length - 1].trim();
      const skillMatch = /User invoked the "([^"]+)" skill/.exec(content);
      if (skillMatch && skillMatch[1]) return `Skill: ${skillMatch[1]}`;
    }
  }
  return "";
}

interface TailMessage {
  role?: string;
  stopReason?: string;
  content?: unknown;
}

/** Lifecycle status implied by the last message of a turn. */
export function statusFromTailMessage(message: TailMessage): SessionStatus {
  switch (message.role) {
    case "assistant": {
      switch (message.stopReason) {
        case "error":
          return "error";
        case "aborted":
          return "aborted";
        case "length":
          return "interrupted";
      }
      const content = message.content;
      if (Array.isArray(content) && content.some((block) => isRecord(block) && block.type === "toolCall")) {
        return "interrupted";
      }
      return "complete";
    }
    case "toolResult":
      return "interrupted";
    case "user":
      return "pending";
    default:
      return "unknown";
  }
}

/** The tail window's last message entry: lifecycle status plus its timestamp. */
export function scanTailMessage(suffix: string): { status: SessionStatus; lastMessageAt?: Date } {
  if (!suffix) return { status: "unknown" };
  const lines = suffix.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Every persisted entry starts with "{" — cheaply skips blank lines and
    // the leading partial fragment of the tail window.
    if (line.charCodeAt(0) !== 123) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
    const at = typeof entry.timestamp === "string" ? new Date(entry.timestamp) : undefined;
    return {
      status: statusFromTailMessage(entry.message),
      lastMessageAt: at && !Number.isNaN(at.getTime()) ? at : undefined,
    };
  }
  return { status: "unknown" };
}

export interface SessionListHeader {
  id: string;
  cwd?: string;
  title?: string;
  parentSession?: string;
  timestamp?: string;
}

/** An empty slot title suppresses the header's stale title instead of showing it. */
function normalizeTitleOverride(title: string | undefined): string | null | undefined {
  if (title === undefined) return undefined;
  return title.trim() ? title : null;
}

function sessionListHeaderFromRecord(
  record: Record<string, unknown> | undefined,
  titleOverride?: string | null,
): SessionListHeader | undefined {
  if (!record || record.type !== "session" || typeof record.id !== "string") return undefined;
  return {
    id: record.id,
    cwd: typeof record.cwd === "string" ? record.cwd : undefined,
    title:
      titleOverride === null
        ? undefined
        : (titleOverride ?? (typeof record.title === "string" ? record.title : undefined)),
    parentSession: typeof record.parentSession === "string" ? record.parentSession : undefined,
    timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined,
  };
}

function parseSessionListHeaderLine(line: string, titleOverride?: string | null): SessionListHeader | undefined {
  if (extractStringProperty(line, "type") !== "session") return undefined;
  const id = extractStringProperty(line, "id");
  if (!id) return undefined;
  return {
    id,
    cwd: extractStringProperty(line, "cwd"),
    title: titleOverride === null ? undefined : (titleOverride ?? extractStringProperty(line, "title")),
    parentSession: extractStringProperty(line, "parentSession"),
    timestamp: extractStringProperty(line, "timestamp"),
  };
}

/**
 * Parse the header from the prefix window; a title-slot title overrides the
 * header title. Falls back to a raw-text scan when the header line straddles
 * the window.
 */
export function parseSessionListHeader(
  content: string,
  entries: Array<Record<string, unknown>>,
): SessionListHeader | undefined {
  const firstEntry = entries[0];
  const parsedSlotTitle = normalizeTitleOverride(
    firstEntry?.type === "title" && typeof firstEntry.title === "string" ? firstEntry.title : undefined,
  );
  const parsedHeader = sessionListHeaderFromRecord(entries[firstEntry?.type === "title" ? 1 : 0], parsedSlotTitle);
  if (parsedHeader) return parsedHeader;

  let slotTitle: string | null | undefined = parsedSlotTitle;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // The slot is line 1; a later `type:"title"` cannot occur (titles are
    // `title_change` entries), so skipping it by type is safe.
    if (extractStringProperty(line, "type") === "title") {
      if (slotTitle === undefined) slotTitle = normalizeTitleOverride(extractStringProperty(line, "title"));
      continue;
    }
    return parseSessionListHeaderLine(line, slotTitle);
  }
  return undefined;
}

function parseJsonlRecords(content: string): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value)) records.push(value);
    } catch {
      // Torn write or a truncated window: skip the line.
    }
  }
  return records;
}

/** Scan one session file's windows into list metadata; undefined without a header. */
export function scanSessionInfo(options: ScanSessionOptions): ScannedSessionInfo | undefined {
  const { path, prefix, suffix = "", size, modified, withStatus = true } = options;
  const entries = parseJsonlRecords(prefix);
  const header = parseSessionListHeader(prefix, entries);
  if (!header) return undefined;

  let parsedMessageCount = 0;
  let firstMessage = "";
  let shortSummary: string | undefined;
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type === "compaction" && typeof entry.shortSummary === "string") {
      shortSummary = entry.shortSummary;
    }
    if (entry.type === "message" && isRecord(entry.message)) {
      parsedMessageCount++;
      if (entry.message.role === "user" && !firstMessage) {
        firstMessage = extractTextFromContent(entry.message.content);
      }
    }
  }

  // Cap at the prefix size: the list ships firstMessage for every session.
  if (!firstMessage && size > SESSION_LIST_PREFIX_BYTES && options.scanFirstUserMessage) {
    firstMessage = options.scanFirstUserMessage().slice(0, SESSION_LIST_PREFIX_BYTES);
  }
  firstMessage ||= extractFirstDisplayMessageFromPrefix(prefix) ?? "";
  const messageCount = Math.max(parsedMessageCount, countMessageMarkers(prefix));
  const tail = withStatus ? scanTailMessage(suffix) : undefined;
  return {
    path,
    id: header.id,
    cwd: header.cwd ?? "",
    title: header.title ?? shortSummary,
    parentSessionPath: header.parentSession,
    created: new Date(header.timestamp ?? ""),
    modified,
    messageCount,
    size,
    firstMessage: firstMessage || "(no messages)",
    status: tail?.status,
    lastMessageAt: tail?.lastMessageAt,
  };
}
