# omp-web core

Framework-free TypeScript logic for an [omp](https://github.com/oh-my-pi/oh-my-pi)
client, the Bun host that drives `omp --mode rpc-ui` and its session files,
and a minimal HTTP server that exposes the host over `/api/*`.

The server, `core/` and `lib/` stay framework-free: no React, no Next.js.
The browser client lives in `web/` (React 19 + Vite) and talks to the HTTP API
only; anything outside it can still import the core directly.

## Layout

```
core/   pure TypeScript: no React, DOM, fetch, storage, timers or Node imports
        session state machine, transcripts, drafts, search, notifications,
        side questions, models, todos, subagents, host tools, session files
        and lists, history paging, RPC framing, routing
lib/    Bun host layer: omp process + NDJSON transport, session file IO,
        model/MCP/settings config, usage, media, notifications, skills, STT,
        LSP clients
server/ Bun.serve server; handlers use server/http.ts helpers (json,
        readJson) and native Request/Response
contract/ generated open-api.yaml and the SSE/terminal frame document
web/    React 19 + Vite SPA; HTTP + OpenAPI types only
```

`core/types.ts` and `core/pi-types.ts` hold the shared omp shapes. `core/index.ts`
is the single public barrel.

## Run

```
bun start                 # http://127.0.0.1:30178
OMP_WEB_HOST=0.0.0.0 OMP_WEB_PORT=8080 bun start
```

Endpoints are grouped by domain:

- `/api/agent/*` — sessions, history, intents, live events, agent definitions,
  plugins;
- `/api/workspace/*` — files (read/write/rename/delete/upload), index, git
  (status/diff/stage/commit/branches/checkout), worktrees, projects, media,
  LSP documents/diagnostics, cwd, and the terminal WebSocket;
- `/api/system/*` — models, providers, auth, settings, usage, notifications,
  STT, skills, MCP, updates.

The server binds loopback by default and has no password gate; put it behind a
reverse proxy if it is exposed. The generated contract is
`contract/open-api.yaml`; live-event and terminal frames are described in
`contract/events.md`.

## Development

```
bun run test        # bun:test for core/lib/server, no build step
bun run typecheck   # tsc --noEmit
bun run contract    # regenerate contract/open-api.yaml from route contracts
bun run contract:check

bun run web:dev     # Vite UI on http://127.0.0.1:5173 (proxies /api)
bun run web:schema  # regenerate web/src/api/schema.d.ts from the contract
bun run web:test
bun run web:build
```

End-to-end coverage lives in `web/e2e` and runs against an isolated API server
plus a fake `omp` RPC process; no real agent install or model is needed:

```
bun run web:e2e:install   # once: downloads Chromium
bun run web:e2e
```

Requires Bun 1.4.4+.
