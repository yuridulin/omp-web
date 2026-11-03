import { useState, type JSX, type ReactNode } from "react";
import type { TranscriptClasses } from "./classes";
import { useColorizedCode } from "./code-colorize";
import type { DiffLine, ToolDiff } from "./edit-diff";
import type {
  ToolBlock,
  ToolCodeSection,
  ToolDiffSection,
  ToolOutputSection,
  ToolSection,
  ToolTodoSection,
} from "./tool-block";

/** Lines shown before a long body folds behind one control. */
const FOLD_AFTER = 20;

function ShowAll(props: { hidden: number; total: number; classes: TranscriptClasses; onShow(): void }): JSX.Element {
  return (
    <button type="button" className={props.classes.toolFold} onClick={props.onShow}>
      Show all {props.total} lines ({props.hidden} hidden)
    </button>
  );
}

function CodeSection(props: { section: ToolCodeSection; classes: TranscriptClasses }): JSX.Element {
  const { section, classes } = props;
  const html = useColorizedCode(section.language, section.code);
  return (
    <>
      {html === null ? (
        <pre className={classes.toolCode}>{section.code}</pre>
      ) : (
        // Monaco escapes the snippet itself; the HTML is its own span markup.
        <pre className={classes.toolCode} dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {section.output !== "" ? <OutputSection section={{ kind: "output", text: section.output }} classes={classes} /> : null}
    </>
  );
}

function DiffText(props: { line: DiffLine; classes: TranscriptClasses }): JSX.Element {
  const { line, classes } = props;
  if (line.emphasis === null) return <>{line.text}</>;
  const [start, end] = line.emphasis;
  return (
    <>
      {line.text.slice(0, start)}
      <span className={classes.toolDiffEmphasis}>{line.text.slice(start, end)}</span>
      {line.text.slice(end)}
    </>
  );
}

function DiffSection(props: { section: ToolDiffSection; classes: TranscriptClasses }): JSX.Element {
  const { section, classes } = props;
  const diff: ToolDiff = section.diff;
  const [expanded, setExpanded] = useState(false);
  const hidden = diff.lines.length - FOLD_AFTER;
  const shown = expanded || hidden <= 0 ? diff.lines : diff.lines.slice(0, FOLD_AFTER);
  return (
    <div className={classes.toolDiff}>
      {shown.map((line, index) =>
        line.kind === "gap" ? (
          <div key={index} className={classes.toolDiffGap} aria-hidden="true">
            …
          </div>
        ) : (
          <div key={index} className={classes.toolDiffRow} data-kind={line.kind}>
            <span className={classes.toolDiffLineNo}>{line.lineNumber ?? ""}</span>
            <span className={classes.toolDiffMark}>
              {line.kind === "add" ? "+" : line.kind === "remove" ? "-" : ""}
            </span>
            <span className={classes.toolDiffText}>
              <DiffText line={line} classes={classes} />
            </span>
          </div>
        ),
      )}
      {!expanded && hidden > 0 ? (
        <ShowAll hidden={hidden} total={diff.lines.length} classes={classes} onShow={() => setExpanded(true)} />
      ) : null}
    </div>
  );
}

const TASK_GLYPH: Record<string, string> = {
  completed: "✔",
  in_progress: "☐",
  pending: "☐",
};

function TodoSection(props: { section: ToolTodoSection; classes: TranscriptClasses }): JSX.Element {
  const { section, classes } = props;
  return (
    <div className={classes.toolTodo}>
      {section.phases.map((phase, phaseIndex) => {
        const done = phase.tasks.filter((task) => task.status === "completed").length;
        return (
          <div key={`${phase.name}-${phaseIndex}`} className={classes.toolTodoPhase}>
            <div className={classes.toolTodoPhaseName}>
              <span>{phase.name}</span>
              <span className={classes.toolTodoCount}>
                {done}/{phase.tasks.length}
              </span>
            </div>
            {phase.tasks.map((task, taskIndex) => (
              <div
                key={`${task.text}-${taskIndex}`}
                className={classes.toolTodoTask}
                data-status={task.status}
              >
                <span className={classes.toolTodoBox} aria-hidden="true">
                  {TASK_GLYPH[task.status] ?? "☐"}
                </span>
                <span>{task.text}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function OutputSection(props: { section: ToolOutputSection; classes: TranscriptClasses }): JSX.Element {
  const { section, classes } = props;
  const [expanded, setExpanded] = useState(false);
  const lines = section.text === "" ? [] : section.text.split("\n");
  const hidden = lines.length - FOLD_AFTER;
  if (lines.length === 0) {
    return <p className={classes.muted}>No output.</p>;
  }
  const shown = expanded || hidden <= 0 ? lines : lines.slice(0, FOLD_AFTER);
  return (
    <>
      <pre className={classes.toolOutput}>{shown.join("\n")}</pre>
      {!expanded && hidden > 0 ? (
        <ShowAll hidden={hidden} total={lines.length} classes={classes} onShow={() => setExpanded(true)} />
      ) : null}
    </>
  );
}

function sectionBody(section: ToolSection, classes: TranscriptClasses): ReactNode {
  switch (section.kind) {
    case "code":
      return <CodeSection section={section} classes={classes} />;
    case "diff":
      return <DiffSection section={section} classes={classes} />;
    case "todo":
      return <TodoSection section={section} classes={classes} />;
    case "output":
      return <OutputSection section={section} classes={classes} />;
  }
}

export interface ToolBlockViewProps {
  block: ToolBlock;
  classes: TranscriptClasses;
}

/**
 * One tool call as a block: a header the user can scan (badge, what it was for,
 * duration, outcome) and a body shaped by the tool. Noisy tools start folded —
 * their header still says what they did.
 */
export function ToolBlockView({ block, classes }: ToolBlockViewProps): JSX.Element {
  const failed = block.status?.tone === "error";
  const running = block.status?.tone === "running";
  return (
    <details
      className={classes.toolCall}
      data-error={failed ? "true" : "false"}
      data-pending={running ? "true" : "false"}
      {...(block.open ? { open: true } : {})}
    >
      <summary className={classes.toolSummary}>
        <span className={classes.toolBadge}>{block.badge}</span>
        <span className={classes.toolTitle} title={block.title}>
          {block.title}
        </span>
        {block.meta !== "" ? <span className={classes.toolMeta}>{block.meta}</span> : null}
        {block.status !== null ? (
          <span className={classes.toolBlockStatus} data-tone={block.status.tone}>
            {block.status.text}
          </span>
        ) : null}
      </summary>
      <div className={classes.toolBody}>
        {block.sections.map((section, index) => (
          <div key={index} className={classes.toolSection} data-kind={section.kind}>
            {sectionBody(section, classes)}
          </div>
        ))}
      </div>
    </details>
  );
}
