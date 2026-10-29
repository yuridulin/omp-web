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
  STT. `lib/` and `server/` may import `core/`; `core/` never imports them.
- `server/` — `Bun.serve` server + filesystem router. `server/routes/**` are
  the old API handlers; they must import `../../http` (the NextResponse /
  NextRequest shim), never `next/server`. `server/index.ts` runs under Bun and
  loads route TypeScript directly.
- `contract/` — generated `open-api.yaml` and the SSE event description. Never
  hand-edit the generated spec: it is produced from the route schemas and
  committed with the code that changes it.
- `web/` — the UI (M3). A classic frontend: HTTP only, types derived from
  `contract/open-api.yaml`. It must not import from `core/`, `lib/` or
  `server/`.

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
- Tests: `core/*.test.mjs` and `lib/**/*.test.mjs` using `bun:test` with
  direct `.ts` imports. Run `bun test` and `bun run typecheck` after changes.
- Commit messages follow `Add ...`, `fix(scope): ...`, `test(scope): ...`.
