/**
 * The host's own folder dialog.
 *
 * A page cannot open one: `showDirectoryPicker` is Chromium-only and hides the
 * absolute path, and no browser can put a native dialog on screen. This server
 * runs on the same machine as the browser, so it shows the dialog itself, like
 * VS Code's main process does for its renderer.
 *
 * Every platform helper is a one-shot child process; nothing blocks the event
 * loop. Cancel is a normal outcome, not an error.
 */

import { createChildProcessEnvironment } from "./project-command-env";

export type DirectoryDialogResult =
  | { kind: "picked"; path: string }
  | { kind: "cancelled" }
  | { kind: "unavailable"; reason: string }
  /** Another dialog is already open in this process. */
  | { kind: "busy" };

export interface DirectoryDialogRequest {
  /** Instruction text shown by the dialog. */
  title?: string;
  /** Directory the dialog opens in. */
  defaultPath?: string;
}

export interface DialogCommand {
  command: string;
  args: string[];
  /** Which platform dialog runs; drives how its output is read. */
  kind: "windows" | "osascript" | "zenity" | "kdialog";
}

const DEFAULT_TITLE = "Add workspace folder";
/** A dialog left open for this long is closed and reported as cancelled. */
const DIALOG_TIMEOUT_MS = 5 * 60_000;

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * The Windows folder dialog as C# because `FolderBrowserDialog` still renders
 * the XP-era tree (`SHBrowseForFolder`); the shell's `IFileOpenDialog` with
 * `FOS_PICKFOLDERS` is the Explorer-style picker every native app shows.
 */
const WINDOWS_PICKER_SOURCE = `
using System;
using System.Runtime.InteropServices;

public static class OmpFolderPicker
{
    private const uint FOS_PICKFOLDERS = 0x20;
    private const uint FOS_FORCEFILESYSTEM = 0x40;
    private const uint FOS_PATHMUSTEXIST = 0x800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, int flags);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int result);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr context, ref Guid handler, ref Guid interfaceId, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint form, [MarshalAs(UnmanagedType.LPWStr)] out string name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem other, uint hint, out int order);
    }

    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7"), ClassInterface(ClassInterfaceType.None)]
    private class FileOpenDialog { }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string path,
        IntPtr context,
        [MarshalAs(UnmanagedType.LPStruct)] Guid interfaceId,
        out IShellItem item);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    /** Null when the user cancels; throws when the dialog cannot be shown. */
    public static string Pick(string title, string start)
    {
        var dialog = (IFileDialog)new FileOpenDialog();
        dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        if (!string.IsNullOrWhiteSpace(title)) dialog.SetTitle(title);
        if (!string.IsNullOrWhiteSpace(start) && System.IO.Directory.Exists(start))
        {
            try
            {
                IShellItem folder;
                SHCreateItemFromParsingName(start, IntPtr.Zero, typeof(IShellItem).GUID, out folder);
                dialog.SetFolder(folder);
            }
            catch (Exception)
            {
                // An unresolvable start directory only costs the initial location.
            }
        }

        // Owned by the foreground window, so the dialog opens on top of the app
        // that asked for it instead of behind it.
        int result = dialog.Show(GetForegroundWindow());
        if (result == ERROR_CANCELLED) return null;
        if (result < 0) throw new COMException("IFileOpenDialog could not be shown", result);

        IShellItem chosen;
        dialog.GetResult(out chosen);
        string path;
        chosen.GetDisplayName(SIGDN_FILESYSPATH, out path);
        return path;
    }
}
`;

/**
 * PowerShell script for the shell folder dialog: it compiles the picker above,
 * opens it on top of the asking app, and writes the chosen directory to stdout
 * as UTF-8. The start directory travels in `OMP_PICK_START`, so no path is ever
 * interpolated into the script.
 */
export function windowsDialogScript(title: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$source = @'",
    WINDOWS_PICKER_SOURCE.trim(),
    "'@",
    "Add-Type -TypeDefinition $source",
    `$path = [OmpFolderPicker]::Pick('${escapeSingleQuotes(title)}', $env:OMP_PICK_START)`,
    "if ($path) { [Console]::Out.Write($path) }",
  ].join("\n");
}

