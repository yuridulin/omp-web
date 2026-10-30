import { isRecord } from "../type-guards";

/** One language server the user (or a preset) can launch. */
export interface LspServerDefinition {
  id: string;
  languages: string[];
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface LspSettings {
  enabled: boolean;
  servers: LspServerDefinition[];
}

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** The subset of LSP diagnostics omp-web renders. */
export interface LspDiagnostic {
  range: LspRange;
  severity?: 1 | 2 | 3 | 4;
  code?: string | number;
  source?: string;
  message: string;
}

export const DEFAULT_LSP_SETTINGS: LspSettings = { enabled: true, servers: [] };

const MAX_SERVERS = 8;
const MAX_LANGUAGES = 32;
const MAX_ARGS = 32;
const MAX_ENV = 32;
const MAX_ID = 64;
const MAX_LANGUAGE = 32;
const MAX_COMMAND = 1024;
const MAX_ARG = 1024;
const MAX_ENV_NAME = 128;
const MAX_ENV_VALUE = 4096;

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const entry of value) {
    const parsed = boundedString(entry, maxLength);
    if (parsed === null) return null;
    result.push(parsed);
  }
  return result;
}

function stringRecord(value: unknown): Record<string, string> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_ENV) return null;
  const result: Record<string, string> = {};
  for (const [name, entry] of entries) {
    if (name.length === 0 || name.length > MAX_ENV_NAME) return null;
    if (typeof entry !== "string" || entry.length > MAX_ENV_VALUE) return null;
    result[name] = entry;
  }
  return result;
}

function parseServerDefinition(value: unknown): LspServerDefinition | null {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id, MAX_ID);
  const languages = stringArray(value.languages, MAX_LANGUAGES, MAX_LANGUAGE);
  const command = boundedString(value.command, MAX_COMMAND);
  const args = value.args === undefined ? [] : stringArray(value.args, MAX_ARGS, MAX_ARG);
  const env = stringRecord(value.env);
  if (id === null || languages === null || languages.length === 0 || command === null || args === null) return null;
  if (env === null) return null;
  return env === undefined ? { id, languages, command, args } : { id, languages, command, args, env };
}

/**
 * Total boundary parser: malformed input yields the defaults, invalid server
 * entries are dropped, and every field is bounded. Never throws.
 */
export function readLspSettings(value: unknown): LspSettings {
  if (!isRecord(value)) return { ...DEFAULT_LSP_SETTINGS, servers: [] };
  const servers: LspServerDefinition[] = [];
  if (Array.isArray(value.servers)) {
    for (const entry of value.servers) {
      if (servers.length >= MAX_SERVERS) break;
      const parsed = parseServerDefinition(entry);
      if (parsed) servers.push(parsed);
    }
  }
  return { enabled: value.enabled !== false, servers };
}

/**
 * Strict counterpart used by the settings PUT: any malformed field rejects the
 * whole payload. Returns null when the value is not a complete LSP settings
 * object.
 */
export function validateLspSettings(value: unknown): LspSettings | null {
  if (!isRecord(value)) return null;
  if (typeof value.enabled !== "boolean") return null;
  if (!Array.isArray(value.servers) || value.servers.length > MAX_SERVERS) return null;
  const servers: LspServerDefinition[] = [];
  for (const entry of value.servers) {
    const parsed = parseServerDefinition(entry);
    if (!parsed) return null;
    servers.push(parsed);
  }
  return { enabled: value.enabled, servers };
}
