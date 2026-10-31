import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { isRecord } from "@/api/guards";
import { basename } from "@/api/paths";
import type { ChatMessage, SessionSnapshot } from "@/api/session-types";
import type { SessionContextPayload } from "@/api/workspace";
import { readDragPayload } from "@/drag/payload";
import { Composer } from "@/features/chat/Composer";
import { ExtensionDialog } from "@/features/chat/ExtensionDialog";
import { MessageView } from "@/features/chat/MessageView";
import { ModelPicker } from "@/features/chat/ModelPicker";
import { QueuePanel } from "@/features/chat/QueuePanel";
import { contentBlocks } from "@/features/chat/transcript";
import { composerUsageStats, formatTokens } from "@/features/chat/composer-stats";
import { CacheIcon, StepsIcon, TokensIcon, TurnsIcon } from "@/features/chat/icons";
import type { ChatSlotProps, ComposerSubmitMode } from "@/slots/chat";
import { seedComposerDraft, setComposerDraft } from "@/state/composer-store";
import { useComposerDraft } from "@/state/use-composer-draft";
import styles from "./chat.module.css";

const EMPTY_NOTICES: SessionSnapshot["session"]["notices"] = [];
/** Markdown rendering is the expensive part; keep very long transcripts usable. */
const MAX_RENDERED_MESSAGES = 200;

function contextMessages(context: SessionContextPayload | undefined): ChatMessage[] {
  const raw = context?.context?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((message) => typeof message.role === "string")
    .map((message) => {
      const { role, content, timestamp, ...rest } = message;
      return {
        ...rest,
        role: role as string,
        content,
        ...(typeof timestamp === "number" ? { timestamp } : {}),
      };
    });
}

