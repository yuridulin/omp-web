# Repository rules

This repository is the headless TypeScript core for an omp client, its Bun
host layer, and a minimal HTTP server.

## Layout

- `core/` — framework-free domain logic. Host I/O arrives through the ports in
  `core/ports.ts` (or a narrow local interface). Shared types live in
  `core/types.ts` / `core/pi-types.ts`; `core/index.ts` is the only barrel.
- `lib/` — Bun-only adapters: `omp` binary probing and NDJSON transport,
  session file IO, config files, usage reports, media, notifications, skills,
  STT. `lib/` and `server/` may import `core/`; `core/` never imports them.
- `server/` — `Bun.serve` server + filesystem router. `server/routes/**` are
  the old API handlers; they must import `../../http` (the NextResponse /
  NextRequest shim), never `next/server`. `server/index.ts` runs under Bun and
  loads route TypeScript directly.

## Conventions

- Parsers at a boundary are total: malformed input returns `null`/defaults,
  never throws, unless the contract explicitly reports an error.
- Keep domain rules in `core/` even when today only `lib/` or `server/` uses
  them; the next client will consume the core directly.
- Tests: `core/*.test.mjs` and `lib/**/*.test.mjs` using `bun:test` with
  direct `.ts` imports. Run `bun test` and `bun run typecheck` after changes.
- Commit messages follow `Add ...`, `fix(scope): ...`, `test(scope): ...`.
