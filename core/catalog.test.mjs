import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  comparablePath,
  groupSessions,
  mergeProjects,
  newestFirst,
  orderProjects,
  searchSessions,
  sortProjects,
} = await jiti.import("./catalog");

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

const project = (path, over = {}) => ({ path, ...over });
const session = (id, over = {}) => ({ id, cwd: `C:/Work/${id}`, ...over });
const paths = (projects) => projects.map((p) => p.path);

// ---------------------------------------------------------------------------
// comparablePath

test("comparablePath folds separators, trailing slashes, whitespace and case", () => {
  assert.equal(comparablePath("C:\\Work\\Repo"), "c:/work/repo");
  assert.equal(comparablePath("C:/Work/Repo"), "c:/work/repo");
  assert.equal(comparablePath("C:\\\\Work\\\\Repo\\\\"), "c:/work/repo");
  assert.equal(comparablePath("  C:/Work/Repo/  "), "c:/work/repo");
  assert.equal(comparablePath("/home/User/Repo/"), "/home/user/repo");
  assert.equal(comparablePath("//server//share///repo"), "/server/share/repo");
});

test("comparablePath keeps an empty path empty", () => {
  assert.equal(comparablePath(""), "");
  assert.equal(comparablePath("   "), "");
  assert.equal(comparablePath("///"), "");
});

// ---------------------------------------------------------------------------
// mergeProjects

test("mergeProjects dedupes by folded path, preserves registered fields, appends discovered and drops hidden", () => {
  const registered = [
    project("C:\\Work\\Beta", { addedAt: "2024-02-01", sortOrder: 2, pinOrder: 1 }),
    project("C:\\Work\\Hidden", { addedAt: "2024-03-01", hidden: true }),
    project("C:\\Work\\Alpha", { addedAt: "2024-01-01" }),
  ];
  const discovered = [
    "c:/work/alpha", // casing-only duplicate of a registered project
    "C:\\Work\\Gamma",
    "C:/Work/gamma/", // duplicate of another discovered path
    "C:/Work/Beta",
    "C:\\Work\\Hidden", // hidden entries suppress re-discovery
  ];

  const merged = mergeProjects(registered, discovered);

  assert.deepEqual(paths(merged), ["C:\\Work\\Beta", "C:\\Work\\Alpha", "C:\\Work\\Gamma"]);
  assert.deepEqual(merged[0], {
    path: "C:\\Work\\Beta",
    addedAt: "2024-02-01",
    sortOrder: 2,
    pinOrder: 1,
  });
  assert.deepEqual(merged[1], { path: "C:\\Work\\Alpha", addedAt: "2024-01-01" });
  assert.deepEqual(merged[2], { path: "C:\\Work\\Gamma" });
});

test("mergeProjects tolerates duplicate registered paths and leaves inputs untouched", () => {
  const registered = deepFreeze([
    project("C:/Work/Repo", { addedAt: "2024-01-01" }),
    project("c:\\work\\repo", { addedAt: "2024-02-01" }),
  ]);
  const merged = mergeProjects(registered, []);

  assert.deepEqual(paths(merged), ["C:/Work/Repo"]);
  assert.deepEqual(registered, [
    { path: "C:/Work/Repo", addedAt: "2024-01-01" },
    { path: "c:\\work\\repo", addedAt: "2024-02-01" },
  ]);
});

// ---------------------------------------------------------------------------
// sortProjects

test("sortProjects applies manual sortOrder first, then addedAt desc, then path", () => {
  const sorted = sortProjects([
    project("C:/b", { addedAt: "2024-05-01" }),
    project("C:/a", { addedAt: "2024-01-01", sortOrder: 2 }),
    project("C:/c", { addedAt: "2024-06-01", sortOrder: 1 }),
    project("C:/d", { addedAt: "2024-05-01" }),
  ]);

  assert.deepEqual(paths(sorted), ["C:/c", "C:/a", "C:/b", "C:/d"]);
});

test("sortProjects keeps session-discovered projects below registered ones in path order", () => {
  const sorted = sortProjects([
    project("C:/zzz-discovered"),
    project("C:/aaa-discovered"),
    project("C:/registered", { addedAt: "2024-01-01" }),
  ]);

  assert.deepEqual(paths(sorted), ["C:/registered", "C:/aaa-discovered", "C:/zzz-discovered"]);
});

test("sortProjects breaks addedAt ties by path and does not mutate the input", () => {
  const input = deepFreeze([
    project("C:/z", { addedAt: "2024-01-01" }),
    project("C:/a", { addedAt: "2024-01-01" }),
  ]);

  assert.deepEqual(paths(sortProjects(input)), ["C:/a", "C:/z"]);
  assert.deepEqual(paths(input), ["C:/z", "C:/a"]);
});