export function ChatSkin({
  session,
  selected,
  snapshot,
  context,
  streamError,
  extensionRequest,
  extensionBusy,
  extensionError,
  onExtensionResponse,
  models,
  modelsLoading,
  modelValue,
  thinkingLevel,
  thinkingLevels,
  modelLoading,
  onModelChange,
  onThinkingChange,
  running,
  queue,
  sending,
  onSend,
  onAbort,
  onRemoveQueued,
  onPromoteQueued,
  onDropPayload,
}: ChatSlotProps) {
  const draft = useComposerDraft(selected);
  const [dropActive, setDropActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const messages = useMemo(() => {
    const live = snapshot?.session.messages;
    const optimistic = snapshot?.session.optimistic;
    if (live || optimistic) {
      return [...(live ?? []), ...(optimistic ? [optimistic] : [])];
    }
    return contextMessages(context);
  }, [context, snapshot]);

  // The optimistic prompt is always the tail of `messages`; it has no server
  // entry id, so deferred thinking lookups must skip it.
  const optimisticIndex = useMemo(() => {
    if (!snapshot?.session.optimistic) return -1;
    return snapshot.session.messages?.length ?? 0;
  }, [snapshot]);

  const toolResults = useMemo(() => {
    const results = new Map<string, ChatMessage>();
    for (const message of messages) {
      if (message.role !== "toolResult" || typeof message.toolCallId !== "string") continue;
      results.set(message.toolCallId, message);
    }
    const live = snapshot?.session.toolResults;
    if (live) {
      for (const [key, value] of Object.entries(live)) {
        if (!isRecord(value) || value.role !== "toolResult") continue;
        const callId = typeof value.toolCallId === "string" && value.toolCallId !== "" ? value.toolCallId : key;
        results.set(callId, value as ChatMessage);
      }
    }
    return results;
  }, [messages, snapshot]);

  const renderedMessages =
    messages.length > MAX_RENDERED_MESSAGES ? messages.slice(-MAX_RENDERED_MESSAGES) : messages;
  const messageOffset = messages.length - renderedMessages.length;
  const usageStats = useMemo(() => composerUsageStats(messages), [messages]);

  const toolCallIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of renderedMessages) {
      if (message.role !== "assistant") continue;
      for (const block of contentBlocks(message.content)) {
        if (block.type === "toolCall" && block.toolCallId !== "") ids.add(block.toolCallId);
      }
    }
    return ids;
  }, [renderedMessages]);

  const entryIdAt = (index: number): string | null => {
    if (index === optimisticIndex) return null;
    return snapshot?.session.entryIds?.[index] ?? context?.context?.entryIds?.[index] ?? null;
  };

  const notices = snapshot?.session.notices ?? EMPTY_NOTICES;

  const streamMessage = snapshot?.session.stream.active ? snapshot.session.stream.message : null;
  const connection = snapshot?.session.connection ?? (context ? "saved" : "idle");
  const serverDraft = snapshot?.draft.value ?? "";

  useEffect(() => {
    if (!selected) return;
    seedComposerDraft(selected, serverDraft);
  }, [selected, serverDraft]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages.length, streamMessage]);

  const changeDraft = (value: string) => {
    if (selected) setComposerDraft(selected, value);
  };

  const submit = async (text: string, mode: ComposerSubmitMode): Promise<void> => {
    try {
      await onSend(text, mode);
    } catch {
      // Keep the draft; the stream error is rendered by the composer.
      return;
    }
    if (selected) setComposerDraft(selected, "");
  };

  const handleDragOver = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDropActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDropActive(false);
    const payload = readDragPayload(event.dataTransfer);
    if (payload) onDropPayload(payload);
  };

  if (!selected) {
    return (
      <main className={styles.chat}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>No session</span>
          </div>
        </header>
        <section className={styles.empty}>
          <p>Select a session</p>
          <p className={styles.muted}>Projects and sessions live in the left rail.</p>
        </section>
      </main>
    );
  }

  const title = session?.name?.trim() || selected.slice(0, 8);
  const project = session ? basename(session.projectRoot ?? session.cwd) : "";

  return (
    <main className={styles.chat}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.heading}>
            <span className={styles.title}>{title}</span>
            <span className={styles.subtitle}>
              {project ? `${project} · ` : ""}
              <span className={running ? styles.running : styles.connection}>{running ? "agent running" : connection}</span>
            </span>
          </div>
        </div>
      </header>

      <div className={styles.transcript} ref={scrollRef} onScroll={(event) => {
        const node = event.currentTarget;
        stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}>
        <div className={styles.transcriptInner}>
          {messages.length === 0 ? <p className={styles.muted}>No messages yet.</p> : null}
          {messageOffset > 0 ? (
            <p className={styles.muted}>
              Showing the last {renderedMessages.length} of {messages.length} messages.
            </p>
          ) : null}
          {renderedMessages.map((message, index) => {
            const absoluteIndex = messageOffset + index;
            // A tool result paired with an assistant tool call is rendered
            // inside that call; only unpaired results get their own row.
            if (
              message.role === "toolResult" &&
              typeof message.toolCallId === "string" &&
              toolCallIds.has(message.toolCallId)
            ) {
              return null;
            }
            return (
              <MessageView
                key={`${selected ?? "none"}-${message.role}-${absoluteIndex}`}
                message={message}
                toolResults={toolResults}
                sessionId={selected}
                entryId={entryIdAt(absoluteIndex)}
              />
            );
          })}
          {streamMessage ? (
            <MessageView
              key={`${selected ?? "none"}-stream`}
              message={streamMessage}
              toolResults={toolResults}
              sessionId={selected}
              streaming
            />
          ) : null}
          {notices.length > 0 ? (
            <ul className={styles.notices}>
              {notices.map((notice) => (
                <li key={notice.id} className={styles.notice}>
                  <span className={styles.noticeType}>{notice.type}</span>
                  <span>{notice.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <footer
        className={dropActive ? `${styles.composer} ${styles.composerDrop}` : styles.composer}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.composerInner}>
          {extensionRequest ? (
            <ExtensionDialog
              request={extensionRequest}
              busy={extensionBusy}
              error={extensionError}
              onRespond={onExtensionResponse}
            />
          ) : null}
          <QueuePanel
            queue={queue}
            pending={sending}
            onRemove={onRemoveQueued}
            onPromote={onPromoteQueued}
          />
          <Composer
            value={draft}
            onChange={changeDraft}
            onSubmit={submit}
            onAbort={onAbort}
            running={running}
            pending={sending}
            error={streamError}
            controls={
              <ModelPicker
                models={models}
                model={modelValue}
                thinkingLevel={thinkingLevel}
                thinkingLevels={thinkingLevels}
                loading={modelsLoading || modelLoading}
                onChangeModel={onModelChange}
                onChangeThinking={onThinkingChange}
                allowAutoThinking
              />
            }
            status={
              usageStats.turns > 0 || usageStats.steps > 0 || usageStats.tokens > 0 ? (
                <>
                  {usageStats.turns > 0 ? (
                    <span className={styles.stat}>
                      <TurnsIcon size={12} />
                      {usageStats.turns} {usageStats.turns === 1 ? "turn" : "turns"}
                    </span>
                  ) : null}
                  {usageStats.steps > 0 ? (
                    <span className={styles.stat}>
                      <StepsIcon size={12} />
                      {usageStats.steps} {usageStats.steps === 1 ? "step" : "steps"}
                    </span>
                  ) : null}
                  {usageStats.tokens > 0 ? (
                    <span className={styles.stat}>
                      <TokensIcon size={12} />
                      {formatTokens(usageStats.tokens)} tok
                    </span>
                  ) : null}
                  {usageStats.cacheHit !== null ? (
                    <span className={styles.stat}>
                      <CacheIcon size={12} />
                      Cache hit {usageStats.cacheHit}%
                    </span>
                  ) : null}
                </>
              ) : undefined
            }
          />
        </div>
      </footer>
    </main>
  );
}
