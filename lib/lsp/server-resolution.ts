import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { LspSettings } from "./types";

export interface LspLaunchCandidate {
  command: string;
  args: string[];
}

export type LspResolution =
  | { ok: true; id: string; candidates: LspLaunchCandidate[]; env?: Record<string, string> }
  | { ok: false; reason: "disabled" | "unsupported_language" | "missing_server"; hint?: string };

export interface LspResolutionDeps {
  which?: (name: string) => string | null;
  resolveTypescriptCli?: () => string | null;
}

const requireFromHere = createRequire(import.meta.url);

export function defaultTypescriptCli(): string | null {
  try {
    const packageJson = requireFromHere.resolve("typescript-language-server/package.json");
    const cli = join(dirname(packageJson), "lib", "cli.mjs");
    return existsSync(cli) ? cli : null;
  } catch {
    return null;
  }
}

function defaultWhich(name: string): string | null {
  return Bun.which(name) ?? null;
}

function resolveTypeScript(deps: Required<LspResolutionDeps>): LspResolution {
  const cli = deps.resolveTypescriptCli();
  if (cli) {
    const candidates: LspLaunchCandidate[] = [{ command: process.execPath, args: [cli, "--stdio"] }];
    const node = deps.which("node");
    if (node && node !== process.execPath) candidates.push({ command: node, args: [cli, "--stdio"] });
    return { ok: true, id: "typescript", candidates };
  }
  const onPath = deps.which("typescript-language-server");
  if (onPath) return { ok: true, id: "typescript", candidates: [{ command: onPath, args: ["--stdio"] }] };
  return {
    ok: false,
    reason: "missing_server",
    hint: "Install typescript-language-server in the project or on PATH.",
  };
}

function resolveCSharp(deps: Required<LspResolutionDeps>): LspResolution {
  const csharpLs = deps.which("csharp-ls");
  if (csharpLs) return { ok: true, id: "csharp", candidates: [{ command: csharpLs, args: [] }] };
  const omnisharp = deps.which("omnisharp");
  if (omnisharp) return { ok: true, id: "csharp", candidates: [{ command: omnisharp, args: ["--languageserver"] }] };
  return { ok: false, reason: "missing_server", hint: "dotnet tool install -g csharp-ls" };
}

export function resolveLspServer(
  languageId: string,
  settings: LspSettings,
  deps: LspResolutionDeps = {},
): LspResolution {
  if (!settings.enabled) return { ok: false, reason: "disabled" };
  const language = languageId.trim().toLowerCase();
  const resolved: Required<LspResolutionDeps> = {
    which: deps.which ?? defaultWhich,
    resolveTypescriptCli: deps.resolveTypescriptCli ?? defaultTypescriptCli,
  };

  const userServer = settings.servers.find((server) =>
    server.languages.some((entry) => entry.toLowerCase() === language),
  );
  if (userServer) {
    const resolution: LspResolution = {
      ok: true,
      id: userServer.id,
      candidates: [{ command: userServer.command, args: [...userServer.args] }],
    };
    if (userServer.env) resolution.env = { ...userServer.env };
    return resolution;
  }

  if (language === "typescript" || language === "javascript") return resolveTypeScript(resolved);
  if (language === "csharp") return resolveCSharp(resolved);
  return { ok: false, reason: "unsupported_language" };
}