// ---------------------------------------------------------------------------
// orderProjects

const labelByPath = {
  "C:/Work/apple": "Apple",
  "C:/Work/Banana": "banana",
  "C:/Work/Cherry": "Cherry",
  "C:/Work/project 2": "project 2",
  "C:/Work/project 10": "project 10",
  "C:/Work/pinned-a": "Pinned A",
  "C:/Work/pinned-b": "Pinned B",
  "C:/Work/tie": "Same",
  "C:/Work/tie2": "Same",
};
const labelOf = (p) => labelByPath[p.path] ?? p.path;

test("orderProjects puts pinned projects first in pinOrder", () => {
  const projects = [
    project("C:/Work/apple", { addedAt: "2024-04-01" }),
    project("C:/Work/pinned-b", { addedAt: "2024-01-01", pinOrder: 5 }),
    project("C:/Work/pinned-a", { addedAt: "2024-01-02", pinOrder: 2 }),
  ];

  assert.deepEqual(paths(orderProjects(projects, "alphabetical", [], labelOf)), [
    "C:/Work/pinned-a",
    "C:/Work/pinned-b",
    "C:/Work/apple",
  ]);
  assert.deepEqual(paths(orderProjects(projects, "updated", [], labelOf)), [
    "C:/Work/pinned-a",
    "C:/Work/pinned-b",
    "C:/Work/apple",
  ]);
});

test("orderProjects alphabetical is case-insensitive and numeric", () => {
  const projects = [
    project("C:/Work/project 10", { addedAt: "2024-01-01" }),
    project("C:/Work/apple", { addedAt: "2024-01-02" }),
    project("C:/Work/project 2", { addedAt: "2024-01-03" }),
    project("C:/Work/Banana", { addedAt: "2024-01-04" }),
  ];

  assert.deepEqual(paths(orderProjects(projects, "alphabetical", [], labelOf)), [
    "C:/Work/apple",
    "C:/Work/Banana",
    "C:/Work/project 2",
    "C:/Work/project 10",
  ]);
});

test("orderProjects alphabetical keeps the manual order for equal labels", () => {
  const projects = [
    project("C:/Work/tie2", { addedAt: "2024-01-01" }),
    project("C:/Work/tie", { addedAt: "2024-01-02" }),
  ];

  // Manual order is tie (newer) before tie2, and stable sorting must keep it.
  assert.deepEqual(paths(orderProjects(projects, "alphabetical", [], labelOf)), [
    "C:/Work/tie",
    "C:/Work/tie2",
  ]);
});

test("orderProjects updated follows newest activity and sends session-less projects last", () => {
  const projects = [
    project("C:/Work/apple", { addedAt: "2024-01-03" }),
    project("C:/Work/Banana", { addedAt: "2024-01-02" }),
    project("C:/Work/Cherry", { addedAt: "2024-01-01" }),
  ];
  const sessions = [
    // Banana: lastMessageAt must win over the later `modified`.
    session("b", {
      cwd: "C:/Work/Banana",
      modified: "2024-09-01T00:00:00Z",
      lastMessageAt: "2024-06-01T00:00:00Z",
    }),
    // Apple: only `modified`, older than Banana's last message.
    session("a", { cwd: "c:/work/apple", modified: "2024-05-01T00:00:00Z" }),
    // Unmatched session must not influence Cherry.
    session("x", { cwd: "D:/Elsewhere", lastMessageAt: "2024-12-01T00:00:00Z" }),
  ];

  assert.deepEqual(paths(orderProjects(projects, "updated", sessions, labelOf)), [
    "C:/Work/Banana",
    "C:/Work/apple",
    "C:/Work/Cherry",
  ]);
});

test("orderProjects updated keeps the manual order for equal activity", () => {
  const projects = [
    project("C:/Work/apple", { addedAt: "2024-01-03" }),
    project("C:/Work/Banana", { addedAt: "2024-01-02" }),
  ];
  const sessions = [
    session("a", { cwd: "C:/Work/apple", lastMessageAt: "2024-06-01T00:00:00Z" }),
    session("b", { cwd: "C:/Work/Banana", lastMessageAt: "2024-06-01T00:00:00Z" }),
  ];

  assert.deepEqual(paths(orderProjects(projects, "updated", sessions, labelOf)), [
    "C:/Work/apple",
    "C:/Work/Banana",
  ]);
});

test("orderProjects none ignores pins and uses the manual order", () => {
  const projects = [
    project("C:/Work/apple", { addedAt: "2024-01-03", pinOrder: 9 }),
    project("C:/Work/Banana", { addedAt: "2024-01-02" }),
  ];

  assert.deepEqual(paths(orderProjects(projects, "none", [], labelOf)), [
    "C:/Work/apple",
    "C:/Work/Banana",
  ]);
});

