import type { JSX } from "react";
import type { ChatMessage } from "@/api/session-types";
import { MessageImage } from "./MessageImage";
import {
  joinClassNames,
  prettyJson,
  toolResultImages,
  toolResultText,
  type ToolCallBlock,
} from "./transcript";
import styles from "./transcript.module.css";

export interface ToolResultViewProps {
  content: unknown;
  isError?: boolean;
  partial?: boolean;
}

/** Text and images of a tool result; shared by paired and standalone results. */
export function ToolResultView({
  content,
  isError = false,
  partial = false,
}: ToolResultViewProps): JSX.Element {
  const text = toolResultText(content);
  const images = toolResultImages(content);
  const empty = text === "" && images.length === 0;

  return (
    <div
      className={joinClassNames(styles.toolResult, isError && styles.toolResultError)}
      data-error={isError ? "true" : "false"}
    >
      {text !== "" ? <pre className={styles.toolOutput}>{text}</pre> : null}
      {images.length > 0 ? (
        <div className={styles.toolImages}>
          {images.map((src, index) => (
            <MessageImage key={`${index}-${src}`} image={src} alt={`tool result image ${index + 1}`} />
          ))}
        </div>
      ) : null}
      {empty ? (
        <p className={styles.muted}>{partial ? "Partial output…" : "No output."}</p>
      ) : null}
      {partial && !empty ? <span className={styles.toolPartial}>partial</span> : null}
    </div>
  );
}

export interface ToolCallViewProps {
  call: ToolCallBlock;
  result?: ChatMessage | null;
  streaming?: boolean;
}

/** Collapsible tool call with pretty-printed arguments and its paired result. */
export function ToolCallView({ call, result = null, streaming = false }: ToolCallViewProps): JSX.Element {
  const isError = result?.isError === true;
  const hasResult = result !== null;
  const hasArguments = Object.keys(call.input).length > 0;
  const status = isError ? "error" : hasResult ? "done" : streaming ? "running…" : "awaiting result";

  return (
    <details
      className={joinClassNames(styles.toolCall, isError && styles.toolCallError)}
      data-error={isError ? "true" : "false"}
      data-pending={hasResult ? "false" : "true"}
    >
      <summary className={styles.toolSummary}>
        <span className={styles.toolName}>{call.toolName || "tool"}</span>
        <span
          className={joinClassNames(
            styles.toolStatus,
            !hasResult && styles.toolRunning,
            isError && styles.toolError,
          )}
        >
          {status}
        </span>
      </summary>
      <div className={styles.toolBody}>
        {hasArguments ? <pre className={styles.toolArgs}>{prettyJson(call.input)}</pre> : null}
        {result !== null ? (
          <ToolResultView
            content={result.content}
            isError={isError}
            partial={result.partial === true}
          />
        ) : (
          <p className={styles.toolPending}>No result yet.</p>
        )}
      </div>
    </details>
  );
}
