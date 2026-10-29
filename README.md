# omp-web core

Framework-free TypeScript logic for an [omp](https://github.com/oh-my-pi/oh-my-pi)
client, the Bun host that drives `omp --mode rpc-ui` and its session files,
and a minimal HTTP server that exposes the host over the same `/api/*` routes
the previous web app used.

There is no React, no Next.js and no UI framework. A future client can talk to
the HTTP API or import the core directly.

## Layout

```
core/   pure TypeScript: no React, DOM, fetch, storage, timers or Node imports
        session state machine, transcripts, drafts, search, notifications,
        side questions, models, todos, subagents, host tools, session files
        and lists, history paging, RPC framing, routing
lib/    Bun host layer: omp process + NDJSON transport, session file IO,
        model/MCP/settings config, usage, media, notifications, skills, STT
server/ Bun.serve server; routes are the former Next.js handlers with
        next/server replaced by server/http.ts (NextResponse.json/NextRequest)
```

`core/types.ts` and `core/pi-types.ts` hold the shared omp shapes. `core/index.ts`
is the single public barrel.

## Run

```
bun start                 # http://127.0.0.1:30178
OMP_WEB_HOST=0.0.0.0 OMP_WEB_PORT=8080 bun start
```

Endpoints include `/api/sessions*`, `/api/agent/*`, `/api/events` (multiplexed
SSE), `/api/files/*`, `/api/git/*`, `/api/worktrees`, `/api/projects*`,
`/api/models*`, `/api/mcp`, `/api/skills`, `/api/notifications/*`, `/api/stt*`
and `/api/media/*`. The server binds loopback by default and has no password
gate; put it behind a reverse proxy if it is exposed.

## Development

```
bun test            # bun:test, no build step
bun run typecheck   # tsc --noEmit
```

Requires Bun 1.4.4+.