// ---------------------------------------------------------------------------
// groupSessions

test("groupSessions gives every project a bucket keyed by its exact path", () => {
  const projects = [project("C:\\Work\\Repo"), project("C:/Work/Empty")];
  const grouped = groupSessions(projects, []);

  assert.deepEqual([...grouped.keys()], ["C:\\Work\\Repo", "C:/Work/Empty"]);
  assert.deepEqual(grouped.get("C:\\Work\\Repo"), []);
  assert.deepEqual(grouped.get("C:/Work/Empty"), []);
});

test("groupSessions matches casing-insensitively and leaves unmatched sessions out", () => {
  const projects = [project("C:\\Work\\Repo"), project("C:/Work/Empty")];
  const repoSession = session("repo", { cwd: "c:/work/repo" });
  const worktreeSession = session("worktree", {
    cwd: "C:/Work/Repo/.worktrees/feature",
    projectRoot: "c:\\work\\REPO",
  });
  const straySession = session("stray", { cwd: "D:/Elsewhere" });

  const grouped = groupSessions(projects, [repoSession, worktreeSession, straySession]);

  assert.deepEqual(grouped.get("C:\\Work\\Repo"), [repoSession, worktreeSession]);
  assert.deepEqual(grouped.get("C:/Work/Empty"), []);
  assert.equal(grouped.size, 2);
  assert.equal([...grouped.values()].flat().includes(straySession), false);
});

test("groupSessions prefers projectKey over projectRoot and cwd", () => {
  const projects = [project("C:/Work/Repo")];
  const keyed = session("keyed", {
    cwd: "D:/Elsewhere",
    projectRoot: "D:/AlsoElsewhere",
    projectKey: "C:/Work/Repo",
  });

  assert.deepEqual(groupSessions(projects, [keyed]).get("C:/Work/Repo"), [keyed]);
});

// ---------------------------------------------------------------------------
// searchSessions

test("searchSessions matches name, cwd and project root case-insensitively", () => {
  const login = session("login", { cwd: "C:/Work/Alpha", name: "Fix Login" });
  const beta = session("beta", { cwd: "D:/Checkout", projectRoot: "C:/Work/Beta" });
  const other = session("other", { cwd: "E:/Unrelated" });
  const sessions = [login, beta, other];

  assert.deepEqual(searchSessions(sessions, "login"), [login]);
  assert.deepEqual(searchSessions(sessions, "ALPHA"), [login]);
  assert.deepEqual(searchSessions(sessions, "work"), [login, beta]);
  assert.deepEqual(searchSessions(sessions, "checkout"), [beta]);
  assert.deepEqual(searchSessions(sessions, "zzz"), []);
});

test("searchSessions returns all sessions in input order for empty or whitespace queries", () => {
  const sessions = deepFreeze([session("a"), session("b"), session("c")]);

  assert.deepEqual(searchSessions(sessions, ""), sessions);
  assert.deepEqual(searchSessions(sessions, "   \t "), sessions);
  assert.notEqual(searchSessions(sessions, ""), sessions);
});

// ---------------------------------------------------------------------------
// newestFirst

test("newestFirst orders by lastMessageAt, then modified, then created, missing last", () => {
  const newest = session("newest", { modified: "2024-03-01T00:00:00Z" });
  const messaged = session("messaged", {
    modified: "2024-05-01T00:00:00Z",
    lastMessageAt: "2024-02-01T00:00:00Z",
  });
  const created = session("created", { created: "2024-01-01T00:00:00Z" });
  const missing = session("missing", {});

  assert.deepEqual(newestFirst([missing, created, messaged, newest]), [
    newest,
    messaged,
    created,
    missing,
  ]);
});

test("newestFirst keeps input order for equal and missing timestamps", () => {
  const first = session("first", { lastMessageAt: "2024-06-01T00:00:00Z" });
  const second = session("second", { lastMessageAt: "2024-06-01T00:00:00Z" });
  const noA = session("no-a");
  const noB = session("no-b");

  assert.deepEqual(newestFirst([noA, first, noB, second]), [first, second, noA, noB]);
});

test("newestFirst copies the input and never mutates a frozen fixture", () => {
  const fixture = deepFreeze([
    session("old", { lastMessageAt: "2024-01-01T00:00:00Z" }),
    session("new", { lastMessageAt: "2024-04-01T00:00:00Z" }),
  ]);
  const before = structuredClone(fixture);

  const ordered = newestFirst(fixture);

  assert.deepEqual(ordered.map((s) => s.id), ["new", "old"]);
  assert.deepEqual(fixture, before);
  assert.notEqual(ordered, fixture);
});
