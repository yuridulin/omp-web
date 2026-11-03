import type { JSX } from "react";
import type { ChatMessage } from "@/api/session-types";
import type { TranscriptClasses } from "./classes";
import { MessageImage } from "./MessageImage";
import { ToolBlockView } from "./ToolBlockView";
import { toolBlock } from "./tool-block";
import {
  joinClassNames,
  prettyJson,
  toolResultImages,
  toolResultText,
  type ToolCallBlock,
} from "./transcript";

export interface ToolResultViewProps {
  content: unknown;
  classes: TranscriptClasses;
  isError?: boolean;
  partial?: boolean;
}

/** Text and images of a tool result; shared by paired and standalone results. */
export function ToolResultView({
  content,
  classes,
  isError = false,
  partial = false,
}: ToolResultViewProps): JSX.Element {
  const text = toolResultText(content);
  const images = toolResultImages(content);
  const empty = text === "" && images.length === 0;

  return (
    <div
      className={joinClassNames(classes.toolResult, isError && classes.toolResultError)}
      data-error={isError ? "true" : "false"}
    >
      {text !== "" ? <pre className={classes.toolOutput}>{text}</pre> : null}
      {images.length > 0 ? (
        <div className={classes.toolImages}>
          {images.map((src, index) => (
            <MessageImage
              key={`${index}-${src}`}
              image={src}
              classes={classes}
              alt={`tool result image ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
      {empty ? (
        <p className={classes.muted}>{partial ? "Partial output…" : "No output."}</p>
      ) : null}
      {partial && !empty ? <span className={classes.toolPartial}>partial</span> : null}
    </div>
  );
}

export interface ToolCallViewProps {
  call: ToolCallBlock;
  classes: TranscriptClasses;
  result?: ChatMessage | null;
  streaming?: boolean;
}

function firstLine(value: unknown): string {
  if (typeof value !== "string") return "";
  const line = value.split("\n")[0] ?? "";
  return line.trim();
}

/** The short name omp puts on a call (`i`), then a description, then the command or path. */
function toolSummaryLine(call: ToolCallBlock): string {
  const input = call.input;
  return firstLine(input.i)
    || firstLine(input.description)
    || firstLine(input.command)
    || firstLine(input.path)
    || firstLine(input.file_path)
    || firstLine(input.query)
    || firstLine(input.pattern);
}

function isShell(name: string): boolean {
  return name === "bash" || name === "pwsh";
}

/** Collapsible tool call: a one-line summary, and the output only when opened. */
export function ToolCallView({
  call,
  classes,
  result = null,
  streaming = false,
}: ToolCallViewProps): JSX.Element {
  // Every settled call gets the block shell; the plain `<details>` below stays
  // for a call that has nothing to describe yet (no result, no command).
  const block = toolBlock(call, result);
  if (block !== null) return <ToolBlockView block={block} classes={classes} />;

  const isError = result?.isError === true;
  const partial = result?.partial === true;
  const settled = result !== null && !partial;
  const shell = isShell(call.toolName);
  const summary = toolSummaryLine(call);
  const showArgs = !shell && Object.keys(call.input).length > 0;
  const status = isError ? "error" : !settled && (streaming || partial) ? "running…" : !settled && summary === "" ? "awaiting result" : "";
  const forceOpen = streaming && !settled;

  return (
    <details
      className={joinClassNames(classes.toolCall, isError && classes.toolCallError)}
      data-error={isError ? "true" : "false"}
      data-pending={settled ? "false" : "true"}
      {...(forceOpen ? { open: true } : {})}
    >
      <summary className={classes.toolSummary}>
        <span className={classes.toolName}>{call.toolName || "tool"}</span>
        {summary !== "" ? <span className={classes.toolStatus}>{summary}</span> : null}
        {status !== "" ? (
          <span className={joinClassNames(!settled && classes.toolRunning, isError && classes.toolError)}>
            {status}
          </span>
        ) : null}
      </summary>
      <div className={classes.toolBody}>
        {showArgs ? <pre className={classes.toolArgs}>{prettyJson(call.input)}</pre> : null}
        {result !== null ? (
          <ToolResultView
            content={result.content}
            classes={classes}
            isError={isError}
            partial={result.partial === true}
          />
        ) : (
          <p className={classes.toolPending}>No result yet.</p>
        )}
      </div>
    </details>
  );
}
