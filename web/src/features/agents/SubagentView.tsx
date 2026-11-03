import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { toolResultsFromMessages } from "@/api/subagents";
import { MessageView } from "@/features/chat/MessageView";
import type { TranscriptClasses } from "@/features/chat/classes";
import { closeTab, subagentTabId } from "@/layout/layout-store";
import { getAgentRoster } from "@/state/subagents-store";
import { useSubagent } from "@/state/use-subagents";
import { openAgent } from "./open-agent";
import { formatCost, formatDuration, formatElapsed, formatTokens, modelLabel } from "./format";
import { useSubagentTranscript } from "./use-subagent-transcript";
import styles from "./subagent.module.css";

export interface SubagentViewProps {
  sessionId: string;
  subagentId: string;
  /** Transcript styling, supplied by the skin that hosts this panel. */
  classes: TranscriptClasses;
}

const STATUS_LABEL: Record<string, string> = {
  started: "Working",
  completed: "Completed",
  failed: "Failed",
  aborted: "Aborted",
};

/**
 * Read-only view of one subagent: its identity and task now, its transcript
 * next (loaded from the subagent page route, never from the parent stream).
 *
 * Subscribes to its own roster row, so a sibling's progress frame does not
 * re-render this tab.
 */
export function SubagentView({ sessionId, subagentId, classes }: SubagentViewProps): JSX.Element {
  const row = useSubagent(sessionId, subagentId);
  const transcript = useSubagentTranscript(sessionId, subagentId);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const messageCount = transcript.messages.length;
  const toolResults = useMemo(
    () => toolResultsFromMessages(transcript.messages),
    [transcript.messages],
  );

  // Follow the tail only while the reader is already at the bottom: yanking the
  // viewport while someone scrolls history is worse than missing a line.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !atBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messageCount]);

  const handleScroll = (): void => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    atBottomRef.current = distance < 80;
    if (element.scrollTop < 80 && transcript.hasOlder && !transcript.loadingOlder) transcript.loadOlder();
  };

  // Tab-local keys, scoped to this view: a global Escape handler would fight
  // the system panel and the extension dialog, and plain arrows must keep
  // scrolling the transcript.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !rootRef.current?.contains(event.target as Node | null)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeTab(sessionId, subagentTabId(subagentId));
        return;
      }
      if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || !event.altKey) return;
      const roster = getAgentRoster(sessionId)?.roster ?? [];
      const index = roster.findIndex((entry) => entry.id === subagentId);
      if (index < 0) return;
      const next = roster[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      openAgent(sessionId, next.id, next.id);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sessionId, subagentId]);

  const running = row?.status === "started";
  const rawDuration = row?.durationMs ?? row?.progress?.durationMs;
  const duration = typeof rawDuration === "number" && rawDuration > 0 ? rawDuration : undefined;
  const model = modelLabel(row?.resolvedModel ?? row?.progress?.resolvedModel);
  const tokens = formatTokens(row?.tokens ?? row?.progress?.tokens);
  const cost = formatCost(row?.cost ?? row?.progress?.cost);
  const rawTools = row?.toolCount ?? row?.progress?.toolCount;
  // A disk-only snapshot records 0 for agents whose progress was never sampled;
  // printing "Tools 0" reads as a measurement it is not.
  const tools = typeof rawTools === "number" && rawTools > 0 ? rawTools : undefined;
  const task = row?.task ?? row?.assignment ?? row?.description ?? "";
  const status = row ? (STATUS_LABEL[row.status] ?? row.status) : "Not in this session";
  // The task IS the agent's prompt, and the header clamps it to three lines.
  // Measured text beats a layout read here: the toggle must exist in the DOM
  // regardless of the pane width a test renders at.
  const [taskExpanded, setTaskExpanded] = useState(false);
  const taskOverflows = task.split("\n").length > 3 || task.length > 220;

  return (
    <div className={styles.view} ref={rootRef}>
      <header className={styles.header}>
        <div className={styles.headline}>
          <span className={styles.name}>{row?.id ?? subagentId}</span>
          <span
            className={[
              styles.status,
              running ? styles.statusRunning : "",
              row?.status === "failed" ? styles.statusFailed : "",
            ].filter(Boolean).join(" ")}
          >
            {running ? <span className={styles.pulse} aria-hidden="true" /> : null}
            {status}
          </span>
          {row && row.agent !== row.id ? <span className={styles.meta}>{row.agent}</span> : null}
        </div>

        <div className={styles.meta}>
          {duration !== undefined ? (
            <span>
              {running ? "Elapsed" : "Took"} <b>{running ? formatElapsed(duration) : formatDuration(duration)}</b>
            </span>
          ) : null}
          {model ? (
            <span>
              Model <b>{model.effort ? `${model.model} · ${model.effort}` : model.model}</b>
            </span>
          ) : null}
          {tools !== undefined ? (
            <span>
              Tools <b>{tools}</b>
            </span>
          ) : null}
          {tokens !== "" ? (
            <span>
              Tokens <b>{tokens}</b>
            </span>
          ) : null}
          {cost !== "" ? (
            <span>
              Cost <b>{cost}</b>
            </span>
          ) : null}
        </div>

        {task !== "" ? (
          <div className={styles.taskBlock}>
            <div className={taskExpanded ? styles.taskExpanded : styles.task}>{task}</div>
            {taskOverflows ? (
              <button
                type="button"
                className={styles.taskToggle}
                aria-expanded={taskExpanded}
                onClick={() => setTaskExpanded((open) => !open)}
              >
                {taskExpanded ? "Show less" : "Show full prompt"}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className={styles.body} ref={scrollRef} onScroll={handleScroll} aria-label="Subagent transcript">
        {transcript.loadingOlder ? <p className={styles.notice}>Loading earlier steps…</p> : null}
        {transcript.messages.map((message, index) => (
          <MessageView
            key={`${message.role}-${index}`}
            message={message}
            classes={classes}
            toolResults={toolResults}
            sessionId={sessionId}
          />
        ))}
        {transcript.loading ? <p className={styles.notice}>Loading transcript…</p> : null}
        {!transcript.loading && transcript.messages.length === 0 ? (
          <p className={styles.notice}>This agent has not written anything yet.</p>
        ) : null}
        {transcript.error ? <p className={styles.noticeError}>{transcript.error}</p> : null}
      </div>

      <footer className={styles.footer}>
        <span>Transcript is read-only — drive the parent chat instead.</span>
        <span className={styles.spacer} />
        <span>
          <kbd>Alt</kbd>+<kbd>↑</kbd> <kbd>↓</kbd> switch agent
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </footer>
    </div>
  );
}
