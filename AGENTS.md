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
- `server/` — `Bun.serve` server over a generated route table.
  `server/routes/**` export a `contract` next to their handlers (request
  schemas validate in `dispatch`); they use `json()` / `readJson()` from
  `server/http.ts` and native `Request` / `Response`. `server/index.ts` runs
  under Bun, serves the terminal WebSocket, and takes its routes from
  `server/routes-manifest.ts` — a committed, generated table of lazy imports
  (`bun run routes:manifest`, CI runs `routes:check`). A route file must be
  listed there: the packaged desktop build has no route `.ts` files on disk, so
  runtime discovery by scanning would only work in the repository.
- `contract/` — generated `open-api.yaml` (from `bun run contract`) and
  `events.md` for the SSE channels and terminal frames. Never hand-edit the
  generated spec: it is produced from the route contracts and committed with
  the code that changes it; CI runs `bun run contract:check`.
- `web/` — the UI (M3). A classic SPA: React 19 + Vite 8 + TypeScript 7
  (strict). HTTP only, types derived from `contract/open-api.yaml`; it must not
  import from `core/`, `lib/` or `server/`.
- `desktop/` — the Electrobun shell (M4). `desktop/main.ts` is a main process
  that starts the same server and points a native webview at its URL, so the
  desktop app is the browser app plus a window: one origin, no second UI.
  `electrobun.config.ts` describes the bundle, `hutch.config.ts` pins
  `packageManager: "bun"`. It may import `server/`, `lib/` and `core/`; those
  never import it.

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
- `node-pty` and `sharp` stay optional and dynamically imported in `lib/`. The
  desktop bundle marks them `external` and ships the packages themselves
  (`scripts/desktop-stage-native.ts`); nothing may hard-require them at import
  time or the browser launch would break without them.

## Web rules (`web/`)

- Stack is fixed: React 19, Vite 8, TypeScript 7, TanStack Query, Monaco,
  xterm.js, Radix/cmdk. No SSR, no Next/Remix, no file-based routing.
- The typed client comes from the committed OpenAPI artifact:
  `bun run web:schema`; CI runs `web:schema:check`. Never hand-write request
  or response shapes that the contract already describes.
- One external snapshot store per session (`useSyncExternalStore`); TanStack
  Query is only the HTTP cache. No Redux and no domain logic in the client.
- Logic and display stay apart. `web/src/features/` and `web/src/state/` own
  stores, queries, and intents. `web/src/slots/` is the props contract a panel
  may receive. `web/src/skins/` is a theme: it renders slot props and does not
  fetch, subscribe, or decide session rules. A new theme is another component
  registered in `web/src/skins/registry.ts` against the same slots.
- Isolate a subscription in the leaf that paints it. A high-frequency store
  (composer draft, theme, a width while dragging) must not live in the
  component that also renders a large tree, or every update redraws that tree.
  The composer draft is read in `ComposerDock`, not in `ChatSkin`.
- Do not subscribe the shell root to a high-frequency store. The session
  snapshot, the session list, git status, diagnostics, and a pane width each
  live in the column that paints them.
- Do not request data outside the visible window. A history page, a directory
  listing, and rows inside a loaded directory wait until that window is on
  screen. Older history arrives when the transcript is scrolled up.
- Warm a heavy widget's chunk in idle time after the first frame, and do not
  mount it in that frame. Monaco, xterm, and markdown for the loaded history
  window are prefetched once the chat has painted.
- One multiplexed SSE connection (`/api/agent/events`); reconnect means
  re-subscribe and render the first snapshot.
- Explorer and git panels are our own components over `/api/workspace/*`.
  VS Code ships only Monaco as a reusable library; its workbench panels are
  not embeddable. DSH is a visual reference, not a source of components.
- Styles: design tokens in `src/styles/tokens.css` + CSS Modules. Keyboard-first,
  dense layout; light is the default theme and dark is its equal — neither is
  primary, and both define the same token names. No modal wizards.
- Tokens: `tokens.css` is two layers — a theme-independent language (type
  scale, 4px spacing, radii, motion) and one complete palette per theme. A
  component module declares local variables and consumes tokens; it never
  invents a global size, radius or colour. A skin may override token values on
  its own root, which is how it gets a different visual language without
  touching the other slots.
- Icons in omp text: omp writes Nerd Font glyphs from the Private Use Area
  into session titles and messages, so every stack that paints omp text ends
  with the `"Nerd Symbols"` fallback family (`styles/fonts.css`, vendored in
  `src/assets/fonts/` with its licence and subset recipe). It is a fallback,
  never a typeface — after the real families, before the generic keyword. A
  local stack that mirrors `--font-ui` (the rail's title, which fronts the
  color-emoji families) has to list it too.
- Tool blocks: every call renders as one block — chip, what it was for, quiet
  facts, outcome, then a body shaped by the tool (`code`, `diff`, `todo`,
  `output`). The model is `features/chat/tool-block.ts`, the view
  `ToolBlockView.tsx`, and noisy tools (`read`, `grep`, `glob`) start folded.
  Tool-result `details` are the source for the header — and that allowlist is
  narrowed in **two** places, `core/session.ts` (live) and
  `lib/session-reader.ts` (history): a field added to one and not the other
  silently vanishes from history.
- Layout state is client-only: `omp.layout.v1` for global widths/flags and
  `omp.workbench.v1.<sessionId>` for tabs, expanded directories, view and
  scroll. Server snapshots stay the authority for session content.
- A side sheet (System, Notifications) splits fixed chrome from one scrolling
  body: the sheet is a flex column, the title and tab row are `flex: none`, and
  only the body gets `overflow: auto`. A chrome row that can shrink (a default
  `flex-shrink: 1` plus `overflow` elsewhere) loses height to tall content and
  paints it over its own labels.
- Monaco and xterm are lazy-loaded; the chat shell must not pay their bundle
  cost on first paint.
- Tests: Vitest + Testing Library; Playwright for flows when a flow exists.
  `bun run web:typecheck`, `bun run web:test`, `bun run web:build` must pass.
- Tests: `core/*.test.mjs`, `lib/**/*.test.mjs` and `server/*.test.mjs` using
  `bun:test` with direct `.ts` imports. Run `bun run test`, `bun run typecheck`,
  `bun run routes:check` and `bun run contract:check` after changes; `web/` has
  its own Vitest suite (`bun run web:test`).
- Commit messages follow `Add ...`, `fix(scope): ...`, `test(scope): ...`.

## Desktop rules (`desktop/`)

- The desktop app is a shell, not a second client: it starts the same
  `startServer()` and opens the window at `server.url`. Never reimplement an
  API, a static file server, or a session rule for it.
- State the app owns outside the server stays client-only (window size, later
  menus/tray). Session content never moves into the shell.
- `bun run desktop:dev` and `bun run desktop:build` are the only supported
  entry points; both go through Electrobun (`electrobun dev` / `build
  --env=stable`). The build reuses `web/dist`, so the SPA is built, not
  re-invented.
- Anything `build.copy` ships must come from the repository: the SPA from
  `web/dist`, native packages staged into `.tmp/desktop-native`. `.hutch/`,
  `build/` and `artifacts/` are generated and gitignored.
- `desktop/tsconfig.json` is separate: `electrobun/*` types come from the
  projected `.hutch/devkit`, so `bun run typecheck` stays free of Electrobun.
  Run `bun run desktop:typecheck` after touching `desktop/`.
- Verify a change by launching the packaged app, not only the browser one: the
  window, `/api/*`, the SSE stream and the terminal WebSocket must all work
  from `Resources/app`.
