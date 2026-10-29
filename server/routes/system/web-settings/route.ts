import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { syncInterruptibleSessions } from "@/lib/rpc-manager";
import { parseAgentEnvText, sanitizeAgentEnvValues, type AgentEnvParseResult } from "@/lib/omp/agent-env";
import { loadWebServerSettings, saveWebServerSettings, type WebServerSettings } from "@/lib/web-settings";
import { isRecord } from "@/lib/type-guards";

const webServerSettingsSchema = z.looseObject({
  autoResumeSessions: z.boolean(),
  agentToolsEnabled: z.boolean(),
  agentEnv: z.record(z.string(), z.string()),
});

export const contract = routeContract({
  GET: {
    summary: "Read omp-web's own server-side settings",
    responses: { 200: webServerSettingsSchema },
  },
  PUT: {
    summary: "Patch omp-web's server-side settings and apply them to running sessions",
    request: {
      body: z.looseObject({
        autoResumeSessions: z.boolean().optional(),
        agentToolsEnabled: z.boolean().optional(),
        agentEnv: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
      }),
    },
    responses: {
      200: webServerSettingsSchema,
      400: errorEnvelope,
    },
  },
});

/** GET/PUT /api/system/web-settings - omp-web's own server-side settings. */
export async function GET() {
  return json(readSettings());
}

/** Never surface a variable lib/omp/agent-env.ts would refuse to spawn with. */
function readSettings(): WebServerSettings {
  const settings = loadWebServerSettings();
  return { ...settings, agentEnv: sanitizeAgentEnvValues(settings.agentEnv).values };
}

export async function PUT(req: Request) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body: unknown = parsed.body;
  if (!isRecord(body)) {
    return json({ error: "Request body must be a settings object", code: "invalid_settings" }, { status: 400 });
  }
  const payload = body as { autoResumeSessions?: unknown; agentToolsEnabled?: unknown; agentEnv?: unknown };
  const patch: Partial<WebServerSettings> = {};

  // Both keys are optional so a caller can update one without reading the other;
  // anything present is still validated.
  let resumeProvided = false;
  if (payload.autoResumeSessions !== undefined) {
    if (typeof payload.autoResumeSessions !== "boolean") {
      return json({ error: "autoResumeSessions must be a boolean", code: "invalid_settings" }, { status: 400 });
    }
    patch.autoResumeSessions = payload.autoResumeSessions;
    resumeProvided = true;
  }

  if (payload.agentToolsEnabled !== undefined) {
    if (typeof payload.agentToolsEnabled !== "boolean") {
      return json({ error: "agentToolsEnabled must be a boolean", code: "invalid_settings" }, { status: 400 });
    }
    patch.agentToolsEnabled = payload.agentToolsEnabled;
  }

  if (payload.agentEnv !== undefined) {
    // Either raw KEY=VALUE text (what the settings textarea holds) or a record.
    let parsed: AgentEnvParseResult;
    if (typeof payload.agentEnv === "string") {
      parsed = parseAgentEnvText(payload.agentEnv);
    } else if (isRecord(payload.agentEnv)) {
      parsed = sanitizeAgentEnvValues(payload.agentEnv);
    } else {
      return json(
        { error: "agentEnv must be KEY=VALUE text or an object of variables", code: "invalid_agent_env" },
        { status: 400 },
      );
    }
    if (parsed.errors.length > 0) {
      return json(
        { error: "agentEnv contains invalid or reserved variable names", code: "invalid_agent_env", errors: parsed.errors },
        { status: 400 },
      );
    }
    patch.agentEnv = parsed.values;
  }

  const settings = saveWebServerSettings(patch);
  // Apply to sessions that are already running, not only the next run. Only when the
  // flag was part of this save — an agentEnv-only write must not touch live sessions.
  if (resumeProvided) syncInterruptibleSessions();
  return json({ ...settings, agentEnv: sanitizeAgentEnvValues(settings.agentEnv).values });
}