# web

React 19 + Vite 8 + TypeScript 7 SPA for the omp console. HTTP and SSE only;
the UI never imports `core/`, `lib/` or `server/`.

## Shell

```
[ session rail ][ chat ][ workbench ]
```

- The rail is global: projects, sessions, and an `Active` section fed by the
  `running` SSE channel. Projects use the server's `alias` / `pinOrder` /
  `sortOrder`; sessions are grouped by `projectRoot` (worktree-aware).
- The chat renders the authoritative session snapshot, falling back to
  `/api/agent/sessions/{id}/context` for saved sessions without a live stream.
- The workbench is scoped to the selected session: `Files` and `Changes`.
  Files open as preview tabs on click and pinned tabs on double click. Changes
  open the before/after diff for working-tree, index, or untracked states.
- Dividers resize the rail, workbench, and file navigator. Widths and
  collapsed flags persist in `omp.layout.v1`; tabs, expanded directories,
  view and scroll persist per session in `omp.workbench.v1.<sessionId>`.

## Data

| UI | Source |
|---|---|
| Projects / sessions | `/api/workspace/projects`, `/api/agent/sessions` |
| Live turn state | SSE `{ kind: "running" }` |
| Session state | SSE `{ kind: "session", sessionId }` |
| File invalidations | SSE `{ kind: "workspace", root }` |
| File tree / content | `/api/workspace/files/{path}?type=list|read` |
| Git changes | `/api/workspace/git/status`, `/api/workspace/git/file` |

Monaco is lazy-loaded only when a file or diff opens. The generated client is
`src/api/schema.d.ts`; regenerate it from the committed OpenAPI artifact with
`bun run web:schema`.

## Checks

```sh
bun run web:typecheck
bun run web:test
bun run web:build
bun run web:schema:check
```
