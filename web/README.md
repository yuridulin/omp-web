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
- The workbench is scoped to the selected session: `Files`, `Changes`, and
  `Problems`. Files open as preview tabs on click and pinned tabs on double
  click. Changes open the before/after diff for working-tree, index, or
  untracked states.
- A session starts with its workspace root; the `+` button adds any registered
  project as another root. Each root has its own tree, git count, and terminal
  button; removing a non-primary root closes the tabs that only lived under it.
- Light is the default theme; the rail's moon/sun button toggles dark and the
  choice persists in `omp.theme.v1`. Monaco, xterm and every panel read the
  `tokens.css` variables, so adding a theme does not touch feature CSS.
- Typography is sans for chrome and chat, mono only for code, paths, diffs and
  the terminal.
- Dividers resize the rail, workbench, and file navigator. Widths and
  collapsed flags persist in `omp.layout.v1`; tabs, expanded directories,
  view and scroll persist per session in `omp.workbench.v1.<sessionId>`.

## Slots, skins & appearance

- `src/slots/` contains prop contracts only: `rail`, `chat`, `files`,
  `changes`, and the non-skin `editor` area. A slot component gets ready data
  and callbacks, so skins never fetch, import another slot's HTML, or import
  another slot's CSS module.
- `src/skins/dsh/` is the current visual variant, one folder per slot. The
  registry in `src/skins/registry.ts` maps `slot + variant id` to a component;
  `App.tsx` resolves every panel through it.
- The shell composes the workbench columns and passes a changes-slot
  controller into the files skin; the controller resolves the chosen changes
  variant and owns its git actions. Adding a variant never edits another skin.
- Appearance is client-only: `omp.appearance.v1` stores a preset plus explicit
  per-slot ids. `System` → `View` edits it; the preset fills every slot and an
  explicit choice overrides one slot. Nothing is sent to `/api/system/*`.
- `src/state/composer-store.ts` owns `omp.composer.v1.<sessionId>`; every chat
  variant reads and writes the same draft.
- `src/drag/payload.ts` is the drag boundary. Skins write a `DragPayload`
  (`session`, `file`, `text`) to the `DataTransfer`; the parser is total and
  returns `null` for garbage. Dropping a file from the tree onto the composer
  appends its path to the shared draft.

## Files, git & terminal

- Files open in an editable Monaco editor. `Ctrl`/`Cmd`+`S` saves the buffer;
  unsaved edits stay in memory as drafts per tab and survive tab switches and
  closing the tab. Drafts are never persisted across reloads.
- Dirty tabs show a small warning dot before the title.
- The file tree toolbar can create, upload, rename, and delete files and
  directories. Renaming a directory remaps every open tab under it; deleting a
  file or directory closes its open tabs and drops their drafts.
- Changes offers stage, unstage, commit, and branch actions for the working
  tree; diffs open as read-only before/after tabs.
- Language servers publish diagnostics for open files into Monaco markers and
  the `Problems` view. `Settings` → `Language servers` enables them, edits the
  JSON server definitions, and lists the built-in TypeScript and C# presets.
- `Ctrl`/`Cmd`+`K` over a selection (or the current line) opens the inline-edit
  bar; the instruction becomes a scoped prompt in the active chat session, so
  the agent makes the edit through its normal tools and the diff appears under
  `Changes`.
- The header's `>_` button opens (or activates) the session's terminal tab for
  the workspace root. Every terminal tab stays mounted with its PTY while you
  switch to other tabs, so shells keep running; closing the tab closes its
  socket. The terminal chunk loads only when the first terminal tab opens.

## Transcript & extensions

- Assistant text renders as markdown; thinking blocks collapse and can defer
  their fetch until opened, using the entry id for that message (the
  optimistic prompt never has one).
- Tool calls render with their result when the live snapshot carries a matching
  `toolResults` entry; paired results are not repeated as standalone rows.
  Unpaired and partial results still render on their own. Images, bash, and
  python executions have dedicated compact bodies.
- The in-flight stream message renders through the same `MessageView` with a
  streaming cursor. Snapshot notices render as dense rows at the end of the
  transcript.
