import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EventStreamClient, type Channel, type FrameHandler } from "@/api/events";
import { applyExtensionFrame } from "./extension-store";
import { applyLspDiagnosticsFrame } from "./lsp-store";
import { applySnapshotFrame, isSnapshotFrame } from "./session-store";

const EventStreamContext = createContext<EventStreamClient | null>(null);

export function EventStreamProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<EventStreamClient | null>(null);
  useEffect(() => {
    const instance = new EventStreamClient();
    setClient(instance);
    return () => {
      instance.close();
      setClient(null);
    };
  }, []);
  return <EventStreamContext.Provider value={client}>{children}</EventStreamContext.Provider>;
}

export function useEventStream(): EventStreamClient | null {
  return useContext(EventStreamContext);
}

function channelKey(channel: Channel): string {
  switch (channel.kind) {
    case "running": return "running";
    case "session": return `session:${channel.sessionId}`;
    case "workspace": return `workspace:${channel.root}`;
    case "lsp": return `lsp:${channel.root}`;
    case "file": return `file:${channel.path}:${channel.sessionId ?? ""}`;
    case "notifications": return `notifications:${channel.clientId}`;
    case "host-tools": return "host-tools";
  }
}

export function useChannel(
  channel: Channel | null,
  handler: FrameHandler,
  onError?: (message: string) => void,
  revision = 0,
): void {
  const client = useEventStream();
  const channelRef = useRef(channel);
  const handlerRef = useRef(handler);
  const errorRef = useRef(onError);
  channelRef.current = channel;
  handlerRef.current = handler;
  errorRef.current = onError;
  const key = channel ? channelKey(channel) : "";

  // `revision` forces a resubscribe after a saved session is bootstrapped.
  useEffect(() => {
    const current = channelRef.current;
    if (!client || !current) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    void client
      .subscribe(current, (frame) => handlerRef.current(frame))
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else detach = unsubscribe;
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!message.includes("409")) errorRef.current?.(message);
      });
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [client, key, revision]);
}

export function useRunningSessions(fallbackIds: readonly string[]): Set<string> {
  const queryClient = useQueryClient();
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  useChannel({ kind: "running" }, (frame) => {
    if (frame.type === "running") {
      const ids = Array.isArray(frame.runningSessionIds)
        ? frame.runningSessionIds.filter((id): id is string => typeof id === "string")
        : [];
      setLiveIds(ids);
      if (frame.refreshSessionList === true) void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } else if (frame.type === "sessions-changed") {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    }
  });
  return useMemo(() => new Set(liveIds ?? fallbackIds), [fallbackIds, liveIds]);
}

export function useSessionStream(sessionId: string | null, revision = 0): { error: string | null } {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [sessionId, revision]);
  useChannel(
    sessionId ? { kind: "session", sessionId } : null,
    (frame) => {
      if (!sessionId) return;
      if (isSnapshotFrame(frame)) applySnapshotFrame(sessionId, frame);
      applyExtensionFrame(sessionId, frame);
    },
    (message) => setError(message),
    revision,
  );
  return { error };
}

export function useWorkspaceEvents(roots: readonly string[]): void {
  const client = useEventStream();
  const queryClient = useQueryClient();
  const key = roots.join("\n");

  useEffect(() => {
    if (!client || roots.length === 0) return;
    let cancelled = false;
    const detach: Array<() => void> = [];
    for (const root of roots) {
      void client
        .subscribe({ kind: "workspace", root }, (frame) => {
          if (frame.type !== "workspace-changed") return;
          void queryClient.invalidateQueries({ queryKey: ["file-list"] });
          void queryClient.invalidateQueries({ queryKey: ["file-content"] });
          void queryClient.invalidateQueries({ queryKey: ["git-status"] });
          void queryClient.invalidateQueries({ queryKey: ["git-file"] });
        })
        .then((unsubscribe) => {
          if (cancelled) unsubscribe();
          else detach.push(unsubscribe);
        })
        .catch(() => {
          // A denied/closed root just stops delivering changes.
        });
      void client
        .subscribe({ kind: "lsp", root }, (frame) => applyLspDiagnosticsFrame(frame))
        .then((unsubscribe) => {
          if (cancelled) unsubscribe();
          else detach.push(unsubscribe);
        })
        .catch(() => {
          // Diagnostics are best-effort; the HTTP snapshot still seeds the store.
        });
    }
    return () => {
      cancelled = true;
      for (const unsubscribe of detach) unsubscribe();
    };
    // `key` captures the root set without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, queryClient]);
}
