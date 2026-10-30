#!/usr/bin/env bun
/**
 * Deterministic language server for the Playwright suite. Speaks LSP framing
 * over stdio and publishes one error for every opened/changed document.
 */
import { createLspParser, encodeLspMessage } from "../../lib/lsp/framing";

function send(message: unknown): void {
  process.stdout.write(encodeLspMessage(message));
}

function publish(uri: string, version: number | undefined): void {
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      ...(version === undefined ? {} : { version }),
      diagnostics: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          severity: 1,
          source: "e2e-lsp",
          message: "E2E diagnostic",
        },
      ],
    },
  });
}

const feed = createLspParser((raw) => {
  if (!raw || typeof raw !== "object") return;
  const message = raw as Record<string, unknown>;
  const method = message.method;
  const id = message.id;

  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { capabilities: { textDocumentSync: 1 } } });
    return;
  }
  if (method === "shutdown") {
    send({ jsonrpc: "2.0", id, result: null });
    return;
  }
  if (method === "exit") {
    process.exit(0);
  }
  if (method !== "textDocument/didOpen" && method !== "textDocument/didChange") return;

  const params = message.params as { textDocument?: { uri?: unknown; version?: unknown } } | undefined;
  const uri = params?.textDocument?.uri;
  if (typeof uri !== "string") return;
  const version = typeof params?.textDocument?.version === "number" ? params.textDocument.version : undefined;
  publish(uri, version);
});

process.stdin.on("data", (chunk: Buffer) => feed(chunk));
process.stdin.on("end", () => process.exit(0));
