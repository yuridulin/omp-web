import type { ChatMessage } from "@/api/session-types";
import { isRecord } from "@/api/guards";
import { toolDiff, type ToolDiff } from "./edit-diff";
import { toolResultText, type ToolCallBlock } from "./transcript";

/**
 * One shape for every tool call in the transcript.
 *
 * omp hands us most of what a block shows in structured form — `details.diff`
 * for an edit, `details.cells` for an eval, `details.phases` for a todo — so
 * this module only reads boundaries and never re-derives content. Everything
 * here is total: an unknown or malformed result still yields a block with an
 * output section, so a call never disappears from the transcript.
 *
 * `open` is the tool's default expansion, not a live UI state: noisy tools
 * (`read`, `grep`, `glob`) stay collapsed, the ones a user actually reads stay
 * open.
 */

export interface ToolBlockStatus {
  text: string;
  tone: "ok" | "error" | "running" | "muted";
}

export interface ToolCodeSection {
  kind: "code";
  /** Monaco language id (`python`, `javascript`, `shell`, …). */
  language: string;
  code: string;
  output: string;
}

export interface ToolDiffSection {
  kind: "diff";
  diff: ToolDiff;
}

export interface ToolTodoTask {
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ToolTodoPhase {
  name: string;
  tasks: ToolTodoTask[];
}

export interface ToolTodoSection {
  kind: "todo";
  phases: ToolTodoPhase[];
}

export interface ToolOutputSection {
  kind: "output";
  text: string;
}

export type ToolSection = ToolCodeSection | ToolDiffSection | ToolTodoSection | ToolOutputSection;

export interface ToolBlock {
  /** Short chip: `JS`, `bash`, `todo`, `edit` … */
  badge: string;
  /** What the call was for: its intent, else the path/pattern/command. */
  title: string;
  /** Quiet facts: duration, line count. */
  meta: string;
  status: ToolBlockStatus | null;
  /** Expanded on first paint. */
  open: boolean;
  sections: ToolSection[];
}

/** Tools whose output is long and rarely the reason the transcript is open. */
const COLLAPSED_TOOLS = new Set(["read", "grep", "glob", "web_search", "fetch"]);

const LANGUAGE_IDS: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  sh: "shell",
  bash: "shell",
  shell: "shell",
  zsh: "shell",
  pwsh: "powershell",
  ps1: "powershell",
  json: "json",
  css: "css",
  html: "html",
  md: "markdown",
  markdown: "markdown",
  csharp: "csharp",
  cs: "csharp",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function languageId(raw: string, fallback = "plaintext"): string {
  if (raw === "") return fallback;
  return LANGUAGE_IDS[raw.toLowerCase()] ?? raw.toLowerCase();
}

function badgeFor(language: string, toolName: string): string {
  if (language === "plaintext") return toolName || "tool";
  const short = Object.keys(LANGUAGE_IDS).find(
    (key) => LANGUAGE_IDS[key] === language && key.length <= 4,
  );
  return (short ?? language).toUpperCase();
}

/** `145ms`, `12.4s`, `3m 20s` — quiet and stable, no locale formatting. */
export function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function parseTodoPhases(value: unknown): ToolTodoPhase[] | null {
  if (!Array.isArray(value)) return null;
  const phases: ToolTodoPhase[] = [];
  for (const rawPhase of value) {
    if (!isRecord(rawPhase) || !Array.isArray(rawPhase.tasks)) continue;
    const tasks: ToolTodoTask[] = [];
    for (const rawTask of rawPhase.tasks) {
      if (!isRecord(rawTask)) continue;
      const content = text(rawTask.content);
      if (content === "") continue;
      const status =
        rawTask.status === "completed" || rawTask.status === "in_progress"
          ? rawTask.status
          : "pending";
      tasks.push({ text: content, status });
    }
    phases.push({ name: text(rawPhase.name), tasks });
  }
  return phases.length > 0 ? phases : null;
}

function todoSection(details: Record<string, unknown> | null): ToolTodoSection | null {
  const phases = details === null ? null : parseTodoPhases(details.phases);
  return phases === null ? null : { kind: "todo", phases };
}

function evalSections(
  details: Record<string, unknown> | null,
  resultText: string,
): { badge: string; title: string; meta: string; sections: ToolCodeSection[]; status: ToolBlockStatus | null } | null {
  const cells = details && Array.isArray(details.cells) ? details.cells : null;
  if (cells === null) return null;
  const sections: ToolCodeSection[] = [];
  let duration = 0;
  let failed = false;
  let finished = 0;
  let title = "";
  let language = "";
  for (const rawCell of cells) {
    if (!isRecord(rawCell)) continue;
    const code = typeof rawCell.code === "string" ? rawCell.code : "";
    if (code.trim() === "") continue;
    const cellLanguage = text(rawCell.language) || text(details?.language);
    if (language === "") language = cellLanguage;
    if (title === "") title = text(rawCell.title);
    if (typeof rawCell.durationMs === "number") duration += rawCell.durationMs;
    const status = text(rawCell.status);
    if (status !== "" && status !== "ok" && status !== "success") failed = true;
    if (typeof rawCell.exitCode === "number" && rawCell.exitCode !== 0) failed = true;
    if (status !== "") finished += 1;
    sections.push({
      kind: "code",
      language: languageId(cellLanguage),
      code,
      output: typeof rawCell.output === "string" ? rawCell.output : "",
    });
  }
  if (sections.length === 0) return null;
  // A cell that reported no output of its own still ended somewhere: the
  // result text is the combined output of the whole eval.
  if (sections.every((section) => section.output === "")) {
    sections[sections.length - 1]!.output = resultText;
  }
  return {
    badge: badgeFor(languageId(language), "eval"),
    title,
    meta: duration > 0 ? durationLabel(duration) : "",
    sections,
    status: failed
      ? { text: "failed", tone: "error" }
      : finished === 0
        ? null
        : { text: "ok", tone: "ok" },
  };
}

function statusOf(
  call: ToolCallBlock,
  result: ChatMessage | null | undefined,
  details: Record<string, unknown> | null,
  resultText: string,
): ToolBlockStatus | null {
  if (!result) return { text: "running…", tone: "running" };
  if (result.isError === true) return { text: "error", tone: "error" };
  if (result.partial === true) return { text: "running…", tone: "running" };
  if (call.toolName === "bash" && typeof details?.exitCode === "number") {
    const code = details.exitCode;
    return code === 0
      ? { text: "exit 0", tone: "ok" }
      : { text: `exit ${code}`, tone: "error" };
  }
  if (resultText.startsWith("Error") || resultText.startsWith("error")) {
    return { text: "error", tone: "error" };
  }
  return null;
}

function commandLine(call: ToolCallBlock): string {
  const command = call.input.command;
  return typeof command === "string" ? command : "";
}

function codeForPython(call: ToolCallBlock): string {
  return typeof call.input.code === "string" ? call.input.code : "";
}

/** The block for one call; `null` only when there is nothing to show yet. */
export function toolBlock(call: ToolCallBlock, result: ChatMessage | null | undefined): ToolBlock | null {
  const details = result && isRecord(result.details) ? result.details : null;
  const resultText = result ? toolResultText(result.content) : "";
  const intent = text(call.input.i) || text(call.input.description);
  const open = !COLLAPSED_TOOLS.has(call.toolName);
  const status = statusOf(call, result, details, resultText);

  if (call.toolName === "todo") {
    const todo = todoSection(details);
    if (todo !== null) {
      const tasks = todo.phases.flatMap((phase) => phase.tasks);
      const done = tasks.filter((task) => task.status === "completed").length;
      return {
        badge: "todo",
        title: intent || todo.phases[0]!.name,
        meta: `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`,
        status:
          tasks.length === 0
            ? null
            : { text: `${done}/${tasks.length}`, tone: done === tasks.length ? "ok" : "muted" },
        open,
        sections: [todo],
      };
    }
  }

  const diff = toolDiff(call, result);
  if (diff) {
    return {
      badge: call.toolName === "write" ? "write" : "edit",
      title: diff.path === "" ? intent : diff.path,
      meta: "",
      status: {
        text: `+${diff.adds} −${diff.removes}`,
        tone: "muted",
      },
      open,
      sections: [{ kind: "diff", diff }],
    };
  }

  if (call.toolName === "eval") {
    const fromDetails = evalSections(details, resultText);
    if (fromDetails) {
      return {
        badge: fromDetails.badge,
        title: intent || fromDetails.title || "eval",
        meta: fromDetails.meta,
        status: fromDetails.status,
        open,
        sections: fromDetails.sections,
      };
    }
    // The history payload drops `details.cells` (code duplicates the call and
    // output duplicates the result text), so the call itself is the source.
    const language = languageId(text(call.input.language), "plaintext");
    const code = typeof call.input.code === "string" ? call.input.code : "";
    if (code !== "") {
      return {
        badge: badgeFor(language, "eval"),
        title: intent || "eval",
        meta: "",
        status,
        open,
        sections: [{ kind: "code", language, code, output: resultText }],
      };
    }
  }

  const command = commandLine(call);
  if (command !== "") {
    const wall = details?.wallTimeMs;
    return {
      badge: call.toolName,
      title: intent || command.split("\n")[0] || call.toolName,
      meta: typeof wall === "number" ? durationLabel(wall) : "",
      status,
      open,
      sections: [
        { kind: "code", language: languageId(call.toolName), code: command, output: resultText },
      ],
    };
  }

  const python = codeForPython(call);
  if (python !== "") {
    return {
      badge: "py",
      title: intent || "python",
      meta: "",
      status,
      open,
      sections: [{ kind: "code", language: "python", code: python, output: resultText }],
    };
  }

  if (!result) return null;
  const title = intent || text(call.input.path) || text(call.input.pattern) || text(call.input.query);
  const totalLines = typeof details?.totalLines === "number" ? details.totalLines : 0;
  return {
    badge: call.toolName || "tool",
    title: title || call.toolName,
    meta: totalLines > 0 ? `${totalLines} lines` : "",
    status,
    open,
    sections: [{ kind: "output", text: resultText }],
  };
}
