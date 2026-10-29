import { z } from "zod";

/** Wire schema for `core/commands.ts` `ChatIntent`; validated again by the core parser. */

const draftImage = z.object({
  data: z.string(),
  mimeType: z.string(),
});

const draftFile = z.object({
  name: z.string(),
  mimeType: z.string(),
  content: z.string(),
  size: z.number(),
});

const draftPatch = z.object({
  text: z.string().optional(),
  images: z.array(draftImage).optional(),
  files: z.array(draftFile).optional(),
});

export const chatIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prompt"), text: z.string(), images: z.array(z.unknown()).optional() }),
  z.object({ kind: z.literal("steer"), text: z.string() }),
  z.object({ kind: z.literal("follow-up"), text: z.string() }),
  z.object({ kind: z.literal("abort") }),
  z.object({ kind: z.literal("abort-compaction") }),
  z.object({ kind: z.literal("compact"), instructions: z.string().optional() }),
  z.object({
    kind: z.literal("queue-remove"),
    queue: z.enum(["steering", "followUp"]),
    text: z.string(),
  }),
  z.object({ kind: z.literal("queue-promote"), text: z.string() }),
  z.object({ kind: z.literal("edit-entry"), entryId: z.string(), text: z.string() }),
  z.object({ kind: z.literal("fork-entry"), entryId: z.string(), withEdits: z.boolean() }),
  z.object({ kind: z.literal("navigate-leaf"), leafId: z.string().nullable() }),
  z.object({ kind: z.literal("toggle-pre-compaction") }),
  z.object({ kind: z.literal("select-model"), provider: z.string(), modelId: z.string() }),
  z.object({
    kind: z.literal("set-thinking"),
    level: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"]),
  }),
  z.object({ kind: z.literal("set-fast-mode"), enabled: z.boolean() }),
  z.object({ kind: z.literal("set-slow-mode"), enabled: z.boolean() }),
  z.object({ kind: z.literal("set-auto-compaction"), enabled: z.boolean() }),
  z.object({ kind: z.literal("set-interrupt-mode"), mode: z.enum(["immediate", "wait"]) }),
  z.object({ kind: z.literal("set-streaming-mode"), mode: z.enum(["steer", "followUp"]) }),
  z.object({ kind: z.literal("set-session-name"), name: z.string() }),
  z.object({
    kind: z.literal("extension-response"),
    requestId: z.string(),
    response: z.record(z.string(), z.unknown()),
  }),
  z.object({ kind: z.literal("draft-edit"), patch: draftPatch }),
  z.object({ kind: z.literal("draft-clear") }),
  z.object({ kind: z.literal("refresh-state") }),
]);
