import { api } from "./client";
import { isRecord } from "./guards";
import type { paths } from "./schema";

type SettingsResponse = NonNullable<
  paths["/api/system/settings"]["get"]["responses"][200]["content"]["application/json"]
>;
export type NativeSettings = SettingsResponse["settings"];

type SettingsPutBody = NonNullable<
  paths["/api/system/settings"]["put"]["requestBody"]
>["content"]["application/json"];

type ModelRolesResponse = NonNullable<
  paths["/api/system/model-roles"]["get"]["responses"][200]["content"]["application/json"]
>;
export type ModelRoles = ModelRolesResponse["roles"];

type WebSettingsResponse = NonNullable<
  paths["/api/system/web-settings"]["get"]["responses"][200]["content"]["application/json"]
>;
export type WebSettings = WebSettingsResponse;

type WebSettingsPutBody = NonNullable<
  paths["/api/system/web-settings"]["put"]["requestBody"]
>["content"]["application/json"];
export type WebSettingsPatch = WebSettingsPutBody;

type LoginProvidersResponse = NonNullable<
  paths["/api/system/auth/providers"]["get"]["responses"][200]["content"]["application/json"]
>;
export type LoginProvider = LoginProvidersResponse["providers"][number];

type AllProvidersResponse = NonNullable<
  paths["/api/system/auth/all-providers"]["get"]["responses"][200]["content"]["application/json"]
>;
export type ConfiguredProvider = AllProvidersResponse["providers"][number];

type ModelsResponse = NonNullable<
  paths["/api/system/models"]["get"]["responses"][200]["content"]["application/json"]
>;
export type ConnectedProvider = NonNullable<ModelsResponse["connectedProviders"]>[number];

export interface NativeSettingsFile {
  path: string;
  settings: NativeSettings;
}

/** Anything the settings file carries that we do not model explicitly. */
export type SettingsRecord = Record<string, unknown>;

function errorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === "string" && value.error.length > 0) {
    return value.error;
  }
  return `HTTP ${status}`;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

/** Total normalization of a `modelRoles` map from any boundary payload. */
export function normalizeModelRoles(value: unknown): ModelRoles {
  if (!isRecord(value)) return {};
  const roles: ModelRoles = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") continue;
    const role = key.trim();
    if (role.length === 0 || entry.trim().length === 0) continue;
    roles[role] = entry;
  }
  return roles;
}

/** Total parse of the native settings object; unknown fields survive untouched. */
export function parseNativeSettings(value: unknown): NativeSettings {
  if (!isRecord(value)) return {};
  return value as unknown as NativeSettings;
}

type LspSettingsPayload = WebSettings["lsp"];
type LspServerPayload = LspSettingsPayload["servers"][number];

function parseLspServers(value: unknown): LspServerPayload[] {
  if (!Array.isArray(value)) return [];
  const servers: LspServerPayload[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = entry.id;
    const languages = entry.languages;
    const command = entry.command;
    const args = entry.args;
    if (typeof id !== "string" || typeof command !== "string") continue;
    if (!Array.isArray(languages) || !Array.isArray(args)) continue;
    const server: LspServerPayload = {
      id,
      languages: languages.filter((language): language is string => typeof language === "string"),
      command,
      args: args.filter((arg): arg is string => typeof arg === "string"),
    };
    if (isRecord(entry.env)) server.env = stringRecord(entry.env);
    servers.push(server);
  }
  return servers;
}

/** Total parse of omp-web's own settings payload. */
export function parseWebSettings(value: unknown): WebSettings {
  const source: Record<string, unknown> = isRecord(value) ? value : {};
  const lsp = isRecord(source.lsp) ? source.lsp : {};
  return {
    ...source,
    autoResumeSessions: source.autoResumeSessions === true,
    agentToolsEnabled: source.agentToolsEnabled === true,
    agentEnv: stringRecord(source.agentEnv),
    lsp: {
      enabled: lsp.enabled !== false,
      servers: parseLspServers(lsp.servers),
    },
  };
}