/** The dialog invocation for this platform, or null when the host has none. */
export function dialogCommand(
  platform: NodeJS.Platform,
  request: DirectoryDialogRequest,
  findTool: (name: string) => string | null,
): DialogCommand | null {
  const title = request.title?.trim() || DEFAULT_TITLE;
  const start = request.defaultPath?.trim();
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        Buffer.from(windowsDialogScript(title), "utf16le").toString("base64"),
      ],
      kind: "windows",
    };
  }
  if (platform === "darwin") {
    const location = start ? ` default location POSIX file "${escapeAppleScriptString(start)}"` : "";
    return {
      command: "osascript",
      args: ["-e", `POSIX path of (choose folder with prompt "${escapeAppleScriptString(title)}"${location})`],
      kind: "osascript",
    };
  }
  if (platform === "linux") {
    const zenity = findTool("zenity");
    if (zenity) {
      return {
        command: zenity,
        args: [
          "--file-selection",
          "--directory",
          `--title=${title}`,
          ...(start ? [`--filename=${start.replace(/\/+$/, "")}/`] : []),
        ],
        kind: "zenity",
      };
    }
    const kdialog = findTool("kdialog");
    if (kdialog) {
      return {
        command: kdialog,
        args: ["--title", title, "--getexistingdirectory", ...(start ? [start] : [])],
        kind: "kdialog",
      };
    }
    return null;
  }
  return null;
}

/** Trim a trailing separator, keeping the root itself (`/`, `C:\`). */
function tidyPath(value: string, kind: DialogCommand["kind"]): string {
  if (kind === "windows") {
    return /^[A-Za-z]:[\\/]$/.test(value) ? value : value.replace(/[\\/]+$/, "");
  }
  const trimmed = value.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Read one dialog's exit code and output. */
export function interpretDialogResult(
  kind: DialogCommand["kind"],
  exitCode: number,
  stdout: string,
  stderr: string,
): DirectoryDialogResult {
  const output = stdout.trim();
  if (exitCode === 0) {
    if (output === "") return { kind: "cancelled" };
    return { kind: "picked", path: tidyPath(output, kind) };
  }
  // `choose folder` cancelled raises AppleScript error -128.
  const cancelled = kind === "zenity" || kind === "kdialog"
    ? exitCode === 1
    : kind === "osascript" && /-128|User canceled/.test(stderr);
  if (cancelled) return { kind: "cancelled" };
  // PowerShell wraps native errors in CLIXML progress junk; keep the last real line.
  const detail = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#<"))
    .pop();
  return { kind: "unavailable", reason: detail ?? `${kind} dialog failed with code ${exitCode}` };
}

export interface DialogOptions {
  platform?: NodeJS.Platform;
  findTool?: (name: string) => string | null;
  timeoutMs?: number;
}

function defaultFindTool(name: string): string | null {
  return Bun.which(name) ?? null;
}

const UNSUPPORTED = "No native folder dialog on this host";

/** Start the dialog helper; a missing binary is an unavailable host, not a crash. */
function startDialogProcess(
  spec: DialogCommand,
  request: DirectoryDialogRequest,
  platform: NodeJS.Platform,
) {
  try {
    return {
      process: Bun.spawn([spec.command, ...spec.args], {
        stdout: "pipe",
        stderr: "pipe",
        env: createChildProcessEnvironment({ OMP_PICK_START: request.defaultPath ?? "" }, process.env, platform),
        windowsHide: true,
      }),
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : UNSUPPORTED };
  }
}

async function runDialog(
  request: DirectoryDialogRequest,
  options: DialogOptions,
): Promise<DirectoryDialogResult> {
  const platform = options.platform ?? process.platform;
  const spec = dialogCommand(platform, request, options.findTool ?? defaultFindTool);
  if (!spec) return { kind: "unavailable", reason: UNSUPPORTED };

  const started = startDialogProcess(spec, request, platform);
  if ("error" in started) return { kind: "unavailable", reason: started.error ?? UNSUPPORTED };
  const child = started.process;

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, options.timeoutMs ?? DIALOG_TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => clearTimeout(timer));

  if (timedOut) return { kind: "cancelled" };
  return interpretDialogResult(spec.kind, exitCode, stdout, stderr);
}

let active: Promise<DirectoryDialogResult> | null = null;

/** Show the folder dialog. A second call while one is open answers `busy`. */
export function pickDirectoryDialog(
  request: DirectoryDialogRequest = {},
  options: DialogOptions = {},
): Promise<DirectoryDialogResult> {
  if (active) return Promise.resolve({ kind: "busy" });
  const running = runDialog(request, options).finally(() => {
    active = null;
  });
  active = running;
  return running;
}
