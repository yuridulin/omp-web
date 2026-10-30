import { api } from "./client";
import { isRecord } from "./guards";
import type { paths } from "./schema";

type SkillsPayload = NonNullable<
  paths["/api/system/skills"]["get"]["responses"][200]["content"]["application/json"]
>;
export type SkillEntry = SkillsPayload["skills"][number];
export type SkillDiagnostic = SkillsPayload["diagnostics"][number];
export type SkillInstall = NonNullable<SkillEntry["install"]>;
export type SkillInstallScope = SkillInstall["scope"];
export type SkillListing = SkillsPayload;

type SkillCheckPayload = NonNullable<
  paths["/api/system/skills/check"]["post"]["responses"][200]["content"]["application/json"]
>;
export type SkillUpdate = SkillCheckPayload["updates"][number];
export type SkillUpdateState = SkillUpdate["state"];

type SkillPatchBody = NonNullable<
  paths["/api/system/skills"]["patch"]["requestBody"]
>["content"]["application/json"];
type SkillCheckBody = NonNullable<
  paths["/api/system/skills/check"]["post"]["requestBody"]
>["content"]["application/json"];
type SkillUpdateBody = NonNullable<
  paths["/api/system/skills/update"]["post"]["requestBody"]
>["content"]["application/json"];

function errorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === "string" && value.error) return value.error;
  return `HTTP ${status}`;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parse).filter((entry): entry is T => entry !== null);
}

export function isSkillInstallScope(value: unknown): value is SkillInstallScope {
  return value === "global" || value === "project";
}

function parseInstall(value: unknown): SkillInstall | null {
  if (!isRecord(value) || typeof value.package !== "string") return null;
  const install: SkillInstall = {
    package: value.package,
    scope: isSkillInstallScope(value.scope) ? value.scope : "global",
    source: stringValue(value.source),
    canCheckForUpdates: value.canCheckForUpdates === true,
  };
  if (typeof value.sourceType === "string") install.sourceType = value.sourceType;
  if (typeof value.skillsShUrl === "string") install.skillsShUrl = value.skillsShUrl;
  if (typeof value.skillPath === "string") install.skillPath = value.skillPath;
  if (typeof value.ref === "string") install.ref = value.ref;
  if (typeof value.versionHash === "string") install.versionHash = value.versionHash;
  return install;
}

function parseSkill(value: unknown): SkillEntry | null {
  if (!isRecord(value) || typeof value.filePath !== "string") return null;
  const sourceInfo = isRecord(value.sourceInfo) ? value.sourceInfo : {};
  const skill: SkillEntry = {
    name: stringValue(value.name, value.filePath),
    description: stringValue(value.description),
    filePath: value.filePath,
    baseDir: stringValue(value.baseDir),
    disableModelInvocation: value.disableModelInvocation === true,
    sourceInfo: {
      ...(typeof sourceInfo.source === "string" ? { source: sourceInfo.source } : {}),
      ...(typeof sourceInfo.scope === "string" ? { scope: sourceInfo.scope } : {}),
    },
  };
  const install = parseInstall(value.install);
  if (install) skill.install = install;
  if (typeof value.togglable === "boolean") skill.togglable = value.togglable;
  return skill;
}

function parseDiagnostic(value: unknown): SkillDiagnostic | null {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  const type =
    value.type === "error" || value.type === "warning" || value.type === "info"
      ? value.type
      : "info";
  return {
    type,
    message: value.message,
    ...(typeof value.path === "string" ? { path: value.path } : {}),
  };
}

/** Normalize a skill listing without trusting any field. */
export function parseSkillListing(value: unknown): SkillListing {
  const raw = isRecord(value) ? value : {};
  return {
    skills: parseList(raw.skills, parseSkill),
    diagnostics: parseList(raw.diagnostics, parseDiagnostic),
  };
}

function parseUpdate(value: unknown): SkillUpdate | null {
  if (!isRecord(value) || typeof value.package !== "string") return null;
  if (!isSkillInstallScope(value.scope)) return null;
  if (
    value.state !== "up-to-date" &&
    value.state !== "update-available" &&
    value.state !== "unsupported" &&
    value.state !== "error"
  ) {
    return null;
  }
  const update: SkillUpdate = {
    package: value.package,
    scope: value.scope,
    state: value.state,
  };
  if (typeof value.currentVersion === "string") update.currentVersion = value.currentVersion;
  if (typeof value.latestVersion === "string") update.latestVersion = value.latestVersion;
  if (typeof value.message === "string") update.message = value.message;
  return update;
}

function parseUpdates(value: unknown): SkillUpdate[] {
  const raw = isRecord(value) ? value : {};
  return parseList(raw.updates, parseUpdate);
}

export async function fetchSkills(cwd: string): Promise<SkillListing> {
  const { data, error, response } = await api.GET("/api/system/skills", {
    params: { query: { cwd } },
  });
  if (error) throw new Error(errorMessage(error, response.status));
  return parseSkillListing(data);
}

export async function setSkillModelInvocation(
  filePath: string,
  disableModelInvocation: boolean,
  cwd?: string,
): Promise<boolean> {
  const body: SkillPatchBody = {
    filePath,
    disableModelInvocation,
    ...(cwd ? { cwd } : {}),
  };
  const { data, error, response } = await api.PATCH("/api/system/skills", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty skill update response");
  return typeof data.disableModelInvocation === "boolean"
    ? data.disableModelInvocation
    : disableModelInvocation;
}

export async function checkSkillUpdates(
  cwd: string,
  target?: { package: string; scope: SkillInstallScope },
): Promise<SkillUpdate[]> {
  const body: SkillCheckBody = {
    cwd,
    ...(target ? { package: target.package, scope: target.scope } : {}),
  };
  const { data, error, response } = await api.POST("/api/system/skills/check", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  return parseUpdates(data);
}

export async function updateSkillPackage(
  cwd: string,
  packageName: string,
  scope: SkillInstallScope,
): Promise<{ success: boolean; output: string }> {
  const body: SkillUpdateBody = { cwd, package: packageName, scope };
  const { data, error, response } = await api.POST("/api/system/skills/update", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty skill update response");
  return { success: data.success === true, output: stringValue(data.output) };
}

/** Stable key for pairing a checked update with its installed skill. */
export function updateKey(packageName: string, scope: SkillInstallScope): string {
  return `${scope}:${packageName}`;
}

/** Find the checked update for one installed package, if a check ran. */
export function findSkillUpdate(
  updates: SkillUpdate[],
  packageName: string,
  scope: SkillInstallScope,
): SkillUpdate | null {
  return (
    updates.find((entry) => entry.package === packageName && entry.scope === scope) ?? null
  );
}

export function isUpdateAvailable(update: SkillUpdate | null): boolean {
  return update?.state === "update-available";
}

/** Human label for the four update-check states. */
export function skillUpdateLabel(state: SkillUpdateState | string): string {
  switch (state) {
    case "up-to-date":
      return "Up to date";
    case "update-available":
      return "Update available";
    case "unsupported":
      return "Not checkable";
    case "error":
      return "Check failed";
    default:
      return "Unknown";
  }
}
