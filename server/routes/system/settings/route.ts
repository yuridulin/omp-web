import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { nativeSettingsSchema } from "@/server/schemas/system";
import { invalidateModelsCache } from "@/lib/models-cache";
import { disposeUtilityRpc, runUtilityCommand, type OmpModel } from "@/lib/omp/rpc-utility";
import { readNativeSettings, writeNativeSettings, type NativeSettings } from "@/lib/omp/settings-config";
import { assertNoAmbiguousModelScopes } from "@/lib/model-scope";

export const contract = routeContract({
  GET: {
    summary: "Read omp's native settings file",
    responses: {
      200: z.looseObject({ path: z.string(), settings: nativeSettingsSchema }),
      400: errorEnvelope,
    },
  },
  PUT: {
    summary: "Replace omp's native settings (rejects ambiguous enabledModels entries)",
    request: { body: z.looseObject({ settings: nativeSettingsSchema }) },
    responses: {
      200: z.looseObject({ success: z.literal(true), settings: nativeSettingsSchema }),
      400: errorEnvelope,
    },
  },
});

export function GET() {
  try {
    return json(readNativeSettings());
  } catch (error) {
    return json({ error: String(error), code: "settings_unreadable" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = await readJson<{ settings?: NativeSettings }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
      return json({ error: "settings must be an object", code: "invalid_settings" }, { status: 400 });
    }
    if (body.settings.enabledModels !== undefined) {
      // The utility process is best-effort here: settings remain editable when
      // omp is unavailable, but an available catalog rejects ambiguous bare IDs.
      try {
        const response = await runUtilityCommand<{ models?: unknown }>({ type: "get_available_models" }, 120_000);
        if (Array.isArray(response.models)) {
          const models = response.models.filter((model): model is OmpModel => (
            typeof model === "object" && model !== null
            && typeof (model as OmpModel).id === "string"
            && typeof (model as OmpModel).provider === "string"
          ));
          assertNoAmbiguousModelScopes(body.settings.enabledModels, models);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Ambiguous enabledModels entry")) throw error;
      }
    }
    writeNativeSettings(body.settings);
    if (body.settings.enabledModels !== undefined || body.settings.disabledProviders !== undefined || body.settings.modelProviderOrder !== undefined) {
      invalidateModelsCache();
      disposeUtilityRpc();
    }
    return json({ success: true, settings: readNativeSettings().settings });
  } catch (error) {
    const message = String(error);
    return json({ error: message, code: message.startsWith("Ambiguous enabledModels entry") ? "ambiguous_model_scope" : "invalid_settings" }, { status: 400 });
  }
}
