import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  dialogCommand,
  interpretDialogResult,
  pickDirectoryDialog,
  windowsDialogScript,
} from "./native-dialog.ts";

const noTools = () => null;

function decodeWindowsScript(args) {
  const index = args.indexOf("-EncodedCommand");
  assert.notEqual(index, -1);
  return Buffer.from(args[index + 1], "base64").toString("utf16le");
}

test("windows dialog compiles the shell picker and passes the start dir through the environment", () => {
  const spec = dialogCommand("win32", { title: "Add workspace folder", defaultPath: "D:\\Work\\omp-web" }, noTools);
  assert.ok(spec);
  assert.equal(spec.kind, "windows");
  assert.equal(spec.command, "powershell.exe");
  assert.ok(spec.args.includes("-STA"));
  assert.ok(spec.args.includes("-WindowStyle"));

  const script = decodeWindowsScript(spec.args);
  // The Explorer-style shell dialog, not the legacy SHBrowseForFolder tree.
  assert.match(script, /IFileOpenDialog/);
  assert.match(script, /FOS_PICKFOLDERS/);
  assert.match(script, /\[OmpFolderPicker\]::Pick\('Add workspace folder', \$env:OMP_PICK_START\)/);
  assert.match(script, /\[Console\]::OutputEncoding = \[System\.Text\.Encoding\]::UTF8/);
  // The path is never interpolated into the script; it travels in the environment.
  assert.doesNotMatch(script, /D:\\\\Work/);
});

test("windows script escapes a quote in the title", () => {
  assert.match(windowsDialogScript("Dad's folder"), /Pick\('Dad''s folder'/);
});

test("macOS dialog asks osascript for a POSIX path from the start directory", () => {
  const spec = dialogCommand("darwin", { title: "Add workspace folder", defaultPath: "/Users/me/project" }, noTools);
  assert.ok(spec);
  assert.equal(spec.kind, "osascript");
  assert.equal(spec.command, "osascript");
  const script = spec.args[1];
  assert.match(script, /choose folder with prompt "Add workspace folder"/);
  assert.match(script, /default location POSIX file "\/Users\/me\/project"/);
  assert.match(script, /^POSIX path of \(/);
});

test("linux prefers zenity, then kdialog, and reports a host with neither", () => {
  const zenity = dialogCommand("linux", { defaultPath: "/home/me/work" }, (name) =>
    (name === "zenity" ? "/usr/bin/zenity" : null));
  assert.equal(zenity?.kind, "zenity");
  assert.ok(zenity.args.includes("--directory"));
  assert.ok(zenity.args.includes("--filename=/home/me/work/"));

  const kdialog = dialogCommand("linux", { defaultPath: "/home/me/work" }, (name) =>
    (name === "kdialog" ? "/usr/bin/kdialog" : null));
  assert.equal(kdialog?.kind, "kdialog");
  assert.deepEqual(kdialog.args.slice(0, 3), ["--title", "Add workspace folder", "--getexistingdirectory"]);

  assert.equal(dialogCommand("linux", {}, noTools), null);
  assert.equal(dialogCommand("freebsd", {}, noTools), null);
});

test("a dialog's output becomes a picked folder, a cancel, or an unavailable host", () => {
  assert.deepEqual(
    interpretDialogResult("windows", 0, "D:\\Work\\omp-web\r\n", ""),
    { kind: "picked", path: "D:\\Work\\omp-web" },
  );
  // A selected drive root keeps its separator.
  assert.deepEqual(interpretDialogResult("windows", 0, "D:\\", ""), { kind: "picked", path: "D:\\" });
  assert.deepEqual(interpretDialogResult("windows", 0, "  \r\n", ""), { kind: "cancelled" });

  assert.deepEqual(interpretDialogResult("osascript", 0, "/Users/me/project/\n", ""), {
    kind: "picked",
    path: "/Users/me/project",
  });
  assert.deepEqual(interpretDialogResult("osascript", 1, "", "execution error: User canceled. (-128)"), {
    kind: "cancelled",
  });
  assert.equal(interpretDialogResult("osascript", 1, "", "execution error: no such volume").kind, "unavailable");

  assert.deepEqual(interpretDialogResult("zenity", 1, "", ""), { kind: "cancelled" });
  assert.equal(interpretDialogResult("zenity", 5, "", "Gtk warning").kind, "unavailable");
  assert.deepEqual(interpretDialogResult("kdialog", 1, "", ""), { kind: "cancelled" });
});

test("a host without any dialog tool answers unavailable instead of throwing", async () => {
  assert.deepEqual(
    await pickDirectoryDialog({}, { platform: "freebsd" }),
    { kind: "unavailable", reason: "No native folder dialog on this host" },
  );
  assert.deepEqual(
    await pickDirectoryDialog({}, { platform: "linux", findTool: noTools }),
    { kind: "unavailable", reason: "No native folder dialog on this host" },
  );
});

test("only one dialog is open at a time", async () => {
  const first = pickDirectoryDialog({}, { platform: "freebsd" });
  const second = pickDirectoryDialog({}, { platform: "freebsd" });
  assert.equal((await second).kind, "busy");
  assert.equal((await first).kind, "unavailable");
  // The guard clears once the dialog has closed.
  assert.equal((await pickDirectoryDialog({}, { platform: "freebsd" })).kind, "unavailable");
});
