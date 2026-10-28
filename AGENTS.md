# Repository rules

This repository is the headless TypeScript core for an omp client plus its
Node host layer. The React/Next.js web app was removed on purpose; do not add a
UI framework, CSS framework or DOM library dependency.

## Layout

- `core/` — framework-free domain logic. No React, DOM, `fetch`, storage,
  timers or Node imports. Host I/O arrives through the ports in
  `core/ports.ts` (or a narrow local interface). Shared types live in
  `core/types.ts` / `core/pi-types.ts`; `core/index.ts` is the only barrel.
- `lib/` — Node-only adapters: `omp` binary probing and NDJSON transport,
  session file IO, config files, usage reports, media, notifications, skills,
  STT. `lib/` may import `core/`; `core/` never imports `lib/`.

## Conventions

- Parsers at a boundary are total: malformed input returns `null`/defaults,
  never throws, unless the contract explicitly reports an error (e.g. cursor
  decoding).
- Keep domain rules in `core/` even when today only `lib/` uses them; the next
  client will consume the core directly.
- Tests: `core/*.test.mjs` and `lib/**/*.test.mjs` using `node:test` + `jiti`.
  Run `npm test` and `npm run typecheck` after changes. Never reintroduce a
  build step for the library.
- Commit messages follow `Add ...`, `fix(scope): ...`, `test(scope): ...`.
