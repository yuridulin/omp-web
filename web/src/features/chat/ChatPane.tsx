import { useEffect, useMemo, useRef, useState } from "react";
import { isRecord } from "@/api/guards";
import { basename } from "@/api/paths";
import type { ChatMessage, SessionSnapshot } from "@/api/session-types";
import type { SessionContextPayload, SessionSummary } from "@/api/workspace";
import { messageText } from "@/features/sessions/message-text";
import styles from "./chat-pane.module.css";

interface ChatPaneProps {
  session: SessionSummary | null;
  selected: string | null;
  snapshot: SessionSnapshot | null;
  context: SessionContextPayload | undefined;
  streamError: string | null;
  railCollapsed: boolean;
  workbenchCollapsed: boolean;
  onToggleRail: () => void;
  onToggleWorkbench: () => void;
  onSend: (text: string) => Promise<void>;
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
  railCollapsed,
  workbenchCollapsed,
  onToggleRail,
  onToggleWorkbench,
  onSend,
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const messages = useMemo(() => {
    const live = snapshot?.session.messages ?? [];
    return live.length > 0 ? live : contextMessages(context);
  }, [context, snapshot]);

  const streamMessage = snapshot?.session.stream.active ? snapshot.session.stream.message : null;
  const connection = snapshot?.session.connection ?? (context ? "saved" : "idle");
  const running = snapshot?.session.run.status === "running";

  useEffect(() => {
    setDraft("");
  }, [selected]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages.length, streamMessage]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setPending(true);
    try {
      await onSend(text);
      setDraft("");
    } finally {
      setPending(false);
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
          {messages.slice(-200).map((message, index) => {
            const text = messageText(message);
            const tool = message.role === "tool" || message.role === "toolResult";
            return (
              <article key={`${message.timestamp ?? index}-${message.role}`} className={styles.message}>
                <span className={styles.role}>{message.role}</span>
                {tool ? (
                  <details className={styles.toolResult}>
                    <summary>tool result</summary>
                    <pre className={styles.text}>{text || "(no text content)"}</pre>
                  </details>
                ) : (
                  <pre className={styles.text}>{text || "(no text content)"}</pre>
                )}
              </article>
            );
          })}
          {streamMessage ? (
            <article className={styles.message}>
              <span className={styles.role}>assistant</span>
              <pre className={styles.text}>{messageText(streamMessage)}</pre>
            </article>
          ) : null}
          {streamError ? <p className={styles.error}>{streamError}</p> : null}
        </div>
      </div>

      <footer className={styles.composer}>
        <div className={styles.composerInner}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Message omp…"
            rows={3}
            spellCheck={false}
          />
          <div className={styles.composerBar}>
            <span className={styles.hint}>Enter to send · Shift+Enter newline</span>
            <button className={styles.send} onClick={() => void submit()} disabled={!draft.trim() || pending}>
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
