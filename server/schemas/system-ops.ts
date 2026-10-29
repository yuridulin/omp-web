import { z } from "zod";

/**
 * Shared wire shapes for the system operations routes (auth, notifications,
 * skills, speech-to-text). Kept here so responses across the domain agree.
 */

export const notificationEventSchema = z.looseObject({
  /** `test` is only sent by the settings "Send test notification" button. */
  type: z.enum(["completed", "input", "error", "modelSwitch", "test"]),
  sessionId: z.string(),
  sessionName: z.string().nullable(),
  detail: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

export const notificationHistoryEntrySchema = z.looseObject({
  /** Replace tag `<sessionId>:<type>`. */
  id: z.string(),
  event: notificationEventSchema,
  at: z.number(),
  read: z.boolean(),
});

export const skillInstallScopeSchema = z.enum(["global", "project"]);

export const skillInstallSchema = z.looseObject({
  package: z.string(),
  scope: skillInstallScopeSchema,
  source: z.string(),
  sourceType: z.string().optional(),
  skillsShUrl: z.string().optional(),
  skillPath: z.string().optional(),
  ref: z.string().optional(),
  versionHash: z.string().optional(),
  canCheckForUpdates: z.boolean(),
});

export const skillInfoSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  filePath: z.string(),
  baseDir: z.string(),
  disableModelInvocation: z.boolean(),
  sourceInfo: z.looseObject({
    source: z.string().optional(),
    scope: z.string().optional(),
  }),
  install: skillInstallSchema.optional(),
  /** False when the SKILL.md sits outside the user-owned skill roots. */
  togglable: z.boolean().optional(),
});

export const skillDiagnosticSchema = z.looseObject({
  type: z.enum(["error", "warning", "info"]),
  message: z.string(),
  path: z.string().optional(),
});

export const skillsResponseSchema = z.looseObject({
  skills: z.array(skillInfoSchema),
  diagnostics: z.array(skillDiagnosticSchema),
});

export const skillUpdateSchema = z.looseObject({
  package: z.string(),
  scope: skillInstallScopeSchema,
  state: z.enum(["up-to-date", "update-available", "unsupported", "error"]),
  currentVersion: z.string().optional(),
  latestVersion: z.string().optional(),
  message: z.string().optional(),
});

export const sttAfterSchema = z.enum(["send", "steer", "followup"]);

/** What pollers see; the transcript is never in the polled job. */
export const sttJobSchema = z.looseObject({
  id: z.string(),
  status: z.enum(["pending", "done", "error", "gone"]),
  error: z.string().optional(),
});

/** A closed job as returned to the claiming browser. */
export const sttClaimSchema = z.looseObject({
  id: z.string(),
  status: z.enum(["pending", "done", "error", "gone"]),
  error: z.string().optional(),
  text: z.string().optional(),
  after: sttAfterSchema.optional(),
});
