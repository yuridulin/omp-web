"use client";

import { useEffect, useState } from "react";

interface SessionInfo {
  id: string;
  name?: string;
  cwd: string;
  modified?: string;
  messageCount?: number;
}

interface SessionsResponse {
  sessions?: SessionInfo[];
  error?: string;
}

/**
 * Wiring probe: the rebuilt UI starts here. It talks only to the retained
 * /api surface (sessions index + omp binary probe) so the mechanical link to
 * the installed CLI stays observable while the presentation layer is written
 * from scratch.
 */
export default function Home() {
  const [state, setState] = useState<{ version: string | null; sessions: SessionInfo[]; error: string | null }>({
    version: null,
    sessions: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [versionResponse, sessionsResponse] = await Promise.all([
          fetch("/api/omp-version", { cache: "no-store" }),
          fetch("/api/sessions", { cache: "no-store" }),
        ]);
        const version = (await versionResponse.json()) as { version?: string | null };
        const sessions = (await sessionsResponse.json()) as SessionsResponse;
        if (cancelled) return;
        setState({
          version: version.version ?? null,
          sessions: sessions.sessions ?? [],
          error: sessions.error ?? null,
        });
      } catch (error) {
        if (!cancelled) setState({ version: null, sessions: [], error: String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>omp</h1>
      <p>
        omp binary: <code>{state.version ?? "—"}</code>
      </p>
      <p>
        sessions: <code>{state.sessions.length}</code>
      </p>
      {state.error ? <p>error: {state.error}</p> : null}
      <ul>
        {state.sessions.slice(0, 20).map((session) => (
          <li key={session.id}>
            {session.name ?? session.id} — {session.cwd}
          </li>
        ))}
      </ul>
    </main>
  );
}
