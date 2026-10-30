# Live events

The browser holds **one** SSE response and multiplexes every channel over it.

- Endpoint: `GET /api/agent/events` (`text/event-stream`)
- Subscriptions: `POST /api/agent/events` with `{ connectionId, subscribe: { id, channel } }`
  or `{ connectionId, unsubscribe: id }`
- Control frames use `event: mux`; every subscription's payloads use its `id`
  as the SSE event name.
- Subscription ids match `^s[0-9]{1,15}$`.
- One heartbeat comment (`:\n\n`) every 30 s keeps proxies from idling the
  stream. Reconnect means: open a new stream, subscribe again, and render the
  first snapshot — never replay the raw frame log.

## Channels

| Channel | Payload |
|---|---|
| `{ kind: "running" }` | `running` (ids + running/exited sessions), `sessions-changed` |
| `{ kind: "notifications", clientId }` | `notification` routed to this tab |
| `{ kind: "session", sessionId }` | `connected`, authoritative `snapshot`, raw omp frames (debug only) |
| `{ kind: "workspace", root }` | `workspace-changed` for an authorized root |
| `{ kind: "lsp", root }` | `lsp-diagnostics` for documents under an authorized root |
| `{ kind: "file", path, sessionId? }` | change notifications for one file |
| `{ kind: "host-tools" }` | `host_tool_call` from sessions no tab is watching |

### `session`

- `connected` carries the live stream cursor (`web.streamId`, `web.sequence`).
- `snapshot` is the **UI contract**: the server-side core model
  (`core/machine.ts`). Shape: `{ type: "snapshot", revision, history, snapshot }`.
  `snapshot.session` is `SessionState`; `branching` and `draft` accompany it.
  `history: true` means `messages` and `entryIds` are included; later frames
  omit them until `revision` changes.
- Raw omp frames keep their native shape with a `web` cursor. They are a debug
  channel and must not be used as the UI state source.
- Under backpressure the server coalesces `message_update` and `snapshot`
  frames to the latest one; the full snapshot is always safe to replace state.

### `workspace`

`workspace-changed` shape:

```json
{ "type": "workspace-changed", "root": "/abs/root", "paths": ["src/a.ts"], "truncated": false }
```

Paths are POSIX-relative to `root`, sorted, debounced by 150 ms, capped at
2000 entries per frame (`truncated: true` when the cap is hit). `.git` and
`node_modules` are ignored. The root must be an allowed workspace.

### `lsp`

`lsp-diagnostics` shape:

```json
{
  "type": "lsp-diagnostics",
  "root": "/abs/root",
  "path": "/abs/root/src/a.ts",
  "version": 3,
  "diagnostics": [
    {
      "range": { "start": { "line": 0, "character": 0 }, "end": { "line": 0, "character": 4 } },
      "severity": 1,
      "source": "typescript",
      "message": "Cannot find name 'foo'."
    }
  ]
}
```

Sent after every `publishDiagnostics` for a document open in this root, and
with `diagnostics: []` when the document closes or its server exits. The root
must be an allowed workspace.

## Terminal (WebSocket)

`/api/workspace/terminal` upgrades to a WebSocket (same-origin only). One
terminal per socket; JSON control frames:

Client → server:

```json
{ "type": "create", "cwd": "/abs/root", "cols": 120, "rows": 32 }
{ "type": "input", "data": "npm test\r" }
{ "type": "resize", "cols": 120, "rows": 32 }
{ "type": "close" }
```

Server → client:

```json
{ "type": "created", "id": "uuid", "pid": 1234, "cwd": "/abs/root" }
{ "type": "output", "data": "..." }
{ "type": "exit", "exitCode": 0 }
{ "type": "error", "error": "...", "code": "access_denied" }
```

`cwd` must be an allowed workspace root; at most 8 terminals exist at once.
