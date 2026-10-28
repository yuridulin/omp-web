import type { AgentMessage } from "@/lib/types";
import { isRecord } from "./guards";

/**
 * Pure session usage statistics.
 *
 * Counting mirrors the front end's `sessionStats` memo exactly: role tallies
 * over the transcript, usage summed per assistant turn, and the context gauge
 * passed in by the host rather than computed from a live store.
 */

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

export interface SessionStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: TokenTotals;
  cost: number;
  contextUsage?: ContextUsage;
}

/**
 * Parse an untrusted context-usage payload. A usable window is mandatory;
 * the two optional numbers degrade to `null` instead of rejecting the whole
 * value, so a gauge with one bad field still shows the window.
 */
export function parseContextUsage(raw: unknown): ContextUsage | null {
  if (!isRecord(raw)) return null;
  const contextWindow = raw.contextWindow;
  if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return null;
  }
  const percent =
    typeof raw.percent === "number" && Number.isFinite(raw.percent) ? raw.percent : null;
  const tokens =
    typeof raw.tokens === "number" && Number.isFinite(raw.tokens) && raw.tokens >= 0
      ? raw.tokens
      : null;
  return { percent, contextWindow, tokens };
}

/** A throughput sample is only meaningful when finite and strictly positive. */
export function throughputSample(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** Tokens as a percentage of the window, clamped to 0..100 and rounded to one decimal. */
export function contextPercent(tokens: number | null, contextWindow: number): number | null {
  if (tokens === null || !(contextWindow > 0)) return null;
  const value = (tokens / contextWindow) * 100;
  if (Number.isNaN(value)) return null;
  const clamped = Math.min(100, Math.max(0, value));
  return Math.round(clamped * 10) / 10;
}

/** Add up token usage and message counts for a transcript. */
export function deriveSessionStats(
  messages: readonly AgentMessage[],
  contextUsage?: ContextUsage | null,
): SessionStats | null {
  const tokens: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  let cost = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let toolResults = 0;

  for (const message of messages) {
    if (message.role === "user") userMessages += 1;
    if (message.role === "toolResult") toolResults += 1;
    if (message.role !== "assistant") continue;

    assistantMessages += 1;
    const content = message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "toolCall") toolCalls += 1;
      }
    }

    const usage = message.usage;
    if (!usage) continue;
    tokens.input += usage.input ?? 0;
    tokens.output += usage.output ?? 0;
    tokens.cacheRead += usage.cacheRead ?? 0;
    tokens.cacheWrite += usage.cacheWrite ?? 0;
    cost += usage.cost?.total ?? 0;
  }

  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  if (messages.length === 0 && tokens.total === 0) return null;

  const stats: SessionStats = {
    userMessages,
    assistantMessages,
    toolCalls,
    toolResults,
    totalMessages: messages.length,
    tokens,
    cost,
  };
  if (contextUsage) stats.contextUsage = contextUsage;
  return stats;
}