- Blocking extension UI requests (`select`, `confirm`, `input`, `editor`,
  `ask`) arrive on the session stream and open an inline dialog above the
  composer. Answers (and `Escape` → `cancelled`) dispatch the
  `extension-response` intent through the same `runIntent` path as other
  mutations; the dialog closes only after the server accepts it and stays open
  with the error if dispatch fails. The pending request lives in the extension
  store, so a server `cancel` (for example when another tab answers) dismisses
  it, and reconnect replay restores requests that are still pending.

## New session & composer

- Each project header has a `+` button that opens the new-session pane seeded
  with that project root. `N` still opens the pane from the current session.
- While idle, `Enter` sends and `Shift+Enter` inserts a newline.
- While the agent is running, `Enter` queues a follow-up and
  `Ctrl`/`Cmd`+`Enter` steers the active turn; `Shift+Enter` still inserts a
  newline. The same row exposes `Stop`, `Steer`, and `Queue`.
- The model and thinking selects live in the composer. Changing either
  dispatches the intent to the session.
- Queued messages can be removed, and follow-ups can be promoted to steering.
- Drafts persist per session in `localStorage` under
  `omp.composer.v1.<sessionId>`.

## System panel & notifications

- The rail header's gear button (or `Ctrl`/`Cmd`+`,`) opens the system sheet on
  the right; `Escape` and the close button dismiss it. It is a sheet, not a
  wizard: only the active tab is mounted, so opening it queries one section
  instead of seven, and the app behind it keeps its state.
- Tabs: `Settings` (native config plus web settings and the agent environment),
  `View` (client-only preset and per-slot skin ids), `Models` (catalog and
  model-role bindings), `Providers` (auth accounts and enable/disable), `Usage`
  (tokens/cost by range and provider quota windows), `Skills` (workspace
  skills, update checks, model-invocation toggle), and `MCP` (config inventory,
  plus live session servers when a session is selected).
- Writes go straight to `/api/system/settings`, `/api/system/web-settings`,
  `/api/system/model-roles`, `/api/system/providers/enable`,
  `/api/system/skills` and `/api/system/mcp`. Skills can be toggled for model
  invocation, checked for updates, and updated from their source; MCP servers
  can be enabled/disabled from config and reloaded on the live session. Each
  tab keeps its own save feedback and refetches the affected queries after a
  successful write, so the composer and workbench see new values without a
  reload.
- The bell in the rail header shows the unread count and opens history. Opening
  an entry marks it read and selects that entry's session; the popover also
  hosts the prefs (enable, per-type toggles, in-app toast vs. system
  notification while active, language), the push status and a test
  notification.
- Every tab reports presence to `/api/system/notifications/presence` while it
  is visible and the user is active (idle after three minutes without input),
  so the server only pushes to tabs someone is watching.
- Toasts render globally above the sheet, auto-dismiss after six seconds, are
  capped at five at a time, and click through to the session.

## Data

| UI | Source |
|---|---|
| Projects / sessions | `/api/workspace/projects`, `/api/agent/sessions` |
| Live turn state | SSE `{ kind: "running" }` |
| Session state | SSE `{ kind: "session", sessionId }` |
| File invalidations | SSE `{ kind: "workspace", root }` |
| Diagnostics | SSE `{ kind: "lsp", root }`, `/api/workspace/lsp/diagnostics` |
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

## End-to-end tests

Playwright drives the real UI against Vite and a local API server. The API
server is isolated: `web/e2e/start-api.ts` creates a throwaway agent directory
and git workspace under `web/e2e/.tmp`, and replaces `OMP_WEB_OMP_BIN` with
`web/e2e/fake-omp.ts`, a deterministic RPC stand-in. No real `omp`, model,
network access or user config is required.

```sh
cd web
bunx playwright install chromium   # once
bun run e2e                       # starts API :30179 and Vite :5174
```

The specs run serially because the API server and fixture workspace are
shared. Failures keep traces, screenshots and an HTML report under
`web/test-results/` and `web/playwright-report/`.
