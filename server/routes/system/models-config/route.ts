import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { modelsConfigSchema } from "@/server/schemas/system";
import { apiErrorBody } from "@/lib/api-utils";
import { invalidateModelsCache } from "@/lib/models-cache";
import { disposeUtilityRpc } from "@/lib/omp/rpc-utility";
import {
  ModelsConfigParseError,
  readModelsConfigFile,
  validateModelsConfig,
  writeModelsConfig,
  type ModelsFileConfig,
} from "@/lib/omp/models-config";

export const contract = routeContract({
  GET: {
    summary: "Read models.yml, or its parse error when the file is unparseable",
    responses: {
      200: modelsConfigSchema,
    },
  },
  PUT: {
    summary: "Replace models.yml (refuses to overwrite an unparseable file unless overwrite=true)",
    request: {
      query: z.object({ overwrite: z.string().optional() }),
      body: modelsConfigSchema,
    },
    responses: {
      200: z.looseObject({ success: z.literal(true) }),
      400: errorEnvelope,
      409: z.looseObject({ error: z.string(), code: z.string() }),
      500: errorEnvelope,
    },
  },
});

export async function GET() {
  const file = readModelsConfigFile();
  if (file.parseError) {
    // The editor must show the failure instead of an empty form — an empty
    // form invites a Save that would wipe the user's real providers.
    return json({
      providers: {},
      parseError: file.parseError,
      path: file.path,
      code: "models_config_unparseable",
    });
  }
  return json(file.config);
}

// PUT /api/system/models-config[?overwrite=true]
// Refuses to write while models.yml is unparseable unless ?overwrite=true.
export async function PUT(req: Request) {
  try {
    const overwriteUnparseable = new URL(req.url).searchParams.get("overwrite") === "true";
    const parsed = await readJson<ModelsFileConfig>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    try {
      validateModelsConfig(body);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error), code: "invalid_models_config" }, { status: 400 });
    }
    try {
      writeModelsConfig(body, { overwriteUnparseable });
    } catch (error) {
      if (error instanceof ModelsConfigParseError) {
        return json(
          { error: `${error.message} — fix it by hand; omp-web will not overwrite it`, code: "models_config_unparseable" },
          { status: 409 },
        );
      }
      throw error;
    }
    invalidateModelsCache();
    // The utility process loads models.yml once at startup. A cache flush alone
    // would still query that stale registry after a provider was added.
    disposeUtilityRpc();
    return json({ success: true });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