/**
 * Immutably write `value` at `path`, cloning every level on the way so unrelated
 * fields — including ones this UI never renders — are preserved verbatim.
 * Passing `undefined` removes the leaf (used by "inherit/default" selects).
 */
export function setNested<T extends SettingsRecord>(
  source: T,
  path: readonly string[],
  value: unknown,
): T {
  const [head, ...rest] = path;
  if (head === undefined) return source;
  const next: SettingsRecord = { ...source };
  if (rest.length === 0) {
    if (value === undefined) {
      delete next[head];
    } else {
      next[head] = value;
    }
    return next as T;
  }
  const child = source[head];
  next[head] = setNested(isRecord(child) ? child : {}, rest, value);
  return next as T;
}

/** Read a nested value without assuming any shape. */
export function getNested(source: SettingsRecord, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function readNativeSetting(settings: NativeSettings, path: readonly string[]): unknown {
  return getNested(settings as SettingsRecord, path);
}

export function readNativeBoolean(
  settings: NativeSettings,
  path: readonly string[],
  fallback: boolean,
): boolean {
  const value = readNativeSetting(settings, path);
  return typeof value === "boolean" ? value : fallback;
}

export function readNativeString(
  settings: NativeSettings,
  path: readonly string[],
  fallback: string,
): string {
  const value = readNativeSetting(settings, path);
  return typeof value === "string" ? value : fallback;
}

/** Apply a nested edit to a native settings object while preserving the rest. */
export function updateNativeSetting(
  settings: NativeSettings,
  path: readonly string[],
  value: unknown,
): NativeSettings {
  return setNested(settings as SettingsRecord, path, value) as unknown as NativeSettings;
}

export async function fetchNativeSettings(): Promise<NativeSettingsFile> {
  const { data, error, response } = await api.GET("/api/system/settings");
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty settings response");
  return {
    path: typeof data.path === "string" ? data.path : "",
    settings: parseNativeSettings(data.settings),
  };
}

export async function saveNativeSettings(settings: NativeSettings): Promise<NativeSettings> {
  const body: SettingsPutBody = { settings };
  const { data, error, response } = await api.PUT("/api/system/settings", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty settings response");
  return parseNativeSettings(data.settings);
}

export async function fetchWebSettings(): Promise<WebSettings> {
  const { data, error, response } = await api.GET("/api/system/web-settings");
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty web settings response");
  return parseWebSettings(data);
}

export async function saveWebSettings(patch: WebSettingsPatch): Promise<WebSettings> {
  const { data, error, response } = await api.PUT("/api/system/web-settings", { body: patch });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty web settings response");
  return parseWebSettings(data);
}

export async function fetchModelRoles(): Promise<{ path: string; roles: ModelRoles }> {
  const { data, error, response } = await api.GET("/api/system/model-roles");
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty model roles response");
  return {
    path: typeof data.path === "string" ? data.path : "",
    roles: normalizeModelRoles(data.roles),
  };
}

export async function saveModelRoles(roles: ModelRoles): Promise<ModelRoles> {
  const { data, error, response } = await api.PUT("/api/system/model-roles", {
    body: { roles },
  });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty model roles response");
  return normalizeModelRoles(data.roles);
}

export async function fetchLoginProviders(): Promise<LoginProvider[]> {
  const { data, error, response } = await api.GET("/api/system/auth/providers");
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty login providers response");
  return Array.isArray(data.providers) ? data.providers : [];
}

export async function fetchConfiguredProviders(): Promise<ConfiguredProvider[]> {
  const { data, error, response } = await api.GET("/api/system/auth/all-providers");
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty providers response");
  return Array.isArray(data.providers) ? data.providers : [];
}

export async function enableProvider(provider: string): Promise<void> {
  const { error, response } = await api.POST("/api/system/providers/enable", {
    body: { provider },
  });
  if (error) throw new Error(errorMessage(error, response.status));
}

/** Connected model providers, including ones disabled in `config.yml`. */
export async function fetchConnectedProviders(): Promise<ConnectedProvider[]> {
  const { data, error, response } = await api.GET("/api/system/models");
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty models response");
  return Array.isArray(data.connectedProviders) ? data.connectedProviders : [];
}

export interface ModelRoleRow {
  role: string;
  model: string;
}

/** Model selectors are stored as `<provider>/<modelId>` in `config.yml`. */
export function formatModelSelector(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

/** Stable, human-sorted view of the roles map for the editor. */
export function toModelRoleRows(roles: ModelRoles): ModelRoleRow[] {
  return Object.entries(roles)
    .map(([role, model]) => ({ role, model }))
    .sort((left, right) => left.role.localeCompare(right.role));
}

/** Editor rows back to the wire map: trimmed, empty rows dropped, last duplicate wins. */
export function fromModelRoleRows(rows: readonly ModelRoleRow[]): ModelRoles {
  const roles: ModelRoles = {};
  for (const row of rows) {
    const role = row.role.trim();
    const model = row.model.trim();
    if (role.length === 0 || model.length === 0) continue;
    roles[role] = model;
  }
  return roles;
}

const AGENT_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Mirrors `lib/omp/agent-env-policy.ts`; kept local because the UI may not import `lib/`. */
const DENIED_AGENT_ENV_NAMES: Record<string, true> = {
  PATH: true,
  PATHEXT: true,
  COMSPEC: true,
  SYSTEMROOT: true,
  WINDIR: true,
  NODE_OPTIONS: true,
  HOME: true,
  USERPROFILE: true,
  HOMEDRIVE: true,
  HOMEPATH: true,
  XDG_DATA_HOME: true,
  XDG_CONFIG_HOME: true,
  PI_CODING_AGENT_DIR: true,
  PI_CONFIG_DIR: true,
  OMP_PROFILE: true,
  PI_PROFILE: true,
  PORT: true,
  NODE_ENV: true,
};

const DENIED_AGENT_ENV_PREFIXES: readonly string[] = ["OMP_WEB_", "NEXT_", "_"];

export function isReservedAgentEnvName(name: string): boolean {
  const comparable = name.toUpperCase();
  return (
    DENIED_AGENT_ENV_NAMES[comparable] === true ||
    DENIED_AGENT_ENV_PREFIXES.some((prefix) => comparable.startsWith(prefix))
  );
}

export interface AgentEnvParseResult {
  values: Record<string, string>;
  errors: string[];
}

/**
 * Parse `KEY=VALUE` lines the same way the server does: blank lines and `#`
 * comments are skipped, `export ` is tolerated, later assignments win, and every
 * rejected line becomes a human-readable error.
 */
export function parseAgentEnv(text: string): AgentEnvParseResult {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) return;
    const body = trimmed.replace(/^export\s+/, "");
    const separator = body.indexOf("=");
    if (separator === -1) {
      errors.push(`Line ${line}: expected KEY=VALUE`);
      return;
    }
    const name = body.slice(0, separator).trim();
    if (name.length === 0) {
      errors.push(`Line ${line}: missing variable name`);
      return;
    }
    if (!AGENT_ENV_NAME.test(name)) {
      errors.push(`Line ${line}: "${name}" is not a valid variable name`);
      return;
    }
    if (isReservedAgentEnvName(name)) {
      errors.push(`Line ${line}: "${name}" is reserved by omp-web and cannot be set`);
      return;
    }
    values[name] = body.slice(separator + 1).trim();
  });
  return { values, errors };
}

/** Render the stored env map as editable `KEY=VALUE` text, sorted for stability. */
export function formatAgentEnv(values: Record<string, string>): string {
  return Object.keys(values)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${name}=${values[name] ?? ""}`)
    .join("\n");
}
