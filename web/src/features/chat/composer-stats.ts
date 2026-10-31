import { isRecord } from "@/api/guards";
import type { ChatMessage } from "@/api/session-types";
import { contentBlocks } from "./transcript";

export interface ComposerUsageStats {
  turns: number;
  steps: number;
  tokens: number;
  cacheHit: number | null;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Aggregate the composer status strip from transcript messages. Usage lives on
 * assistant messages; malformed records simply contribute nothing.
 */
export function composerUsageStats(messages: ChatMessage[]): ComposerUsageStats {
  let turns = 0;
  let steps = 0;
  let tokens = 0;
  let cacheRead = 0;
  let input = 0;

  for (const message of messages) {
    if (message.role === "user") turns += 1;
    if (message.role !== "assistant") continue;

    for (const block of contentBlocks(message.content)) {
      if (block.type === "toolCall") steps += 1;
    }

    if (!isRecord(message.usage)) continue;
    const inputTokens = tokenCount(message.usage.input);
    const outputTokens = tokenCount(message.usage.output);
    const cacheReadTokens = tokenCount(message.usage.cacheRead);
    const cacheWriteTokens = tokenCount(message.usage.cacheWrite);
    const totalTokens = tokenCount(message.usage.totalTokens);
    tokens += totalTokens || inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
    cacheRead += cacheReadTokens;
    input += inputTokens;
  }

  const cacheDenominator = input + cacheRead;
  return {
    turns,
    steps,
    tokens,
    cacheHit: cacheDenominator > 0 ? Math.round((cacheRead / cacheDenominator) * 100) : null,
  };
}

/** Compact token counts for the status strip: 950, 12.4K, 3.2M. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions >= 100 ? Math.round(millions) : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}K`;
  }
  return String(Math.round(tokens));
}
