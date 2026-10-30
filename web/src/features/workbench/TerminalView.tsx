import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { parseTerminalFrame, terminalSocketUrl } from "./terminal-protocol";
import styles from "./terminal.module.css";

interface TerminalViewProps {
  cwd: string;
  active: boolean;
}

type TerminalStatus =
  | { kind: "connecting"; label: string }
  | { kind: "ready"; label: string }
  | { kind: "exited"; label: string }
  | { kind: "error"; label: string }
  | { kind: "closed"; label: string };

export function TerminalView({ cwd, active }: TerminalViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState<TerminalStatus>({ kind: "connecting", label: "Connecting…" });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let disposed = false;
    readyRef.current = false;
    setStatus({ kind: "connecting", label: "Connecting…" });

    const computed = getComputedStyle(node);
    const token = (name: string, fallback: string): string => {
      const value = computed.getPropertyValue(name).trim();
      return value.length > 0 ? value : fallback;
    };

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace",
      scrollback: 5000,
      theme: {
        background: token("--bg", "#0f1115"),
        foreground: token("--fg", "#d7dae0"),
        cursor: token("--accent", "#7aa2f7"),
        cursorAccent: token("--bg", "#0f1115"),
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(node);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const refit = () => {
      if (node.clientWidth === 0 || node.clientHeight === 0) return;
      try {
        fit.fit();
      } catch {
        // The pane is hidden or mid-layout; the next observation retries.
      }
    };
    refit();

    const send = (message: unknown) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(terminalSocketUrl(window.location));
    } catch (error) {
      setStatus({ kind: "error", label: error instanceof Error ? error.message : String(error) });
    }
    socketRef.current = socket;

    if (socket) {
      socket.addEventListener("open", () => {
        if (disposed) return;
        refit();
        send({ type: "create", cwd, cols: terminal.cols, rows: terminal.rows });
      });
      socket.addEventListener("message", (event) => {
        if (disposed || typeof event.data !== "string") return;
        const frame = parseTerminalFrame(event.data);
        if (!frame) return;
        switch (frame.type) {
          case "created":
            readyRef.current = true;
            setStatus({ kind: "ready", label: `pid ${frame.pid}` });
            break;
          case "output":
            terminal.write(frame.data);
            break;
          case "exit":
            readyRef.current = false;
            terminal.write(`\r\n\x1b[2m[process exited: ${frame.exitCode}]\x1b[0m\r\n`);
            setStatus({ kind: "exited", label: `Exited (${frame.exitCode})` });
            break;
          case "error":
            readyRef.current = false;
            setStatus({ kind: "error", label: frame.error });
            break;
        }
      });
      socket.addEventListener("close", () => {
        if (disposed) return;
        readyRef.current = false;
        setStatus((current) => (
          current.kind === "exited" || current.kind === "error"
            ? current
            : { kind: "closed", label: "Disconnected" }
        ));
      });
      socket.addEventListener("error", () => {
        if (disposed) return;
        readyRef.current = false;
        setStatus((current) => (current.kind === "error" ? current : { kind: "error", label: "Connection failed" }));
      });
    }

    const dataSubscription = terminal.onData((data) => send({ type: "input", data }));
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      if (readyRef.current) send({ type: "resize", cols, rows });
    });
    const observer = new ResizeObserver(refit);
    observer.observe(node);

    return () => {
      disposed = true;
      observer.disconnect();
      dataSubscription.dispose();
      resizeSubscription.dispose();
      if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "close" }));
          socket.close(1000, "closed");
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
      socketRef.current = null;
      terminalRef.current = null;
      fitRef.current = null;
      terminal.dispose();
      node.replaceChildren();
    };
  }, [cwd]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      const fit = fitRef.current;
      if (!terminal || !fit) return;
      const node = host.current;
      if (!node || node.clientWidth === 0 || node.clientHeight === 0) return;
      try {
        fit.fit();
      } catch {
        // Hidden panes resize again when shown.
      }
      terminal.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, cwd]);

  return (
    <div className={styles.pane}>
      <div className={styles.statusBar}>
        <span className={`${styles.dot} ${styles[status.kind]}`} />
        <span className={styles.statusText}>{status.label}</span>
        <span className={styles.cwd} title={cwd}>{cwd}</span>
      </div>
      <div ref={host} className={styles.terminal} role="application" aria-label="Terminal" />
    </div>
  );
}
