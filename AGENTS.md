# Repository rules

This repository is the headless TypeScript core for an omp client, its Bun
host layer, and a minimal HTTP server. The UI (see `web/`, M3) is a separate
consumer that talks to the server only over HTTP.

Product and architecture decisions live in `VISION.md`; this file covers
day-to-day repository rules.

## Layout

- `core/` — framework-free domain logic. Host I/O arrives through the ports in
  `core/ports.ts` (or a narrow local interface). Shared types live in
  `core/types.ts` / `core/pi-types.ts`. `core/index.ts` is the barrel for
  external consumers; `lib/` and `server/` import concrete core modules.
- `lib/` — Bun-only adapters: `omp` binary probing and NDJSON transport,
  session file IO, config files, usage reports, media, notifications, skills,
  STT, PTY terminals, and the project file watcher. The live-session authority
  (`session-authority.ts`) owns one `core/machine.ts` per omp wrapper. `lib/`
  and `server/` may import `core/`; `core/` never imports them.
- `server/` — `Bun.serve` server + filesystem router. `server/routes/**` export
  a `contract` next to their handlers (request schemas validate in
  `dispatch`); they use `json()` / `readJson()` from `server/http.ts` and
  native `Request` / `Response`. `server/index.ts` runs under Bun, loads route
  TypeScript directly, and serves the terminal WebSocket.
- `contract/` — generated `open-api.yaml` (from `bun run contract`) and
  `events.md` for the SSE channels and terminal frames. Never hand-edit the
  generated spec: it is produced from the route contracts and committed with
  the code that changes it; CI runs `bun run contract:check`.
- `web/` — the UI (M3). A classic SPA: React 19 + Vite 8 + TypeScript 7
  (strict). HTTP only, types derived from `contract/open-api.yaml`; it must not
  import from `core/`, `lib/` or `server/`.

## Conventions

- Parsers at a boundary are total: malformed input returns `null`/defaults,
  never throws, unless the contract explicitly reports an error.
- Keep domain rules in `core/` even when today only `lib/` or `server/` uses
  them; the next client will consume the core directly.
- The API contract is code-first: request/response schemas live next to the
  routes, validate input, and generate `contract/open-api.yaml`. Regenerate
  the artifact and commit it in the same change; a diff between code and
  artifact is a bug.
- The server is the authority for session state: clients send intents and
  render snapshots. Raw `omp` frames are a debug channel, not a UI contract.

## Web rules (`web/`)

- Stack is fixed: React 19, Vite 8, TypeScript 7, TanStack Query, Monaco,
  xterm.js, Radix/cmdk. No SSR, no Next/Remix, no file-based routing.
- The typed client comes from the committed OpenAPI artifact:
  `bun run web:schema`; CI runs `web:schema:check`. Never hand-write request
  or response shapes that the contract already describes.
- One external snapshot store per session (`useSyncExternalStore`); TanStack
  Query is only the HTTP cache. No Redux and no domain logic in the client.
- One multiplexed SSE connection (`/api/agent/events`); reconnect means
  re-subscribe and render the first snapshot.
- Explorer and git panels are our own components over `/api/workspace/*`.
  VS Code ships only Monaco as a reusable library; its workbench panels are
  not embeddable. DSH is a visual reference, not a source of components.
- Styles: design tokens in `src/styles/tokens.css` + CSS Modules. Keyboard-first,
  dense dark layout, no modal wizards.
- Layout state is client-only: `omp.layout.v1` for global widths/flags and
  `omp.workbench.v1.<sessionId>` for tabs, expanded directories, view and
  scroll. Server snapshots stay the authority for session content.
- Monaco and xterm are lazy-loaded; the chat shell must not pay their bundle
  cost on first paint.
- Tests: Vitest + Testing Library; Playwright for flows when a flow exists.
  `bun run web:typecheck`, `bun run web:test`, `bun run web:build` must pass.
- Tests: `core/*.test.mjs` and `lib/**/*.test.mjs` using `bun:test` with
  direct `.ts` imports. Run `bun run test` and `bun run typecheck` after changes;
  `web/` has its own Vitest suite (`bun run web:test`).
- Commit messages follow `Add ...`, `fix(scope): ...`, `test(scope): ...`.
