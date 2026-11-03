import type { ChatMessage } from "@/api/session-types";
import { isRecord } from "@/api/guards";
import { toolResultText, type ToolCallBlock } from "./transcript";

/**
 * Derive the diff block for a settled `edit`/`write` call.
 *
 * omp renders its own diff into `details.diff` — lines of `" 12|text"`,
 * `"-12|text"`, `"+12|text"`, with an empty line between hunks — so this module
 * only reads that format and pairs `-`/`+` runs to find the fragment that
 * actually changed. It never diffs file contents itself: `oldText`/`newText`
 * are stripped from the history payload for size, and a second algorithm could
 * disagree with what the TUI showed.
 *
 * Total at the boundary: anything unparseable yields `null` and the caller
 * keeps the plain tool view.
 */

export type DiffLineKind = "context" | "add" | "remove" | "gap";

export interface DiffLine {
  kind: DiffLineKind;
  /** 1-based line number in the edited file; `null` for a hunk gap. */
  lineNumber: number | null;
  text: string;
  /** Changed fragment within `text`, as code-unit offsets. */
  emphasis: readonly [number, number] | null;
}

export interface ToolDiff {
  /** Absolute path as omp reports it; empty when unknown. */
  path: string;
  adds: number;
  removes: number;
  lines: DiffLine[];
}

const DIFF_LINE = /^([ +-])(\d+)\|(.*)$/;
const RESULT_HEADER = /^\[(.+)#[0-9A-Za-z]+\]$/;

/** Split into code points, keeping the code-unit offset of each one. */
function codePoints(text: string): { chars: string[]; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  let offset = 0;
  for (const char of text) {
    chars.push(char);
    offsets.push(offset);
    offset += char.length;
  }
  offsets.push(offset);
  return { chars, offsets };
}

/**
 * The span that differs between a removed and an added line: everything after
 * their common prefix and before their common suffix. Comparing code points
 * (not code units) keeps an emphasis from splitting a surrogate pair.
 */
function changedSpans(
  before: string,
  after: string,
): readonly [readonly [number, number] | null, readonly [number, number] | null] {
  const a = codePoints(before);
  const b = codePoints(after);
  const limit = Math.min(a.chars.length, b.chars.length);
  let prefix = 0;
  while (prefix < limit && a.chars[prefix] === b.chars[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    a.chars[a.chars.length - 1 - suffix] === b.chars[b.chars.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const beforeEnd = a.chars.length - suffix;
  const afterEnd = b.chars.length - suffix;
  const span = (end: number, offsets: number[]): readonly [number, number] | null =>
    end > prefix ? [offsets[prefix]!, offsets[end]!] : null;
  return [span(beforeEnd, a.offsets), span(afterEnd, b.offsets)];
}

/** Pair each `-` run with the `+` run right after it and mark the change. */
function markEmphasis(lines: DiffLine[]): void {
  let index = 0;
  while (index < lines.length) {
    if (lines[index]!.kind !== "remove") {
      index += 1;
      continue;
    }
    const removes: DiffLine[] = [];
    while (index < lines.length && lines[index]!.kind === "remove") removes.push(lines[index++]!);
    const adds: DiffLine[] = [];
    while (index < lines.length && lines[index]!.kind === "add") adds.push(lines[index++]!);
    for (let pair = 0; pair < Math.min(removes.length, adds.length); pair += 1) {
      const [removed, added] = changedSpans(removes[pair]!.text, adds[pair]!.text);
      removes[pair]!.emphasis = removed;
      adds[pair]!.emphasis = added;
    }
  }
}

/** Read omp's rendered diff; `null` when the text is not in that format. */
export function parseDiffText(text: string): DiffLine[] | null {
  if (text.trim() === "") return null;
  const lines: DiffLine[] = [];
  for (const raw of text.split("\n")) {
    if (raw === "") {
      lines.push({ kind: "gap", lineNumber: null, text: "", emphasis: null });
      continue;
    }
    const match = DIFF_LINE.exec(raw);
    if (!match) return null;
    const lineNumber = Number(match[2]);
    if (!Number.isSafeInteger(lineNumber)) return null;
    const mark = match[1]!;
    lines.push({
      kind: mark === "+" ? "add" : mark === "-" ? "remove" : "context",
      lineNumber,
      text: match[3]!,
      emphasis: null,
    });
  }
  // A trailing newline only proves the text ended; it is not a hunk gap.
  while (lines.length > 0 && lines[lines.length - 1]!.kind === "gap") lines.pop();
  if (lines.length === 0) return null;
  markEmphasis(lines);
  return lines;
}

function countChanges(lines: readonly DiffLine[]): { adds: number; removes: number } {
  let adds = 0;
  let removes = 0;
  for (const line of lines) {
    if (line.kind === "add") adds += 1;
    else if (line.kind === "remove") removes += 1;
  }
  return { adds, removes };
}

function inputPath(call: ToolCallBlock): string {
  const path = call.input.path ?? call.input.file_path;
  return typeof path === "string" ? path.trim() : "";
}

/**
 * Path for the header: omp's own `details.path`, else the `[path#HASH]` header
 * of the result text, else the path the call named.
 */
function diffPath(
  details: Record<string, unknown> | null,
  result: ChatMessage,
  call: ToolCallBlock,
): string {
  if (details !== null && typeof details.path === "string" && details.path.trim() !== "") {
    return details.path.trim();
  }
  const header = toolResultText(result.content).split("\n")[0]?.trim() ?? "";
  const match = RESULT_HEADER.exec(header);
  if (match?.[1]) return match[1];
  return inputPath(call);
}

/** A `write` has no diff of its own: its whole content is one added block. */
function writeDiff(call: ToolCallBlock): ToolDiff | null {
  const content = call.input.content;
  if (typeof content !== "string") return null;
  const lines: DiffLine[] = content.split("\n").map((text, index) => ({
    kind: "add",
    lineNumber: index + 1,
    text,
    emphasis: null,
  }));
  return { path: inputPath(call), adds: lines.length, removes: 0, lines };
}

/**
 * The diff block for a tool call, or `null` when this call should keep the
 * plain view (no result yet, a partial result, a failed edit, no diff data).
 */
export function toolDiff(
  call: ToolCallBlock,
  result: ChatMessage | null | undefined,
): ToolDiff | null {
  if (!result || result.partial === true || result.isError === true) return null;
  const details = isRecord(result.details) ? result.details : null;
  const text = details !== null && typeof details.diff === "string" ? details.diff : "";
  if (text !== "") {
    const lines = parseDiffText(text);
    if (lines) {
      return { path: diffPath(details, result, call), ...countChanges(lines), lines };
    }
  }
  if (call.toolName === "write") return writeDiff(call);
  return null;
}
