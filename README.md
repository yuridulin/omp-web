# omp-web core

Framework-free TypeScript logic for an [omp](https://github.com/oh-my-pi/oh-my-pi)
client, plus the Node adapters that talk to the `omp` binary and its session
files. There is no React, no DOM framework and no HTTP server here: a front end
(or a CLI, or a test) drives the core through plain data and ports.

The previous Next.js/React web app was removed; its non-UI logic remains under
`lib/`, and the client-facing domain logic lives in `core/`.

## Layout

```
core/   pure TypeScript: no React, DOM, fetch, storage, timers or Node imports
        session state machine, transcripts, drafts, search, notifications,
        side questions, models, todos, subagents, host tools, session files
        and lists, history paging, RPC framing, routing
lib/    Node host layer: omp process + NDJSON transport, session file IO,
        model/MCP/settings config, usage, media, notifications, skills, STT
```

`core/types.ts` and `core/pi-types.ts` hold the shared omp shapes. `core/index.ts`
is the single public barrel.

## Development

```
npm test          # node:test + jiti, no build step
npm run typecheck # tsc --noEmit
```

Requires Node.js 24+ (tests use `--experimental-strip-types`).
