import type { JSX } from "react";
import type { ChatMessage } from "@/api/session-types";
import { isRecord } from "@/api/guards";
import { MarkdownBody } from "./MarkdownBody";
import { MessageImage } from "./MessageImage";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallView, ToolResultView } from "./ToolCallView";
import { contentBlocks, joinClassNames, roleLabel } from "./transcript";
import styles from "./transcript.module.css";

export interface MessageViewProps {
  message: ChatMessage;
  toolResults?: ReadonlyMap<string, ChatMessage>;
  sessionId?: string | null;
  entryId?: string | null;
  streaming?: boolean;
}

interface BodyProps {
  message: ChatMessage;
  toolResults: ReadonlyMap<string, ChatMessage> | undefined;
  sessionId: string | null;
  entryId: string | null;
  streaming: boolean;
}

function AssistantBody({ message, toolResults, sessionId, entryId, streaming }: BodyProps): JSX.Element {
  const blocks = contentBlocks(message.content);
  if (blocks.length === 0) {
    return streaming ? <></> : <p className={styles.muted}>(no content)</p>;
  }
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "text":
            return <MarkdownBody key={`text-${index}`} text={block.text} />;
          case "thinking":
            return (
              <ThinkingBlock
                key={`thinking-${index}`}
                text={block.thinking}
                deferred={block.deferred}
                sessionId={sessionId}
                entryId={entryId}
                blockIndex={index}
                streaming={streaming}
              />
            );
          case "toolCall":
            return (
              <ToolCallView
                key={`tool-${index}-${block.toolCallId}`}
                call={block}
                result={toolResults?.get(block.toolCallId) ?? null}
                streaming={streaming}
              />
            );
          case "image":
            return <MessageImage key={`image-${index}`} image={block} />;
        }
      })}
    </>
  );
}

function UserBody({ message }: { message: ChatMessage }): JSX.Element {
  const blocks = contentBlocks(message.content);
  if (blocks.length === 0) return <p className={styles.muted}>(no content)</p>;
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "text") return <MarkdownBody key={`text-${index}`} text={block.text} />;
        if (block.type === "image") return <MessageImage key={`image-${index}`} image={block} />;
        return null;
      })}
    </>
  );
}

function ToolResultBody({ message }: { message: ChatMessage }): JSX.Element {
  const toolName = typeof message.toolName === "string" ? message.toolName : null;
  return (
    <div className={styles.standaloneResult}>
      {toolName !== null && toolName !== "" ? (
        <span className={styles.toolResultName}>{toolName}</span>
      ) : null}
      <ToolResultView
        content={message.content}
        isError={message.isError === true}
        partial={message.partial === true}
      />
    </div>
  );
}

function BashBody({ message }: { message: ChatMessage }): JSX.Element {
  const command = typeof message.command === "string" ? message.command : "";
  const output = typeof message.output === "string" ? message.output : "";
  const cancelled = message.cancelled === true;
  const exitCode = typeof message.exitCode === "number" ? message.exitCode : null;
  const failed = cancelled || (exitCode !== null && exitCode !== 0);
  return (
    <div className={styles.execution}>
      {command !== "" ? <pre className={styles.command}>{command}</pre> : null}
      {output !== "" ? <pre className={styles.output}>{output}</pre> : null}
      {command === "" && output === "" ? <p className={styles.muted}>(no output)</p> : null}
      {cancelled ? (
        <span className={joinClassNames(styles.badge, styles.badgeMuted)}>cancelled</span>
      ) : exitCode !== null ? (
        <span className={joinClassNames(styles.badge, failed ? styles.badgeError : styles.badgeOk)}>
          exit {exitCode}
        </span>
      ) : null}
    </div>
  );
}

function PythonBody({ message }: { message: ChatMessage }): JSX.Element {
  const code = typeof message.code === "string" ? message.code : "";
  const output = typeof message.output === "string" ? message.output : "";
  return (
    <div className={styles.execution}>
      {code !== "" ? <pre className={styles.command}>{code}</pre> : null}
      {output !== "" ? <pre className={styles.output}>{output}</pre> : null}
      {code === "" && output === "" ? <p className={styles.muted}>(no output)</p> : null}
    </div>
  );
}

function fileList(message: ChatMessage): string[] {
  const raw = message.files;
  if (!Array.isArray(raw)) return [];
  const files: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item !== "") {
      files.push(item);
      continue;
    }
    if (!isRecord(item)) continue;
    if (typeof item.path === "string" && item.path !== "") files.push(item.path);
    else if (typeof item.name === "string" && item.name !== "") files.push(item.name);
  }
  return files;
}

function TextualBody({ message }: { message: ChatMessage }): JSX.Element {
  const blocks = contentBlocks(message.content);
  const files = fileList(message);
  const hasImages = blocks.some((block) => block.type === "image");
  const hasText = blocks.some((block) => block.type === "text" && block.text.trim() !== "");
  if (!hasText && !hasImages && files.length === 0) {
    return <p className={styles.muted}>(no content)</p>;
  }
  return (
    <div className={joinClassNames(styles.textual, styles.subdued)}>
      {blocks.map((block, index) => {
        if (block.type === "text") return <MarkdownBody key={`text-${index}`} text={block.text} />;
        if (block.type === "image") return <MessageImage key={`image-${index}`} image={block} />;
        return null;
      })}
      {files.length > 0 ? (
        <ul className={styles.files}>
          {files.map((file) => (
            <li key={file} className={styles.file}>
              {file}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MessageBody({
  message,
  toolResults,
  sessionId,
  entryId,
  streaming,
}: BodyProps): JSX.Element {
  const role = typeof message.role === "string" ? message.role : "";
  switch (role) {
    case "assistant":
      return (
        <AssistantBody
          message={message}
          toolResults={toolResults}
          sessionId={sessionId}
          entryId={entryId}
          streaming={streaming}
        />
      );
    case "user":
      return <UserBody message={message} />;
    case "toolResult":
    case "tool":
      return <ToolResultBody message={message} />;
    case "bashExecution":
      return <BashBody message={message} />;
    case "pythonExecution":
      return <PythonBody message={message} />;
    case "custom":
    case "developer":
    case "fileMention":
    default:
      return <TextualBody message={message} />;
  }
}

/** One complete transcript row: role label plus the message body. */
export function MessageView({
  message,
  toolResults,
  sessionId,
  entryId,
  streaming = false,
}: MessageViewProps): JSX.Element {
  const role = typeof message.role === "string" ? message.role : "";
  return (
    <article
      className={joinClassNames(styles.message, streaming && styles.messageStreaming)}
      data-role={role}
      data-streaming={streaming ? "true" : "false"}
    >
      <span className={styles.role}>{roleLabel(role)}</span>
      <div className={styles.body}>
        <MessageBody
          message={message}
          toolResults={toolResults}
          sessionId={sessionId ?? null}
          entryId={entryId ?? null}
          streaming={streaming}
        />
        {streaming ? <span className={styles.streamingCursor} aria-hidden="true" /> : null}
      </div>
    </article>
  );
}
