import assert from "node:assert/strict";
import { test, onTestFinished } from "bun:test";

async function loadSubject() {
  return import("./git-status.ts");
}

test("parses null-delimited Git status entries including renames", async () => {
  const { parseGitPorcelainV1 } = await loadSubject();
  const entries = parseGitPorcelainV1([
    " M components/App.tsx",
    "?? notes.txt",
    "R  src/new-name.ts",
    "src/old-name.ts",
    "",
  ].join("\0"));

  assert.deepEqual(entries, [
    {
      path: "components/App.tsx",
      indexStatus: " ",
      worktreeStatus: "M",
    },
    {
      path: "notes.txt",
      indexStatus: "?",
      worktreeStatus: "?",
    },
    {
      path: "src/new-name.ts",
      originalPath: "src/old-name.ts",
      indexStatus: "R",
      worktreeStatus: " ",
    },
  ]);
});

test("classifies Git status for explorer badges", async () => {
  const { classifyGitStatus } = await loadSubject();
  const classify = (pair) => classifyGitStatus({
    path: "file.ts",
    indexStatus: pair[0],
    worktreeStatus: pair[1],
  });

  assert.deepEqual(classify(" M"), { status: "modified", code: "M" });
  assert.deepEqual(classify("??"), { status: "untracked", code: "U" });
  assert.deepEqual(classify("A "), { status: "added", code: "A" });
  assert.deepEqual(classify("R "), { status: "renamed", code: "R" });
  assert.deepEqual(classify("UU"), { status: "conflict", code: "C" });
  assert.deepEqual(classify(" D"), { status: "deleted", code: "D" });
});

test("maps .gitattributes review attributes from real git check-attr output", async () => {
  const { GIT_REVIEW_ATTRIBUTES, parseGitCollapseReasons } = await loadSubject();
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "git-attrs-"));
  onTestFinished(() => fs.rmSync(repo, { recursive: true, force: true }));
  // Keep the developer's global/system attributes out of the result.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  execFileSync("git", ["init", "-q", repo], { env });
  fs.writeFileSync(path.join(repo, ".gitattributes"), [
    "graph.json linguist-generated=true -diff",
    "gen/** linguist-generated",
    "build/** linguist-generated=true",
    "vendor/** linguist-vendored",
    "vendor/own.js linguist-vendored=false",
    "docs/** linguist-documentation",
    "docs/keep.md -linguist-documentation",
    "lock.txt -diff",
    "*.png binary",
    "",
  ].join("\n"));
  const paths = ["graph.json", "gen/a.ts", "build/out.js", "vendor/b.js", "vendor/own.js", "docs/c.md", "docs/keep.md", "lock.txt", "logo.png", "src/app.ts"];
  const output = execFileSync("git", ["-C", repo, "check-attr", "-z", "--stdin", ...GIT_REVIEW_ATTRIBUTES], {
    input: paths.map((p) => `${p}\0`).join(""),
    encoding: "utf8",
    env,
  });

  assert.deepEqual(Object.fromEntries(parseGitCollapseReasons(output)), {
    "graph.json": "no-diff",
    "gen/a.ts": "generated",
    "build/out.js": "generated",
    "vendor/b.js": "vendored",
    "docs/c.md": "documentation",
    "lock.txt": "no-diff",
  });
});

test("git status marks attribute files and -diff files get no synthesized patch", async () => {
  const { getGitFileDiff, getGitStatus } = await import("./git-changes.ts");
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  // getGitStatus/getGitFileDiff inherit process.env; isolate global/system attributes.
  const saved = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  // `.native` expands Windows 8.3 names (RUNNER~1) so paths match `git rev-parse --show-toplevel`.
  const repo = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "git-attrs-diff-")));
  onTestFinished(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(repo, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q");
  fs.writeFileSync(path.join(repo, ".gitattributes"), "lock.txt -diff\ndocs/** linguist-documentation\n");
  git("add", "-A");
  git("commit", "-qm", "init");
  fs.mkdirSync(path.join(repo, "docs"));
  fs.writeFileSync(path.join(repo, "lock.txt"), "hi\n");
  fs.writeFileSync(path.join(repo, "docs", "a.md"), "hi\n");
  fs.writeFileSync(path.join(repo, "note.txt"), "hi\n");

  const status = await getGitStatus(repo);
  assert.deepEqual(
    Object.fromEntries(status.files.map((f) => [path.relative(repo, f.filePath), f.collapseReason ?? null])),
    { "lock.txt": "no-diff", [path.join("docs", "a.md")]: "documentation", "note.txt": null },
  );

  assert.deepEqual(await getGitFileDiff(repo, path.join(repo, "lock.txt")), { supported: false });
  const docs = await getGitFileDiff(repo, path.join(repo, "docs", "a.md"));
  assert.equal(docs.supported, true);
  assert.match(docs.patch, /^\+hi$/m);
  const note = await getGitFileDiff(repo, path.join(repo, "note.txt"));
  assert.equal(note.supported, true);
  assert.match(note.patch, /^\+hi$/m);
});

test("git file contents compare HEAD, index, worktree and commits", async () => {
  const { getGitFileContents } = await import("./git-changes.ts");
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const saved = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  const repo = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "git-contents-")));
  onTestFinished(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(repo, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
  git("init", "-q");
  const file = path.join(repo, "note.txt");
  fs.writeFileSync(file, "one\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD").trim();

  fs.writeFileSync(file, "two\n");
  const working = await getGitFileContents(repo, file, { from: "HEAD", to: "WORKTREE" });
  assert.equal(working.supported, true);
  assert.equal(working.before, "one\n");
  assert.equal(working.after, "two\n");
  assert.equal(working.language, "text");

  git("add", "-A");
  const staged = await getGitFileContents(repo, file, { from: "HEAD", to: "INDEX" });
  assert.equal(staged.before, "one\n");
  assert.equal(staged.after, "two\n");
  const unstaged = await getGitFileContents(repo, file, { from: "INDEX", to: "WORKTREE" });
  assert.equal(unstaged.before, "two\n");
  assert.equal(unstaged.after, "two\n");

  git("commit", "-qm", "second");
  const committed = await getGitFileContents(repo, file, { from: base, to: "HEAD" });
  assert.equal(committed.before, "one\n");
  assert.equal(committed.after, "two\n");

  const untrackedFile = path.join(repo, "new.txt");
  fs.writeFileSync(untrackedFile, "fresh\n");
  const untracked = await getGitFileContents(repo, untrackedFile, { from: "EMPTY", to: "WORKTREE" });
  assert.equal(untracked.supported, true);
  assert.equal(untracked.before, "");
  assert.equal(untracked.after, "fresh\n");

  const binaryFile = path.join(repo, "blob.bin");
  fs.writeFileSync(binaryFile, Buffer.from([0, 1, 2, 3]));
  const binary = await getGitFileContents(repo, binaryFile, { from: "EMPTY", to: "WORKTREE" });
  assert.deepEqual(binary, { supported: false, binary: true });
});
