#!/usr/bin/env bun
/**
 * Minimal deterministic stand-in for `omp --mode rpc-ui`.
 *
 * The E2E suite points OMP_WEB_OMP_BIN at this script so the API server,
 * browser and terminal tests never need a real model, network access or the
 * user's agent directory. It implements only the frames the web console
 * actually consumes:
 *
 *   - `ready` on stdout, then NDJSON commands on stdin;
 *   - every command answers `{type:"response", id, command, success, data}`;
 *   - `prompt` persists a real session JSONL file (so history refresh works)
 *     and streams a short, realistic event sequence.
 *
 * State always lives under PI_CODING_AGENT_DIR; the real `~/.omp/agent` is
 * never touched.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

const ARGV = process.argv.slice(2);

if (ARGV.includes("--version")) {
  process.stdout.write("omp/0.0.0-e2e\n");
  process.exit(0);
}

const cwdIndex = ARGV.indexOf("--cwd");
const CWD = path.resolve(cwdIndex === -1 ? process.cwd() : (ARGV[cwdIndex + 1] ?? process.cwd()));
const UTILITY_MODE = ARGV.includes("--no-session");
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR
  ? path.resolve(process.env.PI_CODING_AGENT_DIR)
  // Isolation is a hard invariant: without the override, fall back to a
  // throwaway temp root rather than the user's real ~/.omp/agent.
  : path.join(tmpdir(), "omp-web-e2e-agent");

const MODEL = { id: "fake-model", provider: "fake", name: "Fake Model", reasoning: false } as const;

function encodeRelativeSessionDirName(prefix: string, relative: string): string {
  const encoded = relative.replace(/[/\\:]/g, "-");
  return encoded ? (prefix.endsWith("-") ? `${prefix}${encoded}` : `${prefix}-${encoded}`) : prefix;
}

/**
 * Mirrors lib/omp/paths.ts#getSessionDirNameForCwd without importing lib/
 * (the web workspace must not depend on server code). The exact slug is not
 * load-bearing — the server reads the path reported by `get_state` — but
 * matching it keeps the fixture layout recognizable.
 */
function sessionDirNameForCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  const homeRelative = path.relative(homedir(), resolved);
  if (homeRelative === "" || (!homeRelative.startsWith("..") && !path.isAbsolute(homeRelative))) {
    return encodeRelativeSessionDirName("-", homeRelative);
  }
  const tempRelative = path.relative(tmpdir(), resolved);
  if (tempRelative === "" || (!tempRelative.startsWith("..") && !path.isAbsolute(tempRelative))) {
    return encodeRelativeSessionDirName("-tmp", tempRelative);
  }
  return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

const SESSION_ID = UTILITY_MODE ? `e2e-utility-${process.pid}` : `e2e-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const SESSION_FILE = path.join(AGENT_DIR, "sessions", sessionDirNameForCwd(CWD), `${SESSION_ID}.jsonl`);

let messageCount = 0;
let sessionCreated = false;
let lastAssistantText = "";

function writeFrame(frame: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function respond(id: string | undefined, command: string, data: unknown): void {
  writeFrame({ type: "response", id, command, success: true, data });
}

function responseBody(): Record<string, unknown> {
  return {
    sessionId: SESSION_ID,
    sessionFile: SESSION_FILE,
    isStreaming: false,
    isCompacting: false,
    steeringMode: "all",
    followUpMode: "all",
    interruptMode: "immediate",
    autoCompactionEnabled: false,
    messageCount,
    queuedMessageCount: 0,
    queuedMessages: { steering: [], followUp: [] },
    thinkingLevel: "off",
    todoPhases: [],
    model: MODEL,
  };
}

function ensureSessionFile(): void {
  if (sessionCreated) return;
  mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  if (existsSync(SESSION_FILE)) return;
  const header = {
    type: "session",
    version: 3,
    id: SESSION_ID,
    timestamp: new Date().toISOString(),
    cwd: CWD,
  };
  writeFileSync(SESSION_FILE, `${JSON.stringify(header)}\n`, "utf8");
  sessionCreated = true;
}

function appendMessage(entry: Record<string, unknown>): void {
  appendFileSync(SESSION_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

function assistantMessage(text: string): Record<string, unknown> {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model: MODEL.id,
    provider: MODEL.provider,
    stopReason: "complete",
    timestamp: Date.now(),
  };
}

/** Persist the turn before acking, so the server's history refresh always sees it. */
function runPrompt(id: string | undefined, command: Record<string, unknown>): void {
  const promptText = typeof command.message === "string"
    ? command.message
    : typeof command.text === "string"
      ? command.text
      : "";
  const replyText = `E2E response: ${promptText}`;
  lastAssistantText = replyText;

  if (!UTILITY_MODE) {
    ensureSessionFile();
    const userId = randomUUID().replace(/-/g, "").slice(0, 8);
    const assistantId = randomUUID().replace(/-/g, "").slice(0, 8);
    const timestamp = new Date().toISOString();
    appendMessage({
      type: "message",
      id: userId,
      parentId: null,
      timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text: promptText }],
        timestamp: Date.now(),
      },
    });
    appendMessage({
      type: "message",
      id: assistantId,
      parentId: userId,
      timestamp,
      message: assistantMessage(replyText),
    });
    messageCount += 2;
  }

  respond(id, typeof command.type === "string" ? command.type : "prompt", { agentInvoked: true });

  // Realistic interleaved event frames with small delays. The final transcript
  // comes from the JSONL file on agent_end's history refresh, so these frames
  // only drive the live spinner/cursor.
  const turnId = randomUUID().replace(/-/g, "").slice(0, 8);

  setTimeout(() => {
    writeFrame({ type: "agent_start", turnId });
  }, 5);
  setTimeout(() => {
    writeFrame({
      type: "message_start",
      message: assistantMessage(""),
    });
  }, 10);
  setTimeout(() => {
    writeFrame({
      type: "message_update",
      message: assistantMessage(replyText),
    });
  }, 20);
  setTimeout(() => {
    writeFrame({
      type: "message_end",
      message: assistantMessage(replyText),
    });
  }, 30);
  setTimeout(() => {
    writeFrame({ type: "agent_end", isTerminal: true, messages: [] });
  }, 40);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let command: Record<string, unknown>;
  try {
    command = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return;
  }
  const id = typeof command.id === "string" ? command.id : undefined;
  const type = typeof command.type === "string" ? command.type : "";

  switch (type) {
    case "get_state":
      respond(id, type, responseBody());
      return;
    case "get_available_models":
      respond(id, type, { models: [MODEL] });
      return;
    case "get_login_providers":
      respond(id, type, { providers: [] });
      return;
    case "generate_title":
      respond(id, type, { title: "E2E Session" });
      return;
    case "set_model":
      respond(id, type, MODEL);
      return;
    case "set_thinking_level":
      respond(id, type, { thinkingLevel: command.level ?? "off" });
      return;
    case "get_last_assistant_text":
      respond(id, type, { text: lastAssistantText });
      return;
    case "negotiate_protocol":
      respond(id, type, { protocolVersion: Number(command.protocolVersion ?? 2) });
      return;
    case "prompt":
    case "steer":
    case "follow_up":
      runPrompt(id, command);
      return;
    default:
      // Every other omp command is irrelevant to these flows; a successful
      // null keeps startup handshakes and utility probes happy.
      respond(id, type, null);
  }
});

// The server owns stdin; when it exits the pipe closes and so do we.
rl.on("close", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

writeFrame({ type: "ready" });
