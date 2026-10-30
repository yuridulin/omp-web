import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelEntry } from "@/api/agent";
import { isRecord } from "@/api/guards";
import { basename } from "@/api/paths";
import type { ChatMessage, SessionSnapshot } from "@/api/session-types";
import type { SessionContextPayload, SessionSummary } from "@/api/workspace";
import type { ExtensionRequest, ExtensionResponse } from "@/state/extension-store";
import { Composer, type ComposerSubmitMode } from "./Composer";
import { ExtensionDialog } from "./ExtensionDialog";
import { MessageView } from "./MessageView";
import { ModelPicker } from "./ModelPicker";
import { QueuePanel } from "./QueuePanel";
import { contentBlocks } from "./transcript";
import styles from "./chat-pane.module.css";

interface ChatPaneProps {
  session: SessionSummary | null;
  selected: string | null;
  snapshot: SessionSnapshot | null;
  context: SessionContextPayload | undefined;
  streamError: string | null;
  extensionRequest: ExtensionRequest | null;
  extensionBusy: boolean;
  extensionError: string | null;
  onExtensionResponse: (response: ExtensionResponse) => void | Promise<void>;
  railCollapsed: boolean;
  workbenchCollapsed: boolean;
  onToggleRail: () => void;
  onToggleWorkbench: () => void;
  models: ModelEntry[];
  modelsLoading: boolean;
  modelValue: { provider: string; modelId: string } | null;
  thinkingLevel: string;
  thinkingLevels: string[];
  modelLoading: boolean;
  onModelChange: (provider: string, modelId: string) => void;
  onThinkingChange: (level: string) => void;
  running: boolean;
  queue: { steering: string[]; followUp: string[] };
  sending: boolean;
  onSend: (text: string, mode: ComposerSubmitMode) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (queue: "steering" | "followUp", text: string) => void;
  onPromoteQueued: (text: string) => void;
}

const DRAFT_PREFIX = "omp.composer.v1.";
const EMPTY_NOTICES: SessionSnapshot["session"]["notices"] = [];
/** Markdown rendering is the expensive part; keep very long transcripts usable. */
const MAX_RENDERED_MESSAGES = 200;

function draftKey(sessionId: string): string {
  return `${DRAFT_PREFIX}${sessionId}`;
}

function readDraft(sessionId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(draftKey(sessionId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(sessionId: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value === "") window.localStorage.removeItem(draftKey(sessionId));
    else window.localStorage.setItem(draftKey(sessionId), value);
  } catch {
    // Storage may be unavailable (private mode, quota); drafts stay in memory.
  }
}

function contextMessages(context: SessionContextPayload | undefined): ChatMessage[] {
  const raw = context?.context?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((message) => typeof message.role === "string")
    .map((message) => ({
      role: message.role as string,
      content: message.content,
      ...(typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
    }));
}

export function ChatPane({
  session,
  selected,
  snapshot,
  context,
  streamError,
  extensionRequest,
  extensionBusy,
  extensionError,
  onExtensionResponse,
  railCollapsed,
  workbenchCollapsed,
  onToggleRail,
  onToggleWorkbench,
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
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const seededFor = useRef<string | null>(null);
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
    if (!selected) {
      seededFor.current = null;
      setDraft("");
      return;
    }
    if (seededFor.current === selected) return;
    // Mark the session before seeding: switching away from a session with an
    // empty draft must not leave the guard on the previous id, or returning
    // would skip the localStorage read and show an empty composer.
    seededFor.current = selected;
    const stored = readDraft(selected);
    setDraft(stored !== "" ? stored : serverDraft);
  }, [selected, serverDraft]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages.length, streamMessage]);

  const changeDraft = (value: string) => {
    setDraft(value);
    if (selected) {
      seededFor.current = selected;
      writeDraft(selected, value);
    }
  };

  const submit = async (text: string, mode: ComposerSubmitMode): Promise<void> => {
    try {
      await onSend(text, mode);
    } catch {
      // Keep the draft; the stream error is rendered by the composer.
      return;
    }
    setDraft("");
    if (selected) {
      seededFor.current = selected;
      writeDraft(selected, "");
    }
  };

  if (!selected) {
    return (
      <main className={styles.chat}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {railCollapsed ? <button className={styles.iconButton} onClick={onToggleRail} title="Show sessions">☰</button> : null}
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
          {railCollapsed ? <button className={styles.iconButton} onClick={onToggleRail} title="Show sessions">☰</button> : null}
          <div className={styles.heading}>
            <span className={styles.title}>{title}</span>
            <span className={styles.subtitle}>
              {project ? `${project} · ` : ""}
              <span className={running ? styles.running : styles.connection}>{running ? "agent running" : connection}</span>
            </span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {workbenchCollapsed ? (
            <button className={styles.panelButton} onClick={onToggleWorkbench} title="Show workbench (Ctrl+Shift+E)">
              Panel
            </button>
          ) : (
            <button className={styles.iconButton} onClick={onToggleWorkbench} title="Hide workbench (Ctrl+Shift+E)">×</button>
          )}
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

      <footer className={styles.composer}>
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
          />
        </div>
      </footer>
    </main>
  );
}
