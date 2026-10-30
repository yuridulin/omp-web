import { useState } from "react";
import type { JSX } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { McpAction, McpInventoryItem, McpStatusTone } from "@/api/mcp";
import { applyMcpAction, mcpStatusLabel, mcpStatusTone } from "@/api/mcp";
import { useMcpInventory } from "./use-system-data";
import styles from "./mcp-panel.module.css";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const TONE_CLASS: Record<McpStatusTone, string> = {
  ok: styles.statusOk ?? "",
  pending: styles.statusPending ?? "",
  muted: styles.statusMuted ?? "",
  warn: styles.statusWarn ?? "",
};

export interface McpPanelProps {
  root: string | null;
  sessionId: string | null;
}

export function McpPanel({ root, sessionId }: McpPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const mcp = useMcpInventory(root, sessionId);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = mcp.data;
  const live = Boolean(sessionId);
  const visible = report ? (live && report.liveServers ? report.liveServers : report.inventory) : [];

  const runAction = async (server: McpInventoryItem, action: McpAction): Promise<void> => {
    if (!sessionId) return;
    const key = `${action}:${server.name}`;
    setPending(key);
    setError(null);
    try {
      await applyMcpAction(sessionId, action, server.name);
      await queryClient.invalidateQueries({ queryKey: ["system-mcp", root, sessionId] });
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className={styles.panel} aria-label="MCP servers">
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>MCP</h2>
            <span className={styles.badge} data-live={live ? "true" : "false"}>
              {live ? "Live session" : "Config only"}
            </span>
          </div>
          <span className={styles.subtitle} title={report?.path ?? root ?? undefined}>
            {report?.path ?? root ?? "No workspace selected"}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={mcp.isFetching || (!root && !sessionId)}
            onClick={() => {
              void mcp.refetch();
            }}
          >
            {mcp.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {!root && !sessionId ? (
        <div className={styles.empty}>Select a project or session to inspect MCP servers.</div>
      ) : (
        <>
          {report?.root ? (
            <div className={styles.message}>Project config root: {report.root}</div>
          ) : (
            <div className={styles.hint}>
              No project MCP config was found. User-level servers are still listed.
            </div>
          )}
          {!live ? (
            <div className={styles.hint}>
              Select a session to enable, disable, or reload servers in its live process.
            </div>
          ) : null}
          {report?.liveError ? (
            <div className={styles.error} role="alert">
              {report.liveError}
            </div>
          ) : null}
          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
          {mcp.isPending ? <div className={styles.message}>Loading MCP servers…</div> : null}
          {mcp.error ? (
            <div className={styles.error} role="alert">
              {describeError(mcp.error)}
            </div>
          ) : null}
          {report && visible.length === 0 ? (
            <div className={styles.empty}>No MCP servers configured.</div>
          ) : null}

          {visible.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Server</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th className={styles.numeric}>{live ? "Actions" : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((server) => {
                    const tone = mcpStatusTone(server.status);
                    const busy = pending !== null;
                    return (
                      <tr key={`${server.source}:${server.name}`}>
                        <td className={styles.name}>{server.name}</td>
                        <td>
                          <span className={`${styles.status} ${TONE_CLASS[tone]}`}>
                            {mcpStatusLabel(server.status)}
                          </span>
                        </td>
                        <td className={styles.mono}>{server.type ?? "—"}</td>
                        <td className={styles.mono} title={server.sourcePath ?? server.source}>
                          {server.source}
                        </td>
                        <td>
                          {live ? (
                            <div className={styles.actionCell}>
                              <button
                                type="button"
                                className={styles.button}
                                disabled={
                                  busy ||
                                  server.status === "connected" ||
                                  server.status === "connecting"
                                }
                                onClick={() => {
                                  void runAction(server, "enable");
                                }}
                              >
                                {pending === `enable:${server.name}` ? "Enabling…" : "Enable"}
                              </button>
                              <button
                                type="button"
                                className={styles.button}
                                disabled={
                                  busy ||
                                  server.status === "disabled" ||
                                  server.status === "not_connected"
                                }
                                onClick={() => {
                                  void runAction(server, "disable");
                                }}
                              >
                                {pending === `disable:${server.name}` ? "Disabling…" : "Disable"}
                              </button>
                              <button
                                type="button"
                                className={styles.button}
                                disabled={busy}
                                onClick={() => {
                                  void runAction(server, "reload");
                                }}
                              >
                                {pending === `reload:${server.name}` ? "Reloading…" : "Reload"}
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {report ? (
            <div className={styles.liveNote}>
              {visible.length.toLocaleString("en-US")} server{visible.length === 1 ? "" : "s"} ·{" "}
              {live ? "live inventory" : "configuration inventory"}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
