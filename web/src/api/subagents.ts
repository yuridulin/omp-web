import { api } from "./client";
import { errorInfo } from "./agent";
import { isRecord } from "./guards";
import type { paths } from "./schema";
import type { ChatMessage } from "./session-types";

/**
 * Subagent wire types and fetches.
 *
 * The live roster arrives over the `subagents` channel (contract/events.md);
 * these HTTP calls serve the first paint when that channel is unavailable and
 * the per-agent transcript page.
 */

type RosterPayload = NonNullable<
  paths["/api/agent/sessions/{id}/subagents"]["get"]["responses"][200]["content"]["application/json"]
>;
/** The on-disk row the REST route returns. */
export type SubagentHistoryRow = RosterPayload["subagents"][number];

/**
 * Live extras the `subagents` channel adds on top of the on-disk row (the wire
 * shape is documented in `contract/events.md`, not in the REST contract).
 */
export interface SubagentProgressWire {
  status?: "pending" | "running" | "completed" | "failed" | "aborted";
  currentTool?: string;
  currentToolArgs?: string;
  lastIntent?: string;
  toolCount?: number;
  requests?: number;
  tokens?: number;
  contextTokens?: number;
  contextWindow?: number;
  cost?: number;
  durationMs?: number;
  resolvedModel?: string;
  modelRole?: string;
}

export type SubagentRow = SubagentHistoryRow & {
  progress?: SubagentProgressWire;
  /** Frame stamp of the last live update (ms). */
  lastUpdate?: number;
  source?: "live" | "history";
};

type TranscriptPayload = NonNullable<
  paths["/api/agent/sessions/{id}/subagents/{subagentId}"]["get"]["responses"][200]["content"]["application/json"]
>;
export type SubagentTranscriptPage = TranscriptPayload;

/** One compact live-activity entry (a tool call, an assistant line, a notice). */
export interface SubagentActivityEvent {
  kind: "tool" | "text" | "notice";
  label: string;
  ts: number;
}

/** A complete roster snapshot from the `subagents` channel. */
export interface SubagentsFrame {
  type: "subagents";
  revision: number;
  /** False when the roster came from disk only (no live wrapper). */
  live: boolean;
  roster: SubagentRow[];
  activity: Record<string, SubagentActivityEvent[]>;
  /** Bumped when a subagent's transcript gained content (see events.md). */
  transcriptVersions: Record<string, number>;
}

function parseActivity(value: unknown): SubagentActivityEvent | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "tool" && value.kind !== "text" && value.kind !== "notice") return null;
  if (typeof value.label !== "string" || typeof value.ts !== "number") return null;
  return { kind: value.kind, label: value.label, ts: value.ts };
}

/** Total parse of a `subagents` frame: malformed payloads return null. */
export function parseSubagentsFrame(value: unknown): SubagentsFrame | null {
  if (!isRecord(value) || value.type !== "subagents") return null;
  if (typeof value.revision !== "number" || !Array.isArray(value.roster)) return null;
  const roster = value.roster.filter(
    (row): row is SubagentRow =>
      isRecord(row) && typeof row.id === "string" && typeof row.agent === "string" && typeof row.status === "string",
  );
  const activity: Record<string, SubagentActivityEvent[]> = {};
  if (isRecord(value.activity)) {
    for (const [id, entries] of Object.entries(value.activity)) {
      if (!Array.isArray(entries)) continue;
      const parsed = entries.map(parseActivity).filter((entry): entry is SubagentActivityEvent => entry !== null);
      if (parsed.length > 0) activity[id] = parsed;
    }
  }
  const transcriptVersions: Record<string, number> = {};
  if (isRecord(value.transcriptVersions)) {
    for (const [id, version] of Object.entries(value.transcriptVersions)) {
      if (typeof version === "number" && Number.isFinite(version)) transcriptVersions[id] = version;
    }
  }
  return {
    type: "subagents",
    revision: value.revision,
    live: value.live === true,
    roster,
    activity,
    transcriptVersions,
  };
}

/** On-disk roster of one session. Used when the live channel is unavailable. */
export async function fetchSubagentRoster(sessionId: string): Promise<SubagentRow[]> {
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/subagents", {
    params: { path: { id: sessionId } },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  return Array.isArray(data?.subagents) ? data.subagents : [];
}

export type SubagentPageOptions =
  | { mode: "tail" }
  | { mode: "before"; beforeByte: number }
  | { fromByte: number };

/**
 * One page of a subagent transcript. `mode: "tail"` asks for the last page so a
 * long running transcript opens where the agent is.
 */
export async function fetchSubagentPage(
  sessionId: string,
  subagentId: string,
  options: SubagentPageOptions,
): Promise<SubagentTranscriptPage> {
  const query = "mode" in options
    ? options.mode === "tail"
      ? { mode: "tail" as const }
      : { mode: "before" as const, beforeByte: String(options.beforeByte) }
    : { fromByte: String(options.fromByte) };
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/subagents/{subagentId}", {
    params: { path: { id: sessionId, subagentId }, query },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  if (!data) throw new Error("Unexpected empty subagent transcript response");
  return data;
}

/** The subagent's final output artifact (`<id>.md`), if it produced one. */
export async function fetchSubagentCompletion(sessionId: string, subagentId: string): Promise<string | null> {
  const { data, error, response } = await api.GET("/api/agent/sessions/{id}/subagents/{subagentId}", {
    params: { path: { id: sessionId, subagentId }, query: { mode: "completion" } },
  });
  if (error) throw new Error(errorInfo(error, response.status).message);
  return data?.completion ?? null;
}

/**
 * Contract transcripts are `unknown[]` (omp owns the message shape), so the
 * boundary parses defensively: a row without a role is dropped, never rendered.
 */
export function parseSubagentMessages(raw: readonly unknown[] | undefined): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (message): message is ChatMessage =>
      isRecord(message) && typeof message.role === "string" && message.role.length > 0,
  );
}

/** Tool results keyed by `toolCallId`, the shape `MessageView` looks up. */
export function toolResultsFromMessages(messages: readonly ChatMessage[]): Map<string, ChatMessage> {
  const results = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.role !== "toolResult") continue;
    const id = (message as { toolCallId?: unknown }).toolCallId;
    if (typeof id === "string" && id !== "") results.set(id, message);
  }
  return results;
}
