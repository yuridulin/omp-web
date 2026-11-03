import { useEffect, useRef, useState, type JSX } from "react";
import type { SubagentRow } from "@/api/subagents";
import { setWorkbenchView, updateLayout } from "@/layout/layout-store";
import { useActiveSubagents } from "@/state/use-subagents";
import { formatElapsed } from "@/features/agents/format";
import { openAgent } from "@/features/agents/open-agent";
import { AgentIcon } from "./icons";
import type { RunningAgentsClasses } from "./classes";

export interface RunningAgentsStripProps {
  sessionId: string;
  classes: RunningAgentsClasses;
  /** Rows beyond this collapse into "+N more". */
  limit?: number;
}

/**
 * Who is working right now, above the composer.
 *
 * Subscribes to the running slice of the roster itself — the strip is the only
 * thing that repaints while agents work, never the transcript or the workbench.
 * A click opens (or focuses) that agent's read-only tab.
 */
export function RunningAgentsStrip({
  sessionId,
  classes,
  limit = 3,
}: RunningAgentsStripProps): JSX.Element | null {
  const running = useActiveSubagents(sessionId);
  // Elapsed time needs a local tick: the server only sends a snapshot when the
  // agent reports progress, which can pause during one long tool call.
  const [now, setNow] = useState(() => Date.now());
  const anchors = useRef(new Map<string, { at: number; duration: number }>());
  const active = running.length > 0;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const shown = running.slice(0, limit);
  const hidden = running.length - shown.length;

  return (
    <div className={classes.strip} role="status" aria-label="Running agents">
      {shown.map((row) => (
        <button
          key={row.id}
          type="button"
          className={classes.row}
          onClick={() => openAgent(sessionId, row.id, row.id)}
          title={row.task ?? row.id}
        >
          <AgentIcon size={14} className={classes.icon} />
          <span className={classes.name}>{row.id}</span>
          <span className={classes.task}>{summaryOf(row)}</span>
          <span className={classes.state}>
            <span className={classes.pulse} aria-hidden="true" />
            Working
          </span>
          <span className={classes.time}>{formatElapsed(elapsedOf(row, anchors.current, now))}</span>
        </button>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className={classes.more}
          onClick={() => {
            setWorkbenchView(sessionId, "agents");
            updateLayout({ workbenchCollapsed: false });
          }}
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}

/** What the agent is doing: its current tool, else the task's first line. */
function summaryOf(row: SubagentRow): string {
  const tool = row.progress?.currentTool;
  if (tool) return row.progress?.currentToolArgs ? `${tool} · ${row.progress.currentToolArgs}` : tool;
  const task = row.task ?? row.assignment ?? row.description ?? "";
  const line = task.split("\n").find((candidate) => candidate.trim() !== "") ?? "";
  return line.trim();
}

/**
 * Server-reported duration plus the time since it was reported.
 *
 * Re-anchored whenever the reported duration changes, so a pause between
 * snapshots keeps counting locally and a fresh snapshot corrects any drift.
 */
function elapsedOf(
  row: SubagentRow,
  anchors: Map<string, { at: number; duration: number }>,
  now: number,
): number {
  const duration = row.durationMs ?? row.progress?.durationMs ?? 0;
  const anchor = anchors.get(row.id);
  if (!anchor || anchor.duration !== duration) {
    anchors.set(row.id, { at: now, duration });
    return duration;
  }
  return duration + Math.max(0, now - anchor.at);
}
