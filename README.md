# omp-web core

Framework-free TypeScript logic for an [omp](https://github.com/oh-my-pi/oh-my-pi)
client, the Bun host that drives `omp --mode rpc-ui` and its session files,
and a minimal HTTP server that exposes the host over `/api/*`.

The server, `core/` and `lib/` stay framework-free: no React, no Next.js.
The browser client lives in `web/` (React 19 + Vite) and talks to the HTTP API
only; anything outside it can still import the core directly.

## Layout

```
desktop/ Electrobun shell: starts the same server, opens a native window
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
bun run app               # build the UI if needed, serve it, open the browser
bun start                 # serve API + the existing web/dist build, no browser
OMP_WEB_HOST=0.0.0.0 OMP_WEB_PORT=8080 bun start
```

`bun run app` is the normal launch: it builds `web/dist` when it is missing,
starts the Bun server on `http://127.0.0.1:6666/`, and opens the default
browser. On Windows, double-click `omp-web.cmd` (it runs the same command); for
a desktop shortcut, point it at that file. Set `OMP_WEB_OPEN=0` to skip opening
the browser and `OMP_WEB_PORT` to change the port.

### Desktop app (Electrobun)

```
bun run desktop:dev       # build + launch the desktop window
bun run desktop:build     # installed-app artifacts in artifacts/ and build/
```

Both go through Electrobun 2, which downloads its Hutch toolchain on first use
into `~/.hutch` and projects the SDK into `.hutch/` (gitignored). The shell
(`desktop/main.ts`) starts the same Bun server on `OMP_WEB_PORT` (6666) and
opens a native webview at its URL: one origin, so HTTP, SSE and the terminal
WebSocket behave exactly as in the browser, and `bun run app` keeps working
unchanged. The build is host-only (Windows here; mac/linux builds run on their
own runners) and unsigned.

`desktop:build` produces an installer for the current OS: `artifacts/` holds
the platform artifact plus update metadata, `build/<channel>-<os>-<arch>/` the
extracted app. It rebuilds `web/dist` for release builds, stages the native
modules, bundles `desktop/main.ts`, and copies the SPA to
`Resources/app/web`. `bun run desktop:typecheck` checks the shell; it needs
`.hutch/` (run `bunx electrobun prepare` first).

Native modules ship as packages, not as bundle content: `node-pty` and `sharp`
are `external`, and `scripts/desktop-stage-native.ts` flattens them (plus
`@img/*`, `detect-libc`, `semver`) into `.tmp/desktop-native/node_modules`,
copied to `Resources/app/node_modules`. Terminal and image previews therefore
work in the packaged app.

The same server serves the SPA and the API; no second process is needed.
`bun start` expects `web/dist` to exist (`bun run web:build`), and
`OMP_WEB_STATIC_DIR` overrides the directory. Unknown client routes return
`index.html`; missing `/assets/*` files stay 404s.

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

Routes are served from `server/routes-manifest.ts`, a committed, generated table
of lazy imports for every `server/routes/**/route.ts`. Add a route file and run
`bun run routes:manifest`: the packaged desktop build has no route sources on
disk, so the runtime table cannot scan for them. `bun run routes:check` (CI) and
`server/routes-manifest.test.mjs` fail when it goes stale.

## Development

```
bun run test        # bun:test for core/lib/server, no build step
bun run typecheck   # tsc --noEmit
bun run contract    # regenerate contract/open-api.yaml from route contracts
bun run contract:check
bun run routes:manifest  # regenerate server/routes-manifest.ts (route table)
bun run routes:check

bun run dev         # API under --hot + Vite in one process
bun run dev:api     # API only, for a separately started Vite
bun run web:dev     # Vite UI on http://127.0.0.1:666 (proxies /api)
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
