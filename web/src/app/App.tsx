import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { EventStreamClient } from "@/api/events";
import { applySnapshotFrame, isSnapshotFrame } from "@/state/session-store";
import { useSessionSnapshot } from "@/state/use-session-snapshot";
import { useSessions } from "@/features/sessions/use-sessions";
import { messageText } from "@/features/sessions/message-text";
import styles from "./app.module.css";

export function App() {
  const queryClient = useQueryClient();
  const sessions = useSessions();
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const snapshot = useSessionSnapshot(selected);
  const [client, setClient] = useState<EventStreamClient | null>(null);

  useEffect(() => {
    const instance = new EventStreamClient();
    setClient(instance);
    return () => {
      instance.close();
      setClient(null);
    };
  }, []);

  useEffect(() => {
    if (!client || !selected) return;
    let detach: (() => void) | undefined;
    let cancelled = false;
    void client
      .subscribe({ kind: "session", sessionId: selected }, (frame) => {
        if (isSnapshotFrame(frame)) applySnapshotFrame(selected, frame);
      })
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else detach = unsubscribe;
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [client, selected]);

  const sendDraft = async () => {
    if (!selected || !draft.trim()) return;
    setError(null);
    const { error: requestError, response } = await api.POST("/api/agent/sessions/{id}/intent", {
      params: { path: { id: selected } },
      body: { kind: "draft-edit", patch: { text: draft } },
    });
    if (requestError) setError(requestError.error ?? `HTTP ${response.status}`);
  };

  const session = snapshot?.session;
  const messages = session?.messages ?? [];
  const running = new Set(sessions.data?.runningSessionIds ?? []);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <header className={styles.sidebarHeader}>
          <span className={styles.brand}>omp</span>
          <button
            className={styles.refresh}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["sessions"] })}
            title="Refresh sessions"
          >
            ↻
          </button>
        </header>
        {sessions.isError ? <p className={styles.error}>{sessions.error.message}</p> : null}
        <ul className={styles.sessionList}>
          {(sessions.data?.sessions ?? []).map((item) => (
            <li key={item.id}>
              <button
                className={item.id === selected ? styles.sessionActive : styles.session}
                onClick={() => {
                  setSelected(item.id);
                  setDraft("");
                  setError(null);
                  window.history.replaceState(null, "", `?session=${encodeURIComponent(item.id)}`);
                }}
                title={item.cwd}
              >
                <span className={running.has(item.id) ? styles.dotRunning : styles.dot} />
                <span className={styles.sessionName}>{item.name ?? item.id.slice(0, 8)}</span>
                <span className={styles.sessionMeta}>{item.messageCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <span>{selected ?? "no session"}</span>
          <span className={styles.connection}>{session?.connection ?? "idle"}</span>
        </header>

        {!selected ? (
          <section className={styles.empty}>
            <p>Select a session</p>
            <p className={styles.muted}>The server owns state; this view renders its snapshots.</p>
          </section>
        ) : (
          <>
            <section className={styles.transcript}>
              {messages.slice(-50).map((message, index) => (
                <article key={`${message.timestamp ?? index}-${message.role}`} className={styles.message}>
                  <span className={styles.role}>{message.role}</span>
                  <pre className={styles.text}>{messageText(message)}</pre>
                </article>
              ))}
              {session?.stream.active && session.stream.message ? (
                <article className={styles.message}>
                  <span className={styles.role}>assistant</span>
                  <pre className={styles.text}>{messageText(session.stream.message)}</pre>
                </article>
              ) : null}
            </section>

            <footer className={styles.composer}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="draft intent (draft-edit)"
                rows={2}
              />
              <button onClick={() => void sendDraft()} disabled={!draft.trim()}>
                Save draft
              </button>
              {error ? <span className={styles.error}>{error}</span> : null}
              <span className={styles.muted}>server draft: {snapshot?.draft.value ?? "—"}</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
