/**
 * Slash-command catalog, parsing and resolution.
 *
 * A catalog merges the commands the runtime advertises with the web-native
 * commands the client owns. Runtime entries are authoritative: they keep their
 * position first and shadow any web command with the same name. Resolution is
 * pure so both the idle dispatcher and the streaming queue path can share it.
 */

export interface CommandEntry {
  /** Command name without the leading slash. */
  name: string;
  source: "runtime" | "web";
  requiresArgs: boolean;
  aliases?: readonly string[];
  /** Web entries only: composes the prompt sent to the agent. */
  buildPrompt?: (args: string) => string;
}

export interface CommandCatalog {
  entries: readonly CommandEntry[];
}

export type InputResolution =
  | { kind: "prompt" }
  | { kind: "runtime"; entry: CommandEntry; args: string }
  | { kind: "expand"; entry: CommandEntry; prompt: string }
  | { kind: "usage"; entry: CommandEntry };

const COMMAND_LINE = /^\/(\S+)(?:\s+([\s\S]*))?$/;

/**
 * Split a command line into its name and trimmed argument text.
 *
 * Returns null when the line is not a command at all: it must start with a
 * slash immediately followed by a non-empty name. Anything else is literal
 * prompt text.
 */
export function parseCommandLine(text: string): { name: string; args: string } | null {
  const match = COMMAND_LINE.exec(text);
  if (!match) return null;
  return { name: match[1], args: (match[2] ?? "").trim() };
}

/** Merge runtime and web entries; runtime entries win by name and come first. */
export function buildCatalog(runtime: readonly CommandEntry[], web: readonly CommandEntry[]): CommandCatalog {
  const runtimeNames = new Set(runtime.map((entry) => entry.name));
  const entries: CommandEntry[] = [];
  for (const entry of runtime) {
    if (!entries.some((existing) => existing.name === entry.name)) entries.push(entry);
  }
  for (const entry of web) {
    if (runtimeNames.has(entry.name)) continue;
    if (entries.some((existing) => existing.name === entry.name)) continue;
    entries.push(entry);
  }
  return { entries };
}

/**
 * Resolve user input against the catalog.
 *
 * Slash lines that name a known command become a runtime call, an expanded web
 * prompt, or a usage result; everything else (including unknown commands) is
 * plain prompt text and is forwarded verbatim.
 */
export function resolveInput(catalog: CommandCatalog, text: string): InputResolution {
  const parsed = parseCommandLine(text);
  if (!parsed) return { kind: "prompt" };
  const entry = catalog.entries.find((candidate) => candidate.name === parsed.name || candidate.aliases?.includes(parsed.name));
  if (!entry) return { kind: "prompt" };
  if (entry.requiresArgs && !parsed.args) return { kind: "usage", entry };
  if (entry.source === "runtime") return { kind: "runtime", entry, args: parsed.args };
  const prompt = entry.buildPrompt ? entry.buildPrompt(parsed.args) : undefined;
  if (prompt === undefined) return { kind: "usage", entry };
  return { kind: "expand", entry, prompt };
}

/** Case-insensitive prefix filter over names and aliases, in catalog order. */
export function filterCommands(catalog: CommandCatalog, query: string): readonly CommandEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return catalog.entries;
  return catalog.entries.filter(
    (entry) =>
      entry.name.toLowerCase().startsWith(needle) ||
      (entry.aliases?.some((alias) => alias.toLowerCase().startsWith(needle)) ?? false),
  );
}
