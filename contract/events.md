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
| `{ kind: "subagents", sessionId }` | `subagents` roster + live activity of the session's subagents |
| `{ kind: "workspace", root }` | `workspace-changed` for an authorized root |
| `{ kind: "lsp", root }` | `lsp-diagnostics` for documents under an authorized root |
| `{ kind: "file", path, sessionId? }` | change notifications for one file |
| `{ kind: "host-tools" }` | `host_tool_call` from sessions no tab is watching |

### `session`

- `connected` carries the live stream cursor (`web.streamId`, `web.sequence`).
- `snapshot` is the **UI contract**: the server-side core model
  (`core/machine.ts`). Shape: `{ type: "snapshot", revision, history, snapshot }`.
  `snapshot.session` is `SessionState`; `branching` and `draft` accompany it.
  `history: true` means `messages` and `entryIds` are included. The browser
  session channel sends `history: false`: the transcript is a window loaded
  from `GET /api/agent/sessions/{id}/context?sync=1` (tail, then older pages,
  then a forward page when `revision` changes). A `history: false` frame
  merges into the previous snapshot and does not replace that window.
- Raw omp frames keep their native shape with a `web` cursor. They are a debug
  channel and must not be used as the UI state source.
- Under backpressure the server coalesces `message_update` and `snapshot`
  frames to the latest one; the full snapshot is always safe to replace state.

### `subagents`

The roster of one session's subagents (`task` tool calls), composed by the
server: the on-disk roster recovered from the parent's `task` toolResults,
overlaid with the live `subagent_lifecycle` / `subagent_progress` /
`subagent_event` frames of that session's wrapper.

```json
{
  "type": "subagents",
  "revision": 12,
  "roster": [
    { "id": "EngineCore", "agent": "task", "status": "started", "index": 0,
      "batchSeq": 0, "transcriptAvailable": true, "toolCount": 9, "tokens": 12040 }
  ],
  "activity": { "EngineCore": [{ "kind": "tool", "label": "→ read core/reducer.ts", "ts": 1792584407106 }] },
  "transcriptVersions": { "EngineCore": 7 }
}
```

- **No 409.** A session without a live wrapper still answers with its on-disk
  roster, so a reopened session shows finished agents; only the on-disk part is
  present there.
- **Full snapshots, not deltas.** `roster` is ordered (`batchSeq`, then `index`,
  then `id`) and `activity` keeps the most recent 50 entries per id. `revision`
  increments per snapshot so a client can drop out-of-order frames. Intermediate
  `subagent_progress` snapshots coalesce under load; a terminal status always
  flushes immediately.
- **Live wins over history** for the same id, and a settled status is never
  regressed by a stale snapshot.
- `transcriptVersions[id]` counts content added to that agent's transcript. A
  reader compares the number it saw last and fetches the next transcript page
  instead of polling; activity entries are capped, versions are not.
- `roster[].transcriptAvailable` replaces the absolute transcript path: the
  browser reads it through `GET /api/agent/sessions/{id}/subagents/{subagentId}`
  (`mode=tail` for the last page, `fromByte` for paging, `mode=completion` for
  the final artifact).

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
