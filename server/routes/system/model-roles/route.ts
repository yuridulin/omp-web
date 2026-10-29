import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { invalidateModelsCache } from "@/lib/models-cache";
import { readModelRoles, writeModelRoles } from "@/lib/omp/model-roles";

export const contract = routeContract({
  GET: {
    summary: "Read the configured model roles",
    responses: {
      200: z.looseObject({ path: z.string(), roles: z.record(z.string(), z.string()) }),
      400: errorEnvelope,
    },
  },
  PUT: {
    summary: "Replace the model roles map",
    request: { body: z.looseObject({ roles: z.record(z.string(), z.unknown()) }) },
    responses: {
      200: z.looseObject({ success: z.literal(true), roles: z.record(z.string(), z.string()) }),
      400: errorEnvelope,
    },
  },
});

export function GET() {
  try {
    return json(readModelRoles());
  } catch (error) {
    return json({ error: String(error), code: "model_roles_invalid" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = await readJson<{ roles?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body.roles || typeof body.roles !== "object" || Array.isArray(body.roles)) {
      return json({ error: "roles must be an object", code: "invalid_roles" }, { status: 400 });
    }
    const roles = Object.fromEntries(Object.entries(body.roles).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[0].trim().length > 0 && entry[1].trim().length > 0,
    ));
    writeModelRoles(roles);
    invalidateModelsCache();
    return json({ success: true, roles });
  } catch (error) {
    return json({ error: String(error), code: "model_roles_invalid" }, { status: 400 });
  }
}
