import { useEffect, useMemo, useState, type DragEvent } from "react";
import { basename } from "@/api/paths";
import type { SessionSnapshot } from "@/api/session-types";
import { readDragPayload } from "@/drag/payload";
import { ComposerDock } from "@/features/chat/ComposerDock";
import { DeferredMessage } from "@/features/chat/DeferredMessage";
import { ExtensionDialog } from "@/features/chat/ExtensionDialog";
import { MessageView } from "@/features/chat/MessageView";
import { ModelPicker } from "@/features/chat/ModelPicker";
import { QueuePanel } from "@/features/chat/QueuePanel";
import { RunningAgentsStrip } from "@/features/chat/RunningAgentsStrip";
import { composerUsageStats, formatTokens } from "@/features/chat/composer-stats";
import { CacheIcon, StepsIcon, TokensIcon, TurnsIcon } from "@/features/chat/icons";
import { hasVisibleLiveBody } from "@/features/chat/transcript";
import {
  eagerTailStart,
  pairToolResults,
  toolCallIds,
  transcriptRows,
  withOptimistic,
} from "@/features/chat/transcript-rows";
import { useTranscriptScroll } from "@/features/chat/transcript-scroll";
import type { ChatSlotProps } from "@/slots/chat";
import { NEW_SESSION_DRAFT_ID, seedComposerDraft } from "@/state/composer-store";
import { dshChatClasses } from "./classes";
import styles from "./chat.module.css";

const EMPTY_NOTICES: SessionSnapshot["session"]["notices"] = [];

export function ChatSkin({
  session,
  selected,
  snapshot,
  historyMessages,
  historyEntryIds,
  hasOlderHistory,
  historyOlderEpoch,
  onLoadOlderHistory,
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
  railCollapsed = false,
}: ChatSlotProps) {
  const [dropActive, setDropActive] = useState(false);

  const optimistic = snapshot?.session.optimistic ?? null;
  const messages = useMemo(() => withOptimistic(historyMessages, optimistic), [historyMessages, optimistic]);

  const toolResults = useMemo(
    () => pairToolResults(messages, snapshot?.session.toolResults),
    [messages, snapshot],
  );

  const heldMessages = snapshot?.session.stream.held ?? [];
  const streamMessage = snapshot?.session.stream.active ? snapshot.session.stream.message : null;
  const liveVisible = hasVisibleLiveBody(streamMessage);

  const callIds = useMemo(
    () =>
      toolCallIds(
        streamMessage
          ? [...messages, ...heldMessages, streamMessage]
          : [...messages, ...heldMessages],
      ),
    [heldMessages, messages, streamMessage],
  );

  const rows = useMemo(() => transcriptRows(messages, callIds), [messages, callIds]);
  const eagerFrom = eagerTailStart(messages.length);
  const usageStats = useMemo(() => composerUsageStats(historyMessages), [historyMessages]);

  const { scrollRef, onScroll } = useTranscriptScroll({
    hasOlderHistory,
    onLoadOlderHistory,
    dependencies: [
      heldMessages.length,
      historyOlderEpoch,
      liveVisible,
      messages.length,
      running,
      streamMessage,
    ],
  });

  const entryIdAt = (index: number): string | null => historyEntryIds[index] ?? null;

  const notices = snapshot?.session.notices ?? EMPTY_NOTICES;

  const serverDraft = snapshot?.draft.value ?? "";

  useEffect(() => {
    if (!selected) return;
    seedComposerDraft(selected, serverDraft);
  }, [selected, serverDraft]);

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

  const title = session?.name?.trim() || selected?.slice(0, 8) || "New session";
  const project = session ? basename(session.projectRoot ?? session.cwd) : "";

  return (
    <main className={styles.chat}>
      <header className={railCollapsed ? `${styles.header} ${styles.headerRailCollapsed}` : styles.header}>
        <div className={styles.heading}>
          <span className={styles.title}>{title}</span>
          {project !== "" ? <span className={styles.project}>{project}</span> : null}
        </div>
      </header>

      <div className={styles.transcript} ref={scrollRef} onScroll={onScroll}>
        <div className={styles.transcriptInner}>
          {messages.length === 0 ? <p className={styles.quiet}>No messages yet.</p> : null}
          {hasOlderHistory ? <p className={styles.quiet}>Scroll up for older messages.</p> : null}
          {rows.map(({ index, message }) => (
            <DeferredMessage
              key={`${selected ?? "none"}-${message.role}-${index}`}
              message={message}
              classes={dshChatClasses.transcript}
              eager={index >= eagerFrom}
              scrollRoot={scrollRef}
            >
              <MessageView
                message={message}
                classes={dshChatClasses.transcript}
                toolResults={toolResults}
                sessionId={selected}
                entryId={entryIdAt(index)}
              />
            </DeferredMessage>
          ))}
          {heldMessages.map((message, index) => (
            <MessageView
              key={`${selected ?? "none"}-held-${typeof message.timestamp === "number" ? message.timestamp : index}`}
              message={message}
              classes={dshChatClasses.transcript}
              toolResults={toolResults}
              sessionId={selected}
            />
          ))}
          {liveVisible && streamMessage ? (
            <MessageView
              key={`${selected ?? "none"}-stream`}
              message={streamMessage}
              classes={dshChatClasses.transcript}
              toolResults={toolResults}
              sessionId={selected}
              streaming
            />
          ) : null}
          {running && !liveVisible ? (
            <p className={styles.waiting} role="status">
              Waiting for the agent…
            </p>
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
        className={styles.composerSeat}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.composerInner}>
          {extensionRequest ? (
            <ExtensionDialog
              request={extensionRequest}
              classes={dshChatClasses.extensionDialog}
              busy={extensionBusy}
              error={extensionError}
              onRespond={onExtensionResponse}
            />
          ) : null}
          <QueuePanel
            queue={queue}
            classes={dshChatClasses.queue}
            pending={sending}
            onRemove={onRemoveQueued}
            onPromote={onPromoteQueued}
          />
          {selected ? (
            <RunningAgentsStrip
              sessionId={selected}
              classes={dshChatClasses.runningAgents}
            />
          ) : null}
          <ComposerDock
            sessionId={selected ?? NEW_SESSION_DRAFT_ID}
            classes={dshChatClasses.composer}
            onSend={onSend}
            onAbort={onAbort}
            running={running}
            pending={sending}
            dropActive={dropActive}
            error={streamError}
            controls={
              <ModelPicker
                classes={dshChatClasses.modelPicker}
                models={models}
                model={modelValue}
                thinkingLevel={thinkingLevel}
                thinkingLevels={thinkingLevels}
                loading={modelsLoading || modelLoading}
                onChangeModel={onModelChange}
                onChangeThinking={onThinkingChange}
                allowAutoThinking={selected === null}
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
